// Erledigen aus dem Dialog: Abhak-Kreis im Kopf links vor dem Listennamen, rechts Speichern.
// Der Kreis schaltet nur um. Erst Speichern übernimmt ihn zusammen mit den anderen Änderungen. Schließen ohne Speichern ändert nichts.
// Bei erledigten Aufgaben ist der Kreis gefüllt, Antippen und Speichern öffnet sie wieder.
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
const getJson = async (p) => (await fetch(`${BASE}${p}`)).json();
const calls = () => getJson('/__mock/calls');
const item = async (uid) => (await getJson('/__mock/items?entity=todo.einkaufsliste')).find((i) => i.uid === uid);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (name) => console.log('OK  ', name);

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ locale: 'de-DE', viewport: { width: 412, height: 860 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  const open = async (text) => {
    await page.locator('li.swipe', { hasText: text }).locator('.item-title').click();
    await page.waitForSelector('.sheet .sheet-check');
  };
  const circle = () => page.locator('.sheet-head .sheet-check');
  const closed = () => page.waitForSelector('.sheet-root', { state: 'detached' });

  await page.goto(APP);
  await page.waitForSelector('.list-tile');
  await page.locator('.list-tile', { hasText: 'Einkaufsliste' }).click();
  await page.waitForSelector('li.swipe');

  // 1. Kreis im Kopf vor dem Listennamen, Speichern rechts, kein Erledigt-Knopf unten
  await open('Brot');
  assert.equal(await page.locator('.sheet-head-edit > :first-child').getAttribute('class'), 'sheet-check press');
  assert.equal(await page.locator('.sheet-head-edit > :last-child').getAttribute('type'), 'submit');
  assert.equal(await circle().getAttribute('aria-pressed'), 'false');
  assert.equal(await page.locator('.sheet-actions button[aria-label="Wieder öffnen"], .sheet-actions button[aria-label="Erledigt"]').count(), 0);
  ok('Abhak-Kreis links vor dem Listennamen, Speichern rechts');

  // 2. Abhaken und ohne Speichern schließen: nichts gesendet
  let n0 = (await calls()).length;
  await circle().click();
  assert.equal(await circle().getAttribute('aria-pressed'), 'true');
  await sleep(300);
  assert.equal((await calls()).length, n0, 'Abhaken hat schon gesendet');
  await page.goBack();
  await closed();
  await sleep(300);
  assert.equal((await calls()).length, n0);
  assert.equal((await item('u1')).status, 'needs_action');
  ok('Abhaken allein speichert nicht, Schließen verwirft');

  // 3. Abhaken, Titel ändern, Speichern: erst Umbenennen, dann erledigt
  await open('Brot');
  await circle().click();
  await page.locator('.sheet input[name=title]').fill('Brot vom Bäcker');
  n0 = (await calls()).length;
  await page.locator('.sheet button[type=submit]').click();
  await closed();
  await page.waitForFunction(() => /Erledigt: Brot vom Bäcker/.test(document.querySelector('.snackbar')?.textContent ?? ''));
  await until(async () => (await (await fetch(BASE + '/__mock/calls')).json()).length >= n0 + 2);
  const sent = (await calls()).slice(n0).map((c) => [c.service, c.data.rename ?? null, c.data.status ?? null]);
  assert.deepEqual(sent.slice(0, 2), [['update_item', 'Brot vom Bäcker', null], ['update_item', null, 'completed']]);
  assert.deepEqual([(await item('u1')).summary, (await item('u1')).status], ['Brot vom Bäcker', 'completed']);
  ok('Speichern übernimmt Änderung und Erledigt');

  // 4. Erledigte Aufgabe: Kreis gefüllt, Antippen und Speichern öffnet wieder
  await page.locator('.done-section, .done-toggle, button', { hasText: /Erledigt \(/ }).first().click();
  await open('Brot vom Bäcker');
  assert.equal(await circle().getAttribute('aria-pressed'), 'true');
  await circle().click();
  await page.locator('.sheet button[type=submit]').click();
  await closed();
  await until(async () => (await (await fetch(BASE + '/__mock/items?entity=todo.einkaufsliste')).json()).find((i) => i.uid === 'u1').status === 'needs_action');
  ok('Erledigte Aufgabe: Kreis abwählen und Speichern öffnet sie wieder');

  assert.deepEqual(errors, []);
  await browser.close();
})().catch((e) => {
  console.log('FEHLER', e);
  process.exit(1);
});
