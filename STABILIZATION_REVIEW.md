# 27East — Phase 1/2 Stabilization Review

Audited at commit `40d5d84` (member creation fix); this document ships with the stabilization commit that follows it. Statuses: **WORKING** (code-verified + runtime-validated by you where noted), **PARTIAL**, **SECURITY CONCERN (fixed)**, **NOT IMPLEMENTED**, **LEGACY/DEAD**. I cannot execute the app in this environment — "WORKING" without a runtime note means code-path-verified only.

## 1. Route / feature inventory

### Public / Auth
| Route | Status | Notes |
|---|---|---|
| `GET /` | WORKING | Redirects to `/login` (or `/home` when signed in). No marketing page. |
| `GET/POST /login` | WORKING (runtime-validated: admin login) | Rate-limited (20/15min), blocks `inactive` accounts, friendly errors. |
| `GET/POST /forgot-password` | WORKING | Rate-limited (5/15min), anti-enumeration message, hashed expiring single-use token, dev-only console fallback. |
| `GET/POST /reset-password/:token` | WORKING | Hashed lookup + expiry + single-use + min-8 password + session destroy. |
| `GET/POST /activate/:token` | WORKING (runtime path: pending your test) | Hashed, 7-day expiry, single-use, sets `accountStatus: active`. |
| `GET /logout` | WORKING | Ends session → `/login`. |
| `/register`, `/signup`, `/newRequest` | **DISABLED (by design)** | GETs redirect; POSTs return 403 and create nothing. Verified no other code path calls `User.register` or creates accounts outside admin Member Management. |
| `GET /health` | WORKING (runtime-validated) | No DB touch. |

### Admin
| Feature | Status | Notes |
|---|---|---|
| Dashboard `/home` | WORKING | All KPIs real; outstanding dues now via shared `lib/billing.js`. |
| Flats tower `/units` | WORKING | Canonical 28×4 grid + amenity floors 29/30; search + occupancy pills; real statuses only. |
| Flat 360 `/units/:id` | WORKING | Members, occupancy records, financials via shared helper, open complaints. |
| Add/edit unit, Initialize Flat Master | WORKING | Idempotent init (112, floors 1–28 schema-enforced, unique index). |
| Members list/add/edit/status/resend | WORKING (runtime-validated: add member) | Full validation, occupancy-conflict guard, hashed invite tokens. |
| Notices create | WORKING | Edit/delete notices: **NOT IMPLEMENTED** (append-only board). |
| Bills view/edit charges | WORKING | See §3 billing findings (fixed). |
| Payments module | **PARTIAL** | Only `lastPayment` per member is stored — there is no payment-transaction history collection. A dedicated Payments screen is intentionally absent (no fake module). |
| Complaints queue/close | WORKING | Close guarded against tampered indexes (fixed this round). |
| Emergency contacts edit + custom contacts | WORKING | Legacy 7 + admin-defined list. |
| Society settings | **PARTIAL** | Society address editable via admin's own Edit Profile; no dedicated settings screen yet. |

### Resident
| Feature | Status | Notes |
|---|---|---|
| Home | WORKING | Own flat, notices, quick links. No admin data. |
| Own bill + pay | WORKING | See §3; amount is server-computed only. |
| Own payment receipt | WORKING | Last receipt only (see Payments PARTIAL above). |
| Complaints raise/track | WORKING | Own complaints only (stored on own user doc). |
| Notices, Emergency (tap-to-call), Residents directory | WORKING | Directory intentionally shows name/flat/phone to approved members of this private community — accepted scope; revisit if privacy expectations change. |
| Profile view/edit | WORKING | Own record only (keyed by session id). Flat relabeling blocked (fixed this round). |

### Legacy/Dead
None — dead views/partials/assets were deleted in the theme-migration commit. `date/date.js` remains used for display strings and notices/complaints timestamps.

## 2. Authorization & isolation audit (result)

