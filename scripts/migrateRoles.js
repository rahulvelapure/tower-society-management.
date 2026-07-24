// Role migration: persist explicit roles on legacy accounts.
//   - The pre-existing administrator account(s) (isAdmin: true, no role field)
//     -> role 'superadmin'   (expected: exactly ONE such account)
//   - All other accounts without a role -> role 'member'
//
// TARGETED: only touches documents missing `role`. IDEMPOTENT: re-running is a
// no-op. REVERSIBLE: db.users.updateMany({}, { $unset: { role: "" } }) restores
// the pre-migration state (isAdmin flags are not modified by this script).
// Never runs automatically - explicit manual action only.
//
// Usage:
//   node scripts/migrateRoles.js --dry-run    (report only, zero writes)
//   node scripts/migrateRoles.js              (apply)

const dotenv = require('dotenv');
dotenv.config();

const mongoose = require('mongoose');
const db = require('../config/db');
const user_collection = require('../models/userModel');

const DRY_RUN = process.argv.includes('--dry-run');

async function run() {
    await db.connectDB();

    const missingRole = await user_collection.User.find(
        { role: { $exists: false } },
        { username: 1, isAdmin: 1, accountStatus: 1 }
    );

    const toSuper = missingRole.filter(u => u.isAdmin === true);
    const toMember = missingRole.filter(u => !u.isAdmin);

    console.log(`\n${DRY_RUN ? '=== DRY RUN (no writes) ===' : '=== APPLYING ROLE MIGRATION ==='}\n`);
    console.log(`Accounts without a role: ${missingRole.length}`);
    console.log(`-> superadmin: ${toSuper.length}  (${toSuper.map(u => u.username).join(', ') || 'none'})`);
    console.log(`-> member:     ${toMember.length}`);

    if (toSuper.length === 0) {
        console.log('\nNote: no legacy admin account found without a role. Either migration already ran, or no admin exists.');
    }
    if (toSuper.length > 1) {
        console.warn('\nWARNING: more than one legacy isAdmin account found. Expected exactly one (the original administrator).');
        console.warn('All listed accounts would become SUPERADMIN. Review before applying; demote extras via /admins afterwards if needed.');
    }

    if (!DRY_RUN) {
        for (const u of toSuper) {
            await user_collection.User.updateOne({ _id: u._id }, { $set: { role: 'superadmin' } });
        }
        if (toMember.length) {
            await user_collection.User.updateMany(
                { role: { $exists: false }, isAdmin: { $ne: true } },
                { $set: { role: 'member' } }
            );
        }
        console.log('\nApplied. Roles are now explicit; lib/roles.js fallback no longer needed for these accounts.');
    } else {
        console.log('\nDry run only - re-run without --dry-run to apply.');
    }

    await mongoose.disconnect();
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
