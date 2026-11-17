// Neue Version: Hinweis mit "Neu laden" (eigene Kopie der App, deren Version im Test erhöht wird)
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const DIR = process.env.MERKER_DIR;
const APP = 'http://localhost:8123/local/merker/index.html';
const ok = (n) => console.log('OK  ', n);
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ locale: 'de-DE', viewport: { width: 390, height: 800 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(APP);
  await page.waitForSelector('.list-tile');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 }).catch(async () => {
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
  });
  await page.waitForSelector('.list-tile');
  await page.waitForTimeout(500);
  assert.equal(await page.locator('.update-bar').count(), 0);
  const oldVersion = await page.evaluate(() => window.__merkerVersion);
  ok('Erster Start: kein Hinweis');

  // Neue Version auf dem Server
  const next = oldVersion.replace(/\d+$/, (n) => String(Number(n) + 1));
  for (const f of ['sw.js', 'js/version.js']) {
    const p = `${DIR}/${f}`;
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replaceAll(oldVersion, next));
  }
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
  await page.waitForSelector('.update-bar', { timeout: 15000 });
  assert.equal(await page.locator('.update-text').innerText(), `Version ${next} verfügbar`);
  assert.equal(await page.evaluate(() => window.__merkerVersion), oldVersion, 'läuft weiter mit alter Version');
  ok('Neue Version: Hinweis mit Versionsnummer, App läuft bis zum Tippen weiter');

  // Später schließt, beim nächsten Prüfen (neue Seite) kommt er wieder
  await page.locator('.update-close').click();
  assert.equal(await page.locator('.update-bar').count(), 0);
  await Promise.all([page.waitForEvent('load'), page.reload()]);
  await page.waitForSelector('.update-bar', { timeout: 15000 });
  ok('Später schließt den Hinweis, er kommt beim nächsten Start wieder');

  await Promise.all([page.waitForEvent('load', { timeout: 15000 }), page.locator('.update-action').click()]);
  await page.waitForSelector('.list-tile');
  await page.waitForFunction((v) => window.__merkerVersion === v, next, { timeout: 10000 });
  await page.waitForTimeout(500);
  assert.equal(await page.locator('.update-bar').count(), 0);
  ok('Neu laden: neue Version aktiv, Hinweis weg');

  assert.deepEqual(errors, []);
  await browser.close();
})().catch((e) => { console.log('FEHLER:', e); process.exit(1); });
