// Start der App: verdrahtet Store, Repository, Router und Ansichten.
import { HAClient } from './ha-client.js';
import { Store } from './store.js';
import { Repository } from './repository.js';
import { Router, parentPath, listPath } from './router.js';
import { touchRecentList } from './settings.js';
import { ItemSheet } from './sheet.js';
import { createToast } from './toast.js';
import { h, icon } from './ui.js';
import { renderLists } from './views/lists.js';
import { renderList } from './views/list.js';
import { renderSettings, renderListSettings, renderSettingsPage, settingsPageTitle } from './views/settings.js';
import { renderWeek, resetWeek, weekTitle } from './views/week.js';
import { SearchBar, renderSearch } from './views/search.js';
import { openNewTask } from './newtask.js';
import { applyAccent } from './accent.js';
import { parseLaunch } from './launch.js';
import { listAsText, shareOrCopy } from './share.js';
import { loadSnapshot, saveSnapshot, formatStamp } from './snapshot.js';
import { APP_VERSION } from './version.js';
import { t, translateStatic } from './i18n.js';
import { applyTheme } from './theme.js';
import { applyCompact, getAppName } from './settings.js';
import { watchForUpdates } from './update.js';
import { isShoppingList } from './settings.js';
import { ShoppingBar, renderShopping, addShoppingItem, keepAwake } from './views/shopping.js';

applyTheme();
applyCompact();
translateStatic();

