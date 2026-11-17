// Akzentfarbe der ganzen App. Überschreibt nur die Farbvariablen. Ohne Wahl gilt das Standard-Blau aus app.css.
import { t } from './i18n.js';
const KEY = 'merker.accent';
const CSS_KEY = 'merker.accentCss';

export const ACCENTS = [
  { hue: null, label: t('accent.standard'), swatch: 225 },
  { hue: 160, label: t('accent.green') },
  { hue: 190, label: t('accent.turquoise') },
  { hue: 275, label: t('accent.violet') },
  { hue: 335, label: t('accent.pink') },
  { hue: 20, label: t('accent.red') },
  { hue: 38, label: t('accent.orange') },
  { hue: 80, label: t('accent.olive') },
];

export function getAccent() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function hex(h, s, l) {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Farbton (0 bis 360) einer gewählten Farbe "#rrggbb". Sättigung und Helligkeit legt die App selbst fest.
export function hexToHue(value) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value ?? '');
  if (!m) return 215;
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => Number.parseInt(x, 16) / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 215;
  let hue;
  if (max === r) hue = ((g - b) / d) % 6;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  return Math.round(((hue * 60) + 360) % 360);
}

export const hueToHex = (hue) => hex(hue, 65, 50);

export function accentCss(hue) {
  const light = {
    '--bg': hex(hue, 100, 99),
    '--surface': hex(hue, 28, 96),
    '--surface-high': hex(hue, 22, 92),
    '--outline': hex(hue, 14, 80),
    '--primary': hex(hue, 55, 42),
    '--on-primary': '#ffffff',
    '--primary-container': hex(hue, 100, 91),
    '--on-primary-container': hex(hue, 100, 13),
  };
  const dark = {
    '--bg': hex(hue, 10, 8),
    '--surface': hex(hue, 9, 12),
    '--surface-high': hex(hue, 8, 16),
    '--outline': hex(hue, 8, 28),
    '--primary': hex(hue, 100, 84),
    '--on-primary': hex(hue, 85, 20),
    '--primary-container': hex(hue, 60, 32),
    '--on-primary-container': hex(hue, 100, 91),
  };
  const block = (vars) => Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';');
  // Dunkel nach System, außer Hell ist fest gewählt. Dazu Dunkel fest gewählt (data-theme am html-Element).
  return `:root{${block(light)}}@media (prefers-color-scheme: dark){:root:not([data-theme='light']){${block(dark)}}}:root[data-theme='dark']{${block(dark)}}`;
}

function themeColors(hue) {
  return hue === null ? ['#fdfbff', '#121316'] : [hex(hue, 100, 99), hex(hue, 10, 8)];
}

export function applyAccent(hue = getAccent()) {
  let style = document.getElementById('accent-style');
  if (hue === null) style?.remove();
  else {
    if (!style) {
      style = document.createElement('style');
      style.id = 'accent-style';
      document.head.append(style);
    }
    style.textContent = accentCss(hue);
  }
  let [light, dark] = themeColors(hue);
  // Fest gewähltes Erscheinungsbild: Statusleiste immer in dieser Farbe
  const theme = document.documentElement.dataset.theme;
  if (theme === 'dark') light = dark;
  if (theme === 'light') dark = light;
  document.querySelector('meta[name=theme-color][media*=light]')?.setAttribute('content', light);
  document.querySelector('meta[name=theme-color][media*=dark]')?.setAttribute('content', dark);
}

export function setAccent(hue) {
  try {
    if (hue === null) {
      localStorage.removeItem(KEY);
      localStorage.removeItem(CSS_KEY);
    } else {
      localStorage.setItem(KEY, JSON.stringify(hue));
      // Das Startskript setzt diese Farben sofort, noch bevor die Module geladen sind.
      localStorage.setItem(CSS_KEY, JSON.stringify({ css: accentCss(hue), colors: themeColors(hue) }));
    }
  } catch {
    // ignorieren
  }
  applyAccent(hue);
}
