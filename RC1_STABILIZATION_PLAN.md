# RC1 Stabilization & Production Readiness Plan

**Status:** STARTING  
**Objective:** Convert 27East into a Release Candidate (RC1) suitable for internal daily use and UAT  
**Scope:** Bug fixes only; NO new features  
**Target Date:** Before UAT deployment  

---

## Application Inventory

### Routes (11 files)
```
routes/auth.js                  Authentication & session management
routes/resident.js              Resident dashboard & home
routes/members.js               Member management (admin)
routes/admins.js                Admin management & roles (superadmin)
routes/notice.js                Noticeboard management
routes/bill.js                  Resident billing (legacy due calculation)
routes/finance.js               Billing config, periods, bills, revenue
routes/helpdesk.js              Complaints & helpdesk tickets
routes/contacts.js              Emergency contacts & directory
routes/units.js                 Unit/flat management (admin)
routes/stripeWebhook.js         Stripe webhook (payment processing)
```

### Models (4 files)
```
models/userModel.js             User (resident, admin, superadmin)
models/unitModel.js             Unit/flat (residential, 112 flats)
models/societyModel.js          Society (configuration)
models/financeModels.js         Financial entities (Bill, Payment, Receipt, etc.)
```

### Views (45 EJS templates)
```
Authentication          login, activate, resetPassword, forgotPassword
Resident Dashboard      residentHome, homeStandby, dashboard
Residents & Units       residents, units, unitForm, unitInitialize, memberForm
Admin Management        members, memberCreated, admins, contacts, editContacts
Billing (Legacy)        bill, editBill, success, failure
Finance (Phase 3A)      financeConfig, financeConfigForm, chargeComponentForm
Billing Periods         billingPeriods, billingPeriodForm, billingPeriodDetail
Billing Workflow        billingPeriodPreview, billsReview, billsRegister
Resident Bills          residentBills, residentBillDetail
Noticeboard             noticeboard, notice
Helpdesk                helpdesk, helpdeskAdmin, complaint
Profile                 profile, editProfile
```

### Libraries (9 files)
```
lib/billing.js          Legacy billing formula (still authoritative)
lib/roles.js            Role resolution (superadmin, admin, member)
lib/money.js            Paise conversion & formatting
lib/counters.js         Atomic document numbering
lib/audit.js            Audit logging
lib/payments.js         Payment recording & legacy integration
lib/stripeMode.js       Stripe test/live mode detection
lib/financeConfig.js    Billing config & preview calculation
lib/billGeneration.js   Bill generation workflow (3A-3)
```

### Middleware (2 files)
```
middleware/auth.js      Authentication & authorization (ensureAdmin, ensureSuperAdmin)
middleware/csrf.js      CSRF token attachment & verification
```

### Scripts (3 files)
```
scripts/migrateRoles.js  Role migration (3A-1)
scripts/migrateUnits.js  Unit flat master initialization
scripts/selftest.js     Automated tests (money, billing formula, FY)
```

---

## Stabilization Checklist

### Phase 1: Application Audit

#### 1.1 Route Audit
- [ ] List all routes with HTTP methods
- [ ] Verify authentication guards (login required)
- [ ] Verify authorization guards (ensureAdmin, ensureSuperAdmin)
- [ ] Check for IDOR vulnerabilities (unit/bill ID checks)
- [ ] Check for mass assignment (req.body direct assignment)
- [ ] Check for input validation (phone, email, amounts)
- [ ] Check for error handling (no stack traces)
- [ ] Check for 404/403/500 handling
- [ ] Remove dead routes
- [ ] Document all public routes

#### 1.2 Model Audit
- [ ] Verify unique indexes
- [ ] Verify required fields
- [ ] Verify enum constraints
- [ ] Check for orphaned references
- [ ] Review field naming consistency
- [ ] Check for default values
- [ ] Verify paise storage (integer, not float)
- [ ] Review schema validation

#### 1.3 View Audit
- [ ] Check all links (no broken hrefs)
- [ ] Check all forms (no broken actions)
- [ ] Check navigation breadcrumbs
- [ ] Check error message displays
- [ ] Check empty state handling
- [ ] Check responsive layout
- [ ] Check button action targets
- [ ] Review all conditionals (logged-in, admin, superadmin)

#### 1.4 Code Quality
- [ ] Remove console.log statements (except errors)
- [ ] Remove commented-out code
- [ ] Remove unused imports
- [ ] Remove dead functions
- [ ] Check for duplicate code
- [ ] Review for TODOs (are they actionable?)
- [ ] Check naming conventions
- [ ] Review for typos in strings

### Phase 2: Security Review

