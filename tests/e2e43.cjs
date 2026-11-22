// Erledigen aus dem Dialog: Knopf "Erledigt" bei offenen Aufgaben. Änderungen im Dialog werden vorher gespeichert.
// Bei erledigten Aufgaben steht stattdessen "Wieder öffnen".
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = 'http://localhost:8123';
const APP = `${BASE}/local/merker/index.html`;
const getJson = async (p) => (await fetch(`${BASE}${p}`)).json();
const calls = () => getJson('/__mock/calls');
const ok = (name) => console.log('OK  ', name);

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ locale: 'de-DE', viewport: { width: 412, height: 860 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(APP);
  await page.waitForSelector('.list-tile');
  await page.locator('.list-tile', { hasText: 'Einkaufsliste' }).click();
  await page.waitForSelector('li.swipe');

  // 1. Offene Aufgabe: Titel ändern, dann "Erledigt"
  await page.locator('li.swipe', { hasText: 'Brot' }).locator('.item-title').click();
  await page.waitForSelector('.sheet');
  assert.equal(await page.locator('.sheet button[aria-label="Wieder öffnen"]').count(), 0);
  // Haken oben links neben Speichern, nicht unten bei den anderen Knöpfen
  assert.equal(await page.locator('.sheet-head-buttons button[aria-label="Erledigt"] + button[type=submit]').count(), 1);
  assert.equal(await page.locator('.sheet-actions button[aria-label="Erledigt"]').count(), 0);
  await page.locator('.sheet input[name=title]').fill('Brot vom Bäcker');
  const n0 = (await calls()).length;
  await page.locator('.sheet button[aria-label="Erledigt"]').click();
  await page.waitForSelector('.sheet-root', { state: 'detached' });
  await page.waitForFunction(() => /Erledigt: Brot vom Bäcker/.test(document.querySelector('.snackbar')?.textContent ?? ''));
  await page.waitForFunction(async (n) => (await (await fetch('/__mock/calls')).json()).length >= n + 2, n0);
  const sent = (await calls()).slice(n0).map((c) => [c.service, c.data.rename ?? null, c.data.status ?? null]);
  assert.deepEqual(sent.slice(0, 2), [['update_item', 'Brot vom Bäcker', null], ['update_item', null, 'completed']]);
  const brot = (await getJson('/__mock/items?entity=todo.einkaufsliste')).find((i) => i.uid === 'u1');
  assert.deepEqual([brot.summary, brot.status], ['Brot vom Bäcker', 'completed']);
  ok('Erledigt im Dialog: erst Änderung gespeichert, dann abgehakt');

  // 2. Erledigte Aufgabe: "Wieder öffnen" statt "Erledigt"
  await page.locator('.done-section, .done-toggle, button', { hasText: /Erledigt \(/ }).first().click();
  await page.locator('li.swipe', { hasText: 'Brot vom Bäcker' }).locator('.item-title').click();
  await page.waitForSelector('.sheet');
  assert.equal(await page.locator('.sheet button[aria-label="Erledigt"]').count(), 0);
  assert.equal(await page.locator('.sheet button[aria-label="Wieder öffnen"]').count(), 1);
  ok('Erledigte Aufgabe: Knopf Wieder öffnen statt Erledigt');

  assert.deepEqual(errors, []);
  await browser.close();
})().catch((e) => {
  console.log('FEHLER', e);
  process.exit(1);
});
