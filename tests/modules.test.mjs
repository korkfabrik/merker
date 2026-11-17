// Lädt jedes Modul der App in Node. Fehler wegen fehlendem Browser (document, window …) sind erwartet, Syntaxfehler nicht.
import fs from 'node:fs';
const ROOT = new URL('../app', import.meta.url).pathname;
const files = [...fs.readdirSync(`${ROOT}/js`).filter((f) => f.endsWith('.js')).map((f) => `js/${f}`), ...fs.readdirSync(`${ROOT}/js/views`).map((f) => `js/views/${f}`)].filter((f) => f !== 'js/boot.js');
const bad = [];
for (const f of files) {
  try {
    await import(`${ROOT}/${f}`);
  } catch (e) {
    if (e instanceof SyntaxError || !/document|window|localStorage|navigator|location|fetch|self|HTMLElement|matchMedia|history/.test(e.message)) bad.push(`${f}: ${e.message}`);
  }
}
if (bad.length) {
  console.log(bad.join('\n'));
  process.exit(1);
}
console.log(`modules: ${files.length} Module ohne Syntaxfehler`);
