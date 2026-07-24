const express = require('express');
const router = express.Router();
const user_collection = require("../models/userModel");
const society_collection = require("../models/societyModel");
const unit_collection = require("../models/unitModel");
const billing = require("../lib/billing");
const { ensureAuthenticated, ensureApproved, ensureAdmin } = require("../middleware/auth");

function recentNotices(society, limit = 5) {
    const board = (society && society.noticeboard) ? society.noticeboard.filter(n => n && n.subject) : [];
    return board.slice(-limit).reverse();
}

router.get("/home", ensureAuthenticated, async (req, res) => {
    try {
        // Not-yet-active accounts (legacy 'applied'/'declined') see a standby screen.
        if (req.user.validation !== 'approved') {
            return res.render("homeStandby", req.user.validation === 'applied'
                ? { title: 'Account pending approval', content: 'Your account will be active once approved by your community administrator.' }
                : { title: 'Account not active', content: 'Please contact the society administrator for access.' });
        }

        const society = req.user.society
            ? await society_collection.Society.findById(req.user.society)
            : await society_collection.getConfiguredSociety();
        const societyFilter = society
            ? { $or: [{ society: society._id }, { societyName: society.societyName }] }
            : { societyName: req.user.societyName };

        if (req.user.isAdmin) {
            // Admin dashboard - every number below is computed from real data.
            const units = society ? await unit_collection.Unit.find({ society: society._id }) : [];
            const totalFlats = units.length;
            const occupied = units.filter(u => u.occupancyStatus && u.occupancyStatus !== 'vacant').length;
            const vacant = totalFlats - occupied;

            const [residentsCount, pendingActivations, memberDocs] = await Promise.all([
                user_collection.User.countDocuments({ ...societyFilter, isAdmin: false }),
                user_collection.User.countDocuments({ ...societyFilter, accountStatus: 'invited' }),
                user_collection.User.find({ ...societyFilter, validation: 'approved' }, { complaints: 1, lastPayment: 1, createdAt: 1 })
            ]);
            const openComplaints = memberDocs.reduce((sum, u) =>
                sum + ((u.complaints || []).filter(c => c && c.status === 'open').length), 0);

            // Outstanding dues across all approved members - shared helper, so
            // this figure always matches the bill page and Flat 360.
            const monthlyTotal = billing.computeMonthlyTotal(society);
            let outstandingTotal = 0;
            memberDocs.forEach(m => {
                const dues = billing.computeDues(m, monthlyTotal);
                if (dues.totalAmount > 0) outstandingTotal += dues.totalAmount;
            });

            return res.render("dashboard", {
                stats: { totalFlats, occupied, vacant, residentsCount, pendingActivations, openComplaints, outstandingTotal },
                notices: recentNotices(society),
                flatMasterReady: totalFlats > 0
            });
        }

        // Resident home
        const foundUser = await user_collection.User.findById(req.user.id).populate('unit');
        return res.render("residentHome", { resident: foundUser, notices: recentNotices(society) });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

router.get("/residents", ensureApproved, async (req, res) => {
    try {
        const userSocietyName = req.user.societyName;

        const allSocietyUsers = await user_collection.User.find({
            societyName: userSocietyName,
        }).populate('unit');

        const foundUsers = [];
        const foundAppliedUsers = [];

        allSocietyUsers.forEach((user) => {
            if (user.validation === "approved") {
                foundUsers.push(user);
            } else if (user.validation === "applied") {
                foundAppliedUsers.push(user);
            }
        });

        res.render("residents", {
            societyResidents: foundUsers,
            appliedResidents: foundAppliedUsers,
            societyName: userSocietyName,
            isAdmin: req.user.isAdmin
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

router.post("/approveResident", ensureAdmin, (req, res) => {
    const user_id = Object.keys(req.body.validate)[0]
    const validate_state = Object.values(req.body.validate)[0]

    if (!['approved', 'declined'].includes(validate_state)) {
        return res.status(400).send("Invalid validation state");
    }

    user_collection.User.updateOne(
        { _id: user_id },
        { $set: {
            validation: validate_state
        }}
    ).then(() => res.redirect("/residents"))
        .catch(err => {
            console.error(err);
            res.status(500).send("Server error");
        });
});

router.get("/profile", ensureApproved, (req, res) => {
    user_collection.User.findById(req.user.id).populate('unit')
        .then(foundUser => {
            if (foundUser) {
                return society_collection.Society.findOne({ societyName: foundUser.societyName })
                    .then(foundSociety => {
                        res.render("profile", { resident: foundUser, society: foundSociety });
                    });
            }
        })
        .catch(err => {
            console.error(err);
            res.status(500).send("Server error");
        });
});

router.get("/editProfile", ensureApproved, (req, res) => {
    user_collection.User.findById(req.user.id).populate('unit')
        .then(foundUser => {
            if (foundUser) {
                return society_collection.Society.findOne({ societyName: foundUser.societyName })
                    .then(foundSociety => {
                        res.render("editProfile", { resident: foundUser, society: foundSociety });
                    });
            }
        })
        .catch(err => {
            console.error(err);
            res.status(500).send("Server error");
        });
});

router.post("/editProfile", ensureApproved, (req, res) => {
    // Only ever updates the signed-in user's own record (keyed by req.user.id).
    const updates = {
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        phoneNumber: req.body.phoneNumber
    };
    // Flat assignment is canonical (Unit master, managed by the admin via
    // Member Management). A resident must not be able to relabel their own
    // flat through this form; only the admin's own profile may adjust it.
    if (req.user.isAdmin && req.body.flatNumber) {
        updates.flatNumber = req.body.flatNumber;
    }

    user_collection.User.updateOne({ _id: req.user.id }, { $set: updates })
        .then(() => {
            // Update society data if any ~admin (guarded server-side: the query
            // matches on admin: req.user.username, so a resident POSTing an
            // address field cannot alter the society record)
            if (req.body.address && req.user.isAdmin) {
                return society_collection.Society.updateOne(
                    { admin: req.user.username },
                    { $set: {
                        societyAddress: {
                            address: req.body.address,
                            city: req.body.city,
                            district: req.body.district,
                            postalCode: req.body.postalCode
                        }
                    }}
                )
                    .then(() => {
                        res.redirect("/profile");
                    });
            } else {
                res.redirect("/profile");
            }
        })
        .catch(err => {
            console.error(err);
            res.status(500).send("Server error");
        });
});

module.exports = router;
