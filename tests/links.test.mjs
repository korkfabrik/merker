import assert from 'node:assert/strict';
import { findLinks } from '../app/js/links.js';
import { quickDay, quickIn } from '../app/js/quickdates.js';
import { orderLists } from '../app/js/settings.js';
import { listAsText } from '../app/js/share.js';

const hrefs = (t) => findLinks(t).map((x) => x.href);
assert.deepEqual(hrefs('Tel 0170 1234567 und +49 30 123456-0'), ['tel:01701234567', 'tel:+49301234560']);
assert.deepEqual(hrefs('Siehe https://example.com/a?x=1, danach www.test.de.'), ['https://example.com/a?x=1', 'https://www.test.de']);
assert.deepEqual(hrefs('mail a.b@firma.de'), ['mailto:a.b@firma.de']);
assert.deepEqual(hrefs('Termin 2026-10-30, 30.10.2026, PLZ 80331, Nr 12345678'), []);
assert.deepEqual(hrefs('00491701234567'), ['tel:+491701234567']);
assert.deepEqual(hrefs('https://a.de https://a.de'), ['https://a.de']);

assert.equal(quickDay('heute', new Date(2026, 9, 28)), '2026-10-28');
assert.equal(quickDay('morgen', new Date(2026, 9, 31)), '2026-11-01');
assert.equal(quickDay('woche', new Date(2026, 9, 28)), '2026-11-02'); // Mittwoch -> Montag
assert.equal(quickDay('woche', new Date(2026, 9, 26)), '2026-11-02'); // Montag -> nächster Montag
assert.equal(quickDay('woche', new Date(2026, 9, 25)), '2026-10-26'); // Sonntag -> Montag
assert.equal(quickDay('none'), '');
assert.equal(quickIn(1, 'w', new Date(2026, 10, 22)), '2026-11-29');
assert.equal(quickIn(3, 'w', new Date(2026, 11, 20)), '2027-01-10'); // über den Jahreswechsel
assert.equal(quickIn(1, 'm', new Date(2026, 0, 31)), '2026-02-28'); // 31. Januar plus 1 Monat: letzter Februartag
assert.equal(quickIn(1, 'm', new Date(2028, 0, 31)), '2028-02-29'); // Schaltjahr
assert.equal(quickIn(3, 'm', new Date(2026, 10, 22)), '2027-02-22');
assert.equal(quickIn(1, 'y', new Date(2028, 1, 29)), '2029-02-28'); // 29. Februar plus 1 Jahr
assert.equal(quickIn(2, 'y', new Date(2026, 10, 22)), '2028-11-22');

const lists = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
assert.deepEqual(orderLists(lists, { order: [], pinned: [], hidden: [] }).map((l) => l.id), ['a', 'b', 'c', 'd']);
assert.deepEqual(orderLists(lists, { order: ['c', 'a'], pinned: [], hidden: [] }).map((l) => l.id), ['c', 'a', 'b', 'd']);
assert.deepEqual(orderLists(lists, { order: ['c', 'a'], pinned: ['d', 'b'], hidden: [] }).map((l) => l.id), ['b', 'd', 'c', 'a']);

const text = listAsText({ name: 'Einkauf' }, [
  { uid: '1', summary: 'Milch', status: 'needs_action', due: null },
  { uid: '2', summary: 'Brot', status: 'completed', due: null },
  { uid: 'tmp-3', summary: 'Neu', status: 'needs_action', due: null },
  { uid: '4', summary: 'Eier', status: 'needs_action', due: '2099-01-01' },
]);
assert.ok(text.startsWith('Einkauf\n- Milch\n- Eier ('));
assert.ok(!text.includes('Brot') && !text.includes('Neu'));
assert.equal(listAsText({ name: 'X' }, []), '');
console.log('links, quickdates, orderLists, share: alle Tests bestanden');
