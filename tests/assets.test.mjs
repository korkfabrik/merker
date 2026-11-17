// Jede Datei in der Liste des Service Workers muss existieren (sonst käme kein Update mehr an)
import fs from 'node:fs';
const ROOT = new URL('../app', import.meta.url).pathname;
const sw = fs.readFileSync(`${ROOT}/sw.js`, 'utf8');
const list = [...sw.slice(sw.indexOf('const ASSETS'), sw.indexOf('];')).matchAll(/'\.\/([^']+)'/g)].map((m) => m[1]);
const missing = list.filter((f) => !fs.existsSync(`${ROOT}/${f}`));
if (missing.length) {
  console.log('assets: FEHLER, fehlt:', missing.join(', '));
  process.exit(1);
}
console.log(`assets: alle ${list.length} Dateien vorhanden`);
