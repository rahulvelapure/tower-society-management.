// Money helpers - ALL new Phase 3 financial amounts are INTEGER PAISE.
// ₹2,171.50 -> 217150. Never store float rupees in new financial records.

// Convert a rupee amount (number or numeric string) to integer paise.
// Throws on anything that isn't a finite non-negative amount.
function toPaise(rupees) {
    const n = Number(rupees);
    if (!Number.isFinite(n) || n < 0) {
        throw new Error(`Invalid rupee amount: ${rupees}`);
    }
    return Math.round(n * 100);
}

function paiseToRupees(paise) {
    assertPaise(paise);
    return paise / 100;
}

// "₹2,171.50" (en-IN grouping); whole rupees shown without decimals.
function formatPaise(paise) {
    assertPaise(paise);
    const rupees = paise / 100;
    const opts = paise % 100 === 0
        ? { maximumFractionDigits: 0 }
        : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    return '₹' + rupees.toLocaleString('en-IN', opts);
}

// Validation guard for authoritative writes.
function assertPaise(paise) {
    if (!Number.isInteger(paise)) {
        throw new Error(`Amount must be integer paise, got: ${paise}`);
    }
    return paise;
}

module.exports = { toPaise, paiseToRupees, formatPaise, assertPaise };
