# Phase 3 Finance Expansion Architecture

**Status: DESIGN PHASE (NOT IMPLEMENTED)**

This document extends the billing architecture (Phase 3A-1 through 3A-9) to support the complete 27East financial ecosystem: MONEY IN (collections) + MONEY OUT (expenses) + BANK/CASH MANAGEMENT.

---

## 1. Current Architecture (Phase 3A-3)

### 1.1 Money In (Resident Billing & Collections)
```
UNIT → BILL → PAYMENT → RECEIPT → LEDGER
```

- **Bill**: Unit's periodic charge (maintenance, amenities, etc.)
- **Payment**: Resident pays via Stripe or manual entry
- **Receipt**: Immutable proof of payment (snapshot)
- **Ledger**: Chronological view of bills + payments per unit

### 1.2 Constraints Today
- Money OUT (expenses, vendor payments) not architected
- No Expense model, Vendor integration, or approval workflows
- No Bank/Cash account tracking
- Document storage deferred to future phase
- AMC/Contract financial integration not connected

---

## 2. MONEY IN Architecture (Detailed)

### 2.1 Bill Model (Existing)
```
Bill
├── society, unit, period
├── billNumber (unique, assigned at ISSUE)
├── issueDate, dueDate
├── lineItems []
│   ├── code (charge component reference)
│   ├── label
│   └── amountPaise
├── subtotalPaise
├── adjustmentPaise (sum of linked Adjustments)
├── lateFeePaise (reserved, not auto-applied)
├── totalPaise
├── paidPaise (denormalized from Payment allocations, recomputed)
├── status: DRAFT | ISSUED | PARTIALLY_PAID | PAID | OVERDUE | VOID
├── voidReason, voidedBy, voidedAt (if VOID)
├── openingBalance: Boolean (true only for 3A-9 cutover bill)
└── createdBy, timestamps
```

- Immutable once ISSUED (changes via Adjustment, not edit)
- One per unit per period (enforced by unique index)
- Line items snapshot the configuration at generation time

### 2.2 Payment Model (Existing)
```
Payment
├── society, unit
├── payer (User, nullable for offline payments)
├── amountPaise (required)
├── paidAt (date payment was received/recorded)
├── method: ONLINE | BANK_TRANSFER | UPI | CHEQUE | CASH
├── provider: 'stripe' | 'manual'
├── providerRef (Stripe session ID / cheque no / UTR)
├── status: PENDING | SUCCEEDED | FAILED | REFUNDED | PARTIALLY_REFUNDED
├── allocations []
│   ├── bill (ObjectId)
│   ├── billNumber
│   └── amountPaise
├── unallocatedPaise (advance/credit remainder)
├── legacyEffect: Boolean (payment updated legacy User.lastPayment)
├── notes, recordedBy (admin), verifiedAt
└── timestamps
```

- Immutable once SUCCEEDED (refunds create reversing record, not edit)
- Allocations embed the application of payment to bills
- `unallocatedPaise` is unit credit (auto-applies to next bill or manual)
- Unique index on {provider, providerRef} prevents duplicates

### 2.3 Receipt Model (Existing)
```
Receipt
├── receiptNumber (unique, e.g., "REC/2026-27/000456")
├── society, unit
├── payment (unique — one receipt per payment)
└── snapshot (frozen at creation time)
    ├── flatNumber
    ├── payerName
    ├── amountPaise
    ├── method
    ├── providerRef
    ├── allocations []
    │   ├── billNumber
    │   └── amountPaise
    ├── societyName, address
    └── date
```

- Generated atomically with SUCCEEDED payment
- Snapshot ensures receipt never changes if society/member data changes
- Safe historical record for disputes

### 2.4 Adjustment Model (Existing)
```
Adjustment
├── society, unit
├── bill (nullable — unit-level credit/debit allowed)
├── type: CREDIT | DEBIT | WAIVER | CORRECTION | OPENING_BALANCE
├── amountPaise
├── reason (required — WHY was this adjustment made)
├── createdBy (admin/superadmin)
└── timestamps
```

- Append-only; wrong adjustment creates reversing entry, not edit
- Links to Bill or Unit (NULL for unit-level credits)
- Type distinguishes: resident credit vs admin correction vs waiver

