const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = 'http://localhost:8123';
const APP = `${BASE}/local/merker/index.html`;
const getJson = async (p) => (await fetch(`${BASE}${p}`)).json();
const serverItem = async (summary) => (await getJson('/__mock/items?entity=todo.einkaufsliste')).find((i) => i.summary === summary);
const ok = (n) => console.log('OK  ', n);
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ locale: 'de-DE', viewport: { width: 412, height: 860 }, hasTouch: true })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await fetch(`${BASE}/__mock/add-item?entity=todo.einkaufsliste&summary=${encodeURIComponent('Umzug')}&desc=${encodeURIComponent('Kartons holen\n- [ ] Küche\n- [x] Bad\n- [ ] Keller')}`, { method: 'POST' });
  await page.goto(APP);
  await page.waitForSelector('.list-tile');
  await page.locator('.list-tile', { hasText: 'Einkaufsliste' }).click();
  const row = page.locator('li.swipe', { hasText: 'Umzug' });
  await row.waitFor();
  assert.equal((await row.locator('.sub-progress').innerText()).trim(), '1/3');
  const desc = await row.locator('.item-desc').innerText();
  assert.ok(desc.includes('Kartons holen') && !desc.includes('[ ]'), desc);
  ok('Karte zeigt Fortschritt 1/3 und nur den normalen Beschreibungstext');

  await row.click();
  await page.waitForSelector('.sheet');
  assert.equal(await page.locator('.check-row').count(), 3);
  assert.equal(await page.locator('.check-row.is-checked').count(), 1);
  await page.locator('.check-row', { hasText: 'Küche' }).click();
  for (let i = 0; i < 40 && !(await serverItem('Umzug')).description.includes('[x] Küche'); i++) await page.waitForTimeout(100);
  assert.equal((await serverItem('Umzug')).description, 'Kartons holen\n- [x] Küche\n- [x] Bad\n- [ ] Keller');
  assert.equal(await page.locator('.check-row.is-checked').count(), 2);
  ok('Antippen eines Kästchens speichert sofort in Home Assistant');

  await page.locator('.check-add-input').fill('Garage');
  await page.locator('.check-add-input').press('Enter');
  for (let i = 0; i < 40 && !(await serverItem('Umzug')).description.includes('Garage'); i++) await page.waitForTimeout(100);
  assert.equal((await serverItem('Umzug')).description, 'Kartons holen\n- [x] Küche\n- [x] Bad\n- [ ] Keller\n- [ ] Garage');
  assert.equal(await page.locator('.sheet').count(), 1);
  assert.equal(await page.locator('.check-row').count(), 4);
  ok('Unteraufgabe hinzufügen mit Enter, Dialog bleibt offen');

  await page.locator('.sheet button[type=submit]').click();
  await page.waitForFunction(() => !document.querySelector('.sheet'));
  assert.equal((await row.locator('.sub-progress').innerText()).trim(), '2/4');
  ok('Nach dem Schließen zeigt die Karte 2/4');

  // Fehler: Zurücksetzen
  await row.click();
  await page.waitForSelector('.sheet');
  await fetch(`${BASE}/__mock/fail-next`, { method: 'POST' });
  await page.locator('.check-row', { hasText: 'Keller' }).click();
  await page.waitForSelector('.snackbar:not([hidden])');
  assert.equal(await page.locator('.check-row.is-checked').count(), 2);
  ok('Fehler beim Speichern: Kästchen springt zurück');

  // Bearbeiten
  const sub = (name) => page.locator('.sub-swipe', { hasText: name });
  await sub('Garage').locator('.sub-edit').click();
  await page.locator('.sub-edit-input').fill('Garage ausräumen');
  await page.locator('.sub-edit-input').press('Enter');
  for (let i = 0; i < 40 && !(await serverItem('Umzug')).description.includes('ausräumen'); i++) await page.waitForTimeout(100);
  assert.equal((await serverItem('Umzug')).description, 'Kartons holen\n- [x] Küche\n- [x] Bad\n- [ ] Keller\n- [ ] Garage ausräumen');
  assert.equal(await page.locator('.sheet').count(), 1);
  // Escape verwirft, Dialog bleibt
  await sub('Bad').locator('.sub-edit').click();
  await page.locator('.sub-edit-input').fill('Nichts');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.sheet').count(), 1);
  assert.equal(await page.locator('.sub-edit-input').count(), 0);
  assert.equal(await page.locator('.check-row', { hasText: 'Bad' }).count(), 1);
  assert.ok((await serverItem('Umzug')).description.includes('[x] Bad'));
  // Verlassen speichert, Kästchen bleibt erledigt
  await sub('Bad').locator('.sub-edit').click();
  await page.locator('.sub-edit-input').fill('Badezimmer');
  await page.locator('.sheet .field-label', { hasText: 'Unteraufgaben' }).click();
  for (let i = 0; i < 40 && !(await serverItem('Umzug')).description.includes('Badezimmer'); i++) await page.waitForTimeout(100);
  assert.ok((await serverItem('Umzug')).description.includes('- [x] Badezimmer'));
  ok('Unteraufgabe bearbeiten: Enter speichert, Escape verwirft, Verlassen speichert, Kästchen bleibt');

  assert.deepEqual(errors, []);
  await browser.close();
})().catch((e) => { console.log('FEHLER:', e); process.exit(1); });
