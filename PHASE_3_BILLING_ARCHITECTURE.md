# PHASE 3 — 27East Billing, Payments, Receipts & Flat Ledger Architecture

**Status: PROPOSAL — awaiting approval. No code, collections, or migrations have been created.**
Audited against the live branch at commit `c712354`.

---

## 1. Current-state audit (what exists today, verified in code)

### Data model
| Where | Field | Meaning |
|---|---|---|
| `User.lastPayment` | `{ date, amount, invoice }` | The **only** payment record — one slot, overwritten on every payment. `invoice` holds Stripe's `customer.invoice_prefix` (not a real receipt number). |
| `User.makePayment` | `Number` | Server-computed "amount payable now", persisted when `/bill` renders; read by `/checkout-session` as the authoritative charge amount. |
| `Society.maintenanceBill` | 6 fixed numeric fields (`societyCharges`, `repairsAndMaintenance`, `sinkingFund`, `waterCharges`, `insuranceCharges`, `parkingCharges`) | The monthly charge configuration — society-wide, identical for every flat, rupee floats. |
| `Unit` | — | **No financial fields at all.** Money is entirely user-centric today. |

### Indexes
Only `users.username` (unique, via passport-local-mongoose) and `units {society, floor, flatNumber}` (unique). No financial indexes exist.

### Current billing formula (`lib/billing.js` — single source since `c712354`)
- `monthlyTotal` = sum of the 6 numeric fields.
- `totalMonth` = calendar-month boundary difference between `lastPayment.date` (or `createdAt`) and now — **day-of-month ignored** (pay Jan 31, view Feb 1 → 1 month elapsed).
- No payment yet → joining month counts as due (`+1`).
- `totalMonth === 0` → one-month credit (current bill nets to 0). `totalMonth > 1` → `(totalMonth − 1) × monthlyTotal` arrears.
- Status: `paid` (≤0), `overdue` (arrears>0), else `due`.
- Used by: bill page, admin dues table, dashboard outstanding, Flat 360. **This formula is documented here and left untouched until Phase 3 rules are approved (§20).**

### Current payment flow
`/bill` renders → persists `makePayment` → `/checkout-session` (CSRF header, `ensureApproved`) creates a Stripe Checkout Session for exactly `makePayment` with `client_reference_id = userId`, URLs derived from request host → browser pays → redirect to `/success?session_id=…` → server retrieves session, **verifies `payment_status === 'paid'` and session ownership**, then **overwrites** `User.lastPayment`.

### Current receipt flow
No stored receipt entity. `bill.ejs`/`success.ejs` render a receipt-styled block from `lastPayment` + client-side html2pdf download. Receipt "number" is Stripe's customer invoice prefix.

### Current limitations (why Phase 3 exists)
1. **No history** — every payment destroys the previous one; a flat's financial past is one overwritten field on whichever user paid.
2. **Person-centric, not unit-centric** — dues follow `User.createdAt`/`lastPayment`; if a tenant moves out, Flat 1301's history leaves with them; a new member restarts the clock.
3. **No bills** — amounts are recomputed opinions, not issued documents; nothing to dispute, audit, or reconcile.
4. **No partial payments, advances, credits, adjustments, or offline payments.**
5. **Redirect-based confirmation** — sound since `c712354` (paid-status + ownership verified server-side against Stripe), but if the redirect never lands (closed tab), a real payment is never recorded. No webhook.
6. **Floating-point rupees** throughout.
7. **Multi-member flats double-bill** — each approved member of the same unit accrues dues independently.

### Current security posture (verified)
Amount is server-authoritative; Stripe secret never rendered; CSRF on all POSTs; admin routes `ensureAdmin`; resident data keyed by session id only. Carried into Phase 3 unchanged.

---

## 2. Proposed data model

**Convention: all money stored as integer paise (`amountPaise: Number`, always integers).** Rationale: `0.1 + 0.2 !== 0.3` in JS floats; paise integers are exact up to ₹90 trillion (well inside Number.MAX_SAFE_INTEGER), trivially summable, and format at the edge (`₹(p/100).toLocaleString('en-IN')`). Mongoose `Decimal128` is the alternative but is awkward to compare/sum in JS and overkill for one tower.

Five new collections + one counter. Bills embed their line items; payments embed their allocations (trade-offs below). Nothing existing is modified or removed during 3A.

