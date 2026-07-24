const express = require('express');
const router = express.Router();
const user_collection = require("../models/userModel");
const society_collection = require("../models/societyModel");
const { ensureAuthenticated, ensureApproved, ensureAdmin } = require("../middleware/auth");

router.get("/home", ensureAuthenticated, (req, res) => {
    // Conditionally render home as per user validation status
    if (req.user.validation == 'approved') {
        res.render("home");
    } else if (req.user.validation == 'applied') {
        res.render("homeStandby", {
            icon: 'fa-user-clock',
            title: 'Account pending for approval',
            content: 'Your account will be active as soon as it is approved by your community.' +
                'It usually takes 1-2 days for approval. If it is taking longer to get approval, ' +
                'contact your society admin.'
        });
    } else {
        res.render("homeStandby", {
            icon: 'fa-user-lock',
            title: 'Account approval declined',
            content: 'Your account registration has been declined. ' +
                'Please contact the society administrator for more details.' +
                'You can edit the request and apply again.'
        });
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

router.post("/editProfile", ensureAuthenticated, (req, res) => {
    user_collection.User.updateOne(
        { _id: req.user.id },
        { $set: {
            firstName: req.body.firstName,
            lastName: req.body.lastName,
            phoneNumber: req.body.phoneNumber,
            flatNumber: req.body.flatNumber
        }}
    )
        .then(() => {
            // Update society data if any ~admin
            if (req.body.address) {
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
