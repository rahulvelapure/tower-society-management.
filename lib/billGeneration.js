// Phase 3A-3 bill generation logic - UNIT-CENTRIC
// Handles preview, draft generation, and issue workflows.

const { BillingPeriod, ChargeComponent, Bill } = require('../models/financeModels');
const { currentRate, isAutoCalculable } = require('./financeConfig');
const unit_collection = require('../models/unitModel');
const money = require('./money');

// For a given charge component, determine which units it applies to.
// IMPORTANT: This is where charge applicability rules are enforced.
// FIXED_PER_UNIT: applies to all 112 residential units.
// PER_SQFT: blocked (Unit.areaSqft not authoritative).
// UNIT_SPECIFIC: blocked (no per-unit config exists yet).
// MANUAL: blocked (requires generation-time per-unit input).
async function chargeAppliesToUnits(component, periodStart) {
  if (!isAutoCalculable(component)) {
    // PER_SQFT, UNIT_SPECIFIC, MANUAL - cannot auto-apply
    return [];
  }

  if (component.calculationMethod === 'FIXED_PER_UNIT') {
    // Applies to all 112 residential units
    const units = await unit_collection.Unit
      .find({ floor: { $gte: 1, $lte: 28 } }) // residential floors only
      .select('_id flatNumber');
    return units;
  }

  return [];
}

// Generate line items for a single unit, given a billing period and active charges.
// Returns array of { code, label, amountPaise }.
// Non-applicable charges are silently skipped (no error).
async function generateUnitLineItems(unit, period, chargeComponents) {
  const lineItems = [];

  for (const component of chargeComponents) {
    const rate = currentRate(component, period.periodStart);
    if (!rate) continue; // No rate set yet - skip

    const applicableUnits = await chargeAppliesToUnits(component, period.periodStart);
    const applies = applicableUnits.some(u => String(u._id) === String(unit._id));

    if (applies) {
      lineItems.push({
        code: component.code,
        label: component.name,
        amountPaise: rate.amountPaise
      });
    }
  }

  return lineItems;
}

// Compute totals for a line-item array.
function computeTotals(lineItems) {
  const subtotalPaise = lineItems.reduce((sum, line) => sum + line.amountPaise, 0);
  return {
    subtotalPaise,
    adjustmentPaise: 0, // no adjustments on generation
    lateFeePaise: 0,    // reserved, never auto-applied
    totalPaise: subtotalPaise
  };
}

// Preview what bills WOULD be generated for a period (ephemeral, never persisted).
// Returns: { unitCount, totalBilledPaise, perUnitAnalysis: [{unit, lineItems, totals, issues}], warnings: [] }
async function previewBillGeneration(societyId, periodId) {
  const period = await BillingPeriod.findById(periodId).lean();
  if (!period) throw new Error('Billing period not found');

  const components = await ChargeComponent
    .find({ society: societyId, active: true })
    .sort({ displayOrder: 1 });

  const residentialUnits = await unit_collection.Unit
    .find({ society: societyId, floor: { $gte: 1, $lte: 28 } })
    .sort({ floor: 1, flatNumber: 1 });

  const perUnitAnalysis = [];
  let totalBilledPaise = 0;
  const warnings = [];

  for (const unit of residentialUnits) {
    let lineItems = [];
    let issues = [];

    try {
      lineItems = await generateUnitLineItems(unit, period, components);
    } catch (err) {
      issues.push(`Error generating charges: ${err.message}`);
    }

    if (lineItems.length === 0) {
      issues.push('No active charges configured');
    }

    const { subtotalPaise, totalPaise } = computeTotals(lineItems);
    totalBilledPaise += totalPaise;

    perUnitAnalysis.push({
      unit: { _id: unit._id, flatNumber: unit.flatNumber, floor: unit.floor },
      lineItems,
      subtotalPaise,
      totalPaise,
      issues
    });
  }

  if (warnings.length === 0 && perUnitAnalysis.every(u => u.issues.length === 0)) {
    warnings.push('All units ready for billing');
  }

  return {
    period: { _id: period._id, name: period.name, issueDate: period.issueDate, dueDate: period.dueDate },
    unitCount: residentialUnits.length,
    totalBilledPaise,
    perUnitAnalysis,
    warnings
  };
}

