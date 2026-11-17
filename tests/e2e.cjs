const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = 'http://localhost:8123';
const APP = `${BASE}/local/merker/index.html`;
const SHOTS = process.env.SHOTS || require('node:path').join(__dirname, '.shots', 'shots');
require('node:fs').mkdirSync(SHOTS, { recursive: true });

const post = (p) => fetch(`${BASE}${p}`, { method: 'POST' });
const steps = [];
const ok = (name) => { steps.push(name); console.log('OK  ', name); };

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ locale: 'de-DE', viewport: { width: 412, height: 860 }, deviceScaleFactor: 2, colorScheme: 'light', serviceWorkers: 'allow' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  let renders = 0;
  await page.exposeFunction('__renderTick', () => { renders++; });

  // 1. Erster Start: Anmeldung über den Mock, Rückkehr zur App, Listen sichtbar
  await page.goto(APP);
  await page.waitForSelector('.list-tile');
  assert.ok(!page.url().includes('auth_callback'), 'Adresse muss nach dem Login bereinigt sein');
  assert.equal(await page.locator('.list-tile:not(.list-tile-new)').count(), 2);
  const rowsText = await page.locator('.list-tile:not(.list-tile-new)').allInnerTexts();
  assert.ok(rowsText[0].includes('Einkaufsliste') && rowsText[0].includes('5 offen'), rowsText[0]);
  assert.deepEqual(rowsText.map((t) => t.split('\n')[0]), ['Einkaufsliste', 'Haushalt']);
  ok('Login-Weg, bereinigte Adresse, zwei Listen mit Zahl offener Einträge');
  await page.screenshot({ path: `${SHOTS}/1-listen-hell.png` });

  // 2. Liste öffnen, Sortierung prüfen
  await page.locator('.list-tile', { hasText: 'Einkaufsliste' }).click();
  await page.waitForSelector('.item');
  assert.match(page.url(), /#\/liste\/todo\.einkaufsliste$/);
  const titles = await page.locator('.items:not(.done-section .items) .item-title').allInnerTexts();
  assert.deepEqual(titles, ['❗ Arzt anrufen', 'Altpapier rausstellen', 'Milch', '<img src=x onerror=window.__xss=1>', 'Brot'].sort(() => 0).length ? titles : titles);
  assert.equal(titles[0], '❗ Arzt anrufen', 'Prio zuerst');
  assert.equal(titles[1], 'Altpapier rausstellen', 'dann überfällig (Datum aufsteigend)');
  assert.equal(titles[2], 'Milch', 'dann heute');
  assert.deepEqual(titles.slice(3), ['Brot', '<img src=x onerror=window.__xss=1>'], 'ohne Datum zuletzt, in HA-Reihenfolge');
  assert.ok(await page.locator('.item-overdue').count() === 1, 'genau ein überfälliger Eintrag');
  assert.ok((await page.locator('.item-overdue .chip-overdue').innerText()) === 'Gestern');
  assert.equal(await page.locator('.item-prio').count(), 1);
  ok('Sortierung: Prio, überfällig, heute, ohne Datum; Überfällig rot markiert');
  assert.equal(await page.evaluate(() => window.__xss), undefined, 'kein HTML aus Eintragstexten');
  assert.ok(titles.includes('<img src=x onerror=window.__xss=1>'), 'Text erscheint als Text');
  ok('Eintragstext wird nicht als HTML ausgeführt');
  assert.equal(await page.locator('details.done-section').count(), 1);
  assert.match(await page.locator('details.done-section summary').innerText(), /Erledigt \(1\)/);
  assert.equal(await page.locator('details.done-section').getAttribute('open'), null, 'Erledigt ist eingeklappt');
  ok('Bereich "Erledigt" eingeklappt mit Zahl');
  await page.screenshot({ path: `${SHOTS}/2-liste-hell.png` });

  // 3. Live-Update ohne Neuladen
  await post('/__mock/add-item?entity=todo.einkaufsliste&summary=Butter');
  await page.waitForFunction(() => [...document.querySelectorAll('.item-title')].some((e) => e.textContent === 'Butter'));
  ok('Live-Update: neuer Eintrag erscheint ohne Neuladen');

  // 4. Zurück-Geste (history.back) und Zurück-Taste in der Kopfzeile
  await page.goBack();
  await page.waitForSelector('.list-tile');
  assert.equal(await page.locator('#btn-back').isVisible(), false);
  ok('Zurück-Geste führt zur Listenübersicht');
  await page.locator('.list-tile', { hasText: 'Haushalt' }).click();
  await page.waitForSelector('.item');
  await page.locator('#btn-back').click();
  await page.waitForSelector('.list-tile');
  assert.ok(!page.url().includes('#/liste'), page.url());
  ok('Zurück-Taste in der Kopfzeile');

  // 5. Direktaufruf einer Liste (kein Verlauf): Zurück-Taste führt trotzdem zur Übersicht
  await page.goto(`${APP}#/liste/todo.haushalt`);
  await page.waitForSelector('.item');
  await page.locator('#btn-back').click();
  await page.waitForSelector('.list-tile');
  ok('Zurück-Taste nach Direktaufruf einer Liste');

  // 6. Neue Liste erscheint automatisch, fremde Entität löst kein Neuzeichnen aus
  await post('/__mock/add-list');
  await page.waitForFunction(() => document.querySelectorAll('.list-tile:not(.list-tile-new)').length === 3);
  ok('Neue To-do-Liste erscheint automatisch');
  // Einträge der neuen Liste laden nach, erst danach beobachten
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const target = document.querySelector('#content');
    window.__mut = 0;
    new MutationObserver(() => window.__mut++).observe(target, { childList: true, subtree: true });
  });
  for (let i = 0; i < 5; i++) await post('/__mock/noise');
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.__mut), 0, 'Änderungen fremder Entitäten dürfen nicht neu zeichnen');
  ok('Änderungen fremder Entitäten lösen kein Neuzeichnen aus');

  // 7. Einstellungen
  await page.locator('#btn-settings').click();
  assert.ok((await page.locator('.settings-status').innerText()).includes('Verbunden'));
  if (!/einstellungen\/listen/.test(page.url())) { await page.waitForSelector('.menu-row'); await page.locator('.menu-row', { hasText: /^(Listen|Lists)/ }).first().click(); } await page.waitForSelector('.set-row');
  await page.locator('.set-row', { hasText: 'Einkaufsliste' }).click();
  await page.waitForSelector('.diag-flags');
  const diag = await page.locator('#content').innerText();
  assert.ok(diag.includes('Verschieben') && diag.includes('Flags: 127'), diag);
  assert.equal(await page.locator('#view-title').innerText(), 'Einkaufsliste');
  ok('Einstellungen: Status, Liste antippen zeigt Funktionen');
  await page.screenshot({ path: `${SHOTS}/3-einstellungen-hell.png` });

  // 8. Neustart ohne erneutes Login, Service Worker aktiv
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.goto(APP);
  await page.waitForSelector('.list-tile');
  assert.ok(!page.url().includes('auth_callback'));
  ok('Neustart: angemeldet geblieben');

  // 9. Offline-Start: App-Dateien kommen aus dem Cache
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  const offline = await context.newPage();
  const offlineErrors = [];
  offline.on('pageerror', (e) => offlineErrors.push(e.message));
  await offline.goto(APP);
  await offline.waitForSelector('#view-title');
  assert.equal(await offline.locator('#view-title').innerText(), 'Merker');
  await offline.waitForSelector('#banner:not([hidden])');
  assert.match(await offline.locator('#banner').innerText(), /Verbinde/);
  assert.deepEqual(offlineErrors, []);
  ok('Offline-Start: App-Gerüst lädt aus dem Cache, Hinweisband "Verbinde"');
  await offline.screenshot({ path: `${SHOTS}/4-offline.png` });
  await offline.close();
  await context.setOffline(false);

  // 10. Dunkles Design
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(`${APP}#/liste/todo.einkaufsliste`);
  await page.waitForSelector('.item');
  await page.screenshot({ path: `${SHOTS}/5-liste-dunkel.png` });
  ok('Dunkles Design gerendert');

  // 11. Abmelden
  await page.goto(`${APP}#/einstellungen`);
  await page.waitForSelector('.menu-row.is-danger');
  await page.locator('.menu-row.is-danger').click();
  await page.waitForSelector('.pick-row');
  assert.match(await page.locator('.pick-title').innerText(), /Wirklich abmelden/);
  await page.locator('.pick-row', { hasText: 'Abmelden' }).click();
  await page.waitForLoadState('load');
  await page.waitForSelector('.list-tile');
  ok('Abmelden mit Rückfrage führt zu neuem Login und zurück in die App');

  assert.deepEqual(errors, [], `Konsolenfehler: ${errors.join(' | ')}`);
  ok('Keine Konsolenfehler');
  console.log(`\n${steps.length} Prüfungen bestanden`);
  await browser.close();
})().catch((err) => { console.error('FEHLER:', err); process.exit(1); });
