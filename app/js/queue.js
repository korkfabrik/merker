// Warteschlange für Änderungen ohne Verbindung. Jede Änderung ist ein kleiner Auftrag:
// { id, entityId, service, data, localUid? }. service ist add_item, update_item, remove_item, remove_completed_items oder move.
// Die Aufträge bleiben im Gerät gespeichert (auch nach Neustart) und werden der Reihe nach gesendet, sobald die Verbindung da ist.
// Bis dahin zeigt die App sie über den Stand aus Home Assistant gelegt (overlay), damit die Anzeige zur Änderung passt.

const KEY = 'merker.queue';

export function clearQueue() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignorieren
  }
}
export const LOCAL_PREFIX = 'local-';
export const isLocalUid = (uid) => String(uid ?? '').startsWith(LOCAL_PREFIX);

export function loadQueue() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((op) => op && op.entityId && op.service) : [];
  } catch {
    return [];
  }
}

export function saveQueue(queue) {
  try {
    if (queue.length) localStorage.setItem(KEY, JSON.stringify(queue));
    else localStorage.removeItem(KEY);
  } catch {
    // ohne Speicher bleibt die Warteschlange nur bis zum Neustart
  }
}

const uidsOf = (value) => (Array.isArray(value) ? value : [value]);

// Wirkung eines Auftrags auf die Einträge einer Liste (ohne Seiteneffekte)
export function applyOp(items, op) {
  const { service, data } = op;
  if (service === 'add_item') {
    if (items.some((item) => item.uid === op.localUid)) return items;
    return [
      ...items,
      { uid: op.localUid, summary: data.item, status: 'needs_action', due: data.due_datetime ?? data.due_date ?? null, description: data.description ?? null },
    ];
  }
  if (service === 'update_item') {
    return items.map((item) => {
      if (item.uid !== data.item) return item;
      const next = { ...item };
      if ('rename' in data) next.summary = data.rename;
      if ('description' in data) next.description = data.description;
      if ('due_date' in data) next.due = data.due_date;
      if ('due_datetime' in data) next.due = data.due_datetime;
      if ('status' in data) next.status = data.status;
      return next;
    });
  }
  if (service === 'remove_item') {
    const gone = new Set(uidsOf(data.item));
    return items.filter((item) => !gone.has(item.uid));
  }
  if (service === 'remove_completed_items') return items.filter((item) => item.status !== 'completed');
  if (service === 'move') {
    const moving = items.find((item) => item.uid === data.uid);
    if (!moving) return items;
    const rest = items.filter((item) => item.uid !== data.uid);
    const at = data.previous_uid ? rest.findIndex((item) => item.uid === data.previous_uid) + 1 : 0;
    return [...rest.slice(0, at), moving, ...rest.slice(at)];
  }
  return items;
}

// Stand aus Home Assistant plus alle wartenden Aufträge dieser Liste
// Gesendete neue Aufgaben fallen weg, sobald sie im Stand von Home Assistant stehen (sonst stünden sie doppelt da).
// Andere Änderungen bleiben darübergelegt, bis sie bestätigt sind (doppelt anwenden ändert nichts).
export function overlay(entityId, items, queue) {
  return queue
    .filter((op) => op.entityId === entityId)
    .filter((op) => !(op.service === 'add_item' && op.sending && items.some((item) => !(op.known ?? []).includes(item.uid) && item.summary === op.data.item)))
    .reduce(applyOp, items);
}

// Neuen Auftrag einreihen. Änderungen an einer noch nicht gesendeten neuen Aufgabe werden in deren Anlegen eingerechnet,
// Löschen einer noch nicht gesendeten Aufgabe streicht sie ganz.
export function enqueue(queue, op) {
  const target = op.service === 'update_item' || op.service === 'remove_item' ? op.data.item : op.service === 'move' ? op.data.uid : null;
  if (typeof target === 'string' && isLocalUid(target)) {
    const add = queue.find((entry) => entry.service === 'add_item' && entry.localUid === target && !entry.sending);
    if (add && op.service === 'remove_item') {
      return queue.filter((entry) => entry !== add && !refersTo(entry, target));
    }
    if (add && op.service === 'update_item') {
      const { rename, description, due_date: due, due_datetime: dueTime, status } = op.data;
      const data = { ...add.data };
      if (rename !== undefined) data.item = rename;
      if (description !== undefined) {
        if (description) data.description = description;
        else delete data.description;
      }
      if (due !== undefined) {
        delete data.due_datetime;
        if (due) data.due_date = due;
        else delete data.due_date;
      }
      if (dueTime !== undefined) {
        delete data.due_date;
        data.due_datetime = dueTime;
      }
      const merged = queue.map((entry) => (entry === add ? { ...add, data } : entry));
      // Erledigt/offen kann Home Assistant beim Anlegen nicht setzen: bleibt ein eigener Auftrag.
      // Ein früherer Status-Auftrag fällt nur weg, wenn die neue Änderung selbst einen Status bringt.
      if (status === undefined) return merged;
      const withoutStatus = merged.filter((entry) => !(entry.service === 'update_item' && entry.data.item === target && 'status' in entry.data));
      return [...withoutStatus, { ...op, data: { item: target, status } }];
    }
  }
  return [...queue, op];
}

function refersTo(op, uid) {
  if (op.service === 'move') return op.data.uid === uid || op.data.previous_uid === uid;
  return uidsOf(op.data.item).includes(uid);
}

// Nach dem Senden einer neuen Aufgabe: vorläufige ID in den folgenden Aufträgen durch die echte ersetzen
export function remap(queue, localUid, realUid) {
  const swap = (value) => (value === localUid ? realUid : value);
  return queue.map((op) => {
    if (op.service === 'move') return { ...op, data: { ...op.data, uid: swap(op.data.uid), previous_uid: swap(op.data.previous_uid) } };
    if ('item' in op.data && op.service !== 'add_item') {
      const item = Array.isArray(op.data.item) ? op.data.item.map(swap) : swap(op.data.item);
      return { ...op, data: { ...op.data, item } };
    }
    return op;
  });
}