### 2.5 Collections Flow
```
RESIDENT INITIATES:
Resident → "Pay" button → Stripe Checkout Session
         → Payment metadata (unit, bills covered)
         → Webhook signed by Stripe → Payment.create + allocate + receipt

ADMIN RECORDS (Offline):
Admin → "Record Payment" → select unit, amount, date, method, reference
      → Allocation preview (oldest-first recommended)
      → Confirm → Payment.create + allocate + receipt

OUTCOMES:
Payment < Bill total → Bill status PARTIALLY_PAID
Payment = Bill total → Bill status PAID
Payment > Bill total → Remainder in Payment.unallocatedPaise (unit credit)
```

---

## 3. MONEY OUT Architecture (Proposed)

### 3.1 Expense Model (Future — NOT Implemented)
```
Expense
├── expenseNumber (unique per FY, e.g., "EXP/2026-27/000123")
├── society
├── expenseDate (when expense occurred)
├── category (enum: see 3.2 below)
├── vendor (nullable ObjectId, reference to Vendor Master)
├── payee (nullable String — direct payee name for non-vendor expenses)
├── relatedAMC (nullable ObjectId, reference to AMC/Contract)
├── relatedInvoice (nullable ObjectId, reference to VendorInvoice)
├── description (required)
├── grossAmountPaise (before tax)
├── taxAmountPaise (reserved for future; 0 for now)
├── netAmountPaise (after tax)
├── paymentStatus: DRAFT | SUBMITTED | APPROVED | PAID | REJECTED | CANCELLED
├── approvalStatus: PENDING | APPROVED | REJECTED (separate from payment)
├── paymentMethod: BANK_TRANSFER | CHEQUE | CASH | CARD
├── bankAccount (nullable ObjectId, reference to Bank/Cash Account used for payment)
├── paymentReference (cheque no, UTR, transaction ID)
├── supportingDocuments [] (ObjectIds to Document repository)
├── createdBy, createdAt
├── approvedBy, approvedAt
├── paidBy, paidAt
└── updatedAt
```

**Lifecycle:**
- DRAFT → SUBMITTED → (APPROVED | REJECTED)
- If APPROVED: APPROVED → (PAID | CANCELLED)
- If REJECTED: terminal state
- If CANCELLED: terminal state (shows as VOID, number never reused)

**Immutability:**
- Once PAID, only reversals/corrections, never edit amounts
- Payment proof immutable (supporting documents archived)

### 3.2 Expense Categories (Configurable)
```
MAINTENANCE & REPAIRS:
  - General Repairs & Maintenance
  - Lift/Elevator Maintenance
  - Plumbing & Water Systems
  - Electrical
  - HVAC/Cooling Systems
  - Pest Control & Sanitation
  - Painting & Interior

UTILITIES & SERVICES:
  - Electricity/Power
  - Water Supply & Treatment
  - Gas
  - Internet/Telecom
  - Waste Management

SECURITY & SAFETY:
  - Security Agency/Guards
  - CCTV & Access Control
  - Fire System Maintenance
  - Insurance

MANAGEMENT & ADMINISTRATION:
  - Housekeeping
  - Administrative Staff
  - Professional Fees (audit, legal)
  - Government/Statutory Fees

CONTRACTS & COMMITMENTS:
  - AMC Payments (lift, DG, etc.)
  - Annual Contracts (pest, pest control, etc.)

MISCELLANEOUS:
  - Miscellaneous (catch-all)
```

**Configurable?** Yes — categories can be added/renamed. Existing expenses' category links don't break (stored as denormalized string + code).

### 3.3 Vendor Invoice Model (Future — NOT Implemented)
```
VendorInvoice
├── invoiceNumber (vendor's invoice ID)
├── society
├── vendor (ObjectId, reference to Vendor Master)
├── invoiceDate
├── dueDate
├── grossAmountPaise
├── taxAmountPaise (0 unless tax policy approved)
├── netAmountPaise
├── relatedAMC (nullable ObjectId — if this invoice is for an AMC)
├── description
├── status: DRAFT | RECEIVED | APPROVED | FULLY_PAID | PARTIALLY_PAID | OVERDUE | REJECTED | CANCELLED
├── paymentStatus: UNPAID | PARTIALLY_PAID | FULLY_PAID
├── supportingDocuments [] (ObjectIds)
├── createdBy, createdAt
├── approvedBy, approvedAt
└── updatedAt
```

