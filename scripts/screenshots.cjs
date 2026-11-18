// Screenshots für das README: startet den nachgebauten HA-Server mit Beispieldaten und fotografiert die App.
// Aufruf: node scripts/screenshots.cjs   Ergebnis: docs/screenshots/<sprache>/*.png
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const BASE = 'http://localhost:8123';
const APP = `${BASE}/local/merker/index.html`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function startMock(lang) {
  const proc = spawn('node', [path.join(ROOT, 'tests/mock-ha.mjs')], {
    env: { ...process.env, MOCK_LISTS: path.join(ROOT, 'scripts/demo-data.mjs'), MOCK_LANG: lang },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve, reject) => {
    proc.stdout.on('data', (d) => d.toString().includes('Mock-HA') && resolve());
    proc.on('exit', (code) => reject(new Error(`Mock-HA beendet: ${code}`)));
  });
  return proc;
}

async function shoot(browser, lang, scheme, out) {
  const context = await browser.newContext({
    locale: lang === 'de' ? 'de-DE' : 'en-US',
    viewport: { width: 412, height: 860 },
    deviceScaleFactor: 2,
    colorScheme: scheme,
  });
  // Einkauf als Einkaufsliste markieren, feste Listenfarben
  await context.addInitScript(() => {
    localStorage.setItem('merker.shoppingLists', JSON.stringify(['todo.groceries']));
    localStorage.setItem('merker.listHues', JSON.stringify({ 'todo.groceries': 160, 'todo.household': 215, 'todo.errands': 25 }));
  });
  const page = await context.newPage();
  const settle = async () => {
    await page.evaluate(() => document.fonts.ready);
    await sleep(600);
  };
  const go = async (hash, selector) => {
    await page.evaluate((h) => { location.hash = h; }, hash);
    await page.waitForSelector(selector);
    await settle();
  };
  const snap = (name) => page.screenshot({ path: path.join(out, `${name}${scheme === 'dark' ? '-dark' : ''}.png`) });

  await page.goto(APP);
  await page.waitForSelector('.list-tile');
  await page.waitForSelector('.due-list .item-title');
  await settle();
  await snap('home');
  if (scheme === 'dark') return context.close();

  await go('#/liste/todo.household', 'li.swipe');
  await snap('list');
  await go('#/liste/todo.household/h2', '.sheet');
  await snap('task');
  await go('#/liste/todo.groceries', '#content');
  await snap('shopping');
  await go('#/woche', '#content li, #content .week-day, #content h2');
  await snap('week');
  await context.close();
}

(async () => {
  for (const lang of ['en', 'de']) {
    const out = path.join(ROOT, 'docs/screenshots', lang);
    fs.mkdirSync(out, { recursive: true });
    const mock = await startMock(lang);
    const browser = await chromium.launch({ args: [`--lang=${lang === 'de' ? 'de-DE' : 'en-US'}`], env: { ...process.env, LANG: lang === 'de' ? 'de_DE.UTF-8' : 'en_US.UTF-8', LANGUAGE: lang === 'de' ? 'de' : 'en' } });
    try {
      await shoot(browser, lang, 'light', out);
      await shoot(browser, lang, 'dark', out);
    } finally {
      await browser.close();
      mock.kill();
    }
    console.log(`${lang}: ${fs.readdirSync(out).join(', ')}`);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
