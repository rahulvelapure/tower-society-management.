const mongoose = require('mongoose');

// CONFIRMED, AUTHORITATIVE tower structure (see ARCHITECTURE_NOTES.md):
//   Floors 1-28 : residential, exactly 4 flats per floor  -> 112 residential flats
//   Floor 29    : Gym + Party Hall  (NOT residential)
//   Floor 30    : Terrace           (NOT residential)
// A `Unit` in this model represents a RESIDENTIAL FLAT only, so its floor is
// constrained to 1-28. Floors 29/30 are amenities/common areas and must never be
// modelled as residential Units - they belong to a future Facility/Amenity model.
const RESIDENTIAL_FLOOR_MIN = 1;
const RESIDENTIAL_FLOOR_MAX = 28;
const FLATS_PER_FLOOR = 4;
const TOTAL_RESIDENTIAL_FLATS = (RESIDENTIAL_FLOOR_MAX - RESIDENTIAL_FLOOR_MIN + 1) * FLATS_PER_FLOOR; // 112

// The canonical list of every valid residential flat number, e.g.
// 101,102,103,104,201,...,2801,2802,2803,2804. This is the single source of
// truth for "which flats physically exist" and is used by both the flat-master
// initializer (routes/units.js) and the resident migration (scripts/migrateUnits.js),
// so the two can never disagree about the building's layout.
function buildCanonicalFlats() {
    const flats = [];
    for (let floor = RESIDENTIAL_FLOOR_MIN; floor <= RESIDENTIAL_FLOOR_MAX; floor++) {
        for (let unit = 1; unit <= FLATS_PER_FLOOR; unit++) {
            flats.push({ floor, flatNumber: `${floor}${String(unit).padStart(2, '0')}` });
        }
    }
    return flats;
}

const CANONICAL_FLATS = buildCanonicalFlats();
const CANONICAL_FLAT_NUMBERS = new Set(CANONICAL_FLATS.map(f => f.flatNumber));

const unitSchema = mongoose.Schema(
    {
        society: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'society',
            required: true
        },
        floor: {
            type: Number,
            required: true,
            min: RESIDENTIAL_FLOOR_MIN,
            max: RESIDENTIAL_FLOOR_MAX
        },
        flatNumber: {
            type: String,
            required: true
        },
        unitType: {
            type: String,
            enum: ['1BHK', '2BHK', '3BHK', '4BHK', 'shop', 'office', 'other'],
            default: 'other'
        },
        areaSqft: Number,
        occupancyStatus: {
            type: String,
            enum: ['owner-occupied', 'tenant-occupied', 'vacant'],
            default: 'vacant'
        },
        // SOURCE OF TRUTH: once a resident has a registered User account, `User.unit`
        // (set in routes/units.js and scripts/migrateUnits.js) is authoritative for
        // "who lives here." `owner`/`tenant` below are for contact info BEFORE that
        // person has an account (e.g. an owner who hasn't signed up yet) - they are
        // best-effort/denormalized, not a second source of truth. Whenever an owner/
        // tenant email here matches a registered User in the same society, routes/units.js
        // links `owner.user`/`tenant.user` so the two don't silently drift apart.
        owner: {
            user: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            name: String,
            phone: String,
            email: String
        },
        tenant: {
            user: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            name: String,
            phone: String,
            email: String,
            leaseStart: Date,
            leaseEnd: Date
        },
        occupants: [
            {
                name: String,
                relation: String
            }
        ],
        moveInDate: Date,
        moveOutDate: Date
    },
    {
        timestamps: true,
    }
)

unitSchema.index({ society: 1, floor: 1, flatNumber: 1 }, { unique: true });

exports.Unit = mongoose.model("unit", unitSchema);
exports.RESIDENTIAL_FLOOR_MIN = RESIDENTIAL_FLOOR_MIN;
exports.RESIDENTIAL_FLOOR_MAX = RESIDENTIAL_FLOOR_MAX;
exports.FLATS_PER_FLOOR = FLATS_PER_FLOOR;
exports.TOTAL_RESIDENTIAL_FLATS = TOTAL_RESIDENTIAL_FLATS;
exports.CANONICAL_FLATS = CANONICAL_FLATS;
exports.CANONICAL_FLAT_NUMBERS = CANONICAL_FLAT_NUMBERS;