#### 2.1 IDOR/BOLA
- [ ] Resident cannot access `/bill/:id` for other units
- [ ] Resident cannot access `/receipt/:id` for other units
- [ ] Resident cannot access `/payment/:id` for other units
- [ ] Resident cannot access `/profile/:id` for other residents
- [ ] Resident cannot access `/unit/:id` for other units
- [ ] Resident cannot access `/complaint/:id` for other residents
- [ ] Admin cannot bypass superadmin routes
- [ ] Admin cannot promote themselves to superadmin

#### 2.2 CSRF Protection
- [ ] All POST/PUT/DELETE forms have _csrf token
- [ ] Webhook route explicitly exempted (signature-based auth)
- [ ] Session cookie has sameSite=lax
- [ ] No CSRF token leakage in logs

#### 2.3 XSS Prevention
- [ ] No HTML injection in user-generated content
- [ ] No script injection in noticeboard/complaints
- [ ] No SQL-like injection in search
- [ ] EJS templates use proper escaping (<%=, not <%-=)

#### 2.4 Input Validation
- [ ] Phone number format validated
- [ ] Email format validated
- [ ] Amounts as integers (paise), not floats
- [ ] Dates valid (no Feb 30)
- [ ] Enum values restricted (status, role, method)
- [ ] File uploads (if any) validated
- [ ] String lengths validated

#### 2.5 Authentication
- [ ] Login works (passport-local)
- [ ] Session creation works
- [ ] Session destruction on logout works
- [ ] Password reset token expires
- [ ] Activation token used once only
- [ ] Session cookie has httpOnly + secure (prod)
- [ ] No hardcoded credentials in code

#### 2.6 Sensitive Data Handling
- [ ] Passwords never logged
- [ ] Session secrets never logged
- [ ] Stripe secret never logged
- [ ] Mongo URI never logged
- [ ] Personal ID numbers not exposed
- [ ] Payment method stored safely (no full card)
- [ ] No personal data in error messages

### Phase 3: Privacy Review

#### 3.1 Resident Data Isolation
- [ ] Resident A cannot view Resident B's profile
- [ ] Resident A cannot view Resident B's bills
- [ ] Resident A cannot view Resident B's payments
- [ ] Resident A cannot view Resident B's complaints
- [ ] Resident A cannot guess another resident's ID
- [ ] Resident A cannot access admin pages

#### 3.2 Financial Privacy
- [ ] Outstanding dues shown only to own unit
- [ ] Bill details shown only to own unit
- [ ] Payment history shown only to own unit
- [ ] No resident-facing vendor data
- [ ] No resident-facing financial reports
- [ ] Stripe references hidden from residents

#### 3.3 Admin/Superadmin Boundaries
- [ ] Admin cannot issue bills (superadmin only)
- [ ] Admin cannot change billing config (superadmin only)
- [ ] Admin cannot promote admins (superadmin only)
- [ ] Admin cannot access audit logs (superadmin only)
- [ ] Audit log shows individual actor (not shared account)

#### 3.4 Directory Privacy
- [ ] Directory only shows approved contact fields
- [ ] Directory respects privacy preferences (when implemented)
- [ ] Directory never shows payment/financial data
- [ ] Directory never shows internal notes

### Phase 4: Billing & Finance Review

#### 4.1 Billing Period
- [ ] Cannot create overlapping periods
- [ ] Period dates compute correctly (including Feb)
- [ ] DRAFT period can be edited
- [ ] Non-DRAFT period cannot be edited
- [ ] DRAFT period can be deleted
- [ ] Period with bills cannot be deleted

#### 4.2 Bill Preview
- [ ] Preview shows 112 units
- [ ] Preview calculates correct totals
- [ ] Preview never persists
- [ ] Preview never consumes bill numbers
- [ ] FIXED_PER_UNIT charges calculated correctly
- [ ] PER_SQFT excluded from preview
- [ ] UNIT_SPECIFIC excluded from preview
- [ ] MANUAL excluded from preview

#### 4.3 Bill Generation
- [ ] Generates bills for all 112 units
- [ ] Bills created in DRAFT status
- [ ] One bill per unit per period (unique index)
- [ ] Idempotent: second generate returns same bills
- [ ] Line items immutable once created
- [ ] Totals calculated correctly
- [ ] No bill numbers assigned yet (assigned at issue)
- [ ] Audit log records generation

#### 4.4 Bill Review
- [ ] Admin can view draft bills
- [ ] Summary shows count and total
- [ ] Individual bill details correct
- [ ] Clearly marked as DRAFT (not visible to residents)
- [ ] Issue button visible only to superadmin

