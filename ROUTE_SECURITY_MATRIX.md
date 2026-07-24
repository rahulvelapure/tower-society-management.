# Route Security Matrix

Generated from the actual guards in `routes/*.js` and `server.js` after the Phase 1/2 stabilization pass. "CSRF Protected" applies to state-changing (POST/PUT/PATCH/DELETE) routes only - it's enforced globally by `middleware/csrf.js` (`verifyCsrfToken`, wired in `server.js`), not per-route, so every POST below is protected the same way as long as its form carries the `_csrf` hidden field (verified in this pass - see `PHASE_1_2_VALIDATION.md`).

"Input Validated" here means server-side validation beyond "field exists" (Mongoose schema `required`/`enum`/`min`/`max`, or explicit checks in the handler). Where it says "No (existing gap)" that was already true before this pass and is called out for awareness, not treated as a new regression.

## `server.js`

| Method | Route | Auth Required | Approved Required | Admin Required | Role/Permission | Ownership Check | CSRF Protected | Input Validated |
|---|---|---|---|---|---|---|---|---|
| GET | `/` | No | N/A | N/A | public | N/A | N/A (GET) | N/A |
| GET | `/health` | No | N/A | N/A | public | N/A | N/A (GET) | N/A |

## `routes/auth.js`

| Method | Route | Auth Required | Approved Required | Admin Required | Role/Permission | Ownership Check | CSRF Protected | Input Validated |
|---|---|---|---|---|---|---|---|---|
| GET | `/login` | No | N/A | N/A | public | N/A | N/A (GET) | N/A |
| POST | `/login` | No | N/A | N/A | public, rate-limited (20/15min/IP) | N/A | Yes | passport-local-mongoose (credential check) |
| GET | `/loginFailure` | No | N/A | N/A | public | N/A | N/A (GET) | N/A |
| GET | `/logout` | No* | N/A | N/A | public | N/A | N/A (GET) | N/A |
| GET/POST | `/signup` | No | N/A | N/A | **disabled** - GET redirects to `/login`, POST returns 403 | N/A | 403 before any write | Closed private system: no public self-registration |
| GET/POST | `/register` | No | N/A | N/A | **disabled** - GET redirects to `/login`, POST returns 403, creates nothing | N/A | 403 before any write | No additional society can be created, even by direct POST |
| GET/POST | `/newRequest` | No | N/A | N/A | **disabled** - GET redirects to `/home`, POST returns 403 | N/A | 403 before any write | Self sign-up removed |
| GET | `/activate/:token` | No | N/A | N/A | holder of a valid, unexpired activation token | N/A | N/A (GET) | Token existence + expiry checked (hashed lookup) |
| POST | `/activate/:token` | No | N/A | N/A | holder of a valid, unexpired, single-use activation token | N/A | Yes | Token hashed + expiry + single-use; min 8-char password; sets `accountStatus: active` |
| GET | `/forgot-password` | No | N/A | N/A | public, rate-limited on POST | N/A | N/A (GET) | N/A |
| POST | `/forgot-password` | No | N/A | N/A | public, rate-limited (5/15min/IP) | N/A | Yes | Generic response regardless of match (anti-enumeration) |
| GET | `/reset-password/:token` | No | N/A | N/A | public - requires valid, unexpired hashed token | N/A | N/A (GET) | Token existence + expiry checked |
| POST | `/reset-password/:token` | No | N/A | N/A | public - requires valid, unexpired hashed token, single-use | N/A | Yes | Token existence + expiry + min 8-char password |

\* `/logout` has no auth guard because calling it while already logged out is a harmless no-op (`req.logout` on an unauthenticated request just redirects home).

## `routes/resident.js`

| Method | Route | Auth Required | Approved Required | Admin Required | Role/Permission | Ownership Check | CSRF Protected | Input Validated |
|---|---|---|---|---|---|---|---|---|
| GET | `/home` | Yes | No (branches on status) | No | any authenticated user | N/A | N/A (GET) | N/A |
| GET | `/residents` | Yes | Yes | No | any approved resident | N/A | N/A (GET) | N/A |
| POST | `/approveResident` | Yes | N/A | **Yes** | `manage_members` | N/A (admin acts on other users by design) | Yes | Yes - `validate_state` restricted to `approved`/`declined` (fixed in this pass) |
| GET | `/profile` | Yes | Yes | No | own profile | Own account (`req.user.id`) | N/A (GET) | N/A |
| GET | `/editProfile` | Yes | Yes | No | own profile | Own account (`req.user.id`) | N/A (GET) | N/A |
| POST | `/editProfile` | Yes | No (matches original app behavior) | No | own profile | Own account (`req.user.id` in query) | Yes | No field-level validation (existing gap) |

