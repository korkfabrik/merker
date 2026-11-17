// Startseite: oben alles Überfällige und Heutige aus allen Listen, darunter die Listen als Kacheln.
import { h, icon, emptyState } from '../ui.js';
import { sortItems, isOverdue, isDueToday, isCompleted, isPrio, parseDue } from '../rules.js';
import { listPath } from '../router.js';
import { itemRow } from './list.js';
import { hueStyle, getHomeLayout, orderLists, isShoppingList } from '../settings.js';
import { openNewList } from '../newlist.js';
import { t } from '../i18n.js';

// Filter auf der Startseite (gilt für alle Listen). Nur im Speicher, beim Neustart steht wieder "Fällig".
let activeFilter = null;
const FILTERS = [
  ['prio', '❗', t('home.filter.prio')],
  ['overdue', t('home.filter.overdue'), t('home.filter.overdue')],
  ['week', t('home.filter.week'), t('home.filter.week')],
];
const pad2 = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function matchesFilter(key, item, now) {
  if (key === 'overdue') return isOverdue(item, now);
  if (key === 'today') return isDueToday(item, now);
  if (key === 'prio') return isPrio(item.summary);
  if (key === 'open') return true;
  const date = parseDue(item.due)?.date;
  if (!date) return false;
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
  return date >= dayKey(now) && date <= dayKey(end); // heute bis in 7 Tagen
}

export function filteredEntries(state, key, now = new Date()) {
  const entries = [];
  for (const list of state.lists) {
    for (const item of state.items[list.id] ?? []) {
      if (isCompleted(item) || String(item.uid).startsWith('tmp-')) continue;
      if (matchesFilter(key, item, now)) entries.push({ list, item });
    }
  }
  const sorted = sortItems(entries.map((entry) => entry.item));
  return sorted.map((item) => entries.find((entry) => entry.item === item));
}

export function dueEntries(state, now = new Date()) {
  const entries = [];
  for (const list of state.lists) {
    for (const item of state.items[list.id] ?? []) {
      if (isCompleted(item) || String(item.uid).startsWith('tmp-')) continue;
      if (isOverdue(item, now) || isDueToday(item, now)) entries.push({ list, item });
    }
  }
  const sorted = sortItems(entries.map((entry) => entry.item));
  return sorted.map((item) => entries.find((entry) => entry.item === item));
}

export function renderLists(root, ctx) {
  const { state, router } = ctx;
  if (state.lists.length === 0) {
    root.append(
      emptyState(
        state.status === 'online'
          ? t('home.noLists')
          : t('home.listsLoading'),
      ),
    );
    return;
  }

  const now = new Date();
  const dueAll = dueEntries(state, now);
  const due = activeFilter ? filteredEntries(state, activeFilter, now) : dueAll;
  const loading = state.lists.some((list) => list.available && !state.loaded[list.id]);
  const LIMIT = 4;
  const expanded = ctx.dueExpanded.value;
  const shown = expanded ? due : due.slice(0, LIMIT);

  // Eine Zeile: Zähler und Filter in einem. Wichtig (nur ❗), Überfällig, Diese Woche, Offen. Antippen filtert, nochmal Antippen hebt auf.
  const chips = FILTERS.map(([key, label, name]) => {
    const count = filteredEntries(state, key, now).length;
    return h(
      'button',
      {
        class: 'filter-chip press' + (key === 'overdue' && count ? ' has-overdue-count' : ''),
        type: 'button',
        'aria-pressed': String(activeFilter === key),
        'aria-label': `${name}: ${count}`,
        onclick: () => {
          activeFilter = activeFilter === key ? null : key;
          ctx.rerender();
        },
      },
      h('span', { class: key === 'prio' ? 'chip-mark' : null }, label),
      h('span', { class: 'chip-count' }, String(count)),
    );
  });
  const openTotal = filteredEntries(state, 'open', now).length;
  root.append(h('div', { class: 'filter-row', role: 'group', 'aria-label': t('home.filterLabel') }, h('span', { class: 'filter-seg' }, chips), h('span', { class: 'open-total', 'aria-label': t('common.openCount', { n: openTotal }) }, t('common.openCount', { n: openTotal }))));
  const heading = activeFilter ? FILTERS.find(([key]) => key === activeFilter)[2] : t('home.due');
  root.append(h('h2', { class: 'section-title' }, due.length ? `${heading} (${due.length})` : heading));
  if (due.length > 0) {
    root.append(h('ul', { class: 'plain-list items due-list' }, shown.map(({ list, item }) => itemRow(item, list, ctx, now, { showList: true, hideDescription: true }))));
    if (due.length > LIMIT) {
      root.append(
        h(
          'button',
          {
            class: 'btn-text more-btn',
            type: 'button',
            onclick: () => {
              ctx.dueExpanded.value = !expanded;
              ctx.rerender();
            },
          },
          expanded ? t('home.showLess') : t('home.showAll', { n: due.length }),
        ),
      );
    }
  } else {
    root.append(emptyState(loading ? t('list.itemsLoading') : activeFilter ? t('home.filterEmpty') : t('home.nothingDue')));
  }

  const layout = getHomeLayout();
  const tiles = orderLists(state.lists, layout).filter((list) => !layout.hidden.includes(list.id)).map((list) => {
    const overdue = (state.items[list.id] ?? []).filter((item) => isOverdue(item, now)).length;
    const count = list.available ? t('common.openCount', { n: list.open }) : t('home.unavailable');
    return h(
      'li',
      {},
      h(
        'button',
        { class: 'list-tile press', type: 'button', style: hueStyle(list.id), onclick: () => router.go(listPath(list.id)) },
        h('span', { class: 'list-tile-name' }, isShoppingList(list.id) ? h('span', { class: 'tile-cart', 'aria-hidden': 'true' }, '🛒') : null, list.name, layout.pinned.includes(list.id) ? h('span', { class: 'tile-pin', title: t('home.pinned'), role: 'img', 'aria-label': t('home.pinned') }, icon('pin', 16)) : null),
        h('span', { class: 'list-tile-count' }, count, overdue ? h('span', { class: 'has-overdue' }, t('home.overdueSuffix', { n: overdue })) : null),
      ),
    );
  });
  tiles.push(
    h(
      'li',
      {},
      h('button', { class: 'list-tile list-tile-new press', type: 'button', onclick: () => openNewList(ctx) }, h('span', { class: 'list-tile-name' }, t('home.newList'))),
    ),
  );
  root.append(h('h2', { class: 'section-title' }, t('home.lists')), h('ul', { class: 'plain-list tiles' }, tiles));
}
