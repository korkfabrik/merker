// Eine Liste: tippen öffnet den Eintrag, nach rechts wischen erledigt (bei erledigten: wieder öffnen), nach links wischen verschiebt in eine andere Liste.
import { h, icon, emptyState } from '../ui.js';
import { sortByMode, sortItems, SORT_MODES, isCompleted, isOverdue, isPrio, formatDue, parseChecklist, parseDue, localDateKey, getRecurrence, stripRecurrence, recurrenceLabel } from '../rules.js';
import { itemPath } from '../router.js';
import { isTemporaryUid } from '../repository.js';
import { attachSwipe } from '../swipe.js';
import { completeWithUndo, moveWithUndo, canMove, clearCompletedWithUndo, snoozeWithUndo, deleteWithUndo } from '../actions.js';
import { attachReorder } from '../reorder.js';
import { errorText } from '../repository.js';
import { hueStyle, getListSort, setListSort, getSwipeLeft, getSwipeFarDelete } from '../settings.js';
import { pickChoice } from '../picker.js';
import { t } from '../i18n.js';

// opts.showList: Listenfarbe als Streifen links und Listenname vor der Beschreibung (Startseite, Suche). opts.hideDescription: Beschreibung weglassen (Startseite). opts.hideDue: Datum nur bei Überfälligem zeigen (Wochenansicht, der Tag steht schon darüber). opts.sorting: Griff statt Wischen und Antippen.
// Langes Drücken (Finger, 550 ms ohne Bewegung) oder Rechtsklick. Danach kein Klick, der den Dialog öffnen würde.
export function attachLongPress(row, onLongPress) {
  let timer = null;
  let start = null;
  let firedAt = 0;
  const fire = () => {
    if (Date.now() - firedAt < 800) return;
    firedAt = Date.now();
    onLongPress();
  };
  const cancel = () => {
    clearTimeout(timer);
    timer = null;
  };
  row.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse') return;
    start = { x: event.clientX, y: event.clientY };
    cancel();
    timer = setTimeout(fire, 550);
  });
  row.addEventListener('pointermove', (event) => {
    if (timer && start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) cancel();
  });
  row.addEventListener('pointerup', cancel);
  row.addEventListener('pointercancel', cancel);
  row.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    fire();
  });
  row.addEventListener(
    'click',
    (event) => {
      if (Date.now() - firedAt < 800) {
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    },
    true,
  );
}

// Suchwörter im Titel hervorheben (Textknoten, kein HTML aus den Daten)
export function highlightText(text, words) {
  const lower = text.toLocaleLowerCase();
  const marks = new Array(text.length).fill(false);
  for (const word of words) {
    if (!word) continue;
    for (let at = lower.indexOf(word); at !== -1; at = lower.indexOf(word, at + 1)) marks.fill(true, at, at + word.length);
  }
  const parts = [];
  let i = 0;
  while (i < text.length) {
    let j = i;
    while (j < text.length && marks[j] === marks[i]) j++;
    const piece = text.slice(i, j);
    parts.push(marks[i] ? h('mark', { class: 'hit' }, piece) : piece);
    i = j;
  }
  return parts;
}

// Abschnitte nach Fälligkeit: überfällig, heute, die nächsten 7 Tage, später, ohne Datum
function dueGroups(items, now) {
  const today = localDateKey(now);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
  const weekEnd = localDateKey(end);
  const groups = { overdue: [], today: [], week: [], later: [], none: [] };
  for (const item of items) {
    const date = parseDue(item.due)?.date;
    if (!date) groups.none.push(item);
    else if (isOverdue(item, now)) groups.overdue.push(item);
    else if (date === today) groups.today.push(item);
    else if (date <= weekEnd) groups.week.push(item);
    else groups.later.push(item);
  }
  return [
    ['overdue', t('group.overdue')],
    ['today', t('group.today')],
    ['week', t('group.week')],
    ['later', t('group.later')],
    ['none', t('group.none')],
  ]
    .map(([key, label]) => ({ key, label, items: sortItems(groups[key]) }))
    .filter((group) => group.items.length);
}

