// Wochenansicht: die nächsten 7 Tage nach Tagen, über alle Listen. Oben Überfälliges (nur in der aktuellen Woche).
// Mit ‹ › geht es wochenweise vor und zurück. Titel ("46. Woche") antippen: Woche frei eingeben. Zeitraum antippen: Woche aus einer Liste wählen. Tage lassen sich per Antippen der Überschrift ein- und ausklappen. "+" am Tag legt eine Aufgabe mit diesem Datum an.
import { h, icon, emptyState } from '../ui.js';
import { sortItems, isCompleted, isOverdue, parseDue, localDateKey } from '../rules.js';
import { itemRow } from './list.js';
import { openNewTask } from '../newtask.js';
import { pickChoice, pickNumber } from '../picker.js';
import { t, locale } from '../i18n.js';

let shift = 0; // Tage ab heute bis zum ersten gezeigten Tag (0 = heute bis in 6 Tagen)
const collapsed = new Set(); // eingeklappte Tage (Datum), bleibt beim Blättern erhalten

const dayName = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'short' });
const shortDay = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });

// ISO-Kalenderwoche (Woche mit Montag als erstem Tag, KW 1 enthält den 4. Januar)
export function isoWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const jan1 = new Date(d.getFullYear(), 0, 1);
  return { week: 1 + Math.floor(Math.round((d - jan1) / 864e5) / 7), year: d.getFullYear() };
}

// Montag der KW n im Jahr year
export function mondayOf(week, year) {
  const jan4 = new Date(year, 0, 4);
  return new Date(year, 0, 4 - ((jan4.getDay() + 6) % 7) + (week - 1) * 7);
}

const dayIndex = (date) => Math.round(new Date(date.getFullYear(), date.getMonth(), date.getDate()) / 864e5);
const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

// Tage von heute bis zum Anfang der Woche, die diesen Montag hat (die laufende Woche beginnt heute)
const shiftFor = (monday) => Math.max(0, dayIndex(monday) - dayIndex(startOfToday()));

// Gültige KW eingeben: kleiner als die aktuelle heißt nächstes Jahr
export function shiftForWeekNumber(n, today = startOfToday()) {
  const current = isoWeek(today);
  let year = current.year + (n < current.week ? 1 : 0);
  const monday = mondayOf(n, year);
  if (isoWeek(monday).week !== n) return null; // KW 53 gibt es nicht in jedem Jahr
  return Math.max(0, dayIndex(monday) - dayIndex(today));
}

const weekLabel = (from, to) => {
  const a = isoWeek(from).week;
  const b = isoWeek(to).week;
  return a === b ? t('week.kw', { n: a }) : t('week.kwSpan', { a, b });
};

