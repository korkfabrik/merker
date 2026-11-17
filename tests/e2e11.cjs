const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = 'http://localhost:8123';
const APP = `${BASE}/local/merker/index.html`;
const SHOTS = process.env.SHOTS || require('node:path').join(__dirname, '.shots', 'shots9');
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
  let pickSort;
  const browser = await chromium.launch();
  const context = await browser.newContext({ locale: 'de-DE', viewport: { width: 412, height: 860 }, deviceScaleFactor: 2, hasTouch: true, colorScheme: 'light' });
  const page = await context.newPage();
  pickSort = async (label) => {
    await page.locator('.sort-mode').click();
    await page.locator('.sheet .pick-row', { hasText: label }).click();
    await page.waitForSelector('.sheet-root', { state: 'detached' });
  };
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
  const open = () => page.locator('#content > ul .item-title').allInnerTexts();
  await page.goto(APP);
  await page.waitForSelector('.list-tile');
  const dueBefore = await page.locator('.due-list .item-title').allInnerTexts();
  await page.locator('.list-tile', { hasText: 'Einkaufsliste' }).click();
  await page.waitForSelector('li.swipe');

  // 1. Standard
  assert.match(await page.locator('.sort-mode').innerText(), /Standard/);
  assert.deepEqual(await open(), ['❗ Arzt anrufen', 'Altpapier rausstellen', 'Milch', 'Brot', '<img src=x onerror=window.__xss=1>']);
  ok('Standard: Prio, Datum, Reihenfolge aus HA');

  // 2. Streng HA
  await pickSort('Home Assistant');
  assert.match(await page.locator('.sort-mode').innerText(), /Home Assistant/);
  const server = (await serverItems()).filter((i) => i.status === 'needs_action').map((i) => i.summary);
  assert.deepEqual(await open(), server);
  ok('"Home Assistant": streng die Reihenfolge der Liste, ohne Prio und Datum');

  // 3. A bis Z
  await pickSort('A bis Z');
  assert.match(await page.locator('.sort-mode').innerText(), /A bis Z/);
  assert.deepEqual(await open(), ['<img src=x onerror=window.__xss=1>', 'Altpapier rausstellen', '❗ Arzt anrufen', 'Brot', 'Milch']);
  await page.screenshot({ path: `${SHOTS}/1-alpha.png` });
  ok('"A bis Z": nach Titel, Prio-Zeichen zählt nicht');

  // 4. Bleibt nach Neuladen, gilt nur für diese Liste
  await page.reload();
  await page.waitForSelector('li.swipe');
  assert.match(await page.locator('.sort-mode').innerText(), /A bis Z/);
  await page.goto('about:blank');
  await page.goto(`${APP}#/liste/todo.haushalt`);
  await page.waitForSelector('li.swipe');
  assert.match(await page.locator('.sort-mode').innerText(), /Standard/);
  ok('Einstellung bleibt gespeichert und gilt nur für die eine Liste');

  // 5. Einstellungen
  await page.goto('about:blank');
  await page.goto(`${APP}#/einstellungen`);
  if (!/einstellungen\/listen/.test(page.url())) { await page.waitForSelector('.menu-row'); await page.locator('.menu-row', { hasText: /^(Listen|Lists)/ }).first().click(); } await page.waitForSelector('.set-row');
  await page.locator('.set-row', { hasText: 'Einkaufsliste' }).click();
  await page.waitForSelector('[aria-label="Sortierung Einkaufsliste"]');
  const pressed = await page.locator('[aria-label="Sortierung Einkaufsliste"]').locator('[aria-pressed=true]').innerText();
  assert.ok(['Standard', 'A bis Z'].includes(pressed));
  const group = page.locator('.segments', { has: page.locator('..') }).first();
  await page.locator('[aria-label="Sortierung Einkaufsliste"] .segment', { hasText: 'Standard' }).click();
  await page.goto('about:blank');
  await page.goto(`${APP}#/liste/todo.einkaufsliste`);
  await page.waitForSelector('li.swipe');
  assert.match(await page.locator('.sort-mode').innerText(), /Standard/);
  ok('Einstellungen: Sortierung je Liste wählbar');

  // 6. Sortier-Modus per Ziehen zeigt weiter HA-Reihenfolge, "Fällig" bleibt unverändert
  await page.locator('#btn-sort').click();
  await page.waitForSelector('.drag-handle');
  assert.deepEqual(await open(), server);
  assert.equal(await page.locator('.sort-mode').count(), 0);
  await page.goBack();
  await page.goto('about:blank');
  await page.goto(APP);
  await page.waitForSelector('.due-list .item-title');
  assert.deepEqual(await page.locator('.due-list .item-title').allInnerTexts(), dueBefore);
  ok('Ziehen-Modus zeigt HA-Reihenfolge, "Fällig" bleibt Standard');

  assert.deepEqual(errors.filter((e) => !/Failed to load resource|WebSocket|net::ERR/.test(e)), [], errors.join(' | '));
  ok('Keine Konsolenfehler');
  console.log(`\n${steps.length} Prüfungen bestanden`);
  await browser.close();
})().catch((err) => { console.error('FEHLER:', err); process.exit(1); });
