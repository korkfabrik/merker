// Schnellwahl für Fälligkeiten in einer Zeile zum Wischen: Keine, Heute, Morgen, in 1 bis 3 Wochen, Monaten und Jahren.
// Setzt das Datumsfeld und meldet die Änderung. quickDay liefert außerdem die Tage für das Datumsfenster (Wischen, langes Drücken).
import { h } from './ui.js';
import { t } from './i18n.js';
import { formatDay } from './rules.js';

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function quickDay(kind, base = new Date()) {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  if (kind === 'morgen') d.setDate(d.getDate() + 1);
  if (kind === 'woche') d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7)); // nächster Montag
  if (kind === 'wochenende') d.setDate(d.getDate() + (((6 - d.getDay()) % 7) || 7)); // nächster Samstag (heute Samstag: in einer Woche)
  if (kind === 'none') return '';
  return iso(d);
}

// In n Wochen ('w'), Monaten ('m') oder Jahren ('y') ab heute. Gibt es den Tag im Zielmonat nicht, gilt dessen letzter Tag
// (31. Januar plus 1 Monat = 28. oder 29. Februar).
export function quickIn(n, unit, base = new Date()) {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  if (unit === 'w') {
    d.setDate(d.getDate() + 7 * n);
    return iso(d);
  }
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + (unit === 'y' ? 12 * n : n));
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return iso(d);
}

export function quickDates(input) {
  const set = (value) => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const chip = (label, value, title) => h('button', { class: 'quick-chip press', type: 'button', title, onclick: () => set(value()) }, label);
  const later = (n, unit, label) => chip(label, () => quickIn(n, unit), formatDay(quickIn(n, unit)));
  return h(
    'div',
    { class: 'quick-dates', role: 'group', 'aria-label': t('quick.label') },
    chip(t('quick.none'), () => '', t('quick.noneHint')),
    chip(t('quick.today'), () => quickDay('heute'), formatDay(quickDay('heute'))),
    chip(t('quick.tomorrow'), () => quickDay('morgen'), formatDay(quickDay('morgen'))),
    ...[1, 2, 3].map((n) => later(n, 'w', t('quick.weeks', { n }))),
    ...[1, 2, 3].map((n) => later(n, 'm', t('quick.months', { n }))),
    ...[1, 2, 3].map((n) => later(n, 'y', t('quick.years', { n }))),
  );
}
