// Einkaufsansicht bei langsamem Netz: Das Feld leert sich sofort beim Absenden. Was man währenddessen schon weiter tippt,
// bleibt stehen, auch wenn die Antwort von HA für den vorigen Artikel erst danach kommt. Bei einem Fehler kommt der Text zurück.
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (name) => console.log('OK  ', name);

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ locale: 'de-DE', viewport: { width: 412, height: 860 } });
  await context.addInitScript(() => localStorage.setItem('merker.shoppingLists', JSON.stringify(['todo.einkaufsliste'])));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(APP);
  await page.waitForSelector('.list-tile');
  await page.locator('.list-tile', { hasText: 'Einkaufsliste' }).click();
  const input = page.locator('.shopbar input');
  await input.waitFor();

  // 1. Tee absenden, Antwort kommt erst nach 1,5 s. Währenddessen schon Zucker tippen.
  await post('/__mock/slow-next?ms=1500');
  await input.fill('Tee');
  await input.press('Enter');
  assert.equal(await input.inputValue(), '', 'Feld nicht sofort leer');
  await input.fill('Zucker');
  await until(async () => (await (await fetch(BASE + '/__mock/items?entity=todo.einkaufsliste')).json()).some((i) => i.summary === 'Tee'));
  await sleep(500);
  assert.equal(await input.inputValue(), 'Zucker', 'Weiter getippter Text wurde gelöscht');
  await input.press('Enter');
  await until(async () => (await (await fetch(BASE + '/__mock/items?entity=todo.einkaufsliste')).json()).some((i) => i.summary === 'Zucker'));
  ok('Langsames Netz: weiter Getipptes bleibt stehen, beide Artikel kommen an');

  // 2. Fehler beim Anlegen: Text kommt ins leere Feld zurück
  await post('/__mock/fail-next');
  await input.fill('Honig');
  await input.press('Enter');
  await page.waitForFunction(() => /Nicht gespeichert/.test(document.querySelector('#snackbar').textContent));
  await page.waitForFunction(() => document.querySelector('.shopbar input').value === 'Honig');
  assert.ok(!(await getJson('/__mock/items?entity=todo.einkaufsliste')).some((i) => i.summary === 'Honig'));
  ok('Fehler: Text kommt zurück ins Feld');

  assert.deepEqual(errors, []);
  await browser.close();
})().catch((e) => {
  console.log('FEHLER', e);
  process.exit(1);
});
