// Helpers for Phase 3A-2 billing configuration. No Bill/Payment logic here -
// this is configuration + a non-persisted preview calculation only.

const { ChargeComponent } = require('../models/financeModels');
const { TOTAL_RESIDENTIAL_FLATS } = require('../models/unitModel');
const money = require('./money');

// The rate in effect as of `asOf` (default now): the rateHistory entry with
// the latest effectiveFrom that is <= asOf. Returns null if no rate has ever
// been set, or none is effective yet - callers must not assume a component
// always has a current rate.
function currentRate(component, asOf = new Date()) {
    const eligible = (component.rateHistory || [])
        .filter(r => r.effectiveFrom <= asOf)
        .sort((a, b) => b.effectiveFrom - a.effectiveFrom);
    return eligible.length ? eligible[0] : null;
}

// Only FIXED_PER_UNIT is calculable today without additional per-unit data or
// generation-time logic. PER_SQFT is excluded because Unit.areaSqft is not
// authoritative for all units yet (never fabricated); UNIT_SPECIFIC and
// MANUAL require per-unit input that doesn't exist until bill generation
// (3A-3) defines how it's collected.
function isAutoCalculable(component) {
    return component.calculationMethod === 'FIXED_PER_UNIT';
}

// Ephemeral estimate for a Billing Period - NOTHING here is persisted. Used
// only to show the admin what generation *would* produce, per the approved
// "preview before commit" requirement.
async function previewTotals(societyId, asOf = new Date()) {
    const components = await ChargeComponent.find({ society: societyId, active: true }).sort({ displayOrder: 1 });
    const unitCount = TOTAL_RESIDENTIAL_FLATS;

    const lines = components.map(c => {
        const rate = currentRate(c, asOf);
        const calculable = isAutoCalculable(c);
        return {
            code: c.code,
            name: c.name,
            calculationMethod: c.calculationMethod,
            calculable,
            hasRate: Boolean(rate),
            amountPaise: rate ? rate.amountPaise : null,
            perUnitFormatted: rate ? money.formatPaise(rate.amountPaise) : null,
            unitTotalPaise: (calculable && rate) ? rate.amountPaise * unitCount : null
        };
    });

    const estimableLines = lines.filter(l => l.calculable && l.hasRate);
    const excludedLines = lines.filter(l => !l.calculable || !l.hasRate);
    const perUnitPaise = estimableLines.reduce((s, l) => s + l.amountPaise, 0);
    const totalPaise = perUnitPaise * unitCount;

    return { unitCount, lines, estimableLines, excludedLines, perUnitPaise, totalPaise };
}

module.exports = { currentRate, isAutoCalculable, previewTotals };