export function itemRow(item, list, ctx, now, opts = {}) {
  const { router } = ctx;
  const done = isCompleted(item);
  const overdue = isOverdue(item, now);
  const pending = isTemporaryUid(item.uid);
  const queued = (ctx.state?.queuedUids ?? []).includes(item.uid);
  const classes = ['item', opts.showList && 'item-listed', isPrio(item.summary) && 'item-prio', overdue && 'item-overdue', done && 'item-done', pending && 'item-pending', queued && 'item-queued']
    .filter(Boolean)
    .join(' ');
  // Datum antippen: neues Datum wählen (wie langes Drücken)
  const dueTappable = item.due && list.features.update && list.features.dueDate && !done && !pending && !opts.sorting;
  const due = item.due && !(opts.hideDue && !overdue)
    ? h(
        'span',
        {
          class: 'chip' + (overdue ? ' chip-overdue' : '') + (dueTappable ? ' chip-due-btn' : ''),
          role: dueTappable ? 'button' : null,
          'aria-label': dueTappable ? t('item.changeDue', { date: formatDue(item.due, now) }) : null,
          onclick: dueTappable
            ? (event) => {
                event.stopPropagation();
                snoozeWithUndo(ctx, list, item).catch(() => {});
              }
            : null,
        },
        formatDue(item.due, now),
      )
    : null;
  // Unteraufgaben zeigen "2/5" statt der Checklisten-Zeilen.
  // Wiederholung als Symbol an der Aufgabe (überall, auch auf der Startseite). Die Zeile "🔁 …" fällt dafür aus dem Beschreibungstext.
  const recurrence = getRecurrence(item.description);
  const plainDescription = recurrence ? stripRecurrence(item.description) : item.description;
  const checklist = parseChecklist(plainDescription);
  const descText = plainDescription && !opts.hideDescription ? (checklist.total ? checklist.rest : plainDescription) : '';
  const infoText = opts.showList ? [list.name, descText].filter(Boolean).join(' · ') : descText;
  const progress = checklist.total
    ? h('span', { class: 'sub-progress' + (checklist.done === checklist.total ? ' is-complete' : ''), title: t('item.subtasksDone') }, `${checklist.done}/${checklist.total}`)
    : null;
  const description = infoText || progress ? h('span', { class: 'item-desc' }, progress, infoText) : null;
  const handle =
    opts.sorting && !pending
      ? h('span', { class: 'drag-handle', role: 'button', 'aria-label': t('item.dragHandle') }, icon('drag', 24))
      : null;
  const canAct = list.features.update && !pending && !opts.sorting;
  // Haken zum Erledigen, nur bei Maus (Desktop). Auf dem Handy wird gewischt.
  const check = canAct
    ? h('button', {
        class: 'item-check' + (done ? ' is-done' : ''),
        type: 'button',
        'aria-label': done ? t('item.reopen') : t('item.markDone'),
        onclick: (event) => {
          event.stopPropagation();
          completeWithUndo(ctx, list, item, !done).catch(() => {});
        },
      })
    : null;
  const content = h('div', { class: classes, style: opts.showList ? hueStyle(list.id) : null }, check, h('span', { class: 'item-title' }, opts.highlight ? highlightText(item.summary, opts.highlight) : item.summary), queued ? h('span', { class: 'queued-mark', role: 'img', title: t('item.queued'), 'aria-label': t('item.queued') }, icon('clock', 16)) : null, recurrence ? h('span', { class: 'repeat-mark', role: 'img', title: t('item.repeats', { rule: recurrenceLabel(recurrence) }), 'aria-label': t('item.repeats', { rule: recurrenceLabel(recurrence) }) }, icon('repeat', 16)) : null, due, handle, description);
  const row = h('li', { class: 'swipe', 'data-uid': item.uid }, content);

  if (opts.sorting) return row;
  if (list.features.update && !pending) {
    row.classList.add('tappable');
    row.addEventListener('click', () => router.go(itemPath(list.id, item.uid)));
    // Wischen nach links nach Einstellung: in andere Liste, löschen oder neues Datum
    const leftMode = getSwipeLeft();
    let onLeft;
    if (leftMode === 'delete' && list.features.remove) onLeft = () => deleteWithUndo(ctx, list, item);
    else if (leftMode === 'date' && list.features.dueDate && !done)
      onLeft = async () => {
        if (!(await snoozeWithUndo(ctx, list, item))) throw new Error('unchanged'); // Zeile federt zurück
      };
    else if (leftMode === 'move' && canMove(ctx.state, list)) onLeft = () => moveWithUndo(ctx, list, item);
    if (onLeft && leftMode !== 'move') row.classList.add(`left-${leftMode}`);
    // Ganz weit nach links: löschen (nach Einstellung, nur wenn links nicht ohnehin löscht)
    const onFarLeft = leftMode !== 'delete' && list.features.remove && getSwipeFarDelete() ? () => deleteWithUndo(ctx, list, item) : undefined;
    attachSwipe(row, content, {
      onRight: () => completeWithUndo(ctx, list, item, !done),
      onLeft,
      onFarLeft,
    });
    // Lange drücken (Handy) oder Rechtsklick (PC): neues Datum ohne den Dialog
    if (list.features.dueDate && !done) attachLongPress(row, () => snoozeWithUndo(ctx, list, item).catch(() => {}));
  }
  return row;
}

