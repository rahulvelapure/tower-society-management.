// Phase 3A-1 financial foundation - collections per PHASE_3_BILLING_ARCHITECTURE.md.
// All amounts are INTEGER PAISE (lib/money.js). These models are ADDITIVE:
// nothing here reads or writes legacy fields (User.lastPayment, makePayment,
// Society.maintenanceBill), no documents are created at startup, and no bill
// generation exists yet (that is 3A-3).

const mongoose = require('mongoose');
const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;

const paise = { type: Number, validate: { validator: Number.isInteger, message: 'Amount must be integer paise' } };
const requiredPaise = { ...paise, required: true };

// ---------------------------------------------------------------------------
// BillingPeriod - explicit periods replace month-diff arithmetic post-cutover.
// ---------------------------------------------------------------------------
const billingPeriodSchema = new Schema({
    society: { type: ObjectId, ref: 'society', required: true },
    name: { type: String, required: true },              // "July 2026"
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    issueDate: Date,
    dueDate: Date,
    status: { type: String, enum: ['DRAFT', 'GENERATED', 'ISSUED', 'CLOSED'], default: 'DRAFT' },
    chargeSnapshot: [{ code: String, label: String, amountPaise: paise, basis: String }],
    totals: { unitCount: Number, billedPaise: paise },
    createdBy: { type: ObjectId, ref: 'User' }
}, { timestamps: true });
billingPeriodSchema.index({ society: 1, periodStart: 1 }, { unique: true }); // one July 2026, ever

// ---------------------------------------------------------------------------
// Bill - UNIT-centric. One authoritative bill per unit per period.
// ---------------------------------------------------------------------------
const billSchema = new Schema({
    society: { type: ObjectId, ref: 'society', required: true },
    unit: { type: ObjectId, ref: 'unit', required: true },
    period: { type: ObjectId, ref: 'billingperiod', required: true },
    billNumber: { type: String },                        // assigned at ISSUE via counters
    issueDate: Date,
    dueDate: Date,
    lineItems: [{ code: String, label: String, amountPaise: paise }],
    subtotalPaise: requiredPaise,
    adjustmentPaise: { ...paise, default: 0 },           // signed
    lateFeePaise: { ...paise, default: 0 },              // reserved - no formula until approved
    totalPaise: requiredPaise,
    paidPaise: { ...paise, default: 0 },                 // denormalized from allocations, recomputed only
    status: { type: String, enum: ['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID'], default: 'DRAFT' },
    voidReason: String,
    voidedBy: { type: ObjectId, ref: 'User' },
    voidedAt: Date,
    openingBalance: { type: Boolean, default: false },   // true only for the 3A-9 cutover bill
    createdBy: { type: ObjectId, ref: 'User' }
}, { timestamps: true });
billSchema.index({ unit: 1, period: 1 }, { unique: true });      // idempotent generation
billSchema.index({ billNumber: 1 }, { unique: true, sparse: true }); // sparse: DRAFTs have no number yet
billSchema.index({ unit: 1, issueDate: 1 });
billSchema.index({ status: 1 });

// ---------------------------------------------------------------------------
// Payment - immutable transaction history. SUCCEEDED payments are never
// edited or deleted; corrections happen via reversal/adjustment records.
// ---------------------------------------------------------------------------
const paymentSchema = new Schema({
    society: { type: ObjectId, ref: 'society', required: true },
    unit: { type: ObjectId, ref: 'unit' },               // nullable: legacy-era payers may lack a unit link
    payer: { type: ObjectId, ref: 'User' },
    amountPaise: requiredPaise,
    paidAt: { type: Date, required: true },
    method: { type: String, enum: ['ONLINE', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'CASH'], required: true },
    provider: { type: String, enum: ['stripe', 'manual'], required: true },
    providerRef: { type: String, required: true },       // Checkout Session id / cheque no / UTR
    status: { type: String, enum: ['PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'], required: true },
    allocations: [{ bill: { type: ObjectId, ref: 'bill' }, billNumber: String, amountPaise: paise }],
    unallocatedPaise: { ...paise, default: 0 },
    // TRANSITION MARKER: true while the legacy dues system is live - this
    // payment's authoritative dues effect was applied to User.lastPayment, and
    // this row is history/audit only. Prevents double-counting at 3A-9 cutover.
    legacyEffect: { type: Boolean, default: false },
    notes: String,
    recordedBy: { type: ObjectId, ref: 'User' },         // admin, for manual payments
    verifiedAt: Date
}, { timestamps: true });
paymentSchema.index({ provider: 1, providerRef: 1 }, { unique: true }); // same Stripe session can never record twice
paymentSchema.index({ unit: 1, paidAt: 1 });

