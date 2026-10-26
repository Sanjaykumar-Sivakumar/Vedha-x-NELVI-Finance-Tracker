const assert = require('node:assert/strict');
const f = require('../finance-utils.js');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`✓ ${name}`); }

test('paise conversion avoids common floating-point addition drift', () => {
  assert.equal(f.toPaise(0.1) + f.toPaise(0.2), 30);
  assert.equal(f.fromPaise(f.toPaise('1234567.89')), 1234567.89);
});
test('sumRupees totals in integer paise and honours the predicate', () => {
  const rows = [{ amount: '0.10', status: 'verified' }, { amount: '0.20', status: 'verified' }, { amount: '0.99', status: 'pending' }];
  assert.equal(f.sumRupees(rows, x => x.status === 'verified'), 0.3);
  assert.equal(f.sumRupees(rows), 1.29);
});
test('INR formatter consistently shows paise', () => {
  assert.equal(f.formatRupees(1234567.89), '₹12,34,567.89');
  assert.equal(f.formatRupees(-0.5), '-₹0.50');
});
test('percentage handles zero and invalid denominators safely', () => {
  assert.equal(f.percentage(1, 0), 0);
  assert.equal(f.percentage(10, 40), 25);
});
test('top spending breakdown preserves the complete total with an Other slice', () => {
  const entries = [{category:'Rent',amount:50},{category:'Stock',amount:25},{category:'Travel',amount:15},{category:'Power',amount:5},{category:'Tools',amount:3},{category:'Other A',amount:1},{category:'Other B',amount:1}];
  const b = f.topCategoriesWithOther(entries, 5);
  assert.equal(b.total, 100);
  assert.equal(b.items.length, 6);
  assert.equal(b.items[5].category, 'Other (2 categories)');
  assert.equal(b.items.reduce((sum,x) => sum + f.toPaise(x.amount), 0), 10000);
  assert.equal(b.items.reduce((sum,x) => sum + f.percentage(x.amount,b.total,6), 0), 100);
});
test('single leftover category is labelled grammatically', () => {
  const b = f.topCategoriesWithOther([{category:'A',amount:10},{category:'B',amount:9},{category:'C',amount:8}], 2);
  assert.equal(b.items[2].category, 'Other (1 category)');
});
test('month key uses ISO transaction date without UTC month shift', () => {
  assert.equal(f.monthKey('2026-01-01T00:00:00.000Z'), '2026-01');
  assert.equal(f.monthKey('2026-12-31'), '2026-12');
  assert.equal(f.monthKey('not a date'), '');
});
test('CSV values beginning with formula markers are neutralized', () => {
  for (const value of ['=1+1', '+SUM(A1:A2)', '-cmd', '@calc', '\t=cmd']) assert.ok(f.safeSpreadsheetText(value).startsWith("'"));
  assert.equal(f.toCSVCell('hello "world"'), '"hello ""world"""');
});
test('recent items sort newest-first with stable fallback', () => {
  const result = f.sortNewest([{id:'old',createdAt:'2026-01-01',date:'2026-01-01'},{id:'new',createdAt:'2026-03-01',date:'2026-03-01'},{id:'middle',date:'2026-02-01'}]);
  assert.deepEqual(result.map(x => x.id), ['new','middle','old']);
});
console.log(`\n${passed} finance utility tests passed.`);
