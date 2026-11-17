// Übersetzungen. Alle Texte der Oberfläche stehen in locales/<sprache>.json, der Code nutzt nur Schlüssel.
// t('sheet.save') liefert den Text, t('common.openCount', { n: 6 }) ersetzt {n}.
// Mehrzahl: Ist der Wert ein Objekt wie { "one": "…", "other": "…" }, wählt Intl.PluralRules anhand von n.
// Fehlt ein Text in der gewählten Sprache, gilt Deutsch, fehlt er auch dort, erscheint der Schlüssel.
// Dieses Modul lädt die Texte mit await, bevor andere Module ausgeführt werden. Darum darf t() auch beim Laden eines Moduls stehen.
//
// Neue Sprache: locales/en.json kopieren, übersetzen, hier in LANGUAGES eintragen und in sw.js unter ASSETS ergänzen.

export const LANGUAGES = [
  ['de', 'Deutsch'],
  ['en', 'English'],
];
export const FALLBACK = 'de';
// Gerätesprache wird nicht unterstützt: dann Englisch
const UNSUPPORTED_DEFAULT = 'en';
const KEY = 'merker.lang';

// Gewählte Einstellung: 'auto' oder ein Sprachcode
export function getLanguageSetting() {
  try {
    const value = localStorage.getItem(KEY);
    return LANGUAGES.some(([code]) => code === value) ? value : 'auto';
  } catch {
    return 'auto';
  }
}

// Speichert die Wahl und lädt die App neu, damit alle Texte in der neuen Sprache erscheinen.
export function setLanguageSetting(value) {
  try {
    if (value === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, value);
  } catch {
    // ohne Speicher bleibt es bei der Gerätesprache
  }
  location.reload();
}

const deviceLanguages = () => (typeof navigator !== 'undefined' && navigator.languages?.length ? navigator.languages : [typeof navigator !== 'undefined' ? navigator.language : FALLBACK]);

function resolveLanguage() {
  const setting = typeof localStorage === 'undefined' ? 'auto' : getLanguageSetting();
  if (setting !== 'auto') return setting;
  if (typeof document === 'undefined') return FALLBACK; // Node-Tests
  for (const tag of deviceLanguages()) {
    const code = String(tag).toLowerCase().split('-')[0];
    if (LANGUAGES.some(([known]) => known === code)) return code;
  }
  return UNSUPPORTED_DEFAULT;
}

export const lang = resolveLanguage();

async function load(code) {
  const url = new URL(`../locales/${code}.json`, import.meta.url);
  if (typeof document === 'undefined') {
    // Node (Tests ohne Browser)
    const { readFileSync } = await import('node:fs');
    return JSON.parse(readFileSync(url, 'utf8'));
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Sprachdatei ${code} fehlt (${response.status})`);
  return response.json();
}

let texts = {};
let fallbackTexts = {};
try {
  fallbackTexts = await load(FALLBACK);
  texts = lang === FALLBACK ? fallbackTexts : { ...fallbackTexts, ...(await load(lang)) };
} catch (err) {
  console.error(err);
}

// BCP-47-Kennung für Datums- und Zahlformate. Passt die Region des Geräts zur Sprache, gilt sie (zum Beispiel en-GB).
export const locale =
  (typeof document !== 'undefined' && deviceLanguages().find((tag) => String(tag).toLowerCase().split('-')[0] === lang && String(tag).includes('-'))) ||
  texts['meta.locale'] ||
  'de-DE';
const plurals = new Intl.PluralRules(locale);

export function t(key, vars = {}) {
  let value = texts[key] ?? fallbackTexts[key] ?? key;
  if (typeof value === 'object') value = value[plurals.select(Number(vars.n ?? 0))] ?? value.other ?? key;
  return String(value).replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}

// Feste Texte in index.html: data-i18n setzt den Inhalt, data-i18n-label das aria-label.
export function translateStatic(root = document) {
  document.documentElement.lang = lang;
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-label]')) el.setAttribute('aria-label', t(el.dataset.i18nLabel));
}