export function renderList(root, ctx) {
  const { state, route } = ctx;
  const list = state.lists.find((entry) => entry.id === route.id);
  if (!list) {
    root.append(
      emptyState(state.status === 'online' ? t('list.gone') : t('list.loading')),
    );
    return;
  }
  if (!state.loaded[list.id]) {
    root.append(emptyState(t('list.itemsLoading')));
    return;
  }

  const now = new Date();
  const items = state.items[list.id] ?? [];
  const sorting = ctx.sortMode.value && list.features.move;
  const openItems = items.filter((item) => !isCompleted(item));
  const mode = getListSort(list.id);
  const open = sorting ? openItems : sortByMode(openItems, mode);
  const done = mode === 'alpha' ? sortByMode(items.filter(isCompleted), 'alpha') : items.filter(isCompleted);

  if (!sorting) {
    const label = SORT_MODES.find(([key]) => key === mode)[1];
    root.append(
      h(
        'div',
        { class: 'sort-bar' },
        h('span', { class: 'open-count' }, t('common.openCount', { n: openItems.length })),
        h(
          'button',
          {
            class: 'btn-text sort-mode',
            type: 'button',
            onclick: async () => {
              const next = await pickChoice(SORT_MODES, mode, t('list.sortTitle'));
              if (!next || next === mode) return;
              setListSort(list.id, next);
              ctx.rerender();
            },
          },
          t('list.sortLabel', { mode: label }),
        ),
      ),
    );
  }

  if (open.length === 0) root.append(emptyState(t('list.empty')));
  else {
    const ul = h('ul', { class: 'plain-list items' + (sorting ? ' sorting' : '') }, open.map((item) => itemRow(item, list, ctx, now, { sorting })));
    if (sorting) {
      root.append(h('p', { class: 'hint' }, t('list.sortHint')));
      attachReorder(ul, ctx.scroller, (uid, previousUid) =>
        ctx.repo.moveItem(list.id, uid, previousUid).catch((err) => ctx.toast.show(t('toast.notMovedOrder', { error: errorText(err) }), { error: true })),
      );
    }
    if (mode === 'groups' && !sorting) {
      ul.remove();
      for (const group of dueGroups(openItems, now)) {
        root.append(
          h('h2', { class: 'section-title list-group-title' + (group.key === 'overdue' ? ' is-overdue' : '') }, `${group.label} (${group.items.length})`),
          h('ul', { class: 'plain-list items' }, group.items.map((item) => itemRow(item, list, ctx, now))),
        );
      }
    } else root.append(ul);
  }

  if (done.length > 0 && !sorting) {
    root.append(
      h(
        'details',
        { class: 'done-section', open: ctx.doneOpen.value ? '' : null, ontoggle: (event) => (ctx.doneOpen.value = event.target.open) },
        h(
          'summary',
          {},
          h('span', { class: 'done-title' }, t('list.doneCount', { n: done.length })),
          list.features.remove
            ? h('button', {
                class: 'btn-inline done-clear',
                type: 'button',
                onclick: (event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  clearCompletedWithUndo(ctx, list);
                },
              }, t('list.clearDone'))
            : null,
        ),
        h('ul', { class: 'plain-list items' }, done.map((item) => itemRow(item, list, ctx, now))),
      ),
    );
  }
}
