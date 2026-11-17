// Einziger Weg zu den Daten. Die Ansichten kennen weder Home Assistant noch die Bibliothek.
// Lesen: Live-Abos. Schreiben: Befehle (anlegen, ändern, erledigen, löschen) mit sofortiger Anzeige.
// Schlägt ein Befehl fehl, wird die Anzeige zurückgesetzt. Den echten Stand liefert immer das Abo.
import { decodeFeatures, addDoneStamp, removeDoneStamp } from './rules.js';
import { clearSnapshot } from './snapshot.js';
import { getHomeLayout } from './settings.js';
import { t } from './i18n.js';
import { loadQueue, saveQueue, clearQueue, overlay, enqueue, remap, isLocalUid, LOCAL_PREFIX } from './queue.js';

export class OfflineError extends Error {
  constructor() {
    super(t('error.offline'));
    this.name = 'OfflineError';
  }
}

export const isTemporaryUid = (uid) => String(uid).startsWith('tmp-');

export function errorText(err) {
  if (err instanceof OfflineError) return err.message;
  return err?.message || err?.code || String(err);
}

// Verbindung beim Senden abgerissen (Bibliothek meldet Code 3)
const isConnectionLost = (err) => err === 3 || err?.code === 3 || err?.error?.code === 3;

// Fälligkeit in den Auftrag: reines Datum als due_date, mit Uhrzeit als due_datetime (wenn die Liste das kann, sonst nur das Datum).
function putDue(data, due, list) {
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) {
    if (list?.features.dueDatetime) {
      data.due_datetime = due;
      return;
    }
    due = due.slice(0, 10);
  }
  data.due_date = due;
}

// Eigene Zuordnungen für Einkaufsartikel (Artikelname -> Bild bzw. Abteilung). Liegen in Home Assistant beim Benutzer,
// auf dem Gerät nur als Kopie für den Start ohne Netz. Geändert wird immer nur der eine Eintrag auf dem aktuellen Stand
// von Home Assistant, damit sich zwei Geräte nicht gegenseitig überschreiben. Ohne Verbindung gemerkte Änderungen
// (".pending": Name -> Wert, null = entfernen) gehen beim nächsten Verbinden genauso einzeln raus.
const USER_MAPS = {
  shopIcons: { remote: 'merker_shop_icons', local: 'merker.shopIcons' },
  shopSections: { remote: 'merker_shop_sections', local: 'merker.shopSections' },
};
const isMap = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
function readJson(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '{}');
    return isMap(value) ? value : {};
  } catch {
    return {};
  }
}
function writeJson(key, value) {
  try {
    if (isMap(value) && Object.keys(value).length === 0 && key.endsWith('.pending')) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ohne Speicher nur bis zum Neustart
  }
}
// Änderungen auf einen Stand anwenden
export function applyChanges(map, changes) {
  const next = { ...(isMap(map) ? map : {}) };
  for (const [key, value] of Object.entries(changes)) {
    if (value) next[key] = value;
    else delete next[key];
  }
  return next;
}

// Persönliche Daten auf dem Gerät, die beim Abmelden verschwinden (Aussehen und Sprache bleiben)
const PERSONAL_KEYS = ['merker.recents', 'merker.recentSearches', 'merker.lastTarget', ...Object.values(USER_MAPS).flatMap(({ local }) => [local, `${local}.pending`])];

