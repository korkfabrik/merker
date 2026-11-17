const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = 'http://localhost:8123';
const APP = `${BASE}/local/merker/index.html`;
const calls = async () => (await fetch(`${BASE}/__mock/calls`)).json();
const ok = (n) => console.log('OK  ', n);
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ locale: 'de-DE', viewport: { width: 390, height: 800 }, hasTouch: true });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const rows = (text) => page.locator('li.swipe', { hasText: text });
  // Von rechts nach links wischen, fraction = Anteil der Zeilenbreite. check() läuft kurz vor dem Loslassen.
  async function swipeLeft(locator, fraction, check) {
    const box = await locator.boundingBox();
    const y = box.y + box.height / 2;
    const x0 = box.x + box.width - 12;
    const x1 = x0 - box.width * fraction;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
    for (let i = 1; i <= 12; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + ((x1 - x0) * i) / 12, y }] });
    if (check) await check();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  const waitCall = async (n, service) => {
    for (let i = 0; i < 50; i++) {
      const found = (await calls()).slice(n).filter((c) => c.service === service);
      if (found.length) return found;
      await page.waitForTimeout(100);
    }
    return [];
  };
  await page.goto(APP);
  await page.waitForSelector('.list-tile');
  await page.goto(`${APP}#/liste/todo.einkaufsliste`);
  await page.waitForSelector('li.swipe');

  // Halb nach links: eingestellte Aktion (Verschieben) öffnet die Listenauswahl
  await swipeLeft(rows('Brot'), 0.35, async () => {
    assert.equal(await rows('Brot').evaluate((e) => e.classList.contains('swipe-far')), false);
  });
  await page.waitForSelector('.pick-row');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet-root', { state: 'detached' });
  await page.waitForTimeout(500);
  ok('Ein Drittel nach links: Verschieben wie eingestellt');

  // Nicht weit genug (unter einem Viertel): federt zurück, das Symbol liegt dabei unter der Aufgabe
  await swipeLeft(rows('Milch'), 0.15);
  await page.waitForTimeout(450);
  const layer = await rows('Milch').evaluate((row) => {
    const item = row.querySelector('.item');
    const r = row.getBoundingClientRect();
    const hit = document.elementFromPoint(r.right - 30, r.top + r.height / 2);
    return { itemZ: getComputedStyle(item).zIndex, iconZ: getComputedStyle(row, '::after').zIndex, onItem: item.contains(hit) };
  });
  assert.deepEqual([layer.itemZ, layer.iconZ], ['1', '0']);
  assert.ok(layer.onItem);
  assert.equal(await page.locator('.pick-row').count(), 0);
  ok('Zu kurz gewischt: federt zurück, Symbol liegt unter der Aufgabe');

  // Ganz weit: rot, löscht mit Rückgängig
  let n = (await calls()).length;
  await swipeLeft(rows('Brot'), 0.6, async () => {
    assert.equal(await rows('Brot').evaluate((e) => e.classList.contains('swipe-far')), true);
  });
  const removed = await waitCall(n, 'remove_item');
  assert.equal(removed.length, 1);
  assert.equal(await page.locator('.pick-row').count(), 0, 'keine Listenauswahl');
  await page.waitForFunction(() => /gelöscht/.test(document.querySelector('#snackbar').textContent));
  n = (await calls()).length;
  await page.locator('.snackbar-action').click();
  assert.equal((await waitCall(n, 'add_item'))[0]?.data.item, 'Brot');
  await page.waitForFunction(() => [...document.querySelectorAll('li.swipe .item-title')].some((e) => e.textContent === 'Brot' ) && !document.querySelector('[data-uid^="tmp-"]'));
  ok('Über die Hälfte nach links: Zeile rot, löscht mit Rückgängig');

  // Einstellung aus: weit wischen verschiebt nur
  await page.goto(`${APP}#/einstellungen/bedienung`);
  const sw = page.locator('.set-switch', { hasText: 'Weit nach links löscht' }).locator('input');
  assert.equal(await sw.isChecked(), true);
  await sw.uncheck();
  await page.goto(`${APP}#/liste/todo.einkaufsliste`);
  await page.waitForSelector('li.swipe');
  n = (await calls()).length;
  await swipeLeft(rows('Milch'), 0.6, async () => {
    assert.equal(await rows('Milch').evaluate((e) => e.classList.contains('swipe-far')), false);
  });
  await page.waitForSelector('.pick-row');
  await page.keyboard.press('Escape');
  assert.equal((await calls()).slice(n).filter((c) => c.service === 'remove_item').length, 0);
  ok('Einstellung aus: weites Wischen löscht nicht');

  assert.deepEqual(errors, []);
  await browser.close();
})().catch((e) => { console.log('FEHLER:', e); process.exit(1); });
