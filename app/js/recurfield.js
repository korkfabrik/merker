// Kleiner Knopf "Wiederholen" neben der Beschriftung "Fälligkeit". Antippen öffnet die Auswahl.
import { h, icon } from './ui.js';
import { RECURRENCES, recurrenceLabel } from './rules.js';
import { pickChoice } from './picker.js';
import { t } from './i18n.js';

// Liefert { button, state }. state.value ist '' (nie) oder ein Schlüssel wie 'weekly'.
export function recurrenceButton(current) {
  const state = { value: current ?? '' };
  const text = h('span', {});
  const button = h(
    'button',
    { class: 'label-btn recur-btn press', type: 'button', 'aria-label': t('recur.label') },
    icon('repeat', 16),
    text,
  );
  const show = () => {
    text.textContent = state.value ? recurrenceLabel(state.value) : t('recur.label');
    button.classList.toggle('is-set', Boolean(state.value));
    button.title = `${t('recur.label')}: ${state.value ? recurrenceLabel(state.value) : t('recur.never')}`;
  };
  button.addEventListener('click', async () => {
    const choice = await pickChoice([['', t('recur.never')], ...RECURRENCES.map((key) => [key, recurrenceLabel(key)])], state.value, t('recur.label'));
    if (choice === null || choice === undefined) return;
    state.value = choice;
    show();
  });
  show();
  return { button, state };
}
