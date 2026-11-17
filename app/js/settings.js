// Einstellungen auf dem Gerät (localStorage). Greift der Speicher nicht, läuft die App ohne Merken weiter.
const RECENTS_KEY = 'merker.recents';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignorieren
  }
}

// Farbe je Liste: Farbton (0 bis 360). Ohne eigene Wahl ergibt sich ein fester Wert aus der Listen-ID.
export const LIST_HUES = [215, 160, 25, 345, 280, 45, 190, 100];
const COLORS_KEY = 'merker.listHues';

export function getListHue(entityId) {
  const saved = read(COLORS_KEY, {});
  if (saved && Number.isFinite(saved[entityId])) return saved[entityId];
  let hash = 0;
  for (const char of entityId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return LIST_HUES[hash % LIST_HUES.length];
}

export function setListHue(entityId, hue) {
  const saved = read(COLORS_KEY, {});
  write(COLORS_KEY, { ...(saved && typeof saved === 'object' ? saved : {}), [entityId]: hue });
}

export const hueStyle = (entityId) => `--lh:${getListHue(entityId)}`;

export function getRecentLists() {
  const value = read(RECENTS_KEY, []);
  return Array.isArray(value) ? value : [];
}

export function touchRecentList(entityId) {
  const recents = [entityId, ...getRecentLists().filter((id) => id !== entityId)].slice(0, 4);
  write(RECENTS_KEY, recents);
}

// Sortierung je Liste: 'standard' | 'ha' | 'alpha' | 'groups' (Abschnitte nach Fälligkeit)
const SORT_KEY = 'merker.listSort';
export function getListSort(entityId) {
  const saved = read(SORT_KEY, {});
  const mode = saved && saved[entityId];
  return mode === 'ha' || mode === 'alpha' || mode === 'groups' ? mode : 'standard';
}

export function setListSort(entityId, mode) {
  const saved = read(SORT_KEY, {});
  write(SORT_KEY, { ...(saved && typeof saved === 'object' ? saved : {}), [entityId]: mode });
}

// Zuletzt gewählte Liste im Dialog "Neue Aufgabe"
const TARGET_KEY = 'merker.lastTarget';
export const getLastTarget = () => read(TARGET_KEY, null);
export const setLastTarget = (entityId) => write(TARGET_KEY, entityId);

// Startseite: Reihenfolge, angeheftete, ausgeblendete und deaktivierte Listen (nur auf diesem Gerät).
// Deaktivierte Listen werden gar nicht geladen: keine Kachel, keine Suche, keine Fälligkeiten.
const LAYOUT_KEY = 'merker.homeLayout';

export function getHomeLayout() {
  const saved = read(LAYOUT_KEY, {});
  const list = (value) => (Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : []);
  return { order: list(saved?.order), pinned: list(saved?.pinned), hidden: list(saved?.hidden), disabled: list(saved?.disabled) };
}

export function setHomeLayout(layout) {
  write(LAYOUT_KEY, layout);
}

// Angeheftete zuerst, danach nach gespeicherter Reihenfolge, neue Listen hinten in der bisherigen Reihenfolge.
export function orderLists(lists, layout = getHomeLayout()) {
  const rank = (list) => {
    const at = layout.order.indexOf(list.id);
    return at < 0 ? Number.MAX_SAFE_INTEGER : at;
  };
  return lists
    .map((list, index) => ({ list, index }))
    .sort((a, b) => {
      const pin = Number(layout.pinned.includes(b.list.id)) - Number(layout.pinned.includes(a.list.id));
      return pin || rank(a.list) - rank(b.list) || a.index - b.index;
    })
    .map((entry) => entry.list);
}

// Als Einkaufsliste markierte Listen (nur auf diesem Gerät): Kacheln statt Zeilen, 🛒 in der Übersicht
const SHOPPING_KEY = 'merker.shoppingLists';
function shoppingIds() {
  const value = read(SHOPPING_KEY, []);
  return Array.isArray(value) ? value.filter((id) => typeof id === 'string') : [];
}
export const isShoppingList = (entityId) => shoppingIds().includes(entityId);
export function setShoppingList(entityId, on) {
  const rest = shoppingIds().filter((id) => id !== entityId);
  write(SHOPPING_KEY, on ? [...rest, entityId] : rest);
}

// Kacheln pro Reihe in der Einkaufsansicht (3 oder 4)
const SHOP_COLUMNS_KEY = 'merker.shopColumns';
export const getShopColumns = () => (read(SHOP_COLUMNS_KEY, 3) === 4 ? 4 : 3);
export const setShopColumns = (value) => write(SHOP_COLUMNS_KEY, value === 4 ? 4 : 3);

// Erledigte Unteraufgaben automatisch ans Ende der Checkliste setzen
const SUB_DONE_LAST_KEY = 'merker.subDoneLast';
export const getSubDoneLast = () => read(SUB_DONE_LAST_KEY, false) === true;
export const setSubDoneLast = (value) => write(SUB_DONE_LAST_KEY, Boolean(value));

// Wischen nach links: 'move' (in andere Liste), 'delete' (löschen) oder 'date' (neues Datum)
const SWIPE_LEFT_KEY = 'merker.swipeLeft';
export const SWIPE_LEFT = ['move', 'delete', 'date'];
export function getSwipeLeft() {
  const value = read(SWIPE_LEFT_KEY, 'move');
  return SWIPE_LEFT.includes(value) ? value : 'move';
}
export const setSwipeLeft = (value) => write(SWIPE_LEFT_KEY, value);

// Ganz weit nach links wischen löscht (zusätzlich zur eingestellten Aktion nach links)
const SWIPE_FAR_KEY = 'merker.swipeFarDelete';
export const getSwipeFarDelete = () => read(SWIPE_FAR_KEY, true) !== false;
export const setSwipeFarDelete = (value) => write(SWIPE_FAR_KEY, Boolean(value));

// Kompakte Ansicht (engere Zeilen). boot.js setzt data-density schon beim Start.
const COMPACT_KEY = 'merker.compact';
export const getCompact = () => read(COMPACT_KEY, false) === true;
export function setCompact(value) {
  write(COMPACT_KEY, Boolean(value));
  applyCompact(Boolean(value));
}
export function applyCompact(value = getCompact()) {
  if (value) document.documentElement.dataset.density = 'compact';
  else delete document.documentElement.dataset.density;
}

// Letzte Suchbegriffe (höchstens 5, neueste zuerst)
const RECENT_SEARCH_KEY = 'merker.recentSearches';
export function getRecentSearches() {
  const value = read(RECENT_SEARCH_KEY, []);
  return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : [];
}
export function addRecentSearch(query) {
  const text = String(query ?? '').trim();
  if (text.length < 2) return;
  const lower = text.toLowerCase();
  write(RECENT_SEARCH_KEY, [text, ...getRecentSearches().filter((entry) => entry.toLowerCase() !== lower)].slice(0, 5));
}
export function removeRecentSearch(query) {
  write(RECENT_SEARCH_KEY, getRecentSearches().filter((entry) => entry !== query));
}

// Name der App (oben auf der Startseite und im Fenstertitel). Leer = Standardname.
export const DEFAULT_APP_NAME = 'Merker';
const APP_NAME_KEY = 'merker.appName';
export function getAppName() {
  const value = read(APP_NAME_KEY, '');
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 30) : DEFAULT_APP_NAME;
}
export const setAppName = (value) => write(APP_NAME_KEY, String(value ?? '').trim().slice(0, 30));
