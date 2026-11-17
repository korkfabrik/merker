// Einstellungen und Diagnose. Stufe 0: zeigt je Liste, welche Funktionen Home Assistant meldet.
import { h } from '../ui.js';
import { listSettingsPath } from '../router.js';
import { FEATURE_LABELS } from '../rules.js';
import { APP_VERSION } from '../version.js';
import { getAppName, setAppName, DEFAULT_APP_NAME, getSubDoneLast, setSubDoneLast, getCompact, setCompact, getSwipeLeft, setSwipeLeft, SWIPE_LEFT, hueStyle, LIST_HUES, getListHue, setListHue, getListSort, setListSort, getHomeLayout, setHomeLayout, orderLists, isShoppingList, setShoppingList, getShopColumns, setShopColumns, getSwipeFarDelete, setSwipeFarDelete } from '../settings.js';
import { attachReorder } from '../reorder.js';
import { icon } from '../ui.js';
import { SORT_MODES } from '../rules.js';
import { ACCENTS, getAccent, setAccent, hexToHue, hueToHex } from '../accent.js';
import { t, lang, LANGUAGES, getLanguageSetting, setLanguageSetting } from '../i18n.js';
import { pickChoice } from '../picker.js';
import { THEMES, getTheme, setTheme } from '../theme.js';

const STATUS_TEXT = {
  connecting: t('settings.status.connecting'),
  online: t('settings.status.online'),
  offline: t('settings.status.offline'),
};

async function reloadFresh() {
  try {
    // Nur Merker selbst aufräumen: unter derselben Adresse laufen auch das HA-Frontend und andere Apps.
    if (navigator.onLine === false) return location.reload(); // ohne Netz nichts löschen, sonst startet die App offline nicht mehr
    const scope = new URL('./', location.href).href;
    const registrations = await navigator.serviceWorker?.getRegistrations?.();
    await Promise.all((registrations ?? []).filter((registration) => registration.scope === scope).map((registration) => registration.unregister()));
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('merker-')).map((key) => caches.delete(key)));
    // Neuen Service Worker anmelden und warten, bis er alle Dateien frisch geholt hat (am HTTP-Cache vorbei).
    if (navigator.serviceWorker) {
      const registration = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
      const worker = registration.installing ?? registration.waiting ?? registration.active;
      if (worker && worker.state !== 'activated') {
        await Promise.race([
          new Promise((resolve) => worker.addEventListener('statechange', () => worker.state === 'activated' && resolve())),
          new Promise((resolve) => setTimeout(resolve, 15000)),
        ]);
      }
    }
  } catch {
    // Neu laden reicht auch ohne Aufräumen.
  }
  location.reload();
}

// Aufgeklappte Gruppen bleiben beim Neuzeichnen offen, solange die App läuft.
const OPEN = new Set();

function group(id, title, hint, ...children) {
  return h(
    'details',
    { class: `settings-group ${id}-group`, open: OPEN.has(id) ? '' : null, ontoggle: (event) => (event.target.open ? OPEN.add(id) : OPEN.delete(id)) },
    h('summary', {}, h('span', { class: 'group-title' }, title), hint ? h('span', { class: 'group-hint' }, hint) : null),
    h('div', { class: 'group-body' }, children),
  );
}

// Feste, nicht klappbare Karte (Verbindung oben, Aktionen unten).
function card(title, ...children) {
  return h('section', { class: 'settings-group settings-static' }, h('h2', { class: 'static-title' }, title), h('div', { class: 'group-body' }, children));
}