## `routes/notice.js`

| Method | Route | Auth Required | Approved Required | Admin Required | Role/Permission | Ownership Check | CSRF Protected | Input Validated |
|---|---|---|---|---|---|---|---|---|
| GET | `/noticeboard` | Yes | Yes | No | any approved resident | N/A | N/A (GET) | N/A |
| GET | `/notice` | Yes | N/A | **Yes** | `manage_notices` | N/A | N/A (GET) | N/A |
| POST | `/notice` | Yes | N/A | **Yes** | `manage_notices` | N/A | Yes | No field-level validation (existing gap) |

## `routes/bill.js`

| Method | Route | Auth Required | Approved Required | Admin Required | Role/Permission | Ownership Check | CSRF Protected | Input Validated |
|---|---|---|---|---|---|---|---|---|
| GET | `/bill` | Yes | Yes | No | own bill (admin also sees society-wide summary in the same view) | Own account for bill calc | N/A (GET) | N/A |
| GET | `/editBill` | Yes | N/A | **Yes** | `manage_billing` | N/A | N/A (GET) | N/A |
| POST | `/editBill` | Yes | N/A | **Yes** | `manage_billing` | N/A | Yes | No numeric validation on charge fields (existing gap) |
| POST | `/checkout-session` | Yes | No (relies on `req.user.makePayment`, only ever set by `/bill`) | No | own payment only | Own account (`req.user`) | Yes | Amount is server-computed (`req.user.makePayment`), not client-supplied - not user-controllable |
| GET | `/success` | Yes | No | No | own payment only | Own account (`req.user.id`) | N/A (GET) | Stripe session/customer retrieval validates the payment server-side |

No Stripe **webhook** endpoint exists in this app - payment confirmation is a browser redirect to `GET /success?session_id=...` that re-fetches the session from Stripe's API server-side, not a server-to-server webhook callback. There is therefore nothing that needs signature-based verification instead of session auth/CSRF; this was confirmed while implementing CSRF so it wouldn't be broken by a change that didn't need to happen.

## `routes/helpdesk.js`

