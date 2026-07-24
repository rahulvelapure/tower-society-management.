const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.SECRET_KEY);
const user_collection = require("../models/userModel");
const society_collection = require("../models/societyModel");
const date = require("../date/date");
const billing = require("../lib/billing");
const payments = require("../lib/payments");
const { ensureApproved, ensureAdmin } = require("../middleware/auth");

router.get("/bill", ensureApproved, async (req, res) => {
    try {
        const foundUser = await user_collection.User.findById(req.user.id);
        const foundSociety = await society_collection.Society.findOne({ societyName: foundUser.societyName });

        const monthlyTotal = billing.computeMonthlyTotal(foundSociety);
        const dues = billing.computeDues(foundUser, monthlyTotal);

        // Admin-only: dues position of every approved member, computed with the
        // same shared helper so no page can disagree with another.
        let adminRows = [];
        if (foundUser.isAdmin) {
            const members = await user_collection.User.find({
                societyName: req.user.societyName,
                validation: "approved"
            });
            adminRows = members.map(m => {
                const d = billing.computeDues(m, monthlyTotal);
                return {
                    name: `${m.firstName} ${m.lastName}`,
                    flatNumber: m.flatNumber,
                    due: d.totalAmount,
                    status: d.status
                };
            });
        }

        // Persist the authoritative payable amount; /checkout-session charges
        // exactly this server-side value, never a client-submitted figure.
        foundUser.makePayment = dues.totalAmount;
        await foundUser.save();

        res.render("bill", {
            resident: foundUser,
            society: foundSociety,
            totalAmount: dues.totalAmount,
            pendingDue: dues.due,
            creditBalance: dues.credit,
            monthName: date.month,
            date: date.today,
            year: date.year,
            receipt: foundUser.lastPayment,
            adminRows,
            monthlyTotal,
            paymentNotice: req.query.payment || null
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

router.get("/editBill", ensureAdmin, (req, res) => {
    society_collection.Society.findOne(
        { societyName: req.user.societyName },
        { maintenanceBill: 1 }
    )
        .then(foundSociety => {
            if (foundSociety) {
                res.render("editBill", { maintenanceBill: foundSociety.maintenanceBill });
            }
        })
        .catch(err => {
            console.error(err);
            res.status(500).send("Server error");
        });
});

router.post("/editBill", ensureAdmin, (req, res) => {
    society_collection.Society.updateOne(
        { societyName: req.user.societyName },
        { $set: {
            maintenanceBill: {
                societyCharges: req.body.societyCharges,
                repairsAndMaintenance: req.body.repairsAndMaintenance,
                sinkingFund: req.body.sinkingFund,
                waterCharges: req.body.waterCharges,
                insuranceCharges: req.body.insuranceCharges,
                parkingCharges: req.body.parkingCharges
            }
        }}
    )
        .then(() => {
            res.redirect("/bill");
        })
        .catch(err => {
            console.error(err);
            res.status(500).send("Server error");
        });
});

// Base URL for Stripe redirect targets. Prefer the explicit APP_BASE_URL env
// (deployment-aware, immune to host-header games); fall back to the request
// host, which is safe here because trust proxy is pinned to 1 hop (Render).
function appBaseUrl(req) {
    const configured = (process.env.APP_BASE_URL || '').trim().replace(/\/+$/, '');
    if (configured) return configured;
    return `${req.protocol}://${req.get('host')}`;
}

function stripeConfigured() {
    return Boolean(process.env.SECRET_KEY);
}

router.post('/checkout-session', ensureApproved, async (req, res) => {
    try {
        if (!stripeConfigured()) {
            return res.status(503).json({ error: "Online payments are not configured yet. Please contact the administrator." });
        }

        // Amount comes ONLY from the server-computed value persisted by /bill -
        // req.body is never consulted for the amount.
        const amount = Number(req.user.makePayment);
        if (!Number.isFinite(amount) || amount <= 0) {
            return res.status(400).json({ error: "Nothing payable right now. Open your bill page first." });
        }

        const base = appBaseUrl(req);
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            // Ties the Checkout session to this account so confirmation can
            // verify the payer is recording their own payment.
            client_reference_id: String(req.user.id),
            line_items: [
                {
                    price_data: {
                        currency: 'inr',
                        product_data: { name: req.user.societyName },
                        unit_amount: Math.round(amount * 100), // integer paise
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${base}/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${base}/bill?payment=cancelled`,
        });

        res.json({ id: session.id });
    } catch (err) {
        console.error("Stripe checkout-session failed:", err.message);
        res.status(502).json({ error: "Unable to start the payment right now. Please try again in a moment." });
    }
});

router.get('/success', ensureApproved, async (req, res) => {
    try {
        if (!stripeConfigured() || !req.query.session_id) return res.redirect("/bill");

        let session;
        try {
            session = await stripe.checkout.sessions.retrieve(req.query.session_id);
        } catch (stripeErr) {
            // Invalid/garbage session id -> friendly redirect, never a 500.
            console.warn(`Invalid session id on /success: ${stripeErr.message}`);
            return res.redirect("/bill?payment=invalid");
        }

        // Only a session Stripe confirms as PAID may show/record a payment.
        if (!session || session.payment_status !== 'paid') {
            console.warn(`Rejected /success for session ${req.query.session_id}: payment_status=${session && session.payment_status}`);
            return res.redirect("/bill?payment=pending");
        }
        // The session must belong to the signed-in account (set at creation).
        if (session.client_reference_id && session.client_reference_id !== String(req.user.id)) {
            console.warn(`Rejected /success: session ${session.id} belongs to ${session.client_reference_id}, requested by ${req.user.id}`);
            return res.redirect("/bill?payment=invalid");
        }
        if (session.currency && session.currency !== 'inr') {
            console.warn(`Rejected /success: unexpected currency ${session.currency} on ${session.id}`);
            return res.redirect("/bill?payment=invalid");
        }

        // Shared idempotent recorder (same one the webhook uses): exactly one
        // Payment row + one legacy lastPayment effect per session, no matter
        // how many times this page or the webhook fires.
        const { payment } = await payments.recordStripePayment(stripe, session);

        res.render("success", {
            invoice: (await user_collection.User.findById(req.user.id)).lastPayment.invoice,
            amount: payment.amountPaise / 100,
            date: new Date(payment.paidAt).toLocaleDateString()
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

module.exports = router;
