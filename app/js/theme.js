// Erscheinungsbild: 'auto' (wie das Gerät), 'light' oder 'dark'. Gesetzt als data-theme am html-Element.
// boot.js setzt es schon vor den Modulen, damit beim Start nichts aufblitzt.
import { applyAccent } from './accent.js';

const KEY = 'merker.theme';
export const THEMES = ['auto', 'light', 'dark'];

export function getTheme() {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'auto';
  } catch {
    return 'auto';
  }
}

export function applyTheme(theme = getTheme()) {
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  applyAccent(); // Farbe der Statusleiste anpassen
}

export function setTheme(theme) {
  try {
    if (theme === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // ohne Speicher gilt die Wahl nur bis zum Neustart
  }
  applyTheme(theme);
}