// Generate DRAFT Bills for a period.
// Uses unique {unit, period} index to ensure idempotency.
// Returns { created: number, skipped: number, errors: [] }
async function generateDraftBills(societyId, periodId, userId) {
  const period = await BillingPeriod.findById(periodId);
  if (!period) throw new Error('Billing period not found');
  if (period.status !== 'DRAFT') throw new Error('Period must be in DRAFT status to generate bills');

  const components = await ChargeComponent
    .find({ society: societyId, active: true })
    .sort({ displayOrder: 1 });

  const residentialUnits = await unit_collection.Unit
    .find({ society: societyId, floor: { $gte: 1, $lte: 28 } })
    .sort({ floor: 1, flatNumber: 1 });

  const results = { created: 0, skipped: 0, errors: [] };

  for (const unit of residentialUnits) {
    try {
      const lineItems = await generateUnitLineItems(unit, period, components);

      if (lineItems.length === 0) {
        results.skipped++;
        continue;
      }

      const { subtotalPaise, adjustmentPaise, lateFeePaise, totalPaise } = computeTotals(lineItems);

      // Unique index on {unit, period} makes this idempotent - repeated calls
      // will either find the existing bill or insert a new one, never duplicate.
      const bill = await Bill.findOneAndUpdate(
        { unit: unit._id, period: period._id },
        {
          $setOnInsert: {
            society: societyId,
            unit: unit._id,
            period: period._id,
            status: 'DRAFT',
            lineItems,
            subtotalPaise,
            adjustmentPaise,
            lateFeePaise,
            totalPaise,
            paidPaise: 0,
            createdBy: userId
          }
        },
        { upsert: true, new: true }
      );

      if (bill.isNew) {
        results.created++;
      } else {
        results.skipped++; // Already existed
      }
    } catch (err) {
      results.errors.push({ unit: unit.flatNumber, error: err.message });
    }
  }

  return results;
}

// Issue Bills for a period - transition DRAFT→ISSUED with bill numbers.
// This is the SUPERADMIN-only authoritative action that creates resident debt.
// Must be atomic-safe with counters.
async function issueBillsForPeriod(societyId, periodId, userId) {
  const period = await BillingPeriod.findById(periodId);
  if (!period) throw new Error('Billing period not found');
  if (period.status !== 'DRAFT') throw new Error('Period must be DRAFT to issue');

  // Find all DRAFT bills for this period
  const draftBills = await Bill.find({ period: period._id, status: 'DRAFT' });
  if (draftBills.length === 0) throw new Error('No DRAFT bills to issue');

  // Assign bill numbers and update status
  const { nextBillNumber } = require('./counters');
  const issueDate = new Date();
  const issued = [];

  for (const bill of draftBills) {
    const billNumber = await nextBillNumber(issueDate);
    bill.billNumber = billNumber;
    bill.issueDate = issueDate;
    bill.status = 'ISSUED';
    await bill.save();
    issued.push({ _id: bill._id, billNumber });
  }

  // Update period status
  const totalBilledPaise = draftBills.reduce((s, b) => s + b.totalPaise, 0);
  period.status = 'ISSUED';
  period.totals = { unitCount: draftBills.length, billedPaise: totalBilledPaise };
  await period.save();

  return { issued: issued.length, issuedBills: issued, totalBilledPaise };
}

module.exports = {
  chargeAppliesToUnits,
  generateUnitLineItems,
  computeTotals,
  previewBillGeneration,
  generateDraftBills,
  issueBillsForPeriod
};
