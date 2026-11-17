const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = 'http://localhost:8123';
const APP = `${BASE}/local/merker/index.html`;
const calls = async () => (await fetch(`${BASE}/__mock/calls`)).json();
const ok = (n) => console.log('OK  ', n);
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ locale: 'de-DE', viewport: { width: 390, height: 860 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const waitCall = async (n, service, pred = () => true) => {
    for (let i = 0; i < 60; i++) {
      const found = (await calls()).slice(n).filter((c) => c.service === service && pred(c));
      if (found.length) return found;
      await page.waitForTimeout(100);
    }
    throw new Error(`kein ${service}`);
  };
  await page.goto(APP);
  await page.waitForSelector('.list-tile');
  assert.equal(await page.locator('.tile-cart').count(), 0);

  // Markieren in den Einstellungen der Liste
  await page.goto(`${APP}#/einstellungen/todo.einkaufsliste`);
  await page.waitForSelector('.set-switch');
  const sw = page.locator('.set-switch', { hasText: 'Einkaufsliste' }).locator('input');
  assert.equal(await sw.isChecked(), false);
  await sw.check();
  await page.goto(`${APP}#/`);
  await page.waitForSelector('.list-tile');
  assert.equal(await page.locator('.list-tile', { hasText: 'Einkaufsliste' }).locator('.tile-cart').count(), 1);
  assert.equal(await page.locator('.list-tile', { hasText: 'Haushalt' }).locator('.tile-cart').count(), 0);
  ok('Einstellung markiert die Liste, 🛒 nur bei ihr in der Übersicht');

  // Kachelansicht
  await page.locator('.list-tile', { hasText: 'Einkaufsliste' }).click();
  await page.waitForSelector('.shop-tile');
  assert.equal(await page.locator('#btn-sort').isHidden(), true);
  assert.equal(await page.locator('#btn-view').isVisible(), true);
  const cols = await page.locator('.shop-grid').first().evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(' ').length);
  assert.equal(cols, 3);
  const box = await page.locator('.shop-tile').first().boundingBox();
  assert.ok(box.width >= 100 && Math.abs(box.width - box.height) <= 2, 'quadratisch und groß');
  const milk = page.locator('.shop-tile', { hasText: 'Milch' });
  assert.equal(await milk.locator('.shop-icon').innerText(), '🥛');
  assert.equal(await milk.locator('.shop-detail').innerText(), 'Fettarm, 1 Liter');
  assert.equal(await page.locator('.shop-recent').getAttribute('open'), null, 'eingeklappt');
  assert.equal(await page.locator('.shop-tile.is-done', { hasText: 'Eier' }).count(), 1);
  assert.match(await page.locator('.shop-done-title').innerText(), /Zuletzt gekauft \(1\)/i);
  ok('Kacheln: drei pro Reihe, Bild und Zusatz, Erledigte unter "Zuletzt gekauft"');

  // Antippen hakt ab, dort antippen holt zurück
  let n = (await calls()).length;
  await milk.click();
  await waitCall(n, 'update_item', (c) => c.data.status === 'completed');
  await page.locator('.shop-recent > summary').click();
  await page.waitForSelector('.shop-tile.is-done:has-text("Milch")');
  n = (await calls()).length;
  await page.locator('.shop-tile.is-done', { hasText: 'Milch' }).click();
  await waitCall(n, 'update_item', (c) => c.data.status === 'needs_action');
  await page.waitForSelector('.shop-tile:not(.is-done):has-text("Milch")');
  assert.equal(await page.evaluate(() => typeof navigator.wakeLock), 'object');
  ok('Antippen hakt ab, unter "Zuletzt gekauft" antippen setzt zurück');

  // Hinzufügen: bekannter Artikel kommt zurück, neuer wird angelegt, offener wird gemeldet
  const input = page.locator('.shopbar input');
  await input.fill('eier');
  assert.equal(await page.locator('.shop-add').count(), 0, 'kein Anlegen bei bekanntem Artikel');
  n = (await calls()).length;
  await input.press('Enter');
  await waitCall(n, 'update_item', (c) => c.data.status === 'needs_action');
  assert.equal((await calls()).slice(n).filter((c) => c.service === 'add_item').length, 0);
  await page.waitForFunction(() => document.querySelector('.shopbar input').value === '');
  await input.fill('Kaffee');
  assert.equal(await page.locator('.shop-add .shop-name').innerText(), 'Kaffee');
  assert.equal(await page.locator('.shop-add .shop-icon').innerText(), '☕');
  n = (await calls()).length;
  await input.press('Enter');
  const add = (await waitCall(n, 'add_item'))[0];
  assert.equal(add.data.item, 'Kaffee');
  await page.waitForSelector('.shop-tile:not(.is-done):has-text("Kaffee")');
  assert.ok(await input.evaluate((e) => e === document.activeElement), 'Feld bleibt aktiv');
  await input.fill('brot');
  await input.press('Enter');
  await page.waitForFunction(() => /steht schon drauf/.test(document.querySelector('#snackbar').textContent));
  await input.fill('');
  ok('Hinzufügen: bekannter Artikel kommt zurück, neuer wird angelegt, doppelter gemeldet');

  // Lange drücken (Rechtsklick): Fenster mit Menge, Notiz, Bild
  await page.locator('.shop-tile', { hasText: 'Brot' }).click({ button: 'right' });
  await page.waitForSelector('.shop-qty');
  await page.locator('.shop-qty .pick-chip', { hasText: '3×' }).click();
  assert.equal(await page.locator('.shop-note').inputValue(), '3×');
  await page.locator('.shop-note').fill('3× Vollkorn');
  await page.locator('.shop-qty .pick-chip', { hasText: '2×' }).click();
  assert.equal(await page.locator('.shop-note').inputValue(), '2× Vollkorn');
  await page.locator('.shop-icon-row:not(.shop-section-row)').click();
  await page.locator('.shop-icon-choice[data-icon="🥨"]').click();
  n = (await calls()).length;
  await page.locator('.shop-menu-actions .btn-primary').click();
  const upd = (await waitCall(n, 'update_item'))[0];
  assert.equal(upd.data.description, '2× Vollkorn');
  await waitCall(n, 'set_user_data');
  const ud = await (await fetch(`${BASE}/__mock/user-data`)).json();
  assert.equal(ud.merker_shop_icons.brot, '🥨');
  await page.waitForFunction(() => [...document.querySelectorAll('.shop-tile')].some((e) => e.textContent.includes('🥨') && e.textContent.includes('2× Vollkorn')));
  ok('Langes Drücken: Menge und Notiz in der Beschreibung, eigenes Bild in Home Assistant');
  // Eigenes Bild gilt auch nach Neustart ohne lokale Kopie (aus Home Assistant geladen)
  await page.evaluate(() => localStorage.removeItem('merker.shopIcons'));
  await page.reload();
  await page.waitForFunction(() => [...document.querySelectorAll('.shop-tile')].some((e) => e.textContent.includes('🥨')), null, { timeout: 15000 });
  ok('Eigenes Bild kommt aus Home Assistant');
  // "Alles bearbeiten" öffnet den großen Dialog
  await page.locator('.shop-tile', { hasText: 'Brot' }).click({ button: 'right' });
  await page.locator('.shop-menu-actions .btn', { hasText: 'Alles bearbeiten' }).click();
  await page.waitForSelector('.sheet-head-edit');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet-root', { state: 'detached' });
  await page.waitForSelector('.shop-tile');
  ok('Alles bearbeiten öffnet den Dialog');

  // Mehrere mit Komma
  n = (await calls()).length;
  await page.locator('.shopbar input').fill('Tomaten, Bananen');
  assert.match(await page.locator('.shop-add .shop-detail').innerText(), /2 Artikel/);
  await page.locator('.shopbar input').press('Enter');
  for (let i = 0; i < 50 && (await calls()).slice(n).filter((c) => c.service === 'add_item').length < 2; i++) await page.waitForTimeout(100);
  assert.deepEqual((await calls()).slice(n).filter((c) => c.service === 'add_item').map((c) => c.data.item), ['Tomaten', 'Bananen']);
  ok('Mehrere Artikel mit Komma');

  // Abteilungen
  await page.waitForSelector('.shop-section-title');
  const sections = await page.locator('.shop-section-title').allInnerTexts();
  assert.ok(sections.indexOf('OBST UND GEMÜSE') < sections.indexOf('BROT UND GEBÄCK'), sections.join('|'));
  assert.ok(sections.includes('SONSTIGES') && sections.at(-1) === 'SONSTIGES');
  ok('Abteilungen in Ladenreihenfolge');

  // Abteilung selbst wählen: Ketchup steht automatisch unter Vorrat, kommt per Wahl zu Getränke
  const sectionOf = (name) => page.evaluate((n) => {
    const tile = [...document.querySelectorAll('.shop-tile:not(.is-done)')].find((e) => e.querySelector('.shop-name')?.textContent === n);
    let el = tile?.parentElement?.previousElementSibling;
    return el?.classList.contains('shop-section-title') ? el.textContent : null;
  }, name);
  await page.locator('.shopbar input').fill('Ketchup');
  await page.locator('.shopbar input').press('Enter');
  await page.waitForFunction(() => document.querySelector('.shopbar input').value === '');
  await page.waitForFunction(() => [...document.querySelectorAll('.shop-tile:not(.is-done) .shop-name')].some((e) => e.textContent === 'Ketchup'));
  assert.equal(await sectionOf('Ketchup'), 'Vorrat');
  await page.locator('.shop-tile', { hasText: 'Ketchup' }).click({ button: 'right' });
  await page.waitForSelector('.shop-section-chip[data-section=""][aria-pressed]', { state: 'attached' });
  assert.match(await page.locator('.shop-section-row').innerText(), /Auto \(Vorrat\)/);
  await page.locator('.shop-section-row').click();
  assert.equal(await page.locator('.shop-section-chip[data-section=""]').innerText(), 'Auto (Vorrat)');
  assert.equal(await page.locator('.shop-section-chip[data-section=""]').getAttribute('aria-pressed'), 'true');
  await page.locator('.shop-section-chip[data-section="drinks"]').click();
  n = (await calls()).length;
  await page.locator('.shop-menu-actions .btn-primary').click();
  await waitCall(n, 'set_user_data', (c) => c.data.key === 'merker_shop_sections');
  assert.equal((await (await fetch(`${BASE}/__mock/user-data`)).json()).merker_shop_sections.ketchup, 'drinks');
  await page.waitForFunction(() => true);
  for (let i = 0; i < 30 && (await sectionOf('Ketchup')) !== 'Getränke'; i++) await page.waitForTimeout(100);
  assert.equal(await sectionOf('Ketchup'), 'Getränke');
  // Zurück auf Auto
  await page.waitForSelector('.sheet-root', { state: 'detached' });
  await page.locator('.shop-tile', { hasText: 'Ketchup' }).click({ button: 'right' });
  await page.waitForSelector('.shop-section-chip[data-section="drinks"][aria-pressed="true"]', { state: 'attached' });
  assert.match(await page.locator('.shop-section-row').innerText(), /Getränke/);
  await page.locator('.shop-section-row').click();
  await page.locator('.shop-section-chip[data-section=""]').click();
  await page.locator('.shop-menu-actions .btn-primary').click();
  for (let i = 0; i < 30 && (await sectionOf('Ketchup')) !== 'Vorrat'; i++) await page.waitForTimeout(100);
  assert.equal(await sectionOf('Ketchup'), 'Vorrat');
  ok('Abteilung pro Artikel wählbar, gespeichert in Home Assistant, Auto setzt zurück');

  // Zuletzt gekauft ein- und ausklappbar
  await page.locator('#btn-view').click();
  await page.waitForSelector('li.swipe');
  await page.locator('li.swipe', { hasText: 'Brot' }).locator('.item-check').click();
  await page.locator('#btn-view').click();
  await page.waitForSelector('.shop-recent');
  const wasOpen = (await page.locator('.shop-recent').getAttribute('open')) !== null;
  await page.locator('.shop-recent > summary').click();
  assert.equal((await page.locator('.shop-recent').getAttribute('open')) !== null, !wasOpen);
  await page.locator('.shop-recent > summary').click();
  assert.equal((await page.locator('.shop-recent').getAttribute('open')) !== null, wasOpen);
  ok('Zuletzt gekauft einklappbar');

  // Vier Kacheln pro Reihe
  await page.goto(`${APP}#/einstellungen/darstellung`);
  await page.locator('.seg-bar[aria-label="Einkaufskacheln pro Reihe"] .seg-btn', { hasText: '4' }).click();
  await page.goto(`${APP}#/liste/todo.einkaufsliste`);
  await page.waitForSelector('.shop-grid.cols-4');
  assert.equal(await page.locator('.shop-grid').first().evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(' ').length), 4);
  ok('Einstellung: vier Kacheln pro Reihe');

  // Kurzbefehl öffnet die Einkaufsliste
  await page.goto(`${APP}?einkauf=1`);
  await page.waitForSelector('.shop-tile', { timeout: 15000 });
  assert.match(page.url(), /#\/liste\/todo\.einkaufsliste$/);
  assert.ok(!page.url().includes('einkauf=1'));
  ok('Kurzbefehl öffnet die Einkaufsliste');

  // Umschalten auf Listenansicht und zurück
  await page.locator('#btn-view').click();
  await page.waitForSelector('li.swipe');
  assert.equal(await page.locator('.shop-tile').count(), 0);
  assert.equal(await page.locator('.shopbar').count(), 0);
  await page.locator('#btn-view').click();
  await page.waitForSelector('.shop-tile');
  ok('Knopf schaltet zwischen Kacheln und Liste');

  // Normale Liste bleibt normal
  await page.goto(`${APP}#/liste/todo.haushalt`);
  await page.waitForSelector('li.swipe');
  assert.equal(await page.locator('#btn-view').isHidden(), true);
  assert.equal(await page.locator('.shopbar').count(), 0);
  ok('Andere Listen unverändert');

  assert.deepEqual(errors, []);
  await browser.close();
})().catch((e) => { console.log('FEHLER:', e); process.exit(1); });
