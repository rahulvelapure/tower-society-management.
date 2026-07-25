# 27East ERP – Enterprise Finance & Accounting System Architecture

**Version:** 2.0 (Phase 2 - ERP Foundation)  
**Status:** DESIGN PHASE  
**Date:** 2026-07-25  
**Classification:** Confidential - Architecture Only  

---

## Document Purpose

This document defines the complete architecture for 27East Finance & Accounting ERP system. It is NOT an implementation guide. It describes what will be built, not how to build it.

**READ THIS FIRST.** Do not implement code until this architecture is approved.

---

## Table of Contents

1. Executive Overview
2. Module Hierarchy
3. Core Financial Entities
4. Database Design
5. Workflow Architecture
6. Permission Model
7. Numbering Strategy
8. Accounting Rules & Principles
9. Audit Trail Design
10. Future Extensibility
11. Phase Implementation Roadmap
12. Governance & Approvals

---

## 1. Executive Overview

### 1.1 System Objective

27East Finance is an ERP-grade system for housing society financial management. Every transaction is traceable. Every rupee is accounted for. All records are auditable.

### 1.2 Core Principles

**Immutability:** Posted transactions cannot be edited or deleted. Corrections use credit notes or reversals.

**Auditability:** Every change generates audit records with actor, timestamp, reason, approval chain.

**Separation of Duties:** No single person can approve their own payment. No resident billing officer can approve resident refunds.

**Fund Accounting:** Money is tracked by fund (maintenance, sinking, corpus, repair). Funds cannot be commingled without explicit transfer.

**Double Entry:** All transactions follow double-entry accounting. Every debit has a corresponding credit.

**Approval Chain:** Major transactions (payments > ₹50,000, expense > ₹1,00,000) require committee approval.

**Compliance:** Monthly closing, annual reports, tax documentation support.

### 1.3 Scope - Phase 2 Covers

- Resident billing & collections
- Expense management & vendor payments
- Cash & bank management
- Basic financial reporting
- Budget management
- Bank reconciliation
- Year-end closing

**NOT in Phase 2:** Asset management, AMC register, GST returns, fixed asset depreciation, income tax integration, payroll.

---

## 2. Module Hierarchy

### 2.1 Core Modules (All Phases)

```
FINANCE SYSTEM (Root)
│
├─ RESIDENT LEDGER (Phase 2A)
│  ├─ Resident Account
│  ├─ Receivables
│  ├─ Collections
│  └─ Adjustments
│
├─ COLLECTIONS (Phase 2B)
│  ├─ Payments In
│  ├─ Payment Modes
│  ├─ Bank Deposits
│  └─ Bounce Handling
│
├─ PAYMENT ALLOCATION (Phase 2C)
│  ├─ Auto Allocation
│  ├─ Manual Allocation
│  ├─ Partial Payments
│  └─ Reversal
│
├─ RECEIPTS (Phase 2D)
│  ├─ Receipt Generation
│  ├─ Receipt History
│  ├─ Receipt Cancellation
│  └─ Receipt Repository
│
├─ EXPENSES (Phase 2E)
│  ├─ Expense Requisitions
│  ├─ Approval Workflow
│  ├─ Payment Vouchers
│  └─ Expense Categories
│
├─ VENDOR MANAGEMENT (Phase 2F)
│  ├─ Vendor Master
│  ├─ Vendor Ledger
│  ├─ Vendor Contracts
│  └─ Vendor Performance
│
├─ CASH & BANK (Phase 2G)
│  ├─ Bank Accounts
│  ├─ Cash Book
│  ├─ Bank Book
│  ├─ Bank Reconciliation
│  └─ Petty Cash
│
├─ FINANCIAL REPORTS (Phase 2H)
│  ├─ Ledger Reports
│  ├─ Trial Balance
│  ├─ Fund Statement
│  └─ Collection Reports
│
├─ BUDGET (Phase 2I)
│  ├─ Budget Setup
│  ├─ Budget vs Actual
│  ├─ Budget Variance
│  └─ Budget Alert
│
├─ BANK RECONCILIATION (Phase 2J)
│  ├─ Reconciliation Engine
│  ├─ Outstanding Checks
│  ├─ Bank Clearance
│  └─ Reconciliation Reports
│
└─ YEAR-END CLOSING (Phase 2K)
   ├─ Closing Checklist
   ├─ Opening Balance Setup
   ├─ Carry Forward
   └─ Archive
```

