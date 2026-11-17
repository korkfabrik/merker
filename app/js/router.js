// Ansichten über die Adresse (#/, #/liste/<entity>, #/liste/<entity>/<uid>, #/einstellungen).
// Mit pushState entsteht je Ansicht ein Verlauf-Eintrag, damit die Android-Zurück-Geste eine Ebene höher führt.

export const listPath = (entityId) => `/liste/${encodeURIComponent(entityId)}`;
export const listSettingsPath = (entityId) => `/einstellungen/${encodeURIComponent(entityId)}`;
export const itemPath = (entityId, uid) => `${listPath(entityId)}/${encodeURIComponent(uid)}`;

export function parseRoute(hash) {
  const path = (hash || '').replace(/^#/, '') || '/';
  let parts;
  try {
    parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    parts = []; // kaputte Adresse (zum Beispiel "%E0"): Startseite statt Absturz
  }
  if (parts[0] === 'liste' && parts[1] && parts[2]) {
    return { name: 'item', id: parts[1], uid: parts[2], path: itemPath(parts[1], parts[2]) };
  }
  if (parts[0] === 'liste' && parts[1]) return { name: 'list', id: parts[1], uid: null, path: listPath(parts[1]) };
  if (parts[0] === 'suche') return { name: 'search', id: null, uid: null, path: '/suche' };
  if (parts[0] === 'woche') return { name: 'week', id: null, uid: null, path: '/woche' };
  // Unterseiten der Einstellungen haben kurze Namen, Listen-IDs enthalten immer einen Punkt (todo.…)
  if (parts[0] === 'einstellungen' && parts[1] && !parts[1].includes('.')) return { name: 'settingsPage', page: parts[1], id: null, uid: null, path: `/einstellungen/${parts[1]}` };
  if (parts[0] === 'einstellungen' && parts[1]) return { name: 'listSettings', id: parts[1], uid: null, path: `/einstellungen/${encodeURIComponent(parts[1])}` };
  if (parts[0] === 'einstellungen') return { name: 'settings', id: null, uid: null, path: '/einstellungen' };
  return { name: 'lists', id: null, uid: null, path: '/' };
}

export function parentPath(route) {
  if (route.name === 'lists') return null;
  if (route.name === 'item') return listPath(route.id);
  if (route.name === 'listSettings') return '/einstellungen/listen';
  if (route.name === 'settingsPage') return '/einstellungen';
  return '/';
}

export class Router {
  #onChange;
  current = parseRoute(location.hash);

  constructor(onChange) {
    this.#onChange = onChange;
  }

  start() {
    if (history.state?.n === undefined) history.replaceState({ n: 0 }, '', location.href);
    const refresh = () => {
      this.current = parseRoute(location.hash);
      this.#onChange(this.current);
    };
    window.addEventListener('popstate', refresh);
    window.addEventListener('hashchange', refresh);
    refresh();
  }

  go(path) {
    const depth = (history.state?.n ?? 0) + 1;
    history.pushState({ n: depth }, '', `#${path}`);
    this.current = parseRoute(location.hash);
    this.#onChange(this.current);
  }

  // Eine Ebene höher: zurück im Verlauf, falls die App selbst hierher geführt hat, sonst direkt zur Elternansicht.
  up() {
    const parent = parentPath(this.current);
    if (parent === null) return;
    if ((history.state?.n ?? 0) > 0) {
      history.back();
    } else {
      history.replaceState({ n: 0 }, '', `#${parent}`);
      this.current = parseRoute(location.hash);
      this.#onChange(this.current);
    }
  }
}
