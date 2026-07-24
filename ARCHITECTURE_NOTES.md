# Architecture Notes: Society/Unit references

This app manages **one residential tower, one society, one management committee**. This note exists because Phase 2 added a `society` ObjectId field to `User` and `Unit`, and it needs to be on record that this is *not* the start of multi-tenant architecture.

## Confirmed physical tower structure (authoritative)

- **Floors 1–28:** residential, **exactly 4 flats per floor** → **112 residential flats**
- **Floor 29:** Gym + Party Hall (not residential)
- **Floor 30:** Terrace (not residential)

A `Unit` models a **residential flat only**, so `models/unitModel.js` constrains `floor` to **1–28** and exposes the canonical list of all 112 flat numbers (`101…104, 201…204, …, 2801…2804`) as the single source of truth for the building layout. Floors 29 and 30 are amenities/common areas and are **not** modelled as Units — they belong to a future Facility/Amenity model. The admin cannot generate arbitrary structures (5 flats/floor, residential flats on 29/30, etc.); the flat master is initialized from this fixed structure via `/units/initialize`, not a free-form generator.

## What the `Society` model is

`models/societyModel.js` is a **singleton configuration record** — in practice there will only ever be one `Society` document in this deployment. It holds:
- Tower/society name and address
- Admin (committee) username
- Noticeboard entries
- Emergency contacts configuration
- Maintenance bill configuration

This was already the shape of the original app; nothing new was added to make it "multi-tenant." There is no society-switching UI, no concept of a user belonging to more than one society, and no cross-society admin view.

## What the `society` ObjectId ref on `User`/`Unit` is actually for

Before Phase 2, `User.societyName` was a free-text string used to `find({ societyName: ... })` everywhere. That still works and is **unchanged** — every existing query keeps using `societyName`. The new `user.society` / `unit.society` ObjectId fields exist for exactly one reason:

- **`Unit` needs a real foreign key**, not a string match, so that `unit_collection.Unit.find({ society: societyId })` is a proper indexed lookup rather than a string comparison, and so the compound uniqueness index (`society + floor + flatNumber` — see `models/unitModel.js`) actually enforces "no two identical flat numbers on the same floor" correctly instead of relying on string equality of a name that could theoretically change.

That's it. It is **not** used for:
- Multi-society membership (a `User` still belongs to exactly one society, same as before)
- Society switching (no UI, no session concept of "current society")
- Cross-society administration (`ensureAdmin` still just checks `isAdmin` within the one society this deployment serves)

## What was intentionally *not* built

Per your direction, the following were **not** introduced and should not be added without an explicit decision to actually go multi-tenant:
- A wing/building hierarchy above `Unit` (this tower has no wings — floor + flat number is sufficient)
- Tenant isolation logic (row-level security by society) — unnecessary when only one society will ever exist in this database
- A "current society" concept on the session/user beyond the single `societyName`/`society` fields already on `User`

## Why `societyName` (string) was kept alongside `society` (ObjectId)

Removing `societyName` now would require rewriting every existing query in `routes/*.js` in the same change as everything else in this pass, with no functional benefit for a single-tower app. It's dual-written (both fields always kept in sync on write) so no data is at risk, and it can be cleaned up later as a pure refactor if desired — that is not being done now to avoid unnecessary churn on a codebase that isn't validated yet.

## Bottom line

The `society` ref is a **foreign-key fix for `Unit`**, not the beginning of multi-tenant architecture. If this app is ever actually used for multiple towers/societies, that would be a deliberate, separately-scoped architectural decision — not something that has silently crept in here.
