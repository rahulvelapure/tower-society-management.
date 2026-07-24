# Foundation Progress

Status values used below: **CODE COMPLETE** (written, reviewed, not yet run), **VALIDATION PENDING** (code complete, awaiting runtime test results), **VALIDATED** (runtime-tested per `PHASE_1_2_VALIDATION.md` and confirmed working), **BLOCKED** (cannot proceed until something external is resolved).

## Phase 1 - Foundation

**Status: CODE COMPLETE / VALIDATION PENDING**

What's done:
- `server.js` split into `middleware/auth.js` + `routes/{auth,resident,notice,bill,helpdesk,contacts,units}.js`
- Every route now has an explicit auth guard (`ensureAuthenticated`/`ensureApproved`/`ensureAdmin`), including several POST routes that previously had none at all
- Password reset flow: hashed tokens, expiry, single-use, rate-limited, anti-enumeration response, dev-only console fallback (never logs a token in production)
- Upload layer (`config/upload.js`): MIME/extension allowlist, random filenames, size limit - built but **not yet wired into any route**
- CSRF protection (`middleware/csrf.js`) across every state-changing form/request
- `app.set('trust proxy', 1)` for correct behavior behind Render's proxy
- Documentation: `ARCHITECTURE_NOTES.md`, `ROUTE_SECURITY_MATRIX.md`, `PHASE_1_2_VALIDATION.md`

What's NOT done (by design, not oversight):
- No automated tests
- No field-level input validation on several admin forms (see `ROUTE_SECURITY_MATRIX.md`)
- No multi-device session invalidation on password reset (current session only)

**Why not VALIDATED yet:** this environment has no Node.js runtime available, so `npm install`/`npm run dev`/the migration script have never actually been executed. See "Runtime validation commands" below - these need to be run on your machine and the results reported back before this phase can be marked VALIDATED.

## Phase 2 - Flat/Resident Management

**Status: CODE COMPLETE / VALIDATION PENDING**

What's done:
- `models/unitModel.js`: residential flat master for the **confirmed** structure - floors 1-28, 4 flats/floor = 112 flats. Floor range enforced at the schema level (1-28), unique `society+floor+flatNumber` index, canonical flat list exported as the single source of truth. Floors 29 (Gym+Party Hall) / 30 (Terrace) are explicitly **not** residential Units
- `User.society`/`User.unit` ObjectId refs added alongside (not replacing) the original `societyName`/`flatNumber` strings - see `ARCHITECTURE_NOTES.md` for exactly why this is not multi-tenant architecture
- `/units` admin screens: list by floor, add/edit individually, and **Initialize Flat Master** (`/units/initialize`) - a fixed, confirmed 112-flat initializer with a safety preview + POST + CSRF + confirmation. No arbitrary-structure generation is exposed
- `scripts/migrateUnits.js`: **separate** from initialization. Links existing residents to already-created canonical flats only, never invents Units from malformed legacy data. Idempotent, `--dry-run` (zero writes), normalizes harmless formatting, reports unmatched/invalid/conflicts for manual review, documented rollback
- Owner/tenant contact fields on `Unit` best-effort linked to real `User` accounts by email when one exists, to avoid the two records silently disagreeing about who lives where

What's NOT done (by design, not oversight):
- No delete-unit functionality (so "deleting a unit with linked residents" isn't reachable yet - noted for whenever delete is actually added)
- No Facility/Amenity model yet for floors 29/30 (Gym, Party Hall, Terrace) - deferred to a later phase
- No CSV/bulk-import of resident data - only individual entry, the fixed flat-master initializer, and the legacy-flatNumber migration

**Why not VALIDATED yet:** same as Phase 1 - needs an actual run against dev/test data, including the dry-run migration output review.

## Phase 3 - Billing & Payments

**Status: NOT STARTED**

Per explicit direction, no Phase 3 work will begin until Phase 1 and 2 are VALIDATED (runtime-tested, migration dry-run reviewed) and you authorize proceeding.

---

## Runtime validation commands

See the chat response for the exact one-at-a-time PowerShell commands. Short version: `node -v` / `npm -v` → `npm install` → check `.env` → `npm run dev` → verify MongoDB connects → `node scripts/migrateUnits.js --dry-run` → review → `node scripts/migrateUnits.js` → restart → work through `PHASE_1_2_VALIDATION.md`.
