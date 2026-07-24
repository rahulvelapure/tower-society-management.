const express = require('express');
const router = express.Router();
const passport = require('passport');
const crypto = require('crypto');
const mongoose = require('mongoose');
const user_collection = require("../models/userModel");
const society_collection = require("../models/societyModel");
const unit_collection = require("../models/unitModel");
const mailer = require("../config/mailer");
const { ensureAuthenticated, ensurePendingApproval, loginRateLimiter, forgotPasswordRateLimiter } = require("../middleware/auth");

// Loads the single configured society (27 East) + its canonical flats and renders
// the resident signup form. Used for both the initial GET and any re-render after
// a validation error, so the flat list and society are always resolved server-side.
async function renderResidentSignup(res, { error = null, prefill = {} } = {}) {
    const society = await society_collection.getConfiguredSociety();
    if (!society) {
        return renderFailure(res, {
            message: "Resident registration is not available yet. Please contact your society administrator.",
            href: "/login",
            secondaryMessage: "Already have an account?",
            secondaryHref: "/login",
            secondaryButton: "Login"
        });
    }
    const units = await unit_collection.Unit.find({ society: society._id }).sort({ floor: 1, flatNumber: 1 });
    res.render("signup", { society, units, error, prefill });
}

// Reset tokens are emailed to the user in plaintext (so the link works), but only
// a SHA-256 hash of the token is ever stored in the database - matches the common
// "never store secrets you don't have to" practice for bearer tokens.
function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function renderFailure(res, { message, href, secondaryMessage, secondaryHref, secondaryButton }) {
    res.render("failure", {
        message,
        href,
        messageSecondary: secondaryMessage,
        hrefSecondary: secondaryHref,
        buttonSecondary: secondaryButton
    });
}

router.get("/login", (req, res) => {
    res.render("login");
});

router.get("/loginFailure", (req, res) => {
    renderFailure(res, {
        message: "Sorry, entered password was incorrect, Please double-check.",
        href: "/login",
        secondaryMessage: "Account not created?",
        secondaryHref: "/signup",
        secondaryButton: "Create Account"
    });
});

router.post("/login", loginRateLimiter, passport.authenticate("local", {
    successRedirect: "/home",
    failureRedirect: "/loginFailure"
}));

router.get("/logout", (req, res) => {
    req.logout(function () {
        res.redirect("/");
    });
});