### 2.2 Support Modules (All Phases)

```
SUPPORT SYSTEMS
│
├─ AUDIT TRAIL
│  └─ All changes logged with actor, timestamp, reason
│
├─ NOTIFICATION ENGINE
│  ├─ Approval Notifications
│  ├─ Deadline Alerts
│  ├─ Exception Alerts
│  └─ Compliance Notifications
│
├─ DOCUMENT REPOSITORY
│  ├─ Bill Attachments
│  ├─ Receipt PDFs
│  ├─ Voucher Attachments
│  ├─ Approval Evidence
│  └─ Tax Documents
│
├─ BACKUP & RECOVERY
│  └─ Financial data backup strategy
│
└─ COMPLIANCE
   ├─ Regulatory Requirements
   ├─ Tax Documentation
   └─ Audit Preparation
```

---

## 3. Core Financial Entities & Relationships

### 3.1 Entity Diagram (Text)

```
RESIDENTS (from RC1)
│
├─> BILLING PERIODS
│   ├─> BILLS (Invoices to residents)
│   │   └─> BILL_CHARGES (Line items: maintenance, water, parking)
│   │       └─> CHARGE_COMPONENTS (Configured per society)
│   │
│   └─> BILL_ADJUSTMENTS (Discounts, manual adjustments)
│
├─> PAYMENTS (Resident receives payment)
│   ├─> PAYMENT_ALLOCATIONS (How payment is applied)
│   │   ├─> Against outstanding bills
│   │   ├─> Against previous receivables
│   │   └─> As advance/security deposit
│   │
│   └─> RECEIPTS (Proof of payment)
│       └─> RECEIPT_DETAILS (Payment mode, timestamp, confirmation)
│
├─> CREDIT_NOTES (Reversal, damage recovery, overpayment)
│   └─> CREDIT_REVERSALS (When credit is applied)
│
└─> RESIDENT_LEDGER (Running balance per resident)
    ├─> Opening Balance
    ├─> Debits (Bills raised)
    ├─> Credits (Payments received)
    ├─> Adjustments (Writeoffs, reversals)
    └─> Closing Balance


EXPENSES
│
├─> EXPENSE_CATEGORIES (Maintenance, Salary, Utilities, etc.)
│
├─> VENDORS
│   ├─> Vendor Master
│   ├─> Vendor Contacts
│   ├─> Vendor Ledger (Running balance)
│   ├─> Vendor Contracts
│   └─> Bank Details (Payment method)
│
├─> EXPENSES (Requisition → Approval → Payment → Voucher)
│   ├─> Expense Requisitions (Raise request)
│   ├─> Expense Approvals (Multi-level)
│   ├─> Purchase Orders (Against vendor)
│   ├─> Invoices (From vendor)
│   ├─> Payment Vouchers (Authorization for payment)
│   └─> Expense Ledger (Posted to accounts)
│
└─> EXPENSE_CATEGORIES_LEDGER (Category-wise spending)


CASH & BANK
│
├─> BANK_ACCOUNTS (Multiple banks, petty cash)
│   ├─> Account Master
│   ├─> Cash Book (Inflows/outflows)
│   ├─> Bank Book (Bank statement items)
│   ├─> Bank Reconciliation (Matching)
│   └─> Bank Statement Uploads
│
├─> PETTY_CASH
│   ├─> Petty Cash Accounts
│   ├─> Cash Issued
│   ├─> Cash Receipts
│   └─> Petty Cash Settlement
│
└─> FUNDS (Fund-wise tracking)
    ├─> Maintenance Fund
    ├─> Sinking Fund
    ├─> Corpus Fund
    ├─> Repair Fund
    └─> Fund Transfers (With approval)


BUDGETS
│
├─> BUDGET_HEADS (Expense categories)
│
└─> BUDGET_ALLOCATION (Annual allocation per head)
    ├─> Planned Amount
    ├─> Actual Spending
    ├─> Variance
    └─> Year-end Review
```

