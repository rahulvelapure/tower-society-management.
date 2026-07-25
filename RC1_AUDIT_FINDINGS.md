# RC1 Audit Findings Report

**Status:** IN PROGRESS  
**Date:** 2026-07-25  
**Auditor:** Security & QA Review  

---

## Summary

Comprehensive audit of 27East application across 11 route files, 4 models, 45 views, and 9 libraries. This report documents findings by severity and category.

---

## Critical Issues (Must Fix)

### Issue #1: Missing ObjectId Validation in /members Routes
**Severity:** HIGH (Potential IDOR, but mitigated by Authorization)  
**File:** routes/members.js:217, 239  
**Location:** `GET /members/:id/edit`, `POST /members/:id`  
**Problem:**
```javascript
// Line 217 - no isValidObjectId check
const member = await user_collection.User.findById(req.params.id);

// Correct pattern (found in admins.js:51):
if (!mongoose.isValidObjectId(req.params.id)) return res.redirect("/admins");
const target = await user_collection.User.findById(req.params.id);
```

**Impact:** 
- Invalid ObjectId doesn't cause crash, but 400-level response better practice
- Admin already protected by ensureAdmin guard, but validation should be consistent

**Fix:** Add isValidObjectId validation before all findById calls in /members/:id routes

**Status:** Not yet fixed

---

### Issue #2: Resident Bill Access - Verify IDOR Protection
**Severity:** HIGH (Privacy Concern)  
**File:** routes/finance.js:633 (residentBillDetail)  
**Code:**
```javascript
const bill = await Bill
    .findById(req.params.id)
    .populate('unit')
    .populate('period');

if (!bill) return res.status(404).send('Bill not found');

// CRITICAL: Enforce authorization
if (String(bill.unit._id) !== String(req.user.unit)) {
    return res.status(403).send('You do not have access to this bill');
}
if (bill.status === 'DRAFT') {
    return res.status(403).send('This bill is not yet issued');
}
```

**Status:** ✓ PROTECTED (Verified in code)

---

### Issue #3: Authorization Bypass Check - Admin Issuing Bills
**Severity:** HIGH (Financial Risk)  
**File:** routes/finance.js:500 (`POST /finance/periods/:id/issue`)  
**Protection:**
```javascript
router.post('/finance/periods/:id/issue', ensureSuperAdmin, async (req, res) => {
    // Route guard: ensureSuperAdmin prevents admin access
```

**Status:** ✓ PROTECTED (ensureSuperAdmin guard in place)

---

### Issue #4: Resident Access to Admin Routes
**Severity:** MEDIUM (Authorization)  
**File:** routes/finance.js (multiple routes)  
**Check:** Can resident access `/finance/bills`, `/finance/periods`?  

**Test Results:**
- `GET /finance/config` — ensureAdmin ✓
- `GET /finance/periods` — ensureAdmin ✓
- `GET /finance/bills` — ensureAdmin ✓
- `POST /finance/config` — ensureSuperAdmin ✓
- POST routes for charges — ensureSuperAdmin ✓

**Status:** ✓ PROTECTED (all admin routes guarded)

---

## High-Priority Issues (Fix Before UAT)

### Issue #5: Stripe Secret Exposure Risk
**Severity:** MEDIUM  
**File:** server.js:17-29  
**Current Code:**
```javascript
switch (stripeMode()) {
  case 'live':
    console.warn('[Stripe] LIVE mode detected...');
    break;
  case 'test':
    console.log('[Stripe] TEST mode...');
    break;
}
```

**Status:** ✓ GOOD (Code inspects key PREFIX only, never logs secret)  
**Verification:** `lib/stripeMode.js` extracts only `sk_test_` or `sk_live_` prefix

---

### Issue #6: Session Security
**Severity:** MEDIUM  
**File:** server.js:58-63  
**Current:**
```javascript
cookie: {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: 24 * 60 * 60 * 1000,
}
```

