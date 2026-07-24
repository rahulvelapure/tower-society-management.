const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const user_collection = require("../models/userModel");
const roles = require("../lib/roles");
const audit = require("../lib/audit");
const { ensureSuperAdmin } = require("../middleware/auth");

// All routes here are SUPERADMIN-ONLY, server-enforced. Design invariants:
// - A superadmin can never be demoted, deactivated, or modified through these
//   routes at all - so the "last superadmin" can never be lost here. (Creating
//   additional superadmins is intentionally not exposed either.)
// - Admins are individual named accounts promoted from existing members;
//   there is no public or direct admin creation.
// - Every action is audited with the acting account.

// Extra data-integrity safeguard on top of the route guards: refuse any state
// where the count of active superadmins would drop below one.
async function wouldOrphanSuperAdmin(targetUser) {
    if (!roles.isSuperAdmin(targetUser)) return false;
    const count = await user_collection.User.countDocuments({
        $or: [{ role: 'superadmin' }, { role: { $exists: false }, isAdmin: true }],
        accountStatus: { $ne: 'inactive' }
    });
    return count <= 1;
}

router.get("/admins", ensureSuperAdmin, async (req, res) => {
    try {
        const users = await user_collection.User.find({}, {
            firstName: 1, lastName: 1, username: 1, phoneNumber: 1,
            role: 1, isAdmin: 1, accountStatus: 1, createdAt: 1, flatNumber: 1
        }).sort({ createdAt: 1 });

        const admins = users.filter(u => roles.isAdminRole(u));
        // Promotable: active members with a set password (activated accounts)
        const promotable = users.filter(u =>
            roles.effectiveRole(u) === 'member' && u.accountStatus !== 'inactive');

        res.render("admins", { admins, promotable, effectiveRole: roles.effectiveRole });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

// Promote an existing member -> ADMIN
router.post("/admins/:id/promote", ensureSuperAdmin, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.redirect("/admins");
        const target = await user_collection.User.findById(req.params.id);
        if (!target) return res.redirect("/admins");
        if (roles.effectiveRole(target) !== 'member') return res.redirect("/admins"); // only members can be promoted

        target.role = 'admin'; // pre-save hook syncs isAdmin = true
        await target.save();

        await audit.record({
            actor: req.user, action: 'ADMIN_PROMOTED', entityType: 'User', entityId: target._id,
            context: { target: target.username, from: 'member', to: 'admin' }
        });
        res.redirect("/admins");
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

// Demote ADMIN -> member. Superadmins can never be targeted.
router.post("/admins/:id/demote", ensureSuperAdmin, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.redirect("/admins");
        const target = await user_collection.User.findById(req.params.id);
        if (!target) return res.redirect("/admins");
        if (roles.isSuperAdmin(target) || await wouldOrphanSuperAdmin(target)) return res.redirect("/admins");
        if (roles.effectiveRole(target) !== 'admin') return res.redirect("/admins");

        target.role = 'member'; // hook syncs isAdmin = false
        await target.save();

        await audit.record({
            actor: req.user, action: 'ADMIN_DEMOTED', entityType: 'User', entityId: target._id,
            context: { target: target.username, from: 'admin', to: 'member' }
        });
        res.redirect("/admins");
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

// Deactivate / reactivate an ADMIN account. Superadmins can never be targeted.
router.post("/admins/:id/status", ensureSuperAdmin, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.redirect("/admins");
        const target = await user_collection.User.findById(req.params.id);
        if (!target) return res.redirect("/admins");
        if (roles.isSuperAdmin(target)) return res.redirect("/admins");
        if (String(target._id) === String(req.user.id)) return res.redirect("/admins");
        if (roles.effectiveRole(target) !== 'admin') return res.redirect("/admins");

        if (req.body.action === 'deactivate') {
            target.accountStatus = 'inactive';
            await target.save();
            await audit.record({
                actor: req.user, action: 'ADMIN_DEACTIVATED', entityType: 'User', entityId: target._id,
                context: { target: target.username }
            });
        } else if (req.body.action === 'activate') {
            target.accountStatus = target.salt ? 'active' : 'invited';
            await target.save();
            await audit.record({
                actor: req.user, action: 'ADMIN_REACTIVATED', entityType: 'User', entityId: target._id,
                context: { target: target.username }
            });
        }
        res.redirect("/admins");
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

module.exports = router;
