// UI-Review 1.1.4: Schalter "❗ Wichtig" rechts über dem Titel (Bearbeiten und Neue Aufgabe).
// Knopfleiste im Dialog bleibt beim Scrollen am unteren Rand sichtbar.
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
const post = (p) => fetch(`${BASE}${p}`, { method: 'POST' });
const getJson = async (p) => (await fetch(`${BASE}${p}`)).json();
const ok = (name) => console.log('OK  ', name);

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ locale: 'de-DE', viewport: { width: 393, height: 700 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  // Lange Aufgabe, damit der Dialog scrollen muss
  const desc = ['Zeile', ...Array.from({ length: 8 }, (_, i) => `- [ ] Schritt ${i + 1}`)].join('\n');
  await post(`/__mock/add-item?entity=todo.haushalt&summary=${encodeURIComponent('Lang')}&desc=${encodeURIComponent(desc)}`);

  await page.goto(APP);
  await page.waitForSelector('.list-tile');
  await page.locator('.list-tile', { hasText: 'Haushalt' }).click();
  await page.locator('li.swipe', { hasText: 'Lang' }).locator('.item-title').click();
  await page.waitForSelector('.sheet .check-row');
  await page.waitForTimeout(600);

  // 1. Schalter mit Text in der Zeile über dem Titel
  const prio = page.locator('.sheet .label-row:has(label[for=sheet-title]) .prio-toggle');
  assert.match(await prio.innerText(), /❗\s*Wichtig/);
  assert.equal(await prio.getAttribute('aria-pressed'), 'false');
  await page.evaluate(() => document.activeElement?.blur());
  await prio.click();
  assert.notEqual(await page.evaluate(() => document.activeElement?.id), 'sheet-title', 'Wichtig springt in den Titel');
  assert.equal(await prio.getAttribute('aria-pressed'), 'true');
  ok('Bearbeiten: Schalter Wichtig über dem Titel, springt nicht in den Titel');

  // 2. Knopfleiste ist ohne Scrollen sichtbar und bleibt nach Scrollen unten
  const sheetBox = await page.locator('.sheet').boundingBox();
  const inView = async () => {
    const bar = await page.locator('.sheet-actions-bar').boundingBox();
    return bar.y >= sheetBox.y && bar.y + bar.height <= sheetBox.y + sheetBox.height + 1;
  };
  assert.ok(await page.evaluate(() => document.querySelector('.sheet').scrollHeight > document.querySelector('.sheet').clientHeight), 'Dialog scrollt nicht');
  assert.ok(await inView(), 'Knopfleiste ohne Scrollen nicht sichtbar');
  await page.evaluate(() => document.querySelector('.sheet').scrollTo(0, 200));
  assert.ok(await inView(), 'Knopfleiste nach Scrollen nicht sichtbar');
  ok('Knopfleiste bleibt am unteren Rand sichtbar');

  // 2b. Datumsfeld: eigenes Kalender-Symbol rechts mit Abstand zum Rand
  const date = await page.evaluate(() => {
    const input = document.querySelector('#sheet-due');
    const icon = document.querySelector('.sheet .date-row .date-icon').getBoundingClientRect();
    const field = input.getBoundingClientRect();
    return { gap: field.right - icon.right };
  });
  assert.ok(date.gap >= 12, `Symbol zu nah am Rand: ${date.gap}`);
  ok('Datumsfeld mit eigenem Kalender-Symbol und Abstand zum Rand');

  // 3. Speichern übernimmt Wichtig
  await page.locator('.sheet button[type=submit]').click();
  await until(async () => (await (await fetch(BASE + '/__mock/items?entity=todo.haushalt')).json()).some((i) => i.summary === '❗ Lang'));
  ok('Wichtig wird gespeichert');

  // 4. Neue Aufgabe: derselbe Schalter
  await page.waitForSelector('.sheet-root', { state: 'detached' });
  await page.locator('#fab').click();
  await page.waitForSelector('#new-title');
  assert.equal(await page.locator('.sheet .label-row:has(label[for=new-title]) .prio-toggle').count(), 1);
  // Beim Tippen im Titel bleibt der Fokus dort (Tastatur bleibt offen)
  await page.locator('#new-title').fill('Test');
  await page.locator('.sheet .prio-toggle').click();
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'new-title');
  ok('Neue Aufgabe: Schalter Wichtig über dem Titel, beim Tippen bleibt der Fokus im Titel');

  assert.deepEqual(errors, []);
  await browser.close();
})().catch((e) => {
  console.log('FEHLER', e);
  process.exit(1);
});
