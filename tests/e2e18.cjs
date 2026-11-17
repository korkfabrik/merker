const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const APP = 'http://localhost:8123/local/merker/index.html';
const ok = (n) => console.log('OK  ', n);
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ locale: 'de-DE', viewport: { width: 412, height: 860 }, hasTouch: true })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(APP);
  await page.waitForSelector('.list-tile');
  await page.locator('#btn-settings').click();
  await page.waitForSelector('.menu-row');

  // Übersicht
  const status = await page.locator('.settings-status').innerText();
  assert.match(status, /Status\s+Verbunden/);
  assert.match(status, /Home Assistant\s+http:\/\/localhost:8123/);
  assert.match(status, /App-Version\s+\d+\.\d+\.\d+/);
  const titles = await page.locator('.menu-title').allInnerTexts();
  assert.deepEqual(titles, ['Listen', 'Darstellung', 'Bedienung', 'Sprache', 'Cache leeren', 'Abmelden']);
  assert.equal(await page.locator('.menu-row', { hasText: 'Cache leeren' }).locator('.menu-chevron').count(), 0);
  const summaries = await page.locator('.menu-summary').allInnerTexts();
  assert.match(summaries[0], /^2 Listen$/);
  assert.match(summaries[1], /Merker · Standard · Gerät/);
  assert.match(summaries[2], /Wischen links: Verschieben/);
  assert.match(summaries[3], /Automatisch \(Deutsch\)/);
  const chev = await page.locator('.menu-chevron svg').first().boundingBox();
  assert.ok(chev.width >= 24 && chev.height >= 24, 'Pfeil gut sichtbar');
  const rowH = await page.locator('.menu-row').first().boundingBox();
  assert.ok(rowH.height >= 64);
  ok('Übersicht: Verbindung mit allen Angaben oben, große Zeilen mit Stand und Pfeil, Cache leeren über Abmelden');

  // Listen-Seite und Seite einer Liste
  await page.locator('.menu-row', { hasText: 'Listen' }).click();
  await page.waitForSelector('.set-row');
  assert.match(page.url(), /#\/einstellungen\/listen$/);
  assert.equal(await page.locator('#view-title').innerText(), 'Listen');
  await page.locator('.set-row', { hasText: 'Einkaufsliste' }).click();
  await page.waitForSelector('.set-switch');
  assert.match(page.url(), /#\/einstellungen\/todo\.einkaufsliste$/);
  for (const t of ['Farbe', 'Sortierung', 'Startseite', 'Funktionen']) assert.equal(await page.locator('.static-title', { hasText: t }).count(), 1, t);
  await page.locator('.swatch-custom').first().click();
  await page.locator('.hex-input').first().fill('#00aa44');
  const hues = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('merker.listHues'))));
  assert.ok(hues[0] > 130 && hues[0] < 150, String(hues));
  await page.locator('#btn-back').click();
  await page.waitForSelector('.set-row');
  assert.match(page.url(), /#\/einstellungen\/listen$/);
  await page.locator('#btn-back').click();
  await page.waitForSelector('.menu-row');
  ok('Listen-Seite, Seite einer Liste mit eigener Farbe, Zurück jeweils eine Ebene');

  // Darstellung: Name, Akzentfarbe, Erscheinungsbild, kompakt
  await page.locator('.menu-row', { hasText: 'Darstellung' }).click();
  await page.waitForSelector('.app-name-field');
  await page.locator('.app-name-field input').fill('Familie');
  await page.locator('.app-name-field input').press('Enter');
  await page.locator('.app-name-field input').evaluate((e) => e.blur());
  await page.locator('.accent-choices .swatch-custom').click();
  await page.locator('.accent-choices .hue-slider').evaluate((el) => { el.value = '330'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.equal(await page.evaluate(() => localStorage.getItem('merker.accent')), '330');
  assert.deepEqual(await page.locator('.seg-bar[aria-label=Erscheinungsbild] .seg-btn').allInnerTexts(), ['Gerät', 'Hell', 'Dunkel']);
  assert.equal(await page.locator('label.set-switch', { hasText: 'Kompakte Ansicht' }).count(), 1);
  await page.locator('#btn-back').click();
  await page.waitForSelector('.menu-row');
  assert.match((await page.locator('.menu-summary').allInnerTexts())[1], /^Familie · Eigene Farbe · Gerät/);
  await page.goto(APP);
  await page.waitForSelector('.list-tile');
  assert.equal(await page.locator('#view-title').innerText(), 'Familie');
  assert.equal(await page.title(), 'Familie');
  assert.ok(await page.evaluate(() => !!document.getElementById('accent-style')));
  ok('Darstellung: eigener App-Name oben und im Titel, eigene Akzentfarbe bleibt');

  // Bedienung, Sprache, App
  await page.locator('#btn-settings').click();
  await page.locator('.menu-row', { hasText: 'Bedienung' }).click();
  assert.deepEqual(await page.locator('.seg-bar[aria-label="Wischen nach links"] .seg-btn').allInnerTexts(), ['Verschieben', 'Löschen', 'Datum']);
  assert.equal(await page.locator('label.set-switch', { hasText: 'Erledigte nach unten' }).count(), 1);
  await page.locator('#btn-back').click();
  await page.locator('.menu-row', { hasText: 'Sprache' }).click();
  assert.deepEqual(await page.locator('.choice-row').allInnerTexts(), ['Automatisch (Deutsch)', 'Deutsch', 'English']);
  assert.equal(await page.locator('.choice-row[aria-checked=true]').innerText(), 'Automatisch (Deutsch)');
  assert.equal(await page.locator('select').count(), 0);
  ok('Bedienung und Sprache als eigene Seiten, Sprache als Liste ohne Auswahlfeld');
  await page.locator('#btn-back').click();
  await page.waitForSelector('.menu-row');
  // Fremder Cache und fremder Service Worker (wie HA-Frontend) unter derselben Adresse
  await page.evaluate(async () => {
    await (await caches.open('ha-frontend-test')).put('/x', new Response('x'));
    await navigator.serviceWorker.register('sw.js', { scope: './fremd/' });
  });
  await Promise.all([page.waitForEvent('load'), page.locator('.menu-row', { hasText: 'Cache leeren' }).click()]);
  await page.waitForSelector('.list-tile, .menu-row', { timeout: 20000 });
  const after = await page.evaluate(async () => ({ keys: await caches.keys(), scopes: (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope) }));
  assert.ok(after.keys.includes('ha-frontend-test'), 'fremder Cache bleibt');
  assert.ok(after.keys.some((k) => k.startsWith('merker-')), 'eigener Cache neu');
  assert.ok(after.scopes.some((s) => s.endsWith('/fremd/')), 'fremder Service Worker bleibt');
  ok('Cache leeren lädt ohne Rückfrage neu und lässt fremde Caches und Service Worker stehen');

  assert.deepEqual(errors, []);
  ok('Keine Seitenfehler');
  await browser.close();
})().catch((e) => { console.log('FEHLER:', e); process.exit(1); });
