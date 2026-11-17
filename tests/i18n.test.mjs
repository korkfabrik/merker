// Prüft die Übersetzungen: jeder Schlüssel im Code steht in jeder Sprachdatei, keine verwaisten Schlüssel,
// gleiche Platzhalter in allen Sprachen, keine deutschen Texte mehr fest im Code.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const ROOT = process.env.MERKER_DIR || new URL('../app', import.meta.url).pathname;
const files = [...fs.readdirSync(`${ROOT}/js`).filter((f) => f.endsWith('.js')).map((f) => `js/${f}`), ...fs.readdirSync(`${ROOT}/js/views`).map((f) => `js/views/${f}`)];
const sources = Object.fromEntries(files.map((f) => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]));
const html = fs.readFileSync(`${ROOT}/index.html`, 'utf8');
const used = new Set();
for (const src of Object.values(sources)) for (const m of src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').matchAll(/\bt\('([\w.]+)'/g)) used.add(m[1]);
for (const m of html.matchAll(/data-i18n(?:-label)?="([\w.]+)"/g)) used.add(m[1]);
const langs = fs.readdirSync(`${ROOT}/locales`).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
const dicts = Object.fromEntries(langs.map((l) => [l, JSON.parse(fs.readFileSync(`${ROOT}/locales/${l}.json`, 'utf8'))]));
const placeholders = (v) => [...new Set(JSON.stringify(v).match(/\{\w+\}/g) ?? [])].sort().join(',');
let errors = [];
for (const [lang, dict] of Object.entries(dicts)) {
  for (const key of used) if (!(key in dict)) errors.push(`${lang}: Schlüssel fehlt: ${key}`);
  for (const key of Object.keys(dict)) if (key !== 'meta.locale' && !used.has(key)) errors.push(`${lang}: Schlüssel ungenutzt: ${key}`);
  for (const key of Object.keys(dicts.de)) if (key in dict && placeholders(dict[key]) !== placeholders(dicts.de[key])) errors.push(`${lang}: Platzhalter weichen ab: ${key}`);
}
// Deutsche Texte fest im Code (Umlaute oder typische Wörter in Zeichenketten), außer Startschutz und Konsolenausgaben
const ALLOWED_FILES = new Set(['js/boot.js', 'js/shopicons.js']); // shopicons: Stichwörter zum Erkennen, keine Anzeigetexte
for (const [file, src] of Object.entries(sources)) {
  if (ALLOWED_FILES.has(file)) continue;
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//') && !/console\.(warn|error|log)|new Error\('Sprachdatei|throw new Error\('abgebrochen/.test(l)).join('\n');
  for (const m of code.matchAll(/'([^'\n]*)'|`([^`]*)`/g)) {
    const s = m[1] ?? m[2];
    if (/[äöüÄÖÜß]/.test(s) || /\b(Eintrag|Liste|Aufgabe|offen|Fehler|Keine|Neue)\b/.test(s)) errors.push(`${file}: deutscher Text im Code: ${s.slice(0, 60)}`);
  }
}
if (errors.length) {
  console.log(errors.join('\n'));
  process.exit(1);
}
assert.ok(used.size > 100);
console.log(`i18n: ${used.size} Schlüssel, Sprachen ${langs.join(', ')}, alles vollständig`);
