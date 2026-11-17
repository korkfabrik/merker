const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = 'http://localhost:8123';
const APP = `${BASE}/local/merker/index.html`;
const calls = async () => (await fetch(`${BASE}/__mock/calls`)).json();
const items = async (e) => (await fetch(`${BASE}/__mock/items?entity=${e}`)).json();
const ok = (n) => console.log('OK  ', n);
const waitCalls = async (page, n, count) => {
  for (let i = 0; i < 80; i++) {
    const c = (await calls()).slice(n);
    if (c.length >= count) return c;
    await page.waitForTimeout(100);
  }
  return (await calls()).slice(n);
};
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ locale: 'de-DE', viewport: { width: 390, height: 800 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const paste = (text) => page.locator('.sheet input[name=title]').evaluate((el, value) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', value);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, text);
  await page.goto(APP);
  await page.waitForSelector('.list-tile');
  await page.goto(`${APP}#/liste/todo.haushalt`);
  await page.waitForSelector('li.swipe');

  // A. Einfügen: Vorschau, einzelne Aufgaben in Reihenfolge
  await page.locator('#fab').click();
  await page.waitForSelector('.sheet input[name=title]');
  await paste('[08.11., 14:32] Philine: Fenster putzen\n- Keller aufräumen\n! Rasen mähen\n\nFenster putzen');
  await page.waitForSelector('.multi-box:not([hidden])');
  assert.equal(await page.locator('.sheet input[name=title]').inputValue(), '');
  assert.match(await page.locator('.multi-head').innerText(), /3 Zeilen erkannt/);
  assert.deepEqual(await page.locator('.multi-list li').allInnerTexts(), ['Fenster putzen', 'Keller aufräumen', '❗Rasen mähen']);
  const n0 = (await calls()).length;
  await page.locator('.multi-actions .btn-primary').click();
  await page.waitForSelector('.sheet-root', { state: 'detached' });
  const added = (await waitCalls(page, n0, 3)).filter((c) => c.service === 'add_item');
  assert.deepEqual(added.map((c) => [c.data.item, c.target.entity_id]), [['Fenster putzen', 'todo.haushalt'], ['Keller aufräumen', 'todo.haushalt'], ['❗ Rasen mähen', 'todo.haushalt']]);
  await page.waitForFunction(() => /3 Aufgaben zu Haushalt hinzugefügt/.test(document.querySelector('.snackbar').textContent));
  ok('Eingefügte Zeilen werden aufgeräumt und als einzelne Aufgaben in Reihenfolge angelegt');

  // B. Rückgängig entfernt alle drei
  await page.waitForFunction(() => document.querySelectorAll('li.swipe').length >= 4);
  const n1 = (await calls()).length;
  await page.locator('.snackbar-action').click();
  const removed = (await waitCalls(page, n1, 3)).filter((c) => c.service === 'remove_item');
  assert.equal(removed.length, 3);
  for (let i = 0; i < 30 && (await items('todo.haushalt')).length !== 1; i++) await page.waitForTimeout(100);
  assert.deepEqual((await items('todo.haushalt')).map((x) => x.summary), ['Rauchmelder testen']);
  ok('Rückgängig entfernt alle neu angelegten Aufgaben');

  // C. Als Unteraufgaben
  await page.locator('#fab').click();
  await page.waitForSelector('.sheet input[name=title]');
  await paste('Bohrer\nDübel\nSchrauben');
  await page.locator('.multi-actions button', { hasText: 'Als Checkliste' }).click();
  assert.equal(await page.locator('.multi-box').isHidden(), true);
  assert.deepEqual(await page.locator('.new-sub .new-sub-text').allInnerTexts(), ['Bohrer', 'Dübel', 'Schrauben']);
  assert.equal(await page.locator('.sheet input[name=title]').getAttribute('placeholder'), 'Titel für die Unteraufgaben');
  await page.locator('.sheet input[name=title]').fill('Regal aufhängen');
  const n2 = (await calls()).length;
  await page.locator('.sheet button[type=submit]').click();
  const c2 = (await waitCalls(page, n2, 1))[0];
  assert.deepEqual([c2.service, c2.data.item, c2.data.description], ['add_item', 'Regal aufhängen', '- [ ] Bohrer\n- [ ] Dübel\n- [ ] Schrauben']);
  ok('Als Checkliste: eine Aufgabe mit Unteraufgaben');

  // D. Eine Zeile: normales Einfügen, keine Vorschau. "Als eine Aufgabe" schließt die Vorschau.
  await page.waitForSelector('.sheet-root', { state: 'detached' });
  await page.locator('#fab').click();
  await page.waitForSelector('.sheet input[name=title]');
  await paste('Nur eine Zeile');
  await page.waitForTimeout(150);
  assert.equal(await page.locator('.multi-box').isHidden(), true);
  await paste('A\nB');
  await page.locator('.multi-head button').click();
  assert.equal(await page.locator('.multi-box').isHidden(), true);
  ok('Eine Zeile ohne Vorschau, Vorschau lässt sich schließen');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet-root', { state: 'detached' });

  // E. Ab 50 Zeilen Rückfrage
  await page.locator('#fab').click();
  await page.waitForSelector('.sheet input[name=title]');
  await paste(Array.from({ length: 55 }, (_, i) => `Punkt ${i + 1}`).join('\n'));
  assert.match(await page.locator('.multi-list').innerText(), /und 47 weitere/);
  const n3 = (await calls()).length;
  await page.locator('.multi-actions .btn-primary').click();
  assert.match(await page.locator('.multi-actions .btn-primary').innerText(), /Wirklich 55 anlegen/);
  assert.equal((await calls()).length, n3);
  assert.equal(await page.locator('.sheet').count(), 1);
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet-root', { state: 'detached' });
  ok('Ab 50 Zeilen fragt die App noch einmal nach');

  // F. Teilen an Merker mit mehreren Zeilen
  await page.goto(`${APP}?title=&text=${encodeURIComponent('Milch\nEier\nBrot')}`);
  await page.waitForSelector('.multi-box:not([hidden])');
  assert.match(await page.locator('.multi-head').innerText(), /3 Zeilen erkannt/);
  assert.equal(await page.locator('.sheet input[name=title]').inputValue(), '');
  await page.locator('.multi-head button').click();
  assert.equal(await page.locator('.sheet input[name=title]').inputValue(), 'Milch');
  assert.equal(await page.locator('.sheet textarea').inputValue(), 'Eier\nBrot');
  ok('Geteilter Text mit mehreren Zeilen zeigt die Vorschau, schließen ergibt die bisherige Einzelaufgabe');

  assert.deepEqual(errors, []);
  await browser.close();
})().catch((e) => { console.log('FEHLER:', e); process.exit(1); });