#### 4.5 Bill Issuance
- [ ] Superadmin can issue bills
- [ ] Admin cannot issue bills (403)
- [ ] Confirmation dialog shows total
- [ ] Bill numbers assigned sequentially
- [ ] Bill numbers unique (no duplicates)
- [ ] Bills transition DRAFT → ISSUED
- [ ] Audit log records issuance
- [ ] Residents can immediately see ISSUED bills

#### 4.6 Resident Bill View
- [ ] Resident sees own unit's ISSUED bills
- [ ] Resident does NOT see DRAFT bills
- [ ] Resident does NOT see other units' bills
- [ ] Bill detail shows correct charges
- [ ] Bill detail shows correct totals
- [ ] Status badge shows correct status
- [ ] Pay button visible if outstanding

#### 4.7 Bill Register (Admin)
- [ ] Shows all bills for society
- [ ] Can filter by status
- [ ] Can filter by period
- [ ] Summary by status correct
- [ ] No sensitive resident data exposed

#### 4.8 Legacy Billing (Unchanged)
- [ ] User.lastPayment still drives due calculation
- [ ] Bill page still uses User.makePayment
- [ ] Checkout still validates amount vs makePayment
- [ ] Success still updates User.lastPayment
- [ ] No hybrid old/new system confusion

### Phase 5: Payment Review

#### 5.1 Stripe Integration
- [ ] Test mode detection works
- [ ] Live mode detection works
- [ ] Unconfigured mode handled (payments disabled)
- [ ] Checkout button works (test mode)
- [ ] Payment succeeds (test Stripe card)
- [ ] Webhook route is POST-only (GET returns 404)
- [ ] Webhook signature verified
- [ ] Webhook idempotent (duplicate events no-op)
- [ ] Payment recorded atomically
- [ ] lastPayment updated
- [ ] Success page shows confirmation
- [ ] No Stripe secret exposed

#### 5.2 Legacy Payment Flow
- [ ] `/bill` renders correctly
- [ ] `makePayment` persists on page load
- [ ] `/checkout-session` creates session
- [ ] Redirect to Stripe works
- [ ] Callback `/success` works
- [ ] Unpaid session → pending message
- [ ] Failed session → error message
- [ ] Cancelled session → cancellation message

### Phase 6: Database Review

#### 6.1 Indexes
- [ ] User indexes present (username unique)
- [ ] Unit indexes present (society, floor, flatNumber unique)
- [ ] BillingPeriod indexes present (society, periodStart unique)
- [ ] Bill indexes present (unit/period unique, billNumber unique sparse)
- [ ] Payment indexes present (provider/providerRef unique)
- [ ] Receipt indexes present (receiptNumber unique, payment unique)
- [ ] StripeEvent indexes present (eventId unique)
- [ ] AuditLog indexes present (action, createdAt)
- [ ] No missing indexes causing N+1 queries

#### 6.2 Constraints
- [ ] Unique constraints enforced (no duplicates)
- [ ] Required fields enforced (no nulls where forbidden)
- [ ] Enum values constrained (status, role, method)
- [ ] Foreign key references valid (no broken links)

#### 6.3 Data Quality
- [ ] No orphaned records (payments without users)
- [ ] No orphaned bills (bills without periods)
- [ ] No duplicate bill numbers
- [ ] No negative amounts
- [ ] No corrupted status values

### Phase 7: Performance Review

#### 7.1 Query Performance
- [ ] Dashboard loads < 2 seconds
- [ ] Resident list loads < 2 seconds
- [ ] Bills list loads < 2 seconds
- [ ] Bill preview renders < 5 seconds
- [ ] Bill review renders < 2 seconds
- [ ] Login loads < 1 second
- [ ] Profile loads < 1 second
- [ ] No N+1 queries detected
- [ ] No missing indexes identified

#### 7.2 Scaling Concerns
- [ ] 112 flats: no performance issues
- [ ] 500+ residents: test if possible
- [ ] 1000+ bills: test if possible
- [ ] Large datasets: responsive UI

### Phase 8: UI/UX Review

#### 8.1 Navigation
- [ ] Links work (no 404s)
- [ ] Back buttons work
- [ ] Breadcrumbs accurate
- [ ] Menu highlights correct page
- [ ] Redirects after action work

#### 8.2 Forms
- [ ] Submit buttons work
- [ ] Cancel buttons work
- [ ] Validation messages clear
- [ ] Error messages informative
- [ ] Success messages clear
- [ ] Form fields labeled
- [ ] Required fields marked
- [ ] Responsive on mobile

#### 8.3 Responsive Design
- [ ] Desktop: full layout
- [ ] Tablet: adjusted layout
- [ ] Mobile: readable & usable
- [ ] No horizontal scroll (except tables)
- [ ] Buttons clickable on mobile

