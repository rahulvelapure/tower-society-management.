# 27East RC1 User Acceptance Testing (UAT) Checklist

**For:** Society Administrator  
**Duration:** 1-2 hours  
**Goal:** Verify 27East works for your community before full deployment

This checklist walks you through the key workflows in plain language. No technical jargon.

---

## Pre-UAT: Account Setup

**Your IT Support Should Have Provided:**
- [ ] **Superadmin account** (email + temporary password)
- [ ] **Admin account** (if you're managing members)
- [ ] **3-5 resident test accounts** (with passwords)
- [ ] **Support contact** (if you need help)

**Access URL:**
- [ ] Application URL: `https://[your-27east-app].onrender.com`

---

## Part 1: Resident Login & Basic Access

### Step 1.1: Resident Can Log In
**What This Checks:** Residents can access their account

1. Go to 27East URL
2. Log in with a **resident test account**
3. You should see your dashboard with basic info

**Expected:**
- [ ] Login page loads
- [ ] Can log in with username/password
- [ ] See dashboard after login
- [ ] See your flat number and name

---

### Step 1.2: Resident Can View Their Bills
**What This Checks:** Residents see their outstanding dues

1. While logged in as resident
2. Look for "My Bills" or "Bills" link
3. Click it

**Expected:**
- [ ] See your flat's bills
- [ ] Shows: billing period, amount due, status
- [ ] Shows total outstanding amount
- [ ] Can see individual bill details

---

### Step 1.3: Resident Cannot See Other Flats' Bills
**What This Checks:** Privacy - residents only see their own data

1. While logged in as resident
2. Try to access another flat's bills (ask IT to provide a link)
3. OR try guessing URL

**Expected:**
- [ ] Access denied (403 or "not authorized")
- [ ] No other flat's financial data visible
- [ ] No error messages that leak information

---

### Step 1.4: Resident Can Logout
**What This Checks:** Session ends properly

1. Find "Logout" button (usually top-right)
2. Click it

**Expected:**
- [ ] Redirected to login page
- [ ] Cannot go back using browser back button to see your data
- [ ] Session ends

---

## Part 2: Admin Functions - Member Management

### Step 2.1: Admin Can Create New Resident Account
**What This Checks:** You can onboard new residents

1. Log in as **admin** account
2. Go to "Members" or "Residents"
3. Click "Add Member" or "Create New"
4. Fill in:
   - [ ] First name
   - [ ] Last name
   - [ ] Email address
   - [ ] Phone number
   - [ ] Select their flat
   - [ ] Occupancy type (owner/tenant)

5. Click "Create Member"

**Expected:**
- [ ] Member created successfully
- [ ] See confirmation message
- [ ] Member listed in members list
- [ ] Activation email sent (check email for confirmation)

---

### Step 2.2: Resident Can Activate Their Account
**What This Checks:** New residents can set up their password

1. Check email for activation link (sent in Step 2.1)
2. Click activation link in email
3. Set password (8+ characters)
4. Click "Activate"

**Expected:**
- [ ] Password set successfully
- [ ] Redirected to login
- [ ] Can log in with new password

---

### Step 2.3: Admin Can Edit Resident Information
**What This Checks:** You can update member details

1. In Members list, find a member
2. Click "Edit" (pencil icon)
3. Change phone number
4. Click "Save"

**Expected:**
- [ ] Changes saved
- [ ] Phone number updated in list

---

### Step 2.4: Admin Can Deactivate a Resident
**What This Checks:** You can lock out accounts if needed

1. In Members list, find a test resident
2. Click "Deactivate" (or trash icon)
3. Confirm

**Expected:**
- [ ] Account marked as inactive
- [ ] That resident cannot log in anymore
- [ ] Account still appears in list (not deleted)

---

## Part 3: Admin Functions - Unit Management

### Step 3.1: View All Units/Flats
**What This Checks:** Your society's 112 flats are set up

1. Go to "Units" or "Flats"
2. Look at the list

**Expected:**
- [ ] All 112 flats listed
- [ ] Shows: flat number, floor, resident names, occupancy status
- [ ] Can see ownership/tenant information

---

### Step 3.2: View Individual Unit Details
**What This Checks:** You can see detailed flat information

1. Click on any flat in the list
2. View full details

**Expected:**
- [ ] Flat number and floor
- [ ] Resident(s) assigned
- [ ] Flat type (BHK) if configured
- [ ] Occupancy status
- [ ] Contact information for residents in that flat

---

## Part 4: Billing Setup & Operations

### Step 4.1: Superadmin Reviews Billing Configuration
**What This Checks:** Billing rules are set correctly

1. Log in as **superadmin**
2. Go to Finance → Billing Configuration
3. Review settings

**Expected:**
- [ ] Issue day shown (e.g., 1st of month)
- [ ] Due date shown (e.g., 15th of month)
- [ ] Grace period shown (days before overdue)
- [ ] Charge components listed:
  - [ ] Maintenance charge shown with amount (e.g., ₹2,000)
  - [ ] Other components if configured

---

### Step 4.2: Superadmin Creates a Billing Period
**What This Checks:** You can set up a month for billing

1. Go to Finance → Billing Periods
2. Click "Create Period"
3. Select: July 2026 (or current month)
4. Review dates:
   - [ ] Issue date looks right
   - [ ] Due date looks right
5. Click "Create"

**Expected:**
- [ ] Period created
- [ ] Shown in periods list
- [ ] Status shows "Draft"

---

### Step 4.3: Admin Previews Bills Before Generation
**What This Checks:** You can see what bills WILL be created

1. Click on your July 2026 period
2. Click "Preview Bills"

**Expected:**
- [ ] Preview page loads
- [ ] Shows breakdown of all 112 flats
- [ ] Shows charge components
- [ ] Shows estimated total (e.g., ₹2,24,000)
- [ ] Clearly says "preview not saved"

---

### Step 4.4: Admin Generates Draft Bills
**What This Checks:** Bills are created safely (as draft, not final)

1. On preview page, click "Generate Draft Bills"
2. Wait for processing

**Expected:**
- [ ] Message: "Generated 112 draft bill(s)"
- [ ] Shows summary of bills created
- [ ] Shows total amount to be billed
- [ ] Page shows "Issue Bills" button (for superadmin)

---

### Step 4.5: Admin Reviews Generated Bills
**What This Checks:** Bills look correct before issuing

1. On the draft bills page, review:
   - [ ] Count: 112 bills ✓
   - [ ] Total amount matches preview
   - [ ] Scroll through and spot-check a few bills:
     - [ ] Flat numbers correct
     - [ ] Charges included
     - [ ] Totals look right

**Expected:**
- [ ] All 112 bills listed
- [ ] No obvious errors
- [ ] Bills marked as "DRAFT"

---

### Step 4.6: Superadmin Issues Bills (Makes Them Final)
**What This Checks:** Bills are finalized and sent to residents

1. As **superadmin**, on draft bills page
2. Click "Issue Bills"
3. Confirmation dialog shows: "Issue 112 bills totaling ₹X"
4. Click "Confirm & Issue"

**Expected:**
- [ ] Bills transition to "Issued"
- [ ] Each bill gets a number (27E/2026-27/000001, etc.)
- [ ] Bills immediately visible to residents
- [ ] Message: "✓ Issued 112 bills"

---

## Part 5: Resident Bill Experience

### Step 5.1: Resident Sees New Bills After Issuance
**What This Checks:** Bills appear for residents after issuance

1. Log out as admin/superadmin
2. Log in as **resident**
3. Go to My Bills

**Expected:**
- [ ] NEW bills now visible
- [ ] Shows: period, amount, due date, status
- [ ] Bill is "Issued" (not draft)
- [ ] Pay button shown (if there's outstanding amount)

---

### Step 5.2: Resident Views Bill Details
**What This Checks:** Residents understand what they owe

1. Click on a bill
2. View details

**Expected:**
- [ ] Flat number shown
- [ ] Billing period shown (e.g., July 2026)
- [ ] Bill number shown
- [ ] Line items shown:
  - [ ] Maintenance: ₹2,000
  - [ ] Any other charges
- [ ] Total amount shown
- [ ] Amount paid shown (0 for new bills)
- [ ] Amount due shown
- [ ] Status shown (Issued, Not Paid, etc.)

---

### Step 5.3: Verify Bill Privacy
**What This Checks:** Other residents cannot see this flat's bills

1. Share a bill URL link with another resident
2. Have them try to access it

**Expected:**
- [ ] Error: "You do not have access"
- [ ] Access denied (403)
- [ ] No data from that flat shown

---

## Part 6: Payment Processing (If Stripe Enabled)

### Step 6.1: Resident Initiates Payment
**What This Checks:** Residents can start paying online

1. As resident, view a bill with outstanding amount
2. Click "Pay Now" button

**Expected:**
- [ ] Redirect to payment page
- [ ] Shows: flat number, amount due, period
- [ ] Shows payment method options (if configured)

---

### Step 6.2: Payment Processing
**What This Checks:** Payment gateway works

1. If using test mode:
   - [ ] Use Stripe test card: 4242 4242 4242 4242
   - [ ] Expiry: any future date
   - [ ] CVC: any 3 digits

2. Complete payment

**Expected:**
- [ ] Payment processed
- [ ] Confirmation page shown
- [ ] Payment recorded in system
- [ ] Resident's bill now shows as "Paid"

---

## Part 7: Admin Dashboard & Reports

### Step 7.1: Admin Views Billing Summary
**What This Checks:** You can see financial overview

1. Go to Finance
2. Look for Dashboard or Summary

**Expected:**
- [ ] Shows: total billed, amount collected, outstanding
- [ ] Shows: number of bills by status (paid, unpaid, etc.)
- [ ] Can drill down to see bill details

---

### Step 7.2: Admin Exports Bill List
**What This Checks:** You can download/report on bills

1. Go to Finance → Bills
2. Look for "Export" or "Download" option (if available)

**Expected:**
- [ ] Can export to CSV or PDF (if implemented)
- [ ] Exported file contains all bills data
- [ ] Can open in Excel or similar

---

## Part 8: Security Checks (Society Admin Perspective)

### Step 8.1: Cannot Access Sensitive Admin Functions
**What This Checks:** Regular admins can't bypass security

1. If logged in as **admin** (not superadmin)
2. Try to change billing configuration
3. Try to issue bills

**Expected:**
- [ ] Cannot access these functions
- [ ] See "Access Denied" or no buttons
- [ ] Redirected to dashboard

---

### Step 8.2: Residents Cannot See Financial Reports
**What This Checks:** Residents see only their bills

1. As resident, look for Finance menu or Reports
2. Try to access admin financial reports

**Expected:**
- [ ] No Finance menu visible to residents
- [ ] Cannot access admin pages
- [ ] Only see own bills

---

## Part 9: General User Experience

### Step 9.1: Navigation is Intuitive
**What This Checks:** UI makes sense and is easy to use

1. Try finding key features:
   - [ ] How to view bills? (Easy? ✓)
   - [ ] How to add a member? (Easy? ✓)
   - [ ] How to view account settings? (Easy? ✓)
   - [ ] How to logout? (Easy? ✓)

**Expected:**
- [ ] Menu structure clear
- [ ] Can find major features in < 30 seconds
- [ ] Buttons/links clearly labeled

---

### Step 9.2: Error Messages are Helpful
**What This Checks:** When something goes wrong, you understand

1. Try logging in with wrong password
2. Try submitting form with missing field

**Expected:**
- [ ] Error messages are clear
- [ ] Tell you what went wrong
- [ ] Suggest how to fix
- [ ] Not overly technical

---

### Step 9.3: Responsive on Mobile
**What This Checks:** Works on phones too

1. Open 27East on your phone (or browser resized to mobile)
2. Try: login, view bills, navigate

**Expected:**
- [ ] Readable on small screen
- [ ] Buttons clickable (not too small)
- [ ] No horizontal scrolling needed
- [ ] Works reasonably well

---

## Part 10: Overall Assessment

### Questions for Feedback

1. **Ease of Use (1-5 stars)**
   - [ ] 1 - Very difficult
   - [ ] 2 - Difficult
   - [ ] 3 - Acceptable
   - [ ] 4 - Good
   - [ ] 5 - Excellent

2. **Performance (1-5 stars)**
   - [ ] 1 - Very slow
   - [ ] 2 - Slow
   - [ ] 3 - Acceptable
   - [ ] 4 - Good
   - [ ] 5 - Very fast

3. **Trust in Data (1-5 stars)**
   - [ ] 1 - Not trustworthy
   - [ ] 2 - Questionable
   - [ ] 3 - Acceptable
   - [ ] 4 - Good
   - [ ] 5 - Very trustworthy

---

## Issues Found

| Issue # | Severity | Description | Impact |
|---------|----------|-------------|--------|
| | | | |
| | | | |
| | | | |

---

## Recommendation

Based on this UAT, I recommend:

- [ ] **APPROVE** - Ready for full deployment
- [ ] **APPROVE WITH MINOR FIXES** - Minor issues found, but OK to deploy
- [ ] **HOLD** - Issues found, need fixes before deployment
- [ ] **REJECT** - Major issues, cannot deploy yet

### Reason:
___________________________________________________________________________________________

---

## UAT Sign-Off

| Role | Name | Date | Approved |
|------|------|------|----------|
| Society Administrator | | | |
| IT Support | | | |
| Superadmin (Project Lead) | | | |

---

## Next Steps After UAT

If approved:
1. Issues documented for Phase 1 production
2. Application moved to production
3. Real members onboarded
4. Community launches with 27East

If issues found:
1. Issues prioritized
2. Development team fixes
3. Retesting in staging
4. Another UAT round (if major fixes)

---

**UAT Checklist Version:** 1.0  
**Sections:** 10  
**Key Workflows:** 40+  
**Last Updated:** 2026-07-25
