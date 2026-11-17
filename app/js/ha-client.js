// Kapselt home-assistant-js-websocket: Anmeldung, Verbindung, Abos.
// Alle anderen Module sprechen nie direkt mit der Bibliothek.
import {
  getAuth,
  createConnection,
  subscribeEntities,
  callService,
  ERR_INVALID_AUTH,
} from './vendor/haws.js';
import { t } from './i18n.js';

const TOKEN_KEY = 'merker.tokens';

function loadTokens() {
  try {
    return JSON.parse(localStorage.getItem(TOKEN_KEY)) ?? undefined;
  } catch {
    return undefined;
  }
}

function saveTokens(tokens) {
  try {
    if (tokens) localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Speicher gesperrt: die Anmeldung gilt dann nur für diese Sitzung.
  }
}

// Nach dem Login hängt "?auth_callback=1&code=..." an der Adresse. Ein Neuladen mit dem alten Code schlägt fehl.
function cleanCallbackUrl() {
  const url = new URL(location.href);
  if (!url.searchParams.has('auth_callback')) return;
  for (const key of ['auth_callback', 'code', 'state']) url.searchParams.delete(key);
  history.replaceState(history.state, '', url.pathname + url.search + url.hash);
}

const ABORT_TEXT = {
  already_configured: t('error.listExists'),
  single_instance_allowed: t('error.singleInstance'),
};

export class HAClient {
  #statusListeners = new Set();
  #status = 'connecting';
  auth = null;
  conn = null;

  get status() {
    return this.#status;
  }

  onStatus(listener) {
    this.#statusListeners.add(listener);
    return () => this.#statusListeners.delete(listener);
  }

  #setStatus(status) {
    if (status === this.#status) return;
    this.#status = status;
    for (const listener of this.#statusListeners) listener(status);
  }

  async #authenticate() {
    // Die App liegt auf derselben Adresse wie Home Assistant, daher ist die Herkunft der Seite die HA-Adresse.
    const options = { hassUrl: location.origin, saveTokens, loadTokens };
    try {
      return await getAuth(options);
    } catch (err) {
      if (err !== ERR_INVALID_AUTH) throw err;
      cleanCallbackUrl();
      saveTokens(null);
      return getAuth(options);
    }
  }

  #forceRelogin() {
    saveTokens(null);
    location.reload();
  }

  async connect() {
    this.#setStatus('connecting');
    this.auth = await this.#authenticate();
    cleanCallbackUrl();

    try {
      this.conn = await createConnection({ auth: this.auth, setupRetry: -1 });
    } catch (err) {
      if (err === ERR_INVALID_AUTH) {
        this.#forceRelogin();
        return new Promise(() => {});
      }
      throw err;
    }

    this.conn.addEventListener('ready', () => this.#setStatus('online'));
    this.conn.addEventListener('disconnected', () => this.#setStatus('offline'));
    this.conn.addEventListener('reconnect-error', (_conn, err) => {
      if (err === ERR_INVALID_AUTH) this.#forceRelogin();
    });
    this.#setStatus('online');
  }

  // Meldet nur dann, wenn sich Name, Anzahl oder Fähigkeiten einer To-do-Liste ändern.
  subscribeTodoEntities(callback) {
    let lastSignature = '';
    // Nach jedem neuen Verbindungsaufbau den Stand einmal melden, auch wenn er gleich geblieben ist
    this.conn.addEventListener('ready', () => {
      lastSignature = '';
    });
    return subscribeEntities(this.conn, (entities) => {
      const todos = Object.keys(entities)
        .filter((id) => id.startsWith('todo.'))
        .map((id) => entities[id]);
      const signature = JSON.stringify(
        todos.map((e) => [e.entity_id, e.state, e.attributes.friendly_name, e.attributes.supported_features]),
      );
      if (signature === lastSignature) return;
      lastSignature = signature;
      callback(todos);
    });
  }

  // Live-Abo auf die Einträge einer Liste. Liefert eine Funktion zum Beenden des Abos.
  async subscribeItems(entityId, callback) {
    try {
      return await this.conn.subscribeMessage((event) => callback(event.items ?? []), {
        type: 'todo/item/subscribe',
        entity_id: entityId,
      });
    } catch (err) {
      console.warn('Abo auf', entityId, 'nicht möglich', err);
      return () => {};
    }
  }

  // Aktion des To-do-Dienstes (add_item, update_item, remove_item) für eine Liste.
  todoAction(service, entityId, data) {
    return callService(this.conn, 'todo', service, data, { entity_id: entityId });
  }

  // REST-Aufruf mit Anmelde-Token (Bibliothek bietet das nicht selbst an).
  async #rest(path, body) {
    if (this.auth.expired) await this.auth.refreshAccessToken();
    const response = await fetch(`${this.auth.data.hassUrl}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.auth.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    let json = null;
    try {
      json = await response.json();
    } catch {
      // Antwort ohne JSON
    }
    if (!response.ok) {
      const error = new Error(response.status === 401 || response.status === 403 ? t('error.adminRequired') : (json?.message ?? t('error.httpStatus', { status: response.status })));
      error.status = response.status;
      throw error;
    }
    return json;
  }

  // Legt eine lokale To-do-Liste an (Einrichtungsablauf der Integration "Local To-do", wie in den Geräte-Einstellungen).
  async createLocalTodoList(name) {
    const start = await this.#rest('/api/config/config_entries/flow', { handler: 'local_todo', show_advanced_options: false });
    if (start.type === 'abort') throw new Error(ABORT_TEXT[start.reason] ?? t('error.aborted', { reason: start.reason }));
    if (start.type !== 'form') throw new Error(t('error.unexpected'));
    const field = (start.data_schema ?? []).find((entry) => entry.required && entry.type === 'string')?.name ?? 'todo_list_name';
    const done = await this.#rest(`/api/config/config_entries/flow/${start.flow_id}`, { [field]: name });
    if (done.type === 'abort') throw new Error(ABORT_TEXT[done.reason] ?? t('error.aborted', { reason: done.reason }));
    if (done.type !== 'create_entry') throw new Error(Object.values(done.errors ?? {})[0] ?? t('error.listNotCreated'));
    return done;
  }

  // Verschiebt einen Eintrag hinter previousUid (null = an den Anfang).
  moveItem(entityId, uid, previousUid) {
    const message = { type: 'todo/item/move', entity_id: entityId, uid };
    if (previousUid) message.previous_uid = previousUid;
    return this.conn.sendMessagePromise(message);
  }

  // Eigene Daten des HA-Benutzers (liegen in Home Assistant, gelten auf allen Geräten dieses Benutzers)
  async getUserData(key) {
    const result = await this.conn.sendMessagePromise({ type: 'frontend/get_user_data', key });
    return result?.value ?? null;
  }

  setUserData(key, value) {
    return this.conn.sendMessagePromise({ type: 'frontend/set_user_data', key, value });
  }

  async logout() {
    try {
      await this.auth?.revoke();
    } catch {
      // Auch ohne Netz soll das lokale Abmelden klappen.
    }
    saveTokens(null);
  }
}
