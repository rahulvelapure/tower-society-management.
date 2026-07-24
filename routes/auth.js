const express = require('express');
const router = express.Router();
const passport = require('passport');
const crypto = require('crypto');
const user_collection = require("../models/userModel");
const society_collection = require("../models/societyModel");
const mailer = require("../config/mailer");
const { ensureAuthenticated, ensurePendingApproval, loginRateLimiter, forgotPasswordRateLimiter } = require("../middleware/auth");

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

router.get("/signup", (req, res) => {
    society_collection.Society.find()
        .then(societies => {
            res.render("signup", { societies });
        })
        .catch(err => {
            console.error(err);
            res.status(500).send("Server error");
        });
});

router.post("/signup", async (req, res) => {
    try {
        // Signup only if society is created
        const foundSociety = await society_collection.Society.findOne({ societyName: req.body.societyName });

        if (foundSociety) {
            const user = await user_collection.User.register(
                {
                    username: req.body.username,
                    societyName: req.body.societyName,
                    society: foundSociety._id,
                    flatNumber: req.body.flatNumber,
                    firstName: req.body.firstName,
                    lastName: req.body.lastName,
                    phoneNumber: req.body.phoneNumber
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
        } else {
            renderFailure(res, {
                message: "Sorry, society is not registered, Please double-check society name.",
                href: "/signup",
                secondaryMessage: "Society not registered?",
                secondaryHref: "/register",
                secondaryButton: "Register Society"
            });
        }
    } catch (err) {
        console.error(err);
        renderFailure(res, {
            message: "Sorry, this email address is not available. Please choose a different address.",
            href: "/signup",
            secondaryMessage: "Society not registered?",
            secondaryHref: "/register",
            secondaryButton: "Register Society"
        });
    }
});

router.get("/register", (req, res) => {
    res.render("register");
});

router.post("/register", async (req, res) => {
    try {
        // Signup only if society not registered
        const existingSociety = await society_collection.Society.findOne({ societyName: req.body.societyName });

        if (!existingSociety) {
            const user = await user_collection.User.register(
                {
                    validation: 'approved',
                    isAdmin: true,
                    username: req.body.username,
                    societyName: req.body.societyName,
                    flatNumber: req.body.flatNumber,
                    firstName: req.body.firstName,
                    lastName: req.body.lastName,
                    phoneNumber: req.body.phoneNumber
                },
                req.body.password
            );

            await new Promise((resolve, reject) => {
                req.login(user, (err) => {
                    if (err) return reject(err);
                    resolve();
                });
            });

            // Create new society in collection
            const society = new society_collection.Society({
                societyName: user.societyName,
                societyAddress: {
                    address: req.body.address,
                    city: req.body.city,
                    district: req.body.district,
                    postalCode: req.body.postalCode
                },
                admin: user.username
            });

            await society.save();

            // Backfill the ObjectId reference now that both docs exist
            user.society = society._id;
            await user.save();

            res.redirect("/home");
        } else {
            renderFailure(res, {
                message: "Sorry, society is already registered, Please double-check society name.",
                href: "/register",
                secondaryMessage: "Account not created?",
                secondaryHref: "/signup",
                secondaryButton: "Create Account"
            });
        }
    } catch (err) {
        console.error(err);
        res.redirect("/register");
    }
});

router.get("/newRequest", ensurePendingApproval, (req, res) => {
    society_collection.Society.find()
        .then(societies => {
            res.render("signupEdit", { user: req.user, societies });
        })
        .catch(err => {
            console.error(err);
            res.status(500).send("Server error");
        });
});

router.post("/newRequest", ensureAuthenticated, (req, res) => {
    // Submit new signup only if society exists
    society_collection.Society.findOne({ societyName: req.body.societyName })
        .then(foundSociety => {
            if (foundSociety) {
                return user_collection.User.updateOne(
                    { _id: req.user.id },
                    { $set: {
                        firstName: req.body.firstName,
                        lastName: req.body.lastName,
                        phoneNumber: req.body.phoneNumber,
                        societyName: req.body.societyName,
                        society: foundSociety._id,
                        flatNumber: req.body.flatNumber,
                        validation: 'applied'
                    }}
                )
                    .then(() => {
                        res.redirect("/home");
                    });
            } else {
                renderFailure(res, {
                    message: "Sorry, society is not registered, Please double-check society name.",
                    href: "/newRequest",
                    secondaryMessage: "Account not created?",
                    secondaryHref: "/signup",
                    secondaryButton: "Create Account"
                });
            }
        })
        .catch(err => {
            console.error(err);
            res.status(500).send("Server error");
        });
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