### 3.2 Key Relationships

| Entity A | Relationship | Entity B | Cardinality |
|----------|--------------|----------|------------|
| Resident | Has Many | Bills | 1:N |
| Bill | Has Many | Bill Charges | 1:N |
| Bill | Has One | Receivable | 1:1 |
| Receivable | Has Many | Payments | 1:N |
| Payment | Has Many | Payment Allocations | 1:N |
| Payment | Has One | Receipt | 1:1 |
| Vendor | Has Many | Expenses | 1:N |
| Expense | Has Many | Approvals | 1:N |
| Expense | Has One | Payment Voucher | 1:1 |
| Bank Account | Has Many | Transactions | 1:N |
| Budget | Has One | Category | 1:1 |
| Fund | Has Many | Transactions | 1:N |

---

## 4. Database Design

### 4.1 Design Principles

1. **Normalization:** 3NF to avoid data anomalies
2. **Immutability:** Posted transactions cannot be modified
3. **Audit Trail:** Every change tracked
4. **Referential Integrity:** Foreign keys enforced
5. **Indexing:** Performance on common queries (resident lookup, date range, balance)
6. **Soft Delete:** Mark deleted records; never physically remove
7. **Status Tracking:** Bill status, payment status, approval status

### 4.2 Core Tables (Conceptual)

#### RESIDENT_LEDGER
```
id (uuid)
resident_id (fk)
opening_balance (decimal)
total_debits (decimal)      -- Bills raised
total_credits (decimal)      -- Payments received
total_adjustments (decimal)  -- Writeoffs, reversals
closing_balance (decimal)
period_start (date)
period_end (date)
last_payment_date (date)
last_payment_amount (decimal)
status (active/inactive)
created_at (timestamp)
updated_at (timestamp)
audit_trail_id (fk)
```

#### BILLS
```
id (uuid)
bill_number (string - unique, indexed)  -- BILL-2026-000001
resident_id (fk)
billing_period_id (fk)
issue_date (date)
due_date (date)
amount_due (decimal)
amount_paid (decimal)
amount_outstanding (decimal)
status (draft/issued/partial/paid/overdue/cancelled)
pdf_url (string)
created_by (user_id)
created_at (timestamp)
audit_trail_id (fk)
is_posted (boolean)  -- Once posted, cannot edit
posted_date (timestamp)
posted_by (user_id)
notes (text)
```

#### PAYMENTS
```
id (uuid)
payment_number (string - unique)  -- PAY-2026-000001
resident_id (fk)
amount (decimal)
payment_date (date)
payment_mode (cash/cheque/online/dd)
reference_number (string)  -- Cheque no, UPI ref
bank_account_id (fk)
status (received/cleared/bounced/reversed)
cleared_date (date)
created_at (timestamp)
received_by (user_id)
audit_trail_id (fk)
is_allocated (boolean)
allocation_date (timestamp)
```

#### PAYMENT_ALLOCATIONS
```
id (uuid)
payment_id (fk)
bill_id (fk - nullable)  -- Can be null if advance payment
amount (decimal)
allocation_date (date)
allocated_by (user_id)
allocation_type (against_current/against_arrears/advance/security)
audit_trail_id (fk)
is_reversible (boolean)  -- Can be reversed if not settled
```

#### RECEIPTS
```
id (uuid)
receipt_number (string - unique)  -- RCPT-2026-000001
payment_id (fk)
resident_id (fk)
amount (decimal)
receipt_date (date)
payment_mode (cash/cheque/online/dd)
reference_number (string)
received_by (user_id)
pdf_url (string)  -- Generated PDF
created_at (timestamp)
cancelled_date (date - nullable)
cancellation_reason (text)
cancelled_by (user_id)
audit_trail_id (fk)
```

