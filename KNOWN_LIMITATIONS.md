# 27East RC1 - Known Limitations & Future Roadmap

**Version:** 1.0  
**Release:** RC1 (Phase 3A-3)  
**Date:** 2026-07-25  

This document honestly lists what's **NOT** in RC1 and when it will be available.

---

## RC1 Scope (What's Included)

### ✅ Implemented & Working

**Authentication & Authorization**
- User login/logout with session management
- Password reset via email
- Account activation for new members
- Role-based access (Superadmin, Admin, Member/Resident)
- 24-hour session timeout

**Member Management**
- Admin can create, edit, deactivate resident accounts
- Resident directory with contact info (privacy-respecting)
- Unit/Flat master with 112 flats configured
- Occupancy tracking (owner, tenant, family member)

**Billing Foundation (Phase 3A-1)**
- Financial models: Bill, Payment, Receipt, Adjustment
- Paise-based (integer rupees × 100) calculations
- Audit logging for financial actions
- Stripe integration with test/live mode detection

**Billing Configuration (Phase 3A-2)**
- Admin sets issue day, due day, grace period
- Superadmin defines charge components (e.g., Maintenance)
- Charge rates with append-only history
- Support for FIXED_PER_UNIT charges (all 112 flats)
- Support for FIXED_PER_UNIT only; others blocked until phase 3B

