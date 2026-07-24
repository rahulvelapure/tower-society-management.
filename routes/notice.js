const express = require('express');
const router = express.Router();
const society_collection = require("../models/societyModel");
const date = require("../date/date");
const { ensureApproved, ensureAdmin } = require("../middleware/auth");

router.get("/noticeboard", ensureApproved, (req, res) => {
    society_collection.Society.findOne(
        { societyName: req.user.societyName },
        { noticeboard: 1 }
    )
        .then((foundSociety) => {
            if (foundSociety) {
                // Check if no notice is present
                if (
                    !foundSociety.noticeboard ||
                    !foundSociety.noticeboard.length
                ) {
                    foundSociety.noticeboard = [
                        {
                            subject:
                                "Access all important announcements, notices and circulars here.",
                        },
                    ];
                }
                res.render("noticeboard", {
                    notices: foundSociety.noticeboard,
                    isAdmin: req.user.isAdmin,
                });
            }
        })
        .catch((err) => {
            console.error(err);
            res.status(500).send("Server error");
        });
});

router.get("/notice", ensureAdmin, (req, res) => {
    res.render("notice");
});

router.post("/notice", ensureAdmin, (req, res) => {
    society_collection.Society.findOne({ societyName: req.user.societyName })
        .then(foundSociety => {
            if (foundSociety) {
                const notice = {
                    'date': date.dateString,
                    'subject': req.body.subject,
                    'details': req.body.details
                };
                foundSociety.noticeboard.push(notice);
                return foundSociety.save()
                    .then(() => {
                        res.redirect("/noticeboard");
                    });
            }
        })
        .catch(err => {
            console.error(err);
            res.status(500).send("Server error");
        });
});

module.exports = router;
