// Notfallnetz beim Start (klassisches Skript, unabhängig von den Modulen).
// Startet die App nicht, räumt es Service Worker und Cache auf, lädt alles frisch und versucht es einmal neu.
// Klappt auch das nicht, steht eine Meldung mit Knopf auf dem Bildschirm statt einer schwarzen Fläche.
// Gespeicherte Akzentfarbe sofort setzen, damit beim Start nichts in der Standardfarbe aufblitzt.
(function () {
  // Fest gewähltes Erscheinungsbild (Hell oder Dunkel) sofort setzen, damit nichts aufblitzt.
  try {
    var theme = localStorage.getItem('merker.theme');
    if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
    if (localStorage.getItem('merker.compact') === 'true') document.documentElement.setAttribute('data-density', 'compact');
  } catch (e) {
    // ignorieren
  }
})();

(function () {
  try {
    var saved = JSON.parse(localStorage.getItem('merker.accentCss') || 'null');
    if (!saved || !saved.css) return;
    var style = document.createElement('style');
    style.id = 'accent-style';
    style.textContent = saved.css;
    document.head.appendChild(style);
    var metas = document.querySelectorAll('meta[name=theme-color]');
    for (var i = 0; i < metas.length; i++) {
      metas[i].setAttribute('content', /dark/.test(metas[i].getAttribute('media') || '') ? saved.colors[1] : saved.colors[0]);
    }
  } catch (e) {
    // ignorieren
  }
})();

(function () {
  var FLAG = 'merker.recovered';
  var shown = false;
  // Läuft vor den Modulen und kann deshalb die Sprachdateien nicht nutzen. Darum die wenigen Texte hier direkt.
  var TEXTS = {
    de: { failed: 'Merker konnte nicht starten. ', version: ' (Version ', reset: 'Zurücksetzen und neu laden', timeout: 'Keine Antwort nach 10 Sekunden.' },
    en: { failed: 'Merker could not start. ', version: ' (version ', reset: 'Reset and reload', timeout: 'No response after 10 seconds.' },
  };
  var lang = 'en';
  try {
    var chosen = localStorage.getItem('merker.lang');
    var device = (navigator.languages && navigator.languages[0]) || navigator.language || '';
    lang = chosen && TEXTS[chosen] ? chosen : TEXTS[String(device).toLowerCase().split('-')[0]] ? String(device).toLowerCase().split('-')[0] : 'en';
  } catch (e) {
    // Englisch
  }
  var T = TEXTS[lang];

  function flag(value) {
    try {
      if (value === undefined) return sessionStorage.getItem(FLAG);
      if (value === null) sessionStorage.removeItem(FLAG);
      else sessionStorage.setItem(FLAG, value);
    } catch (e) {
      return null;
    }
    return null;
  }

  function reset() {
    var done = function () {
      location.reload();
    };
    if (!('serviceWorker' in navigator) || !window.caches) return done();
    // Ohne Netz nichts löschen: Service Worker und Cache ließen sich nicht neu laden, die App würde offline gar nicht mehr starten.
    if (navigator.onLine === false) return done();
    navigator.serviceWorker
      .getRegistrations()
      .then(function (list) {
        // Nur Merker selbst: HA-Frontend und andere Apps unter derselben Adresse bleiben unberührt
        var scope = new URL('./', location.href).href;
        return Promise.all(list.filter(function (r) { return r.scope === scope; }).map(function (r) { return r.unregister(); }));
      })
      .then(function () { return caches.keys(); })
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k.indexOf('merker-') === 0; }).map(function (k) { return caches.delete(k); }));
      })
      .then(function () {
        return navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
      })
      .then(function (reg) {
        var worker = reg.installing || reg.waiting || reg.active;
        if (!worker || worker.state === 'activated') return;
        return new Promise(function (resolve) {
          worker.addEventListener('statechange', function () {
            if (worker.state === 'activated' || worker.state === 'redundant') resolve();
          });
          setTimeout(resolve, 15000);
        });
      })
      .then(done, done);
  }

  function showError(text) {
    if (shown) return;
    shown = true;
    var box = document.createElement('div');
    box.style.cssText = 'position:fixed;inset:0;display:grid;place-content:center;gap:16px;padding:32px;text-align:center;font:16px system-ui,sans-serif;background:#121316;color:#e3e2e9;z-index:99';
    var p = document.createElement('p');
    p.textContent = T.failed + text + (window.__merkerVersion ? T.version + window.__merkerVersion + ')' : '');
    var b = document.createElement('button');
    b.textContent = T.reset;
    b.style.cssText = 'padding:14px 20px;border:0;border-radius:10px;background:#b2c5ff;color:#022b78;font:inherit;font-weight:600';
    b.onclick = function () { flag(null); reset(); };
    box.appendChild(p);
    box.appendChild(b);
    document.body.appendChild(box);
  }

  window.__merkerFatal = function (text) {
    shown = false;
    showError(text || '');
  };

  function failed(text) {
    if (window.__merkerReady || shown) return;
    if (flag() === null) {
      flag('1');
      reset();
    } else {
      showError(text || '');
    }
  }

  window.addEventListener('error', function (event) {
    failed(event && event.message);
  });
  window.addEventListener('unhandledrejection', function (event) {
    failed(event && event.reason && event.reason.message);
  });
  setTimeout(function () {
    failed(T.timeout);
  }, 10000);
  window.addEventListener('merker-ready', function () {
    flag(null);
  });
})();
