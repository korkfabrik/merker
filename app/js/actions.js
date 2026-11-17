// Gemeinsame Aktionen mit Meldung und "Rückgängig". Genutzt von der Wischgeste und vom Bearbeiten-Dialog.
// Die zurückgegebenen Versprechen schlagen bei einem Fehler fehl, die Fehlermeldung wird hier schon gezeigt.
import { parseDue, dueValue, withTimeOf, getRecurrence, nextDue, resetForRepeat, formatDue, formatDay, stripPrio } from './rules.js';
import { pickList, pickChoice } from './picker.js';
import { quickDay } from './quickdates.js';
import { errorText } from './repository.js';
import { t } from './i18n.js';

function reporter(toast, rethrow) {
  return (err) => {
    toast.show(t('toast.notSaved', { error: errorText(err) }), { error: true });
    if (rethrow) throw err;
  };
}

export function completeWithUndo({ repo, toast }, list, item, completed) {
  const recurrence = completed && list.features.create ? getRecurrence(item.description) : null;
  if (recurrence) return completeRepeating({ repo, toast }, list, item, recurrence);
  if (completed) vibrate(15);
  const result = repo.setCompleted(list.id, item.uid, completed).catch(reporter(toast, true));
  const name = stripPrio(item.summary) || item.summary;
  toast.show(completed ? t('toast.completedNamed', { name }) : t('toast.reopenedNamed', { name }), {
    oneLine: true,
    actionLabel: t('common.undo'),
    onAction: () => repo.setCompleted(list.id, item.uid, !completed).catch(reporter(toast, false)),
  });
  return result;
}

