// Identifies whether the configured Stripe secret key is a TEST or LIVE key,
// purely from its PREFIX. The key value itself is never logged, returned, or
// exposed anywhere - this exists solely so the admin/operator can confirm
// which mode is active without having to read the raw env var themselves.
function stripeMode() {
    const key = process.env.SECRET_KEY || '';
    if (!key) return 'unconfigured';
    if (key.startsWith('sk_live_') || key.startsWith('rk_live_')) return 'live';
    if (key.startsWith('sk_test_') || key.startsWith('rk_test_')) return 'test';
    return 'unknown';
}

module.exports = { stripeMode };