router.get("/signup", async (req, res) => {
    try {
        await renderResidentSignup(res);
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

router.post("/signup", async (req, res) => {
    try {
        // The society is ALWAYS resolved server-side (27 East) - never taken from
        // client input - so a resident can only ever join the one configured tower.
        const society = await society_collection.getConfiguredSociety();
        if (!society) {
            return renderResidentSignup(res, { error: "Registration is not available yet. Please contact your administrator." });
        }

        // Flat must be a real Unit from the canonical master belonging to this society.
        // This blocks free-typed / non-existent flats (2901, 3001, etc.) entirely.
        if (!mongoose.isValidObjectId(req.body.unitId)) {
            return renderResidentSignup(res, { error: "Please select your flat from the list.", prefill: req.body });
        }
        const unit = await unit_collection.Unit.findOne({ _id: req.body.unitId, society: society._id });
        if (!unit) {
            return renderResidentSignup(res, { error: "Please select a valid flat from the list.", prefill: req.body });
        }

        const user = await user_collection.User.register(
            {
                username: req.body.username,
                societyName: society.societyName,
                society: society._id,
                flatNumber: unit.flatNumber,
                unit: unit._id,
                firstName: req.body.firstName,
                lastName: req.body.lastName,
                phoneNumber: req.body.phoneNumber
                // validation defaults to 'applied' (pending admin approval) via the schema
            },
            req.body.password
        );

        await new Promise((resolve, reject) => {
            req.login(user, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });

        res.redirect("/home");
    } catch (err) {
        console.error(err);
        // Most common cause here is a duplicate email (passport-local-mongoose
        // UserExistsError). Re-render the form with a friendly message.
        return renderResidentSignup(res, {
            error: "This email address is not available. Please choose a different one.",
            prefill: req.body
        });
    }
});

// Society registration is DISABLED. 27 East is the single, already-registered
// tower; no additional societies may ever be created through this application.
router.get("/register", (req, res) => {
    res.redirect("/login");
});

router.post("/register", (req, res) => {
    // Hard backend block so this can't be triggered by directly POSTing the URL,
    // not merely by hiding the button in the UI.
    res.status(403).send("Society registration is disabled. 27 East is the only society and it is already registered.");
});

router.get("/newRequest", ensurePendingApproval, async (req, res) => {
    try {
        const society = await society_collection.getConfiguredSociety();
        const units = society
            ? await unit_collection.Unit.find({ society: society._id }).sort({ floor: 1, flatNumber: 1 })
            : [];
        res.render("signupEdit", { user: req.user, society, units, error: null });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

router.post("/newRequest", ensureAuthenticated, async (req, res) => {
    try {
        const society = await society_collection.getConfiguredSociety();
        if (!society) return res.status(500).send("Society not configured");

        const renderWithError = async (message) => {
            const units = await unit_collection.Unit.find({ society: society._id }).sort({ floor: 1, flatNumber: 1 });
            const baseUser = typeof req.user.toObject === 'function' ? req.user.toObject() : req.user;
            // Keep whatever the resident just typed, on top of their stored values
            const user = { ...baseUser, ...req.body };
            res.render("signupEdit", { user, society, units, error: message });
        };

        if (!mongoose.isValidObjectId(req.body.unitId)) {
            return renderWithError("Please select your flat from the list.");
        }
        const unit = await unit_collection.Unit.findOne({ _id: req.body.unitId, society: society._id });
        if (!unit) {
            return renderWithError("Please select a valid flat from the list.");
        }

        await user_collection.User.updateOne(
            { _id: req.user.id },
            { $set: {
                firstName: req.body.firstName,
                lastName: req.body.lastName,
                phoneNumber: req.body.phoneNumber,
                societyName: society.societyName,
                society: society._id,
                flatNumber: unit.flatNumber,
                unit: unit._id,
                validation: 'applied'
            }}
        );
        res.redirect("/home");
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

router.get("/forgot-password", (req, res) => {
    res.render("forgotPassword", { message: null });
});

router.post("/forgot-password", forgotPasswordRateLimiter, async (req, res) => {
    try {
        const foundUser = await user_collection.User.findOne({ username: req.body.username });
        // Always show the same message whether or not the account exists, so this
        // endpoint can't be used to enumerate registered email addresses.
        const confirmation = "If an account exists for that information, password reset instructions have been sent.";

        if (foundUser) {
            const token = crypto.randomBytes(32).toString('hex');
            foundUser.passwordResetToken = hashToken(token);
            foundUser.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
            await foundUser.save();

            // The raw (unhashed) token only ever exists here and in the emailed link -
            // only its hash is persisted.
            const resetUrl = `${req.protocol}://${req.get('host')}/reset-password/${token}`;
            await mailer.sendMail({
                to: foundUser.username,
                subject: "E-Society password reset",
                text: `Reset your password using this link (valid for 1 hour): ${resetUrl}\nIf you didn't request this, you can safely ignore this email.`
            });
        }

        res.render("forgotPassword", { message: confirmation });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

router.get("/reset-password/:token", async (req, res) => {
    try {
        const foundUser = await user_collection.User.findOne({
            passwordResetToken: hashToken(req.params.token),
            passwordResetExpires: { $gt: new Date() }
        });

        if (!foundUser) {
            return renderFailure(res, {
                message: "This password reset link is invalid or has expired.",
                href: "/forgot-password",
                secondaryMessage: "Remembered your password?",
                secondaryHref: "/login",
                secondaryButton: "Login"
            });
        }

        res.render("resetPassword", { token: req.params.token, error: null });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

router.post("/reset-password/:token", async (req, res) => {
    try {
        const foundUser = await user_collection.User.findOne({
            passwordResetToken: hashToken(req.params.token),
            passwordResetExpires: { $gt: new Date() }
        });

        if (!foundUser) {
            return renderFailure(res, {
                message: "This password reset link is invalid or has expired.",
                href: "/forgot-password",
                secondaryMessage: "Remembered your password?",
                secondaryHref: "/login",
                secondaryButton: "Login"
            });
        }

        if (!req.body.password || req.body.password.length < 8) {
            return res.render("resetPassword", {
                token: req.params.token,
                error: "Password must be at least 8 characters long."
            });
        }

        await foundUser.setPassword(req.body.password);
        // Single-use: the token (and its hash) is cleared immediately so it cannot
        // be replayed even if it hasn't expired yet.
        foundUser.passwordResetToken = undefined;
        foundUser.passwordResetExpires = undefined;
        await foundUser.save();

        // If the browser completing this reset happens to hold an active session
        // (e.g. reset requested while already logged in elsewhere on this device),
        // destroy it so the reset also forces re-authentication here.
        if (req.session) {
            req.session.destroy(() => {});
        }

        res.redirect("/login");
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

module.exports = router;
