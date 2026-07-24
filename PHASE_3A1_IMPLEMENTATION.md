# Phase 3A-1 Implementation — Roles, Financial Foundation, Stripe Hardening

Implements the first sub-phase of `PHASE_3_BILLING_ARCHITECTURE.md` plus the role
architecture and payment-gateway hardening. **No bills generated, no legacy
financial migration, no opening balances, `User.lastPayment` untouched as the
authoritative dues source.**

## Role architecture

- `User.role` enum: `superadmin | admin | member` — **authoritative**. Legacy
  `isAdmin` boolean kept synchronized by a pre-save hook (role ≠ member → true)
  so all existing views/checks work unchanged during transition.
- `lib/roles.js` is the only interpreter: `effectiveRole()` resolves legacy
  docs without `role` (isAdmin:true → superadmin — safe because exactly one
  such account exists and new admins always get explicit roles). **No email
  matching anywhere.**
- Middleware: `ensureAdmin` = admin|superadmin (role-based); new
  `ensureSuperAdmin`. All other guards unchanged.
- **Existing administrator account: untouched.** No password/unit/data changes.
  It behaves as superadmin immediately via the fallback; `scripts/migrateRoles.js`
  persists the role explicitly:
  - `node scripts/migrateRoles.js --dry-run` → report only (zero writes)
  - `node scripts/migrateRoles.js` → targeted, idempotent; warns if >1 legacy
    admin found; reversible via `db.users.updateMany({}, {$unset:{role:""}})`.
  Never runs automatically.

### Superadmin-only Admin Management (`/admins`, System → Administrators)
List (name/contact/role/status/created) · Promote member→admin · Demote
admin→member · Deactivate/Reactivate admin. **Superadmin accounts cannot be
targeted by any of these routes at all** (plus a count-based last-superadmin
integrity check), so zero-superadmin states are impossible here. Promotion only
from existing activated members — no public/direct admin creation, no shared
credentials. Admin/superadmin accounts are also excluded from Member
Management's status route. Admins cannot reach `/admins` (server-enforced).

### Audit
`lib/audit.js` → `auditlogs` collection (append-only, non-throwing):
`ADMIN_PROMOTED/DEMOTED/DEACTIVATED/REACTIVATED`, `PAYMENT_VERIFIED` (this
round); financial actions enum reserved for 3A-2+. Actor + role + target +
timestamp + safe metadata only; never secrets/tokens.

## Financial foundation (models only — zero data created)

`models/financeModels.js`: BillingPeriod, Bill, Payment, Receipt, Adjustment,
Counter, StripeEvent, AuditLog — exactly per the approved architecture, all
amounts integer paise with integer validators.

Key indexes: `billingperiods {society, periodStart}` unique · `bills {unit,
period}` unique (one bill per flat per period) · `bills.billNumber` unique
sparse · `payments {provider, providerRef}` unique · `receipts.payment` unique ·
`receipts.receiptNumber` unique · `stripeevents.eventId` unique · ledger-query
indexes on `{unit, issueDate}` / `{unit, paidAt}`.

Helpers: `lib/money.js` (toPaise/formatPaise/assertPaise), `lib/counters.js`
(atomic `$inc` numbering, Indian FY April–March, proposed formats
`27E/2026-27/000123` & `REC/2026-27/000456` — unused in production until
3A-3/3A-7 and still approval-gated).

## Stripe gateway — findings & fixes this round

Audited end-to-end at HEAD. Prior stabilization fixes (server-authoritative
amount from `makePayment`, `payment_status==='paid'`, `client_reference_id`
ownership binding, dynamic host URLs) verified intact and retained.

**Issues found & fixed now:**
1. Missing `SECRET_KEY` produced an unexplained failure → `/checkout-session`
   now returns a clear 503 "Online payments are not configured yet" and the
   Pay button surfaces it; `/success` no-ops safely.
2. Invalid/garbage `session_id` on `/success` → was a 500; now a friendly
   redirect (`/bill?payment=invalid`). Unpaid session → `?payment=pending`
   ("will be confirmed shortly"), cancel → `?payment=cancelled` banner. No
   Stripe internals exposed.
3. Hardcoded-domain risk permanently closed via optional **`APP_BASE_URL`**
   env (canonical origin; falls back to request host, which is safe under
   `trust proxy = 1`). Zero references to any old E-Society domain remain
   (verified by search).
4. Currency check (INR) added at confirmation.
5. Checkout button double-click disabled during session creation; JSON errors
   shown as friendly alerts instead of a broken redirect.

**Signed webhook implemented** (`POST /webhooks/stripe`):
- Mounted in `server.js` **before** body parsers/session/CSRF with
  `express.raw` — signature verification gets the exact raw body, and the
  route is outside CSRF **by construction** (it authenticates via
  `stripe.webhooks.constructEvent` + `STRIPE_WEBHOOK_SECRET`), with no
  weakening of the global CSRF middleware.
- Idempotent: unique `StripeEvent.eventId` gate (replays 200 early) + unique
  `Payment {provider, providerRef}` inside the shared recorder. Failed
  processing clears the event marker so Stripe's retry can reprocess.
- `STRIPE_WEBHOOK_SECRET` unset → endpoint returns 503 (fails safe); the
  verified `/success` flow remains the recorder until you configure the
  webhook in the Stripe dashboard + env var.

## Legacy compatibility (no dual-truth)

One shared recorder — `lib/payments.recordStripePayment()` — is used by BOTH
the webhook and `/success`. Per confirmed session it does exactly once
(enforced by the unique index, race-safe):
1. Insert immutable `Payment` row (`legacyEffect: true`) — the beginning of
   real history, **not used by any dues calculation yet**;
2. Apply the legacy authoritative effect: update `User.lastPayment` exactly as
   before.

So dues math is unchanged, webhook+redirect can both fire without double
effects, and Case 10 (browser closed after paying) is covered once the webhook
secret is configured. At 3A-9 cutover, opening balances derive from the legacy
state these payments already updated — consistent by construction.

## Validation status

- **AUTOMATED (script provided, not yet executed — no Node in the dev
  sandbox):** `node scripts/selftest.js` — money conversion/validation, legacy
  billing formula regression (5 cases incl. the documented month-boundary
  quirk), FY boundaries, role resolution. Run it locally/CI.
- **CODE-VERIFIED:** all Part X cases 1–9 traced through the new code; role
  boundary checks (admin can't self-promote/touch superadmin; resident can't
  reach admin routes; last-superadmin protection); no `req.body` amount trust
  anywhere; secret scan clean.
- **RUNTIME-PENDING (your checklist):** admin login unchanged → Administrators
  page visible → promote/demote/deactivate a test member → Stripe test payment
  (cases 1–4, 7) → optionally configure `STRIPE_WEBHOOK_SECRET` + Stripe CLI
  replay (cases 9–10) → `node scripts/migrateRoles.js --dry-run` then apply.

## Rollback notes

All changes are additive. Roles: `$unset role` restores pre-migration state.
Finance collections: contain no documents until webhook/success records a
payment; dropping them loses only post-deploy payment *history* rows (legacy
`lastPayment` remains authoritative). Webhook: unset `STRIPE_WEBHOOK_SECRET`.

## What remains for 3A-2+

Billing configuration UI + BillingPeriods CRUD (3A-2) → preview/generate/issue
(3A-3) → ledger (3A-4) → manual payments/allocation/adjustments (3A-5) →
webhook allocation + `/success` fully presentational (3A-6) → receipts (3A-7)
→ dashboard (3A-8) → cutover (3A-9). Awaiting §18 business decisions from the
architecture document before 3A-2 configuration is built.
