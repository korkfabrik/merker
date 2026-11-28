// Reine Funktionen ohne Seiteneffekte: Prio, Fälligkeit, Sortierung, Feature-Flags.
// Alles hier ist ohne Browser und ohne Home Assistant testbar.
import { t, locale } from './i18n.js';

// Bits von TodoListEntityFeature in Home Assistant.
export const FEATURE_LABELS = [
  ['create', t('feature.create'), 1],
  ['remove', t('feature.remove'), 2],
  ['update', t('feature.update'), 4],
  ['move', t('feature.move'), 8],
  ['dueDate', t('feature.dueDate'), 16],
  ['dueDatetime', t('feature.dueDatetime'), 32],
  ['description', t('feature.description'), 64],
];

export function decodeFeatures(bits) {
  const value = Number(bits) || 0;
  const result = {};
  for (const [key, , bit] of FEATURE_LABELS) result[key] = (value & bit) !== 0;
  return result;
}

// Prio: Emoji ❗ (U+2757, optional mit Variation Selector) oder ein führendes "!".
const PRIO_RE = /^(?:❗️?|!)\s*/;

export const isPrio = (summary) => PRIO_RE.test(summary ?? '');
export const stripPrio = (summary) => (summary ?? '').replace(PRIO_RE, '');
export const withPrio = (summary) => (isPrio(summary) ? summary : `❗ ${summary}`);

const pad = (n) => String(n).padStart(2, '0');