// Eigene Farbe: Schieberegler für den Farbton, Anzeige und Eingabe des Hexcodes.
// Übernommen wird der Farbton. Sättigung und Helligkeit legt die App fest, damit alles in Hell und Dunkel lesbar bleibt.
function huePanel(hue, onChange) {
  let current = Math.round(hue);
  const preview = h('span', { class: 'hue-preview' });
  const slider = h('input', { type: 'range', min: '0', max: '360', step: '1', class: 'hue-slider', 'aria-label': t('color.hue') });
  const hexInput = h('input', { type: 'text', class: 'hex-input', maxlength: '7', spellcheck: 'false', autocapitalize: 'off', 'aria-label': t('color.hex'), inputmode: 'text' });
  const show = (value, from) => {
    current = value;
    preview.style.setProperty('--lh', value);
    if (from !== 'slider') slider.value = String(value);
    if (from !== 'hex') hexInput.value = hueToHex(value);
    hexInput.classList.remove('invalid');
  };
  slider.addEventListener('input', () => {
    show(Number(slider.value), 'slider');
    onChange(current);
  });
  hexInput.addEventListener('input', () => {
    const text = hexInput.value.trim();
    if (/^#?[0-9a-f]{6}$/i.test(text)) {
      show(hexToHue(text), 'hex');
      onChange(current);
    } else hexInput.classList.toggle('invalid', text.length >= 6);
  });
  hexInput.addEventListener('blur', () => show(current));
  show(current);
  const el = h('div', { class: 'hue-panel', hidden: true }, h('div', { class: 'hue-row' }, preview, slider), h('div', { class: 'hue-row' }, h('label', { for: undefined }, t('color.hex')), hexInput), h('p', { class: 'hue-note' }, t('color.note')));
  el.show = show;
  return el;
}

// Farbauswahl in einer Zeile: feste Farben, ganz rechts die eigene Farbe (öffnet Schieberegler und Hexcode).
// items: [{ value, label, display }], current: gewählter Wert (Zahl oder null).
function colorChoices({ items, current, onSelect, label, className = '' }) {
  const isPreset = items.some((item) => item.value === current);
  let customHue = typeof current === 'number' ? current : 215;
  const buttons = items.map((item) =>
    h('button', {
      class: 'swatch',
      type: 'button',
      style: `--lh:${item.display ?? item.value}`,
      title: item.label ?? null,
      'aria-label': item.label ?? t('color.swatch', { value: item.value }),
      'aria-pressed': String(current === item.value),
      onclick: () => {
        panel.hidden = true;
        onSelect(item.value);
      },
    }),
  );
  const panel = huePanel(customHue, (hue) => {
    customHue = hue;
    custom.style.setProperty('--lh', hue);
    custom.classList.add('is-set');
    onSelect(hue);
    mark(buttons.length);
  });
  const custom = h('button', {
    class: 'swatch swatch-custom' + (isPreset ? ' ' : ' is-set'),
    type: 'button',
    title: t('color.custom'),
    'aria-label': t('color.custom'),
    style: isPreset ? null : `--lh:${current}`,
    'aria-pressed': String(!isPreset),
    onclick: () => {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) {
        custom.style.setProperty('--lh', customHue);
        custom.classList.add('is-set');
        onSelect(customHue);
        mark(buttons.length);
      }
    },
  });
  const all = [...buttons, custom];
  function mark(index) {
    all.forEach((el, i) => el.setAttribute('aria-pressed', String(i === index)));
  }
  buttons.forEach((button, i) => button.addEventListener('click', () => mark(i)));
  return h('div', { class: 'color-choices ' + className }, h('div', { class: 'swatch-row', role: 'group', 'aria-label': label }, all), panel);
}

const allListsOf = (state) => (state.allLists?.length ? state.allLists : state.lists);

// Kurzinfo je Liste für die Übersicht
function listHint(list, layout) {
  const parts = [];
  if (layout.pinned.includes(list.id)) parts.push(t('settings.hint.pinned'));
  if (layout.hidden.includes(list.id)) parts.push(t('settings.hint.hidden'));
  if (layout.disabled.includes(list.id)) parts.push(t('settings.hint.disabled'));
  return parts.join(', ');
}

