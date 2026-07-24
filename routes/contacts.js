const express = require('express');
const router = express.Router();
const society_collection = require("../models/societyModel");
const { ensureApproved, ensureAdmin } = require("../middleware/auth");

// Normalize a form value that may arrive as a string (one row) or an array
// (multiple rows with the same field name) into a clean array of strings.
function toArray(value) {
    if (value === undefined || value === null) return [];
    return (Array.isArray(value) ? value : [value]).map(v => String(v).trim());
}

router.get("/contacts", ensureApproved, (req, res) => {
    const userSocietyName = req.user.societyName;
    society_collection.Society.findOne(
        { "societyName": userSocietyName },
        { emergencyContacts: 1, extraContacts: 1 }
    )
        .then(foundSociety => {
            if (foundSociety) {
                res.render("contacts", {
                    contact: foundSociety.emergencyContacts,
                    extraContacts: foundSociety.extraContacts || [],
                    isAdmin: req.user.isAdmin
                });
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
        { emergencyContacts: 1, extraContacts: 1 }
    )
        .then(foundSociety => {
            if (foundSociety) {
                res.render("editContacts", {
                    contact: foundSociety.emergencyContacts,
                    extraContacts: foundSociety.extraContacts || []
                });
            }
        })
        .catch(err => {
            console.error(err);
            res.status(500).send("Server error");
        });
});

router.post("/editContacts", ensureAdmin, (req, res) => {
    // Rebuild the admin-defined contact list from parallel name/phone rows,
    // dropping rows where either half is empty.
    const names = toArray(req.body.extraName);
    const phones = toArray(req.body.extraPhone);
    const extraContacts = [];
    for (let i = 0; i < Math.max(names.length, phones.length); i++) {
        const name = names[i] || '';
        const phone = phones[i] || '';
        if (name && phone) extraContacts.push({ name, phone });
    }

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
            },
            extraContacts
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