// Start über "Teilen an Merker" oder den Kurzbefehl: Parameter lesen, aus der Adresse entfernen, später den Dialog öffnen.
const launch = parseLaunch(location.search);
if (launch) {
  const rest = new URLSearchParams(location.search);
  for (const key of ['neu', 'einkauf', 'title', 'text', 'url']) rest.delete(key);
  const query = rest.toString();
  history.replaceState(history.state, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
}
const store = new Store();
const ha = new HAClient();
const repo = new Repository(ha, store);
const router = new Router(() => render());

const $ = (selector) => document.querySelector(selector);
const content = $('#content');
const banner = $('#banner');
const backButton = $('#btn-back');
const settingsButton = $('#btn-settings');
const searchButton = $('#btn-search');
const weekButton = $('#btn-week');
const sortButton = $('#btn-sort');
const shareButton = $('#btn-share');
const viewButton = $('#btn-view');
const fab = $('#fab');
let currentListId = null;
fab.append(icon('plus', 28));
fab.addEventListener('click', () => {
  openNewTask({ state: store.get(), store, repo, toast, listId: currentListId });
});
searchButton.append(icon('search', 24));
weekButton.append(icon('calendar', 24));
sortButton.append(icon('sort', 24));
shareButton.append(icon('share', 24));
const title = $('#view-title');
const topSlot = $('#top-slot');
const bottomSlot = $('#bottom-slot');

const toast = createToast($('#snackbar'));

const sheet = new ItemSheet({ router, repo, toast, store });
const searchBar = new SearchBar({ topSlot, onInput: () => render() });
// Einkaufsliste: Kacheln. Pro Liste lässt sich für diese Sitzung auf die normale Listenansicht umschalten.
const classicView = new Set();
let shopList = null;
const shopAdd = async (text) => {
  if (!shopList) return;
  if (await addShoppingItem({ store, repo, toast }, shopList, text)) shoppingBar.clear();
};
const shoppingBar = new ShoppingBar({ topSlot, onInput: () => render(), onSubmit: shopAdd });

// Höhe der unteren Leiste, damit die Snackbar darüber sitzt.
new ResizeObserver(() => document.documentElement.style.setProperty('--bottom-ui', `${bottomSlot.offsetHeight}px`)).observe(bottomSlot);

const scrollPositions = new Map();
const doneOpen = { value: false };
const sortMode = { value: false };
const dueExpanded = { value: false };
let lastBase = null; // zuletzt gezeigte Ansicht, die kein Bearbeiten-Dialog ist
let lastKey = null;
let lastListId = null;

function titleFor(route, state) {
  if (route.name === 'list') return state.lists.find((list) => list.id === route.id)?.name ?? t('title.list');
  if (route.name === 'settings') return t('title.settings');
  if (route.name === 'settingsPage') return settingsPageTitle(route.page);
  if (route.name === 'listSettings') return (state.allLists ?? state.lists).find((list) => list.id === route.id)?.name ?? t('title.list');
  if (route.name === 'search') return t('title.search');
  if (route.name === 'week') return weekTitle();
  return getAppName();
}

function bannerFor(state) {
  const stand = state.syncedAt && state.lists.length ? ` ${t('banner.stand', { time: formatStamp(state.syncedAt) })}` : '';
  if (state.error) return { text: state.error, error: true };
  if (state.status === 'connecting') return { text: `${t('banner.connecting')}${state.queued ? ` ${t('banner.queued', { n: state.queued })}` : ''}${stand}` };
  const waiting = state.queued ? ` ${t('banner.queued', { n: state.queued })}` : '';
  if (state.status === 'offline') return { text: `${t('banner.offline')}${waiting}${stand}` };
  if (state.queued) return { text: t('banner.sending', { n: state.queued }) };
  return null;
}

function render() {
  try {
    renderNow();
  } catch (err) {
    console.error(err);
    window.__merkerFatal?.(t('error.render', { error: err?.message ?? err }));
  }
}

function renderNow() {
  if (content.querySelector('.lifting')) return; // während des Ziehens nichts neu zeichnen
  const route = router.current;
  const state = store.get();
  // Der Bearbeiten-Dialog liegt über der Liste, darunter bleibt die Liste sichtbar.
  // Kam man von der Startseite oder der Suche, bleibt diese darunter sichtbar.
  const keepBase = route.name === 'item' && (lastBase?.name === 'lists' || lastBase?.name === 'search');
  const view = route.name !== 'item' ? route : keepBase ? lastBase : { ...route, name: 'list', path: listPath(route.id) };
  lastBase = view;

  if (lastKey !== null && lastKey !== view.path) scrollPositions.set(lastKey, content.scrollTop);
  const sameView = lastKey === view.path;
  lastKey = view.path;
  if (view.name !== 'list' || lastListId !== view.id) {
    doneOpen.value = false;
    sortMode.value = false;
  }
  lastListId = view.name === 'list' ? view.id : null;

  title.onclick = null;
  title.classList.remove('is-tappable');
  title.removeAttribute('role');
  title.removeAttribute('aria-label');
  title.textContent = titleFor(view, state);
  document.title = view.name === 'lists' ? getAppName() : `${title.textContent} · ${getAppName()}`;
  backButton.hidden = parentPath(route) === null;
  settingsButton.hidden = view.name !== 'lists';
  searchButton.hidden = view.name !== 'lists';
  weekButton.hidden = view.name !== 'lists';
  if (view.name === 'lists') resetWeek();
  const viewList = view.name === 'list' ? state.lists.find((list) => list.id === view.id) : null;
  const shopping = Boolean(viewList && isShoppingList(viewList.id) && !classicView.has(viewList.id));
  shopList = shopping ? viewList : null;
  viewButton.hidden = !(viewList && isShoppingList(viewList.id));
  viewButton.replaceChildren(icon(shopping ? 'lists' : 'grid', 24));
  viewButton.setAttribute('aria-label', shopping ? t('header.listView') : t('header.tileView'));
  sortButton.hidden = !viewList?.features.move || shopping;
  shareButton.hidden = !viewList;
  sortButton.classList.toggle('active', sortMode.value && !sortButton.hidden);
  sortButton.setAttribute('aria-pressed', String(sortMode.value));
  currentListId = view.name === 'list' ? view.id : null;
  fab.hidden = !['lists', 'list'].includes(view.name) || !store.get().lists.some((list) => list.available && list.features.create);
  if (!shopping) shoppingBar.unmount();
  if (view.name === 'search') searchBar.mount();
  else searchBar.unmount();
  if (shopping) shoppingBar.mount(viewList.id);
  keepAwake(shopping);

  const info = bannerFor(state);
  banner.hidden = !info;
  banner.className = info?.error ? 'banner banner-error' : 'banner';
  banner.replaceChildren(
    ...(info
      ? [info.text, ...(info.error ? [h('button', { class: 'btn-inline', type: 'button', onclick: () => location.reload() }, t('banner.retry'))] : [])]
      : []),
  );

  const previousScroll = sameView ? content.scrollTop : (scrollPositions.get(view.path) ?? 0);
  content.replaceChildren();
  const ctx = { rerender: render, state, store, route: view, router, repo, toast, doneOpen, sortMode, dueExpanded, scroller: content, shopAdd };
  if (view.name === 'list') {
    touchRecentList(view.id);
    if (shopping) renderShopping(content, ctx, viewList, shoppingBar.query);
    else renderList(content, ctx);
  } else if (view.name === 'week') {
    renderWeek(content, ctx);
  } else if (view.name === 'search') {
    renderSearch(content, ctx, searchBar.query);
  } else if (view.name === 'settings') {
    renderSettings(content, ctx);
  } else if (view.name === 'settingsPage') {
    renderSettingsPage(content, ctx);
  } else if (view.name === 'listSettings') {
    renderListSettings(content, ctx);
  } else {
    renderLists(content, ctx);
  }
  content.scrollTop = previousScroll;

  sheet.sync(route, state);
}

// Auf der Startseite oben nach unten ziehen öffnet die Suche.
const pullHint = $('#pull-hint');
const PULL_LIMIT = 90;
const PULL_TRIGGER = 40;
let pullStart = null;
let pullDistance = 0;
const setPull = (distance) => {
  pullDistance = distance;
  pullHint.style.height = `${distance}px`;
  pullHint.style.opacity = String(Math.min(1, distance / PULL_TRIGGER));
  pullHint.classList.toggle('ready', distance >= PULL_TRIGGER);
};
content.addEventListener(
  'touchstart',
  (event) => {
    const canPull = router.current.name === 'lists' && content.scrollTop <= 0 && event.touches.length === 1;
    pullStart = canPull ? event.touches[0].clientY : null;
  },
  { passive: true },
);
content.addEventListener(
  'touchmove',
  (event) => {
    if (pullStart === null) return;
    const dy = event.touches[0].clientY - pullStart;
    if (dy <= 0 || content.scrollTop > 0) return setPull(0);
    // Ganz oben gehört die Geste der App, der Browser soll nicht selbst überscrollen oder neu laden.
    if (event.cancelable) event.preventDefault();
    setPull(Math.min(PULL_LIMIT, dy * 0.6));
  },
  { passive: false },
);
const endPull = () => {
  const triggered = pullDistance >= PULL_TRIGGER;
  pullStart = null;
  setPull(0);
  if (triggered) router.go('/suche');
};
content.addEventListener('touchend', endPull, { passive: true });
content.addEventListener('touchcancel', endPull, { passive: true });

// Tastatur am PC: / öffnet die Suche, n eine neue Aufgabe (nur auf der Startseite und nicht beim Tippen).
document.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '') || document.querySelector('.sheet-root')) return;
  if (router.current.name !== 'lists') return;
  if (event.key === '/') {
    event.preventDefault();
    router.go('/suche');
  } else if (event.key === 'n' && !fab.hidden) {
    event.preventDefault();
    fab.click();
  }
});

