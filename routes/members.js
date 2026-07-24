const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const mongoose = require('mongoose');
const user_collection = require("../models/userModel");
const society_collection = require("../models/societyModel");
const unit_collection = require("../models/unitModel");
const mailer = require("../config/mailer");
const roles = require("../lib/roles");
const { ensureAdmin } = require("../middleware/auth");

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

async function getSociety(req) {
    if (req.user.society) {
        const s = await society_collection.Society.findById(req.user.society);
        if (s) return s;
    }
    return society_collection.getConfiguredSociety();
}

function loadUnits(societyId) {
    return unit_collection.Unit.find({ society: societyId }).sort({ floor: 1, flatNumber: 1 });
}

// Keep the Unit's occupancy record in step with the member's occupancyType, so
// dashboard occupancy counts reflect reality. User.unit remains the authoritative
// membership link; this just denormalizes contact info onto the Unit.
function syncUnitOccupancy(unit, user, occupancyType) {
    const contact = { user: user._id, name: `${user.firstName} ${user.lastName}`, phone: String(user.phoneNumber || ''), email: user.username };
    if (occupancyType === 'owner') {
        unit.owner = contact;
        unit.occupancyStatus = 'owner-occupied';
    } else if (occupancyType === 'tenant') {
        unit.tenant = { ...contact };
        unit.occupancyStatus = 'tenant-occupied';
    } else if (occupancyType === 'family' || occupancyType === 'occupant') {
        unit.occupants = unit.occupants || [];
        if (!unit.occupants.some(o => o.name === contact.name)) {
            unit.occupants.push({ name: contact.name, relation: occupancyType });
        }
    }
}

function activationLink(req, rawToken) {
    return `${req.protocol}://${req.get('host')}/activate/${rawToken}`;
}