**Relationship:**
- One VendorInvoice may map to one or more Expenses
- Expense.relatedInvoice → VendorInvoice._id
- VendorInvoice.status tracks overall payment

**Immutability:**
- Once APPROVED, amount frozen (adjustments create separate records)

### 3.4 Approval Workflow
```
EXPENSE APPROVAL:
  Admin creates DRAFT Expense
    → SUBMIT (moves to PENDING approval)
  Superadmin reviews PENDING
    → APPROVE (Expense.approvalStatus = APPROVED)
    → or REJECT (Expense.paymentStatus = REJECTED, terminal)
  Once APPROVED:
    → Payment recorded separately
    → Payment record references Expense.expenseNumber

VENDOR INVOICE APPROVAL:
  Admin receives invoice → create VendorInvoice (RECEIVED)
  Superadmin reviews → APPROVE (moves to approval queue)
  Once APPROVED:
    → Can create Expense or payment voucher
```

**Future Enhancement:**
- Configurable approval thresholds (expenses > ₹X require superadmin)
- Role-based approval (different roles approve different categories)
- NOT IMPLEMENTED in Phase 3; reserved in schema

---

## 4. BANK & CASH ACCOUNTS

### 4.1 Account Master (Future — NOT Implemented)
```
Account
├── society
├── name (e.g., "27East Society Bank Account", "Petty Cash")
├── type: BANK | CASH
├── bankName (nullable, only for BANK)
├── maskedAccountNumber (nullable, e.g., "…1234", never full number)
├── ifscCode (nullable, for BANK transfers)
├── active: Boolean
├── openingBalancePaise (as of a reference date)
├── referenceDate (when opening balance was set)
├── notes
└── timestamps
```

**NEVER STORE:**
- Full account number
- Online banking passwords
- OTP or PIN codes
- Card CVV
- API keys for bank integrations (if any)

### 4.2 Account Transaction Model (Future — NOT Implemented)
```
AccountTransaction
├── account (ObjectId, reference to Account)
├── transactionDate
├── transactionType: INFLOW | OUTFLOW | OPENING_BALANCE
├── relatedPayment (nullable ObjectId → Payment record)
├── relatedExpense (nullable ObjectId → Expense record)
├── relatedVoucher (nullable ObjectId → PaymentVoucher record)
├── description
├── amountPaise
├── runningBalancePaise (computed, not stored — derive from opening + all inflows - outflows)
├── reference (cheque no, UTR, transaction ID)
└── timestamps
```

**Balance Calculation (NOT Stored):**
```
Current Balance = Opening Balance + ∑(Inflows) - ∑(Outflows)
```

Derive at read time to prevent drift. If performance becomes an issue, calculate periodic snapshots (e.g., daily EOD balance), not a stored balance.

---

## 5. PAYMENT VOUCHERS

### 5.1 Payment Voucher Model (Future — NOT Implemented)
```
PaymentVoucher
├── voucherNumber (unique per FY, e.g., "PV/2026-27/000123")
├── society
├── voucherDate
├── expense (ObjectId, reference to Expense being paid)
├── vendor (nullable ObjectId, reference to Vendor)
├── payee (nullable String — direct payee if no vendor)
├── grossAmountPaise
├── taxAmountPaise (0 unless policy approved)
├── netAmountPaise
├── paymentMethod: BANK_TRANSFER | CHEQUE | CASH
├── bankAccount (ObjectId, reference to Account used for payment)
├── reference (cheque no, UTR, confirmation number)
├── approvedBy (superadmin/authorized approver)
├── paidBy (admin who recorded payment)
├── supportingDocuments []
├── status: DRAFT | APPROVED | PAID | CANCELLED
├── createdBy, createdAt
├── paidAt
└── updatedAt
```

**Numbering:**
- Atomic via Counter mechanism (e.g., Counter._id = "voucher:2026-27")
- Format: "PV/2026-27/000001"
- Never reused after PAID (CANCELLED keeps number)

