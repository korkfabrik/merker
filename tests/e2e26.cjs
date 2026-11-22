const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = 'http://localhost:8123';
const APP = `${BASE}/local/merker/index.html`;
const ok = (n) => console.log('OK  ', n);
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ locale: 'en-US', viewport: { width: 390, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(APP);
  await page.waitForSelector('.list-tile');

  // A. Englisch nach Gerätesprache
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
  const labels = await page.locator('.filter-chip').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label').split(':')[0]));
  assert.deepEqual(labels, ['Important', 'Overdue', 'This week']);
  assert.match(await page.locator('.open-total').innerText(), /^\d+ open$/);
  assert.match(await page.locator('.section-title').first().textContent(), /^Due \(\d+\)$/);
  assert.match(await page.locator('#content').innerText(), /Yesterday/);
  assert.match(await page.locator('#content').innerText(), /LISTS|Lists/);
  assert.equal(await page.locator('#fab').getAttribute('aria-label'), 'New task');
  ok('Gerät auf Englisch: Startseite auf Englisch');

  // B. Liste, Sortierung, Mehrzahl
  await page.locator('.list-tile', { hasText: 'Einkaufsliste' }).click();
  await page.waitForSelector('li.swipe');
  assert.match(await page.locator('.sort-mode').innerText(), /Sort: Default/);
  assert.match(await page.locator('.done-title').innerText(), /^Done \(1\)$/);
  await page.locator('.done-section summary').click();
  await page.locator('.done-clear').click();
  await page.waitForFunction(() => /1 completed task deleted/.test(document.querySelector('.snackbar').textContent), null, { timeout: 8000 });
  assert.equal(await page.locator('.snackbar-action').innerText(), 'Undo');
  ok('Listenansicht und Einzahl der Meldung auf Englisch');

  // C. Bearbeiten und neue Aufgabe
  await page.locator('li.swipe', { hasText: 'Milch' }).click();
  await page.waitForSelector('.sheet-head-edit');
  assert.equal(await page.locator('.sheet-head-edit button[type=submit]').innerText(), 'Save');
  assert.deepEqual(await page.locator('.sheet .quick-chip').allInnerTexts(), ['None', 'Today', 'Tomorrow', '1 week', '2 weeks', '3 weeks', '1 month', '2 months', '3 months', '1 year', '2 years', '3 years']);
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet-root', { state: 'detached' });
  ok('Bearbeiten-Dialog auf Englisch');

  // D. Sprache in den Einstellungen wählen
  await page.goto(APP + '#/einstellungen');
  await page.waitForSelector('.menu-row');
  assert.deepEqual(await page.locator('.menu-title').allInnerTexts(), ['Lists', 'Appearance', 'Controls', 'Language', 'Clear cache', 'Log out']);
  assert.match((await page.locator('.menu-summary').allInnerTexts())[3], /Automatic \(English\)/);
  await page.locator('.menu-row', { hasText: 'Language' }).click();
  assert.deepEqual(await page.locator('.choice-row').allInnerTexts(), ['Automatic (English)', 'Deutsch', 'English']);
  await Promise.all([page.waitForEvent('load'), page.locator('.choice-row', { hasText: 'Deutsch' }).click()]);
  await page.waitForSelector('.choice-row');
  assert.equal(await page.locator('#view-title').innerText(), 'Sprache');
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'de');
  assert.equal(await page.locator('.choice-row[aria-checked=true]').innerText(), 'Deutsch');
  ok('Deutsch gewählt: App lädt neu und spricht Deutsch');
  await Promise.all([page.waitForEvent('load'), page.locator('.choice-row', { hasText: 'Automatisch' }).click()]);
  await page.waitForSelector('.choice-row');
  assert.equal(await page.locator('#view-title').innerText(), 'Language');
  ok('Zurück auf Automatisch: wieder Englisch');
  await ctx.close();

  // E. Nicht unterstützte Gerätesprache: Englisch
  const fr = await browser.newContext({ locale: 'fr-FR', viewport: { width: 390, height: 800 } });
  const p2 = await fr.newPage();
  p2.on('pageerror', (e) => errors.push(e.message));
  await p2.goto(APP);
  await p2.waitForSelector('.list-tile');
  assert.equal(await p2.evaluate(() => document.documentElement.lang), 'en');
  assert.match(await p2.locator('.open-total').innerText(), /open$/);
  ok('Französisches Gerät: Englisch');
  await fr.close();

  assert.deepEqual(errors, []);
  await browser.close();
})().catch((e) => { console.log('FEHLER:', e); process.exit(1); });
