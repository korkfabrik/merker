// Beispieldaten für die Screenshots im README. Sprache über MOCK_LANG (de oder en).
// Aufruf über scripts/screenshots.cjs, nicht direkt.
const T = {
  de: {
    groceries: 'Einkauf',
    household: 'Haushalt',
    errands: 'Erledigungen',
    g: ['Bananen', 'Milch', 'Brot', 'Tomaten', 'Käse', 'Kaffee', 'Spülmittel', 'Joghurt', 'Äpfel', 'Nudeln'],
    gDone: ['Eier', 'Butter', 'Orangensaft', 'Reis'],
    h: [
      ['Pflanzen gießen', '🔁 wöchentlich'],
      ['❗ Rauchmelder testen', null],
      ['Keller aufräumen', '- [x] Regal ausräumen\n- [x] Kartons zum Altpapier\n- [ ] Boden fegen\n- [ ] Werkzeug sortieren'],
      ['Altglas wegbringen', null],
      ['Filter der Dunstabzugshaube tauschen', null],
    ],
    e: [
      ['❗ Steuererklärung abgeben', 'Belege liegen im Ordner „Steuer 2026“'],
      ['Zahnarzttermin vereinbaren', 'Praxis Dr. Schmidt, 030 1234567'],
      ['Paket zur Post bringen', null],
      ['Fahrrad zur Inspektion', 'https://example.com/werkstatt'],
    ],
  },
  en: {
    groceries: 'Groceries',
    household: 'Household',
    errands: 'Errands',
    g: ['Bananas', 'Milk', 'Bread', 'Tomatoes', 'Cheese', 'Coffee', 'Dish soap', 'Yogurt', 'Apples', 'Pasta'],
    gDone: ['Eggs', 'Butter', 'Orange juice', 'Rice'],
    h: [
      ['Water the plants', '🔁 weekly'],
      ['❗ Test smoke detectors', null],
      ['Tidy up the basement', '- [x] Empty the shelf\n- [x] Boxes to recycling\n- [ ] Sweep the floor\n- [ ] Sort the tools'],
      ['Take glass to recycling', null],
      ['Replace cooker hood filter', null],
    ],
    e: [
      ['❗ File tax return', 'Receipts are in the "Taxes 2026" folder'],
      ['Book dentist appointment', 'Dr. Smith, +1 555 0100'],
      ['Drop off parcel', null],
      ['Bike service', 'https://example.com/bikeshop'],
    ],
  },
};

export default function demo(day) {
  const t = T[process.env.MOCK_LANG === 'de' ? 'de' : 'en'];
  const item = (uid, summary, due = null, description = null, status = 'needs_action') => ({ uid, summary, status, due, description });
  const hDue = [0, -1, 3, 9, null];
  const eDue = [1, 6, 0, null];
  return {
    'todo.groceries': {
      name: t.groceries,
      features: 127,
      items: [
        ...t.g.map((s, i) => item(`g${i}`, s, null, i === 1 ? '2×' : null)),
        ...t.gDone.map((s, i) => item(`gd${i}`, s, null, null, 'completed')),
      ],
    },
    'todo.household': {
      name: t.household,
      features: 127,
      items: t.h.map(([s, d], i) => item(`h${i}`, s, hDue[i] === null ? null : day(hDue[i]), d)),
    },
    'todo.errands': {
      name: t.errands,
      features: 127,
      items: t.e.map(([s, d], i) => item(`e${i}`, s, eDue[i] === null ? null : day(eDue[i]), d)),
    },
  };
}
