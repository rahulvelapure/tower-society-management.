const express = require('express');
const router = express.Router();
const society_collection = require("../models/societyModel");
const { ensureApproved, ensureAdmin } = require("../middleware/auth");

router.get("/contacts", ensureApproved, (req, res) => {
    const userSocietyName = req.user.societyName;
    society_collection.Society.findOne(
        { "societyName": userSocietyName },
        { emergencyContacts: 1 }
    )
        .then(foundSociety => {
            if (foundSociety) {
                res.render("contacts", { contact: foundSociety.emergencyContacts, isAdmin: req.user.isAdmin });
            }
        })
        .catch(err => {
            console.error(err);
            res.status(500).send("Server error");
        });
});

router.get("/editContacts", ensureAdmin, (req, res) => {
    society_collection.Society.findOne(
        { societyName: req.user.societyName },
        { emergencyContacts: 1 }
    )
        .then(foundSociety => {
            if (foundSociety) {
                res.render("editContacts", { contact: foundSociety.emergencyContacts });
            }
        })
        .catch(err => {
            console.error(err);
            res.status(500).send("Server error");
        });
});

router.post("/editContacts", ensureAdmin, (req, res) => {
    society_collection.Society.updateOne(
        { societyName: req.user.societyName },
        { $set: {
            emergencyContacts: {
                plumbingService: req.body.plumbingService,
                medicineShop: req.body.medicineShop,
                ambulance: req.body.ambulance,
                doctor: req.body.doctor,
                fireStation: req.body.fireStation,
                guard: req.body.guard,
                policeStation: req.body.policeStation
            }
        }}
    )
        .then(() => {
            res.redirect("/contacts");
        })
        .catch(err => {
            console.error(err);
            res.status(500).send("Server error");
        });
});

module.exports = router;