**Workflow:**
```
Expense APPROVED → Create Voucher (DRAFT)
                → Review & approve (Voucher.status = APPROVED)
                → Record payment (Voucher.status = PAID, paidAt, paidBy)
```

---

## 6. OTHER INCOME (Future)

### 6.1 Income Categories
```
COLLECTIONS:
  - Resident Maintenance (from bills)
  - Advance Payments

OPERATIONAL INCOME:
  - Amenity Income (guest room rental, etc. — if society has this)
  - Interest Income (if society maintains bank balance)
  - Parking Fees (if additional parking sold)
  - Miscellaneous (donations, etc.)
```

### 6.2 Income Recording (Future Model)
```
Income
├── incomeNumber (unique, "INC/2026-27/000123")
├── society
├── incomeDate
├── category
├── source (optional description)
├── amountPaise
├── bankAccount (which account received the income)
├── relatedPayment (nullable — if collected via resident payment)
├── reference (cheque no, UTR, deposit slip)
├── createdBy
└── timestamps
```

---

## 7. RECEIVABLES VS PAYABLES

### 7.1 Receivables (Money Owed TO Society)
- **Bill**: resident owes society
- **Outstanding**: sum of (bill.totalPaise - bill.paidPaise) per unit
- **Defaulter**: unit with outstanding > 0

**Tracking:**
- Bill.status indicates position (ISSUED, PARTIALLY_PAID, PAID, OVERDUE)
- No explicit Receivable model (derived from Bill + Payment)

### 7.2 Payables (Money Owed BY Society)
- **Vendor Invoice**: society owes vendor
- **Approved Expense**: society owes vendor/payee

**Tracking:**
- Expense.paymentStatus indicates position (APPROVED, PARTIALLY_PAID, FULLY_PAID)
- VendorInvoice.paymentStatus indicates position

**Distinction:**
- May have invoice (vendor sent it)
- May have expense (admin created the obligation)
- Both are payables until paid

---

## 8. CASH FLOW VS ACCOUNTING INCOME

### 8.1 Accounting Concepts (NOT Implemented Yet)
```
Cash Received ≠ Income
Example:
  - Resident pays ₹5,000 in advance
  - Cash flow: +₹5,000 (bank balance increases)
  - Accounting income: ₹0 (not earned yet; stored as liability)
  - Next month: allocation to bill → now it's income

Cash Paid ≠ Expense
Example:
  - Vendor sends invoice for ₹2,000 (not yet paid)
  - Accounting: Expense ₹2,000, Payable ₹2,000
  - Cash flow: ₹0 (not paid yet)
  - When paid: cash outflow ₹2,000
```

**27East Complexity:**
- NOT double-entry accounting (no GL accounts yet)
- But must distinguish cash movement from financial obligation
- Bills = earned income (even if unpaid)
- Expenses = obligations (even if unpaid)

### 8.2 Collections Report (Future)
```
Total Bills Issued (FY 2026-27)         ₹X
- Payments Received                     -₹Y
- Advance Credits Applied               -₹Z
= Outstanding Receivable                 ₹(X-Y-Z)
```

### 8.3 Expenditure Report (Future)
```
Total Expenses Approved (FY 2026-27)    ₹X
- Payments Made                         -₹Y
= Outstanding Payable                    ₹(X-Y)

Cash Available in Bank:
Opening Balance (Apr 1)                 ₹A
+ Collections Received                  +₹Y₁
- Expenses Paid                         -₹Y₂
= Closing Balance (Jun 30)               ₹(A+Y₁-Y₂)
```

---

## 9. VENDOR MASTER (Future — NOT Implemented)

### 9.1 Vendor Model
```
Vendor
├── society
├── companyName
├── category (Lift, Pest Control, Security, etc. — enum, not free text)
├── servicesProvided [] (multiple services per vendor)
├── status: ACTIVE | INACTIVE | SUSPENDED | TERMINATED
├── primaryContact
│   ├── name, designation
│   ├── phone, email
├── contacts [] (additional contacts)
│   ├── type: PRIMARY | ACCOUNT_MANAGER | TECHNICIAN | EMERGENCY | ESCALATION
│   └── name, designation, phone, email
├── address
├── gstNumber (masked/hashed if stored)
├── panNumber (masked/hashed if stored)
├── bankAccountInfo (minimal — masked account only, never full details)
├── notes
├── createdBy, createdAt
├── updatedBy, updatedAt
└── deactivatedAt (if INACTIVE/TERMINATED)
```

