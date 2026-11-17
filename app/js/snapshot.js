// Zwischenspeicher für den Offline-Betrieb: Listen und Einträge vom letzten Stand mit Verbindung.
// Liegt in localStorage. Ohne Speicher läuft die App normal weiter, nur ohne Offline-Ansicht.
import { t, locale } from './i18n.js';
const KEY = 'merker.snapshot';
const VERSION = 1;

export function loadSnapshot() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!data || data.v !== VERSION || !Array.isArray(data.lists) || typeof data.items !== 'object' || !data.items) return null;
    if (!Number.isFinite(data.t)) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSnapshot() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignorieren
  }
}

// Nur wenn alle verfügbaren Listen geladen sind, sonst ginge ein Teil des alten Stands verloren.
export function snapshotOf(state, now = Date.now()) {
  if (state.status !== 'online' || state.lists.length === 0) return null;
  if (state.lists.some((list) => list.available && !state.loaded[list.id])) return null;
  const items = {};
  for (const list of state.lists) {
    if (!state.loaded[list.id]) continue;
    items[list.id] = (state.items[list.id] ?? []).filter((item) => !String(item.uid).startsWith('tmp-') && !String(item.uid).startsWith('local-'));
  }
  return { v: VERSION, t: now, lists: state.lists, items };
}

export function saveSnapshot(state) {
  const snap = snapshotOf(state);
  if (!snap) return null;
  try {
    localStorage.setItem(KEY, JSON.stringify(snap));
  } catch {
    return null;
  }
  return snap.t;
}

// "heute, 14:32", "gestern, 14:32" oder "28.10., 14:32"
export function formatStamp(stamp, now = new Date()) {
  const d = new Date(stamp);
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400000);
  if (diff === 0) return t('stamp.today', { time });
  if (diff === 1) return t('stamp.yesterday', { time });
  return t('stamp.date', { date: d.toLocaleDateString(locale, { day: 'numeric', month: 'numeric' }), time });
}
