const express = require('express');
const router = express.Router();
const passport = require('passport');
const crypto = require('crypto');
const user_collection = require("../models/userModel");
const mailer = require("../config/mailer");
const { loginRateLimiter, forgotPasswordRateLimiter } = require("../middleware/auth");

// Reset / activation tokens are sent to the user in plaintext (so the link works),
// but only a SHA-256 hash of the token is ever stored in the database - matches the
// common "never store secrets you don't have to" practice for bearer tokens.
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
    if (req.isAuthenticated()) return res.redirect("/home");
    let error = null;
    if (req.query.error === 'inactive') error = "This account has been deactivated. Please contact your administrator.";
    else if (req.query.error) error = "Incorrect email or password. Please try again.";
    res.render("login", { error });
});

router.post("/login", loginRateLimiter, (req, res, next) => {
    passport.authenticate("local", (err, user) => {
        if (err) return next(err);
        if (!user) return res.redirect("/login?error=1");
        // Deactivated accounts are blocked even with correct credentials.
        if (user.accountStatus === 'inactive') return res.redirect("/login?error=inactive");
        req.login(user, (loginErr) => {
            if (loginErr) return next(loginErr);
            return res.redirect("/home");
        });
    })(req, res, next);
});

router.get("/logout", (req, res) => {
    req.logout(function () {
        res.redirect("/login");
    });
});

// ---------------------------------------------------------------------------
// CLOSED / PRIVATE SYSTEM: there is NO public account creation of any kind.
// Society registration and resident self-signup are fully disabled - both the
// UI links and these backend endpoints - so hitting an old URL directly cannot
// create a society, resident, or admin. Members are onboarded only by the
// administrator (see routes/members.js) with a secure activation link.
// ---------------------------------------------------------------------------
router.get("/register", (req, res) => res.redirect("/login"));
router.post("/register", (req, res) => res.status(403).send("Registration is disabled. 27East is a private community; accounts are created by the administrator."));

router.get("/signup", (req, res) => res.redirect("/login"));
router.post("/signup", (req, res) => res.status(403).send("Self sign-up is disabled. 27East is a private community; accounts are created by the administrator."));

router.get("/newRequest", (req, res) => res.redirect("/home"));
router.post("/newRequest", (req, res) => res.status(403).send("Self sign-up is disabled."));

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

// ---------------------------------------------------------------------------
// Account activation: an admin-created member sets their own first password via
// a secure link. Tokens are hashed at rest, expiring, and single-use. The admin
// never sees or sets the resident's password.
// ---------------------------------------------------------------------------
router.get("/activate/:token", async (req, res) => {
    try {
        const foundUser = await user_collection.User.findOne({
            activationToken: hashToken(req.params.token),
            activationExpires: { $gt: new Date() }
        });

        if (!foundUser) {
            return renderFailure(res, {
                message: "This activation link is invalid or has expired. Please ask your administrator to resend it.",
                href: "/login",
                secondaryMessage: "Already activated?",
                secondaryHref: "/login",
                secondaryButton: "Login"
            });
        }

        res.render("activate", { token: req.params.token, error: null, firstName: foundUser.firstName });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

router.post("/activate/:token", async (req, res) => {
    try {
        const foundUser = await user_collection.User.findOne({
            activationToken: hashToken(req.params.token),
            activationExpires: { $gt: new Date() }
        });

        if (!foundUser) {
            return renderFailure(res, {
                message: "This activation link is invalid or has expired. Please ask your administrator to resend it.",
                href: "/login",
                secondaryMessage: "Already activated?",
                secondaryHref: "/login",
                secondaryButton: "Login"
            });
        }

        if (!req.body.password || req.body.password.length < 8) {
            return res.render("activate", {
                token: req.params.token,
                error: "Password must be at least 8 characters long.",
                firstName: foundUser.firstName
            });
        }

        await foundUser.setPassword(req.body.password);
        // Single-use: clear the token immediately and mark the account active.
        foundUser.activationToken = undefined;
        foundUser.activationExpires = undefined;
        foundUser.accountStatus = 'active';
        await foundUser.save();

        res.redirect("/login");
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

module.exports = router;