// Schalter: erledigte Unteraufgaben ans Ende
function subDoneSwitch() {
  const input = h('input', { type: 'checkbox', role: 'switch', class: 'switch', 'aria-label': t('settings.subDoneLast') });
  input.checked = getSubDoneLast();
  input.addEventListener('change', () => setSubDoneLast(input.checked));
  return h('label', { class: 'switch-row set-switch' }, h('span', { class: 'set-switch-text' }, h('span', {}, t('settings.subDoneLast')), h('span', { class: 'set-hint' }, t('settings.subDoneLastHint'))), input);
}

// Schalter: ganz weit nach links wischen löscht
function swipeFarSwitch() {
  const input = h('input', { type: 'checkbox', role: 'switch', class: 'switch', 'aria-label': t('settings.swipeFar') });
  input.checked = getSwipeFarDelete();
  input.addEventListener('change', () => setSwipeFarDelete(input.checked));
  return h('label', { class: 'switch-row set-switch' }, h('span', { class: 'set-switch-text' }, h('span', {}, t('settings.swipeFar')), h('span', { class: 'set-hint' }, t('settings.swipeFarHint'))), input);
}

// Schalter: kompakte Ansicht
function compactSwitch() {
  const input = h('input', { type: 'checkbox', role: 'switch', class: 'switch', 'aria-label': t('settings.compact') });
  input.checked = getCompact();
  input.addEventListener('change', () => setCompact(input.checked));
  return h('label', { class: 'switch-row set-switch' }, h('span', { class: 'set-switch-text' }, h('span', {}, t('settings.compact')), h('span', { class: 'set-hint' }, t('settings.compactHint'))), input);
}

// Kacheln pro Reihe in der Einkaufsansicht
function shopColumnButtons() {
  const current = getShopColumns();
  const buttons = [3, 4].map((value) =>
    h('button', {
      class: 'seg-btn press',
      type: 'button',
      'aria-pressed': String(value === current),
      onclick: (event) => {
        setShopColumns(value);
        for (const other of buttons) other.setAttribute('aria-pressed', String(other === event.currentTarget));
      },
    }, String(value)),
  );
  return h('div', { class: 'seg-bar', role: 'group', 'aria-label': t('settings.shopColumns') }, buttons);
}

// Wischen nach links: Verschieben, Löschen oder Datum
function swipeLeftButtons() {
  const current = getSwipeLeft();
  const labels = { move: t('settings.swipe.move'), delete: t('settings.swipe.delete'), date: t('settings.swipe.date') };
  const buttons = SWIPE_LEFT.map((value) =>
    h('button', {
      class: 'seg-btn press',
      type: 'button',
      'aria-pressed': String(value === current),
      onclick: (event) => {
        setSwipeLeft(value);
        for (const other of buttons) other.setAttribute('aria-pressed', String(other === event.currentTarget));
      },
    }, labels[value]),
  );
  return h('div', { class: 'seg-bar', role: 'group', 'aria-label': t('settings.swipeLeft') }, buttons);
}

// Erscheinungsbild: drei Knöpfe nebeneinander (Gerät, Hell, Dunkel)
function themeButtons() {
  const current = getTheme();
  const labels = { auto: t('settings.theme.auto'), light: t('settings.theme.light'), dark: t('settings.theme.dark') };
  const buttons = THEMES.map((value) =>
    h('button', {
      class: 'seg-btn press',
      type: 'button',
      'aria-pressed': String(value === current),
      onclick: (event) => {
        setTheme(value);
        for (const other of buttons) other.setAttribute('aria-pressed', String(other === event.currentTarget));
      },
    }, labels[value]),
  );
  return h('div', { class: 'seg-bar', role: 'group', 'aria-label': t('settings.theme') }, buttons);
}

// Unterseiten der Einstellungen (Adresse #/einstellungen/<seite>)
export const SETTINGS_PAGES = ['listen', 'darstellung', 'bedienung', 'sprache'];
export const settingsPageTitle = (page) =>
  ({
    listen: t('settings.lists'),
    darstellung: t('settings.appearance'),
    bedienung: t('settings.controls'),
    sprache: t('settings.language'),
  })[page] ?? t('title.settings');