### `BillingPeriod`
```
society        ObjectId ref (single-tower, kept for consistency)
name           "July 2026"
periodStart    Date        periodEnd  Date
issueDate      Date        dueDate    Date
status         enum: DRAFT | GENERATED | ISSUED | CLOSED
chargeSnapshot [ { code, label, amountPaise, basis } ]   // frozen copy of config used
totals         { unitCount, billedPaise }                // filled at generation
createdBy      ObjectId ref User
timestamps
UNIQUE INDEX: { society, periodStart }                   // one July 2026, ever
```
Explicit periods **replace month-diff arithmetic** for all post-cutover billing.

### `Bill` (line items embedded)
```
society, unit  ObjectId refs          period  ObjectId ref BillingPeriod
billNumber     "27E/2026-27/000123"   (unique index)
issueDate, dueDate                    Date
lineItems      [ { code, label, amountPaise } ]
subtotalPaise  Number
adjustmentPaise Number (signed; from linked adjustments)
lateFeePaise   Number (default 0 — reserved, no formula yet, §14)
totalPaise     Number
paidPaise      Number (denormalized from allocations; recomputed, never hand-edited)
status         enum: DRAFT | ISSUED | PARTIALLY_PAID | PAID | OVERDUE | VOID
voidReason / voidedBy / voidedAt      (VOID never deletes; number never reused)
openingBalance Boolean (true only for the migration cutover bill, §15)
createdBy, timestamps
UNIQUE INDEX: { unit, period }        // idempotent generation: one bill per flat per period
INDEX: { unit, issueDate } , { status }
```
*Why embed line items:* a bill's lines are written once at generation, read together, never queried independently — a separate `BillLineItem` collection would add joins for zero benefit at 112 flats/month (~1,344 bills/year).

*Status model:* `DRAFT` exists only pre-issue (preview). `OVERDUE` is **derived** (`ISSUED|PARTIALLY_PAID` + past due + balance>0) — recommended to compute at read time rather than stored, so no cron is needed; store it only if reports later demand indexation.

### `Payment` (immutable; allocations embedded)
```
society, unit  ObjectId refs
payer          ObjectId ref User (nullable — offline payments may lack an account)
amountPaise    Number
paidAt         Date
method         enum: ONLINE | BANK_TRANSFER | UPI | CHEQUE | CASH
provider       'stripe' | 'manual'
providerRef    Checkout Session id / PaymentIntent id / cheque no / UTR
status         enum: PENDING | SUCCEEDED | FAILED | REFUNDED | PARTIALLY_REFUNDED
allocations    [ { bill: ObjectId, billNumber, amountPaise } ]
unallocatedPaise Number               // advance/credit remainder (§10)
notes, recordedBy (admin, for manual), verifiedAt
timestamps
UNIQUE INDEX: { provider, providerRef }   // core idempotency: same Stripe session can never create two payments
INDEX: { unit, paidAt }
```
**Immutability rule:** a `SUCCEEDED` payment is never edited or deleted. Refunds/corrections create a new negative-direction record (`REFUNDED` status + reversing ledger effect) or an Adjustment — history is append-only.

*Why embed allocations:* an allocation never exists without its payment, is bounded (a payment covers at most a handful of bills), and is always read with the payment. A separate `PaymentAllocation` collection earns its keep only with cross-payment allocation queries at scale we will never have. Bill-side `paidPaise` is the denormalized mirror, recomputed inside the same transaction that writes the payment.

### `Receipt`
```
receiptNumber  "REC/2026-27/000456" (unique index)
society, unit, payment (unique — one receipt per confirmed payment)
snapshot       { flatNumber, payerName, amountPaise, method, providerRef,
                 allocations: [{ billNumber, amountPaise }], societyName, address, date }
createdAt
```
Generated **only** from a `SUCCEEDED` payment, atomically with it. The snapshot freezes display data so later edits to society/member records never alter an issued receipt. PDF stays client-side html2pdf in 3A (server-side PDF is a later nicety).

### `Adjustment`
```
society, unit  ObjectId refs
bill           ObjectId ref (nullable — unit-level credit/debit allowed)
type           enum: CREDIT | DEBIT | WAIVER | CORRECTION | OPENING_BALANCE
amountPaise    Number (positive; type carries direction)
reason         String REQUIRED
createdBy      ObjectId ref User (admin)   timestamps
```
Append-only. Wrong adjustment → reversing adjustment, never edit/delete.

### `Counter` (numbering)
```
_id   "bill:2026-27" | "receipt:2026-27"
seq   Number
```
`findOneAndUpdate({_id}, {$inc:{seq:1}}, {upsert:true, new:true})` — **atomic in MongoDB**, safe under concurrency, gap-tolerant (a failed generation may skip a number; acceptable and normal in accounting systems — numbers are unique and monotonic, VOID keeps its number). Format: `27E/<FY>/<6-digit seq>` and `REC/<FY>/<6-digit seq>`, FY = **April 1 → March 31** (Indian society convention, §13).

