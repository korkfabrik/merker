const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = 'http://localhost:8123';
// Wartet in Node, bis die Bedingung stimmt (page.waitForFunction wartet bei async-Funktionen nicht).
const until = async (fn, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Bedingung nicht erfüllt: ${fn}`);
};
const APP = `${BASE}/local/merker/index.html`;
const SHOTS = process.env.SHOTS || require('node:path').join(__dirname, '.shots', 'shots6');
require('node:fs').mkdirSync(SHOTS, { recursive: true });
const post = (p) => fetch(`${BASE}${p}`, { method: 'POST' });
const getJson = async (p) => (await fetch(`${BASE}${p}`)).json();
const calls = () => getJson('/__mock/calls');
const serverItems = (entity = 'todo.einkaufsliste') => getJson(`/__mock/items?entity=${entity}`);
const dayStr = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function lastCallAfter(count) {
  for (let i = 0; i < 100; i++) {
    const all = await calls();
    if (all.length > count) return all.at(-1);
    await sleep(50);
  }
  throw new Error('Kein neuer Aufruf an HA');
}
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
  const count = async () => (await calls()).length;
  const gone = (text) => page.waitForFunction((t) => ![...document.querySelectorAll('#content > ul .item-title')].some((e) => e.textContent === t), text);
  const present = (text) => page.waitForFunction((t) => [...document.querySelectorAll('#content > ul .item-title')].some((e) => e.textContent === t), text);

  // fraction > 0: nach rechts, < 0: nach links. hold = true lässt den Finger unten.
  async function swipe(locator, fraction, hold = false) {
    await locator.waitFor({ state: 'visible' });
    await settle();
    const box = await locator.boundingBox();
    const y = box.y + box.height / 2;
    const x0 = fraction > 0 ? box.x + 24 : box.x + box.width - 24;
    const x1 = x0 + box.width * fraction;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
    for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + ((x1 - x0) * i) / 10, y }] });
    if (!hold) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  const release = () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const picker = () => page.locator('.sheet-root .pick-row');
  const pickerGone = () => page.waitForSelector('.sheet-root', { state: 'detached' });

  await page.goto(APP);
  await page.waitForSelector('.list-tile');
  await post('/__mock/add-list-ro');
  await post('/__mock/add-list-nodelete');
  await page.goto(`${APP}#/liste/todo.einkaufsliste`).catch(() => {});
  await page.waitForSelector('li.swipe');

  // 1. Links wischen öffnet die Auswahl, nur passende Listen
  const brotUid = await rows('Brot').getAttribute('data-uid');
  let n0 = await count();
  await swipe(rows('Brot'), -0.35);
  await picker().first().waitFor();
  const names = await picker().allInnerTexts();
  assert.ok(names.some((t) => t.includes('Haushalt')) && names.some((t) => t.includes('Kein Löschen')), names.join('|'));
  assert.ok(!names.some((t) => t.includes('Nur lesen')) && !names.some((t) => t.includes('Einkaufsliste')), names.join('|'));
  assert.equal(await count(), n0);
  await page.screenshot({ path: `${SHOTS}/1-auswahl.png` });
  ok('Links wischen öffnet die Listenauswahl (ohne aktuelle und ohne schreibgeschützte Liste), noch nichts gesendet');

  // 2. Abbrechen: Scrim, Zeile kommt zurück
  await page.locator('.sheet-scrim').click({ position: { x: 20, y: 20 } });
  await pickerGone();
  await page.waitForTimeout(500);
  assert.equal(await count(), n0);
  assert.equal(await rows('Brot').locator('.item').evaluate((el) => el.style.transform), '');
  ok('Abbrechen: nichts gesendet, Zeile federt zurück');

  // 3. Zurück-Geste schließt die Auswahl, bleibt in der Liste
  await swipe(rows('Brot'), -0.35);
  await picker().first().waitFor();
  const urlBefore = page.url();
  await page.goBack();
  await pickerGone();
  assert.equal(page.url(), urlBefore);
  await page.waitForTimeout(500);
  assert.equal(await count(), n0);
  assert.ok(await rows('Brot').locator('.item').isVisible());
  ok('Zurück-Geste schließt nur die Auswahl');

  // 4. Verschieben: erst anlegen, dann löschen
  await swipe(rows('Brot'), -0.35);
  await picker().filter({ hasText: 'Haushalt' }).click();
  await pickerGone();
  await gone('Brot');
  for (let i = 0; i < 80 && (await (await fetch('http://localhost:8123/__mock/calls')).json()).length < n0 + 2; i++) await page.waitForTimeout(100);
  const cs = (await calls()).slice(n0);
  assert.deepEqual([cs[0].service, cs[0].data, cs[0].target], ['add_item', { item: 'Brot' }, { entity_id: 'todo.haushalt' }]);
  assert.deepEqual([cs[1].service, cs[1].data, cs[1].target], ['remove_item', { item: brotUid }, { entity_id: 'todo.einkaufsliste' }]);
  assert.ok((await serverItems('todo.haushalt')).some((i) => i.summary === 'Brot'));
  assert.ok(!(await serverItems()).some((i) => i.uid === brotUid));
  await page.waitForFunction(() => /Verschoben nach Haushalt/.test(document.querySelector('.snackbar').textContent));
  ok('Verschieben legt in der Ziel-Liste an und löscht in der Quell-Liste, Meldung nennt das Ziel');

  // 5. Rückgängig
  await settle();
  n0 = await count();
  await page.locator('.snackbar-action').click();
  await present('Brot');
  await until(async () => !(await (await fetch(BASE + '/__mock/items?entity=todo.haushalt')).json()).some((i) => i.summary === 'Brot'));
  await settle();
  assert.ok((await serverItems()).some((i) => i.summary === 'Brot'));
  ok('Rückgängig: Eintrag steht wieder in der Quell-Liste und ist in der Ziel-Liste weg');

  // 6. Beschreibung und Datum bleiben erhalten
  n0 = await count();
  await swipe(rows('Milch'), -0.35);
  await picker().filter({ hasText: 'Haushalt' }).click();
  await gone('Milch');
  for (let i = 0; i < 80 && (await (await fetch('http://localhost:8123/__mock/calls')).json()).length < n0 + 2; i++) await page.waitForTimeout(100);
  const add = (await calls())[n0];
  assert.deepEqual(add.data, { item: 'Milch', description: 'Fettarm, 1 Liter', due_date: dayStr(0) });
  ok('Beschreibung und Fälligkeit wandern mit');
  await settle();

  // 7. Fehler beim Anlegen: nichts gelöscht, Zeile zurück, Meldung
  n0 = await count();
  await post('/__mock/fail-next');
  await page.waitForSelector('#snackbar', { state: 'hidden', timeout: 8000 });
  await swipe(rows('Altpapier'), -0.35);
  await page.waitForTimeout(300);
  await picker().filter({ hasText: 'Haushalt' }).click();
  await page.waitForFunction(() => /Nicht verschoben/.test(document.querySelector('.snackbar').textContent));
  await present('Altpapier rausstellen');
  assert.ok(!(await calls()).slice(n0).some((c) => c.service === 'remove_item'));
  assert.ok((await serverItems()).some((i) => i.summary === 'Altpapier rausstellen'));
  ok('Fehler beim Anlegen: Eintrag bleibt in der Quell-Liste');

  // 8. Aus dem Dialog verschieben
  await settle();
  await rows('Eier').count();
  await rows('Altpapier').click();
  await page.waitForSelector('.sheet');
  await page.getByRole('button', { name: 'Verschieben' }).click();
  await picker().filter({ hasText: 'Haushalt' }).click();
  await pickerGone();
  await page.waitForSelector('.sheet', { state: 'detached' });
  await gone('Altpapier rausstellen');
  assert.ok(!/gelöscht/.test(await page.locator('.snackbar').innerText()));
  assert.match(await page.locator('.snackbar').innerText(), /Verschoben nach Haushalt/);
  assert.ok(!/\/liste\/[^/]+\/[^/]+$/.test(new URL(page.url()).hash));
  ok('Dialog: Verschieben schließt ihn, keine falsche "gelöscht"-Meldung');

  // 9. Löschen im Dialog mit Rückgängig
  await settle();
  await rows('Brot').click();
  await page.waitForSelector('.sheet');
  await page.getByRole('button', { name: 'Löschen', exact: true }).click();
  await page.waitForSelector('.sheet-root', { state: 'detached' });
  await gone('Brot');
  assert.match(await page.locator('.snackbar').innerText(), /Eintrag gelöscht/);
  await page.locator('.snackbar-action').click();
  await present('Brot');
  await settle();
  ok('Löschen im Dialog mit Rückgängig funktioniert weiter');

  // 10. Ohne Löschrecht kein Verschieben, Wischen nach rechts geht
  await page.goto('about:blank');
  await page.goto(`${APP}#/liste/todo.kein_loeschen`);
  await page.waitForSelector('li.swipe');
  const n2 = await count();
  await swipe(rows('Bleibt stehen'), -0.35);
  await page.waitForTimeout(500);
  assert.equal(await page.locator('.sheet-root').count(), 0);
  assert.equal(await count(), n2);
  await rows('Bleibt stehen').click();
  await page.waitForSelector('.sheet');
  assert.equal(await page.getByRole('button', { name: 'Verschieben' }).count(), 0);
  ok('Ohne Löschrecht: links gesperrt, kein Verschieben-Knopf im Dialog');

  // 11. Dunkel
  await page.goto('about:blank');
  await page.goto(`${APP}#/liste/todo.einkaufsliste`);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForSelector('li.swipe');
  await swipe(rows('Brot'), -0.35, true);
  await page.screenshot({ path: `${SHOTS}/2-wischen-dunkel.png` });
  await release();
  await picker().first().waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/3-auswahl-dunkel.png` });
  ok('Dunkles Design gerendert');

  assert.deepEqual(errors.filter((e) => !/Failed to load resource|WebSocket|net::ERR/.test(e)), [], errors.join(' | '));
  ok('Keine Konsolenfehler');
  console.log(`\n${steps.length} Prüfungen bestanden`);
  await browser.close();
})().catch((err) => { console.error('FEHLER:', err); process.exit(1); });
