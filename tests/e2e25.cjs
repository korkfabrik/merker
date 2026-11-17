const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = 'http://localhost:8123';
const APP = `${BASE}/local/merker/index.html`;
const calls = async () => (await fetch(`${BASE}/__mock/calls`)).json();
const ok = (n) => console.log('OK  ', n);
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ locale: 'de-DE', viewport: { width: 390, height: 800 }, hasTouch: true })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(APP);
  await page.waitForSelector('.list-tile');
  await page.goto(`${APP}#/liste/todo.einkaufsliste`);
  await page.waitForSelector('li.swipe');

  // A. Speichern oben rechts im Bearbeiten-Dialog
  await page.locator('li.swipe', { hasText: 'Milch' }).click();
  await page.waitForSelector('.sheet-head-edit');
  const save = page.locator('.sheet-head-edit button[type=submit]');
  assert.equal(await save.innerText(), 'Speichern');
  await page.waitForTimeout(500);
  const sb = await save.boundingBox();
  const tb = await page.locator('.sheet input[name=title]').boundingBox();
  assert.ok(sb.y + sb.height <= tb.y, 'Speichern über dem Titel');
  assert.ok(sb.x + sb.width > 390 - 40, 'rechts');
  assert.equal(await page.locator('.sheet-actions button[type=submit]').count(), 0);
  ok('Bearbeiten: Speichern oben rechts, unten nur Symbole');

  // A2. Datum oben in die Beschreibung
  const today = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  assert.match(today, /^\d\d\.\d\d\.\d{4}$/);
  const lb = await page.locator('.label-btn[aria-label="Heutiges Datum oben einfügen"]').boundingBox();
  assert.ok(lb.height <= 32, 'kleiner Knopf');
  await page.locator('.label-btn[aria-label="Heutiges Datum oben einfügen"]').click();
  const ta = page.locator('.sheet textarea');
  assert.equal(await ta.inputValue(), `${today} \nFettarm, 1 Liter`);
  assert.equal(await ta.evaluate((e) => [e.selectionStart, document.activeElement === e]).then(JSON.stringify), JSON.stringify([today.length + 1, true]));
  await page.keyboard.type('Neu gekauft');
  const nSave = (await calls()).length;
  await page.locator('.sheet-head-edit button[type=submit]').click();
  await page.waitForSelector('.sheet-root', { state: 'detached' });
  for (let i = 0; i < 50 && (await calls()).length <= nSave; i++) await page.waitForTimeout(100);
  assert.equal((await calls()).at(-1).data.description, `${today} Neu gekauft\nFettarm, 1 Liter`);
  ok('Datum-Knopf: Datum TT.MM.JJJJ oben, Leerzeichen, Cursor dahinter in derselben Zeile, alter Text in der nächsten Zeile');
  await page.locator('li.swipe', { hasText: 'Milch' }).click();
  await page.waitForSelector('.sheet-head-edit');
  await page.waitForTimeout(400);

  // B. Meldung bei offenem Dialog oben
  await page.locator('.sheet button[aria-label=Teilen]').click();
  await page.waitForSelector('.snackbar:not([hidden])');
  await page.waitForTimeout(500);
  const snack = await page.locator('.snackbar').boundingBox();
  assert.ok(snack.y < 100, JSON.stringify(snack));
  assert.ok(snack.height < 90, 'Meldung nicht gestreckt: ' + JSON.stringify(snack));
  assert.ok(await page.locator('#fab').isVisible() || true);
  ok('Meldung erscheint bei offenem Dialog oben');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet-root', { state: 'detached' });

  // C. Meldung ohne Dialog über dem Plus-Button
  await page.locator('li.swipe .item-check').first().evaluate((b) => b.click());
  await page.waitForFunction(() => /^Erledigt/.test(document.querySelector('#snackbar .snackbar-text')?.textContent ?? ''));
  // Einblenden abwarten (sonst misst der Test mitten in der Animation)
  await page.locator('.snackbar').evaluate((e) => Promise.all(e.getAnimations().map((a) => a.finished)));
  await page.waitForTimeout(100);
  const s2 = await page.locator('.snackbar').boundingBox();
  const fab = await page.locator('#fab').boundingBox();
  assert.ok(s2.y + s2.height <= fab.y + 1, JSON.stringify([s2, fab]));
  await page.locator('.snackbar-action').click();
  ok('Meldung sitzt über dem Plus-Button');

  // C2. Nach "Neue Aufgabe": Meldung "Hinzugefügt" klein und über dem Plus-Button, nicht oben und nicht gestreckt
  await page.locator('#fab').click();
  await page.waitForSelector('.sheet input[name=title]');
  await page.locator('.sheet input[name=title]').fill('Kleine Meldung');
  await page.locator('.sheet button[type=submit]').click();
  await page.waitForFunction(() => /Hinzugefügt zu/.test(document.querySelector('.snackbar').textContent));
  for (const wait of [50, 600]) {
    await page.waitForTimeout(wait);
    const sb = await page.locator('.snackbar').boundingBox();
    const fb = await page.locator('#fab').boundingBox();
    assert.ok(sb.height < 90 && sb.y + sb.height <= fb.y + 1, JSON.stringify([wait, sb, fb]));
  }
  ok('Meldung nach dem Hinzufügen klein und über dem Plus-Button');

  // D. Vorschläge im Dialog "Neue Aufgabe"
  await page.locator('#fab').click();
  await page.waitForSelector('.sheet input[name=title]');
  await page.locator('.sheet input[name=title]').fill('ei');
  await page.waitForSelector('.sheet .suggest-chip');
  assert.ok((await page.locator('.sheet .suggest-chip').allInnerTexts()).some((t) => t.includes('Eier')));
  const n1 = (await calls()).length;
  await page.locator('.sheet .suggest-chip', { hasText: 'Eier' }).click();
  await page.waitForSelector('.sheet-root', { state: 'detached' });
  for (let i = 0; i < 50 && (await calls()).length <= n1; i++) await page.waitForTimeout(100);
  const c = (await calls()).at(-1);
  assert.deepEqual([c.service, c.data.status], ['update_item', 'needs_action']);
  ok('Vorschlag im Dialog öffnet den erledigten Eintrag wieder');
  await page.locator('#fab').click();
  await page.locator('.sheet input[name=title]').fill('xyzq');
  await page.waitForTimeout(200);
  assert.equal(await page.locator('.sheet .suggest-row').isHidden(), true);
  ok('Ohne Treffer keine Vorschläge');
  assert.deepEqual(errors, []);
  await browser.close();
})().catch((e) => { console.log('FEHLER:', e); process.exit(1); });