// Große Zeile der Übersicht: Symbol, Titel, aktueller Stand, Pfeil
function menuRow({ iconName, title, summary, onclick, danger = false, action = false }) {
  return h(
    'button',
    { class: 'menu-row press' + (danger ? ' is-danger' : action ? ' is-action' : ''), type: 'button', onclick },
    h('span', { class: 'menu-icon', 'aria-hidden': 'true' }, icon(iconName, 22)),
    h('span', { class: 'menu-text' }, h('span', { class: 'menu-title' }, title), summary ? h('span', { class: 'menu-summary' }, summary) : null),
    danger || action ? null : h('span', { class: 'menu-chevron', 'aria-hidden': 'true' }, icon('chevron', 24)),
  );
}

const languageSummary = () => {
  const setting = getLanguageSetting();
  const name = (code) => LANGUAGES.find(([key]) => key === code)?.[1] ?? code;
  return setting === 'auto' ? `${t('settings.languageAuto')} (${name(lang)})` : name(setting);
};

// Übersicht: Status oben, dann wenige große Zeilen. Jede öffnet eine eigene Seite.
export function renderSettings(root, { state, repo, router }) {
  const layout = getHomeLayout();
  const lists = allListsOf(state);
  const pinned = lists.filter((list) => layout.pinned.includes(list.id)).length;
  const accent = getAccent();
  const accentName = ACCENTS.find((entry) => entry.hue === accent)?.label ?? t('color.custom');
  const themeName = { auto: t('settings.theme.auto'), light: t('settings.theme.light'), dark: t('settings.theme.dark') }[getTheme()];
  const swipeName = { move: t('settings.swipe.move'), delete: t('settings.swipe.delete'), date: t('settings.swipe.date') }[getSwipeLeft()];
  const go = (page) => () => router.go(`/einstellungen/${page}`);

  root.append(
    // Verbindung mit allen Angaben direkt oben
    h(
      'div',
      { class: `settings-status status-${state.status}` },
      h('span', { class: 'status-dot', 'aria-hidden': 'true' }),
      h(
        'dl',
        { class: 'status-facts' },
        h('dt', {}, t('settings.status')),
        h('dd', {}, h('b', {}, STATUS_TEXT[state.status] ?? state.status)),
        h('dt', {}, 'Home Assistant'),
        h('dd', {}, location.origin),
        h('dt', {}, t('settings.version')),
        h('dd', {}, APP_VERSION),
      ),
    ),
    h(
      'div',
      { class: 'menu-group' },
      menuRow({
        iconName: 'lists',
        title: t('settings.lists'),
        summary: [t('settings.listCount', { n: lists.length }), pinned ? t('settings.pinnedCount', { n: pinned }) : null].filter(Boolean).join(' · '),
        onclick: go('listen'),
      }),
      menuRow({
        iconName: 'palette',
        title: t('settings.appearance'),
        summary: [getAppName(), accentName, themeName, getCompact() ? t('settings.compactShort') : null].filter(Boolean).join(' · '),
        onclick: go('darstellung'),
      }),
      menuRow({ iconName: 'touch', title: t('settings.controls'), summary: t('settings.swipeSummary', { action: swipeName }), onclick: go('bedienung') }),
      menuRow({ iconName: 'language', title: t('settings.language'), summary: languageSummary(), onclick: go('sprache') }),
    ),
    h(
      'div',
      { class: 'menu-group' },
      // Cache leeren: sofort, ohne Rückfrage
      menuRow({ iconName: 'refresh', title: t('settings.reloadShort'), summary: t('settings.reloadHint'), action: true, onclick: reloadFresh }),
      menuRow({
        iconName: 'logout',
        title: t('settings.logout'),
        summary: t('settings.logoutHint'),
        danger: true,
        onclick: async () => {
          const sure = await pickChoice([['logout', t('settings.logout')]], null, t('settings.logoutConfirm'));
          if (sure !== 'logout') return;
          await repo.logout();
          location.reload();
        },
      }),
    ),
  );
}

