// Hinweis "Neue Version verfügbar" mit Knopf "Neu laden".
// Der neue Service Worker wartet nach der Installation, bis man auf "Neu laden" tippt. So mischen sich nie alte und neue Dateien.
// Geprüft wird beim Start, beim Zurückkehren in die App (höchstens einmal pro Minute) und alle 30 Minuten.
import { h } from './ui.js';
import { t } from './i18n.js';

const CHECK_EVERY = 30 * 60 * 1000;
const MIN_GAP = 60 * 1000;

// Versionsnummer beim wartenden Service Worker erfragen (ältere Worker antworten nicht: dann ohne Nummer)
function askVersion(worker) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), 1500);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(event.data?.version ?? null);
    };
    try {
      worker.postMessage({ type: 'version' }, [channel.port2]);
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

export function watchForUpdates(registration) {
  const sw = navigator.serviceWorker;
  let bar = null;
  let reloading = false;
  let lastCheck = Date.now();

  async function show(worker) {
    if (bar || !sw.controller) return; // erste Installation: nichts zu melden
    const version = await askVersion(worker);
    if (bar) return;
    const reload = h(
      'button',
      {
        class: 'update-action press',
        type: 'button',
        onclick: () => {
          reloading = true;
          reload.disabled = true;
          worker.postMessage({ type: 'skipWaiting' });
          // Falls der Wechsel ausbleibt (zum Beispiel ein älterer Worker ohne diese Nachricht): trotzdem neu laden
          setTimeout(() => location.reload(), 3000);
        },
      },
      t('update.reload'),
    );
    const dismiss = () => {
      bar.remove();
      bar = null; // ein späteres Update darf wieder einen Hinweis zeigen
    };
    const close = h('button', { class: 'update-close press', type: 'button', 'aria-label': t('update.later'), onclick: dismiss }, '×');
    bar = h('div', { class: 'update-bar', role: 'status' }, h('span', { class: 'update-text' }, version ? t('update.availableVersion', { version }) : t('update.available')), reload, close);
    document.body.append(bar);
  }

  const track = (worker) => {
    if (!worker) return;
    if (worker.state === 'installed') return show(worker);
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed') show(worker);
    });
  };

  if (registration.waiting) show(registration.waiting);
  track(registration.installing);
  registration.addEventListener('updatefound', () => track(registration.installing));
  sw.addEventListener('controllerchange', () => {
    if (reloading) location.reload();
  });

  const check = () => {
    lastCheck = Date.now();
    registration.update().catch(() => {}); // ohne Netz einfach später wieder
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastCheck > MIN_GAP) check();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') check();
  }, CHECK_EVERY);
}