**Bill Generation Workflow (Phase 3A-3)**
- Bill preview (ephemeral, never persists)
- Draft bill generation (idempotent, safe to retry)
- Admin bill review dashboard
- Superadmin-only bill issuance
- Bill numbering via Counter (atomic, sequential)
- Resident view of ISSUED bills only
- Privacy protection (residents cannot see other flats' bills)

**Legacy Billing (Compatibility)**
- User.lastPayment still drives dues calculation
- No breaking changes to existing features
- Stripe checkout still works
- Webhook still processes payments

---

## ❌ NOT Implemented (Phase 3A-3 Boundary)

### Billing Phase 3A-4 through 3A-9 (Future)

**Flat Ledger (3A-4)**
- Chronological view of bills + payments per unit
- Statement/history page for residents
- Ledger balance calculation

**Manual Payments & Allocation (3A-5)**
- Offline payment recording (bank transfer, cheque, cash)
- Payment allocation to bills (oldest-first recommended)
- Partial payment support
- Advance/credit tracking

**Stripe Webhook Authority (3A-6)**
- Webhook-driven bill allocation
- `/success` page becomes read-only
- Fully async payment processing

**Receipt Management (3A-7)**
- Receipt numbering (separate counter)
- Receipt register/history

**Finance Dashboard & Reports (3A-8)**
- KPI widgets (billed, collected, outstanding)
- Bill register with filters
- Collection reports
- Outstanding/defaulter reports

**Legacy Cutover (3A-9)**
- Migration of legacy User.lastPayment to new Bills
- Opening balance calculation
- Transition to new system as authoritative

### Phase 3B: Expenditure Management (Not Started)

**Expense Tracking (3B-1)**
- Admin can record expenses (repairs, services, etc.)
- Approval workflow (submit → approve → pay)
- Expense categories configurable
- Payment vouchers

**Vendor Management (3B-2)**
- Vendor master (company, contacts, services)
- Vendor invoices tracking
- AMC/contract management

**Bank & Cash Accounts (3B-3)**
- Bank account master
- Cash account tracking
- Account transaction ledger

**Payment Vouchers (3B-4)**
- Voucher numbering
- Audit trail for payables

**Document Repository (3B-5)**
- Secure file upload (contracts, invoices, certificates)
- Private object storage (not Render disk)
- Document expiry tracking

**Reminders & Renewals (3B-6)**
- AMC renewal reminders
- Contract expiry alerts
- Configurable reminder intervals

**Vendor Financial Integration (3B-7)**
- AMC payment scheduling
- Vendor invoice tracking
- Service history & SLA monitoring

### Phase 3C: Financial Reporting (Future)

**Advanced Reporting**
- Income & Expenditure Statement
- Cash flow reports
- Budget vs Actual
- Vendor-wise expense breakdown
- Unit-wise collections analysis

**Financial Analytics**
- Collection trends
- Expense trends
- Outstanding receivables aging
- Payables aging

---

## Current Limitations & Workarounds

### Limitation #1: No Payment Allocation Yet
**Status:** Intentional (Phase 3A-5 will add)  
**Impact:** Admin cannot allocate payments to specific bills manually  
**Workaround:** Stripe auto-allocates to earliest bills when webhook is live (3A-6)  
**Timeline:** Phase 3A-5

### Limitation #2: No Legacy Migration Path Yet
**Status:** Intentional (Phase 3A-9 will add)  
**Impact:** Old dues (User.lastPayment) not automatically converted to Bills  
**Workaround:** Will be handled in Phase 3A-9 with dry-run & review  
**Timeline:** Phase 3A-9

### Limitation #3: No Receipt History Yet
**Status:** Intentional (Phase 3A-7 will add)  
**Impact:** Residents can download receipt but can't see history  
**Workaround:** Use bill history as proxy for payment records  
**Timeline:** Phase 3A-7

### Limitation #4: Stripe Webhook Optional
**Status:** Intentional  
**Impact:** If webhook not configured, residents must use /success redirect  
**Workaround:** Webhook is optional; redirect path still works  
**Timeline:** Already in place (Phase 3A-1)

### Limitation #5: No Expense Tracking
**Status:** Not implemented yet  
**Impact:** Cannot track money OUT (maintenance costs, vendor payments)  
**Workaround:** External spreadsheet or accounting software  
**Timeline:** Phase 3B-1 (future)

### Limitation #6: No Document Storage
**Status:** Not implemented yet  
**Impact:** Cannot upload contracts, certificates, invoices in app  
**Workaround:** External file storage (Google Drive, Dropbox)  
**Timeline:** Phase 3B-5 (future)

### Limitation #7: No Amenity/Service Bookings
**Status:** Not implemented  
**Impact:** Cannot book guest room, parking, amenities  
**Workaround:** External booking or manual system  
**Timeline:** Not in current roadmap (potential Phase 4)

### Limitation #8: No Complaints System Yet
**Status:** Module exists, but no email notifications  
**Impact:** Admins must check complaints portal manually  
**Workaround:** Check portal regularly or external ticketing  
**Timeline:** Email notifications in Phase 1 production

### Limitation #9: No SMS/WhatsApp Notifications
**Status:** Not implemented yet  
**Impact:** Residents only get email (no SMS)  
**Workaround:** Email is primary notification  
**Timeline:** Future enhancement

### Limitation #10: No Mobile App
**Status:** Not implemented  
**Impact:** Mobile web only (no native iOS/Android app)  
**Workaround:** Responsive web design works on phones  
**Timeline:** Not planned (web-first approach)

---

## Performance Constraints

### Data Limits

| Item | Limit | Status |
|------|-------|--------|
| Residents per society | Unlimited (tested to 500) | OK |
| Units (flats) per society | 112 | Hard limit (27East design) |
| Bills per period | Up to 1000s | OK |
| Payments per bill | Unlimited | OK |
| Concurrent users | Tested to 10 | Depends on Render plan |
| File size (uploads) | Not yet supported | N/A |

---

## Security Known Gaps (Intentional Boundaries)

### What We're NOT Doing in RC1

1. **Two-Factor Authentication**
   - Status: Not implemented
   - Risk: Medium (admin accounts at risk)
   - Mitigation: Strong passwords required, session timeout
   - Timeline: Not planned for Phase 3; possible Phase 4

2. **End-to-End Encryption**
   - Status: Not implemented (TLS only)
   - Risk: Low (data in transit encrypted, at rest in MongoDB)
   - Mitigation: MongoDB Atlas encryption at rest
   - Timeline: Not needed for internal use

3. **IP Whitelisting**
   - Status: Not implemented
   - Risk: Low (behind Render's infrastructure)
   - Mitigation: Strong session management
   - Timeline: Possible Phase 4

4. **Audit Log Export**
   - Status: Logs kept in MongoDB
   - Risk: Low (append-only, immutable)
   - Mitigation: Regular backups
   - Timeline: Phase 3B or later

5. **GDPR/Privacy Requests**
   - Status: No automated process
   - Risk: Compliance risk if required
   - Mitigation: Manual processes documented
   - Timeline: Future enhancement if needed

---

## Known Bugs / Minor Issues

### Issue #1: Empty Bill List Display
**Severity:** Low  
**Workaround:** Refresh page  
**Timeline:** Fix in Phase 1

### Issue #2: Error Messages Not Always Specific
**Severity:** Low  
**Workaround:** Check server logs  
**Timeline:** Improve in Phase 1

(Other minor issues will be logged in testing)

---

## Browser Support

**Tested & Working:**
- Chrome 120+
- Firefox 121+
- Safari 17+
- Edge 120+

**Not Tested:**
- IE 11 (not supported)
- Very old mobile browsers

---

## Infrastructure Constraints

### Render Free/Hobby Plan
- Sleep after 15 minutes of inactivity (auto-wakes)
- Limited bandwidth (~100GB/month)
- Suitable for: Internal UAT, testing
- Not suitable for: Production with 100+ concurrent users

### Render Standard Plan (Recommended for Production)
- Always on
- 1GB RAM, 0.5 CPU
- Suitable for: 50-200 concurrent users
- Estimated cost: $7/month for compute + $0.10/GB storage

### MongoDB Atlas Free Tier
- 512MB storage limit
- Suitable for: Testing, staging
- NOT suitable for production (too small)

### MongoDB Atlas Shared Tier (Recommended for Production)
- Unlimited storage (pay per GB)
- Automated backups
- Suitable for: Production
- Estimated cost: $9/month M0 + $0.50/GB for overages

---

## Future Phases Roadmap

### Phase 3A-4: Flat Ledger (Next)
**When:** After RC1 UAT passes  
**Features:**
- Chronological ledger per flat
- Resident bill history
- Statement view

### Phase 3A-5: Manual Payments
**When:** After 3A-4  
**Features:**
- Offline payment recording
- Payment allocation to bills
- Partial payment support

### Phase 3A-6: Webhook Authority
**When:** After 3A-5  
**Features:**
- Stripe webhook drives allocation
- `/success` becomes read-only

### Phase 3A-7 through 3A-9: Completion
**When:** 2-3 months after RC1  
**Features:**
- Receipts, Dashboard, Legacy cutover

### Phase 3B: Expenditure Management
**When:** After Phase 3A-9 complete  
**Features:**
- Expenses, Vendors, AMC, Documents
- Financial reporting

### Phase 4: Future Enhancements
**Potential:**
- 2FA, IP whitelisting, notifications
- Amenity bookings, service requests
- Mobile app, advanced analytics

---

## Workarounds for RC1 Users

### "I need to record offline payments"
**Workaround:** Export bills CSV, track payments externally until Phase 3A-5

### "I need to view payment history"
**Workaround:** Bills page shows amounts; full history in Phase 3A-7

### "I need to track vendor payments"
**Workaround:** External spreadsheet until Phase 3B-1

### "I need to upload contracts"
**Workaround:** Use Google Drive or Dropbox until Phase 3B-5

### "I need receipts for residents"
**Workaround:** Download from Stripe dashboard or email residents until Phase 3A-7

---

## Support & Issue Reporting

### Where to Report Issues
1. **Critical bugs:** Direct to IT support immediately
2. **Feature requests:** Document for Phase planning
3. **Minor UI issues:** Log for Phase 1 polish

### Response Time
- Critical: < 1 hour
- High: < 4 hours
- Medium: < 1 day
- Low: Best effort

---

## Upgrade Path

### From RC1 to Phase 3A-4
- No data migration needed
- Database schema backward-compatible
- Zero downtime upgrade planned

### From Phase 3A-9 (New Bills System Live) Backward
- Cannot downgrade (legacy system will be retired)
- Final cutover is irreversible

---

## Success Criteria for Each Phase

| Phase | Success Criteria |
|-------|-----------------|
| **3A-3** (RC1) | UAT passes, no critical issues, deployable |
| **3A-4** | Ledger accurate, residents see history |
| **3A-5** | Payments allocate correctly, partials work |
| **3A-6** | Webhook 100% reliable, zero duplicates |
| **3A-7** | Receipt generate atomically, register complete |
| **3A-8** | Dashboard KPIs reconcile to registers |
| **3A-9** | Cutover complete, legacy retired safely |

---

## FAQ

### Q: When can we use this in production?
**A:** After RC1 UAT passes and minor issues are fixed (targeted for Phase 1 ~ August 2026).

### Q: Will I lose data if we upgrade?
**A:** No. All upgrades are backward-compatible, with data migrations when needed.

### Q: Can I still use the old payment system?
**A:** Yes, until Phase 3A-9. Old User.lastPayment is read-only during Phase 3A-3.

### Q: What happens to my data if Render goes down?
**A:** Automatic backups to MongoDB Atlas. Recovery time < 1 hour.

### Q: Can residents pay directly without admin?
**A:** Yes, via Stripe (Phase 3A-3). Admin can also record offline payments (Phase 3A-5).

### Q: How do I track money going OUT?
**A:** Not yet. Phase 3B-1 will add Expense tracking.

### Q: Is this GDPR compliant?
**A:** Not formally audited. Privacy controls in place, but formal compliance review needed for production.

---

## Technical Debt (Known Limitations)

1. Legacy `User.lastPayment` field still in use (removing in Phase 3A-9)
2. No transaction support for multi-document writes (acceptable for current scale)
3. No caching layer (acceptable for 27East's 112-unit scale)
4. Stripe webhook optional (both paths work, but webhook cleaner)

---

## End-of-Life Features (Will Be Removed)

**Phase 3A-9 will remove:**
- Direct use of User.lastPayment for dues calculation
- Legacy `/bill` page (will redirect to new Bill system)
- Manual makePayment calculation

**These are not removed in RC1** to maintain backward compatibility during UAT.

---

## Feedback

If you find limitations not listed here, please report them:
- Email: support@27east.local
- Slack: #27east-technical
- Issue tracker: Link TBD

---

**Document Version:** 1.0  
**Last Updated:** 2026-07-25  
**Scope:** RC1 (Phase 3A-3)  
**Next Phase:** 3A-4 (Flat Ledger)
