const express = require('express');
const router = express.Router();
const unit_collection = require("../models/unitModel");
const society_collection = require("../models/societyModel");
const user_collection = require("../models/userModel");
const date = require("../date/date");
const { ensureAdmin } = require("../middleware/auth");

// Resolve the logged-in admin's society ObjectId, falling back to a lookup by
// societyName for accounts created before the `society` ref existed.
async function resolveSocietyId(req) {
    if (req.user.society) return req.user.society;
    const foundSociety = await society_collection.Society.findOne({ societyName: req.user.societyName });
    return foundSociety ? foundSociety._id : null;
}

// Best-effort link to a registered User account by email, scoped to this society.
// This is how owner/tenant contact info (entered as plain text) stays reconciled
// with the authoritative User<->Unit link once that person actually has an
// account - see the source-of-truth note in models/unitModel.js.
async function findUserIdByEmail(societyId, email) {
    if (!email) return undefined;
    const match = await user_collection.User.findOne({ society: societyId, username: email });
    return match ? match._id : undefined;
}

function buildUnitPayload(req, societyId, ownerUserId, tenantUserId) {
    return {
        floor: req.body.floor,
        flatNumber: req.body.flatNumber,
        unitType: req.body.unitType,
        areaSqft: req.body.areaSqft || undefined,
        occupancyStatus: req.body.occupancyStatus,
        owner: {
            user: ownerUserId,
            name: req.body.ownerName,
            phone: req.body.ownerPhone,
            email: req.body.ownerEmail
        },
        tenant: {
            user: tenantUserId,
            name: req.body.tenantName,
            phone: req.body.tenantPhone,
            email: req.body.tenantEmail,
            leaseStart: req.body.leaseStart || undefined,
            leaseEnd: req.body.leaseEnd || undefined
        },
        moveInDate: req.body.moveInDate || undefined,
        moveOutDate: req.body.moveOutDate || undefined
    };
}