export function renderWeek(root, ctx) {
  const { state } = ctx;
  if (state.lists.length === 0) {
    root.append(emptyState(t('home.listsLoading')));
    return;
  }
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + shift);
  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const keys = days.map(localDateKey);
  const today = localDateKey(now);
  const tomorrow = localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));

  // Offene Aufgaben mit Datum, je Tag gesammelt
  const byDay = new Map(keys.map((key) => [key, []]));
  const overdue = [];
  const listOf = new Map();
  for (const list of state.lists) {
    for (const item of state.items[list.id] ?? []) {
      if (isCompleted(item) || String(item.uid).startsWith('tmp-')) continue;
      const date = parseDue(item.due)?.date;
      if (!date) continue;
      listOf.set(item, list);
      if (byDay.has(date)) byDay.get(date).push(item);
      else if (shift === 0 && isOverdue(item, now)) overdue.push(item);
    }
  }
  const rows = (items, hideDue = true) =>
    h('ul', { class: 'plain-list items' }, sortItems(items).map((item) => itemRow(item, listOf.get(item), ctx, now, { showList: true, hideDescription: true, hideDue })));

  // Kopf: KW, Zeitraum und Blättern
  const range = `${shortDay.format(days[0])} – ${shortDay.format(days[6])}`;
  const jump = (next) => {
    shift = Math.max(0, next);
    ctx.rerender();
  };
  const go = (delta) => () => jump(delta === 0 ? 0 : shift + delta * 7);
  const enterWeek = async () => {
    const n = await pickNumber(t('week.kwTitle'), { min: 1, max: 53, value: isoWeek(days[0]).week });
    if (n == null) return;
    const next = shiftForWeekNumber(n);
    if (next != null) jump(next);
  };
  const chooseWeek = async () => {
    const today0 = startOfToday();
    const thisMonday = new Date(today0.getFullYear(), today0.getMonth(), today0.getDate() - ((today0.getDay() + 6) % 7));
    const options = Array.from({ length: 12 }, (_, i) => {
      const monday = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() + i * 7);
      const from = i === 0 ? today0 : monday;
      const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
      return [String(shiftFor(monday)), t('week.kw', { n: isoWeek(monday).week }), `${shortDay.format(from)} – ${shortDay.format(sunday)}`];
    });
    options.push(['enter', t('week.kwEnter'), '']);
    const choice = await pickChoice(options, String(shift), t('week.pickTitle'));
    if (choice === 'enter') enterWeek();
    else if (choice != null) jump(Number(choice));
  };
  // Titel oben zeigt die KW, Antippen öffnet die Eingabe
  const title = document.getElementById('view-title');
  if (title) {
    title.onclick = enterWeek;
    title.classList.add('is-tappable');
    title.setAttribute('role', 'button');
    title.setAttribute('aria-label', t('week.kwTitle'));
  }
  root.append(
    h(
      'div',
      { class: 'week-nav' },
      h('button', { class: 'icon-btn week-prev press', type: 'button', 'aria-label': t('week.prev'), disabled: shift <= 0, onclick: go(-1) }, icon('chevron', 22)),
      h('button', { class: 'week-range press', type: 'button', 'aria-label': t('week.pickTitle'), onclick: chooseWeek }, range, icon('expand', 18)),
      h('button', { class: 'icon-btn week-next press', type: 'button', 'aria-label': t('week.next'), onclick: go(1) }, icon('chevron', 22)),
      h('button', { class: 'label-btn week-today press', type: 'button', disabled: shift === 0, onclick: go(0) }, t('week.today')),
    ),
  );

  if (overdue.length) {
    root.append(h('h2', { class: 'section-title list-group-title is-overdue' }, `${t('group.overdue')} (${overdue.length})`), rows(overdue, false));
  }
  const writable = state.lists.some((list) => list.available && list.features.create);
  for (const [i, day] of days.entries()) {
    const key = keys[i];
    const items = byDay.get(key);
    const label = key === today ? `${t('due.today')}, ${shortDay.format(day)}` : key === tomorrow ? `${t('due.tomorrow')}, ${shortDay.format(day)}` : dayName.format(day);
    const open = !collapsed.has(key);
    const toggle = () => {
      if (open) collapsed.add(key);
      else collapsed.delete(key);
      ctx.rerender();
    };
    root.append(
      h(
        'div',
        { class: 'week-day-head' + (key === today ? ' is-today' : '') + (open ? '' : ' is-collapsed'), 'data-day': key },
        h(
          'button',
          { class: 'week-day-toggle', type: 'button', 'aria-expanded': String(open), onclick: toggle },
          h('span', { class: 'week-day-arrow', 'aria-hidden': 'true' }, icon('chevron', 20)),
          h('h2', { class: 'section-title' }, items.length ? `${label} (${items.length})` : label),
        ),
        writable
          ? h(
              'button',
              {
                class: 'label-btn press',
                type: 'button',
                'aria-label': t('week.addOn', { day: label }),
                onclick: () => openNewTask({ state: ctx.store.get(), store: ctx.store, repo: ctx.repo, toast: ctx.toast, initial: { due: key } }),
              },
              icon('plus', 16),
            )
          : null,
      ),
    );
    // Eingeklappt: nichts anhängen (append(null) würde den Text "null" einfügen)
    if (open) root.append(items.length ? rows(items) : h('p', { class: 'week-empty' }, t('week.empty')));
  }
}

// Titel der Ansicht: KW des ersten gezeigten Tages (bei Wochenwechsel beide)
export function weekTitle() {
  const now = new Date();
  return weekLabel(new Date(now.getFullYear(), now.getMonth(), now.getDate() + shift), new Date(now.getFullYear(), now.getMonth(), now.getDate() + shift + 6));
}

// Beim Verlassen der Ansicht wieder bei dieser Woche anfangen
export function resetWeek() {
  shift = 0;
}
