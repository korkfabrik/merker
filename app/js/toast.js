// Snackbar unten über der Eingabeleiste: Meldung, optional mit "Rückgängig".
import { h } from './ui.js';
import { t } from './i18n.js';

export function createToast(root) {
  let timer = null;

  function hide() {
    clearTimeout(timer);
    timer = null;
    root.hidden = true;
    root.replaceChildren();
  }

  // options: { actionLabel, onAction, error, duration, oneLine }. oneLine: Text in einer Zeile, zu lang wird mit … gekürzt (der Knopf bleibt sichtbar).
  function show(text, options = {}) {
    clearTimeout(timer);
    root.className = `snackbar${options.error ? ' snackbar-error' : ''}${options.oneLine ? ' snackbar-one-line' : ''}`;
    const children = [h('span', { class: 'snackbar-text' }, text)];
    if (options.onAction) {
      children.push(
        h(
          'button',
          {
            class: 'snackbar-action',
            type: 'button',
            onclick: () => {
              hide();
              options.onAction();
            },
          },
          options.actionLabel ?? t('common.undo'),
        ),
      );
    }
    root.replaceChildren(...children);
    root.hidden = false;
    timer = setTimeout(hide, options.duration ?? (options.error ? 7000 : 5000));
  }

  return { show, hide };
}