**NEVER STORE:**
- Bank account full number
- GST certificate PDF (use Document repository)
- Banking passwords
- Sensitive contracts in vendor record (use Document repository)

### 9.2 Multiple Contacts
- Vendor.primaryContact (for default/administrative contact)
- Vendor.contacts[] array (Primary, Account Manager, Technician, Emergency, Escalation)
- Allows precise escalation paths without hardcoding

### 9.3 Vendor Deactivation (NOT Deletion)
- Set status = INACTIVE
- Preserve history (past invoices, payments, service records)
- Never soft-delete or hard-delete

---

## 10. AMC / CONTRACT FINANCIAL INTEGRATION

### 10.1 AMC Model (Future — NOT Implemented)
```
AMC
├── society
├── vendor (ObjectId, reference to Vendor Master)
├── serviceName (Lift, DG, Fire System, etc.)
├── status: ACTIVE | EXPIRING_SOON | EXPIRED | RENEWED | TERMINATED
├── contractNumber
├── startDate, endDate, renewalDate
├── serviceFrequency (monthly, quarterly, annual, ad-hoc)
├── scopeOfWork
├── slaDetails
├── contractValuePaise
├── paymentTerms (Monthly, Quarterly, Annual)
├── paymentSchedule []
│   ├── installmentNumber
│   ├── amountPaise
│   ├── dueDate
│   ├── status: PENDING | PAID | OVERDUE
│   └── relatedExpense (ObjectId → Expense record when payment made)
├── responsibleAdmin (User who owns this contract)
├── documents [] (Document repository ObjectIds)
├── createdBy, createdAt
└── updatedBy, updatedAt
```

**Financial Tracking:**
- `contractValuePaise`: total contract value
- `paymentSchedule[]`: installments and due dates
- `relatedExpense`: each paid installment linked to Expense record
- Status tracks renewal deadlines

### 10.2 Service History (Future)
```
ServiceRecord
├── amc (ObjectId, reference to AMC)
├── visitDate
├── visitType: PREVENTIVE | BREAKDOWN | INSPECTION
├── technician
├── workDescription
├── partsReplaced [] (description, cost if applicable)
├── resolutionNotes
├── downtime (if asset down)
├── attachments [] (Document repository ObjectIds)
├── createdBy, createdAt
```

---

## 11. DOCUMENT REPOSITORY (Future)

### 11.1 Document Model
```
Document
├── society
├── title
├── documentDate
├── category: VENDOR_AGREEMENT | VENDOR_INVOICE | VENDOR_QUOTE | CONTRACT
  │            | INSURANCE | FIRE_CERT | LICENSE | NOC
  │            | SOCIETY_REG | MEETING_MINUTES | COMPLIANCE | TECHNICAL_MANUAL
  │            | PAYMENT_PROOF | OTHER
├── visibility: PRIVATE_ADMIN | FINANCE_RESTRICTED | COMMITTEE_RESTRICTED
  │            | RESIDENT_VISIBLE | PUBLIC_COMMUNITY
├── linkedVendor (nullable ObjectId)
├── linkedAMC (nullable ObjectId)
├── linkedExpense (nullable ObjectId)
├── linkedPaymentVoucher (nullable ObjectId)
├── linkedUnit (nullable ObjectId, if specific to a flat)
├── expiryDate (nullable, for certificates/agreements that expire)
├── fileMetadata
│   ├── mimeType
│   ├── sizeBytes
│   ├── uploadedAt
│   ├── uploadedBy
├── storageReference (e.g., S3 key, R2 path — NOT a public URL)
├── versionHistory [] (replacements, not overwrites)
│   ├── previousStorageReference
│   ├── replacedAt
│   └── replacedBy
└── timestamps
```

