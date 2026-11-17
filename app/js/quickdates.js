// Schnellwahl für Fälligkeiten: Heute, Morgen, Nächste Woche (Montag), Keine (kein Datum). Setzt das Datumsfeld und meldet die Änderung.
import { h } from './ui.js';
import { t } from './i18n.js';

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

export function quickDates(input) {
  const choose = (kind) => {
    input.value = quickDay(kind);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const chip = (kind, label, title) => h('button', { class: 'quick-chip press', type: 'button', title, onclick: () => choose(kind) }, label);
  return h(
    'div',
    { class: 'quick-dates', role: 'group', 'aria-label': t('quick.label') },
    chip('heute', t('quick.today')),
    chip('morgen', t('quick.tomorrow')),
    chip('woche', t('quick.nextWeek'), t('quick.nextWeekHint')),
    chip('none', t('quick.none'), t('quick.noneHint')),
  );
}