// Eine Unterseite der Einstellungen
export function renderSettingsPage(root, { state, router, route, rerender }) {
  const section = (title, ...children) => h('section', { class: 'settings-section' }, title ? h('h2', { class: 'section-title' }, title) : null, h('div', { class: 'menu-group menu-body' }, children));
  if (route.page === 'listen') {
    const layout = getHomeLayout();
    const homeList = h('ul', { class: 'plain-list home-order settings-lists' });
    const saveOrder = () => {
      const next = getHomeLayout();
      next.order = [...homeList.children].map((row) => row.dataset.uid);
      setHomeLayout(next);
    };
    for (const list of orderLists(allListsOf(state), layout)) {
      const hint = listHint(list, layout);
      homeList.append(
        h(
          'li',
          { class: 'home-row', 'data-uid': list.id, style: hueStyle(list.id) },
          h(
            'button',
            { class: 'set-row press', type: 'button', onclick: () => router.go(listSettingsPath(list.id)) },
            h('span', { class: 'set-dot', 'aria-hidden': 'true' }, list.name.trim().charAt(0).toUpperCase()),
            h('span', { class: 'set-text' }, h('span', { class: 'diag-name' }, list.name), hint ? h('span', { class: 'set-hint' }, hint) : null),
            h('span', { class: 'set-chevron', 'aria-hidden': 'true' }, icon('chevron', 24)),
          ),
          h('span', { class: 'drag-handle', role: 'button', 'aria-label': t('item.dragHandle') }, icon('drag', 24)),
        ),
      );
    }
    attachReorder(homeList, document.querySelector('#content'), () => saveOrder());
    root.append(
      allListsOf(state).length
        ? h('div', { class: 'settings-page-lists' }, homeList, h('p', { class: 'hue-note home-note' }, t('settings.listsHint')))
        : h('p', { class: 'empty' }, t('settings.noLists')),
    );
    return;
  }
  if (route.page === 'darstellung') {
    root.append(
      section(t('settings.appName'), appNameField(rerender)),
      section(
        t('settings.accent'),
        colorChoices({
          items: ACCENTS.map((entry) => ({ value: entry.hue, label: entry.label, display: entry.hue ?? entry.swatch })),
          current: getAccent(),
          onSelect: (hue) => setAccent(hue),
          label: t('settings.accent'),
          className: 'accent-choices',
        }),
      ),
      section(t('settings.theme'), themeButtons(), compactSwitch()),
      section(t('settings.shopColumns'), shopColumnButtons(), h('p', { class: 'hue-note' }, t('settings.shopColumnsHint'))),
    );
    return;
  }
  if (route.page === 'bedienung') {
    root.append(section(t('settings.swipeLeft'), swipeLeftButtons(), swipeFarSwitch()), section(t('settings.subtasks'), subDoneSwitch()));
    return;
  }
  if (route.page === 'sprache') {
    // Sprache als Liste zum Antippen, die gewählte mit Haken
    const current = getLanguageSetting();
    root.append(
      h(
        'div',
        { class: 'menu-group choice-list', role: 'radiogroup', 'aria-label': t('settings.language') },
        [['auto', `${t('settings.languageAuto')} (${LANGUAGES.find(([code]) => code === lang)?.[1] ?? lang})`], ...LANGUAGES].map(([code, label]) =>
          h(
            'button',
            {
              class: 'choice-row press',
              type: 'button',
              role: 'radio',
              lang: code === 'auto' ? null : code,
              'aria-checked': String(code === current),
              onclick: () => {
                if (code !== current) setLanguageSetting(code);
              },
            },
            h('span', { class: 'choice-label' }, label),
            h('span', { class: 'choice-check', 'aria-hidden': 'true' }, code === current ? icon('check', 22) : null),
          ),
        ),
      ),
    );
    return;
  }
}

