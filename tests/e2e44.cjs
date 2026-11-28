// UI-Review 1.1.3:
// Unteraufgaben stehen im Dialog nur als Kästchen, nicht noch einmal als Rohtext im Feld Beschreibung. Speichern setzt beides wieder zusammen.
// Bearbeiten hat dieselbe Reihenfolge wie Neue Aufgabe. Untere Knöpfe im Dialog ohne Füllung. Einkaufsansicht ohne Plus-Knopf.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = 'http://localhost:8123';
const APP = `${BASE}/local/merker/index.html`;
const post = (p) => fetch(`${BASE}${p}`, { method: 'POST' });
const getJson = async (p) => (await fetch(`${BASE}${p}`)).json();
const calls = () => getJson('/__mock/calls');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (name) => console.log('OK  ', name);

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ locale: 'de-DE', viewport: { width: 412, height: 860 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  const desc = 'Keller\n- [x] Regal\n- [ ] Boden';
  await post(`/__mock/add-item?entity=todo.haushalt&summary=${encodeURIComponent('Aufräumen')}&desc=${encodeURIComponent(desc)}`);
  const stored = async () => (await getJson('/__mock/items?entity=todo.haushalt')).find((i) => i.summary === 'Aufräumen').description;

  await page.goto(APP);
  await page.waitForSelector('.list-tile');
  await page.locator('.list-tile', { hasText: 'Haushalt' }).click();
  await page.locator('li.swipe', { hasText: 'Aufräumen' }).locator('.item-title').click();
  await page.waitForSelector('.sheet .check-row');

  // 1. Textfeld zeigt nur den freien Text, die Unteraufgaben als Kästchen
  assert.equal(await page.locator('.sheet textarea[name=description]').inputValue(), 'Keller');
  assert.deepEqual(await page.locator('.sheet .check-text').allInnerTexts(), ['Regal', 'Boden']);
  ok('Unteraufgaben nur als Kästchen, nicht doppelt im Textfeld');

  // 2. Gleiche Reihenfolge wie bei Neue Aufgabe
  const labels = await page.locator('.sheet .field-label').evaluateAll((els) => els.map((e) => e.textContent.replace(/ \(.*\)$/, '')));
  assert.deepEqual(labels, ['Titel', 'Fälligkeit', 'Unteraufgaben', 'Beschreibung']);
  ok('Reihenfolge: Titel, Fälligkeit, Unteraufgaben, Beschreibung');

  // 3. Untere Knöpfe ohne Füllung, Löschen mit rotem Symbol
  const bg = await page.locator('.sheet-actions .btn-icon').evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
  assert.ok(bg.length >= 3 && bg.every((c) => c === 'rgba(0, 0, 0, 0)'), bg.join(' '));
  ok('Untere Knöpfe im Dialog zurückhaltend');

  // 1b. Speichern ohne Änderung schickt nichts. Unteraufgabe abhaken und freien Text ändern: beides kommt an
  let n0 = (await calls()).length;
  await page.locator('.sheet button[type=submit]').click();
  await page.waitForSelector('.sheet-root', { state: 'detached' });
  await sleep(300);
  assert.equal((await calls()).length, n0, 'Speichern ohne Änderung hat gesendet');
  await page.locator('li.swipe', { hasText: 'Aufräumen' }).locator('.item-title').click();
  await page.waitForSelector('.sheet .check-row');
  await page.locator('.sheet .check-row', { hasText: 'Boden' }).click();
  await page.waitForFunction(async () => (await (await fetch('/__mock/items?entity=todo.haushalt')).json()).find((i) => i.summary === 'Aufräumen').description.includes('- [x] Boden'));
  await page.locator('.sheet textarea[name=description]').fill('Keller und Garage');
  await page.locator('.sheet button[type=submit]').click();
  await page.waitForSelector('.sheet-root', { state: 'detached' });
  await page.waitForFunction(async () => (await (await fetch('/__mock/items?entity=todo.haushalt')).json()).find((i) => i.summary === 'Aufräumen').description.startsWith('Keller und Garage'));
  assert.equal(await stored(), 'Keller und Garage\n- [x] Regal\n- [x] Boden');
  ok('Speichern setzt freien Text und Unteraufgaben wieder zusammen');

  // 4. Einkaufsansicht ohne Plus-Knopf, normale Liste mit
  assert.equal(await page.locator('#fab').isVisible(), true);
  await page.evaluate(() => localStorage.setItem('merker.shoppingLists', JSON.stringify(['todo.einkaufsliste'])));
  await page.evaluate(() => { location.hash = '#/liste/todo.einkaufsliste'; });
  await page.waitForSelector('.shop-tile, .shopping, #content .shop-section');
  await sleep(300);
  assert.equal(await page.locator('#fab').isVisible(), false);
  ok('Einkaufsansicht ohne Plus-Knopf');

  assert.deepEqual(errors, []);
  await browser.close();
})().catch((e) => {
  console.log('FEHLER', e);
  process.exit(1);
});