**Status:** ✓ ACCEPTABLE
- httpOnly: true ✓ (prevents JavaScript access)
- secure: conditional on NODE_ENV ✓ (HTTPS in prod)
- sameSite: lax ✓ (CSRF protection, balanced for usability)
- maxAge: 24 hours ✓ (reasonable timeout)

**Improvement:** Consider `sameSite: strict` for maximum CSRF protection

---

### Issue #7: Password Reset Email Reveals User Existence (Low)
**Severity:** LOW  
**File:** routes/auth.js:75-96 (`POST /forgot-password`)  
**Current:**
```javascript
const confirmation = "If an account exists for that information, password reset instructions have been sent.";
if (foundUser) {
    // send email...
}
res.render("forgotPassword", { message: confirmation });
```

**Status:** ✓ GOOD (Generic message prevents user enumeration)

---

## Medium-Priority Issues (Fix Before Production)

### Issue #8: Missing Resident Bill DRAFT Check in List View
**Severity:** LOW  
**File:** routes/finance.js:632 (`GET /bill`)  
**Current:**
```javascript
const bills = await Bill
    .find({ unit: req.user.unit, status: { $in: ['ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'] } })
```

**Status:** ✓ GOOD (Explicitly excludes DRAFT status)

---

### Issue #9: Audit Logging Completeness
**Severity:** MEDIUM  
**File:** routes/finance.js (bill generation/issuance)  
**Finding:**
- `BILLS_DRAFT_GENERATED` logged ✓
- `BILLS_ISSUED` logged ✓
- Preview viewing NOT logged (acceptable - read-only)

**Status:** ✓ ACCEPTABLE (critical actions logged)

---

## Low-Priority Issues (Nice to Have)

### Issue #10: ObjectId Validation Consistency
**Severity:** LOW  
**Finding:** Some routes validate ObjectId (admins.js, finance.js), others don't (members.js)

**Fix:** Add validation to members.js for consistency

---

### Issue #11: Error Message Standardization
**Severity:** LOW  
**Finding:** Different error message formats across routes

**Current:**
- "Not found" (finance.js)
- "Server error" (all routes)
- Generic validation messages (members.js)

**Improvement:** Standardize error messages

---

## Database & Schema Issues

### Issue #12: Unique Indexes Verification
**Severity:** HIGH (Data Integrity)  

**Verified Indexes:**
- User.username: unique ✓
- Unit {society, floor, flatNumber}: unique ✓
- BillingPeriod {society, periodStart}: unique ✓
- Bill {unit, period}: unique ✓
- Bill.billNumber: unique sparse ✓
- Payment {provider, providerRef}: unique ✓
- Receipt.receiptNumber: unique ✓
- Receipt.payment: unique ✓
- StripeEvent.eventId: unique ✓

**Status:** ✓ ALL CRITICAL INDEXES IN PLACE

---

### Issue #13: Required Fields Enforcement
**Severity:** HIGH (Data Quality)  

**Verified:**
- User.username: required ✓
- User.firstName/lastName: required ✓
- Bill.totalPaise: required ✓
- Payment.amountPaise: required ✓
- Adjustment.amountPaise: required ✓
- Adjustment.reason: required ✓

**Status:** ✓ GOOD

---

## Privacy & Authorization Matrix

### Issue #14: Privacy Boundary Verification

**Tested:**
- [ ] Resident A cannot view Resident B's bills (Code: PROTECTED)
- [ ] Resident A cannot view Resident B's payments (Code: N/A in Phase 3A-3)
- [ ] Resident A cannot view Resident B's profile (Need to verify)
- [ ] Resident A cannot access `/finance` admin routes (Code: PROTECTED)

**Status:** PARTIALLY VERIFIED (need runtime testing)

---

## Performance Issues

### Issue #15: Potential N+1 Queries
**Severity:** MEDIUM

**Audit:**
- Resident bill list: uses .populate('period') ✓ (1 query + period lookup)
- Bill review: uses .populate('unit') ✓ (good with index)
- Finance dashboard: N/A (Phase 3A-3 no dashboard)

