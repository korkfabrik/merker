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
  const page = await (await browser.newContext({ locale: 'de-DE', viewport: { width: 390, height: 900 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await fetch(`${BASE}/__mock/add-item?entity=todo.haushalt&summary=Fenster&due=${plus(3)}`, { method: 'POST' });
  await fetch(`${BASE}/__mock/add-item?entity=todo.haushalt&summary=Weit%20weg&due=${plus(9)}`, { method: 'POST' });
  await page.goto(APP);
  await page.waitForSelector('.list-tile');

  // Knopf oben öffnet die Woche
  await page.locator('#btn-week').click();
  await page.waitForSelector('.week-day-head');
  assert.match(page.url(), /#\/woche$/);
  assert.match(await page.locator('#view-title').innerText(), /^KW \d+(\/\d+)?$/);
  assert.equal(await page.locator('.week-day-head').count(), 7);
  assert.match(await page.locator('.week-day-head').first().textContent(), /^Heute/);
  assert.match(await page.locator('.week-day-head').nth(1).textContent(), /^Morgen/);
  assert.match(await page.locator('.list-group-title.is-overdue').textContent(), /Überfällig \(1\)/);
  const day3 = page.locator(`.week-day-head[data-day="${plus(3)}"]`);
  assert.match(await day3.innerText(), /\(1\)/);
  const titles = await page.locator('#content .item-title').allInnerTexts();
  assert.ok(titles.includes('Fenster') && titles.includes('Milch') && titles.includes('Altpapier rausstellen'));
  assert.ok(!titles.includes('Weit weg'));
  assert.ok((await page.locator('.week-empty').count()) >= 3);
  assert.equal(await page.locator('.week-prev').isDisabled(), true);
  ok('Woche: 7 Tage mit Heute und Morgen, Überfälliges oben, leere Tage mit Hinweis');

  // Nächste Woche und zurück
  await page.locator('.week-next').click();
  await page.waitForFunction(() => [...document.querySelectorAll('#content .item-title')].some((e) => e.textContent === 'Weit weg'));
  assert.equal(await page.locator('.list-group-title.is-overdue').count(), 0);
  await page.locator('.week-nav .label-btn', { hasText: 'Ab heute' }).click();
  await page.waitForFunction(() => /^Heute/.test(document.querySelector('.week-day-head').textContent));
  ok('Blättern in die nächste Woche und zurück');

  // Plus am Tag legt eine Aufgabe mit diesem Datum an
  await day3.locator('.label-btn').click();
  await page.waitForSelector('.sheet input[name=title]');
  assert.equal(await page.locator('.sheet input[name=due]').inputValue(), plus(3));
  await page.locator('.sheet input[name=title]').fill('Geburtstag vorbereiten');
  const n = (await calls()).length;
  await page.locator('.sheet button[type=submit]').click();
  for (let i = 0; i < 50 && (await calls()).length <= n; i++) await page.waitForTimeout(100);
  assert.equal((await calls()).at(-1).data.due_date, plus(3));
  await page.waitForFunction((d) => document.querySelector(`.week-day-head[data-day="${d}"]`).textContent.includes('(2)'), plus(3));
  ok('Plus am Tag: neue Aufgabe mit diesem Datum, erscheint gleich am Tag');

  // Aufgabe öffnen und zurück zur Woche
  await page.waitForSelector('.sheet-root', { state: 'detached' });
  await page.locator('li.swipe', { hasText: 'Fenster' }).click();
  await page.waitForSelector('.sheet-head-edit');
  await page.goBack();
  await page.waitForFunction(() => location.hash === '#/woche');
  await page.waitForSelector('.week-day-head');
  ok('Aufgabe öffnen und zurück landet wieder in der Woche');

  // Datum nur bei Überfälligem, Tage einklappen
  assert.equal(await page.locator(`.week-day-head[data-day="${plus(3)}"] + ul .chip`).count(), 0);
  assert.ok((await page.locator('#content .chip-overdue').count()) >= 1);
  await day3.locator('.week-day-toggle').click();
  await page.waitForFunction((d) => document.querySelector(`.week-day-head[data-day="${d}"]`).classList.contains('is-collapsed'), plus(3));
  assert.equal(await page.locator(`.week-day-head[data-day="${plus(3)}"] + ul`).count(), 0);
  assert.equal(await day3.locator('.week-day-toggle').getAttribute('aria-expanded'), 'false');
  assert.ok(!(await page.locator('#content').innerText()).includes('null'));
  await day3.locator('.week-day-toggle').click();
  await page.waitForSelector(`.week-day-head[data-day="${plus(3)}"] + ul`);
  assert.equal(await page.locator('.week-today').isDisabled(), true);
  ok('Datum nur bei Überfälligem, Tag ein- und ausklappen');

  // KW: Anzeige, Auswahl, freie Eingabe
  const kwText = await page.locator('#view-title').innerText();
  assert.match(kwText, /^KW \d+(\/\d+)?$/);
  const kw = Number(kwText.match(/\d+/)[0]);
  await page.locator('.week-range').click();
  await page.waitForSelector('.pick-row');
  assert.equal(await page.locator('.pick-row').count(), 13);
  assert.match(await page.locator('.pick-row').nth(1).innerText(), new RegExp(`KW ${kw === 53 || kw === 52 ? '\\d+' : kw + 1}`));
  await page.locator('.pick-row').nth(1).click();
  await page.waitForSelector('.sheet-root', { state: 'detached' });
  await page.waitForFunction(() => !document.querySelector('.week-prev').disabled);
  const first = await page.locator('.week-day-head').first().getAttribute('data-day');
  assert.equal(new Date(first + 'T12:00').getDay(), 1);
  ok('Zeitraum antippen: Wochenauswahl, nächste Woche beginnt am Montag');
  await page.locator('#view-title').click();
  await page.waitForSelector('.pick-number');
  const target = kw >= 50 ? 2 : kw + 3;
  await page.locator('.pick-number').fill(String(target));
  await page.locator('.pick-number-form button').click();
  await page.waitForFunction((n) => document.querySelector('#view-title').textContent === `KW ${n}`, target);
  assert.equal(new Date((await page.locator('.week-day-head').first().getAttribute('data-day')) + 'T12:00').getDay(), 1);
  await page.waitForSelector('.sheet-root', { state: 'detached' });
  await page.locator('#view-title').click();
  await page.locator('.pick-number').fill('99');
  await page.locator('.pick-number-form button').click();
  await page.waitForTimeout(200);
  assert.equal(await page.locator('.pick-number').count(), 1);
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet-root', { state: 'detached' });
  await page.locator('.week-today').click();
  await page.waitForFunction(() => /^Heute/.test(document.querySelector('.week-day-head').textContent));
  assert.ok(!(await page.locator('#content').innerText()).includes('null'));
  ok('KW antippen: frei eingeben, ungültige bleibt offen, Ab heute zurück');

  // Titel woanders nicht antippbar
  await page.goto(APP + '#/');
  await page.waitForSelector('.list-tile');
  assert.equal(await page.locator('#view-title.is-tappable').count(), 0);
  await page.locator('.list-tile-new, .new-list-tile, .list-tile', { hasText: 'Neue Liste' }).first().click();
  await page.waitForSelector('.newlist-hint');
  assert.match(await page.locator('.newlist-hint').innerText(), /lokale To-do-Liste/);
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet-root', { state: 'detached' });
  ok('Neue Liste: Hinweis auf lokale To-do-Liste')

  // Listenansicht zeigt Anzahl offener Aufgaben
  await page.goto(APP + '#/');
  await page.locator('.list-tile').first().click();
  await page.waitForSelector('.open-count');
  assert.match(await page.locator('.open-count').innerText(), /^\d+ offen$/);
  ok('Listenansicht: Anzahl offen');
  assert.deepEqual(errors, []);
  await browser.close();
})().catch((e) => { console.log('FEHLER:', e); process.exit(1); });
