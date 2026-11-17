const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = 'http://localhost:8123';
const APP = `${BASE}/local/merker/index.html`;
const SHOTS = process.env.SHOTS || require('node:path').join(__dirname, '.shots', 'shots10');
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
  for (let i = 1; i <= 6; i++) await post(`/__mock/add-item?entity=todo.haushalt&summary=Wartung%20${i}&due=${dayStr(-3)}&desc=Langer%20Text`);
  await page.goto(APP);
  await page.waitForSelector('.list-tile');
  await page.waitForFunction(() => /Fällig \(8\)/.test(document.querySelector('#content').textContent));
  assert.equal(await page.locator('.due-list li.swipe').count(), 4);
  const counts = await page.locator('.filter-chip').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  assert.deepEqual(counts.slice(1, 2), ['Überfällig: 7']);
  assert.equal(counts.length, 3);
  assert.match(await page.locator('.open-total').innerText(), /^\d+ offen$/);
  assert.equal(await page.locator('.open-total').evaluate((e) => getComputedStyle(e).pointerEvents), 'none');
  assert.equal(await page.locator('.more-btn').innerText(), 'Alle 8 anzeigen');
  ok('Fällig zeigt 4 Einträge, Anzahl im Titel, Zähler in den Filterknöpfen oben');

  await page.locator('.more-btn').click();
  await page.waitForFunction(() => document.querySelectorAll('.due-list li.swipe').length === 8);
  assert.equal(await page.locator('.more-btn').innerText(), 'Weniger anzeigen');
  const descs = await page.locator('.due-list .item-desc').allInnerTexts();
  assert.ok(descs.every((d) => !d.includes('Langer Text')), 'keine Beschreibung auf der Startseite');
  await page.screenshot({ path: `${SHOTS}/1-alle.png` });
  // Filter wechseln: Ansicht bleibt aufgeklappt
  await page.locator('.filter-chip').nth(1).click();
  await page.waitForFunction(() => /Überfällig/.test(document.querySelector('.section-title').textContent));
  assert.equal(await page.locator('.more-btn').innerText(), 'Weniger anzeigen');
  const shownFiltered = await page.locator('.due-list li.swipe').count();
  assert.equal(shownFiltered, 7);
  await page.locator('.filter-chip').nth(2).click();
  await page.locator('.filter-chip').nth(2).click();
  await page.waitForFunction(() => /Fällig/.test(document.querySelector('.section-title').textContent));
  assert.equal(await page.locator('.due-list li.swipe').count(), 8);
  ok('Filter wechseln: aufgeklappte Anzeige bleibt groß');
  await page.locator('.more-btn').click();
  await page.waitForFunction(() => document.querySelectorAll('.due-list li.swipe').length === 4);
  ok('Alle anzeigen und wieder einklappen, Beschreibung bleibt ausgeblendet');

  // Titel nicht mehr rot, Datum schon
  const colors = await page.evaluate(() => {
    const row = document.querySelector('.due-list .item-overdue');
    const normal = getComputedStyle(document.body).color;
    return { title: getComputedStyle(row.querySelector('.item-title')).color, normal, chip: getComputedStyle(row.querySelector('.chip')).backgroundColor };
  });
  assert.equal(colors.title, colors.normal);
  assert.notEqual(colors.chip, 'rgba(0, 0, 0, 0)');
  ok('Titel überfälliger Einträge nicht mehr rot, Datum bleibt hervorgehoben');

  // Kachel mit überfälligen
  const tile = await page.locator('.list-tile', { hasText: 'Haushalt' }).innerText();
  assert.match(tile, /7 offen, 6 überfällig/);
  const th = await page.locator('.list-tile').first().boundingBox();
  assert.ok(th.height < 80, String(th.height));
  ok('Kachel zeigt "N offen, M überfällig" und ist kompakter');

  // Wischen auf der Startseite wirkt weiter
  const n0 = await count();
  await swipe(page.locator('.due-list li.swipe').first(), 0.7);
  await lastCallAfter(n0);
  ok('Wischen auf der Startseite funktioniert weiter');

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/2-dunkel.png` });
  assert.deepEqual(errors.filter((e) => !/Failed to load resource|WebSocket|net::ERR/.test(e)), [], errors.join(' | '));
  ok('Keine Konsolenfehler');
  console.log(`\n${steps.length} Prüfungen bestanden`);
  await browser.close();
})().catch((err) => { console.error('FEHLER:', err); process.exit(1); });