#### EXPENSES
```
id (uuid)
expense_number (string - unique)  -- EXP-2026-000001
vendor_id (fk)
category_id (fk)
fund_id (fk)  -- Which fund
amount (decimal)
expense_date (date)
description (text)
status (requisition/approved/paid/rejected)
approval_chain (json)  -- [approver1, approver2, ...]
approval_status (pending/approved/rejected)
payment_voucher_id (fk - nullable)
payment_date (date - nullable)
paid_by (user_id)
created_by (user_id)
created_at (timestamp)
audit_trail_id (fk)
attachments (json)  -- Invoice, PO, etc.
```

#### PAYMENT_VOUCHERS
```
id (uuid)
voucher_number (string - unique)  -- PV-2026-000001
expense_id (fk)
vendor_id (fk)
amount (decimal)
voucher_date (date)
payment_date (date)
payment_mode (cheque/online/cash)
cheque_number (string - nullable)
bank_account_id (fk)
status (draft/posted/paid)
authorized_by (user_id)
authorized_date (date)
paid_by (user_id)
paid_date (date)
reconciled (boolean)
reconciled_date (date)
audit_trail_id (fk)
```

#### BANK_ACCOUNTS
```
id (uuid)
account_number (string - unique)
bank_name (string)
account_holder (string)
account_type (checking/savings/petty_cash)
currency (INR)
opening_balance (decimal)
opening_date (date)
status (active/inactive/closed)
reconciliation_method (monthly/daily)
last_reconciliation_date (date)
last_reconciliation_by (user_id)
created_at (timestamp)
audit_trail_id (fk)
```

#### AUDIT_TRAIL
```
id (uuid)
entity_type (string)  -- Bill, Payment, Expense, etc.
entity_id (uuid)
action (create/update/delete/post/approve/reject)
actor_id (user_id)  -- Who made the change
actor_role (superadmin/admin/treasurer/etc.)
old_value (json)  -- Previous state
new_value (json)  -- New state
reason (text)  -- Why the change
timestamp (timestamp)
ip_address (string)
user_agent (string)
approval_chain (json)  -- If approval action
```

### 4.3 Indexes

```
Primary:
- bills(bill_number)
- payments(payment_number)
- receipts(receipt_number)
- expenses(expense_number)
- payment_vouchers(voucher_number)

Performance:
- bills(resident_id, billing_period_id)
- bills(status, due_date)
- payments(resident_id, payment_date)
- payments(status, bank_account_id)
- expenses(vendor_id, expense_date)
- expenses(status, category_id)
- payment_vouchers(expense_id, status)
- resident_ledger(resident_id, period_start)

Audit:
- audit_trail(entity_type, entity_id, timestamp)
- audit_trail(actor_id, timestamp)
```

---

## 5. Workflow Architecture

### 5.1 Billing Workflow

```
Billing Period Created (Admin)
    ↓
Bills Generated (Automatic from resident charges)
    ↓
Bills Posted (Superadmin/Treasurer approval)
    ├─ Cannot edit after posting
    └─ Audit trail recorded
    ↓
Bills Sent to Residents (Email notification)
    ↓
Resident Receives Payment
    ├─ Online (Stripe/PayGate)
    └─ Offline (Cheque, cash at office)
    ↓
Payment Recorded (Billing officer)
    ├─ Verify amount, cheque details
    └─ Audit trail recorded
    ↓
Payment Allocated to Bills (Automatic or manual)
    ├─ Default: against oldest bill first
    ├─ Manual: admin chooses allocation
    └─ Audit trail recorded
    ↓
Receipt Generated (Automatic)
    └─ Sent to resident
    ↓
Cheque Clearing (Wait for bank clearance)
    ├─ Status: received → cleared
    └─ Mark payment as settled
```

### 5.2 Expense Workflow

