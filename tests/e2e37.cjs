const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = 'http://localhost:8123';
const APP = `${BASE}/local/merker/index.html`;
const ok = (n) => console.log('OK  ', n);
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ locale: 'de-DE', viewport: { width: 390, height: 800 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const long = 'Geschenk für die Geburtstagsfeier von Oma am Wochenende besorgen und einpacken';
  await fetch(`${BASE}/__mock/add-item?entity=todo.haushalt&summary=${encodeURIComponent(long)}`, { method: 'POST' });
  await page.goto(APP);
  await page.waitForSelector('.list-tile');
  await page.goto(`${APP}#/liste/todo.haushalt`);
  await page.waitForSelector('li.swipe');

  await page.locator('li.swipe', { hasText: 'Rauchmelder' }).locator('.item-check').click();
  await page.waitForFunction(() => document.querySelector('#snackbar .snackbar-text')?.textContent === 'Erledigt: Rauchmelder testen');
  ok('Kurzer Titel steht ganz in der Meldung');

  await page.locator('li.swipe', { hasText: 'Geschenk' }).locator('.item-check').click();
  await page.waitForFunction((t) => document.querySelector('#snackbar .snackbar-text')?.textContent === `Erledigt: ${t}`, long);
  const m = await page.evaluate(() => {
    const bar = document.querySelector('#snackbar');
    const text = bar.querySelector('.snackbar-text');
    const btn = bar.querySelector('.snackbar-action').getBoundingClientRect();
    return { truncated: text.scrollWidth > text.clientWidth, ellipsis: getComputedStyle(text).textOverflow, height: bar.getBoundingClientRect().height, btnRight: btn.right, barRight: bar.getBoundingClientRect().right, btnWidth: btn.width };
  });
  assert.ok(m.truncated, 'Text gekürzt');
  assert.equal(m.ellipsis, 'ellipsis');
  assert.ok(m.height < 70, `eine Zeile (${m.height})`);
  assert.ok(m.btnWidth > 40 && m.btnRight <= m.barRight, 'Rückgängig sichtbar');
  await page.screenshot({ path: require('node:path').join(__dirname, '.shots', 'snack.png'), clip: { x: 0, y: 600, width: 390, height: 200 } });
  ok('Langer Titel mit … gekürzt, Rückgängig bleibt sichtbar');

  assert.deepEqual(errors, []);
  await browser.close();
})().catch((e) => { console.log('FEHLER:', e); process.exit(1); });
