# Phase 1 + 2 Validation Checklist

This is a manual regression checklist. Nothing in Phase 1 (Foundation) or Phase 2 (Flat/Resident Management) should be considered VALIDATED until every item below has actually been run against a live app + database. See `FOUNDATION_PROGRESS.md` for current status.

**Test against a development/test database. Do not run the real migration against production until the dry-run output has been reviewed and this checklist has passed on dev/test.**

---

## 0. Before you start: back up

Even though the migration is additive-only (see rollback section in `scripts/migrateUnits.js`), take a backup first:

```powershell
mongodump --uri "<your MONGO_URI>" --out .\backup-before-migration
```

## 1. Authentication

- [ ] Register a new society (admin) - `/register`
- [ ] Log out, log back in as that admin
- [ ] Sign up a second account (resident) against that society - `/signup`
- [ ] Log out, log back in as the resident
- [ ] Attempt login with wrong password - see `/loginFailure` with the correct message
- [ ] Forgot password: submit `/forgot-password` for the resident's email - confirm the generic message appears regardless of whether you also try a non-existent email
- [ ] Check console output for the reset link (no SMTP configured = dev-mode console log) - or check your inbox if `SMTP_*` is configured
- [ ] Follow the reset link, set a new password (8+ chars) - confirm redirect to `/login` and the new password works
- [ ] Try to reuse the same reset link a second time - confirm it's now rejected ("invalid or has expired")
- [ ] Manually verify an expired token is rejected (either wait out the 1-hour window or temporarily edit `passwordResetExpires` in the DB for a test user)
- [ ] Submit `/forgot-password` 6 times quickly - confirm the 6th attempt is rate-limited
- [ ] Submit `/login` with bad credentials 21 times quickly - confirm the 21st attempt is rate-limited

## 2. Resident Approval

- [ ] New resident registration lands in `applied` status
- [ ] Pending resident visiting `/residents`, `/bill`, `/helpdesk`, `/contacts`, `/noticeboard` gets redirected to `/login` (not approved yet)
- [ ] Admin sees the pending resident in the "Approve New Residents" panel on `/residents`
- [ ] Admin approves - resident can now log in and reach all member pages
- [ ] Admin declines a different pending resident - that account sees the "declined" homeStandby message and can edit their request via `/newRequest`
- [ ] A non-admin resident cannot reach `/residents`'s approve action - POST `/approveResident` as a non-admin should fail (this was a real bug found and fixed in this pass - explicitly re-test it)

## 3. Resident Directory

- [ ] `/residents` loads and lists all approved residents plus pending ones (admin view)
- [ ] Flat numbers display correctly (legacy free-text field, unaffected by Phase 2)
- [ ] For residents linked to a `Unit` (post-migration), the floor/unit type shows next to the flat number
- [ ] For residents *not yet* linked to a `Unit`, the page still renders fine with just the flat number (no crash)

## 4. Units - Initialize Flat Master (Phase 2)

- [ ] Admin can view `/units`
- [ ] Non-admin visiting `/units` is redirected to `/login`
- [ ] Open "Initialize Flat Master" (`/units/initialize`) - confirm it shows the **confirmed** tower config (Residential 1–28, 4/floor, 112 total; Floor 29 Gym+Party Hall; Floor 30 Terrace) with no editable floor-range/flats-per-floor inputs
- [ ] Confirm you cannot reach initialization via a plain GET write - the actual create only happens on the POST with confirmation
- [ ] Click "Initialize 112 Flats" and confirm - report should read **Expected: 112, Created: 112, Already existing: 0, Errors: 0**
- [ ] Run initialization again - report should read **Expected: 112, Created: 0, Already existing: 112, Errors: 0** (idempotent, nothing overwritten)
- [ ] Verify in the DB that exactly 112 units exist, flat numbers 101–104 … 2801–2804, and **no** 29xx/30xx units
- [ ] Add a unit manually via "+ Add unit" - floor (1–28), flat number, type, area, owner/tenant info
- [ ] Edit that unit - changes persist; edit a unit's owner email to a registered resident's email and confirm `owner.user` gets linked
- [ ] Try creating a duplicate (same floor + flat number) - confirm a friendly error, not a 500
- [ ] Try an invalid floor (0, 29, 31) - confirm a friendly "must be between 1 and 28" error, not a raw stack trace
- [ ] Existing residents (created before Phase 2) still log in and use the app normally with no `Unit` linked yet

## 5. Resident Migration (separate from initialization; dry-run first, always)

**Initialize the flat master (section 4) BEFORE running this** - migration links residents to already-existing canonical flats and will not create any.

```powershell
node scripts/migrateUnits.js --dry-run
```