### 11.2 Private Object Storage (CRITICAL)
- **Database stores:** metadata only (title, visibility, linked entities, expiry date)
- **Private storage stores:** actual file
- **Options:** AWS S3, Cloudflare R2, Supabase Storage, Cloudinary private assets
- **NEVER:** Render local filesystem as authoritative
- **NEVER:** Public/permanent URLs to sensitive files
- **Download:** Server verifies authorization, streams file or generates signed short-lived URL

### 11.3 Visibility Enforcement
```
| Visibility | Superadmin | Admin | Member | Notes |
|---|---|---|---|---|
| PRIVATE_ADMIN | ✓ | ✗ | ✗ | Vendor secrets, sensitive contracts |
| FINANCE_RESTRICTED | ✓ | ✓ | ✗ | Financial reports, invoices |
| COMMITTEE_RESTRICTED | ✓ | Committee members | ✗ | Committee minutes (if applicable) |
| RESIDENT_VISIBLE | ✓ | ✓ | ✓ | Approved circulars, policies |
| PUBLIC_COMMUNITY | ✓ | ✓ | ✓ | Emergency procedures, rules |
```

---

## 12. EXPIRY & RENEWAL REMINDERS (Future)

### 12.1 Reminder Model
```
ReminderConfig
├── society
├── entityType: AMC | CONTRACT | VENDOR_AGREEMENT | INSURANCE | CERTIFICATE | DOCUMENT
├── advanceDays: [90, 60, 30, 15, 7] (days before expiry to trigger reminders)
├── enabled: Boolean
└── createdAt
```

### 12.2 Reminder Processing
```
CronJob: Daily (8 AM IST)
  FOR each AMC/Contract/Document with expiryDate:
    FOR each advanceDays in ReminderConfig:
      IF expiryDate - today == advanceDays:
        CREATE Reminder (TRIGGERED)
        NOTIFY admin (email)
        MARK Reminder as SENT
```

### 12.3 Reminder States
- **TRIGGERED:** Criteria met, reminder created
- **SENT:** Notification sent to admin
- **ACKNOWLEDGED:** Admin acknowledged
- **RENEWED:** Entity renewed, reminder closed
- **EXPIRED:** Expiry date passed, reminder shows as overdue

**Important:** Scheduled jobs must run on reliable infrastructure, NOT Render in-process timer (which can be interrupted).

---

## 13. FINANCIAL DASHBOARD (Future)

### 13.1 Dashboard Widgets
```
MONEY IN (Collections):
  - Total Billed (FY)
  - Total Collected (FY)
  - Outstanding (FY)
  - Collection % (Collected / Billed)
  - Defaulter Count (units with outstanding > 0)

MONEY OUT (Expenditure):
  - Total Expenses Approved (FY)
  - Total Expenses Paid (FY)
  - Outstanding Payables (FY)

CASH POSITION:
  - Bank Balance
  - Cash Balance
  - Net Cash Movement (YTD)

UPCOMING:
  - Bills Due This Month
  - Vendor Invoices Due This Month
  - Contract Renewals (30 days)
```

### 13.2 Dashboard Authorization
- Admin sees: collections, bank balance, expenses summary
- Superadmin sees: full financial dashboard
- Resident sees: only their unit's bill + payment summary (existing)

---

## 14. REPORTING ROADMAP (NOT Implemented)

### 14.1 Registers (CSV + PDF Export)
- **Bill Register:** bills, filters by period/unit/status
- **Collection Register:** payments, filters by date/method/status
- **Receipt Register:** receipts, filters by period
- **Outstanding Report:** defaulter list, outstanding balance by unit
- **Expense Register:** expenses, filters by category/vendor/status
- **Vendor Invoice Register:** invoices, filters by vendor/status
- **Payment Voucher Register:** vouchers, filters by vendor
- **Bank Book:** all transactions on a specific account
- **Cash Book:** all cash transactions

### 14.2 Analytical Reports (Later)
- **Income & Expenditure Statement:** bills - expenses = net
- **Budget vs Actual:** if budgeting feature added
- **Vendor-wise Expenses:** breakdown by vendor
- **Category-wise Expenses:** breakdown by category
- **AMC Commitment Summary:** contract values + paid + outstanding
- **Collections Trend:** billed vs collected over time (chart)

---

