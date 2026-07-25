# RC1 Test Plan - Manual Test Cases

**Version:** 1.0  
**Scope:** All features implemented through Phase 3A-3  
**Tester Role:** QA Engineer / Release Manager  
**Duration:** 2-3 hours for complete coverage  

---

## Test Environment Setup

Before running tests:

1. **Test Accounts Ready**
   - [ ] Superadmin account (e.g., superadmin@esociety.local)
   - [ ] Admin account (e.g., admin@esociety.local)
   - [ ] 3-5 Resident test accounts
   - [ ] Passwords documented in secure location

2. **Test Data Ready**
   - [ ] Test society created (27East)
   - [ ] 5-10 test units created (various flats)
   - [ ] Test residents assigned to units

3. **Browser Ready**
   - [ ] Chrome or Firefox (latest)
   - [ ] Incognito/Private window for clean testing
   - [ ] Developer console open (check for errors)

---

## Test Suite 1: Authentication & Authorization

### TEST-AUTH-001: Login with Valid Credentials
**Steps:**
1. Navigate to `/login`
2. Enter valid superadmin email & password
3. Click "Login"

**Expected:**
- [ ] Redirected to `/home` (dashboard)
- [ ] Session cookie set (check browser DevTools)
- [ ] "Logged in as [Name]" appears in UI

**Actual Result:** _______________

---

### TEST-AUTH-002: Login with Invalid Credentials
**Steps:**
1. Navigate to `/login`
2. Enter invalid email & password
3. Click "Login"

**Expected:**
- [ ] Stays on `/login`
- [ ] Error message: "Incorrect email or password..."
- [ ] No sensitive data revealed (no "user not found" message)

**Actual Result:** _______________

---

### TEST-AUTH-003: Login with Deactivated Account
**Steps:**
1. Deactivate a resident account (as admin)
2. Try to login with that account

**Expected:**
- [ ] Stays on `/login`
- [ ] Error message: "This account has been deactivated..."
- [ ] Account NOT logged in

**Actual Result:** _______________

---

### TEST-AUTH-004: Logout
**Steps:**
1. Login as any user
2. Click "Logout" button
3. Session destroyed

**Expected:**
- [ ] Redirected to `/login`
- [ ] Session cookie cleared (DevTools)
- [ ] Cannot access authenticated pages
- [ ] Clicking Back doesn't restore session

**Actual Result:** _______________

---

### TEST-AUTH-005: Password Reset Link
**Steps:**
1. Navigate to `/forgot-password`
2. Enter superadmin email
3. Check email for reset link
4. Click link in email

**Expected:**
- [ ] Email received (check spam folder)
- [ ] Link opens `/reset-password/:token` page
- [ ] Token displayed (obfuscated)
- [ ] Form asks for new password

**Actual Result:** _______________

---

### TEST-AUTH-006: Set New Password via Reset Link
**Steps:**
1. Open reset link from email
2. Enter new password (e.g., "NewPass123!")
3. Submit

**Expected:**
- [ ] Redirected to `/login`
- [ ] Old password no longer works
- [ ] Can login with new password
- [ ] Reset link expires (try reusing link → error)

**Actual Result:** _______________

---

### TEST-AUTH-007: Account Activation
**Steps:**
1. Create new resident account as admin
2. Check email for activation link
3. Click activation link
4. Set password on `/activate/:token`

**Expected:**
- [ ] Activation page loads with first name
- [ ] Can set password (8+ chars)
- [ ] After submit, redirected to `/login`
- [ ] Can login with new credentials

**Actual Result:** _______________

---

### TEST-AUTH-008: Session Expiry (24 hours)
**Steps:**
1. Login
2. Note session cookie maxAge (should be 24 hours)
3. Navigate to authenticated page
4. Wait/skip forward time to past expiry
5. Try accessing app

**Expected:**
- [ ] Session expires after 24 hours
- [ ] Redirected to `/login` when accessing protected page
- [ ] Manual time-skip test optional (too slow for live testing)

**Actual Result:** _______________

---