```
Expense Requisition Raised (Admin/Committee)
    ├─ Amount, category, vendor, description
    └─ Requires approval for amounts > threshold
    ↓
Approval Chain (Based on amount & type)
    ├─ < ₹10,000: Self-approved if admin
    ├─ ₹10,001 - ₹50,000: Treasurer approval
    └─ > ₹50,000: Committee approval (2+ votes)
    ↓
Rejected: Returned to requester with reason
    ↓
Approved: Convert to Purchase Order (PO)
    ├─ Send to vendor
    └─ Track PO status
    ↓
Invoice Received from Vendor
    ├─ Verify against PO
    └─ Check amount, date, GST (if applicable)
    ↓
Create Payment Voucher
    ├─ Authorize payment
    └─ Choose payment mode
    ↓
Payment Made
    ├─ Cheque issued, online transfer, or cash
    └─ Record in bank book
    ↓
Payment Reconciliation
    ├─ Match payment to bank clearance
    └─ Mark as settled
    ↓
Expense Posted (Audit trail generated)
    └─ Cannot edit after posting
```

### 5.3 Payment Collection Workflow

```
Cheque Received (Office)
    ├─ Record: date, amount, cheque number, bank
    └─ Physical custody established
    ↓
Cheque Deposited (Bank deposit slip created)
    ├─ Amount recorded
    └─ Bank account selected
    ↓
Bank Clears Cheque (1-3 days)
    ├─ Status: received → pending → cleared
    └─ Timestamp recorded
    ↓
Payment Reconciled (Bank book vs Cash book)
    ├─ Automatic daily reconciliation
    └─ Exceptions flagged
    ↓
Bounce Processing (If cheque bounces)
    ├─ Notify resident
    ├─ Reverse payment allocation
    ├─ Add penalty
    └─ Follow-up required
```

### 5.4 Bank Reconciliation Workflow

```
Bank Statement Downloaded (Monthly)
    ├─ Parse transactions
    └─ Load into system
    ↓
Match Transactions
    ├─ Deposit: receipt + payment → bank transaction
    ├─ Cheque: payment voucher → bank cheque clearing
    └─ Online: payment voucher → bank transaction
    ↓
Identify Unmatchd Items
    ├─ Bank transactions without corresponding payment
    ├─ Payments not yet cleared by bank
    └─ Amount mismatches
    ↓
Create Reconciliation Report
    ├─ Cash book balance
    ├─ Bank book balance
    ├─ Outstanding items
    └─ Difference
    ↓
Approve Reconciliation (Treasurer)
    ├─ Verify differences explained
    └─ Post adjustment entries if needed
```

---

## 6. Permission Model

### 6.1 Role Definition

| Role | Permission Level | Financial Authority |
|------|------------------|-------------------|
| Resident | View | View own bills & receipts only |
| Superadmin | Full | Approve all, system admin, posting authority |
| Treasurer | High | Approve payments, expense budgets, reconciliation |
| Secretary | Medium | Approve expenses < ₹50k, general approvals |
| Committee Member | Medium | Vote on major expenses (> ₹50k) |
| Accountant | Medium | Record transactions, generate reports, reconcile |
| Admin | Medium-High | Manage members, create bills, record payments |
| Auditor | Read-Only | View all records, generate audit reports, cannot modify |

### 6.2 Module-Level Permissions

| Module | Resident | Admin | Treasurer | Accountant | Auditor | Superadmin |
|--------|----------|-------|-----------|-----------|---------|-----------|
| View Own Bills | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| View All Bills | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create Bills | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Post Bills | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| Record Payments | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Allocate Payments | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Create Expenses | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Approve Expenses | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| Record Payments (Out) | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Bank Reconciliation | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ |
| View Reports | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Audit Trail | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ |
| Year-End Closing | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

### 6.3 Anti-Patterns (Never Allow)

- Resident approving their own refund
- Admin approving their own expense
- Finance officer posting their own transaction
- Auditor modifying any transaction
- Citizen changing someone else's payment
- Vendor viewing other vendor payments

---

## 7. Numbering Strategy

### 7.1 Automatic Sequential Numbers

All financial documents get sequential numbers. Format: `PREFIX-YYYY-SEQUENCE`

