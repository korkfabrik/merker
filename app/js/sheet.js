// Bearbeiten-Dialog (Bottom Sheet) für einen Eintrag. Eigene Adresse: #/liste/<entity>/<uid>.
// Das Sheet wird nur einmal gebaut. Spätere Änderungen im Store zeichnen es nicht neu, getippter Text bleibt erhalten.
import { h, icon } from './ui.js';
import { stripPrio, isPrio, withPrio, parseDue, withTimeOf, isCompleted, parseChecklist, toggleChecklistLine, addChecklistLine, setChecklistText, removeLine, insertLine, moveChecklistLine, moveChecklistLineToEnd, getRecurrence, stripRecurrence, setRecurrence, RECURRENCES, recurrenceLabel } from './rules.js';
import { attachReorder } from './reorder.js';
import { recurrenceButton } from './recurfield.js';
import { attachSwipe } from './swipe.js';
import { quickDates } from './quickdates.js';
import { itemAsText, shareOrCopy } from './share.js';
import { findLinks, LINK_ICONS } from './links.js';
import { errorText } from './repository.js';
import { hueStyle, getSubDoneLast } from './settings.js';
import { completeWithUndo, deleteWithUndo, moveWithUndo, canMove, duplicateWithUndo } from './actions.js';
import { t, locale } from './i18n.js';

export class ItemSheet {
  #root = null;
  #key = null;
  #leaving = false;
  #moving = false;
  #missingKey = null;
  // Escape schließt nur den obersten Dialog (eine Auswahl darüber schließt sich selbst)
  #onKey = (event) => {
    if (event.key !== 'Escape') return;
    const roots = document.querySelectorAll('.sheet-root');
    if (roots[roots.length - 1] !== this.#root) return;
    this.#leave();
  };

  constructor({ router, repo, toast, store }) {
    this.store = store;
    this.router = router;
    this.repo = repo;
    this.toast = toast;
  }