## 15. AUDIT REQUIREMENTS

### 15.1 Audit Events (Extend AuditLog)
```
EXPENSE ACTIONS:
  - EXPENSE_CREATED (draft)
  - EXPENSE_SUBMITTED (moving to approval)
  - EXPENSE_APPROVED / REJECTED
  - EXPENSE_PAID
  - EXPENSE_CANCELLED / VOIDED
  - EXPENSE_CORRECTED (reversing adjustment)

VENDOR ACTIONS:
  - VENDOR_CREATED / UPDATED / DEACTIVATED / REACTIVATED
  - VENDOR_CONTACT_ADDED / UPDATED

AMC ACTIONS:
  - AMC_CREATED / UPDATED / RENEWED / TERMINATED
  - AMC_PAYMENT_SCHEDULED
  - SERVICE_RECORD_CREATED

INVOICE ACTIONS:
  - VENDOR_INVOICE_RECEIVED
  - VENDOR_INVOICE_APPROVED / REJECTED
  - VENDOR_INVOICE_PAID / PARTIALLY_PAID

DOCUMENT ACTIONS:
  - DOCUMENT_UPLOADED
  - DOCUMENT_REPLACED (version)
  - DOCUMENT_DELETED / ARCHIVED
  - DOCUMENT_DOWNLOADED (if high-sensitivity)

REMINDER ACTIONS:
  - REMINDER_TRIGGERED
  - REMINDER_ACKNOWLEDGED
  - REMINDER_MARKED_RENEWED
```

### 15.2 Audit Context
Each record captures:
- **Actor:** individual admin/superadmin (User ObjectId)
- **Role:** admin/superadmin at time of action
- **Timestamp:** precise UTC
- **Safe metadata:** counts, categories, statuses
- **NO sensitive data:** amounts (for routine actions), vendor secrets, payment details

---

## 16. AUTHORIZATION MATRIX (Proposed)

| Action | Admin | Superadmin | Notes |
|--------|-------|-----------|-------|
| Create Expense (DRAFT) | ✓ | ✓ | Operational action |
| Submit Expense (DRAFT→PENDING) | ✓ | ✓ | Ready for approval |
| Approve Expense (PENDING→APPROVED) | ✗ | ✓ | Sensitive; superadmin only |
| Record Payment (APPROVED→PAID) | ✓ | ✓ | Admin can record, audit tracks |
| Reject Expense | ✗ | ✓ | Superadmin only |
| Create Vendor | ✓ | ✓ | Operational |
| Edit Vendor (basic info) | ✓ | ✓ | Operational |
| Deactivate Vendor | ✗ | ✓ | Superadmin only |
| Create AMC | ✓ | ✓ | Operational |
| Approve AMC | ✗ | ✓ | Superadmin only |
| Upload Document | ✓ | ✓ | Operational |
| Delete Document | ✗ | ✓ | Superadmin only |
| Change Document Visibility | ✗ | ✓ | Superadmin only |
| Configure Reminders | ✗ | ✓ | System configuration |

---

## 17. INTEGRATION WITH PHASE 3A BILLING

### 17.1 Not Replacing
- Bill, Payment, Receipt models remain unchanged
- Allocation logic remains unchanged
- Resident collections flow remains unchanged

### 17.2 Parallel Tracking
```
MONEY IN (Bill → Payment → Receipt)
  ↓
  → Ledger (chronological view per unit)
  → Collections Dashboard

MONEY OUT (Expense → Approval → Payment Voucher)
  ↓
  → Payable Ledger (chronological view per vendor)
  → Expenditure Dashboard

BANK (Account → Transactions)
  ↓
  → Bank Book (all account movements)
  → Cash Position Dashboard
```

### 17.3 Future Reconciliation
```
Resident Bill Ledger (unit-centric)
+ Vendor Payable Ledger (vendor-centric)
= Society Financial Position
```

---

## 18. IMPLEMENTATION PHASES (Proposed Sequence)