// Name der App: steht oben auf der Startseite und im Fenstertitel
function appNameField(rerender) {
  const input = h('input', { class: 'field-input', type: 'text', maxlength: '30', 'aria-label': t('settings.appName'), placeholder: DEFAULT_APP_NAME, autocapitalize: 'words' });
  input.value = getAppName() === DEFAULT_APP_NAME ? '' : getAppName();
  input.addEventListener('change', () => {
    setAppName(input.value);
    rerender?.();
  });
  return h('div', { class: 'app-name-field' }, input, h('p', { class: 'hue-note' }, t('settings.appNameHint')));
}

// Einstellungen einer einzelnen Liste: Farbe, Sortierung, Startseite, Funktionen.
export function renderListSettings(root, { state, repo, route }) {
  const list = allListsOf(state).find((entry) => entry.id === route.id);
  if (!list) {
    root.append(h('p', { class: 'empty' }, state.status === 'online' ? t('list.gone') : t('list.loading')));
    return;
  }
  const layout = getHomeLayout();

  const toggle = (key, label, hint) => {
    const input = h('input', { type: 'checkbox', role: 'switch', class: 'switch', 'aria-label': label });
    input.checked = layout[key].includes(list.id);
    input.addEventListener('change', () => {
      const next = getHomeLayout();
      next[key] = input.checked ? [...new Set([...next[key], list.id])] : next[key].filter((id) => id !== list.id);
      setHomeLayout(next);
      if (key === 'disabled') repo.applyLayout();
    });
    return h('label', { class: 'switch-row set-switch' }, h('span', { class: 'set-switch-text' }, h('span', {}, label), h('span', { class: 'set-hint' }, hint)), input);
  };

  const shoppingInput = h('input', { type: 'checkbox', role: 'switch', class: 'switch', 'aria-label': t('listSettings.shopping') });
  shoppingInput.checked = isShoppingList(list.id);
  shoppingInput.addEventListener('change', () => setShoppingList(list.id, shoppingInput.checked));
  const shoppingSwitch = h('label', { class: 'switch-row set-switch' }, h('span', { class: 'set-switch-text' }, h('span', {}, t('listSettings.shopping')), h('span', { class: 'set-hint' }, t('listSettings.shoppingHint'))), shoppingInput);

  const sortSegments = h(
    'span',
    { class: 'segments', role: 'group', 'aria-label': t('listSettings.sortLabel', { list: list.name }) },
    SORT_MODES.map(([key, label]) =>
      h('button', {
        class: 'segment',
        type: 'button',
        'aria-pressed': String(getListSort(list.id) === key),
        onclick: (event) => {
          setListSort(list.id, key);
          for (const other of event.currentTarget.parentElement.children) other.setAttribute('aria-pressed', String(other === event.currentTarget));
        },
      }, label),
    ),
  );

  root.append(
    card(
      t('listSettings.color'),
      colorChoices({
        items: LIST_HUES.map((hue) => ({ value: hue })),
        current: getListHue(list.id),
        onSelect: (hue) => setListHue(list.id, hue),
        label: t('listSettings.colorLabel', { list: list.name }),
      }),
    ),
    card(t('listSettings.sort'), sortSegments),
    card(t('listSettings.view'), shoppingSwitch),
    card(
      t('listSettings.home'),
      toggle('pinned', t('listSettings.pin'), t('listSettings.pinHint')),
      toggle('hidden', t('listSettings.hide'), t('listSettings.hideHint')),
      toggle('disabled', t('listSettings.disable'), t('listSettings.disableHint')),
    ),
    card(
      t('listSettings.features'),
      h('p', { class: 'hue-note' }, t('listSettings.featuresHint')),
      h('span', { class: 'diag-flags' }, FEATURE_LABELS.map(([key, label]) => h('span', { class: 'chip' + (list.features[key] ? ' chip-on' : ' chip-off') }, label))),
      h('p', { class: 'hue-note' }, t('listSettings.flags', { bits: list.featureBits })),
    ),
  );
}