export function localDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// HA liefert Datum ("2026-10-28") oder Datum mit Uhrzeit ("2026-10-28T10:00:00+01:00") im Feld "due".
export function parseDue(due) {
  if (!due) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(due)) return { date: due, time: null, ts: null };
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return null;
  return { date: localDateKey(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}`, ts: d.getTime() };
}

// Fälligkeit für Kopien und Rückgängig: reines Datum bleibt Datum, Datum mit Uhrzeit behält die Uhrzeit (lokale Zeit).
export function dueValue(due) {
  const parsed = parseDue(due);
  if (!parsed) return null;
  return parsed.time ? `${parsed.date}T${parsed.time}:00` : parsed.date;
}

// Was beim Verschieben in eine Liste mit diesen Fähigkeiten verloren ginge: 'date', 'time', 'description'.
// Leer heißt: alles kommt an.
export function moveLosses(item, features) {
  const losses = [];
  const parsed = parseDue(item.due);
  if (parsed && !parsed.time && !features.dueDate) losses.push('date');
  if (parsed?.time && !features.dueDatetime) losses.push(features.dueDate ? 'time' : 'date');
  if ((item.description ?? '').trim() && !features.description) losses.push('description');
  return losses;
}

// Neues Datum, Uhrzeit der bisherigen Fälligkeit bleibt
export function withTimeOf(date, originalDue) {
  const time = parseDue(originalDue)?.time;
  return date && time ? `${date}T${time}:00` : date;
}

export function isCompleted(item) {
  return item.status === 'completed';
}

export function isOverdue(item, now = new Date()) {
  if (isCompleted(item)) return false;
  const due = parseDue(item.due);
  if (!due) return false;
  if (due.time === null) return due.date < localDateKey(now);
  return due.ts < now.getTime();
}

export function isDueToday(item, now = new Date()) {
  if (isCompleted(item)) return false;
  const due = parseDue(item.due);
  return !!due && due.date === localDateKey(now);
}

// Reihenfolge: erst Prio, dann Fälligkeit (mit Datum vor ohne Datum), dann die Reihenfolge aus Home Assistant.
export function sortItems(items) {
  const position = new Map(items.map((item, index) => [item, index]));
  const dueKey = (item) => {
    const due = parseDue(item.due);
    return due ? `${due.date}T${due.time ?? '00:00'}` : null;
  };
  return [...items].sort((a, b) => {
    const prioDiff = Number(isPrio(b.summary)) - Number(isPrio(a.summary));
    if (prioDiff !== 0) return prioDiff;
    const da = dueKey(a);
    const db = dueKey(b);
    if (da !== db) {
      if (da === null) return 1;
      if (db === null) return -1;
      return da < db ? -1 : 1;
    }
    return position.get(a) - position.get(b);
  });
}

// Sortierarten je Liste: standard = Prio, Datum, Reihenfolge aus HA. ha = streng wie in HA. alpha = nach Titel (A bis Z, ohne ❗).
export const SORT_MODES = [
  ['standard', t('sort.standard')],
  ['ha', t('sort.ha')],
  ['alpha', t('sort.alpha')],
  ['groups', t('sort.groups')],
];

export function sortByMode(items, mode) {
  if (mode === 'ha') return [...items];
  if (mode === 'alpha') {
    const position = new Map(items.map((item, index) => [item, index]));
    return [...items].sort(
      (a, b) =>
        stripPrio(a.summary).localeCompare(stripPrio(b.summary), locale, { sensitivity: 'base', numeric: true }) || position.get(a) - position.get(b),
    );
  }
  return sortItems(items);
}

const dayFormat = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' });
const dayYearFormat = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

// Tag ohne "Heute"/"Morgen", zum Beispiel "Sa., 14. Nov." (für Hinweise in Auswahlfenstern)
export function formatDay(isoDate, now = new Date()) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  return (y === now.getFullYear() ? dayFormat : dayYearFormat).format(new Date(y, m - 1, d));
}

// Kurzer Text für die Fälligkeit: "Heute", "Morgen", "Gestern" oder "Mi., 28. Okt.".
export function formatDue(due, now = new Date()) {
  const parsed = parseDue(due);
  if (!parsed) return '';
  const [y, m, d] = parsed.date.split('-').map(Number);
  const target = Date.UTC(y, m - 1, d);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((target - today) / 86400000);
  let label;
  if (diff === 0) label = t('due.today');
  else if (diff === 1) label = t('due.tomorrow');
  else if (diff === -1) label = t('due.yesterday');
  else {
    const date = new Date(y, m - 1, d);
    label = (y === now.getFullYear() ? dayFormat : dayYearFormat).format(date);
  }
  return parsed.time ? `${label}, ${parsed.time}` : label;
}

// Unteraufgaben stehen als Checkliste in der Beschreibung: "- [ ] Text" (offen) und "- [x] Text" (erledigt).
const CHECK_LINE = /^(\s*[-*]\s+)\[( |x|X)\]\s?(.*)$/;

export function parseChecklist(description) {
  const lines = String(description ?? '').split('\n');
  const items = [];
  const rest = [];
  lines.forEach((line, index) => {
    const match = CHECK_LINE.exec(line);
    if (match) items.push({ index, checked: match[2] !== ' ', text: match[3].trim() });
    else if (line.trim()) rest.push(line.trim());
  });
  return { items, total: items.length, done: items.filter((entry) => entry.checked).length, rest: rest.join(' ') };
}

export function toggleChecklistLine(description, index) {
  const lines = String(description ?? '').split('\n');
  lines[index] = lines[index].replace(CHECK_LINE, (_all, prefix, mark, text) => `${prefix}[${mark === ' ' ? 'x' : ' '}] ${text}`);
  return lines.join('\n');
}

// Text einer Unteraufgabe ändern, Kästchen und Einrückung bleiben erhalten.
export function setChecklistText(description, index, text) {
  const lines = String(description ?? '').split('\n');
  lines[index] = lines[index].replace(CHECK_LINE, (_all, prefix, mark) => `${prefix}[${mark}] ${text.trim()}`);
  return lines.join('\n');
}

export function addChecklistLine(description, text) {
  const base = String(description ?? '').replace(/\s+$/, '');
  return `${base ? `${base}\n` : ''}- [ ] ${text.trim()}`;
}

// Eine Zeile der Beschreibung entfernen. Gibt den neuen Text und die entfernte Zeile zurück (für "Rückgängig").
export function removeLine(description, index) {
  const lines = String(description ?? '').split('\n');
  const [line] = lines.splice(index, 1);
  return { text: lines.join('\n'), line: line ?? '' };
}

export function insertLine(description, index, line) {
  const lines = String(description ?? '').split('\n');
  lines.splice(Math.min(index, lines.length), 0, line);
  return lines.join('\n');
}

// Unteraufgabe an eine andere Stelle setzen: Zeile fromIndex kommt hinter Zeile afterIndex (null = vor die erste Unteraufgabe).
export function moveChecklistLine(description, fromIndex, afterIndex) {
  const lines = String(description ?? '').split('\n');
  const line = lines[fromIndex];
  let target = afterIndex === null ? lines.findIndex((entry) => CHECK_LINE.test(entry)) : afterIndex + 1;
  lines.splice(fromIndex, 1);
  if (target > fromIndex) target -= 1;
  lines.splice(target, 0, line);
  return lines.join('\n');
}

// Erledigte Unteraufgabe hinter die letzte Unteraufgabe setzen.
export function moveChecklistLineToEnd(description, index) {
  const lines = String(description ?? '').split('\n');
  let last = -1;
  lines.forEach((line, i) => {
    if (CHECK_LINE.test(line)) last = i;
  });
  if (last <= index) return lines.join('\n');
  const [line] = lines.splice(index, 1);
  lines.splice(last, 0, line);
  return lines.join('\n');
}

// Beschreibung für den Dialog aufteilen: freier Text (ohne Unteraufgaben) und die Unteraufgaben-Zeilen.
export function splitChecklist(description) {
  const lines = String(description ?? '').split('\n');
  const text = lines.filter((line) => !CHECK_LINE.test(line));
  const checklist = lines.filter((line) => CHECK_LINE.test(line));
  return { text: text.join('\n').replace(/^\s*\n/, '').replace(/\s+$/, ''), checklist: checklist.join('\n') };
}

// Wieder zusammensetzen: freier Text, darunter die Unteraufgaben, ein Erledigt-Datum bleibt die letzte Zeile.
export function joinChecklist(text, checklist) {
  const lines = String(text ?? '').replace(/\s+$/, '').split('\n');
  const stamp = DONE_STAMP.test(lines.at(-1) ?? '') ? lines.pop() : '';
  return [lines.join('\n').replace(/\s+$/, ''), checklist, stamp].filter(Boolean).join('\n');
}

// Erledigt-Datum: letzte Zeile "✓ 08.11.2026". Beim Wieder-Öffnen fällt sie weg.
const DONE_STAMP = /^✓ \S+$/;
const dateStamp = (date) => date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });

export function addDoneStamp(description, date = new Date()) {
  const text = String(description ?? '').replace(/\s+$/, '');
  const lines = text.split('\n');
  if (DONE_STAMP.test(lines.at(-1))) return text; // schon gestempelt, Datum bleibt
  return `${text ? `${text}\n` : ''}✓ ${dateStamp(date)}`;
}

export function removeDoneStamp(description) {
  const lines = String(description ?? '').replace(/\s+$/, '').split('\n');
  if (DONE_STAMP.test(lines.at(-1))) lines.pop();
  return lines.join('\n').replace(/\s+$/, '');
}

// Wiederholen: Zeile "🔁 wöchentlich" in der Beschreibung. Gelesen wird Deutsch und Englisch, geschrieben in der App-Sprache.
export const RECURRENCES = ['daily', 'weekly', 'biweekly', 'monthly', 'yearly'];
const RECUR_LINE = /^🔁\s*(.+)$/;
const RECUR_WORDS = {
  täglich: 'daily',
  daily: 'daily',
  wöchentlich: 'weekly',
  weekly: 'weekly',
  'alle 2 wochen': 'biweekly',
  'every 2 weeks': 'biweekly',
  monatlich: 'monthly',
  monthly: 'monthly',
  jährlich: 'yearly',
  yearly: 'yearly',
};
export const recurrenceLabel = (key) =>
  ({ daily: t('recur.daily'), weekly: t('recur.weekly'), biweekly: t('recur.biweekly'), monthly: t('recur.monthly'), yearly: t('recur.yearly') })[key] ?? '';

export function getRecurrence(description) {
  for (const line of String(description ?? '').split('\n')) {
    const match = RECUR_LINE.exec(line.trim());
    if (match) return RECUR_WORDS[match[1].trim().toLowerCase()] ?? null;
  }
  return null;
}

// Beschreibung ohne die Wiederholen-Zeile (für das Textfeld)
export function stripRecurrence(description) {
  return String(description ?? '')
    .split('\n')
    .filter((line) => !RECUR_LINE.test(line.trim()))
    .join('\n')
    .replace(/\s+$/, '');
}

// Wiederholen-Zeile setzen (ans Ende, vor ein Erledigt-Datum) oder entfernen (key = null)
export function setRecurrence(description, key) {
  const lines = stripRecurrence(description).split('\n').filter((line, i, all) => line || i < all.length - 1);
  const text = lines.join('\n').replace(/\s+$/, '');
  if (!key) return text;
  const line = `🔁 ${recurrenceLabel(key)}`;
  const parts = text ? text.split('\n') : [];
  if (parts.length && DONE_STAMP.test(parts.at(-1))) parts.splice(parts.length - 1, 0, line);
  else parts.push(line);
  return parts.join('\n');
}

// Nächste Fälligkeit: vom bisherigen Datum (oder heute) weiter, bis sie nach heute liegt.
export function nextDue(dueDate, key, today = new Date()) {
  const base = dueDate ? new Date(`${dueDate}T12:00:00`) : new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  const todayKey = localDateKey(today);
  const step = (d) => {
    const n = new Date(d);
    if (key === 'daily') n.setDate(n.getDate() + 1);
    else if (key === 'weekly') n.setDate(n.getDate() + 7);
    else if (key === 'biweekly') n.setDate(n.getDate() + 14);
    else if (key === 'monthly') {
      const day = base.getDate();
      n.setDate(1);
      n.setMonth(n.getMonth() + 1);
      n.setDate(Math.min(day, new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate()));
    } else if (key === 'yearly') {
      const day = base.getDate();
      n.setDate(1);
      n.setFullYear(n.getFullYear() + 1);
      n.setDate(Math.min(day, new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate()));
    }
    return n;
  };
  let next = step(base);
  for (let i = 0; i < 1000 && localDateKey(next) <= todayKey; i++) next = step(next);
  return localDateKey(next);
}

// Neue Runde einer wiederkehrenden Aufgabe: Erledigt-Datum weg, alle Unteraufgaben wieder offen.
export function resetForRepeat(description) {
  return removeDoneStamp(description)
    .split('\n')
    .map((line) => line.replace(CHECK_LINE, (_all, prefix, _mark, text) => `${prefix}[ ] ${text}`))
    .join('\n');
}
