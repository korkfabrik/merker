// Schickt Home Assistant einen unveränderten Stand (zum Beispiel als Antwort auf das eigene Verschieben),
// bleibt die Liste stehen: keine neu gebauten Zeilen, und eine gerade gezogene Zeile verschwindet nicht unter dem Finger.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = 'http://localhost:8123';
const APP = `${BASE}/local/merker/index.html`;
const ENTITY = 'todo.einkaufsliste';
const post = (p) => fetch(`${BASE}${p}`, { method: 'POST' });
const getJson = async (p) => (await fetch(`${BASE}${p}`)).json();
const calls = () => getJson('/__mock/calls');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (name) => console.log('OK  ', name);

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ locale: 'de-DE', viewport: { width: 412, height: 860 }, hasTouch: true });
  // Eingehende Listen-Stände zählen, um auf die Antwort von HA warten zu können statt auf eine feste Zeit
  await context.addInitScript(() => {
    window.__itemEvents = 0;
    const Native = window.WebSocket;
    window.WebSocket = class extends Native {
      constructor(...args) {
        super(...args);
        this.addEventListener('message', (e) => {
          if (typeof e.data === 'string' && e.data.includes('"items"')) window.__itemEvents++;
        });
      }
    };
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  const titles = () => page.locator('#content .item-title').allInnerTexts();
  const itemEvents = () => page.evaluate(() => window.__itemEvents);
  // Unveränderten Stand schicken und warten, bis er angekommen und verarbeitet ist (Neuzeichnen läuft im Microtask danach)
  async function echo() {
    const before = await itemEvents();
    await post(`/__mock/echo?entity=${ENTITY}`);
    await page.waitForFunction((n) => window.__itemEvents > n, before);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  }
  const markRows = () => page.evaluate(() => document.querySelectorAll('#content li.swipe').forEach((li) => { li.__alt = true; }));
  const rowsKept = () => page.evaluate(() => [...document.querySelectorAll('#content li.swipe')].every((li) => li.__alt === true));
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });

  await page.goto(APP);
  await page.waitForSelector('.list-tile');
  await page.locator('.list-tile', { hasText: 'Einkaufsliste' }).click();
  await page.waitForSelector('li.swipe');

  // 1. Normale Ansicht: unveränderter Stand baut nichts neu
  await markRows();
  await echo();
  assert.ok(await rowsKept(), 'Zeilen wurden neu gebaut');
  ok('Unveränderter Stand von HA: Liste bleibt stehen');

  // 2. Wischen läuft, währenddessen kommt der unveränderte Stand (zum Beispiel die Antwort auf das vorige Erledigen)
  const swipeRow = page.locator('#content li.swipe', { hasText: 'Brot' });
  const sb = await swipeRow.boundingBox();
  const sy = sb.y + sb.height / 2;
  const sx = sb.x + 24;
  await touch('touchStart', sx, sy);
  for (let i = 1; i <= 5; i++) { await touch('touchMove', sx + (sb.width * 0.7 * i) / 10, sy); await sleep(20); }
  await page.waitForSelector('#content li.swipe .dragging');
  await echo();
  assert.ok(await page.evaluate(() => document.querySelector('#content li.swipe .dragging')?.isConnected === true), 'gewischte Zeile wurde ersetzt');
  for (let i = 6; i <= 10; i++) { await touch('touchMove', sx + (sb.width * 0.7 * i) / 10, sy); await sleep(20); }
  const s0 = (await calls()).length;
  await touch('touchEnd');
  for (let i = 0; i < 100 && (await calls()).length === s0; i++) await sleep(50);
  const done = (await calls()).at(-1);
  assert.deepEqual([done.service, done.data.item, done.data.status], ['update_item', 'u1', 'completed']);
  await page.waitForFunction(() => !document.querySelector('[data-uid^="tmp-"]'));
  ok('Unveränderter Stand während des Wischens: Zeile bleibt unter dem Finger, Erledigen kommt an');

  // 3. Sortiermodus: Zeile anheben, währenddessen kommt der unveränderte Stand, dann loslassen
  await page.locator('#btn-sort').click();
  await page.waitForSelector('.drag-handle');
  const order = await titles();
  const uids = await page.locator('#content li.swipe').evaluateAll((els) => els.map((el) => el.dataset.uid));
  const handle = page.locator('#content li.swipe').first().locator('.drag-handle');
  await handle.waitFor({ state: 'visible' });
  const h = await handle.boundingBox();
  const b2 = await page.locator('#content li.swipe').nth(2).boundingBox();
  const x = h.x + h.width / 2;
  const y = h.y + h.height / 2;
  const dy = b2.y + b2.height - y - 2;
  await touch('touchStart', x, y);
  for (let i = 1; i <= 7; i++) { await touch('touchMove', x, y + (dy * i) / 14); await sleep(20); }
  await page.waitForSelector('#content li.lifting');
  await markRows();
  await echo();
  assert.ok(await page.evaluate(() => document.querySelector('#content li.lifting')?.isConnected === true), 'gezogene Zeile ist verschwunden');
  assert.ok(await rowsKept(), 'Zeilen wurden während des Ziehens neu gebaut');
  for (let i = 8; i <= 14; i++) { await touch('touchMove', x, y + (dy * i) / 14); await sleep(20); }
  await sleep(120);
  const n0 = (await calls()).length;
  await touch('touchEnd');
  for (let i = 0; i < 100 && (await calls()).length === n0; i++) await sleep(50);
  const c = (await calls()).at(-1);
  assert.deepEqual([c.service, c.data], ['move', { uid: uids[0], previous_uid: uids[2] }]);
  await page.waitForFunction((o) => [...document.querySelectorAll('#content .item-title')].map((e) => e.textContent).join('|') === o, [order[1], order[2], order[0], ...order.slice(3)].join('|'));
  ok('Unveränderter Stand während des Ziehens: Zeile bleibt unter dem Finger, Verschieben kommt richtig an');

  // 4. Echte Änderung von außen wird weiter angezeigt
  await post(`/__mock/add-item?entity=${ENTITY}&summary=${encodeURIComponent('Von außen')}`);
  await page.waitForFunction(() => [...document.querySelectorAll('#content .item-title')].some((e) => e.textContent === 'Von außen'));
  ok('Geänderter Stand von HA erscheint weiterhin');

  assert.deepEqual(errors, []);
  await browser.close();
})().catch((e) => {
  console.log('FEHLER', e);
  process.exit(1);
});