### TEST-AUTH-009: Cannot Access Admin Routes as Resident
**Steps:**
1. Login as resident
2. Try direct URLs:
   - `/admins`
   - `/finance/config`
   - `/finance/periods`
   - `/members`

**Expected:**
- [ ] All redirected to `/home` or return 403
- [ ] No admin data visible
- [ ] No error stack traces

**Actual Result:** _______________

---

### TEST-AUTH-010: Admin Cannot Issue Bills (Superadmin Only)
**Steps:**
1. Login as admin
2. Create billing period (should work)
3. Generate draft bills (should work)
4. Try to issue bills (POST to `/finance/periods/:id/issue`)

**Expected:**
- [ ] Issue button shows but disabled (UI feedback)
- [ ] POST request fails with 403 (Dev Tools Network tab)
- [ ] Admin cannot issue bills

**Actual Result:** _______________

---

## Test Suite 2: Member Management

### TEST-MEM-001: Create New Member
**Steps:**
1. Login as admin
2. Go to Members
3. Click "Add Member"
4. Fill form: name, email, phone, unit, occupancy
5. Submit

**Expected:**
- [ ] Member created in database
- [ ] Activation email sent
- [ ] Member listed on Members page
- [ ] Account status: "Invited"

**Actual Result:** _______________

---

### TEST-MEM-002: Edit Member Details
**Steps:**
1. Login as admin
2. Go to Members
3. Click Edit on a member
4. Change phone number, click Save

**Expected:**
- [ ] Changes saved
- [ ] Phone number updated in database
- [ ] Redirected to Members list
- [ ] Changes reflected immediately

**Actual Result:** _______________

---

### TEST-MEM-003: Deactivate Member Account
**Steps:**
1. Login as admin
2. Go to Members
3. Click "Deactivate" on a member
4. Confirm

**Expected:**
- [ ] Member accountStatus = "inactive"
- [ ] Member cannot login
- [ ] Cannot reactivate as admin (superadmin only feature)

**Actual Result:** _______________

---

### TEST-MEM-004: Resend Activation Email
**Steps:**
1. Create new member (activation link sent)
2. Click "Resend" on that member
3. Check email for new link

**Expected:**
- [ ] New activation email sent
- [ ] Previous link still works (or invalidated)
- [ ] Member can use latest link to activate

**Actual Result:** _______________

---

## Test Suite 3: Units Management

### TEST-UNIT-001: View All Units
**Steps:**
1. Login as admin
2. Go to Units

**Expected:**
- [ ] All 112 flats listed (floors 1-28, 4 per floor)
- [ ] Table shows: flatNumber, occupancy status, owner, tenant
- [ ] Can scroll/search (if implemented)

**Actual Result:** _______________

---

### TEST-UNIT-002: View Unit Detail
**Steps:**
1. Click on a unit in the list
2. View full unit details

**Expected:**
- [ ] Floor, flat number, unit type, area, occupancy
- [ ] Residents assigned to unit
- [ ] Bills for this unit (if any)
- [ ] Edit button available (if admin)

**Actual Result:** _______________

---

### TEST-UNIT-003: Cannot View Other Unit Details as Resident
**Steps:**
1. Login as resident (unit 1301)
2. Try direct URL to different unit (e.g., `/unit/2401`)

**Expected:**
- [ ] Redirected or 403 error
- [ ] No other unit data visible

**Actual Result:** _______________

---

## Test Suite 4: Billing Configuration & Periods

### TEST-BILL-CONFIG-001: View Billing Configuration
**Steps:**
1. Login as superadmin
2. Go to Finance → Billing Configuration

**Expected:**
- [ ] Configuration page loads
- [ ] Shows settings: issue day, due day, grace period
- [ ] Edit button visible (superadmin)
- [ ] Charge components listed

**Actual Result:** _______________

---

### TEST-BILL-CONFIG-002: Create Charge Component
**Steps:**
1. As superadmin, Finance → Billing Configuration
2. Click "Add Charge Component"
3. Fill: Code (MAINT), Name (Maintenance), Method (FIXED_PER_UNIT), Amount (₹2,000)
4. Submit

**Expected:**
- [ ] Component created
- [ ] Shows in configuration list
- [ ] Current rate displayed

