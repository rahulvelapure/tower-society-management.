const express = require('express');
const router = express.Router();
const user_collection = require("../models/userModel");
const date = require("../date/date");
const { ensureApproved, ensureAdmin } = require("../middleware/auth");

router.get("/helpdesk", ensureApproved, (req, res) => {
    // Conditionally render user/admin helpdesk
    if (req.user.isAdmin) {
        user_collection.User.find({
            $and: [
                { "societyName": req.user.societyName },
                { "validation": "approved" }
            ]
        })
            .then(foundUsers => {
                res.render("helpdeskAdmin", { users: foundUsers });
            })
            .catch(err => {
                console.error(err);
                res.status(500).send("Server error");
            });
    } else {
        // Check if no complaint is present
        if (!req.user.complaints.length) {
            req.user.complaints = [{
                'category': 'You have not raised any complaint',
                'description': 'You can raise complaints and track their resolution by facility manager.'
            }];
        }
        res.render("helpdesk", { complaints: req.user.complaints });
    }
});

router.get("/complaint", ensureApproved, (req, res) => {
    res.render("complaint");
});

router.post("/complaint", ensureApproved, (req, res) => {
    user_collection.User.findById(req.user.id)
        .then(foundUser => {
            if (foundUser) {
                const complaint = {
                    'date': date.dateString,
                    'category': req.body.category,
                    'type': req.body.type,
                    'description': req.body.description,
                    'status': 'open'
                };
                foundUser.complaints.push(complaint);
                return foundUser.save()
                    .then(() => {
                        res.redirect("/helpdesk");
                    });
            }
        })
        .catch(err => {
            console.error(err);
            res.status(500).send("Server error");
        });
});

router.post("/closeTicket", ensureAdmin, (req, res) => {
    const user_id = Object.keys(req.body.ticket)[0];
    const ticket_index = Object.values(req.body.ticket)[0];
    const ticket = 'complaints.' + ticket_index;

    // Find user for fetching ticket data
    user_collection.User.findById(user_id)
        .then(foundUser => {
            if (foundUser) {
                return user_collection.User.updateOne(
                    { _id: user_id },
                    { $set: {
                        [ticket]: {
                            status: 'close',
                            'date': foundUser.complaints[ticket_index].date,
                            'category': foundUser.complaints[ticket_index].category,
                            'type': foundUser.complaints[ticket_index].type,
                            'description': foundUser.complaints[ticket_index].description
                        }
                    }}
                )
                    .then(() => {
                        res.redirect("/helpdesk");
                    });
            }
        })
        .catch(err => {
            console.error(err);
            res.status(500).send("Server error");
        });
});

module.exports = router;
