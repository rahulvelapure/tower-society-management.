const crypto = require('crypto');

// Session-token CSRF protection (double-submit style): a random token is stored
// server-side in the session and must be echoed back on every state-changing
// request, either as a hidden form field (`_csrf`) or a header (`CSRF-Token`,
// used by the one fetch()-based call in bill.ejs). An attacker's cross-site form
// can't read the token out of the victim's session, so it can't forge the value.
//
// Not using the `csurf` package here since it's deprecated/unmaintained; this is
// a small, self-contained equivalent for this app's needs.

exports.attachCsrfToken = (req, res, next) => {
    if (!req.session) return next();
    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(24).toString('hex');
    }
    res.locals.csrfToken = req.session.csrfToken;
    next();
};

exports.verifyCsrfToken = (req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        return next();
    }

    const submitted = (req.body && req.body._csrf) || req.get('CSRF-Token');
    const expected = req.session && req.session.csrfToken;

    if (!expected || !submitted || submitted !== expected) {
        return res.status(403).send("Your session has expired or this form was submitted from an untrusted source. Please refresh the page and try again.");
    }

    next();
};
