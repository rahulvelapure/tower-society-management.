// Resident -> Unit migration. This is SEPARATE from initializing the flat master:
//   1. First initialize the canonical 112-flat master (admin UI: /units/initialize)
//   2. Then dry-run this migration        -> node scripts/migrateUnits.js --dry-run
//   3. Review invalid/conflicting records
//   4. Then run it for real               -> node scripts/migrateUnits.js
//
// This script LINKS existing users to already-existing canonical Units by their
// legacy free-text `flatNumber`. It NEVER creates Units and NEVER invents flats
// from malformed legacy data - if the flat master hasn't been initialized, or a
// legacy value doesn't normalize to one of the 112 canonical flats, the user is
// reported for manual review instead. It also backfills the `society` ObjectId
// ref. It never modifies or removes `flatNumber`/`societyName`.
//
// This does NOT run on app startup or during `npm install` - it is an explicit,
// manual action only.
//
// ROLLBACK / BACKOUT: this migration only ever sets `user.society` and `user.unit`
// (it does not create Units or touch Unit documents). To revert:
//
//   db.users.updateMany({}, { $unset: { society: "", unit: "" } })
//
// (Initialized Unit documents are left in place - drop them separately via the
// flat-master rollback if needed.) Take a `mongodump` backup before running for
// real - see PHASE_1_2_VALIDATION.md.

const dotenv = require('dotenv');
dotenv.config();

const mongoose = require('mongoose');
const db = require('../config/db');
const user_collection = require('../models/userModel');
const society_collection = require('../models/societyModel');
const unit_collection = require('../models/unitModel');

const DRY_RUN = process.argv.includes('--dry-run');

// Normalize a legacy free-text flatNumber to a bare canonical flat number string,
// but ONLY when the result is unambiguous. Returns null otherwise (caller reports
// it for manual review rather than guessing). Handles harmless formatting noise:
//   "101"       -> "101"
//   " 101 "     -> "101"
//   "Flat 101"  -> "101"
//   "FLAT-1203" -> "1203"
// Anything with more than one distinct number, or no number, is ambiguous -> null.
function normalizeFlatNumber(raw) {
    if (raw === undefined || raw === null) return null;
    const str = String(raw).trim();
    if (!str) return null;

    // Pull all digit-runs; accept only if there's exactly one.
    const numbers = str.match(/\d+/g);
    if (!numbers || numbers.length !== 1) return null;

    return numbers[0];
}