**Actual Result:** _______________

---

### TEST-BILL-CONFIG-003: Cannot Create Duplicate Charge Code
**Steps:**
1. Try creating another component with code "MAINT"

**Expected:**
- [ ] Error: "A charge component with that code already exists"
- [ ] Component NOT created

**Actual Result:** _______________

---

### TEST-BILL-PERIOD-001: Create Billing Period
**Steps:**
1. As admin, Finance → Billing Periods
2. Click "Create Period"
3. Select month: July 2026
4. Adjust issue/due dates if needed
5. Submit

**Expected:**
- [ ] Period created (DRAFT status)
- [ ] Shown in periods list
- [ ] Dates calculated correctly (including leap-year Feb)
- [ ] Can view period detail

**Actual Result:** _______________

---

### TEST-BILL-PERIOD-002: Cannot Create Overlapping Period
**Steps:**
1. Try creating another period for July 2026

**Expected:**
- [ ] Error: "This range overlaps an existing period..."
- [ ] Period NOT created

**Actual Result:** _______________

---

### TEST-BILL-PERIOD-003: Edit DRAFT Period
**Steps:**
1. On a DRAFT period detail page
2. Change issue date, click Save

**Expected:**
- [ ] Changes saved
- [ ] Redirected to period page
- [ ] New date displayed

**Actual Result:** _______________

---

### TEST-BILL-PERIOD-004: Cannot Edit Non-DRAFT Period
**Steps:**
1. On an ISSUED period (after issuing bills)
2. Try to change date

**Expected:**
- [ ] No edit form visible (or redirected)
- [ ] Changes NOT allowed

**Actual Result:** _______________

---

## Test Suite 5: Bill Workflow

### TEST-BILL-WORKFLOW-001: Preview Bills
**Steps:**
1. As admin, create a billing period (July 2026)
2. Click "Preview Bills" button

**Expected:**
- [ ] Preview page loads
- [ ] Shows 112 units breakdown
- [ ] Shows per-unit charges for active components
- [ ] Shows estimated total (₹2,000 × 112 = ₹2,24,000 if using our test data)
- [ ] Preview clearly marked as "not saved"

**Actual Result:** _______________

---

### TEST-BILL-WORKFLOW-002: Generate Draft Bills (First Time)
**Steps:**
1. On preview page, click "Generate Draft Bills"

**Expected:**
- [ ] Redirect to draft bills review page
- [ ] Shows: "Generated 112 draft bill(s)"
- [ ] Summary card shows bill count and total amount
- [ ] Issue button visible (superadmin only)
- [ ] All 112 units have bills in DRAFT status

**Actual Result:** _______________

---

### TEST-BILL-WORKFLOW-003: Idempotency - Generate Again (No Duplicates)
**Steps:**
1. On draft bills review page
2. Click "Generate Draft Bills" again

**Expected:**
- [ ] No new bills created
- [ ] Count remains 112
- [ ] No error (gracefully handles retry)
- [ ] Message indicates no new bills generated

**Actual Result:** _______________

---

### TEST-BILL-WORKFLOW-004: Refresh Page, Generate Again
**Steps:**
1. Refresh browser (F5)
2. Navigate back to period
3. Try generating again

**Expected:**
- [ ] No duplicates
- [ ] Count remains 112
- [ ] Safe to retry

**Actual Result:** _______________

---

### TEST-BILL-WORKFLOW-005: Review Draft Bills
**Steps:**
1. On draft bills review page
2. Review summary: count, total, charge breakdown
3. Scroll to individual bills
4. Check a few bills: verify charges, totals correct

**Expected:**
- [ ] Summary accurate
- [ ] All 112 bills listed
- [ ] Line items correct (charges per component)
- [ ] Totals calculated correctly
- [ ] Status badge shows "DRAFT"

**Actual Result:** _______________

---

### TEST-BILL-WORKFLOW-006: Issue Bills (Superadmin)
**Steps:**
1. Login as superadmin
2. Go to Billing Periods → [July period] → Draft Bills
3. Click "Issue Bills"
4. Confirmation dialog appears
5. Click "Confirm & Issue"

