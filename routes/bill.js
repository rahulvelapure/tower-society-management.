const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.SECRET_KEY);
const user_collection = require("../models/userModel");
const society_collection = require("../models/societyModel");
const date = require("../date/date");
const billing = require("../lib/billing");
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
            monthlyTotal
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

router.post('/checkout-session', ensureApproved, async (req, res) => {
    try {
        // Amount comes ONLY from the server-computed value persisted by /bill.
        const amount = Number(req.user.makePayment);
        if (!Number.isFinite(amount) || amount <= 0) {
            return res.status(400).json({ error: "Nothing payable. Open your bill first." });
        }

        // Success/cancel URLs derive from the actual request host (behind
        // Render's proxy via trust proxy) - never a hardcoded domain.
        const base = `${req.protocol}://${req.get('host')}`;

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            // Ties the Checkout session to this account so /success can verify
            // the payer is recording their own payment, not replaying another's.
            client_reference_id: String(req.user.id),
            line_items: [
                {
                    price_data: {
                        currency: 'inr',
                        product_data: { name: req.user.societyName },
                        unit_amount: Math.round(amount * 100),
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${base}/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${base}/bill`,
        });

        res.json({ id: session.id });
    } catch (err) {
        console.error("Stripe checkout-session failed:", err.message);
        res.status(500).json({ error: "Unable to start the payment. Please try again." });
    }
});

router.get('/success', ensureApproved, async (req, res) => {
    try {
        if (!req.query.session_id) return res.redirect("/bill");

        const session = await stripe.checkout.sessions.retrieve(req.query.session_id);

        // Only a session Stripe confirms as PAID may record a payment - a
        // created-but-unpaid or canceled session id must not clear dues.
        if (!session || session.payment_status !== 'paid') {
            console.warn(`Rejected /success for session ${req.query.session_id}: payment_status=${session && session.payment_status}`);
            return res.redirect("/bill");
        }
        // The session must belong to the signed-in account (set at creation).
        if (session.client_reference_id && session.client_reference_id !== String(req.user.id)) {
            console.warn(`Rejected /success: session ${session.id} belongs to ${session.client_reference_id}, requested by ${req.user.id}`);
            return res.redirect("/bill");
        }

        const customer = await stripe.customers.retrieve(session.customer);

        const foundUser = await user_collection.User.findOne({ _id: req.user.id });
        foundUser.lastPayment.date = new Date(customer.created * 1000);
        foundUser.lastPayment.amount = session.amount_total / 100;
        foundUser.lastPayment.invoice = customer.invoice_prefix;

        await foundUser.save();

        const transactionDate = new Date(customer.created * 1000).toLocaleString().split(', ')[0];
        res.render("success", {
            invoice: customer.invoice_prefix,
            amount: session.amount_total / 100,
            date: transactionDate
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

module.exports = router;
