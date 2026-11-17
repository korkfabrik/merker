const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = 'http://localhost:8123';
const APP = `${BASE}/local/merker/index.html`;
const getJson = async (p) => (await fetch(`${BASE}${p}`)).json();
const calls = () => getJson('/__mock/calls');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (n) => console.log('OK  ', n);
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ locale: 'de-DE', viewport: { width: 412, height: 860 }, hasTouch: true, colorScheme: 'dark' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(APP);
  await page.waitForSelector('.list-tile');

  // A. Neue Aufgabe mit Datum über den Hinzufügen-Eintrag
  await page.locator('.list-tile', { hasText: 'Einkaufsliste' }).click();
  await page.waitForSelector('#fab');
  await page.locator('#fab').click();
  await page.waitForSelector('.sheet input[name=title]');
  assert.equal(await page.locator('.sheet .field-label', { hasText: 'Fälligkeit' }).count(), 1);
  await page.locator('.sheet input[name=due]').fill('2026-12-24');
  await page.locator('.sheet input[name=title]').fill('Geschenke');
  const n0 = (await calls()).length;
  await page.locator('.sheet button[type=submit]').click();
  await page.waitForFunction((n) => fetch('/__mock/calls').then((r) => r.json()).then((c) => c.length > n), n0);
  const c = (await calls()).at(-1);
  assert.equal(c.service, 'add_item');
  assert.equal(c.data.due_date, '2026-12-24');
  assert.equal(c.target.entity_id, 'todo.einkaufsliste');
  ok('Eintrag mit Datum angelegt, Liste vorausgewählt');

  // B. Alle löschen mit Rückgängig
  await page.evaluate(() => fetch('/__mock/noop').catch(() => {}));
  const doneCount = async () => (await getJson('/__mock/items?entity=todo.einkaufsliste')).filter((i) => i.status === 'completed').length;
  // zwei Einträge erledigen
  const rows = page.locator('#content > ul > li.swipe');
  for (let i = 0; i < 2; i++) {
    await rows.first().locator('.item-check').evaluate((b) => b.click());
    await sleep(350);
  }
  await page.waitForFunction(() => document.querySelector('.done-section'));
  const before = await doneCount();
  assert.ok(before >= 2);
  assert.equal(await page.locator('.done-clear').isVisible(), false);
  await page.locator('.done-section summary').click();
  assert.equal(await page.locator('.done-clear').isVisible(), true);
  await page.locator('.done-clear').click();
  await page.waitForFunction(() => !document.querySelector('.done-section'));
  assert.equal(await doneCount(), 0);
  await page.waitForFunction(() => /erledigte Einträge gelöscht/.test(document.querySelector('.snackbar').textContent), null, { timeout: 8000 });
  ok('Alle löschen entfernt die erledigten, Meldung mit Rückgängig');
  await page.locator('.snackbar-action').click();
  await page.waitForFunction((n) => document.querySelector('.done-section')?.querySelector('summary')?.textContent.includes(`(${n})`), before, { timeout: 8000 });
  assert.equal(await doneCount(), before);
  ok('Rückgängig stellt die Einträge wieder als erledigt her');

  // C. Teilen an Merker
  await page.goto(APP + '?title=Spannende%20Seite&text=https%3A%2F%2Fexample.com%2Fa');
  await page.waitForSelector('.sheet[aria-label="Neue Aufgabe"]');
  assert.equal(await page.locator('.sheet input[name=title]').inputValue(), 'Spannende Seite');
  assert.equal(await page.locator('.sheet textarea[name=description]').inputValue(), 'https://example.com/a');
  assert.equal(new URL(page.url()).search, '');
  const n1 = (await calls()).length;
  await page.locator('.sheet button[type=submit]').click();
  await page.waitForFunction((n) => fetch('/__mock/calls').then((r) => r.json()).then((c) => c.length > n), n1);
  const s = (await calls()).at(-1);
  assert.deepEqual([s.service, s.data.item, s.data.description], ['add_item', 'Spannende Seite', 'https://example.com/a']);
  ok('Teilen öffnet "Neue Aufgabe" mit Titel und Beschreibung, Adresse bereinigt');

  // D. Kurzbefehl
  await page.goto(APP + '?neu=1');
  await page.waitForSelector('.sheet[aria-label="Neue Aufgabe"]');
  assert.equal(await page.locator('.sheet input[name=title]').inputValue(), '');
  ok('Kurzbefehl öffnet leere "Neue Aufgabe"');

  // E. Manifest
  const m = await (await fetch(`${BASE}/local/merker/manifest.json`)).json();
  assert.equal(m.share_target.params.text, 'text');
  assert.equal(m.shortcuts.length, 2);
  assert.deepEqual(m.shortcuts.map((s) => s.url), ['./index.html?neu=1', './index.html?einkauf=1']);
  ok('Manifest hat Teilen-Ziel und die Kurzbefehle Neue Aufgabe und Einkaufsliste');

  assert.deepEqual(errors, []);
  ok('Keine Seitenfehler');
  await browser.close();
})().catch((e) => { console.log('FEHLER:', e); process.exit(1); });
