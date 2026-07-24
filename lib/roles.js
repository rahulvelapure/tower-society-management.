// Central role resolution - the ONLY place that interprets role/isAdmin.
// Routes and middleware call these helpers instead of comparing strings/flags,
// so role rules live in one file.
//
// Legacy compatibility: accounts created before the role field exist without
// `role`. Exactly one such account has isAdmin: true - the original
// administrator - and it is treated as SUPERADMIN until scripts/migrateRoles.js
// persists that explicitly. (New admins are only ever created via superadmin
// promotion, which always sets `role`, so this fallback can never promote
// anyone else.) No email matching anywhere.

const SUPERADMIN = 'superadmin';
const ADMIN = 'admin';
const MEMBER = 'member';

function effectiveRole(user) {
    if (!user) return null;
    if (user.role) return user.role;
    return user.isAdmin ? SUPERADMIN : MEMBER;
}

function isSuperAdmin(user) {
    return effectiveRole(user) === SUPERADMIN;
}

// "Admin" in the operational sense: admin OR superadmin.
function isAdminRole(user) {
    const r = effectiveRole(user);
    return r === ADMIN || r === SUPERADMIN;
}

module.exports = { SUPERADMIN, ADMIN, MEMBER, effectiveRole, isSuperAdmin, isAdminRole };
