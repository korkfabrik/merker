const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = 'http://localhost:8123';
const APP = `${BASE}/local/merker/index.html`;
const SHOTS = process.env.SHOTS || require('node:path').join(__dirname, '.shots', 'shots7');
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
  await post('/__mock/add-list-ro');

  // 1. Plus-Knopf nur auf der Startseite, unten rechts
  const fab = page.locator('#fab');
  await fab.waitFor({ state: 'visible' });
  const box = await fab.boundingBox();
  assert.ok(box.x + box.width > 412 - 40 && box.y + box.height > 860 - 40, JSON.stringify(box));
  await page.locator('.list-tile', { hasText: 'Haushalt' }).click();
  await page.waitForSelector('li.swipe');
  assert.equal(await fab.isVisible(), true);
  await page.goBack();
  await page.locator('#btn-search').click();
  assert.equal(await fab.isHidden(), true);
  await page.goBack();
  await fab.waitFor({ state: 'visible' });
  ok('Plus-Knopf unten rechts, auf Start- und Listenseite, nicht in der Suche');

  // 2. Aufgabe anlegen: Liste wählen, Prio, Datum, Beschreibung
  await fab.click();
  await page.waitForSelector('.sheet-root.open');
  assert.match(await page.locator('.sheet-band .band-pick-small').innerText(), /Neue Aufgabe in/);
  const startList = await page.locator('.sheet-band .band-pick-name').innerText();
  assert.ok(['Einkaufsliste', 'Haushalt'].includes(startList));
  await page.locator('.sheet input[name=title]').fill('Fenster putzen');
  await page.locator('.band-pick').click();
  await page.waitForSelector('.pick-row');
  assert.deepEqual((await page.locator('.pick-row .pick-name').allInnerTexts()).sort(), ['Einkaufsliste', 'Haushalt']);
  await page.locator('.pick-row', { hasText: 'Haushalt' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.sheet-root').length === 1 && !document.querySelector('.pick-row'));
  assert.equal(await page.locator('.sheet-band .band-pick-name').innerText(), 'Haushalt');
  assert.equal(await page.locator('.sheet input[name=title]').inputValue(), 'Fenster putzen');
  assert.match(await page.locator('.sheet-band').getAttribute('style'), /--lh/);
  await page.locator('.sheet .prio-toggle').click();
  await page.locator('.sheet input[name=due]').fill(dayStr(0));
  await page.locator('.sheet textarea').fill('Außen und innen');
  let n0 = await count();
  await page.getByRole('button', { name: 'Hinzufügen' }).click();
  let c = await lastCallAfter(n0);
  assert.deepEqual([c.service, c.data, c.target], ['add_item', { item: '❗ Fenster putzen', description: 'Außen und innen', due_date: dayStr(0) }, { entity_id: 'todo.haushalt' }]);
  await page.waitForSelector('.sheet-root', { state: 'detached' });
  await page.waitForFunction(() => /Hinzugefügt zu Haushalt/.test(document.querySelector('.snackbar').textContent));
  await page.waitForFunction(() => [...document.querySelectorAll('.due-list .item-title')].some((e) => e.textContent.includes('Fenster putzen')));
  ok('Neue Aufgabe landet in der gewählten Liste mit Prio, Datum und Beschreibung, erscheint unter "Fällig"');

  // 3. Letzte Liste wird gemerkt, Leerer Titel sperrt, Zurück-Geste schließt
  await fab.click();
  await page.waitForSelector('.sheet-root.open');
  assert.equal(await page.locator('.sheet-band .band-pick-name').innerText(), 'Haushalt');
  assert.equal(await page.getByRole('button', { name: 'Hinzufügen' }).isDisabled(), true);
  n0 = await count();
  await page.goBack();
  await page.waitForSelector('.sheet-root', { state: 'detached' });
  assert.equal(await count(), n0);
  assert.ok(await page.locator('.list-tile:not(.list-tile-new)').count() >= 2);
  ok('Letzte Liste vorgewählt, ohne Titel gesperrt, Zurück-Geste schließt ohne Eintrag');

  // 4. Fälligkeit rechts oben, Liste als Text darunter, Farbstreifen, keine Beschreibung auf der Startseite
  await page.waitForSelector('.due-list li.swipe');
  const geo = await page.evaluate(() => {
    const item = [...document.querySelectorAll('.due-list .item')].find((e) => e.textContent.includes('Fenster putzen'));
    const t = item.querySelector('.item-title').getBoundingClientRect();
    const due = [...item.querySelectorAll('.chip')].find((e) => e.textContent === 'Heute').getBoundingClientRect();
    const info = item.querySelector('.item-desc');
    return { t: t.toJSON(), due: due.toJSON(), right: item.getBoundingClientRect().right, info: info.textContent, infoTop: info.getBoundingClientRect().top, shadow: getComputedStyle(item, '::before').backgroundColor, titleColor: getComputedStyle(item.querySelector('.item-title')).color };
  });
  assert.ok(geo.due.right > geo.right - 24, JSON.stringify(geo));
  assert.ok(geo.due.top < geo.t.top + geo.t.height, 'Datum auf Höhe des Titels');
  assert.equal(geo.info, 'Haushalt');
  assert.ok(geo.infoTop >= geo.t.bottom - 2);
  assert.notEqual(geo.shadow, 'rgba(0, 0, 0, 0)');
  await page.screenshot({ path: `${SHOTS}/1-start.png` });
  ok('Fälligkeit rechts oben, darunter Listenname als Text, Farbstreifen links, ohne Beschreibung');

  // 5. Liste als Chip im Dialog
  await rows('Fenster putzen').click();
  await page.waitForSelector('.sheet .sheet-band .sheet-band-name');
  assert.equal(await page.locator('.sheet .sheet-band .sheet-band-name').innerText(), 'Haushalt');
  await page.screenshot({ path: `${SHOTS}/2-dialog.png` });
  await page.goBack();
  await page.waitForSelector('.sheet', { state: 'detached' });
  ok('Offener Eintrag zeigt seine Liste als Chip');

  // 6. Ziehen: Browser darf nicht selbst überscrollen (Ereignis abbrechbar), Suche öffnet
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 600 }] });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: 600 + 20 * i }] });
  assert.ok(await page.locator('#pull-hint.ready').count() === 1);
  await release();
  await page.waitForSelector('.searchbar input');
  ok('Nach unten ziehen öffnet die Suche (Schwelle 40 Pixel Hinweis)');

  assert.deepEqual(errors.filter((e) => !/Failed to load resource|WebSocket|net::ERR/.test(e)), [], errors.join(' | '));
  ok('Keine Konsolenfehler');
  console.log(`\n${steps.length} Prüfungen bestanden`);
  await browser.close();
})().catch((err) => { console.error('FEHLER:', err); process.exit(1); });
