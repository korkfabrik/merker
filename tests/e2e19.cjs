const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = 'http://localhost:8123';
const APP = `${BASE}/local/merker/index.html`;
const getJson = async (p) => (await fetch(`${BASE}${p}`)).json();
const order = async () => (await getJson('/__mock/items?entity=todo.einkaufsliste')).map((i) => `${i.summary}|${i.status}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (n) => console.log('OK  ', n);
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ locale: 'de-DE', viewport: { width: 412, height: 860 }, hasTouch: true })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(APP);
  await page.waitForSelector('.list-tile');
  await page.locator('.list-tile', { hasText: 'Einkaufsliste' }).click();
  await page.waitForSelector('li.swipe');
  const before = await order();
  assert.ok(before.length >= 4);

  // A. Mittleren offenen Eintrag löschen, Rückgängig stellt Platz wieder her
  const target = before[2].split('|')[0];
  await page.locator('li.swipe', { hasText: target }).first().click();
  await page.waitForSelector('.sheet');
  await page.getByRole('button', { name: 'Löschen', exact: true }).click();
  await page.waitForSelector('.snackbar-action');
  assert.ok(!(await order()).some((x) => x.startsWith(target + '|')));
  await page.locator('.snackbar-action').click();
  for (let i = 0; i < 50 && JSON.stringify(await order()) !== JSON.stringify(before); i++) await sleep(100);
  assert.deepEqual(await order(), before);
  ok('Löschen und Rückgängig: Eintrag steht wieder an seinem Platz');

  // B. Ersten Eintrag löschen: kommt wieder ganz nach vorn
  const first = before[0].split('|')[0];
  await page.waitForFunction((t) => [...document.querySelectorAll('#content .item-title')].some((e) => e.textContent.includes(t)), first);
  await page.locator('li.swipe', { hasText: first }).first().click();
  await page.waitForSelector('.sheet');
  await page.getByRole('button', { name: 'Löschen', exact: true }).click();
  await page.waitForSelector('.snackbar-action');
  await page.locator('.snackbar-action').click();
  for (let i = 0; i < 50 && JSON.stringify(await order()) !== JSON.stringify(before); i++) await sleep(100);
  assert.deepEqual(await order(), before);
  ok('Erster Eintrag kommt an den Anfang zurück');

  // C. Erledigten Eintrag löschen: kommt erledigt und am alten Platz zurück
  const doneItem = before.find((x) => x.endsWith('|completed'));
  if (doneItem) {
    const t = doneItem.split('|')[0];
    await page.locator('.done-section summary').click();
    await page.locator('.done-section li.swipe', { hasText: t }).first().click();
    await page.waitForSelector('.sheet');
    await page.getByRole('button', { name: 'Löschen', exact: true }).click();
    await page.waitForSelector('.snackbar-action');
    await page.locator('.snackbar-action').click();
    for (let i = 0; i < 60 && JSON.stringify(await order()) !== JSON.stringify(before); i++) await sleep(100);
    assert.deepEqual(await order(), before);
    ok('Erledigter Eintrag kommt erledigt und am alten Platz zurück');
  }
  assert.deepEqual(errors, []);
  await browser.close();
})().catch((e) => { console.log('FEHLER:', e); process.exit(1); });