router.get("/units", ensureAdmin, async (req, res) => {
    try {
        const societyId = await resolveSocietyId(req);
        const units = societyId
            ? await unit_collection.Unit.find({ society: societyId }).sort({ floor: 1, flatNumber: 1 })
            : [];

        const q = (req.query.q || '').trim();
        const occupancy = req.query.occupancy || '';

        const unitByFlat = new Map();
        units.forEach(u => unitByFlat.set(u.flatNumber, u));

        // Build the visual tower from the canonical structure (floors 28 -> 1, 4 slots
        // per floor). Each slot maps to a real Unit doc when initialized, or renders
        // as an "not initialized" placeholder. Search/filter marks matching tiles.
        const floors = [];
        for (let floor = unit_collection.RESIDENTIAL_FLOOR_MAX; floor >= unit_collection.RESIDENTIAL_FLOOR_MIN; floor--) {
            const slots = [];
            for (let i = 1; i <= unit_collection.FLATS_PER_FLOOR; i++) {
                const flatNumber = `${floor}${String(i).padStart(2, '0')}`;
                const unit = unitByFlat.get(flatNumber) || null;
                let matches = true;
                if (q && !flatNumber.includes(q)) matches = false;
                if (occupancy && (!unit || unit.occupancyStatus !== occupancy)) matches = false;
                slots.push({ flatNumber, unit, matches });
            }
            // When filtering, hide floors with no matching slots to keep results scannable.
            if (!(q || occupancy) || slots.some(s => s.matches)) {
                floors.push({ floor, slots });
            }
        }

        const stats = {
            initialized: units.length,
            total: unit_collection.TOTAL_RESIDENTIAL_FLATS,
            occupied: units.filter(u => u.occupancyStatus && u.occupancyStatus !== 'vacant').length
        };

        res.render("units", { floors, stats, q, occupancy, filtering: Boolean(q || occupancy) });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

router.get("/units/new", ensureAdmin, (req, res) => {
    res.render("unitForm", { unit: null, error: null });
});

router.post("/units", ensureAdmin, async (req, res) => {
    try {
        const societyId = await resolveSocietyId(req);
        if (!societyId) return res.status(400).send("Society not found");

        const [ownerUserId, tenantUserId] = await Promise.all([
            findUserIdByEmail(societyId, req.body.ownerEmail),
            findUserIdByEmail(societyId, req.body.tenantEmail)
        ]);

        await unit_collection.Unit.create({
            society: societyId,
            ...buildUnitPayload(req, societyId, ownerUserId, tenantUserId)
        });

        res.redirect("/units");
    } catch (err) {
        // req.body's flat field names (ownerName, tenantName, ...) don't match the
        // nested shape unitForm.ejs expects (unit.owner.name, ...), so on error we
        // just re-show a blank form with the message rather than mis-repopulating it.
        if (err.code === 11000) {
            return res.render("unitForm", {
                unit: null,
                error: `Floor ${req.body.floor}, flat ${req.body.flatNumber} already exists.`
            });
        }
        if (err.name === 'ValidationError') {
            return res.render("unitForm", {
                unit: null,
                error: `Floor must be between 1 and 28 (residential floors only). (${err.message})`
            });
        }
        console.error(err);
        res.status(500).send("Server error");
    }
});

// Initialize the canonical residential flat master from the CONFIRMED tower
// structure (floors 1-28, 4 flats each = 112 flats). This deliberately does NOT
// let the admin choose a floor range or flats-per-floor - the physical structure
// is known and fixed (see models/unitModel.js / ARCHITECTURE_NOTES.md), so there
// is no arbitrary-structure generation exposed in the UI.
//
// NOTE: both routes below must stay registered before /units/:id, or Express would
// match "initialize" as the :id param and these handlers would never be reached.
router.get("/units/initialize", ensureAdmin, async (req, res) => {
    try {
        const societyId = await resolveSocietyId(req);
        const existingCount = societyId
            ? await unit_collection.Unit.countDocuments({ society: societyId })
            : 0;
        res.render("unitInitialize", { existingCount, result: null });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

router.post("/units/initialize", ensureAdmin, async (req, res) => {
    try {
        const societyId = await resolveSocietyId(req);
        if (!societyId) return res.status(400).send("Society not found");

        // Idempotent: insert only the canonical flats that don't already exist.
        // Never touches existing Units, so resident links / occupancy / metadata
        // on already-created flats are preserved.
        const existingFlatNumbers = new Set(
            (await unit_collection.Unit.find({ society: societyId }, { flatNumber: 1 })).map(u => u.flatNumber)
        );

        const result = { expected: unit_collection.CANONICAL_FLATS.length, created: 0, alreadyExisting: 0, errors: 0 };
        const toCreate = [];

        for (const flat of unit_collection.CANONICAL_FLATS) {
            if (existingFlatNumbers.has(flat.flatNumber)) {
                result.alreadyExisting++;
            } else {
                toCreate.push({
                    society: societyId,
                    floor: flat.floor,
                    flatNumber: flat.flatNumber,
                    occupancyStatus: 'vacant'
                });
            }
        }

        if (toCreate.length) {
            try {
                const inserted = await unit_collection.Unit.insertMany(toCreate, { ordered: false });
                result.created = inserted.length;
            } catch (insertErr) {
                // With ordered:false, a race (e.g. duplicate created concurrently)
                // still inserts the rest; count what actually landed.
                result.created = (insertErr.insertedDocs && insertErr.insertedDocs.length) || 0;
                result.errors = toCreate.length - result.created;
                console.error('Some units failed to initialize:', insertErr.message);
            }
        }

        const existingCount = await unit_collection.Unit.countDocuments({ society: societyId });
        res.render("unitInitialize", { existingCount, result });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

// FLAT 360: consolidated admin view of a single unit - occupancy, members,
// financial position, complaints. All values computed from real records.
router.get("/units/:id", ensureAdmin, async (req, res) => {
    try {
        const unit = await unit_collection.Unit.findById(req.params.id);
        if (!unit) return res.status(404).send("Not found");

        const society = await society_collection.Society.findById(unit.society);
        const members = await user_collection.User.find({ unit: unit._id });

        // Monthly maintenance total (same calc the bill page uses)
        const monthlyTotal = society ? Object.values(society.maintenanceBill.toObject ? society.maintenanceBill.toObject() : society.maintenanceBill)
            .filter(v => typeof v === 'number')
            .reduce((s, v) => s + v, 0) : 0;

        // Per-member outstanding using the existing monthDiff convention from routes/bill.js
        const dateToday = new Date();
        let outstanding = 0;
        let lastPayment = null;
        const openComplaints = [];
        members.forEach(m => {
            let totalMonth = 0;
            if (m.lastPayment && m.lastPayment.date) {
                totalMonth = date.monthDiff(m.lastPayment.date, dateToday);
                if (!lastPayment || m.lastPayment.date > lastPayment.date) lastPayment = m.lastPayment;
            } else {
                totalMonth = date.monthDiff(m.createdAt, dateToday) + 1;
            }
            let credit = 0, due = 0;
            if (totalMonth === 0) credit = monthlyTotal;
            else if (totalMonth > 1) due = (totalMonth - 1) * monthlyTotal;
            outstanding += monthlyTotal + due - credit;
            (m.complaints || []).forEach(c => {
                if (c && c.status === 'open') openComplaints.push({ ...c, by: `${m.firstName} ${m.lastName}` });
            });
        });

        res.render("unit360", { unit, members, outstanding, lastPayment, openComplaints, monthlyTotal });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

router.get("/units/:id/edit", ensureAdmin, async (req, res) => {
    try {
        const unit = await unit_collection.Unit.findById(req.params.id);
        if (!unit) return res.status(404).send("Not found");
        res.render("unitForm", { unit, error: null });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

router.post("/units/:id", ensureAdmin, async (req, res) => {
    try {
        const societyId = await resolveSocietyId(req);
        const [ownerUserId, tenantUserId] = await Promise.all([
            findUserIdByEmail(societyId, req.body.ownerEmail),
            findUserIdByEmail(societyId, req.body.tenantEmail)
        ]);

        await unit_collection.Unit.updateOne(
            { _id: req.params.id },
            { $set: buildUnitPayload(req, societyId, ownerUserId, tenantUserId) },
            { runValidators: true }
        );
        res.redirect("/units");
    } catch (err) {
        if (err.code === 11000 || err.name === 'ValidationError') {
            // Re-fetch the pre-edit unit to repopulate the form correctly (req.body's
            // flat field names don't match the nested shape unitForm.ejs expects).
            const existingUnit = await unit_collection.Unit.findById(req.params.id);
            const message = err.code === 11000
                ? `Floor ${req.body.floor}, flat ${req.body.flatNumber} already exists.`
                : `Floor must be between 1 and 28 (residential floors only). (${err.message})`;
            return res.render("unitForm", { unit: existingUnit, error: message });
        }
        console.error(err);
        res.status(500).send("Server error");
    }
});

module.exports = router;
