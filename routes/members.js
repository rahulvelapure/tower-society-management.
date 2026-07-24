const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const mongoose = require('mongoose');
const user_collection = require("../models/userModel");
const society_collection = require("../models/societyModel");
const unit_collection = require("../models/unitModel");
const mailer = require("../config/mailer");
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

// POST /members - create member + issue activation link
router.post("/members", ensureAdmin, async (req, res) => {
    const society = await getSociety(req);
    try {
        if (!society) return res.status(500).send("Society not configured");
        const units = await loadUnits(society._id);

        const email = (req.body.username || '').trim().toLowerCase();
        const rerender = (error) => res.render("memberForm", { member: req.body, units, error });

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return rerender("Please enter a valid email address.");
        if (!mongoose.isValidObjectId(req.body.unitId)) return rerender("Please select a flat.");
        const unit = await unit_collection.Unit.findOne({ _id: req.body.unitId, society: society._id });
        if (!unit) return rerender("Please select a valid flat.");
        const occupancyType = ['owner', 'tenant', 'family', 'occupant'].includes(req.body.occupancyType) ? req.body.occupancyType : undefined;
        if (!occupancyType) return rerender("Please select an occupancy type.");

        const existing = await user_collection.User.findOne({ username: email });
        if (existing) return rerender("A member with that email already exists.");

        // Admin-created member: authorized (validation 'approved') but not yet
        // activated - no password is set; the resident sets their own via the link.
        const rawToken = crypto.randomBytes(32).toString('hex');
        const user = new user_collection.User({
            username: email,
            firstName: (req.body.firstName || '').trim(),
            lastName: (req.body.lastName || '').trim(),
            phoneNumber: req.body.phoneNumber,
            societyName: society.societyName,
            society: society._id,
            unit: unit._id,
            flatNumber: unit.flatNumber,
            occupancyType,
            isAdmin: false,
            validation: 'approved',
            accountStatus: 'invited',
            activationToken: hashToken(rawToken),
            activationExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        });
        await user.save();

        syncUnitOccupancy(unit, user, occupancyType);
        await unit.save();

        const link = activationLink(req, rawToken);
        // Try to email the resident. If SMTP isn't configured, mailer no-ops (and
        // never prints the token in production logs). The admin is shown the link
        // on the next screen either way, so onboarding works before SMTP is set up.
        await mailer.sendMail({
            to: email,
            subject: `Activate your ${society.societyName} account`,
            text: `You've been added to the ${society.societyName} community portal. Set your password to activate your account (link valid for 7 days):\n${link}`
        });

        res.render("memberCreated", { member: user, unit, activationLink: link });
    } catch (err) {
        if (err.code === 11000) {
            const units = society ? await loadUnits(society._id) : [];
            return res.render("memberForm", { member: req.body, units, error: "A member with that email already exists." });
        }
        console.error(err);
        res.status(500).send("Server error");
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
    try {
        const society = await getSociety(req);
        const member = await user_collection.User.findById(req.params.id);
        if (!member) return res.status(404).send("Not found");

        const units = await loadUnits(society._id);
        const rerender = (error) => res.render("memberForm", { member: { ...member.toObject(), ...req.body, _id: member._id }, units, error });

        if (!mongoose.isValidObjectId(req.body.unitId)) return rerender("Please select a flat.");
        const unit = await unit_collection.Unit.findOne({ _id: req.body.unitId, society: society._id });
        if (!unit) return rerender("Please select a valid flat.");
        const occupancyType = ['owner', 'tenant', 'family', 'occupant'].includes(req.body.occupancyType) ? req.body.occupancyType : member.occupancyType;

        member.firstName = (req.body.firstName || '').trim();
        member.lastName = (req.body.lastName || '').trim();
        member.phoneNumber = req.body.phoneNumber;
        member.unit = unit._id;
        member.flatNumber = unit.flatNumber;
        member.occupancyType = occupancyType;
        await member.save();

        syncUnitOccupancy(unit, member, occupancyType);
        await unit.save();

        res.redirect("/members");
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

// POST /members/:id/status - activate / deactivate
router.post("/members/:id/status", ensureAdmin, async (req, res) => {
    try {
        const member = await user_collection.User.findById(req.params.id);
        if (!member) return res.status(404).send("Not found");
        // Guard: an admin can't lock themselves out.
        if (String(member._id) === String(req.user.id)) return res.redirect("/members");

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
        await mailer.sendMail({
            to: member.username,
            subject: `Activate your ${society ? society.societyName : ''} account`,
            text: `Set your password to activate your account (link valid for 7 days):\n${link}`
        });

        const unit = member.unit ? await unit_collection.Unit.findById(member.unit) : null;
        res.render("memberCreated", { member, unit, activationLink: link, resent: true });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

module.exports = router;
