# Phase 3A-2 Implementation — Billing Configuration + Billing Periods

Implements the second sub-phase of `PHASE_3_BILLING_ARCHITECTURE.md`, building on
`PHASE_3A1_IMPLEMENTATION.md` (roles, financial foundation, Stripe hardening).
Verified at HEAD `3b6543b` before starting. **Zero Bills, zero resident debt,
zero legacy migration — confirmed by code search (no `Bill.create` call exists
anywhere in the codebase).**

## Current state (re-verified this round, not assumed from prior summaries)

Re-read `models/financeModels.js`, `lib/{money,counters,audit,roles}.js`,
`middleware/auth.js`, `routes/{bill,admins,stripeWebhook}.js`, `lib/payments.js`,
`server.js`, `models/{societyModel,unitModel}.js` at HEAD. Confirmed: the 3A-1
financial models existed but nothing populated `BillingConfig`/`ChargeComponent`
(they didn't exist as types yet); `Unit.areaSqft` is optional and not
authoritative for all units (confirmed directly in the schema comment) — this
shaped the PER_SQFT decision below; the webhook is still mounted before
body/session/CSRF at the top of `server.js`, unaffected by this round's changes.

## Cannot GET /webhooks/stripe

Unchanged from the previous round: **expected**. The route remains
`POST`-only. No GET handler was added or considered.

## Billing Configuration

`BillingConfig` (new, in `models/financeModels.js`): **one document per society**
(unique index on `society`) holding `billingFrequency`, `defaultIssueDay`/
`defaultDueDay` (capped 1–28 so every default is valid in every month —
sidesteps Feb/30-day edge cases entirely rather than validating them at save
time), `gracePeriodDays`, bill/receipt number prefixes, and three **reserved,
inert** policy placeholders: `lateFeePolicy` (NONE/FIXED/PERCENTAGE + value —
no formula runs), `partialPaymentPolicy` and `allocationPolicy` (both default
`NOT_DECIDED` — deliberately not defaulted to a real business behavior since
you haven't approved §18 Q12/Q13 yet), `taxApplicability` (fixed
`NOT_CONFIGURED`).

**Why not versioned like ChargeComponent rates:** a `BillingPeriod` snapshots
its own `issueDate`/`dueDate` at creation time (already true in the 3A-1
schema), so changing `BillingConfig` later only affects periods created
*after* the change — already history-safe without needing a second versioned
collection here. This is a design elaboration beyond what
`PHASE_3_BILLING_ARCHITECTURE.md` specified in detail (it didn't fully spec
BillingConfig's own shape), not a deviation from anything it did commit to.

Authorization: `GET /finance/config` — `ensureAdmin` (admin sees read-only,
superadmin sees an Edit button); `GET/POST /finance/config/edit|POST /finance/config`
— `ensureSuperAdmin`. Matches your Part 7 instruction exactly.

**Legacy ₹2,171 configuration:** shown in a clearly separate "Legacy
configuration — reference only, not active" panel on the config page, reading
directly from `Society.maintenanceBill` (untouched, not copied into any new
collection). No new `ChargeComponent` is ever seeded from it.

## Charge Components

`ChargeComponent` (new): `code` (unique per society, 2–20 uppercase
letters/digits/underscores, validated + unique-index backstop), `name`,
`description`, `active`, `calculationMethod` (`FIXED_PER_UNIT` / `PER_SQFT` /
`UNIT_SPECIFIC` / `MANUAL`), `displayOrder`, and **`rateHistory`** — an
append-only array of `{amountPaise, effectiveFrom, setBy, setAt}`. Editing a
component's amount always **appends** a new entry; existing entries are never
edited or removed (Part 17's "April–September ₹X, October ₹Y" requirement).
"Current rate" = latest entry with `effectiveFrom <= now`
(`lib/financeConfig.js#currentRate`).

**PER_SQFT is explicitly marked "not available yet"** in the UI (field hint on
the form) and is **excluded from the automatic preview total** — because
`Unit.areaSqft` is not authoritative for all 112 units. It can still be
*created* (so the admin can define it now for later), it just contributes
nothing to any calculation until real area data exists. `UNIT_SPECIFIC` and
`MANUAL` are excluded from the automatic preview for the same "don't fake it"
reason — they need per-flat input that doesn't exist until bill generation
(3A-3) defines how it's collected. Only `FIXED_PER_UNIT` is auto-calculable
today.

Authorization: create/edit/deactivate/reactivate — `ensureSuperAdmin`
(Part 7: "charge definitions" are master financial configuration).

## Billing Periods

Uses the existing 3A-1 `BillingPeriod` model unchanged (`DRAFT → GENERATED →
ISSUED → CLOSED`; no new statuses invented, per your instruction).

- **Creation** (`ensureAdmin` — operational, per Part 7's "Admin operational
  Billing Period access may be allowed"): admin picks a month via
  `<input type="month">`; `periodStart`/`periodEnd` are computed with
  `new Date(Date.UTC(year, month, 0))` for the period end — correct for every
  month length including leap February, not a fixed 28/30/31 assumption.
  Issue/due dates default from `BillingConfig` if set, else 1st/15th, and are
  admin-adjustable per period.
- **Idempotency / overlap**: the 3A-1 unique index (`society, periodStart`)
  catches an exact-duplicate start date; a separate explicit **range-overlap
  query** (`periodStart <= newEnd AND periodEnd >= newStart`) catches any
  other conflicting range and returns the specific conflicting period's name
  in the error — not just a generic rejection.
- **Editing**: only while `status === 'DRAFT'` (server-enforced, not just
  hidden in the UI).
- **Deletion**: `ensureSuperAdmin`, only for `DRAFT` periods with zero
  associated `Bill` documents (checked via `Bill.countDocuments`) — which, in
  this round, is *every* period, since no route anywhere creates a `Bill`.
  Hard-deleted (not soft-status) since there's nothing to preserve; the
  deletion itself is still audited (`BILLING_PERIOD_STATUS_CHANGED`,
  `context: {from:'DRAFT', to:'DELETED'}`) so the action is attributable even
  after the document is gone.

## Preview (ephemeral — never persisted)

`lib/financeConfig.js#previewTotals(societyId, asOf)`: reads active
`ChargeComponent`s, resolves each one's current rate as of the period's start
date, sums only the auto-calculable ones × 112 flats. Shown on the period
detail page as "Estimate preview — not saved anywhere — recalculated live."
Nothing here writes to `BillingPeriod.totals` (left `undefined` in this
round) or creates any `Bill`. A clearly **disabled** "Generate Bills (Phase
3A-3)" button is shown for visibility, per Part 22's "show a disabled/future
action if useful."

## Authorization matrix (server-side, verified)

| Action | Superadmin | Admin | Member |
|---|---|---|---|
| View billing configuration | ✅ | ✅ (read-only) | ❌ |
| Edit configuration / charge components | ✅ | ❌ | ❌ |
| Create / view / edit (DRAFT) billing periods | ✅ | ✅ | ❌ |
| Delete a DRAFT period | ✅ | ❌ | ❌ |

Residents (`/finance/*`) and admins attempting superadmin-only actions are
redirected by `ensureAdmin`/`ensureSuperAdmin` exactly as in 3A-1 — no new
middleware was written; the existing role guards were reused as-is.

## Audit events

Extended the existing `AuditLog.action` enum (additive; the one unused
placeholder `BILLING_CONFIG_CHANGED` was replaced by the two more specific
values you requested — safe, since nothing had written that value yet):
`BILLING_CONFIG_CREATED`, `BILLING_CONFIG_UPDATED`, `CHARGE_COMPONENT_CREATED`,
`CHARGE_COMPONENT_UPDATED`, `CHARGE_COMPONENT_DEACTIVATED`,
`BILLING_PERIOD_CREATED`, `BILLING_PERIOD_UPDATED`,
`BILLING_PERIOD_STATUS_CHANGED`. Every write route in `routes/finance.js`
calls `lib/audit.record()` with the acting user, entity, and safe metadata
(no amounts-as-secrets, no PII beyond what's already visible in-app).

## Validation rules (server-side, all confirmed by code re-read)

Money via `lib/money.toPaise()` (throws on negative/non-numeric — caught and
turned into a friendly re-render); issue/due day range + due-after-issue
ordering; billing frequency / late-fee type / partial-payment / allocation
enums; bill/receipt prefix format (1–10 alphanumeric); charge code regex +
uniqueness (pre-check + `E11000` catch as backstop); calculation method enum;
period month format, due-after-issue ordering, overlap check; every `:id`
route validates `mongoose.isValidObjectId` first. No expected failure returns
a bare 500.

## Indexes

`billingconfigs {society}` unique · `chargecomponents {society, code}` unique
· (from 3A-1, unchanged) `billingperiods {society, periodStart}` unique,
`bills {unit, period}` unique.

## Stripe regression status

**No Stripe/webhook files were touched this round.** Re-verified in
`server.js`: `POST /webhooks/stripe` with `express.raw()` is still mounted at
line 44, before `express.urlencoded`, `session`, and CSRF middleware — the
new `routes/finance.js` is mounted later (line 92, alongside the other
resource routers), after the webhook and after CSRF, so it does not and
cannot affect webhook body handling. Checkout, `/success`, idempotency, and
legacy `lastPayment` compatibility are all unchanged.

## Legacy compatibility

`User.lastPayment` remains the sole input to all dues math (unchanged). The
new `BillingConfig`/`ChargeComponent`/`BillingPeriod` activity in this round
never reads or writes `lastPayment`, `makePayment`, or `Society.maintenanceBill`.

## What was NOT implemented (by design, per your explicit boundary)

Bill generation/preview-to-commit, opening balances, any resident-facing
Finance change, late-fee formulas, GST logic, allocation/payment behavior,
receipts, `BillingPeriod.totals` persistence, and the AMC/Vendor/Document
module (recorded in `ROADMAP.md` only).

## Tests / validation

**CODE-VERIFIED:** all validation paths above, authorization matrix, overlap
detection logic (traced manually against sample date ranges), rate-history
append-only behavior, zero `Bill.create` call sites, webhook mounting order
unaffected, CSRF present on every new POST form (grep-verified: 6/6 forms
carry `_csrf`), all `res.render` targets have matching views (grep-verified).
**AUTOMATED-TESTED:** none added this round (3A-2 introduces mostly CRUD +
validation, less pure-function logic than 3A-1's money/dues/FY math, which
already has coverage in `scripts/selftest.js`).
**RUNTIME-TESTED:** none — no Node available in this environment.
**RUNTIME-PENDING (your checklist):**
1. Log in as superadmin → **Finance → Billing Configuration** → Edit settings → save → confirm it appears as "ACTIVE".
2. Add a `ChargeComponent` (e.g. `MAINT`, Fixed per unit, ₹2,000) → confirm it appears with a current rate.
3. Add a second rate to the same component with a future effective date → confirm both appear in Rate history, current rate unchanged until that date.
4. Log in as a plain admin → confirm Billing Configuration is view-only (no Edit button, editing routes redirect).
5. Log in as a resident → confirm `/finance/config` and `/finance/periods` redirect to login (or are simply inaccessible).
6. **Finance → Billing Periods → Create period** → pick July 2026 → confirm dates computed correctly, and the estimate preview shows your charge component × 112.
7. Try creating July 2026 again → confirm the friendly overlap error (not a 500).
8. Delete the DRAFT period as superadmin → confirm it's gone and `/finance/periods` is empty again.
9. Confirm Stripe checkout on `/bill` still works exactly as before (regression check).

## Rollback considerations

Entirely additive — `BillingConfig`/`ChargeComponent` collections and their
documents can be dropped with zero effect on any existing functionality
(nothing else reads them). `BillingPeriod` documents created this round can
be deleted via the in-app Delete action (superadmin, DRAFT-only) or directly,
since none has any `Bill` attached.

## Next: Phase 3A-3 (not started)

Bill Preview → Generate → Review → Issue, gated on your review of this
round's configuration UI and the outstanding §18 business decisions
(maintenance amount, actual charge heads, partial-payment/allocation policy).
