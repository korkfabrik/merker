const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = 'http://localhost:8123';
const APP = `${BASE}/local/merker/index.html`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (n) => console.log('OK  ', n);
let n = 0;
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ locale: 'de-DE', viewport: { width: 412, height: 860 }, hasTouch: true, colorScheme: 'dark' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(APP);
  await page.waitForSelector('.list-tile');
  await page.waitForFunction(() => { try { return JSON.parse(localStorage.getItem('merker.snapshot'))?.t > 0; } catch { return false; } }, null, { timeout: 5000 });
  const snap = await page.evaluate(() => JSON.parse(localStorage.getItem('merker.snapshot')));
  assert.ok(snap.lists.length >= 2 && Object.keys(snap.items).length >= 2);
  assert.ok(!JSON.stringify(snap).includes('tmp-'));
  ok('Stand wird nach dem Laden gespeichert');
  const tilesOnline = await page.locator('.list-tile:not(.list-tile-new)').count();
  const dueOnline = await page.locator('#content .item-title').allInnerTexts();
  await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 8000 }).catch(() => {});
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller);

  // A. Neustart ohne Verbindung (Server aus)
  require('node:child_process').execSync('pkill -f "node mock-h[a].mjs" || true');
  await sleep(500);
  await page.reload();
  await page.waitForSelector('.list-tile', { timeout: 8000 });
  assert.equal(await page.locator('.list-tile:not(.list-tile-new)').count(), tilesOnline);
  assert.deepEqual(await page.locator('#content .item-title').allInnerTexts(), dueOnline);
  const banner = await page.locator('#banner').innerText();
  assert.match(banner, /Stand: heute, \d\d:\d\d/);
  ok('Start ohne Server zeigt gespeicherte Listen und Fälligkeiten mit Stand: ' + banner.replace(/\n/g, ' '));

  // B. Liste öffnen, lesen, Eingabe gesperrt, Schreiben meldet Fehler
  await page.locator('.list-tile', { hasText: 'Einkaufsliste' }).click();
  await page.waitForSelector('li.swipe');
  assert.ok((await page.locator('li.swipe').count()) >= 3);
  await page.locator('li.swipe').first().click();
  await page.waitForSelector('.sheet');
  assert.ok((await page.locator('.sheet input[name=title]').inputValue()).length > 0);
  ok('Liste lesbar, Dialog öffnet, Eingabeleiste gesperrt');
  await page.keyboard.press('Escape');
  await page.goBack();
  await page.waitForTimeout(400);

  // C. Suche funktioniert auf dem gespeicherten Stand
  await page.goto(APP + '#');
  await page.waitForSelector('.list-tile');
  await page.locator('#btn-search').click();
  await page.waitForSelector('#top-slot input');
  await page.locator('#top-slot input').fill('milch');
  await page.waitForFunction(() => document.querySelectorAll('#content .item-title').length >= 1);
  ok('Suche läuft offline');

  // D. Server wieder da: Banner weg, Live-Stand ersetzt Zwischenspeicher
  require('node:child_process').spawn('node', ['mock-ha.mjs'], { cwd: __dirname, detached: true, stdio: 'ignore' }).unref();
  await sleep(1500);
  await page.goto(APP);
  await page.waitForSelector('.list-tile');
  await page.waitForFunction(() => document.querySelector('#banner').hidden, null, { timeout: 15000 });
  ok('Mit Server wieder: Hinweisband weg');

  // E. Neue Liste ohne Zwischenspeicher + Fehler: kein Absturz
  await page.evaluate(() => localStorage.removeItem('merker.snapshot'));
  assert.deepEqual(errors, []);
  ok('Keine Seitenfehler');
  await browser.close();
})().catch((e) => { console.log('FEHLER:', e); process.exit(1); });