// ---------------------------------------------------------------------------
// Receipt - generated ONLY from a SUCCEEDED payment; snapshot frozen forever.
// ---------------------------------------------------------------------------
const receiptSchema = new Schema({
    receiptNumber: { type: String, required: true },
    society: { type: ObjectId, ref: 'society', required: true },
    unit: { type: ObjectId, ref: 'unit' },
    payment: { type: ObjectId, ref: 'payment', required: true },
    snapshot: {
        flatNumber: String,
        payerName: String,
        amountPaise: paise,
        method: String,
        providerRef: String,
        allocations: [{ billNumber: String, amountPaise: paise }],
        societyName: String,
        address: String,
        date: Date
    }
}, { timestamps: true });
receiptSchema.index({ receiptNumber: 1 }, { unique: true });
receiptSchema.index({ payment: 1 }, { unique: true });   // one receipt per payment

// ---------------------------------------------------------------------------
// Adjustment - append-only admin credits/debits. Wrong entry -> reversing
// entry, never edit/delete.
// ---------------------------------------------------------------------------
const adjustmentSchema = new Schema({
    society: { type: ObjectId, ref: 'society', required: true },
    unit: { type: ObjectId, ref: 'unit', required: true },
    bill: { type: ObjectId, ref: 'bill' },               // nullable: unit-level credit/debit
    type: { type: String, enum: ['CREDIT', 'DEBIT', 'WAIVER', 'CORRECTION', 'OPENING_BALANCE'], required: true },
    amountPaise: requiredPaise,                          // positive; type carries direction
    reason: { type: String, required: true },
    createdBy: { type: ObjectId, ref: 'User', required: true }
}, { timestamps: true });
adjustmentSchema.index({ unit: 1, createdAt: 1 });

// ---------------------------------------------------------------------------
// Counter - atomic numbering ($inc upsert). _id e.g. "bill:2026-27".
// ---------------------------------------------------------------------------
const counterSchema = new Schema({
    _id: String,
    seq: { type: Number, default: 0 }
});

// ---------------------------------------------------------------------------
// StripeEvent - webhook replay safety (unique event id).
// ---------------------------------------------------------------------------
const stripeEventSchema = new Schema({
    eventId: { type: String, required: true },
    type: String,
    receivedAt: { type: Date, default: Date.now },
    processedAt: Date,
    outcome: String
});
stripeEventSchema.index({ eventId: 1 }, { unique: true });

// ---------------------------------------------------------------------------
// AuditLog - append-only, privileged + financial actions. Never stores
// secrets, tokens, passwords, or card data.
// ---------------------------------------------------------------------------
const auditLogSchema = new Schema({
    actor: { type: ObjectId, ref: 'User' },
    actorRole: String,
    action: {
        type: String,
        required: true,
        enum: [
            // role administration
            'ADMIN_PROMOTED', 'ADMIN_DEMOTED', 'ADMIN_DEACTIVATED', 'ADMIN_REACTIVATED',
            'SUPERADMIN_ASSIGNED',
            // finance (used from 3A-2 onward; enum reserved now)
            'PERIOD_CREATED', 'BILL_GENERATED', 'BILL_ISSUED', 'BILL_VOIDED',
            'PAYMENT_RECORDED', 'PAYMENT_VERIFIED', 'PAYMENT_REFUNDED',
            'ADJUSTMENT_CREATED', 'RECEIPT_GENERATED', 'BILLING_CONFIG_CHANGED'
        ]
    },
    entityType: String,
    entityId: String,
    context: Schema.Types.Mixed                          // safe metadata only
}, { timestamps: true });
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

module.exports = {
    BillingPeriod: mongoose.model('billingperiod', billingPeriodSchema),
    Bill: mongoose.model('bill', billSchema),
    Payment: mongoose.model('payment', paymentSchema),
    Receipt: mongoose.model('receipt', receiptSchema),
    Adjustment: mongoose.model('adjustment', adjustmentSchema),
    Counter: mongoose.model('counter', counterSchema),
    StripeEvent: mongoose.model('stripeevent', stripeEventSchema),
    AuditLog: mongoose.model('auditlog', auditLogSchema)
};
