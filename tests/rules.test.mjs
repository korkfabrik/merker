import assert from 'node:assert/strict';
import { sortByMode, sortItems, isOverdue, isDueToday, formatDue, isPrio, stripPrio, withPrio, decodeFeatures, parseDue, localDateKey } from '../app/js/rules.js';
const now = new Date(2026, 9, 27, 12, 0); // 27.10.2026 12:00 lokal
const day = (o) => localDateKey(new Date(2026, 9, 27 + o));
const mk = (summary, due = null, status = 'needs_action') => ({ summary, due, status });

assert.ok(isPrio('❗ Arzt') && isPrio('❗️ Arzt') && isPrio('!Arzt') && !isPrio('Arzt !'));
assert.equal(stripPrio('❗ Arzt'), 'Arzt');
assert.equal(withPrio('Arzt'), '❗ Arzt');
assert.equal(withPrio('❗ Arzt'), '❗ Arzt');

assert.ok(isOverdue(mk('a', day(-1)), now));
assert.ok(!isOverdue(mk('a', day(0)), now));
assert.ok(!isOverdue(mk('a', day(-1), 'completed'), now));
assert.ok(isOverdue(mk('a', new Date(2026, 9, 27, 11, 0).toISOString()), now));
assert.ok(!isOverdue(mk('a', new Date(2026, 9, 27, 13, 0).toISOString()), now));
assert.ok(isDueToday(mk('a', day(0)), now) && !isDueToday(mk('a', day(1)), now));

const items = [mk('ohne'), mk('spaeter', day(3)), mk('❗ prio ohne datum'), mk('heute', day(0)), mk('❗ prio spaet', day(4)), mk('❗ prio frueh', day(1)), mk('ohne2')];
assert.deepEqual(sortItems(items).map((i) => i.summary), ['❗ prio frueh', '❗ prio spaet', '❗ prio ohne datum', 'heute', 'spaeter', 'ohne', 'ohne2']);
assert.deepEqual(sortByMode(items, 'standard').map((i) => i.summary), sortItems(items).map((i) => i.summary));
assert.deepEqual(sortByMode(items, 'ha').map((i) => i.summary), items.map((i) => i.summary));
assert.notEqual(sortByMode(items, 'ha'), items);
const names = [{ summary: 'zebra' }, { summary: '❗ Äpfel' }, { summary: 'apfel 10' }, { summary: 'Apfel 2' }, { summary: 'banane' }];
assert.deepEqual(sortByMode(names, 'alpha').map((i) => i.summary), ['❗ Äpfel', 'Apfel 2', 'apfel 10', 'banane', 'zebra']);
assert.equal(items[0].summary, 'ohne', 'sortItems darf das Original nicht ändern');

assert.equal(formatDue(day(0), now), 'Heute');
assert.equal(formatDue(day(1), now), 'Morgen');
assert.equal(formatDue(day(-1), now), 'Gestern');
console.log(formatDue(day(5), now), '|', formatDue('2027-01-05', now));
assert.equal(parseDue(null), null);
assert.equal(parseDue('kaputt'), null);
const f = decodeFeatures(127);
assert.ok(Object.values(f).every(Boolean));
assert.deepEqual(decodeFeatures(0), { create: false, remove: false, update: false, move: false, dueDate: false, dueDatetime: false, description: false });
assert.ok(decodeFeatures(16).dueDate && !decodeFeatures(16).dueDatetime);
console.log('rules: alle Tests bestanden');
