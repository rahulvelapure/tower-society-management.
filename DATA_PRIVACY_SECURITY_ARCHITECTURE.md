# 27East Data Privacy & Security Architecture

**Status: Design Phase 3A-3 (Bill Generation)**

This document defines the privacy-by-design principles and security architecture for 27East, a residential society management system. Privacy is a **core architectural requirement**, not a feature added later.

---

## 1. Privacy Principles

### 1.1 Privacy by Design
- Security controls are built into the system architecture, not bolted on
- Default to PRIVATE—only explicitly approved information is shared
- Least privilege: each role sees minimum necessary information
- Server-side authorization enforcement on every sensitive request

### 1.2 Data Minimization
- Collect only information necessary for legitimate functions
- Do not store sensitive credentials or payment details
- Aggregate and delete temporary working data when no longer needed

### 1.3 Resident Privacy (Critical)
**A normal RESIDENT must NOT access another resident's private information, even by:**
- Changing URL parameters or ObjectIds
- Manipulating form requests
- Using browser developer tools
- Guessing another Bill ID, Payment ID, User ID, or Unit ID

**Default rule: PRIVATE UNLESS EXPLICITLY ALLOWED**

---

## 2. Data Classification

### 2.1 Public / Community Information
- Resident Directory (optional, with privacy preferences)
- Emergency contact numbers (if resident opts in)
- Noticeboard announcements (if community-approved)

### 2.2 Private Resident Data
- Personal profile (name, phone, email, address, ID numbers)
- Household composition (family members, occupants)
- Occupancy status (owner, tenant, move-in/out dates)
- Authentication data (password, tokens, OTP, session)

### 2.3 Financial Data (Confidential)
- Bills (amounts due, charges, line items)
- Payments (amounts, methods, transaction references, timing)
- Receipts (payment proof, allocation details)
- Payment history and ledger
- Outstanding balance and dues status
- Advance payments / credits
- Invoices and vendor information
- Bank account details (masked only)

### 2.4 Admin / Operational Data (Restricted)
- Vendor information (banking, tax IDs, contracts)
- Financial reports and summaries
- Approval workflows and administrative notes
- Compliance and regulatory documents

### 2.5 System / Audit Data (Restricted)
- Application logs (no sensitive data)
- Audit trail of financial actions
- Access logs and authorization decisions

---

## 3. Resident Privacy Boundaries

### 3.1 A Resident Can See
- **Their own** unit information
- **Their own** bills (ISSUED status only)
- **Their own** payment history and receipts
- **Their own** outstanding balance
- **Their own** personal profile
- **Their own** complaints/helpdesk tickets
- Approved community bulletin/announcements

### 3.2 A Resident CANNOT See
- **Any other resident's** private profile
- **Any other resident's** bills, payments, receipts
- **Any other resident's** outstanding dues
- **Any other resident's** payment method
- **Any other resident's** complaints or helpdesk tickets
- **Any other resident's** household information
- Vendor data, contracts, financial reports
- Admin-only financial information
- Another unit's occupancy or personal details

### 3.3 Authorization-Enforced
These boundaries are **enforced server-side**, not by hidden UI:
- Every route checks `req.user.unit` or session-based context
- ObjectIds are never trusted from the browser
- Direct URL manipulation (`/bill/someone-else-id`) returns 403
- No information leakage in error messages

---

## 4. Resident Directory (Limited Exception)

The only approved resident-to-resident information sharing is the Resident Directory, designed as a separate privacy-safe view model.

### 4.1 Resident Directory Fields (Approved to Share)
- Display name (optional; may be nickname)
- Flat / Unit number
- Approved contact phone (if resident opts in)
- Approved contact email (if resident opts in)

### 4.2 Directory Privacy Controls
- Each resident controls: "Show phone in directory" (yes/no)
- Each resident controls: "Show email in directory" (yes/no)
- Default: HIDDEN (residents must opt-in)
- Directory query selects **only approved fields**, not full User document

### 4.3 Directory NEVER Exposes
- Password / authentication data
- Internal account status (pending, active, deactivated)
- Role or admin permissions
- Bills, payment history, outstanding dues
- Full contact information (stored privately)
- Occupancy details (who is owner vs tenant)
- Complaint history
- Internal notes
- Audit information

