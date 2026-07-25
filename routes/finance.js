const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { BillingConfig, ChargeComponent, BillingPeriod, Bill } = require('../models/financeModels');
const society_collection = require('../models/societyModel');
const unit_collection = require('../models/unitModel');
const money = require('../lib/money');
const { financialYear } = require('../lib/counters');
const { previewTotals, currentRate } = require('../lib/financeConfig');
const billGen = require('../lib/billGeneration');
const audit = require('../lib/audit');
const { ensureAdmin, ensureSuperAdmin } = require('../middleware/auth');

async function getSociety(req) {
    if (req.user.society) {
        const s = await society_collection.Society.findById(req.user.society);
        if (s) return s;
    }
    return society_collection.getConfiguredSociety();
}

const CALC_METHODS = ['FIXED_PER_UNIT', 'PER_SQFT', 'UNIT_SPECIFIC', 'MANUAL'];
const CODE_RE = /^[A-Z0-9_]{2,20}$/;

// ===========================================================================
// BILLING CONFIGURATION  (view: any admin: superadmin+admin; edit: superadmin)
// ===========================================================================

router.get('/finance/config', ensureAdmin, async (req, res) => {
    try {
        const society = await getSociety(req);
        if (!society) return res.status(500).send('Society not configured');

        const [config, components] = await Promise.all([
            BillingConfig.findOne({ society: society._id }),
            ChargeComponent.find({ society: society._id }).sort({ displayOrder: 1, name: 1 })
        ]);

        res.render('financeConfig', {
            society, config, components, currentRate,
            legacyBill: society.maintenanceBill
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

router.get('/finance/config/edit', ensureSuperAdmin, async (req, res) => {
    try {
        const society = await getSociety(req);
        const config = society ? await BillingConfig.findOne({ society: society._id }) : null;
        res.render('financeConfigForm', { config, error: null });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

router.post('/finance/config', ensureSuperAdmin, async (req, res) => {
    try {
        const society = await getSociety(req);
        if (!society) return res.status(500).send('Society not configured');

        const rerender = (error) => res.render('financeConfigForm', { config: req.body, error });

        const issueDay = parseInt(req.body.defaultIssueDay, 10);
        const dueDay = parseInt(req.body.defaultDueDay, 10);
        if (!Number.isInteger(issueDay) || issueDay < 1 || issueDay > 28) {
            return rerender('Issue day must be between 1 and 28 (kept below 29 so every month is valid).');
        }
        if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) {
            return rerender('Due day must be between 1 and 28.');
        }
        if (dueDay < issueDay) {
            return rerender('Due day cannot be earlier than the issue day.');
        }
        const gracePeriodDays = parseInt(req.body.gracePeriodDays, 10) || 0;
        if (gracePeriodDays < 0) return rerender('Grace period cannot be negative.');
        if (!['MONTHLY', 'QUARTERLY'].includes(req.body.billingFrequency)) {
            return rerender('Please select a valid billing frequency.');
        }
        if (!['NONE', 'FIXED', 'PERCENTAGE'].includes(req.body.lateFeeType)) {
            return rerender('Please select a valid late fee type.');
        }
        if (!['NOT_DECIDED', 'ALLOW', 'DISALLOW'].includes(req.body.partialPaymentPolicy)) {
            return rerender('Please select a valid partial payment policy.');
        }
        if (!['NOT_DECIDED', 'OLDEST_DUE_FIRST', 'MANUAL_SELECTION', 'HYBRID'].includes(req.body.allocationPolicy)) {
            return rerender('Please select a valid allocation policy.');
        }
        const billPrefix = (req.body.billNumberPrefix || '').trim();
        const receiptPrefix = (req.body.receiptNumberPrefix || '').trim();
        if (!/^[A-Za-z0-9]{1,10}$/.test(billPrefix) || !/^[A-Za-z0-9]{1,10}$/.test(receiptPrefix)) {
            return rerender('Bill/receipt number prefixes must be 1-10 letters or digits.');
        }

        const update = {
            society: society._id,
            billingFrequency: req.body.billingFrequency,
            defaultIssueDay: issueDay,
            defaultDueDay: dueDay,
            gracePeriodDays,
            billNumberPrefix: billPrefix,
            receiptNumberPrefix: receiptPrefix,
            lateFeePolicy: { type: req.body.lateFeeType, value: Number(req.body.lateFeeValue) || 0 },
            partialPaymentPolicy: req.body.partialPaymentPolicy,
            allocationPolicy: req.body.allocationPolicy,
            updatedBy: req.user.id
        };

        const existing = await BillingConfig.findOne({ society: society._id });
        await BillingConfig.updateOne({ society: society._id }, { $set: update }, { upsert: true, runValidators: true });

        await audit.record({
            actor: req.user,
            action: existing ? 'BILLING_CONFIG_UPDATED' : 'BILLING_CONFIG_CREATED',
            entityType: 'BillingConfig', entityId: society._id,
            context: { billingFrequency: update.billingFrequency, defaultIssueDay: issueDay, defaultDueDay: dueDay }
        });

        res.redirect('/finance/config');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

// ---------------------------------------------------------------------------
// Charge components (superadmin only)
// ---------------------------------------------------------------------------

router.get('/finance/config/charges/new', ensureSuperAdmin, (req, res) => {
    res.render('chargeComponentForm', { component: null, error: null });
});

router.post('/finance/config/charges', ensureSuperAdmin, async (req, res) => {
    try {
        const society = await getSociety(req);
        if (!society) return res.status(500).send('Society not configured');

        const rerender = (error) => res.render('chargeComponentForm', { component: req.body, error });

        const code = (req.body.code || '').trim().toUpperCase();
        const name = (req.body.name || '').trim();
        if (!CODE_RE.test(code)) return rerender('Code must be 2-20 uppercase letters, digits, or underscores (e.g. MAINT, SINK_FUND).');
        if (!name) return rerender('Please enter a name.');
        if (!CALC_METHODS.includes(req.body.calculationMethod)) return rerender('Please select a valid calculation method.');

        let rateHistory = [];
        if (req.body.initialAmount) {
            let amountPaise;
            try {
                amountPaise = money.toPaise(req.body.initialAmount);
            } catch (e) {
                return rerender('Please enter a valid amount (e.g. 2171.50).');
            }
            rateHistory = [{ amountPaise, effectiveFrom: new Date(), setBy: req.user.id }];
        }

        const component = await ChargeComponent.create({
            society: society._id,
            code, name,
            description: (req.body.description || '').trim(),
            calculationMethod: req.body.calculationMethod,
            active: true,
            displayOrder: parseInt(req.body.displayOrder, 10) || 0,
            rateHistory,
            createdBy: req.user.id
        });

        await audit.record({
            actor: req.user, action: 'CHARGE_COMPONENT_CREATED', entityType: 'ChargeComponent', entityId: component._id,
            context: { code, name, calculationMethod: req.body.calculationMethod }
        });

        res.redirect('/finance/config');
    } catch (err) {
        if (err.code === 11000) {
            return res.render('chargeComponentForm', { component: req.body, error: 'A charge component with that code already exists.' });
        }
        console.error(err);
        res.status(500).send('Server error');
    }
});

router.get('/finance/config/charges/:id/edit', ensureSuperAdmin, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.redirect('/finance/config');
        const component = await ChargeComponent.findById(req.params.id);
        if (!component) return res.status(404).send('Not found');
        res.render('chargeComponentForm', { component, error: null, currentRate: currentRate(component) });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

// Update basic fields + (optionally) append a new rate - never overwrite an
// existing rateHistory entry, so any future Bill snapshot referencing the old
// value stays intact.
router.post('/finance/config/charges/:id', ensureSuperAdmin, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.redirect('/finance/config');
        const component = await ChargeComponent.findById(req.params.id);
        if (!component) return res.status(404).send('Not found');

        const rerender = (error) => res.render('chargeComponentForm', { component: { ...component.toObject(), ...req.body, _id: component._id }, error, currentRate: currentRate(component) });

        const name = (req.body.name || '').trim();
        if (!name) return rerender('Please enter a name.');
        if (!CALC_METHODS.includes(req.body.calculationMethod)) return rerender('Please select a valid calculation method.');

        component.name = name;
        component.description = (req.body.description || '').trim();
        component.calculationMethod = req.body.calculationMethod;
        component.displayOrder = parseInt(req.body.displayOrder, 10) || 0;

        let rateChanged = false;
        if (req.body.newAmount) {
            let amountPaise;
            try {
                amountPaise = money.toPaise(req.body.newAmount);
            } catch (e) {
                return rerender('Please enter a valid new amount (e.g. 2171.50).');
            }
            const effectiveFrom = req.body.effectiveFrom ? new Date(req.body.effectiveFrom) : new Date();
            if (isNaN(effectiveFrom.getTime())) return rerender('Please enter a valid effective date.');
            component.rateHistory.push({ amountPaise, effectiveFrom, setBy: req.user.id });
            rateChanged = true;
        }

        await component.save();

        await audit.record({
            actor: req.user, action: 'CHARGE_COMPONENT_UPDATED', entityType: 'ChargeComponent', entityId: component._id,
            context: { code: component.code, rateChanged }
        });

        res.redirect('/finance/config');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

router.post('/finance/config/charges/:id/deactivate', ensureSuperAdmin, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.redirect('/finance/config');
        const component = await ChargeComponent.findById(req.params.id);
        if (!component) return res.status(404).send('Not found');
        component.active = false;
        await component.save();
        await audit.record({
            actor: req.user, action: 'CHARGE_COMPONENT_DEACTIVATED', entityType: 'ChargeComponent', entityId: component._id,
            context: { code: component.code }
        });
        res.redirect('/finance/config');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

router.post('/finance/config/charges/:id/reactivate', ensureSuperAdmin, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.redirect('/finance/config');
        const component = await ChargeComponent.findById(req.params.id);
        if (!component) return res.status(404).send('Not found');
        component.active = true;
        await component.save();
        await audit.record({
            actor: req.user, action: 'CHARGE_COMPONENT_UPDATED', entityType: 'ChargeComponent', entityId: component._id,
            context: { code: component.code, reactivated: true }
        });
        res.redirect('/finance/config');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

// ===========================================================================
// BILLING PERIODS  (admin: create/view; superadmin: delete DRAFT)
// ===========================================================================

router.get('/finance/periods', ensureAdmin, async (req, res) => {
    try {
        const society = await getSociety(req);
        if (!society) return res.status(500).send('Society not configured');
        const periods = await BillingPeriod.find({ society: society._id }).sort({ periodStart: -1 });
        res.render('billingPeriods', { periods });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

router.get('/finance/periods/new', ensureAdmin, async (req, res) => {
    try {
        const society = await getSociety(req);
        const config = society ? await BillingConfig.findOne({ society: society._id }) : null;
        res.render('billingPeriodForm', { config, error: null, values: {} });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

router.post('/finance/periods', ensureAdmin, async (req, res) => {
    try {
        const society = await getSociety(req);
        if (!society) return res.status(500).send('Society not configured');
        const config = await BillingConfig.findOne({ society: society._id });

        const rerender = (error) => res.render('billingPeriodForm', { config, error, values: req.body });

        // req.body.month is an <input type="month"> value: "YYYY-MM"
        const m = /^(\d{4})-(\d{2})$/.exec(req.body.month || '');
        if (!m) return rerender('Please select a month.');
        const year = Number(m[1]);
        const month = Number(m[2]); // 1-12

        const periodStart = new Date(Date.UTC(year, month - 1, 1));
        // Last day of the selected month, correct for every month length incl. leap Feb.
        const periodEnd = new Date(Date.UTC(year, month, 0));

        const issueDay = config ? config.defaultIssueDay : 1;
        const dueDay = config ? config.defaultDueDay : 15;
        const issueDate = req.body.issueDate ? new Date(req.body.issueDate) : new Date(Date.UTC(year, month - 1, Math.min(issueDay, 28)));
        const dueDate = req.body.dueDate ? new Date(req.body.dueDate) : new Date(Date.UTC(year, month - 1, Math.min(dueDay, 28)));
        if (isNaN(issueDate.getTime()) || isNaN(dueDate.getTime())) return rerender('Please enter valid issue/due dates.');
        if (dueDate < issueDate) return rerender('Due date cannot be before the issue date.');

        // Overlap check: catches any conflicting range, not just an identical
        // periodStart (the unique index below only catches the exact-match case).
        const overlapping = await BillingPeriod.findOne({
            society: society._id,
            periodStart: { $lte: periodEnd },
            periodEnd: { $gte: periodStart }
        });
        if (overlapping) {
            return rerender(`This range overlaps an existing period: "${overlapping.name}".`);
        }

        const name = (req.body.name || '').trim() || periodStart.toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

        let period;
        try {
            period = await BillingPeriod.create({
                society: society._id, name, periodStart, periodEnd, issueDate, dueDate,
                status: 'DRAFT', createdBy: req.user.id
            });
        } catch (err) {
            if (err.code === 11000) return rerender(`A period starting on the same date already exists.`);
            throw err;
        }

        await audit.record({
            actor: req.user, action: 'BILLING_PERIOD_CREATED', entityType: 'BillingPeriod', entityId: period._id,
            context: { name, periodStart, periodEnd }
        });

        res.redirect(`/finance/periods/${period._id}`);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

router.get('/finance/periods/:id', ensureAdmin, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.redirect('/finance/periods');
        const period = await BillingPeriod.findById(req.params.id);
        if (!period) return res.status(404).send('Not found');

        // Ephemeral estimate only - never persisted (see lib/financeConfig.js).
        const preview = await previewTotals(period.society, period.periodStart);
        const billCount = await Bill.countDocuments({ period: period._id });

        res.render('billingPeriodDetail', { period, preview, fy: financialYear(period.periodStart), billCount });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

router.post('/finance/periods/:id', ensureAdmin, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.redirect('/finance/periods');
        const period = await BillingPeriod.findById(req.params.id);
        if (!period) return res.status(404).send('Not found');
        if (period.status !== 'DRAFT') return res.redirect(`/finance/periods/${period._id}`); // only DRAFT is editable

        const issueDate = new Date(req.body.issueDate);
        const dueDate = new Date(req.body.dueDate);
        if (isNaN(issueDate.getTime()) || isNaN(dueDate.getTime())) {
            const preview = await previewTotals(period.society, period.periodStart);
            return res.render('billingPeriodDetail', {
                period, preview, fy: financialYear(period.periodStart),
                billCount: 0, error: 'Please enter valid issue/due dates.'
            });
        }
        if (dueDate < issueDate) {
            const preview = await previewTotals(period.society, period.periodStart);
            return res.render('billingPeriodDetail', {
                period, preview, fy: financialYear(period.periodStart),
                billCount: 0, error: 'Due date cannot be before the issue date.'
            });
        }

        period.issueDate = issueDate;
        period.dueDate = dueDate;
        await period.save();

        await audit.record({
            actor: req.user, action: 'BILLING_PERIOD_UPDATED', entityType: 'BillingPeriod', entityId: period._id,
            context: { issueDate, dueDate }
        });

        res.redirect(`/finance/periods/${period._id}`);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

// Delete a DRAFT period. Restricted to superadmin (destructive), and only
// ever possible while status is DRAFT with zero Bills - which, in 3A-2, is
// every period, since bill generation does not exist yet.
router.post('/finance/periods/:id/delete', ensureSuperAdmin, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.redirect('/finance/periods');
        const period = await BillingPeriod.findById(req.params.id);
        if (!period) return res.redirect('/finance/periods');
        if (period.status !== 'DRAFT') return res.redirect(`/finance/periods/${period._id}`);
        const billCount = await Bill.countDocuments({ period: period._id });
        if (billCount > 0) return res.redirect(`/finance/periods/${period._id}`); // never delete a period with financial activity

        await BillingPeriod.deleteOne({ _id: period._id });

        await audit.record({
            actor: req.user, action: 'BILLING_PERIOD_STATUS_CHANGED', entityType: 'BillingPeriod', entityId: period._id,
            context: { name: period.name, from: 'DRAFT', to: 'DELETED' }
        });

        res.redirect('/finance/periods');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

// ===========================================================================
// PHASE 3A-3: BILL GENERATION WORKFLOW
// ===========================================================================

// Preview: show what bills WOULD be generated (ephemeral, never persisted)
router.get('/finance/periods/:id/preview', ensureAdmin, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.redirect('/finance/periods');
        const period = await BillingPeriod.findById(req.params.id);
        if (!period) return res.status(404).send('Not found');

        const preview = await billGen.previewBillGeneration(period.society, period._id);
        const fy = financialYear(period.periodStart);

        res.render('billingPeriodPreview', { period, fy, preview });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

// Generate DRAFT bills for a period (idempotent via unique {unit, period} index)
router.post('/finance/periods/:id/generate', ensureAdmin, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.redirect('/finance/periods');
        const period = await BillingPeriod.findById(req.params.id);
        if (!period) return res.status(404).send('Not found');
        if (period.status !== 'DRAFT') {
            return res.redirect(`/finance/periods/${period._id}?error=Period must be DRAFT to generate bills`);
        }

        const result = await billGen.generateDraftBills(period.society, period._id, req.user.id);

        if (result.created > 0 || result.skipped > 0) {
            await audit.record({
                actor: req.user,
                action: 'BILLS_DRAFT_GENERATED',
                entityType: 'BillingPeriod',
                entityId: period._id,
                context: { created: result.created, skipped: result.skipped, errors: result.errors.length }
            });
        }

        res.redirect(`/finance/periods/${period._id}/bills?generated=${result.created}`);
    } catch (err) {
        console.error(err);
        res.status(500).send(`Generation failed: ${err.message}`);
    }
});

// Review generated DRAFT bills for a period (admin/superadmin only)
router.get('/finance/periods/:id/bills', ensureAdmin, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.redirect('/finance/periods');
        const period = await BillingPeriod.findById(req.params.id);
        if (!period) return res.status(404).send('Not found');

        const bills = await Bill
            .find({ period: period._id })
            .populate('unit')
            .sort({ 'unit.floor': 1, 'unit.flatNumber': 1 });

        const fy = financialYear(period.periodStart);
        const generated = req.query.generated ? parseInt(req.query.generated, 10) : 0;
        const totalBilledPaise = bills.reduce((sum, b) => sum + b.totalPaise, 0);

        res.render('billsReview', { period, bills, fy, totalBilledPaise, generated });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

// Issue bills: transition DRAFT→ISSUED with bill numbers (SUPERADMIN ONLY)
router.post('/finance/periods/:id/issue', ensureSuperAdmin, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.redirect('/finance/periods');
        const period = await BillingPeriod.findById(req.params.id);
        if (!period) return res.status(404).send('Not found');
        if (period.status !== 'DRAFT') {
            return res.redirect(`/finance/periods/${period._id}?error=Period must be DRAFT to issue bills`);
        }

        const draftCount = await Bill.countDocuments({ period: period._id, status: 'DRAFT' });
        if (draftCount === 0) {
            return res.redirect(`/finance/periods/${period._id}?error=No DRAFT bills to issue`);
        }

        const result = await billGen.issueBillsForPeriod(period.society, period._id, req.user.id);

        await audit.record({
            actor: req.user,
            action: 'BILLS_ISSUED',
            entityType: 'BillingPeriod',
            entityId: period._id,
            context: { billsIssued: result.issuedBills.length, totalBilledPaise: result.totalBilledPaise }
        });

        res.redirect(`/finance/periods/${period._id}?issued=${result.issued}`);
    } catch (err) {
        console.error(err);
        res.status(500).send(`Issuance failed: ${err.message}`);
    }
});

// ===========================================================================
// BILLS REGISTER (admin/superadmin view of all bills)
// ===========================================================================

router.get('/finance/bills', ensureAdmin, async (req, res) => {
    try {
        const society = await getSociety(req);
        if (!society) return res.status(500).send('Society not configured');

        const filters = {};
        if (req.query.status) {
            if (['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID'].includes(req.query.status)) {
                filters.status = req.query.status;
            }
        }

        const bills = await Bill
            .find({ society: society._id, ...filters })
            .populate('unit')
            .populate('period')
            .sort({ createdAt: -1 });

        const summaryByStatus = {};
        bills.forEach(b => {
            summaryByStatus[b.status] = (summaryByStatus[b.status] || 0) + 1;
        });

        res.render('billsRegister', { bills, summaryByStatus, selectedStatus: req.query.status || 'ISSUED' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

// ===========================================================================
// RESIDENT BILL VIEWS (authorization-enforced: can only see own unit's ISSUED bills)
// ===========================================================================

// Resident's own bill list (ISSUED bills only for their unit)
router.get('/bill', async (req, res) => {
    try {
        if (!req.user) return res.redirect('/login');
        if (!req.user.unit) {
            return res.render('residentHome', {
                message: 'Your unit has not been assigned yet. Please contact administration.'
            });
        }

        const bills = await Bill
            .find({ unit: req.user.unit, status: { $in: ['ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'] } })
            .populate('period')
            .sort({ issueDate: -1 });

        res.render('residentBills', { bills });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

// Resident view a specific bill detail (authorization-enforced)
router.get('/bill/:id', async (req, res) => {
    try {
        if (!req.user) return res.redirect('/login');
        if (!req.user.unit) return res.status(403).send('Unit not assigned');
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).send('Not found');

        const bill = await Bill
            .findById(req.params.id)
            .populate('unit')
            .populate('period');

        if (!bill) return res.status(404).send('Bill not found');

        // CRITICAL: Enforce authorization - resident can only see their own unit's ISSUED bills
        if (String(bill.unit._id) !== String(req.user.unit)) {
            return res.status(403).send('You do not have access to this bill');
        }
        if (bill.status === 'DRAFT') {
            return res.status(403).send('This bill is not yet issued');
        }

        res.render('residentBillDetail', { bill });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

module.exports = router;
