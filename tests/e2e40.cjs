// Update nur vollständig: fehlt eine Datei der neuen Version, kein Hinweis, alte Version läuft weiter. Danach klappt es.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const DIR = process.env.MERKER_DIR;
const APP = 'http://localhost:8123/local/merker/index.html';
const ok = (n) => console.log('OK  ', n);
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ locale: 'de-DE' })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(APP);
  await page.waitForSelector('.list-tile');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 }).catch(async () => {
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
  });
  const oldVersion = await page.evaluate(() => window.__merkerVersion);
  const next = oldVersion.replace(/\d+$/, (n) => String(Number(n) + 1));
  for (const f of ['sw.js', 'js/version.js']) fs.writeFileSync(`${DIR}/${f}`, fs.readFileSync(`${DIR}/${f}`, 'utf8').replaceAll(oldVersion, next));
  const missing = `${DIR}/icon-shop-192.png`;
  fs.renameSync(missing, `${missing}.weg`);

  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()).catch(() => {}));
  await page.waitForTimeout(3000);
  const state = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return { waiting: !!r.waiting, installing: !!r.installing, caches: await caches.keys(), bar: !!document.querySelector('.update-bar') };
  });
  assert.equal(state.bar, false, 'kein Hinweis');
  assert.equal(state.waiting, false, 'keine wartende Version');
  assert.ok(!state.caches.includes(`merker-${next}`), 'kein halber Cache');
  assert.ok(state.caches.includes(`merker-${oldVersion}`), 'alter Cache bleibt');
  await page.reload();
  await page.waitForSelector('.list-tile');
  assert.equal(await page.evaluate(() => window.__merkerVersion), oldVersion);
  ok('Datei fehlt: kein Hinweis, kein halber Cache, alte Version läuft weiter');

  fs.renameSync(`${missing}.weg`, missing);
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
  await page.waitForSelector('.update-bar', { timeout: 15000 });
  assert.equal(await page.locator('.update-text').innerText(), `Version ${next} verfügbar`);
  await Promise.all([page.waitForEvent('load', { timeout: 15000 }), page.locator('.update-action').click()]);
  await page.waitForFunction((v) => window.__merkerVersion === v, next, { timeout: 10000 });
  ok('Datei wieder da: nächster Versuch bietet die Version an und spielt sie ein');

  assert.deepEqual(errors, []);
  await browser.close();
})().catch((e) => { console.log('FEHLER:', e); process.exit(1); });
