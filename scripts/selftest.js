// Pure-function self-tests for the financial foundation and role logic.
// No database, no network - safe to run anywhere:  node scripts/selftest.js
// Exits non-zero on first failure.

const assert = require('assert');
const money = require('../lib/money');
const billing = require('../lib/billing');
const { financialYear } = require('../lib/counters');
const roles = require('../lib/roles');

let passed = 0;
function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  ok - ${name}`);
    } catch (err) {
        console.error(`FAIL - ${name}: ${err.message}`);
        process.exit(1);
    }
}

console.log('money:');
test('toPaise converts rupees to integer paise', () => {
    assert.strictEqual(money.toPaise(2171.5), 217150);
    assert.strictEqual(money.toPaise('100'), 10000);
    assert.strictEqual(money.toPaise(0), 0);
});
test('toPaise rejects invalid amounts', () => {
    assert.throws(() => money.toPaise(-5));
    assert.throws(() => money.toPaise('abc'));
    assert.throws(() => money.toPaise(NaN));
});
test('formatPaise formats en-IN', () => {
    assert.strictEqual(money.formatPaise(217150), '₹2,171.50');
    assert.strictEqual(money.formatPaise(600000), '₹6,000');
});
test('assertPaise rejects floats', () => {
    assert.throws(() => money.assertPaise(10.5));
    assert.strictEqual(money.assertPaise(1050), 1050);
});

console.log('billing (legacy formula - behaviour must NOT change):');
const monthly = 2171;
test('paid this month -> credit, zero payable', () => {
    const now = new Date('2026-07-15');
    const d = billing.computeDues({ lastPayment: { date: new Date('2026-07-02') }, createdAt: new Date('2026-01-01') }, monthly, now);
    assert.strictEqual(d.totalAmount, 0);
    assert.strictEqual(d.status, 'paid');
});
test('one month since payment -> current month due only', () => {
    const now = new Date('2026-07-15');
    const d = billing.computeDues({ lastPayment: { date: new Date('2026-06-20') }, createdAt: new Date('2026-01-01') }, monthly, now);
    assert.strictEqual(d.totalAmount, monthly);
    assert.strictEqual(d.status, 'due');
});
test('three months since payment -> arrears + overdue', () => {
    const now = new Date('2026-07-15');
    const d = billing.computeDues({ lastPayment: { date: new Date('2026-04-10') }, createdAt: new Date('2026-01-01') }, monthly, now);
    assert.strictEqual(d.totalAmount, 3 * monthly);
    assert.strictEqual(d.status, 'overdue');
});
test('no payment ever -> joining month inclusive', () => {
    const now = new Date('2026-07-15');
    const d = billing.computeDues({ lastPayment: {}, createdAt: new Date('2026-06-01') }, monthly, now);
    assert.strictEqual(d.totalAmount, 2 * monthly); // June + July
});
test('month boundary quirk documented: day-of-month ignored', () => {
    const d = billing.computeDues({ lastPayment: { date: new Date('2026-01-31') }, createdAt: new Date('2025-01-01') }, monthly, new Date('2026-02-01'));
    assert.strictEqual(d.totalMonth, 1);
});

console.log('financial year (April-March):');
test('May 2026 -> 2026-27', () => assert.strictEqual(financialYear(new Date('2026-05-10')), '2026-27'));
test('Feb 2026 -> 2025-26', () => assert.strictEqual(financialYear(new Date('2026-02-10')), '2025-26'));
test('April 1 boundary', () => assert.strictEqual(financialYear(new Date('2026-04-01')), '2026-27'));
test('March 31 boundary', () => assert.strictEqual(financialYear(new Date('2026-03-31')), '2025-26'));

console.log('roles:');
test('stored role wins', () => {
    assert.strictEqual(roles.effectiveRole({ role: 'admin', isAdmin: false }), 'admin');
    assert.strictEqual(roles.effectiveRole({ role: 'member', isAdmin: true }), 'member');
});
test('legacy fallback: isAdmin without role -> superadmin', () => {
    assert.strictEqual(roles.effectiveRole({ isAdmin: true }), 'superadmin');
    assert.strictEqual(roles.effectiveRole({ isAdmin: false }), 'member');
});
test('isAdminRole covers admin + superadmin only', () => {
    assert.ok(roles.isAdminRole({ role: 'admin' }));
    assert.ok(roles.isAdminRole({ role: 'superadmin' }));
    assert.ok(!roles.isAdminRole({ role: 'member' }));
});
test('isSuperAdmin excludes plain admin', () => {
    assert.ok(roles.isSuperAdmin({ role: 'superadmin' }));
    assert.ok(!roles.isSuperAdmin({ role: 'admin' }));
});

console.log(`\n${passed} checks passed.`);