#### 8.4 Error Handling
- [ ] No stack traces shown to users
- [ ] No sensitive data in error pages
- [ ] 404 page friendly
- [ ] 403 page friendly
- [ ] 500 page friendly
- [ ] Timeout handling
- [ ] Empty state handled

### Phase 9: Logging Review

#### 9.1 What NOT to Log
- [ ] No passwords logged
- [ ] No password reset tokens logged
- [ ] No Stripe secrets logged
- [ ] No session cookies logged
- [ ] No Mongo URI logged
- [ ] No full payment payloads logged
- [ ] No credit card numbers logged
- [ ] No OTP/PIN logged

#### 9.2 What Should Be Logged
- [ ] Application start/stop
- [ ] Request errors (generic)
- [ ] Database errors (no secrets)
- [ ] Authentication failures (generic)
- [ ] Authorization failures (generic)
- [ ] Stripe mode on boot
- [ ] Unhandled exceptions

### Phase 10: Configuration Review

#### 10.1 Environment Variables
- [ ] SESSION_SECRET set
- [ ] MONGO_URI configured
- [ ] STRIPE_SECRET_KEY (or unconfigured gracefully)
- [ ] STRIPE_WEBHOOK_SECRET (optional)
- [ ] NODE_ENV set (development, production)
- [ ] PORT set
- [ ] APP_BASE_URL set
- [ ] Email config (if applicable)

#### 10.2 Render Configuration
- [ ] Environment variables in Render settings
- [ ] No secrets in code
- [ ] Auto-deploy on branch push works
- [ ] Render health check responds
- [ ] Logs accessible
- [ ] Rollback possible

#### 10.3 MongoDB/Atlas
- [ ] Connection string valid
- [ ] Database access enabled
- [ ] Backup enabled
- [ ] Monitoring enabled
- [ ] Connection pooling configured
- [ ] IP whitelist includes Render

---

## Documentation to Create

### 1. RELEASE_CHECKLIST.md
Step-by-step deployment checklist for going live.

### 2. TEST_PLAN.md
Manual test cases for every feature.

### 3. UAT_CHECKLIST.md
Society admin's checklist for user acceptance testing.

### 4. KNOWN_LIMITATIONS.md
Honest list of what's not implemented, what's temporary, roadmap.

### 5. SECURITY_AUDIT_REPORT.md
Detailed security findings and fixes.

### 6. RC1_RELEASE_REPORT.md
Final health scores, issue summary, readiness assessment.

---

## Bug Fix Priority

### Critical (Fix Immediately)
- Security vulnerabilities (IDOR, XSS, injection)
- Authorization bypasses
- Data corruption
- Payment processing failures
- Stripe regression

### High (Fix Before UAT)
- Broken workflows
- Missing validation
- Incorrect calculations
- Database integrity issues
- Performance < 5 sec

### Medium (Fix Before Production)
- UI/UX bugs
- Validation message clarity
- Error handling improvements
- Minor performance (5-10 sec)

### Low (Nice to Have)
- UI polish
- Extra validation
- Optimizations
- Documentation

---

## Success Criteria

When RC1 is complete, 27East should be:

✅ **Secure** — No IDOR, CSRF, XSS, injection vulnerabilities  
✅ **Private** — Residents cannot see other residents' data  
✅ **Validated** — All inputs validated, no stack traces  
✅ **Auditable** — All sensitive actions logged  
✅ **Stable** — All workflows function end-to-end  
✅ **Performant** — All pages load < 5 seconds  
✅ **Documented** — Setup, deployment, testing checklists  
✅ **Tested** — Manual test cases verified  
✅ **Ready for UAT** — Society admin can test independently  

---

## Timeline

| Phase | Estimate | Gate |
|-------|----------|------|
| Application Audit | 2-4 hrs | Inventory complete |
| Security Review | 3-4 hrs | No critical vulns |
| Privacy Review | 2-3 hrs | IDOR/BOLA tested |
| Billing Review | 2-3 hrs | All workflows verified |
| Database Review | 1-2 hrs | Indexes & constraints OK |
| Bug Fixes | 2-4 hrs | All critical fixed |
| Documentation | 2-3 hrs | Checklists complete |
| Final Testing | 2-3 hrs | Test plan passed |
| **Total** | **16-26 hrs** | **RC1 ready for UAT** |

---

## Stop Condition

**DO NOT** proceed with Phase 3A-4 (Ledger) until RC1 is approved.

**DO NOT** implement Expenses, Vendors, AMC, or Documents.

Stop and wait for authorization to proceed.

---

**Document Version:** 1.0  
**Status:** PLAN DOCUMENT (Ready to execute)  
**Next Step:** Begin Phase 1 (Application Audit)
