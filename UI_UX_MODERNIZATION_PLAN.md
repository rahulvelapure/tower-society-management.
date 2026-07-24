# 27East — UI/UX Modernization Plan

27East is a **single-tower, closed, private** residential community app (one building, the existing 27 East Society record). This plan guides an **incremental** redesign from the dated Bootstrap-3 look into a premium, mobile-first product, while preserving the Node/Express/EJS/Mongo/Passport stack and all working functionality/security. No React/Vue/Next.

## Current page inventory & role

| Page (view) | Route | Role | Current problem |
|---|---|---|---|
| `index.ejs` | `/` | public | Marketing "E-Society" landing — wrong for a closed portal |
| `login.ejs` | `/login` | public | Dated Bootstrap 4 card; had signup/register CTAs |
| `signup/register/signupEdit` | `/signup /register /newRequest` | public/pending | **Public account creation — must be closed** |
| `home / homeStandby` | `/home` | all | Basic tiles; not a real dashboard |
| `residents` | `/residents` | resident/admin | Directory + legacy approve panel; plain cards |
| `units / unitForm / unitInitialize` | `/units*` | admin | Flat master — functional, Bootstrap-3 look |
| `bill / editBill` | `/bill /editBill` | resident/admin | Table-heavy, dated |
| `noticeboard / notice` | `/noticeboard /notice` | resident/admin | Plain list |
| `helpdesk / helpdeskAdmin / complaint` | `/helpdesk /complaint` | resident/admin | Basic |
| `contacts / editContacts` | `/contacts /editContacts` | resident/admin | 7 fixed fields |
| `profile / editProfile` | `/profile /editProfile` | all | Table-style profile |

## Target architecture

- **Design system**: `public/css/app.css` — CSS custom-property design tokens (color/space/radius/shadow/type) + components (buttons, inputs, cards, KPI cards, tables, badges, sidebar, topbar, mobile bottom-nav, auth page). Light, dependency-free, mobile-first.
- **Branding**: centralized in `config/brand.js` (name "27East", tagline), injected via `res.locals.brand` — never hardcoded per-file.
- **App shell**: reusable partials `appHead` / `appNav` (role-aware sidebar + topbar + mobile bottom nav, one inline-SVG icon set) / `appFoot`. Auth pages use a separate centered `auth-page` layout.
- **Authorization**: unchanged server-side guards (`ensureAdmin`/`ensureApproved`); nav is role-aware but is **not** the security boundary.

## Migration order (deploy + validate each on Render)

- **Phase A (this milestone)**: close public registration (UI + backend), preserve existing admin, admin-only Member Management + secure activation foundation, canonical-unit member assignment, base design system, modern **Login**, app shell + role-aware nav, modern **Admin Dashboard** (real data). Other module pages keep working on their current views.
- **Phase B**: dashboard polish, shell refinements across the board.
- **Phase C**: Flat Master (visual tower), Member Management polish, Flat 360 foundation, Profile.
- **Phase D**: Bills/Payments, Notices, Complaints, Emergency Contacts.

## Guardrails

Real data only — no fabricated metrics/modules. Hide unimplemented features. Uploads stay off Render's ephemeral disk for permanent storage. No Phase 3 ERP expansion. GitHub feature branch → Render auto-deploy → validate.
