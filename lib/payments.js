// Single recorder for confirmed Stripe payments - used by BOTH the signed
// webhook (authoritative when configured) and the /success redirect fallback.
// One implementation = no conflicting payment systems.
//
// TRANSITION SEMANTICS (until 3A-9 financial cutover):
// - The authoritative dues effect remains the LEGACY one: User.lastPayment is
//   updated, exactly as before, so all current dues math keeps working.
// - Additionally an immutable Payment row (legacyEffect: true) begins the real
//   payment history. It is NOT used by any dues calculation yet, so there is
//   no double financial effect. At cutover, opening balances derive from the
//   legacy state these payments already updated - consistent by construction.
//
// IDEMPOTENCY: the unique index { provider, providerRef } makes this function
// safe to call any number of times for the same Checkout Session (webhook
// retries, /success reloads, webhook + redirect racing): exactly one Payment
// row is ever created, and the legacy lastPayment update runs only on the
// call that actually created the row.

const { Payment } = require('../models/financeModels');
const user_collection = require('../models/userModel');
const audit = require('./audit');

// `session` must be a verified, PAID Stripe Checkout Session object.
// Returns { recorded: boolean, payment } - recorded=false means it already existed.
async function recordStripePayment(stripe, session) {
    if (!session || session.payment_status !== 'paid') {
        throw new Error('recordStripePayment called with a non-paid session');
    }

    const existing = await Payment.findOne({ provider: 'stripe', providerRef: session.id });
    if (existing) return { recorded: false, payment: existing };

    const user = session.client_reference_id
        ? await user_collection.User.findById(session.client_reference_id)
        : null;
    if (!user) throw new Error(`No account found for session ${session.id}`);

    // Legacy receipt display uses the Stripe customer's invoice prefix.
    let invoiceRef = session.id.slice(-8).toUpperCase();
    let paidDate = new Date();
    try {
        if (session.customer) {
            const customer = await stripe.customers.retrieve(session.customer);
            if (customer && customer.invoice_prefix) invoiceRef = customer.invoice_prefix;
            if (customer && customer.created) paidDate = new Date(customer.created * 1000);
        }
    } catch (err) {
        console.warn('Stripe customer lookup failed (using session fallbacks):', err.message);
    }

    let payment;
    try {
        payment = await Payment.create({
            society: user.society,
            unit: user.unit || undefined,
            payer: user._id,
            amountPaise: session.amount_total,      // Stripe INR amounts are already paise
            paidAt: paidDate,
            method: 'ONLINE',
            provider: 'stripe',
            providerRef: session.id,
            status: 'SUCCEEDED',
            allocations: [],
            unallocatedPaise: 0,
            legacyEffect: true,
            verifiedAt: new Date()
        });
    } catch (err) {
        if (err.code === 11000) {
            // Raced with the webhook/another tab - the other writer won; done.
            const winner = await Payment.findOne({ provider: 'stripe', providerRef: session.id });
            return { recorded: false, payment: winner };
        }
        throw err;
    }

    // Legacy authoritative effect - only on the call that created the row.
    user.lastPayment = {
        date: paidDate,
        amount: session.amount_total / 100,
        invoice: invoiceRef
    };
    await user.save();

    await audit.record({
        actor: user, action: 'PAYMENT_VERIFIED', entityType: 'Payment', entityId: payment._id,
        context: { providerRef: session.id, amountPaise: session.amount_total, method: 'ONLINE' }
    });

    return { recorded: true, payment };
}

module.exports = { recordStripePayment };
