# RC1 Release Checklist

**Release Target:** Internal UAT Deployment  
**Status:** Ready to Deploy  
**Version:** 1.0  

This checklist ensures 27East RC1 is ready for deployment to Render and internal user acceptance testing.

---

## Pre-Deployment Verification (QA Sign-Off)

### Code Quality
- [ ] All console.log statements reviewed (only errors in production code)
- [ ] No sensitive data in code (passwords, tokens, secrets)
- [ ] No commented-out code (or TODO comments documented)
- [ ] All imports used
- [ ] No duplicate code
- [ ] Code style consistent

### Security
- [ ] IDOR/BOLA vulnerabilities tested
- [ ] Authorization guards verified (ensureAdmin, ensureSuperAdmin)
- [ ] CSRF protection on all forms
- [ ] No XSS vulnerabilities
- [ ] No SQL/NoSQL injection
- [ ] Stripe webhook signature verified
- [ ] No hardcoded secrets

### Privacy
- [ ] Residents cannot view other residents' bills
- [ ] Residents cannot access admin routes
- [ ] Draft bills hidden from residents
- [ ] Financial data properly scoped

### Testing
- [ ] Unit tests pass (scripts/selftest.js)
- [ ] Manual test plan executed
- [ ] All critical workflows tested
- [ ] Bill generation tested end-to-end
- [ ] Stripe payment tested (test mode)

### Documentation
- [ ] RELEASE_CHECKLIST.md complete
- [ ] TEST_PLAN.md complete
- [ ] UAT_CHECKLIST.md complete
- [ ] KNOWN_LIMITATIONS.md complete
- [ ] RC1_AUDIT_FINDINGS.md complete
- [ ] Architecture docs up-to-date (PHASE_3A3_IMPLEMENTATION.md, etc.)

---

## Pre-Deployment Environment Setup

### 1. Verify Render Configuration

- [ ] Environment variables set:
  ```
  NODE_ENV=production
  SESSION_SECRET=(32+ character random secret)
  MONGO_URI=(MongoDB Atlas connection string)
  STRIPE_SECRET_KEY=(Test or Live key, or unset for disabled payments)
  STRIPE_WEBHOOK_SECRET=(if webhook enabled)
  PORT=10000 (or Render default)
  APP_BASE_URL=https://[your-render-app].onrender.com
  ```

- [ ] No secrets in code or .env files
- [ ] .env NOT committed to git
- [ ] .gitignore includes .env
- [ ] Render auto-deploy on branch push configured
- [ ] Health check route responds: `/health` → 200 "Server is running"

### 2. MongoDB Atlas Verification

- [ ] Cluster connection verified
- [ ] Database name: correct (e.g., "esociety-prod")
- [ ] Render IP whitelisted (or allow all for testing)
- [ ] Collections exist (created on first boot):
  - [ ] users
  - [ ] units
  - [ ] societies
  - [ ] billingconfigs
  - [ ] chargecomponents
  - [ ] billingperiods
  - [ ] bills
  - [ ] payments
  - [ ] receipts
  - [ ] adjustments
  - [ ] counters
  - [ ] stripeevents
  - [ ] auditlogs
  - [ ] sessions
  - [ ] notices
  - [ ] complaints
  - [ ] contacts
  - [ ] noticeboard

- [ ] Indexes created (automatic on schema define)
- [ ] Backup enabled (Atlas automated backups)
- [ ] Monitoring enabled

### 3. Stripe Configuration (Optional)

If Stripe is enabled:
- [ ] Use TEST mode for this deployment
- [ ] STRIPE_SECRET_KEY starts with `sk_test_`
- [ ] Render logs show: "[Stripe] TEST mode - no real charges"
- [ ] Webhook endpoint configured (if using webhook)
- [ ] Webhook secret secure

If Stripe is disabled:
- [ ] STRIPE_SECRET_KEY unset in Render
- [ ] Render logs show: "[Stripe] Not configured"
- [ ] Online payment button disabled in UI
- [ ] Users see friendly message: "Online payments not available"

### 4. Email Configuration (Optional)

- [ ] Email provider configured (if used for password reset)
- [ ] Test email sent successfully
- [ ] No test emails to real users

### 5. Application Backup

- [ ] MongoDB backup before deploy
- [ ] Git branch backed up (feature/phase1-2-foundation-flat-master)
- [ ] Render rollback plan documented

---

## Deployment Steps

### Step 1: Final Code Review

```bash
# Verify clean working tree
git status
# Expected: "nothing to commit, working tree clean"

# Verify current branch
git branch
# Expected: feature/phase1-2-foundation-flat-master (or deployment branch)

# Review latest commits
git log --oneline -5
```

### Step 2: Run Automated Tests (If Available)

```bash
# Run self-test
node scripts/selftest.js
# Expected: All tests pass
```

### Step 3: Deploy to Render

**Option A: Automatic Deploy**
- Push to Render branch (if configured)
- Render auto-deploys
- Monitor Render logs for startup

**Option B: Manual Deploy (If Needed)**
- Go to Render dashboard
- Select 27East service
- Click "Manual Deploy"
- Select branch: feature/phase1-2-foundation-flat-master
- Wait for build and deployment

### Step 4: Verify Application Boot

**Expected Log Output:**
```
[Stripe] TEST mode - no real charges will be made.
Server started
```

**Verify Health Check:**
```bash
curl https://[your-app].onrender.com/health
# Expected: 200 "Server is running"
```

