// "Neue Aufgabe" von der Startseite: Titel, Liste, Priorität, Datum, Beschreibung. Liegt als Bottom Sheet über der Seite.
import { h, icon } from './ui.js';
import { withPrio, stripPrio, isCompleted, addChecklistLine, setRecurrence } from './rules.js';
import { recurrenceButton } from './recurfield.js';
import { completeWithUndo, addManyWithUndo } from './actions.js';
import { splitLines, CONFIRM_FROM } from './multiline.js';
import { errorText } from './repository.js';
import { hueStyle, getLastTarget, setLastTarget } from './settings.js';
import { pickList } from './picker.js';
import { quickDates } from './quickdates.js';
import { t } from './i18n.js';

export function openNewTask({ state, store, repo, toast, initial = {}, listId = null }) {
  const targets = state.lists.filter((list) => list.available && list.features.create);
  if (targets.length === 0) {
    toast.show(t('newTask.noTarget'), { error: true });
    return;
  }
  let current = targets.find((list) => list.id === (listId ?? getLastTarget())) ?? targets.find((list) => list.id === getLastTarget()) ?? targets[0];
  let closed = false;
  history.pushState({ n: (history.state?.n ?? 0) + 1, picker: true, newTask: true }, '', location.href);

  const title = h('input', { class: 'field-input', name: 'title', id: 'new-title', type: 'text', autocapitalize: 'sentences', enterkeyhint: 'done' });
  const prio = h('button', { class: 'prio-toggle press', type: 'button', name: 'prio', 'aria-pressed': 'false', 'aria-label': t('item.prioToggle') }, '❗');
  prio.addEventListener('click', () => {
    prio.setAttribute('aria-pressed', String(prio.getAttribute('aria-pressed') !== 'true'));
    title.focus({ preventScroll: true });
  });
  const description = h('textarea', { class: 'field-input', name: 'description', rows: '3' });
  const due = h('input', { class: 'field-input', name: 'due', type: 'date', id: 'new-due' });
  const recurrence = recurrenceButton(null);
  const dueField = h(
    'div',
    { class: 'field' },
    h('div', { class: 'label-row' }, h('label', { class: 'field-label', for: 'new-due' }, t('item.due')), recurrence.button),
    h('div', { class: 'date-row' }, due),
    quickDates(due),
  );
  // Unteraufgaben: erst nach Tipp auf "+ Unteraufgabe" sichtbar, damit der Dialog schlank bleibt
  const subs = [];
  const subInput = h('input', { class: 'field-input check-add-input', type: 'text', placeholder: t('sheet.addSubtask'), enterkeyhint: 'done', 'aria-label': t('sheet.addSubtask') });
  const subList = h('ul', { class: 'plain-list new-subs' });
  const subField = h('div', { class: 'field sub-field', hidden: true }, h('span', { class: 'field-label' }, t('sheet.subtasks')), subList, h('div', { class: 'check-add' }, subInput, h('button', { class: 'btn press', type: 'button', onclick: () => addSub() }, t('sheet.addSubtaskButton'))));
  const subButton = h('button', { class: 'label-btn press', type: 'button', onclick: () => openSubs() }, icon('plus', 16), t('sheet.subtaskButton'));
  const renderSubs = () => {
    subList.replaceChildren(
      ...subs.map((text, index) =>
        h(
          'li',
          { class: 'new-sub' },
          h('span', { class: 'check-box', 'aria-hidden': 'true' }),
          h('span', { class: 'new-sub-text' }, text),
          h('button', { class: 'recent-remove press', type: 'button', 'aria-label': t('search.removeRecent', { text }), onclick: () => { subs.splice(index, 1); renderSubs(); } }, icon('close', 16)),
        ),
      ),
    );
  };
  function openSubs() {
    subField.hidden = false;
    subButton.hidden = true;
    subInput.focus({ preventScroll: true });
  }
  function addSub() {
    const text = subInput.value.trim();
    if (!text) return;
    subs.push(text);
    subInput.value = '';
    renderSubs();
    subInput.focus({ preventScroll: true });
  }
  subInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addSub();
    }
  });
  const descriptionField = h('div', { class: 'field' }, h('div', { class: 'label-row' }, h('label', { class: 'field-label', for: 'new-description' }, t('item.description')), subButton), description);
  description.id = 'new-description';
  const save = h('button', { class: 'btn btn-primary btn-compact press', type: 'submit', disabled: true }, t('newTask.add'));
  // Beschreibung mit Wiederholen-Zeile (falls gewählt)
  const composeDescription = (text) => setRecurrence(text, recurrence.state.value || null).trim();

  // Kopf in der Farbe der gewählten Liste: "Neue Aufgabe in" und der Listenname. Antippen wählt eine andere Liste.
  const bandName = h('span', { class: 'band-pick-name' });
  const bandPick = h(
    'button',
    { class: 'band-pick press', type: 'button', disabled: targets.length < 2 },
    h('span', { class: 'band-pick-small' }, t('newTask.in')),
    h('span', { class: 'band-pick-line' }, bandName, targets.length > 1 ? h('span', { class: 'band-pick-chev', 'aria-hidden': 'true' }, '▾') : null),
  );
  const band = h('div', { class: 'sheet-band' }, h('div', { class: 'sheet-handle' }), h('div', { class: 'sheet-head' }, bandPick, save));
  const showList = () => {
    band.setAttribute('style', hueStyle(current.id));
    bandName.textContent = current.name;
    bandPick.setAttribute('aria-label', t('newTask.listLabel', { list: current.name }));
  };
  bandPick.addEventListener('click', async () => {
    const list = await pickList(targets, t('picker.title'));
    if (!list) return;
    current = list;
    showList();
    applyFeatures();
    title.focus({ preventScroll: true });
  });
  showList();
  // Vorschläge beim Tippen: passende erledigte Einträge der gewählten Liste. Antippen öffnet den alten Eintrag wieder.
  const suggest = h('div', { class: 'suggest-row', role: 'group', 'aria-label': t('newTask.suggestions'), hidden: true });
  const updateSuggestions = () => {
    const norm = (text) => stripPrio(text).toLowerCase().trim();
    const query = norm(title.value);
    const list = current;
    let found = [];
    if (state.status === 'online' && list.features.update && query.length >= 2) {
      const seen = new Set();
      found = (state.items[list.id] ?? [])
        .filter((item) => isCompleted(item) && !String(item.uid).startsWith('tmp-') && norm(item.summary).includes(query))
        .filter((item) => !seen.has(norm(item.summary)) && seen.add(norm(item.summary)))
        .sort((a, b) => Number(norm(b.summary).startsWith(query)) - Number(norm(a.summary).startsWith(query)))
        .slice(0, 3);
    }
    suggest.replaceChildren(
      ...found.map((item) =>
        h(
          'button',
          {
            class: 'suggest-chip press',
            type: 'button',
            title: t('item.reopen'),
            onclick: () => {
              close();
              completeWithUndo({ repo, toast }, list, item, false).catch(() => {});
            },
          },
          h('span', { class: 'suggest-mark' }, '↺'),
          stripPrio(item.summary) || item.summary,
        ),
      ),
    );
    suggest.hidden = found.length === 0;
  };
  // Mehrere Zeilen eingefügt oder geteilt: Vorschau mit Wahl zwischen einzelnen Aufgaben und einer Aufgabe mit Unteraufgaben.
  const multi = h('div', { class: 'multi-box', role: 'group', hidden: true });
  let multiLines = [];
  let confirmArmed = false;
  const isPrioOn = () => prio.getAttribute('aria-pressed') === 'true';
  const renderMulti = () => {
    multi.hidden = multiLines.length < 2;
    if (multi.hidden) return;
    const n = multiLines.length;
    const shown = multiLines.slice(0, 8);
    const createLabel = confirmArmed ? t('multi.confirmMany', { n }) : t('multi.createMany');
    multi.replaceChildren(
      h(
        'div',
        { class: 'multi-head' },
        h('span', { class: 'field-label' }, t('multi.detected', { n })),
        h('button', { class: 'label-btn press', type: 'button', onclick: dismissMulti }, t('multi.dismiss')),
      ),
      h(
        'ul',
        { class: 'multi-list' },
        shown.map((line) => h('li', {}, line.prio ? h('span', { class: 'multi-prio' }, '❗') : null, line.text)),
        n > shown.length ? h('li', { class: 'multi-more' }, t('multi.more', { n: n - shown.length })) : null,
      ),
      h(
        'div',
        { class: 'multi-actions' },
        h('button', { class: 'btn btn-primary btn-compact press', type: 'button', onclick: createMany }, createLabel),
        current.features.description ? h('button', { class: 'btn btn-compact press', type: 'button', onclick: asSubtasks }, t('multi.asSubtasks')) : null,
      ),
    );
  };
  let stash = null; // Titel und Beschreibung aus "Teilen an Merker", solange die Vorschau offen ist
  function dismissMulti() {
    if (stash && !title.value.trim() && !description.value.trim()) {
      title.value = stash.title;
      description.value = stash.description;
      save.disabled = title.value.trim() === '';
    }
    stash = null;
    multiLines = [];
    confirmArmed = false;
    renderMulti();
    title.focus({ preventScroll: true });
  }
  function showMulti(text) {
    multiLines = splitLines(text);
    confirmArmed = false;
    renderMulti();
    return multiLines.length >= 2;
  }
  function createMany() {
    if (multiLines.length >= CONFIRM_FROM && !confirmArmed) {
      confirmArmed = true;
      renderMulti();
      return;
    }
    const list = current;
    const fieldsList = multiLines.map((line) => {
      const fields = { summary: line.prio || isPrioOn() ? withPrio(line.text) : line.text };
      if (list.features.dueDate && due.value) fields.due = due.value;
      const extra = list.features.description ? composeDescription('') : '';
      if (extra) fields.description = extra;
      return fields;
    });
    setLastTarget(list.id);
    close();
    addManyWithUndo({ repo, toast, store: store ?? { get: () => state } }, list, fieldsList).catch(() => {});
  }
  function asSubtasks() {
    stash = null;
    subs.push(...multiLines.map((line) => line.text));
    renderSubs();
    subField.hidden = false;
    subButton.hidden = true;
    multiLines = [];
    renderMulti();
    if (!title.value.trim()) title.placeholder = t('multi.titleHint');
    title.focus({ preventScroll: true });
  }
  // Einfügen ins Titelfeld: Das einzeilige Feld würde Zeilenumbrüche verschlucken, darum vorher selbst lesen.
  title.addEventListener('paste', (event) => {
    const text = event.clipboardData?.getData('text/plain') ?? '';
    if (!/\n/.test(text.trim())) return;
    if (showMulti(text)) event.preventDefault();
  });

  const applyFeatures = () => {
    dueField.hidden = !current.features.dueDate;
    descriptionField.hidden = !current.features.description;
    subField.hidden = !current.features.description || (subField.hidden && !subs.length);
    recurrence.button.hidden = !current.features.description;
    updateSuggestions();
    renderMulti();
  };
  applyFeatures();

  const form = h(
    'form',
    { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('newTask.title') },
    band,
    h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'new-title' }, t('item.title')), h('div', { class: 'title-row' }, prio, title), suggest, multi),
    dueField,
    subField,
    descriptionField,
  );
  const root = h('div', { class: 'sheet-root' }, h('div', { class: 'sheet-scrim', onclick: () => close() }), form);

  // Eine Auswahl über dem Dialog (z. B. Wiederholen) kehrt per Zurück hierher zurück, dann bleibt der Dialog offen.
  const onPop = () => {
    if (history.state?.newTask) return;
    close(true);
  };
  const onKey = (event) => {
    if (event.key !== 'Escape') return;
    const roots = document.querySelectorAll('.sheet-root');
    if (roots[roots.length - 1] === root) close();
  };
  function close(viaBack = false) {
    if (closed) return;
    closed = true;
    window.removeEventListener('popstate', onPop);
    document.removeEventListener('keydown', onKey);
    root.classList.remove('open');
    setTimeout(() => root.remove(), 250);
    if (!viaBack && history.state?.picker) history.back();
  }

  if (initial.title) {
    title.value = initial.title;
    save.disabled = false;
  }
  if (initial.description) description.value = initial.description;
  if (initial.due) due.value = initial.due;
  // Geteilter Text mit mehreren Zeilen: gleich die Vorschau zeigen. Wer sie schließt, legt wie bisher eine Aufgabe an.
  if (initial.raw && showMulti(initial.raw)) {
    stash = { title: title.value, description: description.value };
    title.value = '';
    description.value = '';
    save.disabled = true;
  }
  title.addEventListener('input', () => {
    save.disabled = title.value.trim() === '';
    updateSuggestions();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = title.value.trim();
    if (!text) return;
    const list = current;
    const fields = { summary: prio.getAttribute('aria-pressed') === 'true' ? withPrio(text) : text };
    // Unteraufgaben (auch eine noch nicht bestätigte Eingabe) als Checkliste ans Ende der Beschreibung
    if (subInput.value.trim()) subs.push(subInput.value.trim());
    let descText = description.value;
    for (const sub of subs) descText = addChecklistLine(descText, sub);
    if (list.features.description && composeDescription(descText)) fields.description = composeDescription(descText);
    if (list.features.dueDate && due.value) fields.due = due.value;
    setLastTarget(list.id);
    close();
    repo
      .addItem(list.id, fields)
      .then(() => toast.show(t('newTask.added', { list: list.name })))
      .catch((err) => toast.show(t('toast.notSaved', { error: errorText(err) }), { error: true }));
  });

  document.body.append(root);
  window.addEventListener('popstate', onPop);
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => root.classList.add('open'));
  title.focus({ preventScroll: true });
}
