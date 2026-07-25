# 27East — Roadmap

Living index of confirmed future work. Entries here are **documentation
only** — nothing in this file has been implemented unless a phase is marked
otherwise.

## In progress: Phase 3 — Billing, Payments, Receipts & Flat Ledger

See `PHASE_3_BILLING_ARCHITECTURE.md` for the full design.

### Phase 3A: Bill Generation & Collections (Resident Money In)
- ✅ 3A-1 — Roles (superadmin/admin/member), financial foundation models, Stripe hardening + signed webhook (`PHASE_3A1_IMPLEMENTATION.md`)
- ✅ 3A-2 — Billing Configuration + Charge Components + Billing Periods (`PHASE_3A2_IMPLEMENTATION.md`)
- ✅ 3A-3 — Bill preview → generate (idempotent) → review → superadmin issue; resident bill views; privacy/security architecture (`PHASE_3A3_IMPLEMENTATION.md`)
- ⬜ 3A-4 — Flat Ledger (derived, never stored) + Resident Bill History + Flat 360 financial tab
- ⬜ 3A-5 — Manual/offline payments + allocation engine + partials/advances + adjustments
- ⬜ 3A-6 — Stripe Webhook becomes fully authoritative; `/success` fully presentational; webhook allocation
- ⬜ 3A-7 — Receipts (numbering via Counter, snapshot, register)
- ⬜ 3A-8 — Finance Dashboard (KPIs: billed, collected, outstanding) + Bill/Collection/Receipt registers
- ⬜ 3A-9 — Legacy Cutover (dry-run → open

ing balances → switch to new system → retire `lastPayment`)

### Phase 3B: Expenditure Management (Society Money Out) — DESIGN COMPLETE

See `PHASE_3_FINANCE_EXPANSION_ARCHITECTURE.md` for the full design. **NOT IMPLEMENTED.**

- ⬜ 3B-1 — Expense Model + Approval Workflow (DRAFT → SUBMITTED → APPROVED/REJECTED → PAID)
- ⬜ 3B-2 — Vendor Master (contacts, multiple contact persons) + AMC/Contracts + Service History
- ⬜ 3B-3 — Bank/Cash Account tracking + Account transactions
- ⬜ 3B-4 — Payment Vouchers (linked to Expenses, bank account, vendor)
- ⬜ 3B-5 — Document Repository (private object storage, visibility levels, download authorization)
- ⬜ 3B-6 — AMC Renewal Reminders (scheduled jobs, configurable advance warnings)
- ⬜ 3B-7 — Expenditure Dashboard (total approved, paid, outstanding payables)

## Confirmed next major module (not started): AMC / Vendor / Document Management

Recorded per your explicit instruction — **do not implement any part of this
until its own dedicated planning round**, after the Phase 3 finance
foundation is validated.

**Conceptual architecture:**
```
VENDOR → AMC / CONTRACT → ASSET / SERVICE → DOCUMENTS → EXPIRY / RENEWAL → REMINDERS → HISTORY
```

### Vendor Master
Company/contact name, category, services provided, address, general
phone/email, active/inactive, notes. **Multiple contact persons per vendor**
(Primary, Account Manager, Technician, Emergency, Escalation — not forced to
one), each with name/designation/phone/alternate phone/email/contact type.

### AMC / Contracts
Vendor, service/asset, contract type, AMC number/reference, start/end/renewal
dates, contract value, payment terms, service frequency, scope, SLA details,
responsible internal admin. Status: `ACTIVE / EXPIRING_SOON / EXPIRED /
RENEWED / TERMINATED`. Example categories the architecture must accommodate
without hardcoding: lift/elevator, DG/generator, fire fighting, fire alarm,
CCTV, access control, intercom, security agency, housekeeping, pest control,
water treatment, STP/WTP, pumps, electrical, HVAC, insurance,
licenses/certificates.

### Renewal / Expiry Reminders
Configurable reminder points (90/60/30/15/7 days before expiry, due-today,
overdue). Must avoid duplicate spam and track
generated/attempted/acknowledged/renewed states. **Must not depend on an
in-process timer requiring Render to stay awake** — needs a real scheduled-job
mechanism (e.g. a proper cron/scheduler service), designed when this phase is
planned, not assumed now.

### Document / File Repository
Categories: AMC agreements, contracts, vendor quotations, invoices, insurance,
fire certificates, NOCs, licenses, society registration documents, meeting
documents, compliance documents, policies, technical manuals, other records.
Upload/download/search/filter, metadata, category, tags, document date,
**independent expiry date** (a Fire NOC or insurance policy can expire with no
AMC attached), linked vendor/AMC/unit where relevant, uploaded-by/date,
version/replacement history.

**Critical, non-negotiable storage rule:** the database stores metadata only.
Files themselves go to **persistent, private object storage** (Cloudinary
private assets, S3, Cloudflare R2, Supabase Storage, or equivalent) — **never
Render's local/ephemeral filesystem** as the authoritative store. Storage
provider selection is deferred to that phase's planning round, not decided
here.

**Document security:** never a public/guessable URL. Superadmin sees
everything; admin sees authorized operational documents; members see only
documents explicitly marked resident-visible. Downloads enforce
authorization server-side, not obscurity.

### Dashboard additions (future)
AMCs expiring in 30 days, expired AMCs, documents/certificates expiring soon,
upcoming renewals, overdue actions — concise, admin-only, not on the resident
dashboard.

### Audit (future)
Vendor created/updated/deactivated; AMC created/updated/renewed/terminated;
expiry date changed; document uploaded/replaced/archived/deleted; reminder
acknowledged — each attributed to the individual superadmin/admin who acted,
using the same `AuditLog` foundation already built in 3A-1.