| Method | Route | Auth Required | Approved Required | Admin Required | Role/Permission | Ownership Check | CSRF Protected | Input Validated |
|---|---|---|---|---|---|---|---|---|
| GET | `/helpdesk` | Yes | Yes | No (branches admin/resident view) | own tickets, or all tickets if admin | Implicit (own `req.user.complaints` for residents) | N/A (GET) | N/A |
| GET | `/complaint` | Yes | Yes | No | any approved resident | N/A | N/A (GET) | N/A |
| POST | `/complaint` | Yes | Yes | No | own complaint only | Own account (`req.user.id`) | Yes | No field-level validation (existing gap) |
| POST | `/closeTicket` | Yes | N/A | **Yes** | `manage_complaints` | N/A (admin acts on other users' tickets by design) | Yes | `ticket_index` not bounds-checked against the target array length (existing gap - see note below) |

Note on `/closeTicket`: `ticket_index` comes from the submitted form field name and is used directly to index into `foundUser.complaints[]`. It's only reachable by an admin (not attacker-controlled in the sense of arbitrary users), but an out-of-range index would currently throw inside the `.then()` and be caught by the generic error handler (500), not corrupt data. Flagged as a robustness gap, not a security hole.

## `routes/contacts.js`

| Method | Route | Auth Required | Approved Required | Admin Required | Role/Permission | Ownership Check | CSRF Protected | Input Validated |
|---|---|---|---|---|---|---|---|---|
| GET | `/contacts` | Yes | Yes | No | any approved resident | N/A | N/A (GET) | N/A |
| GET | `/editContacts` | Yes | N/A | **Yes** | `manage_contacts` | N/A | N/A (GET) | N/A |
| POST | `/editContacts` | Yes | N/A | **Yes** | `manage_contacts` | N/A | Yes | No field-level validation (existing gap) |

## `routes/units.js`

| Method | Route | Auth Required | Approved Required | Admin Required | Role/Permission | Ownership Check | CSRF Protected | Input Validated |
|---|---|---|---|---|---|---|---|---|
| GET | `/units` | Yes | N/A | **Yes** | `manage_units` | N/A | N/A (GET) | N/A |
| GET | `/units/new` | Yes | N/A | **Yes** | `manage_units` | N/A | N/A (GET) | N/A |
| POST | `/units` | Yes | N/A | **Yes** | `manage_units` | N/A | Yes | Mongoose schema (`floor` 1-28, `unitType` enum, unique `society+floor+flatNumber`) - duplicate/invalid input re-renders the form with an error instead of a raw 500 |
| GET | `/units/initialize` | Yes | N/A | **Yes** | `manage_units` | N/A | N/A (GET) | Shows the confirmed tower config + safety preview; writes nothing (GET) |
| POST | `/units/initialize` | Yes | N/A | **Yes** | `manage_units` | N/A | Yes | No user-supplied structure at all - creates the fixed canonical 112 flats (floors 1-28, 4/floor), idempotent, never overwrites existing units. Requires POST + CSRF + JS confirm |
| GET | `/units/:id/edit` | Yes | N/A | **Yes** | `manage_units` | N/A | N/A (GET) | 404 if the id doesn't resolve to a document |
| POST | `/units/:id` | Yes | N/A | **Yes** | `manage_units` | N/A | Yes | Same schema validation as create, via `runValidators: true` |

No DELETE route exists for `Unit` in this pass, so "deleting a unit with linked residents" is currently not reachable at all - noted for whenever delete functionality is actually added, not treated as a gap today.

## `routes/members.js` (admin-only member management)

| Method | Route | Auth Required | Approved Required | Admin Required | Role/Permission | Ownership Check | CSRF Protected | Input Validated |
|---|---|---|---|---|---|---|---|---|
| GET | `/members` | Yes | N/A | **Yes** | `manage_members` | N/A | N/A (GET) | Search/filter inputs sanitized (regex-escaped) |
| GET | `/members/new` | Yes | N/A | **Yes** | `manage_members` | N/A | N/A (GET) | N/A |
| POST | `/members` | Yes | N/A | **Yes** | `manage_members` | N/A | Yes | Email format, unique email, canonical `Unit` ownership, occupancy enum; creates `invited` account (no password), issues hashed activation token |
| GET | `/members/:id/edit` | Yes | N/A | **Yes** | `manage_members` | N/A | N/A (GET) | 404 if not found |
| POST | `/members/:id` | Yes | N/A | **Yes** | `manage_members` | N/A | Yes | Canonical `Unit` ownership + occupancy enum |
| POST | `/members/:id/status` | Yes | N/A | **Yes** | `manage_members` | Admin can't deactivate self | Yes | action ∈ {activate, deactivate}; activate only promotes to `active` if a password exists |
| POST | `/members/:id/resend` | Yes | N/A | **Yes** | `manage_members` | N/A | Yes | Regenerates hashed, expiring activation token |

Members are created only by an administrator — there is **no** public account creation anywhere in the app. Activation links are shown to the admin (one-time, in-UI) and emailed when SMTP is configured; the raw token is never written to logs.

## Cross-cutting notes

- **CSRF**: implemented in this pass via `middleware/csrf.js` (session-bound token, double-submit style - not the deprecated `csurf` package). Every form listed above as "Yes" was verified to carry the `_csrf` hidden field; the one non-form state-changing call (`/checkout-session`, invoked via `fetch()` in `bill.ejs`) sends the token as a `CSRF-Token` header instead.
- **Session security**: `httpOnly` + `sameSite: lax` + `secure` in production (`server.js`), MongoDB-backed session store, `app.set('trust proxy', 1)` added in this pass so `secure` cookies and `req.protocol` work correctly behind Render's proxy. See `PHASE_1_2_VALIDATION.md` for what wasn't changed (no full multi-device session invalidation on password reset - documented as a known limitation, only the current session is destroyed).
- **Rate limiting**: added to `/login` and `/forgot-password` only, since those are the brute-force/enumeration-relevant endpoints. Not applied elsewhere.
- **"Existing gap" items** (mostly missing field-level input validation on admin forms) predate this pass and were not introduced by it. They're listed here for completeness/awareness, not as new findings, and are reasonable candidates for a future hardening pass rather than blocking Phase 1/2 validation.
