// Suche über alle Listen (Titel, Beschreibung und Listenname). Das Suchfeld liegt oben in der Kopfleiste und bleibt beim Neuzeichnen erhalten.
import { h, icon, emptyState } from '../ui.js';
import { sortItems, isCompleted } from '../rules.js';
import { itemRow, highlightText } from './list.js';
import { listPath } from '../router.js';
import { t, locale } from '../i18n.js';
import { getRecentSearches, addRecentSearch, removeRecentSearch, hueStyle } from '../settings.js';

let activeBar = null;
let showDone = true; // Erledigte in der Suche zeigen (gilt, solange die App läuft)

export class SearchBar {
  #input = null;
  query = '';

  constructor({ topSlot, onInput }) {
    this.topSlot = topSlot;
    this.onInput = onInput;
  }

  mount() {
    if (this.#input) return;
    this.#input = h('input', {
      type: 'search',
      class: 'composer-input',
      placeholder: t('search.placeholder'),
      'aria-label': t('search.label'),
      enterkeyhint: 'search',
    });
    this.#input.addEventListener('input', () => {
      this.query = this.#input.value;
      this.onInput();
    });
    const form = h('form', { class: 'composer composer-top searchbar' }, h('span', { class: 'composer-mark' }, icon('search', 22)), this.#input);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      addRecentSearch(this.query);
      this.#input.blur();
    });
    activeBar = this;
    this.topSlot.replaceChildren(form);
    this.#input.focus({ preventScroll: true });
  }

  // Suchbegriff setzen (letzte Suchen antippen)
  setQuery(text) {
    if (!this.#input) return;
    this.#input.value = text;
    this.query = text;
    this.onInput();
  }

  unmount() {
    if (!this.#input) return;
    activeBar = null;
    this.#input = null;
    this.query = '';
    this.topSlot.replaceChildren();
  }
}

export function renderSearch(root, ctx, query) {
  const { state } = ctx;
  const words = query.trim().toLocaleLowerCase(locale).split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    const recent = getRecentSearches();
    if (recent.length) {
      root.append(
        h('h2', { class: 'section-title' }, t('search.recent')),
        h(
          'div',
          { class: 'search-tools' },
          recent.map((text) =>
            h(
              'span',
              { class: 'recent-chip' },
              h('button', { class: 'label-btn press', type: 'button', onclick: () => activeBar?.setQuery(text) }, icon('search', 14), text),
              h('button', { class: 'recent-remove press', type: 'button', 'aria-label': t('search.removeRecent', { text }), onclick: () => { removeRecentSearch(text); ctx.rerender(); } }, icon('close', 14)),
            ),
          ),
        ),
      );
    } else root.append(emptyState(t('search.hint')));
    return;
  }
  const now = new Date();
  const hits = [];
  for (const list of state.lists) {
    for (const item of state.items[list.id] ?? []) {
      if (String(item.uid).startsWith('tmp-')) continue;
      // Jedes Suchwort muss in Titel, Beschreibung oder Listenname vorkommen ("milch haushalt" geht also auch).
      // Mindestens ein Wort muss in der Aufgabe selbst stehen, sonst erscheint die Liste oben statt aller ihrer Aufgaben.
      const own = `${item.summary} ${item.description ?? ''}`.toLocaleLowerCase(locale);
      const text = `${own} ${list.name.toLocaleLowerCase(locale)}`;
      if (words.every((word) => text.includes(word)) && words.some((word) => own.includes(word))) hits.push({ list, item });
    }
  }
  // Passende Listen oben, zum direkten Öffnen
  const listHits = state.lists.filter((list) => words.every((word) => list.name.toLocaleLowerCase(locale).includes(word)));
  if (listHits.length) {
    root.append(
      h('h2', { class: 'section-title' }, t('search.lists')),
      h(
        'ul',
        { class: 'plain-list search-lists' },
        listHits.map((list) =>
          h(
            'li',
            { style: hueStyle(list.id) },
            h(
              'button',
              { class: 'set-row search-list-row press', type: 'button', onclick: () => { addRecentSearch(query); ctx.router.go(listPath(list.id)); } },
              h('span', { class: 'set-dot', 'aria-hidden': 'true' }, list.name.trim().charAt(0).toUpperCase()),
              h('span', { class: 'set-text' }, h('span', { class: 'diag-name' }, highlightText(list.name, words)), h('span', { class: 'set-hint' }, t('common.openCount', { n: list.open }))),
              h('span', { class: 'set-chevron', 'aria-hidden': 'true' }, icon('chevron', 24)),
            ),
          ),
        ),
      ),
    );
  }
  if (hits.length === 0) {
    if (!listHits.length) root.append(emptyState(t('search.empty')));
    return;
  }
  if (listHits.length) root.append(h('h2', { class: 'section-title' }, t('search.tasks')));
  const byItem = new Map(hits.map((hit) => [hit.item, hit]));
  const doneCount = hits.filter((hit) => isCompleted(hit.item)).length;
  root.append(
    h(
      'div',
      { class: 'search-tools' },
      h('span', { class: 'search-count' }, t('search.count', { n: hits.length })),
      doneCount
        ? h(
            'button',
            {
              class: 'label-btn press',
              type: 'button',
              'aria-pressed': String(showDone),
              onclick: () => {
                showDone = !showDone;
                ctx.rerender();
              },
            },
            t('search.showDone', { n: doneCount }),
          )
        : null,
    ),
  );
  const open = sortItems(hits.filter((hit) => !isCompleted(hit.item)).map((hit) => hit.item));
  const done = hits.filter((hit) => isCompleted(hit.item)).map((hit) => hit.item);
  // Antippen eines Treffers merkt sich den Suchbegriff
  const rows = (items) =>
    h(
      'ul',
      { class: 'plain-list items', onclick: () => addRecentSearch(query) },
      items.slice(0, 100).map((item) => itemRow(item, byItem.get(item).list, ctx, now, { showList: true, highlight: words })),
    );
  if (open.length) root.append(rows(open));
  if (done.length && showDone) root.append(h('h2', { class: 'section-title' }, t('search.completed')), rows(done));
}