- Every admin route (`/members*`, `/units*`, `/notice` POST, `/editBill`, `/editContacts`, `/closeTicket`, `/approveResident`) carries `ensureAdmin` server-side. Nav visibility is cosmetic only.
- Resident isolation: bills/profile/complaints are all keyed by `req.user.id` from the session — no user-supplied id is accepted on any resident route, so URL/ID tampering cannot reach another member's data. Flat 360 (cross-member data) is admin-only.
- CSRF: all POSTs verified (session-token check, 403 on failure); the single fetch() call (checkout) sends the header.
- **Fixed this round:** deactivated accounts now lose access *immediately* — every auth guard ends the session of an `inactive` account instead of letting it ride until cookie expiry (up to 24h before).
- **Fixed this round:** `POST /editProfile` was `ensureAuthenticated` (now `ensureApproved`) and allowed any resident to rewrite their own `flatNumber` free-text, contradicting the canonical Unit master. Non-admin flat changes are now ignored server-side; society-address writes additionally require `isAdmin` (was already query-guarded, now belt-and-braces).

## 3. Billing & Stripe findings (HIGH PRIORITY — fixed)

1. **Wrong payment redirect domain (critical bug):** `checkout-session` had `success_url`/`cancel_url` hardcoded to the *old* app (`esociety-fdbd.onrender.com`). On the 27East deployment, a completed payment would have redirected the payer to the old site and **never recorded the payment here**. Now derived from the actual request host.
2. **Unverified payment recording (vulnerability):** `GET /success` recorded a payment for *any* retrievable session id — including sessions that were created but **never paid**, which would wipe the member's dues for free. Now requires Stripe's `payment_status === 'paid'`.
3. **Session ownership:** a session id could be replayed by a different signed-in user to credit their own account. Sessions are now created with `client_reference_id = user id` and verified on `/success`.
4. **Robustness:** `/checkout-session` had no try/catch (unhandled rejection on Stripe errors) and charged `makePayment * 100` even when undefined (NaN). Now guarded (400 "Nothing payable"), `ensureApproved`, amount rounded.
5. **One formula everywhere:** the dues calculation existed in 4 copies (bill route, bill-page EJS, dashboard, Flat 360). All now call `lib/billing.js` — single authoritative implementation; formula itself **unchanged**, with its legacy quirks documented in that file (month-boundary counting ignores day-of-month; joining month counts as due; paying in the current month yields a one-month credit).
6. Secret handling verified: `SECRET_KEY` server-side only; only the Stripe *publishable* key appears in HTML (intentional); amount cannot be set by the client anywhere.
7. **Remaining known limitation (documented, not fixed here):** payment confirmation is redirect-based, not webhook-based. With `payment_status` verification this is sound for staging, but a production-grade setup should add a Stripe webhook with signature verification (Phase 3 scope). There is also no payment *history* (only `lastPayment`) and no partial-payment support yet — deliberately deferred, not faked.

## 4. Notices / XSS
All user content renders through EJS `<%= %>` (HTML-escaped) app-wide — notices, complaints, names, contacts. `<%- %>` is used only for trusted internal partials/icons. Script injection via notice/complaint text is inert. Long text wraps (`white-space: pre-line` on notice body). Empty board shows a proper empty state.

## 5. Member lifecycle & status model
Single clear state field `accountStatus`: `invited` → `active` ↔ `inactive`, surfaced as badges in Member Management; `validation` remains only for legacy approval flow compatibility. Edge cases verified in code: duplicate email (pre-check + 11000 race), invalid phone/fields/unit/ObjectId (friendly), owner/tenant conflict guard, multi-member flats supported, unit moves re-sync occupancy, resend invalidates the previous token (overwrite), reused/expired activation links rejected, deactivated members blocked at login *and* mid-session.

## 6. Flat master integrity
Schema constrains floors to 1–28; canonical list is the only bulk source (idempotent init, unique `society+floor+flatNumber` index); member forms use Unit ObjectIds — floors 29/30 are unassignable by construction. No auto-init anywhere.

## 7. Runtime validation status
`PENDING` overall — your on-Render checklist remains `PHASE_1_2_VALIDATION.md`. Runtime-confirmed so far by you: boot, Mongo connection, `/health`, admin login, dashboard, flat-master init, member creation. Priority next tests: activation link end-to-end, resident login/isolation, Stripe test-mode payment (now that the redirect-domain bug is fixed, this could not have worked before), deactivate-while-logged-in.
