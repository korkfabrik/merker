const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = 'http://localhost:8123';
const APP = `${BASE}/local/merker/index.html`;
const getJson = async (p) => (await fetch(`${BASE}${p}`)).json();
const ok = (n) => console.log('OK  ', n);
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ locale: 'de-DE', viewport: { width: 360, height: 800 }, hasTouch: true, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(APP);
  await page.waitForSelector('.list-tile');

  // A. Zähler und Filter in einer Zeile, Reihenfolge Wichtig, Überfällig, Diese Woche, Offen
  const chips = await page.locator('.filter-chip').evaluateAll((els) => els.map((e) => ({ label: e.getAttribute('aria-label'), top: Math.round(e.getBoundingClientRect().top) })));
  assert.equal(chips.length, 3);
  assert.equal(new Set(chips.map((c) => c.top)).size, 1);
  assert.match(chips[0].label, /^Wichtig: \d+$/);
  assert.equal(await page.locator('.filter-chip').first().innerText().then((t) => t.replace(/\s/g, '')), '❗' + chips[0].label.split(': ')[1]);
  assert.equal(await page.locator('.summary').count(), 0);
  ok('Eine Filterzeile mit Zählern, keine eigene Zusammenfassung mehr');
  assert.match(await page.locator('.open-total').innerText(), /^\d+ offen$/);
  assert.equal(await page.locator('.open-total').evaluate((e) => getComputedStyle(e).pointerEvents), 'none');
  const rt = await page.locator('.open-total').boundingBox();
  assert.ok(rt.x + rt.width > (await page.evaluate(() => innerWidth)) - 24, JSON.stringify(rt));
  ok('Offen-Anzeige rechtsbündig in derselben Zeile, nicht anklickbar');

  // B. Anheften: Stecknadel auf der Kachel
  await page.locator('#btn-settings').click();
  if (!/einstellungen\/listen/.test(page.url())) { await page.waitForSelector('.menu-row'); await page.locator('.menu-row', { hasText: /^(Listen|Lists)/ }).first().click(); } await page.waitForSelector('.set-row');
  await page.locator('.set-row', { hasText: 'Haushalt' }).click();
  await page.locator('label.set-switch', { hasText: 'Anheften' }).locator('input').check();
  await page.goto(APP);
  await page.waitForSelector('.list-tile');
  assert.equal(await page.locator('.tile-pin').count(), 1);
  assert.match(await page.locator('.list-tile').first().innerText(), /Haushalt/);
  assert.equal(await page.locator('.list-tile', { hasText: 'Haushalt' }).locator('.tile-pin').count(), 1);
  ok('Angeheftete Liste hat eine Stecknadel und steht zuerst');

  // C. Einzelne Aufgabe teilen
  await page.locator('.list-tile', { hasText: 'Einkaufsliste' }).click();
  await page.locator('li.swipe', { hasText: 'Milch' }).click();
  await page.waitForSelector('.sheet');
  await page.locator('.sheet button[aria-label=Teilen]').click();
  await page.waitForSelector('.snackbar:not([hidden])');
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(clip.startsWith('Milch\nFällig: '));
  assert.ok(clip.includes('Fettarm, 1 Liter'));
  ok('Aufgabe teilen: Titel, Fälligkeit und Beschreibung als Text');
  await page.goBack();
  await page.waitForFunction(() => !document.querySelector('.sheet'));

  // D. Liste deaktivieren: nicht geladen, nicht in Fällig, nicht in der Suche, nicht als Kachel
  await page.goto(APP);
  await page.waitForSelector('.list-tile');
  const dueBefore = await page.locator('.due-list .item-title').allInnerTexts();
  assert.ok(dueBefore.includes('Milch'));
  await page.locator('#btn-settings').click();
  if (!/einstellungen\/listen/.test(page.url())) { await page.waitForSelector('.menu-row'); await page.locator('.menu-row', { hasText: /^(Listen|Lists)/ }).first().click(); } await page.waitForSelector('.set-row');
  await page.locator('.set-row', { hasText: 'Einkaufsliste' }).click();
  await page.locator('label.set-switch', { hasText: 'Deaktivieren' }).locator('input').check();
  await page.locator('#btn-back').click();
  await page.locator('#btn-back').click();
  await page.locator('#btn-back').click();
  await page.waitForSelector('.list-tile');
  assert.equal(await page.locator('.list-tile', { hasText: 'Einkaufsliste' }).count(), 0);
  assert.ok(!(await page.locator('.due-list .item-title').allInnerTexts()).includes('Milch'));
  await page.locator('#btn-search').click();
  await page.locator('#top-slot input').fill('milch');
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#content .item-title').count(), 0);
  ok('Deaktivierte Liste: keine Kachel, nichts bei Fällig, nicht suchbar');
  // Einstellungen zeigen sie weiter, wieder einschalten klappt
  await page.goto(APP);
  await page.waitForSelector('.list-tile');
  await page.locator('#btn-settings').click();
  if (!/einstellungen\/listen/.test(page.url())) { await page.waitForSelector('.menu-row'); await page.locator('.menu-row', { hasText: /^(Listen|Lists)/ }).first().click(); } await page.waitForSelector('.set-row');
  assert.match(await page.locator('.home-row', { hasText: 'Einkaufsliste' }).locator('.set-hint').innerText(), /Deaktiviert/);
  if (!/einstellungen\/listen/.test(page.url())) { await page.waitForSelector('.menu-row'); await page.locator('.menu-row', { hasText: /^(Listen|Lists)/ }).first().click(); } await page.waitForSelector('.set-row');
  await page.locator('.set-row', { hasText: 'Einkaufsliste' }).click();
  const sw = page.locator('label.set-switch', { hasText: 'Deaktivieren' }).locator('input');
  assert.equal(await sw.isChecked(), true);
  await sw.uncheck();
  await page.locator('#btn-back').click();
  await page.locator('#btn-back').click();
  await page.locator('#btn-back').click();
  await page.waitForSelector('.list-tile');
  await page.waitForFunction(() => [...document.querySelectorAll('.due-list .item-title')].some((e) => e.textContent === 'Milch'), null, { timeout: 8000 });
  assert.equal(await page.locator('.list-tile', { hasText: 'Einkaufsliste' }).count(), 1);
  ok('Wieder aktivieren lädt die Liste neu');

  assert.deepEqual(errors, []);
  await browser.close();
})().catch((e) => { console.log('FEHLER:', e); process.exit(1); });