  sync(route, state) {
    if (route.name !== 'item') {
      this.#close();
      return;
    }
    const key = `${route.id}\u0000${route.uid}`;
    const list = state.lists.find((entry) => entry.id === route.id);
    if (!list || !state.loaded[route.id]) return; // Daten sind noch nicht da
    const item = (state.items[route.id] ?? []).find((entry) => entry.uid === route.uid);

    if (this.#key === key) {
      // Der Eintrag verschwindet, während das Sheet offen ist (zum Beispiel in HA gelöscht).
      if (!item && !this.#leaving) {
        if (!this.#moving) this.toast.show(t('sheet.goneRemote'));
        this.#leave();
      }
      return;
    }
    if (!item || !list.features.update) {
      if (this.#missingKey !== key) {
        this.#missingKey = key;
        this.toast.show(t('sheet.notFound'));
        this.router.up();
      }
      return;
    }
    this.#open(list, item, key);
  }

  #leave() {
    if (this.#leaving) return;
    this.#leaving = true;
    this.router.up();
  }

  #close() {
    if (!this.#root) return;
    document.removeEventListener('keydown', this.#onKey);
    this.#root.remove();
    this.#root = null;
    this.#key = null;
    this.#leaving = false;
  }

  #fail(err) {
    this.toast.show(t('toast.notSaved', { error: errorText(err) }), { error: true });
  }

  #open(list, item, key) {
    this.#close();
    this.#key = key;
    this.#missingKey = null;
    this.#leaving = false;
    const { features } = list;
    const originalDue = parseDue(item.due)?.date ?? '';

    const title = h('input', { class: 'field-input', name: 'title', id: 'sheet-title', type: 'text', value: stripPrio(item.summary), enterkeyhint: 'done' });
    const prio = h('button', { class: 'prio-toggle press', type: 'button', name: 'prio', 'aria-pressed': String(isPrio(item.summary)), 'aria-label': t('item.prioToggle') }, '❗');
    prio.addEventListener('click', () => {
      prio.setAttribute('aria-pressed', String(prio.getAttribute('aria-pressed') !== 'true'));
      title.focus({ preventScroll: true });
    });
    const description = features.description
      ? h('textarea', { class: 'field-input', name: 'description', rows: '3' })
      : null;
    // Die Zeile "🔁 …" steht nicht im Textfeld, sondern als Auswahl "Wiederholen". Gespeichert wird sie wieder in der Beschreibung.
    const storedRecurrence = getRecurrence(item.description);
    const withStoredRecurrence = (text) => setRecurrence(text, storedRecurrence);
    if (description) description.value = stripRecurrence(item.description ?? '');
    if (description) description.id = 'sheet-description';
    // Kleiner Knopf: heutiges Datum (TT.MM.JJJJ) als Anfang der ersten Zeile der Beschreibung.
    // Nach dem Datum ein Leerzeichen, dort steht der Cursor zum Weiterschreiben. Vorhandener Text folgt in der nächsten Zeile. Gespeichert wird erst mit Speichern.
    const dateStamp = description
      ? h(
          'button',
          {
            class: 'label-btn press',
            type: 'button',
            title: t('sheet.insertDate'),
            'aria-label': t('sheet.insertDate'),
            onclick: () => {
              const stamp = new Date().toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
              const rest = description.value.replace(/^\n+/, '');
              description.value = `${stamp} ${rest ? `\n${rest}` : ''}`;
              description.dispatchEvent(new Event('input', { bubbles: true }));
              description.focus({ preventScroll: true });
              description.setSelectionRange(stamp.length + 1, stamp.length + 1);
              description.scrollTop = 0;
            },
          },
          icon('calendar', 16),
          t('sheet.insertDateShort'),
        )
      : null;
    const due = features.dueDate ? h('input', { class: 'field-input', name: 'due', type: 'date', value: originalDue }) : null;

    // Unteraufgaben: Kästchen aus den Zeilen "- [ ] ..." der Beschreibung. Antippen speichert sofort.
    const checklistBox = description ? h('div', { class: 'checklist-box' }) : null;
    let subsOpen = false;
    const subButton = description
      ? h(
          'button',
          {
            class: 'label-btn press',
            type: 'button',
            onclick: () => {
              subsOpen = true;
              renderChecklist();
              addInput.focus({ preventScroll: true });
            },
          },
          icon('plus', 16),
          t('sheet.subtaskButton'),
        )
      : null;
    const persistDescription = (next) => {
      const previous = description.value;
      description.value = next;
      renderChecklist();
      const stored = withStoredRecurrence(next).trim() || null;
      this.repo.updateItem(list.id, item.uid, { description: stored }).then(
        () => (item = { ...item, description: stored }),
        (err) => {
          description.value = previous;
          renderChecklist();
          this.#fail(err);
        },
      );
    };
    const addInput = h('input', { class: 'field-input check-add-input', type: 'text', placeholder: t('sheet.addSubtask'), enterkeyhint: 'done', 'aria-label': t('sheet.addSubtask') });
    const addNow = () => {
      const text = addInput.value.trim();
      if (!text) return;
      addInput.value = '';
      persistDescription(addChecklistLine(description.value, text));
    };
    addInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        addNow();
      }
    });
    // Nach links wischen löscht die Unteraufgabe. Rückgängig setzt dieselbe Zeile an dieselbe Stelle zurück.
    const removeSub = (entry) => {
      const { text, line } = removeLine(description.value, entry.index);
      persistDescription(text);
      this.toast.show(t('sheet.subtaskDeleted'), {
        actionLabel: t('common.undo'),
        onAction: () => {
          const stored = this.store.get().items[list.id]?.find((candidate) => candidate.uid === item.uid)?.description;
          const next = insertLine(stored != null ? stripRecurrence(stored) : description.value, entry.index, line);
          if (this.#key === key) persistDescription(next);
          else this.repo.updateItem(list.id, item.uid, { description: withStoredRecurrence(next).trim() || null }).catch((err) => this.#fail(err));
        },
      });
    };
    function renderChecklist() {
      if (!checklistBox) return;
      const { items, total, done } = parseChecklist(description.value);
      const rows = items.map((entry) => {
        const button = h(
          'button',
          {
            class: 'check-row' + (entry.checked ? ' is-checked' : ''),
            type: 'button',
            role: 'checkbox',
            'aria-checked': String(entry.checked),
            onclick: () => {
              let next = toggleChecklistLine(description.value, entry.index);
              if (!entry.checked && getSubDoneLast()) next = moveChecklistLineToEnd(next, entry.index);
              persistDescription(next);
            },
          },
          h('span', { class: 'check-box', 'aria-hidden': 'true' }),
          h('span', { class: 'check-text' }, entry.text),
        );
        const line = h('div', { class: 'sub-line' }, button);
        const pencil = h('button', { class: 'sub-edit press', type: 'button', 'aria-label': t('sheet.editSubtask', { text: entry.text }) }, icon('edit', 20));
        pencil.addEventListener('click', () => {
          const input = h('input', { class: 'field-input sub-edit-input', type: 'text', value: entry.text, enterkeyhint: 'done', 'aria-label': t('sheet.subtask') });
          let finished = false;
          const finish = (save) => {
            if (finished) return;
            finished = true;
            const text = input.value.trim();
            if (save && text && text !== entry.text) persistDescription(setChecklistText(description.value, entry.index, text));
            else renderChecklist();
          };
          input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              finish(true);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              finish(false);
            }
          });
          input.addEventListener('blur', () => finish(true));
          line.replaceChildren(input);
          input.focus();
          input.select();
        });
        line.append(pencil);
        // Griff zum Umsortieren, ab zwei Unteraufgaben
        // Links, damit Wischen nach links von rechts aus nicht auf dem Griff startet
        if (total > 1) line.prepend(h('span', { class: 'drag-handle sub-handle', role: 'button', 'aria-label': t('sheet.reorderSubtask', { text: entry.text }) }, icon('drag', 22)));
        const wrap = h('li', { class: 'swipe sub-swipe', 'data-uid': String(entry.index) }, line);
        attachSwipe(wrap, line, { onLeft: () => removeSub(entry) });
        return wrap;
      });
      const subList = h('ul', { class: 'plain-list sub-list' }, rows);
      attachReorder(subList, () => checklistBox.closest('.sheet'), (uid, previousUid) =>
        persistDescription(moveChecklistLine(description.value, Number(uid), previousUid === null ? null : Number(previousUid))),
      );
      // Ohne Unteraufgaben bleibt der Bereich zu, bis "+ Unteraufgabe" angetippt wird
      checklistBox.hidden = total === 0 && !subsOpen;
      if (subButton) subButton.hidden = !checklistBox.hidden;
      checklistBox.replaceChildren(
        h('span', { class: 'field-label' }, total ? t('sheet.subtasksCount', { done, total }) : t('sheet.subtasks')),
        subList,
        h('div', { class: 'check-add' }, addInput, h('button', { class: 'btn press', type: 'button', onclick: addNow }, t('sheet.addSubtaskButton'))),
      );
    }
    renderChecklist();
    if (description) description.addEventListener('input', renderChecklist);

    // Links, Adressen und Nummern aus Titel und Beschreibung als antippbare Knöpfe.
    const linkBox = h('div', { class: 'link-chips', role: 'group', 'aria-label': t('sheet.links'), hidden: true });
    const renderLinks = () => {
      const found = findLinks(`${title.value}\n${description?.value ?? ''}`);
      linkBox.replaceChildren(
        ...found.map((entry) =>
          h(
            'a',
            { class: 'link-chip press', href: entry.href, ...(entry.kind === 'url' ? { target: '_blank', rel: 'noopener noreferrer' } : {}) },
            h('span', { 'aria-hidden': 'true' }, LINK_ICONS[entry.kind]),
            entry.label,
          ),
        ),
      );
      linkBox.hidden = found.length === 0;
    };
    renderLinks();
    title.addEventListener('input', renderLinks);
    description?.addEventListener('input', renderLinks);

    const save = h('button', { class: 'btn btn-primary btn-compact press', type: 'submit' }, t('sheet.save'));
    // Wiederholen nur mit Datum und Beschreibung (die Wiederholung steht in der Beschreibung)
    const recurrence = description && due ? recurrenceButton(storedRecurrence) : null;
    // Oben rechts Erledigt (nur offen) und Speichern. Unten links Löschen, rechts Wieder öffnen (nur erledigt), Verschieben, Duplizieren, Teilen.
    const fields = () => ({ title, prio, description, due, originalDue, recurrence: recurrence?.state ?? null });
    const done = !isCompleted(item) && features.update
      ? h('button', { class: 'btn btn-primary btn-compact btn-done press', type: 'button', 'aria-label': t('item.markDone'), title: t('item.markDone'), onclick: () => this.#complete(list, item, fields()) }, icon('check', 24))
      : null;
    const right = [];
    if (isCompleted(item)) {
      right.push(h('button', { class: 'btn btn-icon press', type: 'button', 'aria-label': t('item.reopen'), title: t('item.reopen'), onclick: () => this.#reopen(list, item) }, icon('reopen', 22)));
    }
    if (canMove(this.store.get(), list)) {
      right.push(h('button', { class: 'btn btn-icon press', type: 'button', 'aria-label': t('sheet.move'), title: t('sheet.move'), onclick: () => this.#move(list, item) }, icon('move', 22)));
    }
    if (features.create) {
      right.push(h('button', { class: 'btn btn-icon press', type: 'button', 'aria-label': t('sheet.duplicate'), title: t('sheet.duplicate'), onclick: () => this.#duplicate(list, item) }, icon('copy', 22)));
    }
    right.push(h('button', { class: 'btn btn-icon press', type: 'button', 'aria-label': t('sheet.share'), title: t('sheet.share'), onclick: () => shareOrCopy({ title: item.summary, text: itemAsText(item), toast: this.toast, copiedText: t('share.itemCopied') }) }, icon('share', 22)));
    const actions = [];
    if (features.remove) {
      actions.push(h('button', { class: 'btn btn-icon btn-danger press', type: 'button', 'aria-label': t('sheet.delete'), title: t('sheet.delete'), onclick: () => this.#delete(list, item) }, icon('trash', 22)));
    }
    actions.push(h('div', { class: 'sheet-actions-right' }, right));

    const form = h(
      'form',
      { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('sheet.title'), tabindex: '-1' },
      // Kopf in der Listenfarbe: Griff, Listenname, Speichern
      h(
        'div',
        { class: 'sheet-band', style: hueStyle(list.id) },
        h('div', { class: 'sheet-handle' }),
        h('div', { class: 'sheet-head sheet-head-edit' }, h('span', { class: 'sheet-band-name' }, list.name), h('div', { class: 'sheet-head-buttons' }, done, save)),
      ),
      h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'sheet-title' }, t('item.title')), h('div', { class: 'title-row' }, prio, title)),
      checklistBox,
      linkBox,
      description
        ? h(
            'div',
            { class: 'field' },
            h('div', { class: 'label-row' }, h('label', { class: 'field-label', for: 'sheet-description' }, t('item.description')), h('span', { class: 'label-btns' }, subButton, dateStamp)),
            description,
          )
        : null,
      due
        ? h(
            'div',
            { class: 'field' },
            h('div', { class: 'label-row' }, h('label', { class: 'field-label', for: 'sheet-due' }, t('item.due')), recurrence?.button ?? null),
            h('div', { class: 'date-row' }, Object.assign(due, { id: 'sheet-due' })),
            quickDates(due),
          )
        : null,
      h('div', { class: 'sheet-actions' }, actions),
    );

    title.addEventListener('input', () => (save.disabled = title.value.trim() === ''));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.#save(list, item, { title, prio, description, due, originalDue, recurrence: recurrence?.state ?? null });
    });

    const scrim = h('div', { class: 'sheet-scrim', onclick: () => this.#leave() });
    this.#root = h('div', { class: 'sheet-root' }, scrim, form);
    document.body.append(this.#root);
    document.addEventListener('keydown', this.#onKey);
    requestAnimationFrame(() => this.#root?.classList.add('open'));
    form.focus({ preventScroll: true });
  }

  #save(list, item, fields) {
    const changes = this.#changes(item, fields);
    if (!changes) return;
    this.#leave();
    if (Object.keys(changes).length === 0) return;
    this.repo.updateItem(list.id, item.uid, changes).catch((err) => this.#fail(err));
  }

  // Erledigen aus dem Dialog: erst die Änderungen im Dialog speichern, dann abhaken (Wiederholung rechnet mit dem neuen Stand).
  #complete(list, item, fields) {
    const changes = this.#changes(item, fields) ?? {};
    this.#leave();
    (async () => {
      if (Object.keys(changes).length) await this.repo.updateItem(list.id, item.uid, changes);
      await completeWithUndo(this, list, { ...item, ...changes }, true);
    })().catch((err) => this.#fail(err));
  }

  // Was sich im Dialog geändert hat. null, wenn der Titel leer ist.
  #changes(item, fields) {
    const text = fields.title.value.trim();
    if (!text) return null;
    const summary = fields.prio.getAttribute('aria-pressed') === 'true' ? withPrio(text) : stripPrio(text) || text;
    const changes = {};
    if (summary !== item.summary) changes.summary = summary;
    if (fields.description) {
      const recurrence = fields.recurrence ? fields.recurrence.value || null : getRecurrence(item.description);
      const next = setRecurrence(fields.description.value, recurrence).trim() || null;
      if (next !== (item.description || null)) changes.description = next;
    }
    if (fields.due) {
      const next = fields.due.value || '';
      if (next !== fields.originalDue) changes.due = withTimeOf(next, item.due) || null; // Uhrzeit der bisherigen Fälligkeit bleibt
    }
    return changes;
  }

  // Kopie anlegen (bei mehreren Listen mit Auswahl), danach schließt der Dialog.
  #duplicate(list, item) {
    duplicateWithUndo(this, list, item)
      .then((done) => done && this.#root && this.#leave())
      .catch(() => {});
  }

  #reopen(list, item) {
    this.#leave();
    completeWithUndo(this, list, item, false).catch(() => {});
  }

  #move(list, item) {
    // Erst die Liste wählen lassen, der Dialog bleibt dabei offen. Erst danach schließen.
    this.#moving = true;
    moveWithUndo(this, list, item)
      .then(() => this.#root && this.#leave()) // der Dialog schließt sich meist schon selbst, weil der Eintrag fehlt
      .catch(() => {})
      .finally(() => (this.#moving = false));
  }

  #delete(list, item) {
    this.#leave();
    deleteWithUndo(this, list, item).catch(() => {});
  }
}