async function run() {
    await db.connectDB();

    const societies = await society_collection.Society.find();

    const summary = {
        usersScanned: 0,
        usersWithFlatNumber: 0,
        societyRefsBackfilled: 0,
        usersToLink: 0,
        alreadyLinked: 0,
        noFlatMasterInitialized: 0,
        unmatched: [],       // normalized to a value that isn't a canonical flat (e.g. 2901, 3001, 105)
        invalid: [],         // couldn't normalize at all (empty, "ABC", multiple numbers)
        conflicts: []        // >1 user mapping to the same canonical flat
    };

    for (const society of societies) {
        // Build this society's canonical flatNumber -> Unit._id map from the
        // ALREADY-INITIALIZED master. If it's empty, we don't link anyone (and we
        // don't create anything) - the admin must initialize the master first.
        const canonicalUnits = await unit_collection.Unit.find({ society: society._id });
        const canonicalByFlat = new Map();
        canonicalUnits.forEach(u => canonicalByFlat.set(u.flatNumber, u));

        const flatToUsers = new Map(); // canonical flatNumber -> [usernames] (for conflict detection)

        const societyUsers = await user_collection.User.find({ societyName: society.societyName });

        for (const user of societyUsers) {
            summary.usersScanned++;

            const needsSocietyRefBackfill = !user.society;
            if (needsSocietyRefBackfill) {
                summary.societyRefsBackfilled++;
                if (!DRY_RUN) user.society = society._id;
            }

            const saveBackfillIfNeeded = async () => {
                if (!DRY_RUN && needsSocietyRefBackfill) await user.save();
            };

            if (user.unit) {
                summary.alreadyLinked++;
                await saveBackfillIfNeeded();
                continue;
            }

            if (!user.flatNumber) {
                summary.invalid.push({ user: user.username, flatNumber: user.flatNumber, reason: 'no flatNumber' });
                await saveBackfillIfNeeded();
                continue;
            }

            summary.usersWithFlatNumber++;

            const normalized = normalizeFlatNumber(user.flatNumber);
            if (normalized === null) {
                summary.invalid.push({ user: user.username, flatNumber: user.flatNumber, reason: 'could not unambiguously normalize' });
                await saveBackfillIfNeeded();
                continue;
            }

            // Must map to a real canonical residential flat. Values like 2901/3001
            // (non-residential floors) or 105 (no 5th flat) are NOT canonical, so
            // they're reported rather than linked - and never created.
            if (!unit_collection.CANONICAL_FLAT_NUMBERS.has(normalized)) {
                summary.unmatched.push({ user: user.username, flatNumber: user.flatNumber, normalized, reason: 'not one of the 112 canonical residential flats' });
                await saveBackfillIfNeeded();
                continue;
            }

            const unit = canonicalByFlat.get(normalized);
            if (!unit) {
                // Canonical flat is valid but no Unit doc exists yet -> master not initialized.
                summary.noFlatMasterInitialized++;
                summary.unmatched.push({ user: user.username, flatNumber: user.flatNumber, normalized, reason: 'flat master not initialized for this flat (run /units/initialize first)' });
                await saveBackfillIfNeeded();
                continue;
            }

            if (!flatToUsers.has(normalized)) flatToUsers.set(normalized, []);
            flatToUsers.get(normalized).push(user.username);

            summary.usersToLink++;
            if (!DRY_RUN) {
                user.unit = unit._id;
                await user.save(); // also persists the society backfill
            } else {
                await saveBackfillIfNeeded();
            }
        }

        for (const [flatNumber, usernames] of flatToUsers.entries()) {
            if (usernames.length > 1) {
                summary.conflicts.push({ flatNumber, users: usernames });
            }
        }
    }

    console.log(`\n${DRY_RUN ? '=== DRY RUN (no database changes made) ===' : '=== MIGRATION APPLIED ==='}\n`);
    console.log(`Users scanned:                 ${summary.usersScanned}`);
    console.log(`Users with flat numbers:       ${summary.usersWithFlatNumber}`);
    console.log(`Society refs backfilled:       ${summary.societyRefsBackfilled}`);
    console.log(`Users linked to a canonical flat: ${summary.usersToLink}`);
    console.log(`Already linked (skipped):      ${summary.alreadyLinked}`);
    console.log(`Unmatched (need review):       ${summary.unmatched.length}`);
    console.log(`Invalid (need review):         ${summary.invalid.length}`);
    console.log(`Conflicts (same flat, >1 user): ${summary.conflicts.length}`);

    if (summary.unmatched.length) {
        console.log('\nUnmatched - normalized to a value that is NOT one of the 112 canonical residential flats (e.g. 2901/3001 non-residential, 105 no such flat, or master not initialized). No Unit created/linked - add/fix manually:');
        console.log(summary.unmatched);
    }
    if (summary.invalid.length) {
        console.log('\nInvalid - flatNumber missing or could not be unambiguously normalized. No Unit created/linked - fix manually:');
        console.log(summary.invalid);
    }
    if (summary.conflicts.length) {
        console.log('\nConflicts - more than one user maps to the same canonical flat. Review manually:');
        console.log(summary.conflicts);
    }

    if (DRY_RUN) {
        console.log('\nThis was a dry run - no changes were made. Review the output above, then re-run without --dry-run to apply.');
    }

    await mongoose.disconnect();
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
