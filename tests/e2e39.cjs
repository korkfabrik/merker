// Eigene Bilder: zwei Geräte überschreiben sich nicht, auch nicht nach einer Änderung ohne Verbindung
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = 'http://localhost:8123';
const APP = `${BASE}/local/merker/index.html`;
const ok = (n) => console.log('OK  ', n);
const userData = async () => (await (await fetch(`${BASE}/__mock/user-data`)).json()).merker_shop_icons ?? {};
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const device = async () => {
    const ctx = await browser.newContext({ locale: 'de-DE', viewport: { width: 390, height: 860 } });
    await ctx.addInitScript(() => localStorage.setItem('merker.shoppingLists', '["todo.einkaufsliste"]'));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(APP);
    await page.waitForSelector('.list-tile');
    await page.goto(`${APP}#/liste/todo.einkaufsliste`);
    await page.waitForSelector('.shop-tile');
    return page;
  };
  const setIcon = async (page, name, emoji) => {
    await page.waitForSelector('.sheet-root', { state: 'detached' });
    await page.locator('.shop-tile', { hasText: name }).first().click({ button: 'right' });
    await page.locator('.shop-icon-row:not(.shop-section-row)').click();
    await page.locator(`.shop-icon-choice[data-icon="${emoji}"]`).click();
    await page.locator('.shop-menu-actions .btn-primary').click();
    await page.waitForSelector('.sheet-root', { state: 'detached' });
  };
  const waitFor = async (pred, what) => {
    for (let i = 0; i < 80; i++) {
      if (pred(await userData())) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`nicht erreicht: ${what} ${JSON.stringify(await userData())}`);
  };

  const a = await device();
  const b = await device(); // B hat den Stand von jetzt (leer) und wird nicht neu geladen
  await setIcon(a, 'Brot', '🥨');
  await waitFor((d) => d.brot === '🥨', 'A setzt Brot');
  await setIcon(b, 'Milch', '🍼');
  await waitFor((d) => d.milch === '🍼', 'B setzt Milch');
  assert.equal((await userData()).brot, '🥨', 'Änderung von A bleibt');
  await b.waitForFunction(() => [...document.querySelectorAll('.shop-tile')].some((e) => e.textContent.includes('🥨')));
  ok('Zwei Geräte: Änderung des anderen bleibt erhalten, B sieht sie danach auch');

  // Ohne Verbindung auf B ändern, gleichzeitig ändert A etwas: nach dem Verbinden ist beides da
  await fetch(`${BASE}/__mock/drop?ms=3000`, { method: 'POST' });
  await b.waitForFunction(() => /Keine Verbindung|Verbinde/.test(document.querySelector('#banner').textContent), null, { timeout: 8000 });
  await setIcon(b, 'Arzt anrufen', '📦');
  assert.ok(await b.evaluate(() => JSON.parse(localStorage.getItem('merker.shopIcons.pending'))['arzt anrufen'] === '📦'));
  await a.waitForFunction(() => document.querySelector('#banner').hidden, null, { timeout: 20000 });
  await setIcon(a, 'Brot', '🍞');
  await waitFor((d) => d.brot === '🍞', 'A ändert Brot');
  await waitFor((d) => d['arzt anrufen'] === '📦' && d.brot === '🍞' && d.milch === '🍼', 'alles zusammen');
  assert.equal(await b.evaluate(() => localStorage.getItem('merker.shopIcons.pending')), null);
  ok('Offline-Änderung geht einzeln raus, nichts wird überschrieben');

  // Zurück auf Auto entfernt nur diesen Eintrag
  await b.locator('.shop-tile', { hasText: 'Milch' }).first().click({ button: 'right' });
  await b.locator('.shop-icon-row:not(.shop-section-row)').click();
  await b.locator('.shop-icon-auto').click();
  await b.locator('.shop-menu-actions .btn-primary').click();
  await waitFor((d) => !('milch' in d) && d.brot === '🍞' && d['arzt anrufen'] === '📦', 'Milch entfernt');
  ok('Auto entfernt nur den einen Eintrag');

  assert.deepEqual(errors, []);
  await browser.close();
})().catch((e) => { console.log('FEHLER:', e); process.exit(1); });