### Step 5: Smoke Test

Perform quick smoke test in deployed app:

1. **Login**
   - Navigate to deployed app
   - Log in with test superadmin account
   - Expected: Redirected to `/home` (dashboard)

2. **Create a Resident**
   - Navigate to Members
   - Create a test resident
   - Expected: Member created, activation email sent

3. **View Bills**
   - Navigate to Finance → Billing Periods
   - Expected: List of periods (may be empty)

4. **Logout**
   - Click Logout
   - Expected: Redirected to `/login`

### Step 6: Check Logs

Render Logs Dashboard:
- [ ] No 500 errors in startup
- [ ] No connection errors
- [ ] No authentication errors
- [ ] Application running stable

---

## Post-Deployment Verification

### 1. Database Integrity

```bash
# Via MongoDB Atlas dashboard
# - Verify data exists (check document counts)
# - Verify indexes present
# - Verify no connection errors
```

### 2. Application Health

- [ ] `/health` responds 200
- [ ] Login page loads
- [ ] Dashboard accessible after login
- [ ] No browser console errors

### 3. Critical Workflows

- [ ] Resident login works
- [ ] Admin login works
- [ ] Superadmin login works
- [ ] Logout works
- [ ] Session management stable

### 4. Stripe (If Enabled)

- [ ] Test payment in /bill → Stripe checkout works
- [ ] Test payment completes → Receipt shown
- [ ] Payment recorded in database
- [ ] Webhook test (optional): Send test event via Stripe CLI

### 5. Monitoring

- [ ] Render monitoring dashboard accessible
- [ ] Memory usage stable
- [ ] CPU usage normal
- [ ] Error rate 0%

---

## Rollback Procedure (If Issues Found)

If critical issues found after deploy:

### Option 1: Revert to Previous Build

**Via Render Dashboard:**
1. Go to Render service
2. Click "Deployments" tab
3. Select previous stable deployment
4. Click "Redeploy"

### Option 2: Redeploy from Previous Commit

```bash
# If on feature branch, push previous commit
git reset --soft HEAD~1
git push -f origin feature/phase1-2-foundation-flat-master

# Render auto-deploys on push
```

### Option 3: Full Rollback to MongoDB Backup

```bash
# If data corruption:
# 1. Stop application (Render → Suspend)
# 2. Restore MongoDB backup (Atlas dashboard)
# 3. Redeploy application
```

---

## UAT Setup

### Before Handing to QA

- [ ] Render URL stable
- [ ] Superadmin test account created
- [ ] Admin test account created
- [ ] 5-10 test resident accounts created
- [ ] Test unit/flat structure set up
- [ ] UAT_CHECKLIST.md provided to testers
- [ ] Testers briefed on what to test

### Support During UAT

- [ ] Monitor Render logs for errors
- [ ] Document any issues found
- [ ] Help testers with account access
- [ ] Fix critical bugs immediately
- [ ] Medium bugs: document for Phase 1 production

---

## Go-Live Preparation (After UAT Approval)

### Production Database Preparation

- [ ] PROD MongoDB Atlas cluster prepared
- [ ] Backup configured
- [ ] Monitoring enabled
- [ ] Connection string secured

### Production Environment Setup

- [ ] Create production Render service (or switch to prod config)
- [ ] Set production environment variables
- [ ] Configure production Stripe key (if using)
- [ ] Update APP_BASE_URL to production domain

### Final Checklist

- [ ] All UAT issues documented
- [ ] Approved fixes deployed
- [ ] Final security audit complete
- [ ] Performance acceptable
- [ ] Data backup verified
- [ ] Rollback plan approved
- [ ] Support team trained
- [ ] Stakeholder sign-off obtained

---

## Sign-Off

| Role | Name | Date | Sign-Off |
|------|------|------|----------|
| QA Engineer | | | |
| Security Reviewer | | | |
| Release Manager | | | |
| System Admin | | | |
| Stakeholder | | | |

---

## Post-Deployment Support Plan

### Day 1 (Go-Live)
- [ ] Monitor application 24/7
- [ ] Respond to issues within 15 minutes
- [ ] Document all issues
- [ ] Escalate critical issues

### Week 1
- [ ] Daily health checks
- [ ] Monitor error rates
- [ ] Collect user feedback
- [ ] Fix critical bugs immediately
- [ ] Track performance metrics

### Ongoing
- [ ] Weekly health reports
- [ ] Monthly backup verification
- [ ] Security updates as needed
- [ ] Capacity planning

---

## Important Notes

1. **TEST MODE**: This release uses Stripe TEST mode. No real charges will be made. To switch to LIVE mode, update STRIPE_SECRET_KEY and restart.

2. **PHASE 3A-3 ONLY**: This RC1 includes billing preview/generation/issuance. Payment allocation (Phase 3A-5) not yet implemented. Users must use Stripe or manual payment entry.

3. **NO LEGACY MIGRATION**: User.lastPayment remains the source of truth for dues calculation. Phase 3A-9 will migrate to new Bill-based system.

4. **DOCUMENT STORAGE**: File uploads not yet implemented. Secure document storage deferred to Phase 3B-5.

5. **NO EXPENSES**: Money OUT (expenses, vendors) not implemented. Phase 3B-1+ will add this.

---

**Document Version:** 1.0  
**Ready for Deployment:** YES  
**Last Updated:** 2026-07-25  
**Next Step:** Run UAT per UAT_CHECKLIST.md