// Wiederkehrende Aufgabe erledigen: die nächste Runde mit neuem Datum anlegen (Unteraufgaben wieder offen).
// Rückgängig öffnet die erledigte wieder und entfernt die neue.
async function completeRepeating({ repo, toast }, list, item, recurrence) {
  vibrate(15);
  const store = repo.store;
  const known = new Set((store.get().items[list.id] ?? []).map((entry) => entry.uid));
  const due = nextDue(parseDue(item.due)?.date ?? null, recurrence);
  const fields = { summary: item.summary, description: resetForRepeat(item.description) || null };
  if (list.features.dueDate) fields.due = withTimeOf(due, item.due);
  try {
    await repo.setCompleted(list.id, item.uid, true);
  } catch (err) {
    reporter(toast, true)(err);
  }
  try {
    await repo.addItem(list.id, fields);
  } catch (err) {
    toast.show(t('repeat.notCreated', { error: errorText(err) }), { error: true });
    return;
  }
  toast.show(list.features.dueDate ? t('repeat.next', { date: formatDue(due) }) : t('toast.completed'), {
    actionLabel: t('common.undo'),
    onAction: async () => {
      try {
        for (let i = 0; i < 30; i++) {
          const pending = (store.get().items[list.id] ?? []).some((entry) => String(entry.uid).startsWith('tmp-'));
          if (!pending) break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        const copy = (store.get().items[list.id] ?? []).filter((entry) => !known.has(entry.uid) && entry.summary === item.summary).at(-1);
        if (copy) await repo.removeItem(list.id, copy.uid);
        await repo.setCompleted(list.id, item.uid, false);
      } catch (err) {
        toast.show(t('toast.notRestored', { error: errorText(err) }), { error: true });
      }
    },
  });
}

// Rückgängig legt den Eintrag mit Titel, Beschreibung und Datum neu an und setzt ihn an seinen alten Platz.
export function deleteWithUndo({ repo, toast }, list, item) {
  const snapshot = { summary: item.summary, description: item.description ?? null, due: dueValue(item.due) };
  const place = { previousUid: repo.previousUid(list.id, item.uid), completed: item.status === 'completed' };
  const result = repo.removeItem(list.id, item.uid).catch(reporter(toast, true));
  toast.show(t('toast.deleted'), {
    actionLabel: t('common.undo'),
    onAction: () => repo.restoreItem(list.id, snapshot, place).catch(reporter(toast, false)),
  });
  return result;
}

// Alle erledigten Einträge einer Liste löschen. Rückgängig legt sie neu an und setzt sie wieder auf erledigt.
export async function clearCompletedWithUndo({ repo, toast }, list) {
  let removed;
  try {
    removed = await repo.clearCompleted(list.id);
  } catch (err) {
    toast.show(t('toast.notDeleted', { error: errorText(err) }), { error: true });
    return;
  }
  if (removed.length === 0) return;
  const snapshots = removed.map((item) => ({ summary: item.summary, description: item.description ?? null, due: dueValue(item.due) }));
  toast.show(t('toast.clearedDone', { n: removed.length }), {
    actionLabel: t('common.undo'),
    onAction: async () => {
      try {
        const restored = await repo.restoreCompleted(list.id, snapshots);
        if (restored < snapshots.length) toast.show(t('toast.restoredOpen', { n: snapshots.length - restored }), {});
      } catch (err) {
        toast.show(t('toast.notRestored', { error: errorText(err) }), { error: true });
      }
    },
  });
}

// Ziel-Listen für "Verschieben": andere, verfügbare Listen mit Anlegen-Recht.
export const moveTargets = (state, list) => state.lists.filter((entry) => entry.id !== list.id && entry.available && entry.features.create);
export const canMove = (state, list) => list.features.remove && moveTargets(state, list).length > 0;

// Fragt die Ziel-Liste, legt den Eintrag dort neu an und löscht ihn in der alten Liste.
// Erledigte Einträge kommen offen an. Bricht man ab, schlägt das Versprechen fehl (Wischzeile federt zurück).
export async function moveWithUndo({ repo, toast, store }, list, item) {
  const targets = moveTargets(store.get(), list);
  const target = await pickList(targets, t('picker.moveTitle'));
  if (!target) throw new Error('abgebrochen');
  const snapshot = { summary: item.summary, description: item.description ?? null, due: dueValue(item.due) };
  const place = { previousUid: repo.previousUid(list.id, item.uid), completed: item.status === 'completed' };
  try {
    await repo.addItem(target.id, snapshot);
  } catch (err) {
    toast.show(t('toast.notMoved', { error: errorTextOf(err) }), { error: true });
    throw err;
  }
  try {
    await repo.removeItem(list.id, item.uid);
  } catch (err) {
    toast.show(t('toast.movedPartly', { error: errorTextOf(err) }), { error: true });
    return;
  }
  toast.show(t('toast.movedTo', { list: target.name }), {
    actionLabel: t('common.undo'),
    onAction: async () => {
      try {
        // Die echte ID des neuen Eintrags kommt erst per Abo. Gesucht wird der zuletzt angelegte mit gleichem Titel.
        const copies = (store.get().items[target.id] ?? []).filter((entry) => entry.summary === snapshot.summary && !String(entry.uid).startsWith('tmp-'));
        const copy = copies.at(-1);
        if (copy) await repo.removeItem(target.id, copy.uid);
        await repo.restoreItem(list.id, snapshot, place);
      } catch (err) {
        toast.show(t('toast.notRestored', { error: errorTextOf(err) }), { error: true });
      }
    },
  });
}

function errorTextOf(err) {
  return err?.message || String(err);
}

// Mehrere Aufgaben nacheinander anlegen (Reihenfolge bleibt). Rückgängig entfernt alle, die dabei entstanden sind.
export async function addManyWithUndo({ repo, toast, store }, list, fieldsList) {
  const known = new Set((store.get().items[list.id] ?? []).map((item) => item.uid));
  let done = 0;
  try {
    for (const fields of fieldsList) {
      await repo.addItem(list.id, fields);
      done++;
    }
  } catch (err) {
    toast.show(t('multi.partial', { done, n: fieldsList.length, error: errorText(err) }), { error: true });
    if (done === 0) return;
  }
  const summaries = new Set(fieldsList.slice(0, done).map((fields) => fields.summary));
  // Die echten IDs kommen per Abo. Kurz warten, bis keine vorläufigen Einträge mehr da sind.
  const created = async () => {
    for (let i = 0; i < 30; i++) {
      const items = (store.get().items[list.id] ?? []).filter((item) => !known.has(item.uid) && summaries.has(item.summary));
      if (!items.some((item) => String(item.uid).startsWith('tmp-'))) return items;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return (store.get().items[list.id] ?? []).filter((item) => !known.has(item.uid) && summaries.has(item.summary) && !String(item.uid).startsWith('tmp-'));
  };
  if (done < fieldsList.length) return;
  toast.show(t('multi.added', { n: done, list: list.name }), {
    actionLabel: t('common.undo'),
    onAction: async () => {
      try {
        for (const item of await created()) await repo.removeItem(list.id, item.uid);
      } catch (err) {
        toast.show(t('toast.notRestored', { error: errorText(err) }), { error: true });
      }
    },
  });
}

// Kopie einer Aufgabe: gleicher Titel, Beschreibung mit offenen Unteraufgaben (ohne Erledigt-Datum), gleiches Datum.
// Gibt es mehrere beschreibbare Listen, wird gefragt, wohin (die eigene Liste steht oben). Liefert true, wenn angelegt.
export async function duplicateWithUndo({ repo, toast, store }, list, item) {
  const writable = store.get().lists.filter((entry) => entry.available && entry.features.create);
  const choices = [writable.find((entry) => entry.id === list.id), ...writable.filter((entry) => entry.id !== list.id)].filter(Boolean);
  const target = choices.length > 1 ? await pickList(choices, t('picker.copyTitle')) : choices[0];
  if (!target) return false;
  const known = new Set((store.get().items[target.id] ?? []).map((entry) => entry.uid));
  const fields = { summary: item.summary };
  const description = resetForRepeat(item.description);
  if (target.features.description && description) fields.description = description;
  const due = dueValue(item.due);
  if (target.features.dueDate && due) fields.due = due;
  try {
    await repo.addItem(target.id, fields);
  } catch (err) {
    toast.show(t('toast.notSaved', { error: errorText(err) }), { error: true });
    return false;
  }
  toast.show(t('toast.copied', { list: target.name }), {
    actionLabel: t('common.undo'),
    onAction: async () => {
      try {
        for (let i = 0; i < 30 && (store.get().items[target.id] ?? []).some((entry) => String(entry.uid).startsWith('tmp-')); i++) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        const copy = (store.get().items[target.id] ?? []).filter((entry) => !known.has(entry.uid) && entry.summary === item.summary).at(-1);
        if (copy) await repo.removeItem(target.id, copy.uid);
      } catch (err) {
        toast.show(t('toast.notRestored', { error: errorText(err) }), { error: true });
      }
    },
  });
  return true;
}

// Neues Fälligkeitsdatum ohne den Dialog (langes Drücken, Datum antippen oder Wischen nach links).
// Im Fenster stehen die echten Tage dabei, "Datum wählen …" öffnet den Kalender. Rückgängig setzt das alte Datum zurück.
// Liefert true, wenn sich das Datum geändert hat.
export async function snoozeWithUndo({ repo, toast }, list, item) {
  const day = (kind) => formatDay(quickDay(kind));
  const before = parseDue(item.due)?.date ?? null;
  const choice = await pickChoice(
    [
      ['heute', t('quick.today'), day('heute')],
      ['morgen', t('quick.tomorrow'), day('morgen')],
      ['wochenende', t('snooze.weekend'), day('wochenende')],
      ['woche', t('quick.nextWeek'), day('woche')],
      ['pick', t('snooze.pick'), '📅'],
      ['none', t('quick.noneHint'), ''],
    ],
    null,
    t('snooze.title', { title: stripPrio(item.summary) || item.summary }),
  );
  if (!choice) return false;
  const next = choice === 'pick' ? await askDate(before) : quickDay(choice) || null;
  if (next === undefined || next === before) return false;
  try {
    await repo.updateItem(list.id, item.uid, { due: withTimeOf(next, item.due) });
  } catch (err) {
    toast.show(t('toast.notSaved', { error: errorText(err) }), { error: true });
    return false;
  }
  vibrate(12);
  toast.show(next ? t('snooze.done', { date: formatDue(next) }) : t('snooze.cleared'), {
    actionLabel: t('common.undo'),
    onAction: () => repo.updateItem(list.id, item.uid, { due: dueValue(item.due) }).catch(reporter(toast, false)),
  });
  return true;
}

// Kalender des Geräts öffnen. Liefert das Datum, oder undefined bei Abbruch.
function askDate(initial) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'date';
    input.className = 'date-ask';
    input.value = initial ?? '';
    document.body.append(input);
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      input.remove();
      resolve(value);
    };
    input.addEventListener('change', () => finish(input.value || undefined));
    input.addEventListener('cancel', () => finish(undefined));
    try {
      input.showPicker();
    } catch {
      input.focus();
      input.click();
    }
    // Ohne Rückmeldung (älterer Browser) nach einer Minute aufräumen
    setTimeout(() => finish(undefined), 60000);
  });
}

// Kurzes Vibrieren (Android). Ohne Unterstützung passiert nichts.
export function vibrate(ms = 10) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // ignorieren
  }
}
