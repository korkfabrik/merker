const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = 'http://localhost:8123';
const APP = `${BASE}/local/merker/index.html`;
const calls = async () => (await fetch(`${BASE}/__mock/calls`)).json();
const ok = (n) => console.log('OK  ', n);
const pad = (n) => String(n).padStart(2, '0');
const plus = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ locale: 'de-DE', viewport: { width: 390, height: 860 } });
  await ctx.addInitScript(() => { window.__vib = []; navigator.vibrate = (ms) => { window.__vib.push(ms); return true; }; });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const waitCall = async (n, service) => {
    for (let i = 0; i < 60; i++) {
      const found = (await calls()).slice(n).filter((c) => c.service === service);
      if (found.length) return found;
      await page.waitForTimeout(100);
    }
    throw new Error(`kein ${service}`);
  };
  const closed = () => page.waitForSelector('.sheet-root', { state: 'detached' });
  const swipe = async (locator, fraction) => {
    await locator.waitFor();
    await page.waitForTimeout(200);
    const box = await locator.boundingBox();
    const y = box.y + box.height / 2;
    const x0 = fraction > 0 ? box.x + 30 : box.x + box.width - 30;
    await page.mouse.move(x0, y);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(x0 + (box.width * fraction * i) / 12, y);
    await page.mouse.up();
  };
  await page.goto(APP);
  await page.waitForSelector('.list-tile');
  await page.goto(`${APP}#/liste/todo.einkaufsliste`);
  await page.waitForSelector('li.swipe');

  // 3. Datum antippen
  await page.locator('li.swipe', { hasText: 'Milch' }).locator('.chip-due-btn').click();
  await page.waitForSelector('.sheet .pick-row');
  assert.equal(await page.locator('.sheet-head-edit').count(), 0);
  assert.match(page.url(), /einkaufsliste$/);
  await page.locator('.pick-row', { hasText: 'Datum wählen' }).click();
  await page.waitForSelector('input.date-ask', { state: 'attached' });
  let n = (await calls()).length;
  await page.evaluate((v) => { const i = document.querySelector('input.date-ask'); i.value = v; i.dispatchEvent(new Event('change')); }, plus(10));
  let c = (await waitCall(n, 'update_item'))[0];
  assert.equal(c.data.due_date, plus(10));
  assert.equal(await page.locator('input.date-ask').count(), 0);
  ok('Datum an der Aufgabe antippen: Auswahl mit Tagen, "Datum wählen …" setzt das Kalenderdatum');
  await page.locator('.snackbar-action').click();
  await waitCall(n + 1, 'update_item');

  // 4. Vibrieren
  await page.evaluate(() => (window.__vib = []));
  await swipe(page.locator('li.swipe', { hasText: 'Brot' }), 0.7);
  await page.waitForFunction(() => window.__vib.includes(15), null, { timeout: 5000 });
  const vib = await page.evaluate(() => window.__vib);
  assert.ok(vib.includes(8) && vib.includes(15), JSON.stringify(vib));
  ok('Vibrieren an der Wischschwelle und beim Abhaken');
  await page.locator('.snackbar-action').click();
  await page.waitForTimeout(500);

  // 6. Abschnitte nach Fälligkeit
  await fetch(`${BASE}/__mock/add-item?entity=todo.einkaufsliste&summary=Spaeter&due=${plus(20)}`, { method: 'POST' });
  await page.locator('.sort-mode').click();
  await page.locator('.sheet .pick-row', { hasText: 'Nach Fälligkeit' }).click();
  await closed();
  await page.waitForSelector('.list-group-title');
  const titles = await page.locator('.list-group-title').allTextContents();
  assert.deepEqual(titles.map((x) => x.replace(/ \(\d+\)$/, '')), ['Überfällig', 'Heute', 'Nächste 7 Tage', 'Später', 'Ohne Datum']);
  assert.match(await page.locator('.sort-mode').innerText(), /Nach Fälligkeit/);
  ok('Sortierung "Nach Fälligkeit" zeigt Abschnitte');
  await page.locator('.sort-mode').click();
  await page.locator('.sheet .pick-row', { hasText: 'Standard' }).click();
  await closed();

  // 7. Suche
  await page.goto(APP);
  await page.waitForSelector('.list-tile');
  await page.locator('#btn-search').click();
  await page.locator('#top-slot input').fill('mil');
  await page.waitForSelector('mark.hit');
  assert.equal(await page.locator('mark.hit').first().innerText(), 'Mil');
  assert.match(await page.locator('.search-count').innerText(), /1 Treffer/);
  await page.locator('#top-slot input').fill('ei');
  await page.waitForSelector('.search-tools .label-btn');
  const before = await page.locator('#content li.swipe').count();
  await page.locator('.search-tools .label-btn', { hasText: 'Erledigte' }).click();
  assert.ok((await page.locator('#content li.swipe').count()) < before);
  await page.locator('#top-slot input').press('Enter');
  await page.locator('#top-slot input').fill('');
  await page.waitForSelector('.recent-chip');
  assert.equal(await page.locator('.recent-chip .label-btn').first().innerText(), 'ei');
  await page.locator('.recent-chip .label-btn').first().click();
  assert.equal(await page.locator('#top-slot input').inputValue(), 'ei');
  await page.locator('#top-slot input').fill('');
  await page.locator('.recent-remove').first().click();
  assert.equal(await page.locator('.recent-chip').count(), 0);
  ok('Suche: Treffer markiert, Anzahl, Erledigte ausblendbar, letzte Suchen');

  // 8. Kompakte Ansicht
  await page.goto(`${APP}#/einstellungen/darstellung`);
  await page.waitForSelector('.seg-bar');
  await page.locator('label.set-switch', { hasText: 'Kompakte Ansicht' }).locator('input').check();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.density), 'compact');
  await page.goto(`${APP}#/liste/todo.einkaufsliste`);
  await page.reload();
  await page.waitForSelector('li.swipe');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.density), 'compact');
  assert.equal(await page.locator('.item').first().evaluate((e) => getComputedStyle(e).paddingTop), '7px');
  await page.evaluate(() => localStorage.setItem('merker.compact', 'false'));
  ok('Kompakte Ansicht greift und bleibt nach Neuladen');

  // 9. Wischen nach links: Löschen und Datum
  await page.evaluate(() => localStorage.setItem('merker.swipeLeft', JSON.stringify('delete')));
  await page.reload();
  await page.waitForSelector('li.swipe');
  assert.ok(await page.locator('li.swipe.left-delete').count() > 0);
  n = (await calls()).length;
  await swipe(page.locator('li.swipe', { hasText: 'Brot' }), -0.7);
  c = (await waitCall(n, 'remove_item'))[0];
  assert.ok(c.data.item);
  await page.locator('.snackbar-action').click();
  await waitCall(n, 'add_item');
  await page.waitForTimeout(500);
  await page.evaluate(() => localStorage.setItem('merker.swipeLeft', JSON.stringify('date')));
  await page.reload();
  await page.waitForSelector('li.swipe');
  await page.waitForTimeout(300);
  await swipe(page.locator('li.swipe', { hasText: 'Milch' }), -0.35);
  await page.waitForSelector('.sheet .pick-row');
  n = (await calls()).length;
  await page.locator('.sheet .pick-row', { hasText: 'Morgen' }).click();
  c = (await waitCall(n, 'update_item'))[0];
  assert.equal(c.data.due_date, plus(1));
  await page.waitForTimeout(400);
  await swipe(page.locator('li.swipe', { hasText: 'Altpapier' }), -0.35);
  await page.waitForSelector('.sheet .pick-row');
  await page.keyboard.press('Escape');
  await closed();
  await page.waitForTimeout(600);
  const tr = await page.locator('li.swipe', { hasText: 'Altpapier' }).locator('.item').evaluate((e) => e.style.transform);
  assert.equal(tr, '');
  ok('Wischen nach links: Löschen mit Rückgängig, neues Datum, Abbrechen federt zurück');
  await page.evaluate(() => localStorage.removeItem('merker.swipeLeft'));

  assert.deepEqual(errors, []);
  await browser.close();
})().catch((e) => { console.log('FEHLER:', e); process.exit(1); });