| Phase | Scope | Gate |
|-------|-------|------|
| **3A-3** ✓ | Bill Preview → Generate → Issue | Bills generated and issued correctly |
| **3A-4** | Flat Ledger + Resident Bill History | Ledger matches bills/payments |
| **3A-5** | Manual Payments + Allocation Engine | Offline payments work end-to-end |
| **3A-6** | Stripe Webhook Full Authority | No duplicate payments ever |
| **3A-7** | Receipts (Numbering, Register) | Receipt only from SUCCEEDED payment |
| **3A-8** | Finance Dashboard (KPIs, Reports) | KPIs reconcile to registers |
| **3A-9** | Legacy Cutover (Opening Balances) | Reconciliation verified |
| **3B-1** | Expense Model + Approval | Expense workflow end-to-end |
| **3B-2** | Vendor Master + AMC Foundation | Vendor CRUD + AMC structure |
| **3B-3** | Bank/Cash Accounts | Account tracking active |
| **3B-4** | Payment Vouchers | Voucher issuance working |
| **3B-5** | Document Repository (Private Storage) | Secure document upload/download |
| **3B-6** | Service History + Renewals | Reminders triggering correctly |
| **3B-7** | Expenditure Dashboard | Expense reports working |
| **3C** | Operational Integration | Full Money In/Money Out unified |

---

## 19. OPEN DECISIONS

### 19.1 Accounting Standard
- Simple cash-basis tracking (received = income, paid = expense)?
- Modified accrual (bills = income, expenses = obligation)?
- **Recommendation:** Start simple; defer accrual to 3C if society needs it

### 19.2 Tax Applicability
- GST on bills, expenses, services?
- TDS on vendor payments?
- **Recommendation:** Mark schema as NOT_CONFIGURED; require explicit policy before implementation

### 19.3 Approval Workflow
- Single-stage (superadmin approve)?
- Multi-stage (finance manager → superadmin)?
- Thresholds (amounts > ₹X need superadmin)?
- **Recommendation:** Single-stage initially; add thresholds in future

### 19.4 Budget Tracking
- Should 27East track approved budget vs actual spending?
- Should expense approval also check budget availability?
- **Recommendation:** Defer to Phase 3C; reserve schema fields but don't implement logic

### 19.5 Interest/Penalties
- Should overdue bills accrue interest automatically?
- Should penalties be automatic or manual (via Adjustment)?
- **Recommendation:** Manual for now (Phase 3A-8); auto-calculation deferred

### 19.6 Advance Payments
- Can residents pay in advance?
- Automatic apply to next bill vs manual?
- Interest on advance?
- **Recommendation:** Yes allow; auto-apply recommended; no interest (Phase 3C)

---

## 20. Non-Functional Requirements

### 20.1 Performance
- Ledger render (12 months): < 1 second (indexed queries)
- Dashboard load: < 2 seconds (aggregations)
- Expense list (1000s): < 1 second (pagination)

### 20.2 Data Integrity
- No orphaned expenses (vendor deleted but expense remains)
- No duplicate invoices (unique index on {vendor, invoiceNumber})
- No balance drift (computed at read time, not stored)

### 20.3 Auditability
- Every financial action attributed to individual actor
- All amounts immutable once confirmed
- Reversals create new records, not overwrites
- Comprehensive audit trail

---

## 21. Security Considerations

### 21.1 Data Privacy (See DATA_PRIVACY_SECURITY_ARCHITECTURE.md)
- Vendor bank details: never logged, never exposed to residents
- Financial reports: role-filtered (admin sees summary, superadmin sees detail)
- Document downloads: authorization-enforced

### 21.2 Fraud Prevention
- Dual approval: creation ≠ approval ≠ payment
- Payment method recorded (who paid, how)
- Receipts as proof (immutable snapshots)
- Audit trail for disputes

### 21.3 Secrets Management
- Never log Stripe secret, webhook secret, bank passwords
- Store only masked account identifiers
- Env vars for sensitive config

---

## 22. Status & Next Steps

**Current Status:** Phase 3A-3 (Bill Generation) in progress
**Design Status:** Money Out, Bank Accounts, Documents — design complete, NOT implemented
**Next:** Implement Phase 3A-4 (Ledger), then move to Phase 3B (Expenses) when Phase 3A-9 (Cutover) complete

---

**Document Version:** 1.0  
**Last Updated:** 2026-07-25  
**Reviewer:** Architecture  
**Approval:** Pending
