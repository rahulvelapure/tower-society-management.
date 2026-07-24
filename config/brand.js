// Centralized product/brand identity. Injected into every view via res.locals.brand
// (see server.js) so branding is never hardcoded across dozens of EJS files.
// This is the APPLICATION BRAND ("27East"), distinct from the SOCIETY/BUILDING
// DATA held in the Society document.
module.exports = {
    name: '27East',
    tagline: 'Private community portal for authorized residents.',
    shortDescription: 'Residential community management',
    // Single emoji used for the favicon data-URI (kept dependency-free).
    faviconEmoji: '🏙️'
};
