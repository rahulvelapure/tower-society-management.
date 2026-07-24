// Atomic document numbering. findOneAndUpdate + $inc is atomic in MongoDB, so
// concurrent generation can never hand out the same number. Gaps are tolerated
// (a failed generation may skip a number) - numbers are unique and monotonic,
// which is what an audit needs. VOIDed documents keep their number forever.
//
// NOTE: number FORMATS below are the architecture-proposed defaults
// ("27E/2026-27/000123", "REC/2026-27/000456"). They are not exercised in
// production until bill issuing (3A-3) / receipts (3A-7), and remain
// approval-gated business decisions until then.

const { Counter } = require('../models/financeModels');

// Indian financial year: April 1 - March 31. May 2026 -> "2026-27"; Feb 2026 -> "2025-26".
function financialYear(date = new Date()) {
    const y = date.getFullYear();
    const startYear = date.getMonth() >= 3 ? y : y - 1; // month 3 = April
    return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

async function nextSequence(kind, fy = financialYear()) {
    const doc = await Counter.findOneAndUpdate(
        { _id: `${kind}:${fy}` },
        { $inc: { seq: 1 } },
        { upsert: true, new: true }
    );
    return doc.seq;
}

async function nextBillNumber(date = new Date()) {
    const fy = financialYear(date);
    const seq = await nextSequence('bill', fy);
    return `27E/${fy}/${String(seq).padStart(6, '0')}`;
}

async function nextReceiptNumber(date = new Date()) {
    const fy = financialYear(date);
    const seq = await nextSequence('receipt', fy);
    return `REC/${fy}/${String(seq).padStart(6, '0')}`;
}

module.exports = { financialYear, nextSequence, nextBillNumber, nextReceiptNumber };