function prettyName(entityId) {
  const raw = entityId.replace(/^todo\./, '').replace(/_/g, ' ');
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export class Repository {
  #itemSubscriptions = new Map(); // entityId -> Funktion zum Beenden des Abos
  #tempCounter = 0;
  #lastTodos = null;
  // Ohne Verbindung: Änderungen warten hier (im Gerät gespeichert) und gehen raus, sobald die Verbindung da ist.
  #queue = loadQueue().map((op) => ({ ...op, sending: false }));
  #server = {}; // entityId -> letzter Stand aus Home Assistant (ohne wartende Änderungen)
  #flushing = false;
  #serverAt = {}; // entityId -> Zeitpunkt des letzten Stands aus Home Assistant
  #onlineSince = 0;
  #todosFresh = false; // Listen-Stand stammt aus der laufenden Verbindung

  constructor(ha, store) {
    this.ha = ha;
    this.store = store;
    this.#publishQueue();
    this.store.set(Object.fromEntries(Object.entries(USER_MAPS).map(([name, { local }]) => [name, applyChanges(readJson(local), readJson(`${local}.pending`))])));
  }

  async start() {
    this.ha.onStatus((status) => {
      this.store.set({ status });
      if (status === 'online') {
        this.#onlineSince = Date.now();
        this.#todosFresh = false;
        setTimeout(() => this.#flush(), 300);
        this.#syncUserMaps();
      }
    });
    await this.ha.connect();
    this.ha.subscribeTodoEntities((todos) => {
      this.#todosFresh = true;
      this.#syncLists(todos);
    });
    setTimeout(() => this.#flush(), 300);
  }

  // Eigene Zuordnungen mit Home Assistant abgleichen: aktuellen Stand holen, eigene wartende Änderungen darauf anwenden.
  #userMapBusy = Promise.resolve();
  #syncUserMaps() {
    for (const name of Object.keys(USER_MAPS)) this.#queueUserMap(name);
  }

  // Abgleiche einer Zuordnung laufen nacheinander, nie gleichzeitig
  #queueUserMap(name) {
    this.#userMapBusy = this.#userMapBusy.then(() => this.#pushUserMap(name)).catch(() => {});
    return this.#userMapBusy;
  }

  async #pushUserMap(name) {
    const { remote, local } = USER_MAPS[name];
    if (this.offline) return;
    try {
      const value = await this.ha.getUserData(remote);
      const pending = readJson(`${local}.pending`);
      const merged = applyChanges(isMap(value) ? value : {}, pending);
      if (Object.keys(pending).length) {
        await this.ha.setUserData(remote, merged);
        // Nur die gesendeten Änderungen streichen. Was inzwischen dazukam, bleibt für den nächsten Abgleich.
        const now = readJson(`${local}.pending`);
        for (const [key, sent] of Object.entries(pending)) if (now[key] === sent) delete now[key];
        writeJson(`${local}.pending`, now);
      }
      writeJson(local, merged);
      this.store.set({ [name]: applyChanges(merged, readJson(`${local}.pending`)) });
    } catch (err) {
      console.warn('Eigene Zuordnungen nicht abgeglichen', name, err);
    }
  }

  // Einen Eintrag ändern: sofort anzeigen, als wartend merken, dann mit Home Assistant abgleichen
  #setUserMap(name, key, value) {
    const { local } = USER_MAPS[name];
    const pending = { ...readJson(`${local}.pending`), [key]: value ?? null };
    writeJson(`${local}.pending`, pending);
    this.store.set({ [name]: applyChanges(this.store.get()[name], { [key]: value ?? null }) });
    return this.#queueUserMap(name);
  }

  // Eigenes Bild bzw. eigene Abteilung für einen Artikelnamen (null = wieder automatisch)
  setShopIcon(key, emoji) {
    return this.#setUserMap('shopIcons', key, emoji);
  }

  setShopSection(key, section) {
    return this.#setUserMap('shopSections', key, section);
  }

  // Anzahl und betroffene Einträge der Warteschlange für die Anzeige
  #publishQueue(failed) {
    const uids = [];
    for (const op of this.#queue) {
      if (op.localUid) uids.push(op.localUid);
      else if (op.service === 'move') uids.push(op.data.uid);
      else if (op.data.item !== undefined && op.service !== 'add_item') uids.push(...[].concat(op.data.item));
    }
    const patch = { queued: this.#queue.length, queuedUids: uids };
    if (failed) patch.syncFailed = (this.store.get().syncFailed ?? 0) + failed;
    this.store.set(patch);
  }

  #saveQueue() {
    // known bleibt nur bei einem abgerissenen Anlegen gespeichert (für die Prüfung auf Doppelte beim nächsten Versuch)
    saveQueue(this.#queue.map(({ sending, known, ...op }) => (op.attempted ? { ...op, known } : op)));
    this.#publishQueue();
  }

  // Server-Stand einer Liste übernehmen und wartende Änderungen darüberlegen
  #showServer(entityId, items) {
    this.#server[entityId] = items;
    this.#serverAt[entityId] = Date.now();
    const shown = overlay(entityId, items, this.#queue);
    // Schickt HA genau das, was schon angezeigt wird (zum Beispiel die Antwort auf die eigene Änderung), nicht neu zeichnen.
    // Sonst würde eine Zeile ersetzt, die man gerade wischt.
    const state = this.store.get();
    if (state.loaded[entityId] && !state.fromCache && JSON.stringify(state.items[entityId]) === JSON.stringify(shown)) return;
    this.store.setItems(entityId, shown);
  }

  // Kann der Auftrag jetzt raus? "wait": Liste ist (noch) nicht verfügbar, zum Beispiel kurz nach einem Neustart von Home Assistant.
  // "gone": Liste gibt es nicht mehr. Ohne Listen-Stand von Home Assistant wird gewartet.
  #readiness(op) {
    if (!this.#lastTodos || !this.#todosFresh) return 'wait';
    const entity = this.#lastTodos.find((entry) => entry.entity_id === op.entityId);
    if (!entity) return 'gone';
    return entity.state === 'unavailable' || entity.state === 'unknown' ? 'wait' : 'ready';
  }

  // Wartende Änderungen der Reihe nach senden. Bricht die Verbindung ab, bleibt der Rest für später.
  // Aufträge für Listen, die gerade nicht verfügbar sind, bleiben stehen, bis die Liste wieder da ist.
  async #flush() {
    if (this.#flushing || this.store.get().status !== 'online' || this.#queue.length === 0) return;
    this.#flushing = true;
    let failed = 0;
    try {
      while (this.store.get().status === 'online') {
        const op = this.#queue.find((entry) => this.#readiness(entry) !== 'wait');
        if (!op) break;
        try {
          if (this.#readiness(op) === 'gone') {
            failed++; // Liste gelöscht: Auftrag verwerfen
          } else if (op.service === 'move') {
            // Neue, noch nicht bestätigte Aufgaben lassen sich nicht verschieben: Auftrag fällt weg
            if (!isLocalUid(op.data.uid) && !isLocalUid(op.data.previous_uid)) await this.ha.moveItem(op.entityId, op.data.uid, op.data.previous_uid ?? null);
          } else if (op.service !== 'add_item' && [].concat(op.data.item ?? []).some(isLocalUid)) {
            // bezieht sich auf eine neue Aufgabe, deren echte ID nicht ankam: weglassen
          } else if (op.service === 'add_item') {
            // Beim letzten Versuch riss die Verbindung ab: erst nachsehen, ob Home Assistant die Aufgabe doch angelegt hat
            let real = op.attempted ? await this.#findAttempted(op) : null;
            if (!real) {
              op.known = (this.#server[op.entityId] ?? []).map((item) => item.uid);
              op.sending = true;
              op.attempted = true;
              this.#saveQueue();
              await this.ha.todoAction('add_item', op.entityId, op.data);
              real = await this.#waitForNew(op);
            }
            op.sending = true;
            if (real) this.#queue = remap(this.#queue, op.localUid, real);
          } else {
            op.sending = true;
            await this.ha.todoAction(op.service, op.entityId, op.data);
          }
        } catch (err) {
          op.sending = false;
          if (isConnectionLost(err) || this.store.get().status !== 'online') break; // Verbindung weg: später weiter
          failed++; // Home Assistant lehnt ab (zum Beispiel Eintrag inzwischen gelöscht): Auftrag verwerfen
        }
        this.#queue = this.#queue.filter((entry) => entry !== op);
        this.#saveQueue();
        if (this.#server[op.entityId]) this.store.setItems(op.entityId, overlay(op.entityId, this.#server[op.entityId], this.#queue));
      }
    } finally {
      this.#flushing = false;
      if (failed) this.#publishQueue(failed);
    }
  }

  // Nach einem abgerissenen Anlegen: auf den frischen Stand der Liste warten und die Aufgabe darin suchen.
  // Liefert die echte ID, wenn sie schon da ist (dann wird nicht noch einmal gesendet).
  async #findAttempted(op) {
    for (let i = 0; i < 30 && (this.#serverAt[op.entityId] ?? 0) < this.#onlineSince; i++) await new Promise((resolve) => setTimeout(resolve, 100));
    const known = new Set(op.known ?? []);
    if (!op.known) return null;
    return (this.#server[op.entityId] ?? []).find((item) => !known.has(item.uid) && item.summary === op.data.item)?.uid ?? null;
  }

  // Wartet, bis die neue Aufgabe im Abo auftaucht, und liefert ihre echte ID
  async #waitForNew(op) {
    const known = new Set(op.known);
    for (let i = 0; i < 50; i++) {
      const found = (this.#server[op.entityId] ?? []).find((item) => !known.has(item.uid) && item.summary === op.data.item);
      if (found) return found.uid;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return null;
  }

  // Ohne Verbindung: Änderung einreihen und sofort anzeigen
  #queueOp(entityId, service, data, extra = {}) {
    this.#queue = enqueue(this.#queue, { id: `${Date.now()}-${++this.#tempCounter}`, entityId, service, data, ...extra });
    this.#saveQueue();
    const base = this.#server[entityId] ?? this.#items(entityId);
    this.store.setItems(entityId, overlay(entityId, base, this.#queue));
  }

  get offline() {
    return this.store.get().status !== 'online';
  }

  // Zeigt den gespeicherten Stand, bis Home Assistant antwortet.
  restore(snapshot) {
    const loaded = {};
    for (const id of Object.keys(snapshot.items)) loaded[id] = true;
    const disabled = getHomeLayout().disabled;
    const lists = snapshot.lists.filter((list) => !disabled.includes(list.id));
    const items = {};
    for (const [id, entries] of Object.entries(snapshot.items)) {
      this.#server[id] = entries;
      items[id] = overlay(id, entries, this.#queue);
    }
    this.store.set({ lists, allLists: snapshot.lists, items, loaded, syncedAt: snapshot.t, fromCache: true });
  }

  // --- Lesen ---------------------------------------------------------------------------------

  #syncLists(todos) {
    this.#lastTodos = todos;
    const all = todos
      .map((entity) => ({
        id: entity.entity_id,
        name: entity.attributes.friendly_name || prettyName(entity.entity_id),
        open: Number.parseInt(entity.state, 10) || 0,
        available: entity.state !== 'unavailable' && entity.state !== 'unknown',
        featureBits: entity.attributes.supported_features ?? 0,
        features: decodeFeatures(entity.attributes.supported_features),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
    // Deaktivierte Listen werden weder geladen noch angezeigt (Einstellungen bleiben die einzige Stelle, an der sie auftauchen).
    const disabled = new Set(getHomeLayout().disabled);
    const lists = all.filter((list) => !disabled.has(list.id));
    // Der erste Stand von Home Assistant ersetzt den gespeicherten. Gelöschte oder deaktivierte Listen verschwinden auch aus dem Zwischenspeicher.
    this.store.set({ lists, allLists: all, fromCache: false });
    for (const id of Object.keys(this.store.get().items)) {
      if (!lists.some((list) => list.id === id)) this.store.removeItems(id);
    }

    const ids = new Set(lists.map((list) => list.id));
    for (const list of lists) {
      if (!this.#itemSubscriptions.has(list.id)) this.#subscribeItems(list.id);
    }
    for (const id of [...this.#itemSubscriptions.keys()]) {
      if (!ids.has(id)) this.#unsubscribeItems(id);
    }
    // Wartende Änderungen für Listen, die jetzt wieder verfügbar sind
    if (this.#queue.length) setTimeout(() => this.#flush(), 300);
  }

  // Nach einer Änderung an den deaktivierten Listen: Listen und Abos neu aufbauen.
  applyLayout() {
    if (this.#lastTodos) this.#syncLists(this.#lastTodos);
    else this.store.set({ lists: this.store.get().allLists.filter((list) => !getHomeLayout().disabled.includes(list.id)) });
  }

  #subscribeItems(entityId) {
    // Platzhalter, damit die Liste nicht doppelt abonniert wird, solange die Antwort aussteht.
    this.#itemSubscriptions.set(entityId, () => {});
    this.ha
      .subscribeItems(entityId, (items) => this.#showServer(entityId, items))
      .then((unsubscribe) => {
        if (this.#itemSubscriptions.has(entityId)) this.#itemSubscriptions.set(entityId, unsubscribe);
        else unsubscribe();
      });
  }

  #unsubscribeItems(entityId) {
    const unsubscribe = this.#itemSubscriptions.get(entityId);
    this.#itemSubscriptions.delete(entityId);
    unsubscribe?.();
    this.store.removeItems(entityId);
  }

  // --- Schreiben -----------------------------------------------------------------------------

  #items(entityId) {
    return this.store.get().items[entityId] ?? [];
  }

  // Zeigt die Änderung sofort, sendet sie an HA und nimmt sie bei einem Fehler zurück.
  async #run(entityId, apply, service, data) {
    if (this.offline) {
      this.#queueOp(entityId, service, data);
      return;
    }
    const before = this.#items(entityId);
    this.store.setItems(entityId, apply(before));
    try {
      await this.ha.todoAction(service, entityId, data);
    } catch (err) {
      this.store.setItems(entityId, before);
      throw err;
    }
  }

  // fields: { summary, description?, due? } mit due als "JJJJ-MM-TT".
  async addItem(entityId, fields) {
    const data = { item: fields.summary };
    if (fields.description) data.description = fields.description;
    if (fields.due) putDue(data, fields.due, this.store.get().lists.find((entry) => entry.id === entityId));
    if (this.offline) {
      const localUid = `${LOCAL_PREFIX}${Date.now()}-${++this.#tempCounter}`;
      this.#queueOp(entityId, 'add_item', data, { localUid });
      return localUid;
    }
    const temp = {
      uid: `tmp-${++this.#tempCounter}`,
      summary: fields.summary,
      status: 'needs_action',
      due: fields.due ?? null,
      description: fields.description ?? null,
    };
    await this.#run(entityId, (items) => [...items, temp], 'add_item', data);
    return temp.uid;
  }

  // changes: { summary?, description?, due?, status? }. null löscht Beschreibung oder Datum.
  async updateItem(entityId, uid, changes) {
    const data = { item: uid };
    if ('summary' in changes) data.rename = changes.summary;
    if ('description' in changes) data.description = changes.description;
    if ('due' in changes) putDue(data, changes.due, this.store.get().lists.find((entry) => entry.id === entityId));
    if ('status' in changes) data.status = changes.status;
    const apply = (items) => items.map((item) => (item.uid === uid ? { ...item, ...changes } : item));
    await this.#run(entityId, apply, 'update_item', data);
  }

  // Erledigen setzt "✓ Datum" als letzte Zeile in die Beschreibung (wenn die Liste Beschreibungen kann), Wieder-Öffnen nimmt sie weg.
  setCompleted(entityId, uid, completed) {
    const changes = { status: completed ? 'completed' : 'needs_action' };
    const list = this.store.get().lists.find((entry) => entry.id === entityId);
    const item = this.#items(entityId).find((entry) => entry.uid === uid);
    if (list?.features.description && item) {
      const next = (completed ? addDoneStamp(item.description) : removeDoneStamp(item.description)) || null;
      if (next !== (item.description || null)) changes.description = next;
    }
    return this.updateItem(entityId, uid, changes);
  }

  // Neue lokale Liste. Die Liste erscheint danach von selbst über das Abo auf die To-do-Entitäten.
  async createList(name) {
    if (this.store.get().status !== 'online') throw new OfflineError();
    await this.ha.createLocalTodoList(name);
  }

  // Setzt den Eintrag in der Reihenfolge von Home Assistant hinter previousUid (null = an den Anfang).
  async moveItem(entityId, uid, previousUid) {
    const apply = (items) => {
      const moving = items.find((item) => item.uid === uid);
      if (!moving) return items;
      const rest = items.filter((item) => item.uid !== uid);
      const at = previousUid ? rest.findIndex((item) => item.uid === previousUid) + 1 : 0;
      return [...rest.slice(0, at), moving, ...rest.slice(at)];
    };
    if (this.offline) {
      this.#queueOp(entityId, 'move', { uid, previous_uid: previousUid });
      return;
    }
    const before = this.#items(entityId);
    this.store.setItems(entityId, apply(before));
    try {
      await this.ha.moveItem(entityId, uid, previousUid);
    } catch (err) {
      this.store.setItems(entityId, before);
      throw err;
    }
  }

  async removeItem(entityId, uid) {
    await this.#run(entityId, (items) => items.filter((item) => item.uid !== uid), 'remove_item', { item: uid });
  }

  // Der Eintrag direkt vor uid in der Reihenfolge von Home Assistant (null = uid steht ganz vorn).
  previousUid(entityId, uid) {
    const items = this.#items(entityId);
    const at = items.findIndex((item) => item.uid === uid);
    return at > 0 ? items[at - 1].uid : null;
  }

  // Legt einen gelöschten Eintrag neu an und stellt Platz und Erledigt-Status wieder her, soweit die Liste das erlaubt.
  // previousUid: Eintrag, hinter dem er stand (null = ganz vorn, undefined = Platz egal).
  async restoreItem(entityId, snapshot, { previousUid, completed = false } = {}) {
    const known = new Set(this.#items(entityId).map((item) => item.uid));
    await this.addItem(entityId, snapshot);
    const list = this.store.get().lists.find((entry) => entry.id === entityId);
    const wantsMove = previousUid !== undefined && list?.features.move;
    if (!completed && !wantsMove) return;
    const arrived = () => this.#items(entityId).find((item) => !known.has(item.uid) && !isTemporaryUid(item.uid) && item.summary === snapshot.summary);
    for (let i = 0; i < 40 && !arrived(); i++) await new Promise((resolve) => setTimeout(resolve, 100));
    const item = arrived();
    if (!item) return;
    if (wantsMove && (previousUid === null || this.#items(entityId).some((entry) => entry.uid === previousUid)) && this.previousUid(entityId, item.uid) !== previousUid) {
      try {
        await this.moveItem(entityId, item.uid, previousUid);
      } catch {
        // bleibt am Ende
      }
    }
    if (completed) {
      try {
        await this.setCompleted(entityId, item.uid, true);
      } catch {
        // bleibt offen
      }
    }
  }

  // Löscht alle erledigten Einträge der Liste mit einem Befehl. Gibt die gelöschten Einträge für "Rückgängig" zurück.
  async clearCompleted(entityId) {
    const removed = this.#items(entityId).filter((item) => item.status === 'completed' && !isTemporaryUid(item.uid));
    if (removed.length === 0) return [];
    await this.#run(entityId, (items) => items.filter((item) => !removed.includes(item)), 'remove_completed_items', {});
    return removed;
  }

  // Legt gelöschte erledigte Einträge neu an und setzt sie wieder auf erledigt, sobald sie bei uns angekommen sind.
  // Gibt zurück, wie viele wieder erledigt sind. Der Rest bleibt offen.
  async restoreCompleted(entityId, snapshots) {
    const known = new Set(this.#items(entityId).map((item) => item.uid));
    for (const snapshot of snapshots) await this.addItem(entityId, snapshot);
    const arrived = () => this.#items(entityId).filter((item) => !known.has(item.uid) && !isTemporaryUid(item.uid));
    for (let i = 0; i < 40 && arrived().length < snapshots.length; i++) await new Promise((resolve) => setTimeout(resolve, 100));
    const pool = arrived();
    let restored = 0;
    for (const snapshot of snapshots) {
      const at = pool.findIndex((item) => item.summary === snapshot.summary);
      if (at < 0) continue;
      const [item] = pool.splice(at, 1);
      try {
        await this.setCompleted(entityId, item.uid, true);
        restored++;
      } catch {
        // bleibt offen
      }
    }
    return restored;
  }

  // Abmelden: Anmeldung, gespeicherter Stand, wartende Änderungen und persönliche Verläufe weg. Aussehen und Sprache bleiben.
  logout() {
    clearSnapshot();
    this.#queue = [];
    clearQueue();
    for (const key of PERSONAL_KEYS) {
      try {
        localStorage.removeItem(key);
      } catch {
        // ignorieren
      }
    }
    return this.ha.logout();
  }
}