### `StripeEvent` (webhook idempotency)
```
eventId  String (unique index)   type, receivedAt, processedAt, outcome
```

### `AuditLog`
```
actor, action (enum: BILL_GENERATED, BILL_ISSUED, BILL_VOIDED, PAYMENT_RECORDED,
PAYMENT_VERIFIED, PAYMENT_REFUNDED, ADJUSTMENT_CREATED, RECEIPT_GENERATED,
BILLING_CONFIG_CHANGED, PERIOD_CREATED, ...), entityType, entityId,
context (safe before/after summary — never card data/secrets), createdAt
```
Written in the same flow as each financial action. Append-only.

---

## 3. Relationships & unit-centric ownership

```
Society 1─n BillingPeriod 1─n Bill n─1 Unit
Unit 1─n Payment (allocations → Bills)   Unit 1─n Adjustment   Payment 1─1 Receipt
User n─1 Unit (occupancy; already exists)
```

**The Unit is the financial owner.** Bills, payments, adjustments, receipts and the ledger all key on `unit`. Members come and go; Flat 1301's history stays with Flat 1301. Resident access rule: a resident may see their **current** unit's bills/payments/receipts (`req.user.unit`, session-derived — never a client-supplied id). Ex-occupants lose access when the admin reassigns them (their `unit` changes); historical data remains with the flat for the admin. Multi-member flats see the same single flat bill — this also *ends the current double-billing of multi-member flats* post-cutover.

---

## 4. Bill lifecycle & generation workflow

```
Admin → Finance → Billing Periods → “Create July 2026”
  → period form pre-filled from charge config (DRAFT)
  → PREVIEW: 112 units listed, per-unit lines, grand total,
             exceptions (unit missing config), duplicate-period warning
  → GENERATE (DRAFT bills, one per unit — unique {unit, period} makes
             double-click/second-tab generation a no-op)
  → REVIEW drafts (spot-check, void/regenerate while DRAFT)
  → ISSUE (assigns bill numbers, stamps issueDate, status ISSUED,
           audit log, resident-visible from this moment)
```
Preview-before-commit is mandatory. Generation is idempotent by index, not by hope. `VOID` requires reason + admin identity; a voided bill keeps its number forever.

## 5. Payment lifecycle

```
ONLINE:  resident → Pay → server computes payable → Stripe Checkout
         (metadata: unitId, userId, billIds) → WEBHOOK (signed) verifies +
         creates SUCCEEDED Payment + allocates + receipt + audit — atomically
         → /success shows “confirmed” (or “being confirmed…” until webhook lands)
OFFLINE: admin → Record Payment → unit, amount, date, method, reference,
         allocation preview → confirm → SUCCEEDED Payment + receipt + audit
```
Residents can never self-declare an offline payment. Refund → status transition + reversing ledger entries via Stripe webhook (`charge.refunded`) or admin action; never deletion.

## 6. Stripe webhook architecture

