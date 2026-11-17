const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = 'http://localhost:8123';
const APP = `${BASE}/local/merker/index.html`;
const calls = async () => (await fetch(`${BASE}/__mock/calls`)).json();
const ok = (n) => console.log('OK  ', n);
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ locale: 'de-DE', viewport: { width: 390, height: 860 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const waitCall = async (n, service) => {
    for (let i = 0; i < 60; i++) {
      const found = (await calls()).slice(n).filter((c) => c.service === service);
      if (found.length) return found;
      await page.waitForTimeout(100);
    }
    throw new Error(`kein ${service}`);
  };
  await page.goto(APP);
  await page.waitForSelector('.list-tile');

  // Neue Aufgabe: Unteraufgaben erst nach Tipp sichtbar
  await page.locator('#fab').click();
  await page.waitForSelector('.sheet input[name=title]');
  assert.equal(await page.locator('.sub-field').isHidden(), true);
  await page.locator('.sheet .label-btn', { hasText: 'Unteraufgabe' }).click();
  assert.equal(await page.locator('.sub-field').isVisible(), true);
  assert.equal(await page.locator('.sheet .label-btn', { hasText: 'Unteraufgabe' }).isHidden(), true);
  await page.locator('.sub-field .check-add-input').fill('Farbe kaufen');
  await page.locator('.sub-field .check-add-input').press('Enter');
  await page.locator('.sub-field .check-add-input').fill('Abkleben');
  await page.locator('.sub-field .check-add-input').press('Enter');
  await page.locator('.sub-field .check-add-input').fill('Streichen');
  await page.locator('.new-sub', { hasText: 'Abkleben' }).locator('button').click();
  assert.deepEqual(await page.locator('.new-sub-text').allInnerTexts(), ['Farbe kaufen']);
  await page.locator('.sheet input[name=title]').fill('Zimmer streichen');
  await page.locator('.sheet textarea').fill('Wohnzimmer');
  const n = (await calls()).length;
  await page.locator('.sheet button[type=submit]').click();
  const c = (await waitCall(n, 'add_item'))[0];
  assert.deepEqual([c.data.item, c.data.description], ['Zimmer streichen', 'Wohnzimmer\n- [ ] Farbe kaufen\n- [ ] Streichen']);
  ok('Neue Aufgabe: Unteraufgaben per Knopf, Enter fügt hinzu, × entfernt, offene Eingabe wird mitgenommen');

  // Bearbeiten ohne Unteraufgaben: Bereich zu, Knopf öffnet ihn
  await page.waitForSelector('.sheet-root', { state: 'detached' });
  await page.goto(`${APP}#/liste/todo.einkaufsliste`);
  await page.waitForSelector('li.swipe');
  await page.locator('li.swipe', { hasText: 'Milch' }).click();
  await page.waitForSelector('.sheet-head-edit');
  assert.equal(await page.locator('.checklist-box').isHidden(), true);
  await page.locator('.sheet .label-btn', { hasText: 'Unteraufgabe' }).click();
  assert.equal(await page.locator('.checklist-box').isVisible(), true);
  assert.ok(await page.locator('.check-add-input').evaluate((e) => e === document.activeElement));
  const n2 = (await calls()).length;
  await page.locator('.check-add-input').fill('Laktosefrei');
  await page.locator('.check-add-input').press('Enter');
  const c2 = (await waitCall(n2, 'update_item'))[0];
  assert.equal(c2.data.description, 'Fettarm, 1 Liter\n- [ ] Laktosefrei');
  ok('Bearbeiten: Unteraufgaben-Bereich erst nach Tipp, dann wie gewohnt');

  // Mit Unteraufgaben ist der Bereich gleich offen
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet-root', { state: 'detached' });
  await page.waitForTimeout(300);
  await page.locator('li.swipe', { hasText: 'Milch' }).click();
  await page.waitForSelector('.checklist-box .check-row');
  assert.equal(await page.locator('.sheet .label-btn', { hasText: 'Unteraufgabe' }).isHidden(), true);
  ok('Mit vorhandenen Unteraufgaben ist der Bereich sofort sichtbar');
  assert.deepEqual(errors, []);
  await browser.close();
})().catch((e) => { console.log('FEHLER:', e); process.exit(1); });
