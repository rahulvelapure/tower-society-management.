const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.SECRET_KEY);
const user_collection = require("../models/userModel");
const society_collection = require("../models/societyModel");
const date = require("../date/date");
const { ensureApproved, ensureAdmin, ensureAuthenticated } = require("../middleware/auth");

router.get("/bill", ensureApproved, async (req, res) => {
    try {
        const foundUser = await user_collection.User.findById(req.user.id);
        const foundSociety = await society_collection.Society.findOne({ societyName: foundUser.societyName });

        const dateToday = new Date();
        // Payment required for total number of months
        let totalMonth = 0;
        // If lastPayment doesn't exist
        let dateFrom = foundUser.createdAt;
        // If lastPayment exists
        if (foundUser.lastPayment.date) {
            dateFrom = foundUser.lastPayment.date;
            totalMonth = date.monthDiff(dateFrom, dateToday);
        }
        else {
            // Add an extra month, as users joining date month payment's also pending
            totalMonth = date.monthDiff(dateFrom, dateToday) + 1;
        }

        // Calculate monthly bill of society maintenance
        const monthlyTotal = Object.values(foundSociety.maintenanceBill)
            .filter(ele => typeof (ele) == 'number')
            .reduce((sum, ele) => sum + ele, 0);

        let credit = 0;
        let due = 0;
        if (totalMonth == 0) {
            // Calculate credit balance
            credit = monthlyTotal;
        }
        else if (totalMonth > 1) {
            // Calculate pending due
            due = (totalMonth - 1) * monthlyTotal;
        }
        const totalAmount = monthlyTotal + due - credit;

        // Fetch validated society residents for admin features
        const foundUsers = await user_collection.User.find({
            $and: [
                { "societyName": req.user.societyName },
                { "validation": "approved" }
            ]
        });

        // Update amount to be paid on respective user collection
        foundUser.makePayment = totalAmount;
        await foundUser.save();

        res.render("bill", {
            resident: foundUser,
            society: foundSociety,
            totalAmount: totalAmount,
            pendingDue: due,
            creditBalance: credit,
            monthName: date.month,
            date: date.today,
            year: date.year,
            receipt: foundUser.lastPayment,
            societyResidents: foundUsers,
            monthlyTotal: monthlyTotal
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

router.post('/checkout-session', ensureAuthenticated, async (req, res) => {
    const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
            {
                price_data: {
                    currency: 'inr',
                    product_data: {
                        name: req.user.societyName,
                        images: ['https://www.flaticon.com/svg/vstatic/svg/3800/3800518.svg?token=exp=1615226542~hmac=7b5bcc7eceab928716515ebf044f16cd'],
                    },
                    unit_amount: req.user.makePayment * 100,
                },
                quantity: 1,
            },
        ],
        mode: 'payment',
        //   success_url: "http://localhost:3000/success?session_id={CHECKOUT_SESSION_ID}",
        //   cancel_url: "http://localhost:3000/bill",
        success_url: "https://esociety-fdbd.onrender.com/success?session_id={CHECKOUT_SESSION_ID}",
        cancel_url: "https://esociety-fdbd.onrender.com/bill",
    });

    res.json({ id: session.id });
});

router.get('/success', ensureAuthenticated, async (req, res) => {
    try {
        const session = await stripe.checkout.sessions.retrieve(req.query.session_id);
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