**Expected:**
- [ ] Confirmation dialog shows: "Issue 112 bills totaling ₹X"
- [ ] After confirm, redirected to period page
- [ ] Period status now "ISSUED"
- [ ] All bills now have bill numbers (27E/2026-27/000001, etc.)
- [ ] All bills transition to ISSUED status
- [ ] Issue date stamped
- [ ] Message: "✓ Issued 112 bill(s)"

**Actual Result:** _______________

---

### TEST-BILL-WORKFLOW-007: Bill Numbers Unique & Sequential
**Steps:**
1. Check several bill numbers in the register
2. Compare sequences

**Expected:**
- [ ] Numbers start at 000001, increment to 000112
- [ ] Format: 27E/2026-27/000001, 27E/2026-27/000002, etc.
- [ ] No gaps (except if generation partially failed)
- [ ] No duplicates

**Actual Result:** _______________

---

## Test Suite 6: Resident Bill Views

### TEST-RES-BILLS-001: Resident Sees Own ISSUED Bills
**Steps:**
1. Login as resident (unit 1301)
2. Navigate to My Bills page

**Expected:**
- [ ] Sees only bills for unit 1301
- [ ] Only ISSUED bills shown (no DRAFT)
- [ ] Shows: period, amount, paid, due, status
- [ ] Shows outstanding total
- [ ] Shows pay button (if outstanding)

**Actual Result:** _______________

---

### TEST-RES-BILLS-002: Resident Cannot See Other Unit's Bills
**Steps:**
1. Try direct URL: `/bill/<other-unit-bill-id>`

**Expected:**
- [ ] Returns 403 "You do not have access"
- [ ] No bill data leaked
- [ ] Not a 404 (which could enumerate existing IDs)

**Actual Result:** _______________

---

### TEST-RES-BILLS-003: Resident Cannot See DRAFT Bills
**Steps:**
1. Create a DRAFT bill and issue it
2. Resident logs in
3. Check that DRAFT bill not visible (before issue)
4. Check that ISSUED bill IS visible (after issue)

**Expected:**
- [ ] DRAFT bills never shown to residents
- [ ] ISSUED bills visible immediately after issuance
- [ ] No confusion about draft vs issued status

**Actual Result:** _______________

---

### TEST-RES-BILLS-004: Resident Views Bill Detail
**Steps:**
1. Click on a bill in the list
2. View full bill detail

**Expected:**
- [ ] Bill number displayed
- [ ] Period shown
- [ ] Issue and due dates
- [ ] Charge line items with amounts
- [ ] Total, paid, outstanding amounts
- [ ] Status badge
- [ ] Pay button (if outstanding)

**Actual Result:** _______________

---

## Test Suite 7: Security

### TEST-SEC-001: Resident Cannot Access Admin Routes
**Steps:**
1. Login as resident
2. Try accessing: `/admins`, `/members`, `/finance/config`, `/units`

**Expected:**
- [ ] All return 403 or redirect to home
- [ ] No admin data visible
- [ ] No stack traces

**Actual Result:** _______________

---

### TEST-SEC-002: Admin Cannot Issue Bills
**Steps:**
1. Login as admin
2. Try POST to `/finance/periods/:id/issue`

**Expected:**
- [ ] 403 Forbidden (captured in Network tab)
- [ ] Admin cannot issue bills

**Actual Result:** _______________

---

### TEST-SEC-003: CSRF Protection
**Steps:**
1. Try POST to any form without _csrf token

**Expected:**
- [ ] Request fails (403 or 400)
- [ ] Form submission requires valid CSRF token

**Actual Result:** _______________

---

### TEST-SEC-004: No Stack Traces in Production
**Steps:**
1. Cause an error (invalid ObjectId, missing field, etc.)
2. Check response

**Expected:**
- [ ] User sees: "Server error" (generic)
- [ ] No stack trace in HTML
- [ ] No sensitive information leaked
- [ ] Error logged on server (check Render logs)

**Actual Result:** _______________

---

## Test Suite 8: UI/UX

### TEST-UX-001: Navigation Links Work
**Steps:**
1. Login and click through all major navigation items
2. Check each page loads

