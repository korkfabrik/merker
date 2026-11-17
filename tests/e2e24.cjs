const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = 'http://localhost:8123';
const APP = `${BASE}/local/merker/index.html`;
const ok = (n) => console.log('OK  ', n);
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ locale: 'de-DE', viewport: { width: 412, height: 860 }, hasTouch: true })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(APP);
  await page.waitForSelector('.list-tile');
  await page.goto(`${APP}#/liste/todo.haushalt`);
  await page.waitForSelector('li.swipe');
  // Eintrag und Plus-Knopf öffnen dasselbe Menü mit vorgewählter Liste
  for (const sel of ['#fab']) {
    await page.locator(sel).click();
    await page.waitForSelector('.sheet input[name=title]');
    assert.equal(await page.locator('.sheet .band-pick-name').innerText(), 'Haushalt');
    assert.equal(await page.locator('.sheet .prio-toggle').count(), 1);
    assert.equal(await page.locator('.sheet .switch-row').count(), 0);
    await page.keyboard.press('Escape');
    await page.waitForSelector('.sheet-root', { state: 'detached' });
  }
  ok('Plus-Knopf öffnet das Menü, Liste vorgewählt, Prio als Knopf');
  await page.locator('#fab').click();
  await page.screenshot({ path: require('node:path').join(__dirname, '.shots', 'shots11') + '/n24-dialog.png' });
  await page.keyboard.press('Escape');
  await page.screenshot({ path: require('node:path').join(__dirname, '.shots', 'shots11') + '/n24-list.png' });
  // Sortierung als Auswahlfenster
  await page.locator('.sort-mode').click();
  await page.waitForSelector('.sheet .pick-row');
  assert.deepEqual(await page.locator('.sheet .pick-name').allInnerTexts(), ['Standard', 'Home Assistant', 'A bis Z']);
  assert.equal(await page.locator('.pick-row[aria-pressed=true] .pick-name').innerText(), 'Standard');
  await page.locator('.pick-row', { hasText: 'A bis Z' }).click();
  await page.waitForSelector('.sheet-root', { state: 'detached' });
  assert.match(await page.locator('.sort-mode').innerText(), /A bis Z/);
  await page.locator('.sort-mode').click();
  await page.waitForSelector('.sheet .pick-row');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet-root', { state: 'detached' });
  assert.match(await page.locator('.sort-mode').innerText(), /A bis Z/);
  assert.equal(await page.locator('.add-row').count(), 0);
  ok('Sortierung öffnet ein Auswahlfenster, Escape ändert nichts');
  assert.deepEqual(errors, []);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