backButton.addEventListener('click', () => router.up());
settingsButton.addEventListener('click', () => router.go('/einstellungen'));
searchButton.addEventListener('click', () => router.go('/suche'));
weekButton.addEventListener('click', () => router.go('/woche'));
// Liste teilen: offene Einträge als Text über das Android-Teilen-Menü, sonst in die Zwischenablage.
shareButton.addEventListener('click', async () => {
  const route = router.current;
  const list = store.get().lists.find((entry) => entry.id === route.id);
  if (!list) return;
  const text = listAsText(list, store.get().items[list.id] ?? []);
  if (!text) return toast.show(t('share.nothingOpen'));
  await shareOrCopy({ title: list.name, text, toast, copiedText: t('share.listCopied') });
});
viewButton.addEventListener('click', () => {
  const id = router.current.id;
  if (classicView.has(id)) classicView.delete(id);
  else classicView.add(id);
  render();
});
sortButton.addEventListener('click', () => {
  sortMode.value = !sortMode.value;
  render();
});
store.subscribe(render);
// Wartende Änderungen, die Home Assistant beim Senden abgelehnt hat (zum Beispiel Eintrag inzwischen gelöscht)
let lastFailed = 0;
store.subscribe((state) => {
  const failed = state.syncFailed ?? 0;
  if (failed > lastFailed) toast.show(t('toast.syncFailed', { n: failed - lastFailed }), { error: true });
  lastFailed = failed;
});
router.start();

if (launch) {
  const openLaunch = () => {
    if (store.get().lists.length === 0) return false;
    // Kurzbefehl "Einkaufsliste": erste als Einkaufsliste markierte Liste öffnen (ohne Markierung bleibt die Startseite)
    if (launch.shop) {
      const target = store.get().lists.find((list) => isShoppingList(list.id));
      if (target) router.go(listPath(target.id));
      return true;
    }
    openNewTask({ state: store.get(), store, repo, toast, initial: launch.initial });
    return true;
  };
  if (!openLaunch()) {
    const stop = store.subscribe(() => {
      if (openLaunch()) stop();
    });
  }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('sw.js', { updateViaCache: 'none' })
    .then(watchForUpdates)
    .catch((err) => console.warn('Service Worker nicht aktiv', err));
}

window.__merkerVersion = APP_VERSION;
window.__merkerReady = true;
window.dispatchEvent(new Event('merker-ready'));

// Gespeicherten Stand sofort zeigen, damit die App auch ohne Verbindung etwas anzeigt.
const snapshot = loadSnapshot();
if (snapshot) {
  repo.restore(snapshot);
  render();
}

// Live-Stand merken, sobald alle Listen geladen sind. Mit Verzögerung, damit Serien von Änderungen nur einmal speichern.
let saveTimer = null;
let lastSaved = null;
const persist = () => {
  clearTimeout(saveTimer);
  saveTimer = null;
  lastSaved = saveSnapshot(store.get()) ?? lastSaved;
};
store.subscribe((state) => {
  if (state.status !== 'online') {
    if (lastSaved && state.syncedAt !== lastSaved) store.set({ syncedAt: lastSaved });
    return;
  }
  if (state.fromCache || saveTimer) return;
  saveTimer = setTimeout(persist, 800);
});
window.addEventListener('pagehide', () => {
  if (saveTimer) persist();
});

// Schlägt schon die Anmeldung fehl (zum Beispiel Token abgelaufen und kein Netz), mit gespeichertem Stand weiter versuchen.
function startRepo() {
  repo.start().catch((err) => {
    console.error(err);
    if (store.get().fromCache) {
      store.set({ status: 'offline' });
      setTimeout(startRepo, 10000);
      return;
    }
    const detail = typeof err === 'number' ? t('error.code', { code: err }) : (err?.message ?? String(err));
    store.set({ error: t('error.connection', { detail }) });
  });
}
startRepo();