- [ ] Confirm the summary counts look sane (users scanned, users linked, society refs backfilled, etc.)
- [ ] Review `Unmatched`, `Invalid`, and `Conflicts` output - these need manual review, not blind acceptance
- [ ] Confirm a legacy value like `2901`, `3001`, `105`, `ABC`, or empty is reported under Unmatched/Invalid and does **not** create or link a unit
- [ ] Confirm a legacy value like ` 101 ` or `Flat 101` normalizes and links to canonical flat 101
- [ ] Confirm the database was **not** modified (re-run the dry-run - counts should be identical)

Only after reviewing the dry-run output:

```powershell
node scripts/migrateUnits.js
```

- [ ] Confirm the "applied" summary matches what the dry-run predicted
- [ ] Spot-check a few users in the DB - `flatNumber`/`societyName` unchanged, `society`/`unit` now populated
- [ ] Confirm the Unit count is still exactly 112 (migration created nothing)
- [ ] Re-run the migration a second time - confirm it's a no-op (idempotent) for already-linked users

If anything looks wrong, use the rollback commands documented at the top of `scripts/migrateUnits.js`.

## 6. Notices

- [ ] Any approved resident can view `/noticeboard`
- [ ] Admin can post a new notice via `/notice`
- [ ] A non-admin cannot reach `/notice` (GET or POST) - redirected to `/login`

## 7. Billing (must still work exactly as before Phase 3 starts)

- [ ] `/bill` loads and shows the configured maintenance charges
- [ ] Maintenance amount calculates correctly for a brand-new resident (first month due)
- [ ] Maintenance amount calculates correctly for a resident with an existing `lastPayment` (pending dues math unchanged)
- [ ] Admin can edit bill charges via `/editBill`
- [ ] A non-admin cannot reach `/editBill`
- [ ] Existing payment history (`lastPayment`/receipt) still displays correctly after the router split

## 8. Stripe (test mode only - do not use live keys/cards)

- [ ] `/bill` "Pay Bill" button initiates a Stripe **test-mode** checkout session
- [ ] Confirm the charged amount matches the server-calculated `totalAmount`, not anything client-editable
- [ ] Complete a successful test payment (Stripe test card `4242 4242 4242 4242`) - confirm redirect to `/success` and a receipt renders
- [ ] Attempt a payment with a Stripe test card that's designed to fail (e.g. `4000 0000 0000 0002`) - confirm graceful failure back to `/bill`, no server error
- [ ] Reload `/success?session_id=...` a second time with the same session id (simulating a duplicate callback) - confirm it doesn't corrupt `lastPayment` state in a harmful way

## 9. Complaints

- [ ] Resident can create a complaint via `/complaint`
- [ ] Resident can view their own complaints on `/helpdesk`
- [ ] Admin sees all society complaints on `/helpdesk` (admin view)
- [ ] Admin can close a ticket via `/closeTicket`
- [ ] A non-admin cannot reach `/closeTicket`
- [ ] A pending (not-yet-approved) resident cannot POST to `/complaint` (fixed in this pass - explicitly re-test it)

## 10. Emergency Contacts

- [ ] Any approved resident can view `/contacts`
- [ ] Admin can edit contacts via `/editContacts`
- [ ] A non-admin cannot reach `/editContacts`

## 11. Profiles

- [ ] Resident can edit their own profile via `/editProfile`
- [ ] Resident cannot edit another resident's profile (the route only ever updates `req.user.id`, not an arbitrary id - confirm there's no id parameter that can be tampered with)
- [ ] Admin editing their profile with an address also updates the society's address; a non-admin's profile edit does not touch the society record

## 12. CSRF

- [ ] Open browser dev tools, submit any of the forms above, confirm a `_csrf` hidden field (or `CSRF-Token` header for the Stripe checkout button) is present in the request
- [ ] Manually strip/alter the `_csrf` value in a form submission (e.g. via dev tools) and confirm the server responds `403`, not a silent success

## 13. Session/Proxy behavior (only fully testable once actually deployed to Render)

- [ ] In production (`NODE_ENV=production`), confirm the session cookie has `Secure` set (check dev tools > Application > Cookies)
- [ ] Confirm login persists across a page reload and a new browser tab (same browser)
- [ ] Confirm logout actually destroys the session (session cookie no longer authenticates after logout)

---

## Known, accepted limitations (not blocking Phase 1/2 sign-off)

- Password reset destroys the *current* session only, not every active session for that user on other devices/browsers. Full multi-device session invalidation would require enumerating the Mongo session store by user id, which is a larger change deferred for now.
- Several admin forms (`/editBill`, `/editContacts`, `/notice`, `/newRequest`, `/editProfile`, `/signup`, `/register`) still lack field-level input validation beyond Mongoose's `required`. Tracked in `ROUTE_SECURITY_MATRIX.md` as "existing gap," not introduced by this pass.
- File uploads (`config/upload.js`) are not wired into any route yet - nothing to test here until the Complaints/Notices phases actually add attachment UI.
