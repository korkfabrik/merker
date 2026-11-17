const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = 'http://localhost:8123';
const APP = `${BASE}/local/merker/index.html`;
const calls = async () => (await fetch(`${BASE}/__mock/calls`)).json();
const items = async (id) => (await fetch(`${BASE}/__mock/items?entity=${id}`)).json();
const post = (p) => fetch(BASE + p, { method: 'POST' });
const ok = (n) => console.log('OK  ', n);
const pad = (n) => String(n).padStart(2, '0');
const plus = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ locale: 'de-DE', viewport: { width: 390, height: 860 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const offline = () => page.waitForFunction(() => /Keine Verbindung|Verbinde/.test(document.querySelector('#banner').textContent), null, { timeout: 8000 });
  const addTask = async (title) => {
    await page.locator('#fab').click();
    await page.locator('.sheet input[name=title]').fill(title);
    await page.locator('.sheet button[type=submit]').click();
    await page.waitForSelector('.sheet-root', { state: 'detached' });
  };

  // Kaputte Adresse: Startseite statt Absturz
  await page.goto(`${APP}#/liste/%E0`);
  await page.waitForSelector('.list-tile');
  ok('Kaputte Adresse führt zur Startseite');

  // 1. Liste nach dem Wiederverbinden nicht verfügbar: Änderung wartet
  await page.goto(`${APP}#/liste/todo.haushalt`);
  await page.waitForSelector('li.swipe');
  await post('/__mock/drop?ms=4000');
  await offline();
  await addTask('Wartet auf Liste');
  await post('/__mock/unavailable?entity=todo.haushalt&on=1');
  const n1 = (await calls()).length;
  await page.waitForFunction(() => /wird gesendet|Änderung/.test(document.querySelector('#banner').textContent) && !/Keine Verbindung|Verbinde/.test(document.querySelector('#banner').textContent), null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  assert.equal((await calls()).slice(n1).filter((c) => c.service === 'add_item').length, 0, 'nichts gesendet, solange die Liste fehlt');
  assert.ok(JSON.parse(await page.evaluate(() => localStorage.getItem('merker.queue'))).length === 1);
  await post('/__mock/unavailable?entity=todo.haushalt&on=0');
  await page.waitForFunction(() => document.querySelector('#banner').hidden, null, { timeout: 15000 });
  assert.equal((await items('todo.haushalt')).filter((i) => i.summary === 'Wartet auf Liste').length, 1);
  ok('Vorgemerkte Änderung wartet, bis die Liste wieder verfügbar ist');

  // 2. Verbindung reißt beim Senden ab: keine doppelte Aufgabe
  await post('/__mock/drop?ms=3000');
  await offline();
  await addTask('Nur einmal');
  await post('/__mock/drop-on-add');
  const n2 = (await calls()).length;
  await page.waitForFunction(() => document.querySelector('#banner').hidden, null, { timeout: 30000 });
  assert.equal((await calls()).slice(n2).filter((c) => c.service === 'add_item').length, 1, 'nur einmal gesendet');
  assert.equal((await items('todo.haushalt')).filter((i) => i.summary === 'Nur einmal').length, 1);
  assert.equal(await page.locator('li.swipe', { hasText: 'Nur einmal' }).count(), 1);
  assert.equal(await page.evaluate(() => localStorage.getItem('merker.queue')), null);
  ok('Abgerissenes Anlegen wird nicht doppelt gesendet');

  // 3. Uhrzeit bleibt beim Ändern des Datums und beim Rückgängig nach Löschen
  await post(`/__mock/add-item?entity=todo.haushalt&summary=Termin&due=${plus(1)}T10:30:00`);
  await page.waitForFunction(() => [...document.querySelectorAll('.item-title')].some((e) => e.textContent === 'Termin'));
  await page.locator('li.swipe', { hasText: 'Termin' }).click();
  await page.waitForSelector('.sheet-head-edit');
  await page.locator('.sheet input[name=due]').fill(plus(4));
  const n3 = (await calls()).length;
  await page.locator('.sheet button[type=submit]').click();
  let c;
  for (let i = 0; i < 50 && !(c = (await calls()).slice(n3).find((x) => x.service === 'update_item')); i++) await page.waitForTimeout(100);
  assert.equal(c.data.due_datetime, `${plus(4)}T10:30:00`);
  assert.ok(!('due_date' in c.data));
  ok('Datum ändern behält die Uhrzeit');

  // 4. Abmelden löscht wartende Änderungen und Verläufe
  await page.waitForSelector('.sheet-root', { state: 'detached' });
  await post('/__mock/drop?ms=2500');
  await offline();
  await addTask('Bleibt nicht liegen');
  await page.evaluate(() => localStorage.setItem('merker.recentSearches', '["geheim"]'));
  assert.ok(await page.evaluate(() => localStorage.getItem('merker.queue')));
  await page.goto(`${APP}#/einstellungen`);
  await page.waitForSelector('.menu-row.is-danger');
  await page.locator('.menu-row.is-danger').click();
  await page.locator('.pick-row', { hasText: 'Abmelden' }).click();
  await page.waitForFunction(() => localStorage.getItem('merker.queue') === null && localStorage.getItem('merker.recentSearches') === null && localStorage.getItem('merker.recents') === null, null, { timeout: 10000 });
  await page.waitForSelector('.list-tile', { timeout: 20000 });
  await page.waitForTimeout(800);
  assert.equal((await items('todo.haushalt')).filter((i) => i.summary === 'Bleibt nicht liegen').length, 0);
  ok('Abmelden löscht wartende Änderungen und Verläufe');

  assert.deepEqual(errors, []);
  await browser.close();
})().catch((e) => { console.log('FEHLER:', e); process.exit(1); });