- New `POST /webhooks/stripe`:
  - Mounted **before** session/CSRF middleware with `express.raw({type:'application/json'})` — signature verification requires the raw body, and webhooks must be CSRF-exempt (they carry Stripe's signature instead). This is an important integration detail with our existing global CSRF middleware.
  - `stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET)` — reject on failure. New env var `STRIPE_WEBHOOK_SECRET`.
  - Handle `checkout.session.completed` (and later `charge.refunded`): insert `StripeEvent` (unique `eventId` — duplicate delivery exits early), verify `payment_status === 'paid'`, currency INR, amount matches server-side expectation from session metadata, then create Payment→allocate→receipt→audit in a **MongoDB transaction** (Atlas replica set supports them; fallback ordering + unique indexes keep it safe even without).
- `/success` becomes **presentational only**: it looks up the Payment by session id; if the webhook hasn't landed yet it shows "Payment received — being confirmed" with refresh. It never writes financial records once 3A-6 ships (until then, the current verified-redirect flow remains).
- Triple idempotency: unique `StripeEvent.eventId`, unique `Payment {provider, providerRef}`, transaction-scoped allocation. Same event twice can never double-pay, double-allocate, or double-receipt.

## 7. Allocation rules & partials/advances

**Recommended: automatic oldest-due-first, admin-overridable.**
- Resident online payments: server allocates oldest ISSUED/PARTIALLY_PAID bill first (predictable, no resident accounting decisions, matches society norms).
- Admin offline recording: oldest-first prefilled, editable before confirm (handles "this cheque is specifically for August").
- Partial payments: allocation < bill total → bill `paidPaise` rises, status `PARTIALLY_PAID`; subsequent payments continue allocation; equality → `PAID`.
- Overpayment: remainder stored on the Payment as `unallocatedPaise` — an explicit **unit credit**, listed in the ledger, automatically consumed by the next period's generation (allocated to the new bill before asking for money) or manually applied by the admin. Never fake `lastPayment`-style trickery.

## 8. Flat Ledger

Derived, never hand-stored. For one unit: merge Bills (debits, at issueDate), Payments' allocations + credits (credits, at paidAt), Adjustments (either) → sort chronologically → compute running balance in memory. At 27East's scale (≈12 bills + ≈12 payments/flat/year), rendering years of a flat's ledger is a two-indexed-query, sub-millisecond operation — **no cached balance column** (a stored balance is a second source of truth that *will* drift). If a society-wide "all outstanding" dashboard ever gets slow, add a periodic aggregation snapshot then, not now.

## 9. Authorization matrix (server-enforced, same middleware pattern as today)

| Action | Admin | Resident |
|---|---|---|
| Configure charges, periods, generate/issue/void bills | ✅ | ❌ |
| Record offline payment, create adjustment | ✅ | ❌ |
| View any unit's ledger/bills/payments/receipts | ✅ | ❌ |
| View own unit's bills/ledger/receipts; pay own unit's dues | ✅ (own) | ✅ (own unit via session only) |
| Create/modify any financial amount client-side | ❌ | ❌ |

CSRF retained on every state-changing route (webhook exempted via signature). All ids validated as ObjectIds; enums validated; amounts validated as positive integers (paise).

## 10. Index & idempotency summary

| Index | Purpose |
|---|---|
| `BillingPeriod {society, periodStart}` unique | one period per month |
| `Bill {unit, period}` unique | idempotent generation |
| `Bill.billNumber`, `Receipt.receiptNumber` unique | numbering integrity |
| `Payment {provider, providerRef}` unique | no duplicate Stripe/manual payment |
| `Receipt.payment` unique | one receipt per payment |
| `StripeEvent.eventId` unique | webhook replay safety |
| `Bill {unit, issueDate}`, `Payment {unit, paidAt}` | ledger queries |

Counters via atomic `$inc`. Multi-document writes (payment+allocation+receipt) in transactions on Atlas.

## 11. Migration & cutover (no historical fabrication)

**Principle: we do not invent month-by-month history that was never issued. We draw a line.**

1. Admin picks a **cutover date** (business decision Q19).
2. `scripts/migrateBilling.js --dry-run`: for every unit, compute the legacy outstanding **as of cutover** using the *documented legacy formula* over the unit's current approved members (flagging multi-member units for admin review — legacy double-counting must be resolved by a human, not code); print per-unit table + totals; **zero writes**.
3. Admin reviews/corrects the report (can override any unit's figure).
4. Real run: per unit, create a single **Opening Balance bill** (`openingBalance: true`, one line item "Outstanding as of <date> (legacy system)") — or an OPENING_BALANCE adjustment for credit positions. Backup (`mongodump`) required first; reconciliation output (units, totals) saved.
5. **Legacy fields (`lastPayment`, `makePayment`, `Society.maintenanceBill`) are left untouched and read-only** until the new system is validated on Render; old screens keep working through the transition. Decommissioning legacy reads is the final 3A-9 gate, never a startup migration, never automatic.
6. Rollback: drop the new collections (they're additive) — legacy state was never modified.

## 12. Admin & resident UX (existing ivory/ink/brass system — no redesign)

**Admin sidebar → FINANCE:** Billing Dashboard (billed/collected/outstanding/overdue/collection-rate KPIs from Bills+Payments; month/FY filter) · Billing Periods (create→preview→generate→issue) · Bills (register, filters, void) · Payments (register + Record Payment) · Receipts (register) · Adjustments (list + create-with-reason). Reports deferred (§ Reporting).

**Resident:** Home shows CURRENT DUE ₹X + due date + Pay Now (real bill data). Bills page: outstanding summary → current bill (line items) → previous bills → payment history → receipts. Ledger presented as "Statement". Mobile-first, plain language ("You're all paid up", not "CR balance").

## 13. Financial year — recommendation

Adopt **April 1 – March 31** (Indian society/audit convention) for bill/receipt numbering (`27E/2026-27/…`), FY dashboard filters, and future reports. Opening balances (§11) are FY-agnostic (point-in-time). Not hardcoded: FY start month lives in billing config (default April).

## 14. Late fees / interest — architecture only

`Bill.lateFeePaise` + config placeholders (`gracePeriodDays`, `lateFeeType: FIXED|PERCENT|MONTHLY_INTEREST`, `lateFeeValue`, waiver via WAIVER adjustment) are **reserved in the schema but inert** — no formula runs until you approve rules (Q7–Q8). Applying a late fee later = appending a line/adjustment to a *future* bill or a dated adjustment — never mutating an issued bill.

## 15. Reporting foundation (planned, not built in 3A)

Registers fall out of the model for free later: Bill Register (Bills), Payment Register (Payments), Receipt Register (Receipts), Outstanding/Defaulter (derived statuses), Adjustment Register. CSV export first, PDF later. Nothing until the ledger is validated.

## 16. Risks

1. **Webhook + raw-body + CSRF interaction** — highest technical risk; isolated in 3A-6 with its own gate (Stripe CLI test events on staging).
2. **Legacy multi-member double-billing** distorts naive opening balances — mitigated by mandatory dry-run + human review per flagged unit.
3. **Transactions require Atlas replica set** — staging is Atlas (fine); fallback ordering documented if ever self-hosted.
4. **Two systems during transition** — mitigated by leaving legacy reads intact until 3A-9 and cutting over screens atomically per sub-phase.
5. Render free-tier sleep can delay webhook processing (Stripe retries for days — acceptable for staging; note for production tier).

## 17. Implementation sub-phases (each with a validation gate; no phase starts until the previous is validated on Render)

| Sub-phase | Scope | Gate |
|---|---|---|
| **3A-1** | Models + indexes + `lib/money.js` (paise helpers) + counters; zero UI/behavior change | Boots clean; indexes build; existing app unaffected |
| **3A-2** | Billing config UI (charge components) + Billing Periods CRUD (DRAFT only) | Admin creates July period; nothing resident-visible |
| **3A-3** | Preview → generate → issue; bill numbering; Bills register; resident sees issued bill (read-only) | 112 drafts, idempotent regen, correct totals |
| **3A-4** | Flat Ledger + resident bill history + Flat 360 financial tab switched to new data | Ledger matches bills/payments hand-check |
| **3A-5** | Manual/offline payments + allocation engine + partials/advances + adjustments + audit log | Cheque scenario end-to-end; double-entry reconciles |
| **3A-6** | Stripe signed webhook + `/success` demoted to presentational; StripeEvent idempotency | Stripe CLI replay: no duplicates ever |
| **3A-7** | Receipts (numbering, snapshot, register, resident download) | Receipt only from SUCCEEDED payment |
| **3A-8** | Finance dashboard KPIs + register filters | KPIs reconcile to registers exactly |
| **3A-9** | Legacy cutover: dry-run → review → opening balances → switch remaining legacy reads → retire `lastPayment` writes | Reconciliation report signed off by you |

---

## 18. OPEN BUSINESS DECISIONS (required before any coding)

| # | Decision | Options / notes |
|---|---|---|
| 1 | Monthly maintenance method | Same flat amount for all 112? Per-sqft? Flat-type based? (today: one society-wide amount) |
| 2 | Monthly amount / rate | Current config totals ₹2,171/flat (default seed values — confirm real figure) |
| 3 | Billing frequency | Monthly assumed — confirm (quarterly also supportable) |
| 4 | Bill issue day | e.g. 1st of month |
| 5 | Due date | e.g. 10th of month |
| 6 | Grace period | days after due before "overdue" |
| 7 | Late fee | none / fixed ₹ / % / monthly interest — and value |
| 8 | Interest compounding | simple vs compound, if interest chosen |
| 9 | Charge components | Which heads actually apply at 27East (current six? parking separate per flat?) |
| 10 | GST/tax | Applicable? (usually exempt below thresholds — confirm with auditor) |
| 11 | Advance payments | Allowed? Auto-apply to next bill (recommended)? |
| 12 | Partial payments | Allowed for online Stripe payments, or full-amount-only online with partials offline-only? |
| 13 | Allocation policy | Oldest-first auto (recommended) — confirm |
| 14 | Offline methods to enable | cheque / bank transfer / UPI / cash |
| 15 | Financial year | April–March (recommended) — confirm |
| 16 | Bill number format | `27E/2026-27/000123` proposed — confirm/adjust |
| 17 | Receipt number format | `REC/2026-27/000456` proposed — confirm/adjust |
| 18 | Multi-member flats | Confirm: ONE bill per flat (ends legacy per-member billing) |
| 19 | Cutover date + opening balances | Date; and whether legacy-computed openings are trusted or you'll supply a reviewed list |
| 20 | Stripe production timing | Test mode until when; live keys + webhook secret provisioning |
