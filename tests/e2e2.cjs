const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = 'http://localhost:8123';
const APP = `${BASE}/local/merker/index.html`;
const SHOTS = process.env.SHOTS || require('node:path').join(__dirname, '.shots', 'shots2');
require('node:fs').mkdirSync(SHOTS, { recursive: true });

const post = (p) => fetch(`${BASE}${p}`, { method: 'POST' });
const getJson = async (p) => (await fetch(`${BASE}${p}`)).json();
const calls = () => getJson('/__mock/calls');
const serverItems = (entity = 'todo.einkaufsliste') => getJson(`/__mock/items?entity=${entity}`);
const dayStr = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const steps = [];
const ok = (name) => { steps.push(name); console.log('OK  ', name); };

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ locale: 'de-DE', viewport: { width: 412, height: 860 }, deviceScaleFactor: 2, hasTouch: true, colorScheme: 'light' });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

  const rows = (text) => page.locator('li.swipe', { hasText: text });
  const titles = () => page.locator('#content .item-title').allInnerTexts();
  const settle = () => page.waitForFunction(() => !document.querySelector('[data-uid^="tmp-"]'));

  // Echte Touch-Wischgeste über das DevTools-Protokoll
  async function swipe(locator, fraction) {
    const box = await locator.boundingBox();
    const y = box.y + box.height / 2;
    const x0 = box.x + 24;
    const x1 = x0 + box.width * fraction;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
    for (let i = 1; i <= 10; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + ((x1 - x0) * i) / 10, y }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }

  await page.goto(APP);
  await page.waitForSelector('.list-tile');
  await page.goto(`${APP}#/liste/todo.einkaufsliste`);
  await page.waitForSelector('li.swipe');
  const addVia = async (text, prioOn = false) => {
    await page.locator('#fab').click();
    await page.waitForSelector('.sheet input[name=title]');
    if (prioOn) await page.locator('.sheet .prio-toggle').click();
    await page.locator('.sheet input[name=title]').fill(text);
    await page.locator('.sheet button[type=submit]').click();
    await page.waitForSelector('.sheet-root', { state: 'detached' });
  };

  // A. Hinzufügen-Eintrag unter den Aufgaben, Plus-Knopf unten rechts
  assert.equal(await page.locator('.composer').count(), 0);
  assert.equal(await page.locator('.add-row').count(), 0);
  assert.ok(await page.locator('#fab').isVisible());
  ok('Hinzufügen-Eintrag unter den Aufgaben, Plus-Knopf sichtbar');

  // B. Normale Eingabe
  await addVia('Zahnpasta');
  await page.waitForFunction(() => [...document.querySelectorAll('.item-title')].some((e) => e.textContent === 'Zahnpasta'));
  await settle();
  let c = (await calls()).at(-1);
  assert.deepEqual([c.service, c.data, c.target], ['add_item', { item: 'Zahnpasta' }, { entity_id: 'todo.einkaufsliste' }]);
  ok('Normale Eingabe legt Eintrag in der geöffneten Liste an');

  // C. Prio-Eingabe: Knopf vor dem Titel
  await page.locator('#fab').click();
  await page.waitForSelector('.sheet input[name=title]');
  const pk = page.locator('.sheet .prio-toggle');
  assert.equal(await pk.getAttribute('aria-pressed'), 'false');
  const pb = await pk.boundingBox();
  const tb = await page.locator('.sheet input[name=title]').boundingBox();
  assert.ok(pb.x + pb.width <= tb.x + 1, 'Knopf links vom Titel');
  await pk.click();
  assert.equal(await pk.getAttribute('aria-pressed'), 'true');
  await page.locator('.sheet input[name=title]').fill('Steuer erklären');
  await page.locator('.sheet button[type=submit]').click();
  await page.waitForSelector('.sheet-root', { state: 'detached' });
  await page.waitForFunction(() => [...document.querySelectorAll('.item-title')].some((e) => e.textContent === '❗ Steuer erklären'));
  await settle();
  c = (await calls()).at(-1);
  assert.equal(c.data.item, '❗ Steuer erklären');
  await addVia('Ohne Prio danach');
  await settle();
  assert.equal((await calls()).at(-1).data.item, 'Ohne Prio danach');
  ok('Prio-Knopf im Dialog: ❗ vor dem Titel, danach frisch ohne Prio');

  // D. Zwei Einträge mit gleichem Titel: der richtige wird erledigt
  await addVia('Doppelt');
  await settle();
  await addVia('Doppelt');
  await settle();
  await page.waitForFunction(() => document.querySelectorAll('li.swipe .item-title').length && [...document.querySelectorAll('.item-title')].filter((e) => e.textContent === 'Doppelt').length === 2);
  const second = rows('Doppelt').nth(1);
  const secondUid = await second.getAttribute('data-uid');
  const firstUid = await rows('Doppelt').nth(0).getAttribute('data-uid');
  assert.notEqual(firstUid, secondUid);
  await swipe(second, 0.7);
  await page.waitForFunction(() => [...document.querySelectorAll('#content > ul .item-title')].filter((e) => e.textContent === 'Doppelt').length === 1);
  c = (await calls()).at(-1);
  assert.deepEqual([c.service, c.data.item, c.data.status], ['update_item', secondUid, 'completed']);
  const srv = await serverItems();
  assert.equal(srv.find((i) => i.uid === secondUid).status, 'completed');
  assert.equal(srv.find((i) => i.uid === firstUid).status, 'needs_action');
  ok('Wischen mit Touch erledigt genau den gewählten Eintrag (gleicher Titel, getrennt über uid)');

  // E. Rückgängig
  await page.waitForSelector('.snackbar:not([hidden])');
  assert.match(await page.locator('.snackbar').innerText(), /Erledigt/);
  await page.screenshot({ path: `${SHOTS}/1-snackbar.png` });
  await page.locator('.snackbar-action').click();
  await page.waitForFunction(() => [...document.querySelectorAll('#content > ul .item-title')].filter((e) => e.textContent === 'Doppelt').length === 2);
  c = (await calls()).at(-1);
  assert.deepEqual([c.data.item, c.data.status], [secondUid, 'needs_action']);
  ok('Rückgängig stellt den Eintrag wieder her');

  // F. Kurze Wischgeste federt zurück, öffnet nichts
  const before = (await calls()).length;
  await page.waitForTimeout(300); await swipe(rows('Milch'), 0.15);
  await page.waitForTimeout(500);
  assert.equal((await calls()).length, before);
  assert.ok(!/\/liste\/[^/]+\/[^/]+$/.test(new URL(page.url()).hash), page.url());
  assert.equal(await rows('Milch').locator('.item').evaluate((el) => el.style.transform), '');
  ok('Kurze Wischgeste: kein Befehl, kein Dialog, Zeile federt zurück');

  // G. Eintrag bearbeiten
  await rows('Milch').click();
  await page.waitForSelector('.sheet');
  assert.match(page.url(), /#\/liste\/todo\.einkaufsliste\/u2$/);
  assert.equal(await page.locator('.sheet input[name=title]').inputValue(), 'Milch');
  assert.equal(await page.locator('.sheet textarea').inputValue(), 'Fettarm, 1 Liter');
  await page.screenshot({ path: `${SHOTS}/2-sheet.png` });
  await page.locator('.sheet input[name=title]').fill('Milch laktosefrei');
  await page.locator('.sheet .prio-toggle').click();
  await page.locator('.sheet textarea').fill('Bio');
  await page.locator('.sheet input[type=date]').fill(dayStr(3));
  await page.locator('.sheet button[type=submit]').click();
  await page.waitForSelector('.sheet-root', { state: 'detached' });
  c = (await calls()).at(-1);
  assert.deepEqual(c.data, { item: 'u2', rename: '❗ Milch laktosefrei', description: 'Bio', due_date: dayStr(3) });
  assert.match(page.url(), /#\/liste\/todo\.einkaufsliste$/);
  ok('Bearbeiten sendet genau die geänderten Felder, Dialog schließt, Adresse zurück zur Liste');

  // H. Ohne Änderung kein Befehl
  const n = (await calls()).length;
  await rows('Brot').click();
  await page.waitForSelector('.sheet');
  await page.locator('.sheet button[type=submit]').click();
  await page.waitForSelector('.sheet-root', { state: 'detached' });
  assert.equal((await calls()).length, n);
  ok('Speichern ohne Änderung sendet nichts');

  // I. Datum entfernen
  await rows('Altpapier').click();
  await page.waitForSelector('.sheet');
  await page.getByRole('button', { name: 'Keine', exact: true }).click();
  await page.locator('.sheet button[type=submit]').click();
  await page.waitForSelector('.sheet-root', { state: 'detached' });
  c = (await calls()).at(-1);
  assert.deepEqual(c.data, { item: 'u4', due_date: null });
  assert.equal(await page.locator('.item-overdue').count(), 0);
  ok('Datum entfernen sendet due_date null');

  // J. Löschen mit Rückgängig
  const zahnUid = await rows('Zahnpasta').getAttribute('data-uid');
  const waitCall = async (n, service) => {
    for (let i = 0; i < 60; i++) {
      const found = (await calls()).slice(n).find((x) => x.service === service);
      if (found) return found;
      await page.waitForTimeout(100);
    }
    throw new Error(`Kein Aufruf ${service}`);
  };
  await rows('Zahnpasta').click();
  await page.waitForSelector('.sheet');
  const nDel = (await calls()).length;
  await page.getByRole('button', { name: 'Löschen', exact: true }).click();
  await page.waitForSelector('.sheet-root', { state: 'detached' });
  await page.waitForFunction(() => ![...document.querySelectorAll('.item-title')].some((e) => e.textContent === 'Zahnpasta'));
  c = await waitCall(nDel, 'remove_item');
  assert.deepEqual([c.service, c.data], ['remove_item', { item: zahnUid }]);
  await page.waitForSelector('.snackbar:not([hidden])');
  assert.match(await page.locator('.snackbar').innerText(), /gelöscht/);
  const nUndo = (await calls()).length;
  await page.locator('.snackbar-action').click();
  await page.waitForFunction(() => [...document.querySelectorAll('.item-title')].some((e) => e.textContent === 'Zahnpasta'));
  c = await waitCall(nUndo, 'add_item');
  assert.deepEqual([c.service, c.data], ['add_item', { item: 'Zahnpasta' }]);
  ok('Löschen mit Rückgängig (Eintrag wird neu angelegt)');

  // K. Zurück-Geste und Escape schließen den Dialog
  await rows('Brot').click();
  await page.waitForSelector('.sheet');
  await page.goBack();
  await page.waitForSelector('.sheet-root', { state: 'detached' });
  assert.match(page.url(), /#\/liste\/todo\.einkaufsliste$/);
  await rows('Brot').click();
  await page.waitForSelector('.sheet');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet-root', { state: 'detached' });
  assert.ok(await page.locator('li.swipe').count() > 0);
  ok('Zurück-Geste und Escape schließen den Bearbeiten-Dialog, Liste bleibt');

  // M. Fehler beim Speichern: Anzeige wird zurückgenommen, Meldung
  await post('/__mock/fail-next');
  await addVia('Wird abgelehnt');
  await page.waitForSelector('.snackbar-error');
  assert.match(await page.locator('.snackbar').innerText(), /Nicht gespeichert: Speichern nicht möglich/);
  assert.ok(!(await titles()).includes('Wird abgelehnt'));
  ok('Fehler: Meldung, Eintrag verschwindet wieder');

  // N. Liste ohne Schreibrechte
  await post('/__mock/add-list-ro');
  await page.goto(`${APP}#/liste/todo.nur_lesen`);
  await page.waitForSelector('li.swipe');
  const n2 = (await calls()).length;
  await page.locator('li.swipe').click();
  await swipe(page.locator('li.swipe'), 0.7);
  await page.waitForTimeout(400);
  assert.ok(!/\/liste\/[^/]+\/[^/]+$/.test(new URL(page.url()).hash));
  assert.equal((await calls()).length, n2);
  ok('Liste ohne Rechte: keine Eingabe, kein Dialog, keine Wischgeste');

  // P. Verbindungsabbruch und Reconnect
  await page.goto(`${APP}#/liste/todo.haushalt`);
  await page.waitForSelector('li.swipe');
  await post('/__mock/drop?ms=3500');
  await page.waitForSelector('#banner:not([hidden])', { timeout: 15000 });
  assert.match(await page.locator('#banner').innerText(), /Keine Verbindung/);
  await page.waitForSelector('#banner', { state: 'hidden', timeout: 20000 });
  assert.equal(await page.locator('#banner').isHidden(), true);
  ok('Banner bei Verbindungsabbruch, nach Reconnect weg');

  // Q. Dunkel mit Dialog (Sicht)
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(`${APP}#/liste/todo.einkaufsliste`);
  await page.waitForSelector('li.swipe');
  await rows('Milch').click();
  await page.waitForSelector('.sheet');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/4-sheet-dunkel.png` });
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet-root', { state: 'detached' });
  ok('Dunkles Design mit Dialog gerendert');

  assert.deepEqual(errors.filter((e) => !/Failed to load resource|WebSocket|net::ERR/.test(e)), [], `Konsolenfehler: ${errors.join(' | ')}`);
  ok('Keine Konsolenfehler');
  console.log(`\n${steps.length} Prüfungen bestanden`);
  await browser.close();
})().catch((err) => { console.error('FEHLER:', err); process.exit(1); });
