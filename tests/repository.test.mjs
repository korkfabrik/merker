// Repository ohne Browser, mit nachgebautem HA-Client: Status-Listener, Abo nach Fehlschlag, Reihenfolge nach dem Wiederverbinden.
import assert from 'node:assert/strict';
globalThis.localStorage = { s: {}, getItem(k) { return this.s[k] ?? null; }, setItem(k, v) { this.s[k] = String(v); }, removeItem(k) { delete this.s[k]; } };
const { Repository } = await import('../app/js/repository.js');
const { Store } = await import('../app/js/store.js');
const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

function fakeHa({ connectFails = false, subscribeResults = [] } = {}) {
  const ha = {
    listeners: [],
    calls: [],
    subscribeCalls: 0,
    todosCallback: null,
    onStatus(fn) { this.listeners.push(fn); return () => {}; },
    async connect() { if (connectFails) throw new Error('kein Netz'); },
    subscribeTodoEntities(fn) { this.todosCallback = fn; },
    async subscribeItems() { this.subscribeCalls++; return subscribeResults.length ? subscribeResults.shift() : () => {}; },
    async todoAction(service, entityId, data) { this.calls.push([service, entityId, data]); },
    async moveItem(entityId, uid, previousUid) { this.calls.push(['move', entityId, { uid, previousUid }]); },
    async getUserData() { return {}; },
    async setUserData() {},
  };
  return ha;
}
const todo = (state) => ({ entity_id: 'todo.a', state, attributes: { friendly_name: 'A', supported_features: 127 } });

// Mehrere fehlgeschlagene Starts hängen nur einen Status-Listener an
{
  const ha = fakeHa({ connectFails: true });
  const repo = new Repository(ha, new Store());
  for (let i = 0; i < 5; i++) await repo.start().catch(() => {});
  assert.equal(ha.listeners.length, 1);
}

// Abo schlägt fehl, solange die Liste nicht verfügbar ist. Wird sie verfügbar, wird neu abonniert.
{
  const ha = fakeHa({ subscribeResults: [null] });
  const repo = new Repository(ha, new Store());
  await repo.start();
  ha.todosCallback([todo('unavailable')]);
  await tick();
  assert.equal(ha.subscribeCalls, 1);
  ha.todosCallback([todo('3')]);
  await tick();
  assert.equal(ha.subscribeCalls, 2, 'Liste wurde nach dem Fehlschlag nicht neu abonniert');
}

// Direkt nach dem Wiederverbinden, solange noch Aufträge warten: neue Änderungen reihen sich ein, statt vorzudrängeln
{
  localStorage.setItem('merker.queue', JSON.stringify([
    { id: '1', entityId: 'todo.a', service: 'add_item', data: { item: 'Brot' }, localUid: 'local-1' },
    { id: '2', entityId: 'todo.a', service: 'update_item', data: { item: 'x', rename: 'A' } },
  ]));
  const ha = fakeHa();
  const store = new Store();
  const repo = new Repository(ha, store);
  store.set({ status: 'online' });
  // Neue Aufgabe ohne echte ID erledigen und eine ältere Umbenennung überschreiben
  await repo.updateItem('todo.a', 'local-1', { status: 'completed' });
  await repo.updateItem('todo.a', 'x', { summary: 'B' });
  await tick();
  assert.deepEqual(ha.calls, [], 'Änderung ging an der Warteschlange vorbei direkt raus');
  const queue = JSON.parse(localStorage.getItem('merker.queue'));
  assert.deepEqual(queue.map((op) => [op.service, op.data]), [
    ['add_item', { item: 'Brot' }],
    ['update_item', { item: 'x', rename: 'A' }],
    ['update_item', { item: 'local-1', status: 'completed' }],
    ['update_item', { item: 'x', rename: 'B' }],
  ]);
  localStorage.removeItem('merker.queue');
}

// Ohne wartende Aufträge geht eine Änderung wie bisher direkt raus
{
  const ha = fakeHa();
  const store = new Store();
  const repo = new Repository(ha, store);
  store.set({ status: 'online' });
  await repo.updateItem('todo.a', 'x', { summary: 'C' });
  assert.deepEqual(ha.calls, [['update_item', 'todo.a', { item: 'x', rename: 'C' }]]);
}

console.log('repository: alle Tests bestanden');
process.exit(0);
