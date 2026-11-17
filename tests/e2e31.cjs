const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = 'http://localhost:8123';
const APP = `${BASE}/local/merker/index.html`;
const calls = async () => (await fetch(`${BASE}/__mock/calls`)).json();
const items = async (e) => (await fetch(`${BASE}/__mock/items?entity=${e}`)).json();
const post = (p) => fetch(`${BASE}${p}`, { method: 'POST' });
const ok = (n) => console.log('OK  ', n);
(async () => {
  const browser = await browser0();
  async function browser0() { return chromium.launch(); }
  const page = await (await browser.newContext({ locale: 'de-DE', viewport: { width: 390, height: 860 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(APP);
  await page.waitForSelector('.list-tile');
  await page.waitForFunction(() => { try { return JSON.parse(localStorage.getItem('merker.snapshot'))?.t > 0; } catch { return false; } }, null, { timeout: 8000 });
  await page.goto(`${APP}#/liste/todo.einkaufsliste`);
  await page.waitForSelector('li.swipe');
  const n0 = (await calls()).length;

  // A. Verbindung weg: Änderungen werden vorgemerkt und sofort angezeigt
  await post('/__mock/drop?ms=14000');
  await page.waitForFunction(() => /Keine Verbindung|Verbinde/.test(document.querySelector('#banner').textContent), null, { timeout: 8000 });
  await page.locator('li.swipe', { hasText: 'Milch' }).locator('.item-check').click();
  await page.waitForFunction(() => /1 Änderung wartet/.test(document.querySelector('#banner').textContent));
  await page.locator('#fab').click();
  await page.locator('.sheet input[name=title]').fill('Offline-Test');
  await page.locator('.sheet button[type=submit]').click();
  await page.waitForSelector('.sheet-root', { state: 'detached' });
  await page.waitForFunction(() => [...document.querySelectorAll('.item-title')].some((e) => e.textContent === 'Offline-Test'));
  assert.equal(await page.locator('li.swipe', { hasText: 'Offline-Test' }).locator('.queued-mark').count(), 1);
  assert.equal(await page.locator('.done-section li.swipe', { hasText: 'Milch' }).count(), 1);
  // Neue Aufgabe offline umbenennen: wird ins Anlegen eingerechnet
  await page.locator('li.swipe', { hasText: 'Offline-Test' }).click();
  await page.waitForSelector('.sheet input[name=title]');
  await page.locator('.sheet input[name=title]').fill('Offline-Test neu');
  await page.locator('.sheet-head-edit button[type=submit]').click();
  await page.waitForSelector('.sheet-root', { state: 'detached' });
  await page.waitForFunction(() => /2 Änderungen warten/.test(document.querySelector('#banner').textContent));
  assert.equal((await calls()).length, n0, 'nichts gesendet, solange offline');
  ok('Offline: Abhaken und neue Aufgabe sofort sichtbar, mit Uhr markiert, Banner zählt wartende Änderungen');

  // B. Neuladen ohne Verbindung: Vorgemerktes bleibt
  await page.reload();
  await page.waitForSelector('li.swipe');
  await page.waitForFunction(() => [...document.querySelectorAll('.item-title')].some((e) => e.textContent === 'Offline-Test neu'));
  assert.equal(await page.locator('.done-section li.swipe', { hasText: 'Milch' }).count(), 1);
  ok('Nach Neuladen ohne Verbindung sind die vorgemerkten Änderungen noch da');

  // C. Verbindung zurück: alles wird in Reihenfolge gesendet
  await page.waitForFunction(() => document.querySelector('#banner').hidden, null, { timeout: 30000 });
  const sent = (await calls()).slice(n0);
  assert.deepEqual(sent.map((c) => c.service), ['update_item', 'add_item'], JSON.stringify(sent));
  assert.deepEqual([sent[0].data.item, sent[0].data.status], ['u2', 'completed']);
  assert.equal(sent[1].data.item, 'Offline-Test neu');
  const server = await items('todo.einkaufsliste');
  assert.equal(server.find((x) => x.uid === 'u2').status, 'completed');
  assert.equal(server.filter((x) => x.summary === 'Offline-Test neu').length, 1);
  await page.waitForFunction(() => !document.querySelector('.queued-mark'));
  assert.equal(await page.locator('li.swipe', { hasText: 'Offline-Test neu' }).count(), 1);
  assert.equal(await page.evaluate(() => localStorage.getItem('merker.queue')), null);
  ok('Verbindung zurück: Änderungen in Reihenfolge gesendet, keine doppelten Einträge, Warteschlange leer');

  // D. Abgelehnte Änderung: Meldung, Rest geht weiter
  await post('/__mock/drop?ms=6000');
  await page.waitForFunction(() => /Keine Verbindung|Verbinde/.test(document.querySelector('#banner').textContent), null, { timeout: 8000 });
  await page.locator('li.swipe', { hasText: 'Brot' }).locator('.item-check').click();
  await post('/__mock/fail-next');
  await page.waitForFunction(() => document.querySelector('#banner').hidden, null, { timeout: 30000 });
  await page.waitForFunction(() => /nicht übernommen/.test(document.querySelector('.snackbar').textContent), null, { timeout: 8000 });
  ok('Von Home Assistant abgelehnte Änderung wird gemeldet');

  assert.deepEqual(errors, []);
  await browser.close();
})().catch((e) => { console.log('FEHLER:', e); process.exit(1); });