// GET /members - list + search/filter
router.get("/members", ensureAdmin, async (req, res) => {
    try {
        const society = await getSociety(req);
        if (!society) return res.status(500).send("Society not configured");

        const q = (req.query.q || '').trim();
        const status = req.query.status || '';
        const occupancy = req.query.occupancy || '';

        const filter = { $or: [{ society: society._id }, { societyName: society.societyName }] };
        if (status) filter.accountStatus = status;
        if (occupancy) filter.occupancyType = occupancy;
        if (q) {
            const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            filter.$and = [{ $or: [{ firstName: rx }, { lastName: rx }, { username: rx }, { flatNumber: rx }] }];
        }

        const members = await user_collection.User.find(filter).populate('unit').sort({ createdAt: -1 });
        res.render("members", { members, q, status, occupancy });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

// GET /members/new
router.get("/members/new", ensureAdmin, async (req, res) => {
    try {
        const society = await getSociety(req);
        const units = society ? await loadUnits(society._id) : [];
        res.render("memberForm", { member: null, units, error: null });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

// Basic sanity check for phone input: digits, optional leading +, spaces/hyphens,
// 7-15 digits total. Deliberately permissive about formatting but rejects garbage.
function isValidPhone(raw) {
    const str = String(raw || '').trim();
    const digits = str.replace(/\D/g, '');
    return /^[+0-9][0-9\s()-]*$/.test(str) && digits.length >= 7 && digits.length <= 15;
}

// Guard against silently stealing a flat's primary owner/tenant slot. Returns an
// error message when the slot is already held by a DIFFERENT registered member;
// null when the slot is free, held by contact-info only (no account), or held by
// this same user (edit case).
function occupancyConflict(unit, occupancyType, userId) {
    if (occupancyType === 'owner' && unit.owner && unit.owner.user && String(unit.owner.user) !== String(userId || '')) {
        return `Flat ${unit.flatNumber} already has a registered owner (${unit.owner.name || 'existing member'}). Edit that member instead, or choose a different occupancy type.`;
    }
    if (occupancyType === 'tenant' && unit.tenant && unit.tenant.user && String(unit.tenant.user) !== String(userId || '')) {
        return `Flat ${unit.flatNumber} already has a registered tenant (${unit.tenant.name || 'existing member'}). Edit that member instead, or choose a different occupancy type.`;
    }
    return null;
}

// POST /members - create member + issue activation link
router.post("/members", ensureAdmin, async (req, res) => {
    let society = null;
    let units = [];
    const rerender = (error) => res.render("memberForm", { member: req.body, units, error });

    try {
        society = await getSociety(req);
        if (!society) {
            return res.render("memberForm", {
                member: req.body, units: [],
                error: "The society record is not configured yet. Please contact support before adding members."
            });
        }
        units = await loadUnits(society._id);
        if (!units.length) {
            return rerender("The Flat Master has not been initialized. Initialize the 112 flats first (Flats → Initialize Flat Master).");
        }

        const email = (req.body.username || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return rerender("Please enter a valid email address.");
        if (!(req.body.firstName || '').trim() || !(req.body.lastName || '').trim()) return rerender("Please enter the member's first and last name.");
        if (!isValidPhone(req.body.phoneNumber)) return rerender("Please enter a valid phone number (7-15 digits; +, spaces and hyphens are fine).");
        if (!mongoose.isValidObjectId(req.body.unitId)) return rerender("Please select a flat.");
        // Unit must exist AND belong to this society's canonical master - the
        // schema itself restricts Units to residential floors 1-28, so amenity
        // floors (29/30) can never be selected or tampered into place.
        const unit = await unit_collection.Unit.findOne({ _id: req.body.unitId, society: society._id });
        if (!unit) return rerender("The selected flat could not be found. Please select a valid flat.");
        const occupancyType = ['owner', 'tenant', 'family', 'occupant'].includes(req.body.occupancyType) ? req.body.occupancyType : undefined;
        if (!occupancyType) return rerender("Please select an occupancy type.");

        const conflict = occupancyConflict(unit, occupancyType, null);
        if (conflict) return rerender(conflict);

        const existing = await user_collection.User.findOne({ username: email });
        if (existing) return rerender("A member with this email already exists.");

        // Admin-created member: authorized (validation 'approved') but not yet
        // activated - no password is set; the resident sets their own via the link.
        const rawToken = crypto.randomBytes(32).toString('hex');
        const user = new user_collection.User({
            username: email,
            firstName: (req.body.firstName || '').trim(),
            lastName: (req.body.lastName || '').trim(),
            phoneNumber: String(req.body.phoneNumber).trim(),
            societyName: society.societyName,
            society: society._id,
            unit: unit._id,
            flatNumber: unit.flatNumber,
            occupancyType,
            role: 'member',
            isAdmin: false,
            validation: 'approved',
            accountStatus: 'invited',
            activationToken: hashToken(rawToken),
            activationExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        });
        await user.save();

        // Denormalized occupancy sync is best-effort: the member account is the
        // authoritative record and already exists, so a failure here must not
        // 500 the request or strand a half-created flow. Log and continue.
        try {
            syncUnitOccupancy(unit, user, occupancyType);
            await unit.save();
        } catch (syncErr) {
            console.error(`Unit occupancy sync failed for flat ${unit.flatNumber} (member ${user._id}):`, syncErr.message);
        }

        const link = activationLink(req, rawToken);
        // Email is also best-effort: if SMTP isn't configured the mailer no-ops
        // (never printing the token in production logs), and the admin is shown
        // the one-time link on the next screen either way.
        let emailFailed = false;
        try {
            await mailer.sendMail({
                to: email,
                subject: `Activate your ${society.societyName} account`,
                text: `You've been added to the ${society.societyName} community portal. Set your password to activate your account (link valid for 7 days):\n${link}`
            });
        } catch (mailErr) {
            emailFailed = true;
            console.error(`Activation email to ${email} failed:`, mailErr.message);
        }

        res.render("memberCreated", { member: user, unit, activationLink: link, emailFailed });
    } catch (err) {
        // Duplicate email raced past the pre-check (e.g. double submit).
        if (err.code === 11000) {
            return rerender("A member with this email already exists.");
        }
        // Schema/cast validation - show the admin a friendly message, not a 500.
        if (err.name === 'ValidationError' || err.name === 'CastError') {
            console.error("Member creation validation failed:", err.message);
            return rerender("Some of the entered details are invalid. Please check the highlighted fields and try again.");
        }
        console.error("Member creation failed:", err);
        res.status(500).send("Something went wrong creating the member. The error has been logged.");
    }
});

// GET /members/:id/edit
router.get("/members/:id/edit", ensureAdmin, async (req, res) => {
    try {
        const society = await getSociety(req);
        const member = await user_collection.User.findById(req.params.id);
        if (!member) return res.status(404).send("Not found");
        const units = society ? await loadUnits(society._id) : [];
        res.render("memberForm", { member, units, error: null });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

// POST /members/:id - update member
router.post("/members/:id", ensureAdmin, async (req, res) => {
    let member = null;
    let units = [];
    const rerender = (error) => res.render("memberForm", {
        member: member ? { ...member.toObject(), ...req.body, _id: member._id } : req.body,
        units, error
    });

    try {
        const society = await getSociety(req);
        if (!society) return res.status(404).send("Society not configured");
        member = await user_collection.User.findById(req.params.id);
        if (!member) return res.status(404).send("Not found");

        units = await loadUnits(society._id);

        if (!(req.body.firstName || '').trim() || !(req.body.lastName || '').trim()) return rerender("Please enter the member's first and last name.");
        if (!isValidPhone(req.body.phoneNumber)) return rerender("Please enter a valid phone number (7-15 digits; +, spaces and hyphens are fine).");
        if (!mongoose.isValidObjectId(req.body.unitId)) return rerender("Please select a flat.");
        const unit = await unit_collection.Unit.findOne({ _id: req.body.unitId, society: society._id });
        if (!unit) return rerender("The selected flat could not be found. Please select a valid flat.");
        const occupancyType = ['owner', 'tenant', 'family', 'occupant'].includes(req.body.occupancyType) ? req.body.occupancyType : member.occupancyType;

        // Same-member re-save is allowed; taking a slot held by someone else isn't.
        const conflict = occupancyConflict(unit, occupancyType, member._id);
        if (conflict) return rerender(conflict);

        member.firstName = (req.body.firstName || '').trim();
        member.lastName = (req.body.lastName || '').trim();
        member.phoneNumber = String(req.body.phoneNumber).trim();
        member.unit = unit._id;
        member.flatNumber = unit.flatNumber;
        member.occupancyType = occupancyType;
        await member.save();

        try {
            syncUnitOccupancy(unit, member, occupancyType);
            await unit.save();
        } catch (syncErr) {
            console.error(`Unit occupancy sync failed for flat ${unit.flatNumber} (member ${member._id}):`, syncErr.message);
        }

        res.redirect("/members");
    } catch (err) {
        if (err.name === 'ValidationError' || err.name === 'CastError') {
            console.error("Member update validation failed:", err.message);
            return rerender("Some of the entered details are invalid. Please check the fields and try again.");
        }
        console.error("Member update failed:", err);
        res.status(500).send("Something went wrong saving the member. The error has been logged.");
    }
});

// POST /members/:id/status - activate / deactivate
router.post("/members/:id/status", ensureAdmin, async (req, res) => {
    try {
        const member = await user_collection.User.findById(req.params.id);
        if (!member) return res.status(404).send("Not found");
        // Guard: an admin can't lock themselves out.
        if (String(member._id) === String(req.user.id)) return res.redirect("/members");
        // Guard: admin/superadmin accounts are managed only via the superadmin's
        // /admins routes - never through Member Management.
        if (roles.isAdminRole(member)) return res.redirect("/members");

        if (req.body.action === 'deactivate') {
            member.accountStatus = 'inactive';
        } else if (req.body.action === 'activate') {
            // Only accounts that have actually set a password can become active;
            // otherwise they remain 'invited' until they use their activation link.
            member.accountStatus = member.salt ? 'active' : 'invited';
        }
        await member.save();
        res.redirect("/members");
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

// POST /members/:id/resend - regenerate an activation link for an invited member
router.post("/members/:id/resend", ensureAdmin, async (req, res) => {
    try {
        const society = await getSociety(req);
        const member = await user_collection.User.findById(req.params.id);
        if (!member) return res.status(404).send("Not found");

        const rawToken = crypto.randomBytes(32).toString('hex');
        member.activationToken = hashToken(rawToken);
        member.activationExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        if (member.accountStatus !== 'active') member.accountStatus = 'invited';
        await member.save();

        const link = activationLink(req, rawToken);
        let emailFailed = false;
        try {
            await mailer.sendMail({
                to: member.username,
                subject: `Activate your ${society ? society.societyName : ''} account`,
                text: `Set your password to activate your account (link valid for 7 days):\n${link}`
            });
        } catch (mailErr) {
            emailFailed = true;
            console.error(`Activation email to ${member.username} failed:`, mailErr.message);
        }

        const unit = member.unit ? await unit_collection.Unit.findById(member.unit) : null;
        res.render("memberCreated", { member, unit, activationLink: link, resent: true, emailFailed });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

module.exports = router;
