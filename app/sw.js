// Service Worker: liefert die App-Dateien aus dem Cache, damit Merker auch ohne Netz startet.
// Aktualisierung: Jede Version hat einen eigenen Cache, der bei der Installation komplett und am HTTP-Cache vorbei gefüllt wird.
// CACHE_VERSION bei jeder Änderung an den App-Dateien erhöhen und mit js/version.js gleich halten.
const CACHE_VERSION = '1.1.6';
const CACHE_NAME = `merker-${CACHE_VERSION}`;

const ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './icon-shop-192.png',
  './css/app.css',
  './js/main.js',
  './js/boot.js',
  './js/version.js',
  './js/rules.js',
  './js/ha-client.js',
  './js/store.js',
  './js/repository.js',
  './js/router.js',
  './js/settings.js',
  './js/ui.js',
  './js/actions.js',
  './js/sheet.js',
  './js/accent.js',
  './js/launch.js',
  './js/quickdates.js',
  './js/links.js',
  './js/share.js',
  './js/i18n.js',
  './js/multiline.js',
  './js/theme.js',
  './js/recurfield.js',
  './js/queue.js',
  './js/views/week.js',
  './js/update.js',
  './js/shopicons.js',
  './js/views/shopping.js',
  './locales/de.json',
  './locales/en.json',
  './js/snapshot.js',
  './js/swipe.js',
  './js/toast.js',
  './js/reorder.js',
  './js/picker.js',
  './js/newtask.js',
  './js/newlist.js',
  './js/views/lists.js',
  './js/views/list.js',
  './js/views/settings.js',
  './js/views/search.js',
  './js/vendor/haws.js',
];

self.addEventListener('install', (event) => {
  // Kein skipWaiting: Eine neue Version wartet, bis man in der App auf "Neu laden" tippt (js/update.js).
  // cache: 'reload' umgeht den HTTP-Cache. Home Assistant liefert /local mit langer Cache-Dauer aus,
  // sonst landen beim Update die alten Dateien unter der neuen Versionsnummer im Cache.
  // Alles oder nichts: Lässt sich eine Datei nicht laden, schlägt die Installation fehl. Der Browser verwirft die neue Version,
  // die alte läuft weiter, und beim nächsten Prüfen wird es erneut versucht. So startet nie eine Version mit fehlender Datei.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        ASSETS.map((asset) =>
          cache.add(new Request(asset, { cache: 'reload' })).catch((err) => {
            console.warn('Nicht geladen, Update wird später erneut versucht:', asset, err);
            throw err;
          }),
        ),
      ).catch(async (err) => {
        await caches.delete(CACHE_NAME); // halben Stand nicht liegen lassen
        throw err;
      }),
    ),
  );
});

// Nachrichten der App: "Neu laden" aktiviert die wartende Version, "version" fragt ihre Nummer ab.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'skipWaiting') self.skipWaiting();
  if (event.data?.type === 'version') event.ports[0]?.postMessage({ version: CACHE_VERSION });
});

// Nur eigene alte Caches löschen. Unter derselben Adresse liegen auch die Caches des HA-Frontends und anderer Apps.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('merker-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Nur eigene Dateien. Anmeldung (/auth) und API (/api) gehen immer direkt zu Home Assistant.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/auth/') || url.pathname.startsWith('/api/')) return;

  // Seitenaufrufe (auch mit ?auth_callback=...) bekommen immer die gecachte index.html.
  const isStart = request.mode === 'navigate' && (url.pathname.endsWith('/') || url.pathname.endsWith('/index.html'));
  if (request.mode === 'navigate' && !isStart) return; // zum Beispiel diag.html: immer direkt vom Server
  const key = isStart ? new Request(new URL('./index.html', self.location)) : request;

  // Nur aus dem Cache dieser Version. Kein Nachladen einzelner Dateien im Hintergrund, sonst mischen sich beim Update
  // neue und alte Dateien. Neue Versionen kommen komplett über die Installation des neuen Service Workers.
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(key);
      if (cached) return cached;
      try {
        const response = await fetch(request.url, { cache: 'reload' });
        if (response.ok && response.type === 'basic') cache.put(key, response.clone());
        return response;
      } catch {
        return Response.error();
      }
    }),
  );
});
