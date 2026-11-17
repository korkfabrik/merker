// "Neue Liste": fragt den Namen und legt eine lokale To-do-Liste in Home Assistant an.
import { h } from './ui.js';
import { errorText } from './repository.js';
import { listPath } from './router.js';
import { t } from './i18n.js';

export function openNewList({ store, repo, toast, router }) {
  let closed = false;
  let busy = false;
  history.pushState({ n: (history.state?.n ?? 0) + 1, picker: true }, '', location.href);

  const name = h('input', { class: 'field-input', type: 'text', autocapitalize: 'sentences', enterkeyhint: 'done' });
  const error = h('p', { class: 'form-error', hidden: true });
  const save = h('button', { class: 'btn btn-primary press', type: 'submit', disabled: true }, t('newList.create'));
  const form = h(
    'form',
    { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('newList.title') },
    h('div', { class: 'sheet-handle' }),
    h('h2', { class: 'pick-title' }, t('newList.title')),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, t('newList.name')), name),
    h('p', { class: 'hint newlist-hint' }, t('newList.localHint')),
    error,
    h('div', { class: 'sheet-actions' }, save),
  );
  const root = h('div', { class: 'sheet-root' }, h('div', { class: 'sheet-scrim', onclick: () => close() }), form);

  const onPop = () => close(true);
  const onKey = (event) => event.key === 'Escape' && close();
  function close(viaBack = false) {
    if (closed) return;
    closed = true;
    window.removeEventListener('popstate', onPop);
    document.removeEventListener('keydown', onKey);
    root.classList.remove('open');
    setTimeout(() => root.remove(), 250);
    if (!viaBack && history.state?.picker) history.back();
  }

  name.addEventListener('input', () => {
    save.disabled = busy || name.value.trim() === '';
    error.hidden = true;
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = name.value.trim();
    if (!text || busy) return;
    busy = true;
    save.disabled = true;
    save.textContent = t('newList.creating');
    const known = new Set(store.get().lists.map((list) => list.id));
    try {
      await repo.createList(text);
    } catch (err) {
      busy = false;
      save.disabled = false;
      save.textContent = t('newList.create');
      error.textContent = errorText(err);
      error.hidden = false;
      return;
    }
    close();
    toast.show(t('newList.created', { name: text }));
    // Die neue Liste kommt über das Abo. Sobald sie da ist, wird sie geöffnet.
    // Die Liste kann schon da sein, bevor die Antwort ankommt. Deshalb erst nachsehen, dann abonnieren.
    const open = (state) => {
      const fresh = state.lists.find((list) => !known.has(list.id));
      if (!fresh) return false;
      setTimeout(() => router.go(listPath(fresh.id)), 300);
      return true;
    };
    if (open(store.get())) return;
    const stop = store.subscribe((state) => {
      if (!open(state)) return;
      stop();
      clearTimeout(timer);
    });
    const timer = setTimeout(stop, 8000);
  });

  document.body.append(root);
  window.addEventListener('popstate', onPop);
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => root.classList.add('open'));
  name.focus({ preventScroll: true });
}
