// Fixes aus dem Code-Review 1.0.2:
// Verschieben in eine Liste, die Datum oder Beschreibung nicht speichern kann, wird mit Warnung abgelehnt.
// Aufgabe aus der Wochenansicht öffnen: darunter bleibt die Woche. Update-Hinweis kommt nach × beim nächsten Update wieder.
// Knöpfe auf Fehler- und Diagnoseseite ohne Pillenform.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = 'http://localhost:8123';
// Wartet in Node, bis die Bedingung stimmt (page.waitForFunction wartet bei async-Funktionen nicht).
const until = async (fn, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Bedingung nicht erfüllt: ${fn}`);
};
const APP = `${BASE}/local/merker/index.html`;
const post = (p) => fetch(`${BASE}${p}`, { method: 'POST' });
const getJson = async (p) => (await fetch(`${BASE}${p}`)).json();
const calls = () => getJson('/__mock/calls');
const ok = (name) => console.log('OK  ', name);

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ locale: 'de-DE', viewport: { width: 412, height: 860 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  const titles = () => page.locator('#content .item-title').allInnerTexts();

  await page.goto(APP);
  await page.waitForSelector('.list-tile');
  await post('/__mock/add-list-plain');
  await page.waitForSelector('.list-tile:has-text("Einfach")');

  // 1. Milch hat Datum und Beschreibung, "Einfach" kann beides nicht: abgelehnt, nichts gesendet, Aufgabe bleibt
  await page.locator('.list-tile', { hasText: 'Einkaufsliste' }).click();
  await page.waitForSelector('li.swipe');
  const n0 = (await calls()).length;
  await page.locator('li.swipe', { hasText: 'Milch' }).locator('.item-title').click();
  await page.waitForSelector('.sheet');
  await page.locator('.sheet button[aria-label="Verschieben"]').click();
  await page.locator('.pick-row', { hasText: 'Einfach' }).click();
  await page.waitForFunction(() => /Nicht verschoben: „Einfach“ kann weder Datum noch Beschreibung speichern/.test(document.querySelector('.snackbar')?.textContent ?? ''));
  await page.waitForTimeout(300);
  assert.equal((await calls()).length, n0, 'trotz Ablehnung wurde etwas an HA gesendet');
  assert.ok((await getJson('/__mock/items?entity=todo.einkaufsliste')).some((i) => i.summary === 'Milch' && i.description === 'Fettarm, 1 Liter'));
  assert.equal((await getJson('/__mock/items?entity=todo.einfach')).length, 0);
  ok('Verschieben in Liste ohne Datum und Beschreibung: Warnung, Aufgabe bleibt unverändert');

  // 2. Brot hat weder Datum noch Beschreibung: Verschieben geht
  await page.goBack();
  await page.waitForSelector('.sheet', { state: 'detached' });
  await page.locator('li.swipe', { hasText: 'Brot' }).locator('.item-title').click();
  await page.waitForSelector('.sheet');
  await page.locator('.sheet button[aria-label="Verschieben"]').click();
  await page.locator('.pick-row', { hasText: 'Einfach' }).click();
  await page.waitForFunction(() => /Verschoben nach Einfach/.test(document.querySelector('.snackbar')?.textContent ?? ''));
  await until(async () => (await (await fetch(BASE + '/__mock/items?entity=todo.einfach')).json()).some((i) => i.summary === 'Brot'));
  ok('Aufgabe ohne Datum und Beschreibung lässt sich weiter verschieben');

  // 3. Wochenansicht: Aufgabe antippen, darunter bleibt die Woche
  await page.evaluate(() => { location.hash = '#/woche'; });
  await page.waitForSelector('#content .week-nav');
  await page.waitForSelector('#content li.swipe:has-text("Milch")');
  await page.locator('#content li.swipe', { hasText: 'Milch' }).locator('.item-title').click();
  await page.waitForSelector('.sheet');
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#content .week-nav').count(), 1, 'unter dem Dialog liegt nicht mehr die Woche');
  ok('Dialog aus der Wochenansicht: Woche bleibt darunter');
  await page.goBack();
  await page.waitForSelector('.sheet', { state: 'detached' });

  // 4. Update-Hinweis schließen, nächstes Update zeigt ihn wieder (Service Worker nachgebaut)
  await page.evaluate(async () => {
    Object.defineProperty(navigator.serviceWorker, 'controller', { configurable: true, get: () => ({}) });
    const { watchForUpdates } = await import('./js/update.js');
    const worker = () => ({ state: 'installed', addEventListener() {}, postMessage() {} });
    const reg = { waiting: null, installing: worker(), handlers: [], addEventListener(type, fn) { if (type === 'updatefound') this.handlers.push(fn); }, update: () => Promise.resolve() };
    window.__fakeReg = { reg, worker };
    watchForUpdates(reg);
  });
  await page.waitForSelector('.update-bar', { timeout: 5000 });
  await page.locator('.update-close').click();
  await page.waitForSelector('.update-bar', { state: 'detached' });
  await page.evaluate(() => {
    const { reg, worker } = window.__fakeReg;
    reg.installing = worker();
    reg.handlers.forEach((fn) => fn());
  });
  await page.waitForSelector('.update-bar', { timeout: 5000 });
  ok('Update-Hinweis erscheint nach × beim nächsten Update wieder');

  // 5. Keine Pillenform: Knopf auf der Fehlerseite und auf der Diagnoseseite
  await page.evaluate(() => window.__merkerFatal('Test'));
  const fatalRadius = await page.evaluate(() => getComputedStyle([...document.querySelectorAll('body > div button')].at(-1)).borderRadius);
  assert.equal(fatalRadius, '10px');
  await page.goto(`${BASE}/local/merker/diag.html`);
  await page.waitForSelector('button');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('button')).borderRadius), '10px');
  ok('Knöpfe auf Fehler- und Diagnoseseite mit 10px Ecken');

  assert.deepEqual(errors, []);
  await browser.close();
})().catch((e) => {
  console.log('FEHLER', e);
  process.exit(1);
});