---

## 5. Financial Privacy (Critical)

### 5.1 Bill Privacy
A resident may view **only ISSUED bills** for **their own unit** (authorization-enforced):
- DRAFT bills are never visible to residents (internal staging)
- Residents cannot see bills from other units
- Bill detail includes charges and amounts (necessary for disputes)
- Bill detail does NOT include admin notes or internal metadata

### 5.2 Payment Privacy
Payment data is highly sensitive:
- Stripe Session IDs, Payment Intent IDs are NEVER exposed to other residents
- Card details (full number, CVV) are NEVER stored by 27East
- OTP, PIN, online banking passwords are NEVER stored
- Payment method is shown safely (e.g., "Card ending in 1234")
- Bank transfer reference (UTR, cheque number) may be shown to relevant parties only
- Payer information is private (other residents don't know who paid what)

### 5.3 Receipt Privacy
- Receipt number (safe reference)
- Period, amount, date (transactional summary)
- Allocation to bills (which bills the payment covered)
- Payment method (safe descriptor, not card details)
- Does NOT expose: card number, CVV, OTP, session ID, Stripe references

### 5.4 Ledger / Statement (Own Unit Only)
- Resident may view their unit's ledger (bills + payments chronologically)
- Shows: date, description, debit/credit, running balance
- Does NOT show: admin adjustments before approval, internal codes, payment provider details

### 5.5 Outstanding Balance
- Resident sees their own unit's outstanding amount
- Residents do NOT see: other unit's balances, defaulter list, collection strategies
- Admin may see aggregated collection summary (separate admin dashboard)

---

## 6. Payment Provider Privacy (Stripe)

### 6.1 What 27East Stores About Stripe Payments
- Payment metadata (unit, bills covered, amount)
- Stripe Session ID (for reconciliation only)
- Payment status (SUCCEEDED, FAILED, REFUNDED)
- Timestamp and method (ONLINE, MANUAL, etc.)
- Amount and allocation to bills

### 6.2 What 27East NEVER Stores or Logs
- Stripe Secret Key (`sk_live_…` / `sk_test_…`)
- Stripe Webhook Secret
- Raw Stripe responses containing card details
- Card full number, CVV, expiration
- Full Stripe Payment Intent details

### 6.3 Stripe Webhook Security
- Signed with `STRIPE_WEBHOOK_SECRET` (env var, never logged)
- Endpoint is `POST /webhooks/stripe` only (no GET, no public access)
- Endpoint is mounted outside CSRF/session middleware (signature-based auth)
- Webhook payload is processed once (unique `eventId` idempotency)
- No sensitive data copied from Stripe webhook into application logs

### 6.4 Stripe Mode Visibility
- Admin-only notice shows TEST vs LIVE mode (via key prefix inspection)
- Key prefix is inspected only (`sk_test_` vs `sk_live_`), never logged or stored
- Mode indicator helps admin avoid live billing during testing

---

## 7. Unit-Shared Financial Access

Because multiple occupants may belong to one unit (owner, tenant, family), financial access must be explicit:

### 7.1 Current Implementation (Phase 3A-3)
- All registered members of a unit see the same financial information
- One bill per unit (not per person), regardless of occupants
- Future: distinguishment between PRIMARY_FINANCIAL_CONTACT, OWNER, TENANT, AUTHORIZED_OCCUPANT

### 7.2 Future Permission Matrix (Not Implemented Yet)
```
PRIMARY_FINANCIAL_CONTACT: Full unit bills, payments, ledger
OWNER:                     View bills, outstanding balance
TENANT:                    View bills, outstanding balance
AUTHORIZED_OCCUPANT:       View bills, outstanding balance (if approved)
```

---

## 8. Admin Access & Authorization

### 8.1 Admin vs Superadmin
| Action | Admin | Superadmin |
|--------|-------|-----------|
| View all residents | ✓ | ✓ |
| View all units | ✓ | ✓ |
| View resident contact | ✓ | ✓ |
| Create bills | ✓ | ✓ |
| **Issue bills** | ✗ | ✓ |
| View all financial reports | ✓ | ✓ |
| **Change billing configuration** | ✗ | ✓ |
| **Manage admin accounts** | ✗ | ✓ |

### 8.2 Admin Access Audit
When an admin accesses sensitive information, audit trail captures:
- WHO (individual admin, not a shared account)
- WHAT (action taken)
- WHEN (timestamp)
- CONTEXT (safe summary, not raw data)

Example:
```json
{
  "action": "BILLS_ISSUED",
  "actor": "admin@society.email",
  "timestamp": "2026-07-25T10:30:00Z",
  "context": { "billsIssued": 112, "totalBilledPaise": 242632000 }
}
```

NOT:
```json
{
  "action": "BILLS_ISSUED",
  "payloads": [...all 112 bills...],  // ✗ NO
  "residents": [...resident details...]  // ✗ NO
}
```

### 8.3 Admin Privilege is NOT Blanket
- Admin cannot access Stripe secret keys
- Admin cannot modify audit logs
- Admin cannot issue bills (superadmin only)
- Admin cannot promote other admins or change roles
- Admin cannot change their own permissions (prevents escalation)

---

## 9. Complaint / Helpdesk Privacy

### 9.1 Resident Complaints
- Residents see **only their own** complaints
- Residents do NOT see other residents' complaints
- Complaints are private (not in resident directory or lists)

### 9.2 Admin Access to Complaints
- Admin can view all complaints (for resolution)
- Admin access is audited (who accessed, when)
- Admin cannot modify complaint text (append notes instead)

### 9.3 Complaint Content
- Complaint text is kept as-is (immutable original)
- Admin notes appended separately (distinguishable)
- Resolution notes may be visible to resident (if appropriate)

---

## 10. Vendor & Contract Privacy

### 10.1 Vendor Data (Restricted)
- Vendor bank account details: ADMIN/SUPERADMIN ONLY
- GST/PAN numbers: ADMIN/SUPERADMIN ONLY
- Pricing negotiations: ADMIN/SUPERADMIN ONLY
- Vendor performance notes: ADMIN/SUPERADMIN ONLY
- Escalation contacts: ADMIN ONLY

### 10.2 Public Vendor Information (Future)
- Emergency lift service contact: may be RESIDENT-VISIBLE if intentional
- Keep public operational contacts separate from private Vendor Master

### 10.3 AMC / Contract Details
- Contract amounts: ADMIN/SUPERADMIN ONLY
- Payment terms: ADMIN/SUPERADMIN ONLY
- SLA details: ADMIN/SUPERADMIN ONLY
- Service history: ADMIN/SUPERADMIN ONLY

---

## 11. Document Repository Privacy (Future)

### 11.1 Document Classification
- `PRIVATE_ADMIN`: Vendor contracts, sensitive invoices, banking details
- `FINANCE_RESTRICTED`: Financial reports, analysis, vendor payments
- `COMPLIANCE_RESTRICTED`: Audit documents, regulatory correspondence
- `COMMITTEE_RESTRICTED`: Committee meeting minutes (if society has committees)
- `RESIDENT_VISIBLE`: Approved circulars, policies, building information
- `PUBLIC_COMMUNITY`: Emergency procedures, common area rules

### 11.2 Document Downloads
- Authorization checked at **download time**, not just listing
- Signed URLs with expiry (short-lived, one-time use)
- Or: server-streamed download with authorization verify
- Never: permanent public URLs to sensitive documents

### 11.3 Document Storage
- Database: metadata only (title, category, date, uploader)
- **Private object storage**: actual file (not Render ephemeral disk)
- Future: AWS S3, Cloudflare R2, Supabase Storage, or equivalent
- Never: public/guessable URLs to files

---

## 12. Logging Privacy

### 12.1 Application Logs (Safe)
Log these at appropriate level:
- Route accessed (path, no query params with sensitive data)
- Authentication success/failure (generics only)
- Permission denied / 403 (generics only)
- Error (with stack trace for debugging)

### 12.2 Application Logs (NEVER Log)
- Passwords or password hashes
- Activation tokens, password-reset tokens
- Session secrets or session IDs
- Full Stripe responses or payment objects
- Credit card numbers or CVV
- OTP or PIN codes
- MongoDB URI with credentials
- User.lastPayment or financial amounts (unless needed for debugging)
- Full request bodies or responses

### 12.3 Production Log Handling
- Logs stored with appropriate retention (90 days default)
- Logs are role-restricted (admin/superadmin only)
- Log viewer includes search, but query results are role-filtered
- No resident can access logs

---

## 13. Audit Log Privacy

### 13.1 What Audit Logs Record
```json
{
  "action": "BILLS_ISSUED",
  "actor": "admin@user.id",  // Individual actor, not shared account
  "actorRole": "superadmin",
  "entityType": "BillingPeriod",
  "entityId": "period-id",
  "context": {
    "billsIssued": 112,
    "totalBilledPaise": 242632000
  },
  "timestamp": "2026-07-25T10:30:00Z"
}
```

### 13.2 What Audit Logs NEVER Include
- Resident names or personal details (only IDs)
- Payment amounts (except aggregate summary)
- Full Bill/Payment documents
- Bank account numbers
- Vendor pricing negotiations
- Admin passwords or secrets

### 13.3 Audit Log Access
- Superadmin can view full audit log
- Admin can view audit log (informational only)
- Resident cannot access audit log
- Audit log itself is immutable (append-only)

---

## 14. API & Route Data Minimization

### 14.1 Response Serialization
Never return full document to browser:
```javascript
// ✗ WRONG: exposes internal fields
const bill = await Bill.findById(billId);
res.json(bill);  // includes createdBy, metadata, etc.

// ✓ CORRECT: select only necessary fields
const bill = await Bill.findById(billId).select('billNumber totalPaise lineItems status');
res.json(bill);
```

### 14.2 Resident Directory Example
```javascript
// ✗ WRONG: full User document
const users = await User.find({ society });
res.json(users);

// ✓ CORRECT: explicit field selection, privacy preferences applied
const users = await User.find({
  society,
  'directorySettings.showPhone': true  // only those who opted in
}).select('displayName flatNumber phone showPhoneInDirectory');
res.json(users);
```

---

## 15. Mass Assignment Protection

### 15.1 Whitelist Allowed Fields
Never directly assign `req.body` to model:
```javascript
// ✗ WRONG: allows role injection, bypass attempts
User.updateOne({ _id }, { ...req.body });

// ✓ CORRECT: explicit whitelist
User.updateOne({ _id }, {
  displayName: req.body.displayName,
  phone: req.body.phone,
  email: req.body.email
  // role, isAdmin, status not in list
});
```

### 15.2 Forbidden Fields (Never Accept from Client)
- `role` (use separate /admins route)
- `isAdmin` (derived from role)
- `unit` (use /units admin route to assign)
- `status` (reserved for admin)
- `createdBy`, `updatedBy` (server-generated)
- `billNumber`, `receiptNumber` (counters-generated)
- `issueDate`, `dueDate` on Bill after ISSUED (immutable)
- `paidPaise` (computed from allocations)
- `lastPayment` (legacy, overwritten by payment recorder)

---

## 16. Authentication Data Privacy

### 16.1 Password Storage
- Passwords hashed with strong algorithm (bcrypt minimum)
- Hash never logged
- Password reset tokens are one-time, short-lived (30 min default)
- Reset token hashes stored separately, not in User.password

### 16.2 Session Security
- Session ID is opaque, not guessable
- Session secret stored server-side only (not in cookie)
- Session cookie: `httpOnly`, `secure`, `sameSite=strict`
- Session ID never logged

### 16.3 Forgot Password
- "If an account with this email exists, password reset instructions have been sent."
- Same message for: account found, account not found, account deactivated
- Prevents account enumeration
- Does NOT reveal: "Email not registered", "Account inactive", etc.

### 16.4 Activation Tokens
- One-time use only
- Expires after 30 days (or earlier if used)
- Immutable history (who used which token when)
- Never sent in cleartext in logs

---

## 17. IDOR / BOLA Protection Test Matrix

**IDOR = Insecure Direct Object Reference**
**BOLA = Broken Object-Level Authorization**

Every sensitive endpoint must pass this test matrix:

### 17.1 Resident Access Tests
| Test | Expected Result |
|------|-----------------|
| Resident A: GET `/bill/<Resident-B-Bill-ID>` | 403 Forbidden |
| Resident A: GET `/receipt/<Resident-B-Receipt-ID>` | 403 Forbidden |
| Resident A: GET `/payment/<Resident-B-Payment-ID>` | 403 Forbidden |
| Resident A: GET `/profile/<Resident-B-User-ID>` | 403 Forbidden |
| Resident A: GET `/unit/<Other-Unit-ID>` | 403 Forbidden |
| Resident A: GET `/complaint/<Resident-B-Complaint-ID>` | 403 Forbidden |
| Resident A: GET `/finance/bills?status=DRAFT` | 403 Forbidden (resident cannot see admin view) |

### 17.2 Admin Access Tests
| Test | Expected Result |
|------|-----------------|
| Admin: GET `/finance/bills` | 200 (admin bills register) |
| Admin: POST `/finance/periods/<id>/issue` | 403 Forbidden (superadmin only) |
| Admin: GET `/finance/config/edit` | 403 Forbidden (superadmin only) |
| Admin: POST `/admins/promote` | 403 Forbidden (superadmin only) |

### 17.3 Direct URL Manipulation
```
Attacker tries: /bill/65a1bc2def3456789abc1234
Expected: 403 (not 200, not 404 with details)

Attacker tries: /receipt/guessed-id
Expected: 403 (not 200, not 404 with details)

Attacker tries: /profile/someone-else-id
Expected: 403 (not 200, not 404 with details)
```

---

## 18. URL Design for Authorization

### 18.1 Safe URL Patterns
```
/bill                      ← resident sees their own bills (unit from session)
/bill/:id                  ← resident sees specific bill IF it's their unit (checked)
/finance/bills             ← admin sees all bills register
/finance/periods/:id/bills ← admin sees bills for specific period
```

### 18.2 Unsafe URL Patterns (AVOID)
```
/resident/:id/bills        ← tempts admins to check others, bad practice
/unit/:id/financial-summary ← residents could guess unit IDs
/user/:id/payment-history  ← residents could guess user IDs
```

### 18.3 Safe Handling of IDs
```javascript
// ✗ WRONG: trusts req.params.billId from URL
const bill = await Bill.findById(req.params.billId);
res.json(bill);

// ✓ CORRECT: validate ownership
const bill = await Bill.findById(req.params.billId);
if (!bill || String(bill.unit) !== String(req.user.unit)) {
  return res.status(403).send('Not authorized');
}
res.json(bill);
```

---

## 19. Data Retention & Deletion Architecture

### 19.1 Financial Records (Immutable)
- Bills: never deleted (VOID if needed, keeping number forever)
- Payments: never deleted (new REFUND record instead)
- Receipts: never deleted (audit requirement)
- Adjustments: never deleted (CORRECTION appended instead)

### 19.2 Resident Account Deactivation (Future)
- User.status = 'deactivated'
- User can no longer log in
- Resident's data remains for audit (bills, payments, history)
- Option: anonymize certain fields after retention period

### 19.3 Data Deletion Requests (Legal Requirement)
- **Personal privacy requests:** handled per policy
- **Retained data:** financial records (audit law requires 7 years)
- **Anonymization:** convert names to "Resident #123" where possible
- **Non-financial:** can delete messages, complaints (if policy allows)

### 19.4 Temporary Data (Automatic Cleanup)
- Preview calculations: discarded at end of request
- Session temporary state: cleared on logout
- Forgotten password token: auto-expires after 30 days

---

## 20. India Privacy Readiness

27East is designed to support India's data protection obligations:

### 20.1 Principles Supported
- **Purpose Limitation:** Data used only for stated purpose (billing, admin)
- **Data Minimization:** Only necessary fields collected
- **Access Control:** Role-based, server-enforced
- **Security Safeguards:** Encryption, auditing, IDOR protection
- **Retention Controls:** Defined retention periods, immutable financial records
- **User Transparency:** Privacy policy, preference settings (future)
- **Correction/Update:** Residents can update their profile (future)
- **Incident Response:** Audit log enables breach investigation

### 20.2 Compliance Notes
- Not a compliance claim, but technical readiness
- Legal/policy compliance requires separate organizational review
- This document supports due diligence and audit

---

## 21. Privacy Preferences (Future Implementation)

### 21.1 Resident-Controlled Settings
**Profile visibility:**
- Show phone in Resident Directory (yes/no)
- Show email in Resident Directory (yes/no)
- Preferred contact method (phone/email/WhatsApp)

**Financial notifications:**
- Email bill reminder (yes/no)
- SMS payment reminder (yes/no)

**Communication:**
- Opt-in to community announcements

### 21.2 Implementation Pattern
```javascript
// Settings stored in User schema, not global
User: {
  privacySettings: {
    showPhoneInDirectory: false,
    showEmailInDirectory: false,
    preferredContactMethod: 'email',
    emailNotifications: true
  }
}

// Used in queries
const users = await User.find({
  'privacySettings.showPhoneInDirectory': true
}).select('displayName phone flatNumber');
```

---

## 22. Privacy Test & Verification Checklist

Before releasing any feature:

### 22.1 Authorization Tests
- [ ] Resident A cannot view Resident B's profile
- [ ] Resident A cannot view Resident B's bills
- [ ] Resident A cannot view Resident B's payments/receipts
- [ ] Resident A cannot view other unit's data
- [ ] Resident cannot access `/finance/…` admin routes
- [ ] Admin cannot perform superadmin actions
- [ ] Inactive/deactivated users cannot access data

### 22.2 Data Exposure Tests
- [ ] Bill view does not include admin-only fields
- [ ] Receipt does not include Stripe session ID
- [ ] Directory does not include private phone/email (unless opted-in)
- [ ] Payment method shown as safe descriptor (not card number)
- [ ] Logs do not contain passwords, tokens, or secrets

### 22.3 IDOR/BOLA Tests
- [ ] Direct URL with someone else's ID returns 403 (not 200 or 404)
- [ ] Guessed ObjectIds don't leak information
- [ ] Query manipulation doesn't bypass authorization
- [ ] Form hijacking (changing hidden fields) fails server-side

### 22.4 Export/Search Tests
- [ ] Exports obey authorization (resident export only shows their data)
- [ ] Search results are role-filtered
- [ ] CSV export does not include unauthorized rows

---

## 23. Privacy Review Before Each Module

**For every new module (Payments, Expenses, Vendor, etc.):**

| Question | Answer |
|----------|--------|
| WHO CAN CREATE? | Superadmin / Admin / Resident / System |
| WHO CAN VIEW? | Which roles? Own data only? |
| WHO CAN EDIT? | Which roles? After creation immutable? |
| WHO CAN DELETE/VOID? | Superadmin only? Audit-only deletion? |
| WHICH FIELDS EACH ROLE SEES? | List explicitly |
| WHAT IS EXPORTED/REPORTED? | Role-filtered? Safe identifiers only? |

---

## 24. Critical Privacy Principle

```
┌─────────────────────────────────────────────────────────────────┐
│                      DEFAULT: PRIVATE                           │
├─────────────────────────────────────────────────────────────────┤
│  A RESIDENT CANNOT KNOW PRIVATE INFORMATION ABOUT ANOTHER       │
│  RESIDENT, UNLESS EXPLICITLY APPROVED (RESIDENT DIRECTORY).     │
│                                                                   │
│  Being a member of 27East does NOT grant blanket access to:    │
│  • Another's personal profile                                   │
│  • Another's household information                              │
│  • Another's financial position (bills, dues, payments)         │
│  • Another's complaints or tickets                              │
│  • Another's payment methods or transactions                    │
│  • Another's documents or private information                   │
│                                                                   │
│  PRIVACY IS ENFORCED AT THE DATABASE-QUERY AND                 │
│  SERVER-AUTHORIZATION BOUNDARY, NOT BY HIDING UI BUTTONS.      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 25. Audit Trail

This document was created during Phase 3A-3 (Bill Generation) to establish privacy and security architecture from the outset, per the principle of Privacy by Design.

**Reviewed by:** System Architecture  
**Approved by:** Pending  
**Last updated:** 2026-07-25
