// Einkaufsansicht (angelehnt an Bring!): Artikel als große Kacheln, nach Abteilungen geordnet.
// Antippen hakt ab, die Kachel wandert nach unten zu "Zuletzt gekauft" (einklappbar). Dort antippen setzt sie wieder auf die Liste.
// Lange drücken öffnet ein kleines Fenster für Menge, Notiz und Bild. Oben ein Feld zum Hinzufügen, das beim Tippen auch filtert.
// Mehrere Artikel auf einmal: mit Komma trennen ("Milch, Brot, Eier").
import { h, icon, emptyState } from '../ui.js';
import { sortByMode, isCompleted, isPrio, stripPrio } from '../rules.js';
import { itemPath } from '../router.js';
import { isTemporaryUid, errorText } from '../repository.js';
import { completeWithUndo, vibrate } from '../actions.js';
import { attachLongPress } from './list.js';
import { getListSort, hueStyle, getShopColumns } from '../settings.js';
import { shopIcon, shopSection, SECTIONS, SECTION_ICONS, ALL_ICONS, normalizeName } from '../shopicons.js';
import { openPicker } from '../picker.js';
import { t } from '../i18n.js';

// Überschriften der Abteilungen (ausgeschrieben, damit die Sprachprüfung jeden Schlüssel findet)
const sectionLabel = (key) =>
  ({
    produce: t('shop.section.produce'),
    bakery: t('shop.section.bakery'),
    dairy: t('shop.section.dairy'),
    meat: t('shop.section.meat'),
    pantry: t('shop.section.pantry'),
    sweets: t('shop.section.sweets'),
    frozen: t('shop.section.frozen'),
    drinks: t('shop.section.drinks'),
    drugstore: t('shop.section.drugstore'),
    household: t('shop.section.household'),
    pets: t('shop.section.pets'),
    other: t('shop.section.other'),
  })[key];

let recentOpen = false; // "Zuletzt gekauft" aufgeklappt (gilt, solange die App läuft)

const norm = (text) => stripPrio(String(text ?? '')).trim().toLocaleLowerCase();
export const iconKey = (summary) => normalizeName(stripPrio(summary));
const nameOf = (item) => stripPrio(item.summary) || item.summary;

// Zeile der Beschreibung, die als Menge oder Notiz auf der Kachel steht (erste Zeile ohne Unteraufgaben, Wiederholung, Erledigt-Datum)
const isDetailLine = (line) => line && !/^- \[[ xX]\]/.test(line) && !line.startsWith('🔁') && !line.startsWith('✓');
function detailOf(description) {
  return (
    String(description ?? '')
      .split('\n')
      .map((line) => line.trim())
      .find(isDetailLine) ?? ''
  );
}

// Notiz in die Beschreibung schreiben, der Rest (Unteraufgaben usw.) bleibt
export function withDetail(description, detail) {
  const lines = String(description ?? '').split('\n');
  const at = lines.findIndex((line) => isDetailLine(line.trim()));
  const text = detail.trim();
  if (at >= 0) {
    if (text) lines[at] = text;
    else lines.splice(at, 1);
  } else if (text) lines.unshift(text);
  return lines.join('\n').trim() || null;
}

// Menge vorn in der Notiz ersetzen ("2× fettarm" -> "3× fettarm")
const QTY_RE = /^\s*\d+(?:[.,]\d+)?\s*(?:×|x|g|kg|l|ml|stk\.?)(?=\s|$)\s*/i;
export const withQuantity = (note, qty) => `${qty} ${String(note ?? '').replace(QTY_RE, '')}`.trim();

// --- Bildschirm an lassen, solange die Einkaufsansicht offen ist ----------------------------------
let wakeLock = null;
let wantAwake = false;
async function requestWake() {
  if (!wantAwake || wakeLock || document.visibilityState !== 'visible' || !navigator.wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      wakeLock = null;
    });
  } catch {
    wakeLock = null; // zum Beispiel Energiesparmodus
  }
}
document.addEventListener('visibilitychange', () => requestWake());
export function keepAwake(on) {
  wantAwake = on;
  if (on) requestWake();
  else if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}
export const isAwake = () => wakeLock !== null;

// --- Eingabefeld oben (bleibt beim Neuzeichnen erhalten, wie die Suche) ---------------------------
export class ShoppingBar {
  #form = null;
  #input = null;
  listId = null;
  query = '';

