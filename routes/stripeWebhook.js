// Signed Stripe webhook - the target-authoritative payment confirmation path.
// Mounted in server.js with express.raw() BEFORE body parsing/session/CSRF.
//
// Security model:
// - Requests are authenticated by Stripe's signature over the RAW body
//   (stripe.webhooks.constructEvent) - unsigned/tampered payloads are rejected.
// - STRIPE_WEBHOOK_SECRET unset => endpoint answers 503 and does nothing; the
//   verified /success redirect flow remains the recorder until it's configured.
// - Idempotency: unique StripeEvent.eventId (replayed events exit early) plus
//   the unique Payment {provider, providerRef} index inside the shared
//   recorder. The same event/session can never double-credit, duplicate a
//   Payment, or double-apply the legacy lastPayment effect.

const stripe = require('stripe')(process.env.SECRET_KEY);
const { StripeEvent } = require('../models/financeModels');
const payments = require('../lib/payments');

module.exports = async function stripeWebhook(req, res) {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret || !process.env.SECRET_KEY) {
        // Not configured yet - refuse politely so Stripe retries once it is.
        return res.status(503).send('Webhook not configured');
    }

    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], webhookSecret);
    } catch (err) {
        console.warn('Stripe webhook signature verification failed:', err.message);
        return res.status(400).send('Invalid signature');
    }

    // Idempotency gate: first delivery of this event id wins; retries no-op.
    try {
        await StripeEvent.create({ eventId: event.id, type: event.type });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(200).send('Already processed');
        }
        console.error('StripeEvent insert failed:', err.message);
        return res.status(500).send('Event store error'); // Stripe will retry
    }

    let outcome = 'ignored';
    try {
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            if (session.payment_status === 'paid' && (!session.currency || session.currency === 'inr')) {
                const { recorded } = await payments.recordStripePayment(stripe, session);
                outcome = recorded ? 'payment recorded' : 'payment already recorded';
            } else {
                outcome = `skipped (payment_status=${session.payment_status}, currency=${session.currency})`;
            }
        }

        await StripeEvent.updateOne({ eventId: event.id }, { $set: { processedAt: new Date(), outcome } });
        res.status(200).send('ok');
    } catch (err) {
        console.error(`Stripe webhook processing failed for ${event.id}:`, err.message);
        await StripeEvent.updateOne({ eventId: event.id }, { $set: { outcome: `error: ${err.message}` } }).catch(() => {});
        // Non-2xx makes Stripe retry; the idempotency gate above would block the
        // retry, so delete the marker to allow reprocessing of this failure.
        await StripeEvent.deleteOne({ eventId: event.id, processedAt: { $exists: false } }).catch(() => {});
        res.status(500).send('Processing error');
    }
};