```
BILL-2026-000001      (Bills)
RCPT-2026-000001      (Receipts)
PAY-2026-000001       (Payments In)
EXP-2026-000001       (Expenses)
PV-2026-000001        (Payment Vouchers)
CN-2026-000001        (Credit Notes)
REF-2026-000001       (Refunds)
PO-2026-000001        (Purchase Orders)
INV-2026-000001       (Vendor Invoices)
```

### 7.2 Numbering Rules

1. **Sequential:** Always increment by 1. No gaps (except for cancelled documents).
2. **Unique:** No two documents can have the same number.
3. **Per Year:** Sequence resets Jan 1st each year.
4. **Immutable:** Once assigned, number cannot change.
5. **Cancelled Docs:** Keep the number but mark as "Cancelled" (don't reuse).
6. **Batch Numbering:** If batch billing, assign range (BILL-2026-000001 to BILL-2026-000112).

### 7.3 Implementation

```sql
CREATE TABLE document_sequences (
  id uuid primary key,
  document_type varchar(10),  -- BILL, RCPT, PAY, etc.
  year int,
  sequence int,
  last_number_issued int,
  next_number int,
  created_at timestamp,
  updated_at timestamp
);

-- Stored procedure: get_next_number('BILL', 2026) → BILL-2026-000001
```

---

## 8. Accounting Rules & Principles

### 8.1 Double Entry Accounting

Every transaction has two sides:

```
Debit (Charge to account)  =  Credit (Source of funds)

Example 1: Bill Raised
  Debit:  Resident Receivable (Asset)
  Credit: Maintenance Revenue (Income)

Example 2: Payment Received
  Debit:  Cash/Bank (Asset)
  Credit: Resident Receivable (Asset reduction)

Example 3: Expense Paid
  Debit:  Maintenance Expense (Expense)
  Credit: Cash/Bank (Asset reduction)
```

### 8.2 Fund-Based Accounting

Money is tracked by fund origin:

| Fund | Purpose | How It Grows | How It's Used |
|------|---------|-------------|--------------|
| Maintenance Fund | Monthly operations | Monthly maintenance charges | Routine repairs, utilities |
| Sinking Fund | Large repairs | Annual corpus contribution | Major repairs (>₹5L) |
| Repair Fund | Emergency repairs | Ad-hoc assessment | Urgent repairs |
| Corpus Fund | Building reserve | Corpus amount | Only for capital expenses |

### 8.3 Transaction Types

| Type | Debit | Credit | Example |
|------|-------|--------|---------|
| Bill Raised | Receivable | Revenue | Monthly maintenance bill |
| Payment In | Bank | Receivable | Resident pays bill |
| Advance Payment | Bank | Security Deposit (Liability) | Resident deposits advance |
| Expense | Category Expense | Bank | Pay vendor invoice |
| Adjustment | Receivable | Write-off Expense | Waive outstanding |
| Credit Note | Revenue Reversal | Receivable | Reverse bill/refund |
| Fund Transfer | Receiving Fund | Sending Fund | Transfer sinking → maintenance |

### 8.4 Account Structure (Chart of Accounts)

```
ASSETS
  1000 Cash
    1010 Cash in Hand
    1020 Petty Cash
  1100 Bank
    1110 ICICI Savings
    1120 HDFC Current
  1200 Receivables
    1210 Resident Receivable
    1220 Vendor Advance
  1300 Other Assets

LIABILITIES
  2000 Payables
    2010 Vendor Payable
  2100 Deposits
    2110 Security Deposits (Resident)
    2120 Earnest Money

EQUITY
  3000 Opening Balance
  3100 Retained Earnings
  3200 Corpus Fund

REVENUE
  4000 Maintenance Charges
    4010 Flat Charges
    4020 Late Payment Charges
  4100 Other Income
    4110 Parking Revenue
    4120 Water Charges

EXPENSES
  5000 Maintenance Expenses
    5010 Repairs & Maintenance
    5020 Utilities
    5030 Salaries
  5100 Fund Allocation
    5110 Sinking Fund Corpus
    5120 Repair Fund Corpus
```

### 8.5 Period Closing Rules

At end of each month:
1. All bills must be posted
2. All payments must be allocated
3. Receivables reconciled
4. Bank reconciliation completed
5. Expense vouchers posted
6. Trial balance generated (all debits = credits)
7. Management review & approval

At end of each year:
1. Complete bank reconciliation
2. Audit trail review
3. Opening balance for next year set
4. Carry forward balances
5. Financial statements prepared
6. Auditor sign-off
7. Archive prior year data

---

## 9. Audit Trail Design

### 9.1 Every Change Is Logged

```
What Changed:
- Entity type (Bill, Payment, Expense)
- Entity ID (bill_id, payment_id)
- Field changed (amount, status, date)
- Old value (before)
- New value (after)

Who Changed It:
- User ID
- User role
- User name (for audit report)

When:
- Timestamp (to seconds)
- Timezone
- Session ID

Why:
- Change reason (text, optional but encouraged)
- Associated approval/ticket (if applicable)

Where:
- IP address
- Browser/device info

How:
- Via API/UI
- From which screen/function
```

### 9.2 Immutable Audit Trail

Once logged, audit entries cannot be modified. They are append-only.

```sql
CREATE TABLE audit_trail (
  id uuid primary key,
  entity_type varchar(50),
  entity_id uuid,
  action varchar(20),  -- create, update, delete, post, approve
  actor_id uuid,
  actor_name varchar(100),
  actor_role varchar(50),
  old_value jsonb,
  new_value jsonb,
  reason text,
  approval_id uuid,  -- if this is an approval
  timestamp timestamp,
  ip_address inet,
  user_agent text,
  constraint immutable unique(id)  -- Cannot be updated
);

CREATE TRIGGER prevent_audit_modification
BEFORE UPDATE ON audit_trail
FOR EACH ROW
RAISE EXCEPTION 'Audit trail is immutable';
```

### 9.3 Audit Reports

**For Auditor:**
- All changes to financial records
- All approvals and rejections
- All postings
- All year-end closings
- All user activities
- Exception log (unusual transactions, late payments, etc.)

**For Management:**
- Financial transaction summary
- Exception report
- Approval efficiency (average approval time)
- User activity summary

---

## 10. Future Extensibility

### 10.1 GST & Taxes (Future)

When GST implementation required:
```
INVOICE_DETAILS
  amount (before tax)
  gst_rate (5%, 12%, 18%)
  gst_amount
  total_amount (after tax)
  hsn_code
  sac_code
  place_of_supply
  
GSTR_REPORTS
  GSTR-1 (Outward supplies)
  GSTR-2 (Inward supplies)
  GSTR-3B (Summary)
  
TAX_RECONCILIATION
  GST collected
  GST paid
  GST due
```

### 10.2 Multi-Currency (Future)

When international transactions needed:
```
TRANSACTIONS
  amount_base_currency
  conversion_rate
  amount_reporting_currency
  exchange_gain_loss
  
BANK_ACCOUNTS
  currency (INR, USD, etc.)
  conversion_policy (spot, forward, etc.)
```

### 10.3 Fixed Assets & Depreciation (Future)

```
ASSET_REGISTER
  asset_name
  asset_category
  purchase_date
  cost
  useful_life_years
  depreciation_method (straight_line, etc.)
  book_value
  depreciation_expense
  
DEPRECIATION_SCHEDULE
  monthly_depreciation
  annual_depreciation
  accumulated_depreciation
```

### 10.4 Payroll (Future)

```
SALARY_COMPONENTS
  base_salary
  allowances
  deductions
  net_salary
  
PAYROLL
  employee_id
  month
  salary_slip
  payment_voucher
  
TAX_WITHHOLDING
  PF deduction
  TDS deduction
  Income tax
```

---

## 11. Phase Implementation Roadmap

### Phase 2A: Resident Ledger
**Objective:** Complete resident accounting with full receivables tracking

**Deliverables:**
- Resident ledger main account view
- Opening & closing balance tracking
- Collection history per resident
- Receivables aging report
- Late payment notification

**Database:** resident_ledger, resident_transactions

---

### Phase 2B: Payment Collection
**Objective:** Record all payment modes with bank integration

**Deliverables:**
- Payment recording (cheque, cash, online, DD)
- Bank deposit slip generation
- Cheque bounce handling
- Collection register report

**Database:** payments, payment_details

---

### Phase 2C: Payment Allocation
**Objective:** Match payments to bills with flexibility

**Deliverables:**
- Auto allocation (oldest bill first)
- Manual allocation
- Partial payment handling
- Advance/security deposit management

**Database:** payment_allocations

---

### Phase 2D: Receipts
**Objective:** Generate audit-proof receipts

**Deliverables:**
- Receipt generation
- Receipt cancellation (with reason)
- Receipt repository (searchable)
- Receipt email sending

**Database:** receipts

---

### Phase 2E: Expense Management
**Objective:** Complete expense lifecycle

**Deliverables:**
- Expense categories
- Approval workflow (amount-based)
- Expense tracking
- Expense register report

**Database:** expenses, expense_approvals

---

### Phase 2F: Vendor Management
**Objective:** Vendor master and vendor ledger

**Deliverables:**
- Vendor master
- Vendor contact details
- Vendor ledger (running balance)
- Vendor performance tracking

**Database:** vendors, vendor_ledger

---

### Phase 2G: Cash & Bank
**Objective:** Multi-account cash management

**Deliverables:**
- Multiple bank accounts
- Petty cash tracking
- Cash book (daily)
- Bank book (statement-based)
- Bank clearance tracking

**Database:** bank_accounts, cash_book, bank_book

---

### Phase 2H: Financial Reports
**Objective:** Core financial reporting

**Deliverables:**
- Resident ledger report
- Vendor ledger report
- Collection register
- Expense register
- Fund-wise statement
- Category-wise expense

**Database:** report generation from audit trail

---

### Phase 2I: Budget Management
**Objective:** Annual budget setup and tracking

**Deliverables:**
- Budget allocation by category
- Budget vs actual comparison
- Budget variance alerts
- Excess spending notification

**Database:** budgets, budget_actual

---

### Phase 2J: Bank Reconciliation
**Objective:** Monthly bank reconciliation

**Deliverables:**
- Bank statement upload
- Automatic transaction matching
- Outstanding items tracking
- Reconciliation approval

**Database:** bank_statements, bank_reconciliation

---

### Phase 2K: Year-End Closing
**Objective:** Annual financial close

**Deliverables:**
- Closing checklist
- Opening balance setup
- Carry forward balances
- Archive prior year

**Database:** year_end_close, archive

---

## 12. Governance & Approvals

### 12.1 Architecture Review Checklist

Before implementation, this architecture must be reviewed and approved by:

- [ ] **Treasurer** - Financial rules compliance
- [ ] **Auditor** - Audit trail sufficiency
- [ ] **Committee Chair** - Policy alignment
- [ ] **Tech Lead** - System feasibility
- [ ] **Database Architect** - Schema soundness

### 12.2 Implementation Gating

Each phase requires:
- [ ] Architecture approval (this document)
- [ ] Database schema review
- [ ] API design review
- [ ] Security review
- [ ] QA test plan approval
- [ ] UAT completion
- [ ] Auditor sign-off
- [ ] Committee approval to go live

### 12.3 Code Review Requirements

Every implementation commit must include:
- [ ] Unit tests (>80% coverage)
- [ ] Integration tests
- [ ] QA checklist completion
- [ ] Security checklist sign-off
- [ ] Audit trail verification
- [ ] Database transaction safety verification

---

## Conclusion

This architecture provides the foundation for a professional, auditable, scalable financial system. It prioritizes data integrity, auditability, and compliance over speed. Implementation will be systematic, one module at a time, with thorough testing and governance at each phase.

**Status:** Architecture phase complete. Awaiting approval before Phase 2A implementation begins.

---

**Document:** FINANCE_ARCHITECTURE.md  
**Version:** 2.0  
**Classification:** Design Document  
**Approval Status:** PENDING REVIEW  

**Next Step:** Schedule architecture review with Treasurer, Auditor, Committee Chair, Tech Lead, and Database Architect.
