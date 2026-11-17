const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = 'http://localhost:8123';
const APP = `${BASE}/local/merker/index.html`;
const SHOTS = process.env.SHOTS || require('node:path').join(__dirname, '.shots', 'shots8');
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
  await page.goto(APP);
  await page.waitForSelector('.list-tile');

  // 1. Kachel "Neue Liste", Dialog, Anlegen
  const tile = page.locator('.list-tile-new');
  await tile.waitFor();
  await tile.click();
  await page.waitForSelector('.sheet-root.open');
  assert.equal(await page.getByRole('button', { name: 'Anlegen' }).isDisabled(), true);
  await page.locator('.sheet input').fill('Gartenarbeiten Süd');
  let n0 = await count();
  await page.getByRole('button', { name: 'Anlegen' }).click();
  let cs = [];
  for (let i = 0; i < 80 && cs.length < 2; i++) {
    cs = (await calls()).slice(n0);
    if (cs.length < 2) await page.waitForTimeout(100);
  }
  assert.deepEqual([cs[0].service, cs[0].data.handler], ['flow_start', 'local_todo']);
  assert.deepEqual([cs[1].service, cs[1].data], ['flow_step', { todo_list_name: 'Gartenarbeiten Süd' }]);
  await page.waitForFunction(() => location.hash === '#/liste/todo.gartenarbeiten_sued');
  assert.equal(await page.locator('#view-title').innerText(), 'Gartenarbeiten Süd');
  ok('Neue Liste wird über den Einrichtungsablauf angelegt und danach direkt geöffnet');

  // 2. Neue Liste ist benutzbar
  await page.locator('#fab').click();
  await page.locator('.sheet input[name=title]').fill('Rasen mähen');
  await page.locator('.sheet button[type=submit]').click();
  await page.waitForSelector('.sheet-root', { state: 'detached' });
  await present('Rasen mähen');
  ok('Eintrag in der neuen Liste anlegen funktioniert');

  // 3. Doppelter Name: Fehler im Dialog, Dialog bleibt
  await page.goBack();
  await page.waitForSelector('.list-tile-new');
  await page.locator('.list-tile-new').click();
  await page.waitForSelector('.sheet-root.open');
  await page.locator('.sheet input').fill('Gartenarbeiten Süd');
  await page.getByRole('button', { name: 'Anlegen' }).click();
  await page.waitForSelector('.form-error:not([hidden])');
  assert.match(await page.locator('.form-error').innerText(), /gibt es schon/);
  assert.ok(await page.locator('.sheet').isVisible());
  await page.locator('.sheet input').fill('Gartenarbeiten Nord');
  assert.equal(await page.locator('.form-error').isHidden(), true);
  await page.screenshot({ path: `${SHOTS}/1-dialog.png` });
  ok('Doppelter Name: Meldung im Dialog, Eingabe bleibt');

  // 4. Zurück-Geste schließt ohne etwas anzulegen
  n0 = await count();
  await page.goBack();
  await page.waitForSelector('.sheet-root', { state: 'detached' });
  assert.equal(await count(), n0);
  ok('Zurück-Geste schließt den Dialog ohne Anlegen');

  // 5. Keine Administratorrechte
  await post('/__mock/flow-forbidden');
  await page.locator('.list-tile-new').click();
  await page.waitForSelector('.sheet-root.open');
  await page.locator('.sheet input').fill('Test');
  await page.getByRole('button', { name: 'Anlegen' }).click();
  await page.waitForSelector('.form-error:not([hidden])');
  assert.match(await page.locator('.form-error').innerText(), /Administratorrechte/);
  ok('Ohne Administratorrechte: verständliche Meldung');

  // 6. Tile in der Liste sichtbar, Dunkel
  await page.goBack();
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForSelector('.list-tile-new');
  await page.screenshot({ path: `${SHOTS}/2-start-dunkel.png` });
  ok('Dunkles Design gerendert');

  assert.deepEqual(errors.filter((e) => !/Failed to load resource|WebSocket|net::ERR|403|401/.test(e)), [], errors.join(' | '));
  ok('Keine Konsolenfehler');
  console.log(`\n${steps.length} Prüfungen bestanden`);
  await browser.close();
})().catch((err) => { console.error('FEHLER:', err); process.exit(1); });
