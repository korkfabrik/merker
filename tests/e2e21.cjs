const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = 'http://localhost:8123';
const APP = `${BASE}/local/merker/index.html`;
const getJson = async (p) => (await fetch(`${BASE}${p}`)).json();
const desc = async (summary) => (await getJson('/__mock/items?entity=todo.einkaufsliste')).find((i) => i.summary === summary)?.description;
const ok = (n) => console.log('OK  ', n);
const ORIGINAL = 'Kartons holen\n- [ ] Küche\n- [x] Bad\n- [ ] Keller\n- [ ] Garage';
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ locale: 'de-DE', viewport: { width: 412, height: 860 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await fetch(`${BASE}/__mock/add-item?entity=todo.einkaufsliste&summary=Umzug2&desc=${encodeURIComponent(ORIGINAL)}`, { method: 'POST' });
  await page.goto(APP);
  await page.waitForSelector('.list-tile');
  await page.locator('.list-tile', { hasText: 'Einkaufsliste' }).click();
  await page.locator('li.swipe', { hasText: 'Umzug2' }).click();
  await page.waitForSelector('.check-row');
  async function swipeLeft(locator, fraction) {
    const box = await locator.boundingBox();
    const y = box.y + box.height / 2;
    const x0 = box.x + box.width - 30;
    await page.mouse.move(x0, y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(x0 - (box.width * fraction * i) / 10, y);
    await page.mouse.up();
  }
  // kurze Geste löscht nichts
  await swipeLeft(page.locator('.sub-swipe', { hasText: 'Keller' }), 0.15);
  await page.waitForTimeout(500);
  assert.equal(await desc('Umzug2'), ORIGINAL);
  assert.equal(await page.locator('.check-row').count(), 4);
  ok('Kurze Wischgeste federt zurück, nichts wird gelöscht');

  await swipeLeft(page.locator('.sub-swipe', { hasText: 'Keller' }), 0.7);
  for (let i = 0; i < 40 && (await desc('Umzug2')) === ORIGINAL; i++) await page.waitForTimeout(100);
  assert.equal(await desc('Umzug2'), 'Kartons holen\n- [ ] Küche\n- [x] Bad\n- [ ] Garage');
  assert.equal(await page.locator('.check-row').count(), 3);
  await page.waitForSelector('.snackbar:not([hidden])');
  assert.match(await page.locator('.snackbar').innerText(), /Unteraufgabe gelöscht/);
  assert.equal(await page.locator('.sheet').count(), 1);
  ok('Nach links wischen löscht die Unteraufgabe, Dialog bleibt offen');

  await page.locator('.snackbar-action').click();
  for (let i = 0; i < 40 && (await desc('Umzug2')) !== ORIGINAL; i++) await page.waitForTimeout(100);
  assert.equal(await desc('Umzug2'), ORIGINAL);
  assert.equal(await page.locator('.check-row').count(), 4);
  ok('Rückgängig setzt die Unteraufgabe an dieselbe Stelle zurück');

  // Rückgängig nach dem Schließen des Dialogs
  await page.waitForTimeout(600);
  await swipeLeft(page.locator('.sub-swipe', { hasText: 'Küche' }), 0.7);
  for (let i = 0; i < 40 && (await desc('Umzug2')) === ORIGINAL; i++) await page.waitForTimeout(100);
  await page.locator('.sheet .btn-primary').evaluate((b) => b.click());
  await page.waitForFunction(() => !document.querySelector('.sheet'));
  await page.locator('.snackbar-action').click();
  for (let i = 0; i < 40 && (await desc('Umzug2')) !== ORIGINAL; i++) await page.waitForTimeout(100);
  assert.equal(await desc('Umzug2'), ORIGINAL);
  ok('Rückgängig klappt auch nach dem Schließen des Dialogs');

  assert.deepEqual(errors, []);
  await browser.close();
})().catch((e) => { console.log('FEHLER:', e); process.exit(1); });
