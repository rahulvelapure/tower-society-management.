// A deactivated account must lose access IMMEDIATELY, not at its next login -
// otherwise a member deactivated by the admin keeps a working session for up to
// 24h. Every guard below ends such sessions on the spot.
function rejectInactive(req, res) {
    if (req.isAuthenticated() && req.user.accountStatus === 'inactive') {
        req.logout(() => res.redirect("/login?error=inactive"));
        return true;
    }
    return false;
}

exports.ensureAuthenticated = (req, res, next) => {
    if (rejectInactive(req, res)) return;
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect("/login");
};

exports.ensureApproved = (req, res, next) => {
    if (rejectInactive(req, res)) return;
    if (req.isAuthenticated() && req.user.validation == 'approved') {
        return next();
    }
    res.redirect("/login");
};

exports.ensureAdmin = (req, res, next) => {
    if (rejectInactive(req, res)) return;
    if (req.isAuthenticated() && req.user.isAdmin) {
        return next();
    }
    res.redirect("/login");
};

exports.ensurePendingApproval = (req, res, next) => {
    if (req.isAuthenticated() && req.user.validation != 'approved') {
        return next();
    }
    res.redirect("/home");
};

const rateLimit = require('express-rate-limit');

// Brute-force / abuse protection for auth endpoints. Keyed by IP (default).
exports.loginRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many login attempts. Please try again later."
});

exports.forgotPasswordRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many password reset requests. Please try again later."
});