**Expected:**
- [ ] All links work (no 404s)
- [ ] Pages load within 3 seconds
- [ ] Navigation highlights active page

**Actual Result:** _______________

---

### TEST-UX-002: Forms Validate Client-Side
**Steps:**
1. Try submitting form without required fields
2. Submit form with invalid email

**Expected:**
- [ ] Validation errors shown near fields
- [ ] Form not submitted
- [ ] Clear guidance on what's wrong

**Actual Result:** _______________

---

### TEST-UX-003: Responsive Design
**Steps:**
1. Resize browser to mobile (375px wide)
2. Test major pages: login, dashboard, bills

**Expected:**
- [ ] Layout adjusts (no horizontal scroll)
- [ ] Buttons clickable (not too small)
- [ ] Text readable
- [ ] Tables scroll if needed

**Actual Result:** _______________

---

### TEST-UX-004: Empty States
**Steps:**
1. Create new period (no bills yet)
2. View periods list when empty

**Expected:**
- [ ] Shows friendly message ("No bills yet")
- [ ] Shows action button ("Generate Bills")
- [ ] Not confusing

**Actual Result:** _______________

---

## Test Suite 9: Performance

### TEST-PERF-001: Dashboard Loads in < 2 seconds
**Steps:**
1. Login
2. Note page load time (DevTools Network tab)

**Expected:**
- [ ] Page loads in < 2 seconds
- [ ] No slow queries (check server logs)

**Actual Result:** _______________

---

### TEST-PERF-002: Bill List Loads in < 2 seconds
**Steps:**
1. Go to Finance → Bills Register
2. Note page load time (with 112 bills)

**Expected:**
- [ ] Page loads in < 2 seconds
- [ ] All 112 bills display
- [ ] Responsive even with large dataset

**Actual Result:** _______________

---

### TEST-PERF-003: Bill Preview Calculates in < 5 seconds
**Steps:**
1. Click "Preview Bills"
2. Time from click to page display

**Expected:**
- [ ] Loads in < 5 seconds
- [ ] Calculates 112 units + charges smoothly

**Actual Result:** _______________

---

## Test Suite 10: Error Handling

### TEST-ERR-001: Invalid ObjectId
**Steps:**
1. Try accessing `/bill/invalid-id`

**Expected:**
- [ ] Redirect or 404 (not 500)
- [ ] Friendly error message
- [ ] No stack trace

**Actual Result:** _______________

---

### TEST-ERR-002: Expired Session
**Steps:**
1. Clear session cookie manually
2. Try accessing protected page

**Expected:**
- [ ] Redirect to `/login`
- [ ] "Please log in again" message (if shown)

**Actual Result:** _______________

---

### TEST-ERR-003: Database Connection Error
**Steps:**
1. (Simulate: stop MongoDB, or skip if too risky)
2. Try accessing app

**Expected:**
- [ ] Friendly error ("Server error", not stack trace)
- [ ] Server logs show actual error
- [ ] App doesn't crash (Render restarts if needed)

**Actual Result:** _______________

---

## Test Summary

| Category | Tests | Passed | Failed | Blocked |
|----------|-------|--------|--------|---------|
| Authentication | 10 | | | |
| Member Management | 4 | | | |
| Units | 3 | | | |
| Billing Config | 3 | | | |
| Billing Periods | 4 | | | |
| Bill Workflow | 7 | | | |
| Resident Views | 4 | | | |
| Security | 4 | | | |
| UI/UX | 4 | | | |
| Performance | 3 | | | |
| Error Handling | 3 | | | |
| **TOTAL** | **54** | | | |

---

## Issues Found During Testing

| ID | Severity | Description | Status |
|----|-----------|----|--------|
| | | | |
| | | | |
| | | | |

---

## Test Sign-Off

| Role | Name | Date | Approved |
|------|------|------|----------|
| QA Tester | | | |
| QA Lead | | | |
| Release Manager | | | |

---

**Test Plan Version:** 1.0  
**Total Test Cases:** 54  
**Estimated Duration:** 2-3 hours  
**Last Updated:** 2026-07-25
