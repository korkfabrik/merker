// Auswahl einer Ziel-Liste als Bottom Sheet. Liefert die gewählte Liste oder null (Abbruch, Zurück-Geste, Escape).
import { h } from './ui.js';
import { hueStyle } from './settings.js';
import { t } from './i18n.js';

export function pickList(lists, title = t('picker.title')) {
  return openPicker(title, (close) =>
    lists.map((list) =>
      h(
        'button',
        { class: 'pick-row press', type: 'button', style: hueStyle(list.id), onclick: () => close(list, false) },
        h('span', { class: 'pick-dot' }),
        h('span', { class: 'pick-name' }, list.name),
        h('span', { class: 'pick-count' }, t('common.openCount', { n: list.open })),
      ),
    ),
  );
}

// Auswahl aus festen Optionen [[key, Name, Hinweis?], ...]. Die aktuelle ist mit Haken markiert (ohne Hinweis). Liefert den Schlüssel oder null.
export async function pickChoice(options, current, title) {
  const result = await openPicker(title, (close) =>
    options.map(([key, label, hint]) =>
      h(
        'button',
        { class: 'pick-row press', type: 'button', 'aria-pressed': String(key === current), onclick: () => close(key, false) },
        h('span', { class: 'pick-name' }, label),
        hint ? h('span', { class: 'pick-count' }, hint) : h('span', { class: 'pick-count pick-check' }, key === current ? '✓' : ''),
      ),
    ),
  );
  return result;
}

// Zahl frei eingeben (zum Beispiel Kalenderwoche). Liefert die Zahl oder null.
export function pickNumber(title, { min, max, value, label }) {
  return openPicker(title, (close) => {
    const input = h('input', { class: 'field-input pick-number', type: 'number', inputmode: 'numeric', min, max, value: value ?? '', 'aria-label': label ?? title });
    const submit = (event) => {
      event.preventDefault();
      const n = Number(input.value);
      if (!Number.isInteger(n) || n < min || n > max) {
        input.focus();
        input.select();
        return;
      }
      close(n, false);
    };
    setTimeout(() => {
      input.focus();
      input.select();
    }, 50);
    return [h('form', { class: 'pick-number-form', onsubmit: submit }, input, h('button', { class: 'btn btn-primary press', type: 'submit' }, t('common.ok')))];
  });
}

// Allgemeines Fenster von unten. build(close) liefert den Inhalt, close(Ergebnis) schließt.
export function openPicker(title, build) {
  return new Promise((resolve) => {
    let done = false;
    let root = null;
    const depth = (history.state?.n ?? 0) + 1;
    history.pushState({ n: depth, picker: true }, '', location.href);

    const close = (result, viaBack) => {
      if (done) return;
      done = true;
      window.removeEventListener('popstate', onPop);
      document.removeEventListener('keydown', onKey);
      root.classList.remove('open');
      setTimeout(() => root.remove(), 250);
      // Erst auflösen, wenn der Verlaufseintrag der Auswahl wirklich weg ist. Sonst könnte eine neue Auswahl
      // (zum Beispiel direkt nach Rückgängig) vom nachlaufenden Zurück sofort wieder geschlossen werden.
      if (!viaBack && history.state?.picker) {
        const finish = () => {
          clearTimeout(timer);
          window.removeEventListener('popstate', finish);
          resolve(result);
        };
        const timer = setTimeout(finish, 600);
        window.addEventListener('popstate', finish);
        history.back();
      } else {
        resolve(result);
      }
    };
    const onPop = () => close(null, true);
    const onKey = (event) => event.key === 'Escape' && close(null, false);

    const buttons = build(close);
    const sheet = h(
      'div',
      { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'sheet-handle' }),
      h('h2', { class: 'pick-title' }, title),
      h('div', { class: 'pick-list' }, buttons),
    );
    root = h('div', { class: 'sheet-root' }, h('div', { class: 'sheet-scrim', onclick: () => close(null, false) }), sheet);
    document.body.append(root);
    window.addEventListener('popstate', onPop);
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(() => root.classList.add('open'));
  });
}
