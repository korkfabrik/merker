const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = 'http://localhost:8123';
const APP = `${BASE}/local/merker/index.html`;
const SHOTS = process.env.SHOTS || require('node:path').join(__dirname, '.shots', 'shots4');
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
  const homeTitles = () => page.locator('#content .due-list .item-title').allInnerTexts();
  const hold = (x, y) => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  const moveTo = (x, y) => cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
  async function drag(handle, dy) {
    await settle();
    await sleep(250);
    const box = await handle.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await hold(x, y);
    for (let i = 1; i <= 14; i++) { await moveTo(x, y + (dy * i) / 14); await sleep(20); }
    await sleep(120);
    await release();
  }

  await page.goto(APP);
  await page.waitForSelector('.list-tile');

  // 1. Startseite: Fälliges aus allen Listen, Kacheln darunter
  await page.waitForSelector('.due-list .item-title');
  let due = await homeTitles();
  assert.deepEqual(due, ['Altpapier rausstellen', 'Milch'], JSON.stringify(due));
  assert.equal(await page.locator('.due-list .item-desc').first().innerText(), 'Einkaufsliste');
  assert.equal(await page.locator('.list-tile:not(.list-tile-new)').count(), 2);
  assert.match(await page.locator('.list-tile', { hasText: 'Einkaufsliste' }).innerText(), /offen/);
  assert.ok(await page.locator('.list-tile-count .has-overdue').count() >= 1);
  await page.screenshot({ path: `${SHOTS}/1-start.png` });
  ok('Startseite zeigt überfällige und heutige Einträge (ohne spätere und ohne Datum) plus Kacheln');

  // 2. Erledigen per Wischen auf der Startseite
  let n0 = await count();
  await swipe(rows('Milch'), 0.7);
  let c = await lastCallAfter(n0);
  assert.deepEqual([c.service, c.data.status], ['update_item', 'completed']);
  await page.waitForFunction(() => ![...document.querySelectorAll('.due-list .item-title')].some((e) => e.textContent === 'Milch'));
  ok('Wischen auf der Startseite erledigt, Eintrag verschwindet aus "Fällig"');
  n0 = await count();
  await page.locator('.snackbar-action').click();
  await lastCallAfter(n0);
  await page.waitForFunction(() => [...document.querySelectorAll('.due-list .item-title')].some((e) => e.textContent === 'Milch'));
  ok('Rückgängig bringt ihn zurück');

  // 3. Dialog über der Startseite
  await rows('Altpapier').click();
  await page.waitForSelector('.sheet');
  assert.ok(await page.locator('#content .due-list').count() === 1, 'Startseite bleibt unter dem Dialog');
  assert.match(page.url(), /#\/liste\/todo\.einkaufsliste\/u4/);
  await page.goBack();
  await page.waitForSelector('.sheet', { state: 'detached' });
  assert.ok(await page.locator('.list-tile:not(.list-tile-new)').count() === 2);
  ok('Dialog öffnet über der Startseite, Zurück führt zur Startseite');

  // 3b. Nach unten ziehen öffnet die Suche
  const pull = async (dy) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 700 }] });
    for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: 700 + (dy * i) / 10 }] });
    await sleep(100);
  };
  await pull(60);
  await release();
  await sleep(300);
  assert.ok(!page.url().includes('suche'), 'kurzes Ziehen öffnet nichts');
  await pull(200);
  assert.ok(await page.locator('#pull-hint.ready').count() === 1);
  await release();
  await page.waitForSelector('.searchbar input');
  assert.match(page.url(), /#\/suche/);
  await page.goBack();
  await page.waitForSelector('.list-tile');
  ok('Nach unten ziehen öffnet die Suche, kurzes Ziehen nicht');

  // 4. Suche
  await page.locator('#btn-search').click();
  await page.waitForSelector('.searchbar input');
  assert.equal(await page.evaluate(() => document.activeElement?.type), 'search');
  assert.equal(await page.locator('#btn-search').isHidden(), true);
  await page.locator('.searchbar input').fill('milch');
  await page.waitForFunction(() => document.querySelectorAll('#content .item-title').length === 1);
  assert.equal(await page.locator('#content .item-desc').innerText(), 'Einkaufsliste · Fettarm, 1 Liter');
  await page.locator('.searchbar input').fill('LITER');
  await page.waitForFunction(() => [...document.querySelectorAll('#content .item-title')].map((e) => e.textContent).join() === 'Milch');
  await page.locator('.searchbar input').fill('rauchmelder');
  await page.waitForFunction(() => document.querySelector('#content .item-desc')?.textContent.startsWith('Haushalt'));
  await page.locator('.searchbar input').fill('gibtesnicht');
  await page.waitForFunction(() => /Nichts gefunden/.test(document.querySelector('#content').textContent));
  await page.locator('.searchbar input').fill('eier');
  await page.waitForFunction(() => /Erledigt/.test(document.querySelector('#content').textContent));
  ok('Suche findet in Titel und Beschreibung über alle Listen, ohne Groß-/Kleinschreibung, auch Erledigtes');

  await page.locator('.searchbar input').fill('haushalt');
  await page.waitForSelector('.search-list-row');
  assert.match(await page.locator('.search-list-row').innerText(), /Haushalt/);
  assert.equal(await page.locator('#content li.swipe').count(), 0);
  await page.locator('.searchbar input').fill('einkaufsliste milch');
  await page.waitForFunction(() => [...document.querySelectorAll('#content .item-title')].map((e) => e.textContent).join() === 'Milch');
  ok('Listenname zeigt die Liste oben, Listenname plus Wort findet die Aufgabe');
  await page.locator('.searchbar input').fill('haus');
  await page.locator('.search-list-row', { hasText: 'Haushalt' }).click();
  await page.waitForFunction(() => location.hash === '#/liste/todo.haushalt');
  await page.goBack();
  await page.waitForSelector('.searchbar input');
  ok('Liste in der Suche antippen öffnet sie');

  // 5. Suchfeld behält Text und Fokus bei Änderungen von außen
  await page.locator('.searchbar input').fill('brot');
  await post('/__mock/add-item?entity=todo.haushalt&summary=Brotbackautomat%20reinigen');
  await page.waitForFunction(() => document.querySelectorAll('#content .item-title').length === 2);
  assert.equal(await page.locator('.searchbar input').inputValue(), 'brot');
  assert.equal(await page.evaluate(() => document.activeElement?.type), 'search');
  ok('Neue Treffer von Home Assistant erscheinen live, Suchfeld behält Text und Fokus');

  // 6. Treffer antippen, erledigen, Dialog schließen: Suche bleibt
  await rows('Brotbackautomat').click();
  await page.waitForSelector('.sheet');
  assert.equal(await page.locator('.searchbar input').inputValue(), 'brot');
  await page.goBack();
  await page.waitForSelector('.sheet', { state: 'detached' });
  assert.equal(await page.locator('.searchbar input').inputValue(), 'brot');
  n0 = await count();
  await swipe(rows('Brotbackautomat'), 0.7);
  await lastCallAfter(n0);
  ok('Aus der Suche heraus: Dialog über der Suche, Wischen funktioniert');

  // 7. Zurück zur Startseite räumt die Suche auf
  await page.goBack();
  await page.waitForSelector('.list-tile');
  assert.equal(await page.locator('.searchbar').count(), 0);
  await page.locator('#btn-search').click();
  await page.waitForSelector('.searchbar input');
  assert.equal(await page.locator('.searchbar input').inputValue(), '');
  await page.goBack();
  ok('Beim Verlassen ist die Suche leer und das Feld weg');

  // 8. Sortieren
  await page.locator('.list-tile', { hasText: 'Einkaufsliste' }).click();
  await page.waitForSelector('li.swipe');
  await page.locator('#btn-sort').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.drag-handle').count(), 0);
  await page.locator('#btn-sort').click();
  await page.waitForSelector('.drag-handle');
  const serverOrder = (await serverItems()).filter((i) => i.status === 'needs_action').map((i) => i.summary);
  assert.deepEqual(await titles(), serverOrder);
  assert.equal(await page.locator('.done-section').count(), 0);
  await page.screenshot({ path: `${SHOTS}/2-sortieren.png` });
  ok('Sortiermodus: Reihenfolge wie in Home Assistant, Griffe sichtbar, Erledigte ausgeblendet');

  // 9. Nach oben ziehen
  const before = await titles();
  const last = before.at(-1);
  const lastUid = await rows(last).getAttribute('data-uid');
  n0 = await count();
  const lastBox = await rows(last).boundingBox();
  const firstBox = await page.locator('li.swipe').first().boundingBox();
  await drag(rows(last).locator('.drag-handle'), firstBox.y - lastBox.y - 4);
  c = await lastCallAfter(n0);
  assert.deepEqual([c.service, c.data], ['move', { uid: lastUid, previous_uid: null }]);
  await settle();
  assert.equal((await titles())[0], last);
  assert.equal((await serverItems()).find((i) => i.status === 'needs_action').uid, lastUid);
  ok('Ganz nach oben ziehen: previous_uid fehlt, Reihenfolge in HA geändert');

  // 10. Nach unten, hinter ein bestimmtes Element
  const now1 = await titles();
  const firstUid = await rows(now1[0]).getAttribute('data-uid');
  const targetUid = await rows(now1[2]).getAttribute('data-uid');
  const b0 = await rows(now1[0]).boundingBox();
  const b2 = await rows(now1[2]).boundingBox();
  n0 = await count();
  await drag(rows(now1[0]).locator('.drag-handle'), b2.y + b2.height - (b0.y + b0.height / 2) - 2);
  c = await lastCallAfter(n0);
  assert.deepEqual([c.service, c.data], ['move', { uid: firstUid, previous_uid: targetUid }]);
  await settle();
  const after = await titles();
  assert.deepEqual(after, [now1[1], now1[2], now1[0], ...now1.slice(3)]);
  ok('Nach unten ziehen: richtiger previous_uid, Anzeige und HA stimmen überein');

  // 11. Kein Ziehen ohne Platzwechsel
  n0 = await count();
  console.log('after', JSON.stringify(after), await page.evaluate(() => [...document.querySelectorAll('li.swipe')].map((l) => [l.dataset.uid, l.className, !!l.querySelector('.drag-handle'), l.getBoundingClientRect().height])));
  console.log(await page.evaluate(() => { const h = document.querySelectorAll('li.swipe')[1].querySelector('.drag-handle'); const r = h.getBoundingClientRect(); return [r.x, r.y, r.width, r.height, getComputedStyle(h).display, getComputedStyle(h).visibility, document.querySelector('#content').scrollTop]; }));
  await drag(page.locator('li.swipe').nth(1).locator('.drag-handle'), 4);
  await sleep(300);
  assert.equal(await count(), n0);
  ok('Kleines Wackeln ohne Platzwechsel sendet nichts');

  // 12. Fehler beim Verschieben: zurück zur alten Reihenfolge, Meldung
  await post('/__mock/fail-next');
  const orderBefore = await titles();
  const bb0 = await rows(orderBefore[0]).boundingBox();
  const bb1 = await rows(orderBefore[1]).boundingBox();
  await drag(rows(orderBefore[0]).locator('.drag-handle'), bb1.y + bb1.height - (bb0.y + bb0.height / 2) - 2);
  await page.waitForFunction(() => /Nicht verschoben/.test(document.querySelector('.snackbar').textContent));
  await page.waitForFunction((o) => [...document.querySelectorAll('#content .item-title')].map((e) => e.textContent).join('|') === o, orderBefore.join('|'));
  ok('Fehler: Meldung und alte Reihenfolge');

  // 13. Antippen und Wischen sind im Sortiermodus aus, Modus endet mit Klick, Sortierung greift wieder
  n0 = await count();
  await rows(orderBefore[0]).locator('.item-title').click();
  await sleep(200);
  assert.equal(await page.locator('.sheet').count(), 0);
  await swipe(rows(orderBefore[0]), 0.7);
  await sleep(500);
  assert.equal(await count(), n0);
  await page.locator('#btn-sort').click();
  await page.waitForSelector('.drag-handle', { state: 'detached' });
  assert.ok((await titles()).includes('❗ Arzt anrufen'));
  ok('Im Sortiermodus kein Dialog und kein Wischen, danach normale Sortierung');

  // 14. Sortiermodus endet beim Listenwechsel, Liste ohne Verschieben hat keinen Knopf
  await page.locator('#btn-sort').click();
  await page.goBack();
  await page.waitForSelector('.list-tile');
  await page.locator('.list-tile', { hasText: 'Einkaufsliste' }).click();
  await page.waitForSelector('li.swipe');
  assert.equal(await page.locator('.drag-handle').count(), 0);
  await page.goBack();
  await post('/__mock/add-list-ro');
  await page.locator('.list-tile', { hasText: 'Nur lesen' }).click();
  await page.waitForSelector('li.swipe');
  assert.equal(await page.locator('#btn-sort').isHidden(), true);
  ok('Sortiermodus startet pro Liste neu, Liste ohne Verschieben zeigt keinen Knopf');

  // 15. Dunkles Design
  await context.close();
  const dark = await browser.newContext({ locale: 'de-DE', viewport: { width: 412, height: 860 }, deviceScaleFactor: 2, hasTouch: true, colorScheme: 'dark' });
  const p2 = await dark.newPage();
  await p2.goto(APP);
  await p2.waitForSelector('.list-tile');
  await p2.screenshot({ path: `${SHOTS}/3-start-dunkel.png` });
  await dark.close();
  ok('Dunkles Design gerendert');

  assert.deepEqual(errors, [], errors.join('\n'));
  ok('Keine Konsolenfehler');
  await browser.close();
  console.log(`\n${steps.length} Prüfungen bestanden`);
})().catch((e) => { console.error('FEHLER', e); process.exit(1); });