**Status:** ✓ NO N+1 DETECTED

---

## Missing Validations

### Issue #16: Phone Number Format
**Severity:** LOW  
**File:** routes/members.js, routes/contacts.js  
**Status:** VALIDATED (isValidPhone function used)

---

### Issue #17: Email Format
**Severity:** LOW  
**File:** routes/contacts.js  
**Status:** BASIC (uses simple regex, acceptable)

---

## Dead Code & Cleanup

### Issue #18: Old Routes
**Severity:** LOW  

**Found:**
- `/register` → redirects to login ✓ (disabled self-signup)
- `/signup` → redirects to login ✓ (disabled self-signup)
- `/newRequest` → redirects to home ✓ (disabled)
- All return 403 or redirect (no execution)

**Status:** ✓ SAFE (disabled, not deleted - good for clarity)

---

### Issue #19: Unused Imports
**Severity:** LOW  
**Note:** Not audited (low priority)

---

## Configuration Review

### Issue #20: Environment Variables Checklist
**Severity:** MEDIUM

**Required:**
- SESSION_SECRET: Required ✓
- MONGO_URI: Required ✓
- NODE_ENV: Set in Render ✓
- PORT: Default 3000 ✓
- STRIPE_SECRET_KEY: Optional (handled gracefully) ✓
- STRIPE_WEBHOOK_SECRET: Optional ✓
- APP_BASE_URL: Set via request host (dynamic) ✓

**Status:** ✓ GOOD (sensible defaults)

---

### Issue #21: Email Configuration
**Severity:** MEDIUM  
**File:** config/mailer.js (not audited yet)  
**Note:** Password reset emails working (test in Phase 1)

---

## Logging Review

### Issue #22: Sensitive Data Logging
**Severity:** HIGH  

**Verified Not Logged:**
- Passwords ✓
- Session secrets ✓
- Stripe secrets ✓
- Mongo URI ✓
- User passwords ✓

**Safe to Log:**
- Application events ✓
- Route access (no query params) ✓
- Errors (no stack in production) ✓
- Stripe mode (prefix only) ✓

**Status:** ✓ GOOD

---

## Testing & Documentation Status

### Issue #23: Test Coverage
**Severity:** MEDIUM  

**Existing:**
- scripts/selftest.js: Legacy billing formula ✓
- Manual testing: NOT YET DONE

**Needed:**
- TEST_PLAN.md: Not created
- UAT_CHECKLIST.md: Not created
- RELEASE_CHECKLIST.md: Not created

---

## Summary by Severity

| Severity | Count | Critical | Status |
|----------|-------|----------|--------|
| CRITICAL | 1 | Missing ObjectId validation in /members | NEEDS FIX |
| HIGH | 3 | Resident bill IDOR, Admin bypass, Privacy boundaries | NEEDS TESTING |
| MEDIUM | 5 | Email enum, Session security, Audit logging, Validation consistency, Env vars | ACCEPTABLE |
| LOW | 6 | Code cleanup, Dead code, Consistency | NICE-TO-HAVE |

---

## Fixes Required for RC1

### Critical (Must Fix)
1. Add isValidObjectId validation to /members/:id routes
2. Test resident bill IDOR protection at runtime
3. Verify resident cannot access admin finance routes

### High (Before UAT)
4. Create comprehensive test plans
5. Runtime testing of all workflows
6. Document security findings

### Medium (Before Production)
7. Standardize error messages
8. Improve ObjectId validation consistency
9. Document configuration requirements

### Low (Nice to Have)
10. Remove console.log statements
11. Clean up commented code
12. Standardize code style

---

## Next Steps

1. **Fix Critical Issues** (30 mins)
2. **Create Documentation** (1 hour)
3. **Runtime Testing** (2-3 hours)
4. **Fix Medium Issues** (1 hour)
5. **Final Verification** (1 hour)

---

**Document Version:** 1.0  
**Status:** AUDIT IN PROGRESS  
**Last Updated:** 2026-07-25
