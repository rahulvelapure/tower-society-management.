// Shared maintenance-dues calculation - the ONE authoritative implementation.
// Used by the bill page, the admin dues table, the dashboard outstanding total,
// and Flat 360, so the same member can never show different amounts on
// different screens.
//
// FORMULA (unchanged legacy behaviour, documented here rather than altered):
// - monthDiff counts calendar-month boundaries only; the day of month is
//   ignored. A payment on Jan 31 followed by a view on Feb 1 counts as one
//   elapsed month.
// - A member with no payment yet owes from their account-creation month
//   INCLUSIVE (the "+ 1" below), i.e. joining in January means January is due.
// - totalMonth === 0 (paid this calendar month) yields a credit equal to one
//   monthly total, making the current bill's net payable 0.
// - totalMonth > 1 adds (totalMonth - 1) months of arrears on top of the
//   current month.

function monthDiff(dateFrom, dateTo) {
    return dateTo.getMonth() - dateFrom.getMonth() +
        (12 * (dateTo.getFullYear() - dateFrom.getFullYear()));
}

// Sum of the numeric charge heads configured on the society.
function computeMonthlyTotal(society) {
    if (!society || !society.maintenanceBill) return 0;
    const bill = typeof society.maintenanceBill.toObject === 'function'
        ? society.maintenanceBill.toObject()
        : society.maintenanceBill;
    return Object.values(bill)
        .filter(v => typeof v === 'number')
        .reduce((sum, v) => sum + v, 0);
}

// Dues position for one member. `member` needs createdAt and (optionally)
// lastPayment.date. Returns every intermediate the views display.
function computeDues(member, monthlyTotal, now = new Date()) {
    let totalMonth = 0;
    if (member.lastPayment && member.lastPayment.date) {
        totalMonth = monthDiff(member.lastPayment.date, now);
    } else {
        totalMonth = monthDiff(member.createdAt, now) + 1;
    }

    let credit = 0;
    let due = 0;
    if (totalMonth === 0) {
        credit = monthlyTotal;
    } else if (totalMonth > 1) {
        due = (totalMonth - 1) * monthlyTotal;
    }

    const totalAmount = monthlyTotal + due - credit;

    // Status: paid = nothing payable; overdue = carrying arrears beyond the
    // current month; due = only the current month is payable.
    let status = 'due';
    if (totalAmount <= 0) status = 'paid';
    else if (due > 0) status = 'overdue';

    return { totalMonth, credit, due, totalAmount, status };
}

module.exports = { monthDiff, computeMonthlyTotal, computeDues };