  constructor({ topSlot, onInput, onSubmit }) {
    this.topSlot = topSlot;
    this.onInput = onInput;
    this.onSubmit = onSubmit;
  }

  mount(listId) {
    if (this.#form && this.listId === listId) return;
    this.listId = listId;
    this.query = '';
    this.#input = h('input', {
      type: 'text',
      class: 'composer-input',
      placeholder: t('shop.placeholder'),
      'aria-label': t('shop.placeholder'),
      enterkeyhint: 'done',
      autocapitalize: 'sentences',
    });
    this.#input.addEventListener('input', () => {
      this.query = this.#input.value;
      this.onInput();
    });
    this.#form = h('form', { class: 'composer composer-top shopbar' }, h('span', { class: 'composer-mark' }, icon('plus', 22)), this.#input);
    this.#form.addEventListener('submit', (event) => {
      event.preventDefault();
      const text = this.#input.value.trim();
      if (text) this.onSubmit(text);
    });
    this.topSlot.replaceChildren(this.#form);
  }

  clear() {
    if (!this.#input) return;
    this.#input.value = '';
    this.query = '';
    this.onInput();
  }

  // Text nach einem Fehler zurückholen, aber nur, wenn inzwischen nichts Neues getippt wurde
  restore(text) {
    if (!this.#input || this.#input.value) return;
    this.#input.value = text;
    this.query = text;
    this.onInput();
  }

  unmount() {
    if (!this.#form) return;
    this.#form = null;
    this.#input = null;
    this.listId = null;
    this.query = '';
    this.topSlot.replaceChildren();
  }
}

// Einzelne Artikel aus der Eingabe (Komma oder Zeilenumbruch trennt)
export const splitItems = (text) => [...new Set(String(text).split(/[,\n;]+/).map((part) => part.trim()).filter(Boolean))];

// Artikel hinzufügen: steht er unter "Zuletzt gekauft", kommt er von dort zurück, statt doppelt angelegt zu werden.
export async function addShoppingItem(ctx, list, text) {
  const already = [];
  try {
    for (const name of splitItems(text)) {
      const items = ctx.store.get().items[list.id] ?? [];
      const key = norm(name);
      const open = items.find((item) => !isCompleted(item) && norm(item.summary) === key);
      if (open) {
        already.push(nameOf(open));
        continue;
      }
      const done = items.find((item) => isCompleted(item) && norm(item.summary) === key);
      if (done) await ctx.repo.setCompleted(list.id, done.uid, false);
      else await ctx.repo.addItem(list.id, { summary: name });
    }
  } catch (err) {
    ctx.toast.show(t('toast.notSaved', { error: errorText(err) }), { error: true });
    return false;
  }
  vibrate(10);
  if (already.length) ctx.toast.show(t('shop.already', { name: already.join(', ') }));
  return true;
}

// --- Kleines Fenster beim langen Drücken: Menge, Notiz, Bild -----------------------------------------
const QUANTITIES = ['2×', '3×', '4×', '6×', '500 g', '1 kg', '1 l', '2 l'];

// Aktueller Stand eines Artikels (die Kachel kann einen Augenblick älter sein als die Liste)
const latest = (ctx, list, uid) => (ctx.store.get().items[list.id] ?? []).find((entry) => entry.uid === uid) ?? null;

async function openItemMenu(ctx, list, tileItem) {
  const item = latest(ctx, list, tileItem.uid);
  if (!item) return; // inzwischen gelöscht
  const name = nameOf(item);
  const key = iconKey(item.summary);
  const chosen = ctx.store.get().shopIcons?.[key] ?? null;
  const auto = shopIcon(name);
  let pickedIcon = chosen;
  const chosenSection = ctx.store.get().shopSections?.[key] ?? null;
  let pickedSection = chosenSection;
  const autoSection = () => shopSection(name, pickedIcon);
  const canNote = list.features.update && list.features.description;
  const before = detailOf(item.description);

  const result = await openPicker(name, (close) => {
    const parts = [];
    const note = h('input', { class: 'field-input shop-note', type: 'text', value: before, placeholder: t('shop.notePlaceholder'), 'aria-label': t('shop.note') });
    if (canNote) {
      parts.push(
        h('p', { class: 'field-label' }, t('shop.quantity')),
        h(
          'div',
          { class: 'shop-qty' },
          QUANTITIES.map((qty) =>
            h('button', { class: 'pick-chip press', type: 'button', onclick: () => (note.value = withQuantity(note.value, qty)) }, qty),
          ),
        ),
        h('label', { class: 'field shop-note-field' }, h('span', { class: 'field-label' }, t('shop.note')), note),
      );
    }
    const preview = h('span', { class: 'shop-icon-current', 'aria-hidden': 'true' }, chosen ?? auto ?? name.charAt(0).toLocaleUpperCase());
    const mark = () => {
      preview.textContent = pickedIcon ?? auto ?? name.charAt(0).toLocaleUpperCase();
      for (const button of grid.children) button.setAttribute('aria-pressed', String(button.dataset.icon === (pickedIcon ?? '')));
      markSections();
    };
    const grid = h(
      'div',
      { class: 'shop-icon-grid', hidden: true },
      h('button', { class: 'shop-icon-choice shop-icon-auto press', type: 'button', 'data-icon': '', onclick: () => ((pickedIcon = null), mark()) }, t('shop.iconAuto')),
      ALL_ICONS.map((emoji) => h('button', { class: 'shop-icon-choice press', type: 'button', 'data-icon': emoji, 'aria-label': emoji, onclick: () => ((pickedIcon = emoji), mark()) }, emoji)),
    );
    // Abteilung: "Auto" zeigt, wohin der Artikel ohne eigene Wahl käme
    const sectionButtons = [null, ...SECTIONS].map((section) =>
      h(
        'button',
        {
          class: 'pick-chip shop-section-chip press',
          type: 'button',
          'data-section': section ?? '',
          onclick: () => {
            pickedSection = section;
            markSections();
          },
        },
        section ? `${SECTION_ICONS[section]} ${sectionLabel(section)}` : '',
      ),
    );
    const sectionNow = h('span', { class: 'shop-icon-current', 'aria-hidden': 'true' });
    const sectionName = h('span', { class: 'shop-icon-hint' });
    const markSections = () => {
      for (const button of sectionButtons) {
        const value = button.dataset.section || null;
        button.setAttribute('aria-pressed', String(value === pickedSection));
        if (!value) button.textContent = t('shop.sectionAuto', { section: sectionLabel(autoSection()) });
      }
      const current = pickedSection ?? autoSection();
      sectionNow.textContent = SECTION_ICONS[current];
      sectionName.textContent = pickedSection ? sectionLabel(current) : t('shop.sectionAuto', { section: sectionLabel(current) });
    };
    const sectionGrid = h('div', { class: 'shop-qty shop-sections', hidden: true }, sectionButtons);
    parts.push(
      h(
        'button',
        { class: 'shop-icon-row shop-section-row press', type: 'button', 'aria-expanded': 'false', onclick: (event) => {
          sectionGrid.hidden = !sectionGrid.hidden;
          event.currentTarget.setAttribute('aria-expanded', String(!sectionGrid.hidden));
        } },
        sectionNow,
        h('span', {}, t('shop.sectionLabel')),
        sectionName,
      ),
      sectionGrid,
    );
    parts.push(
      h(
        'button',
        { class: 'shop-icon-row press', type: 'button', 'aria-expanded': 'false', onclick: (event) => {
          grid.hidden = !grid.hidden;
          event.currentTarget.setAttribute('aria-expanded', String(!grid.hidden));
        } },
        preview,
        h('span', {}, t('shop.icon')),
        h('span', { class: 'shop-icon-hint' }, t('shop.iconHint')),
      ),
      grid,
      h(
        'div',
        { class: 'shop-menu-actions' },
        h('button', { class: 'btn press', type: 'button', onclick: () => close({ action: 'edit' }, false) }, t('shop.editAll')),
        h('button', { class: 'btn btn-primary press', type: 'button', onclick: () => close({ action: 'save', note: note.value }, false) }, t('sheet.save')),
      ),
    );
    setTimeout(mark, 0);
    return parts;
  });
  if (!result) return;
  if (result.action === 'edit') {
    ctx.router.go(itemPath(list.id, item.uid));
    return;
  }
  try {
    if (pickedIcon !== chosen) await ctx.repo.setShopIcon(key, pickedIcon);
    if (pickedSection !== chosenSection) await ctx.repo.setShopSection(key, pickedSection);
    // Beschreibung vom neuesten Stand nehmen, falls sich dort inzwischen etwas geändert hat (zum Beispiel Unteraufgaben)
    const now = latest(ctx, list, item.uid);
    if (canNote && now && result.note.trim() !== before) await ctx.repo.updateItem(list.id, now.uid, { description: withDetail(now.description, result.note) });
  } catch (err) {
    ctx.toast.show(t('toast.notSaved', { error: errorText(err) }), { error: true });
  }
}

// --- Kacheln ---------------------------------------------------------------------------------------
function tile(item, list, ctx, done) {
  const pending = isTemporaryUid(item.uid);
  const name = nameOf(item);
  const emoji = ctx.state.shopIcons?.[iconKey(item.summary)] ?? shopIcon(name);
  const detail = detailOf(item.description);
  const button = h(
    'button',
    {
      class: 'shop-tile press' + (done ? ' is-done' : '') + (pending ? ' is-pending' : '') + (isPrio(item.summary) ? ' is-prio' : ''),
      type: 'button',
      'data-uid': item.uid,
      'aria-label': done ? t('shop.readd', { name }) : t('shop.check', { name }),
      disabled: pending || !list.features.update ? true : null,
      onclick: () => {
        vibrate(10);
        completeWithUndo(ctx, list, item, !done).catch(() => {});
      },
    },
    h('span', { class: 'shop-icon', 'aria-hidden': 'true' }, emoji ?? h('span', { class: 'shop-letter' }, name.charAt(0).toLocaleUpperCase())),
    h('span', { class: 'shop-name' }, name),
    detail ? h('span', { class: 'shop-detail' }, detail) : null,
  );
  if (!pending) attachLongPress(button, () => openItemMenu(ctx, list, item));
  return button;
}

export function renderShopping(root, ctx, list, query = '') {
  const items = ctx.state.items[list.id] ?? [];
  const q = norm(query);
  const match = (item) => !q || norm(item.summary).includes(q);
  const open = sortByMode(items.filter((item) => !isCompleted(item)), getListSort(list.id)).filter(match);
  const done = items
    .filter(isCompleted)
    .filter(match)
    .sort((a, b) => norm(a.summary).localeCompare(norm(b.summary)));
  const gridClass = 'shop-grid' + (getShopColumns() === 4 ? ' cols-4' : '');
  const grid = (children) => h('div', { class: gridClass, style: hueStyle(list.id) }, children);

  // Beim Tippen: Kachel zum Anlegen, wenn es den Artikel noch nicht gibt (bei mehreren mit Komma: alle zusammen)
  const names = splitItems(query);
  const unknown = names.filter((name) => !items.some((item) => norm(item.summary) === norm(name)));
  if (q && unknown.length && list.features.create) {
    const label = unknown.join(', ');
    root.append(
      grid(
        h(
          'button',
          { class: 'shop-tile shop-add press', type: 'button', onclick: () => ctx.shopAdd(query.trim()) },
          h('span', { class: 'shop-icon', 'aria-hidden': 'true' }, (unknown.length === 1 && shopIcon(label)) || icon('plus', 34)),
          h('span', { class: 'shop-name' }, label),
          h('span', { class: 'shop-detail' }, unknown.length > 1 ? t('shop.addMany', { n: unknown.length }) : t('shop.add')),
        ),
      ),
    );
  }

  // Offene Artikel nach Abteilungen (Überschriften nur, wenn es mehr als eine gibt)
  if (open.length) {
    const groups = new Map(SECTIONS.map((key) => [key, []]));
    for (const item of open) {
      const key = iconKey(item.summary);
      groups.get(shopSection(nameOf(item), ctx.state.shopIcons?.[key], ctx.state.shopSections?.[key])).push(item);
    }
    const used = [...groups].filter(([, entries]) => entries.length);
    for (const [key, entries] of used) {
      if (used.length > 1) root.append(h('h2', { class: 'section-title shop-section-title' }, sectionLabel(key)));
      root.append(grid(entries.map((item) => tile(item, list, ctx, false))));
    }
  } else if (!q || !unknown.length) {
    root.append(emptyState(q ? t('shop.noMatch') : t('shop.empty')));
  }

  if (done.length) {
    const details = h(
      'details',
      { class: 'shop-recent', open: recentOpen || q ? '' : null, ontoggle: (event) => !q && (recentOpen = event.target.open) },
      h('summary', { class: 'section-title shop-done-title' }, t('shop.recent', { n: done.length })),
      grid(done.map((item) => tile(item, list, ctx, true))),
    );
    root.append(details);
  }
}
