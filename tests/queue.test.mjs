import assert from 'node:assert/strict';
globalThis.localStorage = { s: {}, getItem(k) { return this.s[k] ?? null; }, setItem(k, v) { this.s[k] = String(v); }, removeItem(k) { delete this.s[k]; } };
const q = await import('../app/js/queue.js');
const items = [{ uid: 'a', summary: 'Milch', status: 'needs_action', due: null, description: null }, { uid: 'b', summary: 'Brot', status: 'completed', due: null, description: null }];
let queue = [];
queue = q.enqueue(queue, { id: 1, entityId: 'L', service: 'update_item', data: { item: 'a', status: 'completed' } });
queue = q.enqueue(queue, { id: 2, entityId: 'L', service: 'add_item', data: { item: 'Eier' }, localUid: 'local-1' });
let view = q.overlay('L', items, queue);
assert.deepEqual(view.map((i) => [i.uid, i.summary, i.status]), [['a', 'Milch', 'completed'], ['b', 'Brot', 'completed'], ['local-1', 'Eier', 'needs_action']]);
// Änderungen an der neuen Aufgabe werden ins Anlegen eingerechnet
queue = q.enqueue(queue, { id: 3, entityId: 'L', service: 'update_item', data: { item: 'local-1', rename: 'Eier (10)', due_date: '2026-11-20' } });
assert.equal(queue.length, 2);
assert.deepEqual(queue[1].data, { item: 'Eier (10)', due_date: '2026-11-20' });
// Erledigen der neuen Aufgabe bleibt eigener Auftrag
queue = q.enqueue(queue, { id: 4, entityId: 'L', service: 'update_item', data: { item: 'local-1', status: 'completed' } });
assert.equal(queue.length, 3);
// Löschen der neuen Aufgabe streicht alles zu ihr
queue = q.enqueue(queue, { id: 5, entityId: 'L', service: 'remove_item', data: { item: 'local-1' } });
assert.deepEqual(queue.map((op) => op.id), [1]);
// remap
let r = [{ entityId: 'L', service: 'update_item', data: { item: 'local-9', status: 'completed' } }, { entityId: 'L', service: 'move', data: { uid: 'x', previous_uid: 'local-9' } }];
r = q.remap(r, 'local-9', 'real');
assert.equal(r[0].data.item, 'real');
assert.equal(r[1].data.previous_uid, 'real');
// remove_completed + move
view = q.overlay('L', items, [{ entityId: 'L', service: 'remove_completed_items', data: {} }]);
assert.deepEqual(view.map((i) => i.uid), ['a']);
view = q.overlay('L', items, [{ entityId: 'L', service: 'move', data: { uid: 'b', previous_uid: null } }]);
assert.deepEqual(view.map((i) => i.uid), ['b', 'a']);
// Speichern und Laden
q.saveQueue([{ entityId: 'L', service: 'add_item', data: { item: 'X' }, localUid: 'local-2' }]);
assert.equal(q.loadQueue().length, 1);
q.saveQueue([]);
assert.equal(q.loadQueue().length, 0);
console.log('queue: alle Tests bestanden');
