const mongoose = require('mongoose');
const passportLocalMongoose = require('passport-local-mongoose');
const passport = require('passport');

const userSchema = new mongoose.Schema (
	{
		validation: {
			type: String,
			required: true,
			default: 'applied'
		},
		// AUTHORITATIVE role. 'superadmin' = protected system owner (exactly one
		// initially - the pre-existing administrator account, assigned by
		// scripts/migrateRoles.js, never by email matching); 'admin' = individual
		// named operational administrators; 'member' = resident.
		role: {
			type: String,
			enum: ['superadmin', 'admin', 'member']
			// intentionally no default: legacy docs without a role are resolved
			// by lib/roles.js effectiveRole() until the migration script runs
		},
		// LEGACY compatibility flag, kept synchronized from `role` by the
		// pre-save hook below. Views and older checks read this; middleware
		// authorization uses `role` (via lib/roles.js). Do not set directly
		// when `role` is present.
		isAdmin: {
			type: Boolean,
			required: true,
			default: false
		},
		societyName: {
			type: String,
			required: true
		},
		society: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'society'
		},
		flatNumber: {
			type: String,
			required: true
		},
		unit: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'unit'
		},
		firstName: {
			type: String,
			required: true
		},
		lastName: {
			type: String,
			required: true
		},
		// String, not Number: real phone numbers carry +country codes, spaces,
		// hyphens and leading zeros, none of which survive a Number cast. (A
		// Number type here made every formatted phone entry fail user.save()
		// with a CastError -> 500 on member creation.) Existing numeric values
		// in the database are cast to strings on read, so this is backward
		// compatible with all pre-existing accounts.
		phoneNumber: {
			type: String,
			required: true,
			trim: true
		},
		// How this person relates to their flat. A single Unit can have multiple
		// User accounts (owner + tenant + family), each with their own occupancyType.
		occupancyType: {
			type: String,
			enum: ['owner', 'tenant', 'family', 'occupant'],
		},
		// Account lifecycle for the closed/private onboarding model:
		//   invited  - admin created the account; resident hasn't set a password yet
		//   active   - resident has activated (set a password) and can sign in
		//   inactive - deactivated by admin; blocked from signing in
		// Defaults to 'active' so every pre-existing account (incl. the current
		// administrator) keeps working unchanged.
		accountStatus: {
			type: String,
			enum: ['invited', 'active', 'inactive'],
			default: 'active'
		},
		complaints: Array,
		lastPayment: {
			date: Date,
			amount: Number,
			invoice: String
		},
		makePayment: Number,
		passwordResetToken: String,
		passwordResetExpires: Date,
		// Account-activation link token (admin-created members set their own password).
		// Only a SHA-256 hash is stored; the raw token lives only in the link.
		activationToken: String,
		activationExpires: Date
	},
	{
		timestamps: true
	}
);

// Keep the legacy isAdmin flag in lockstep with the authoritative role so
// every existing view/check continues to work during the transition.
userSchema.pre('save', function (next) {
	if (this.role) {
		this.isAdmin = this.role !== 'member';
	}
	next();
});

userSchema.plugin(passportLocalMongoose);
const User = mongoose.model("User",userSchema);
passport.use(User.createStrategy());
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());
exports.User = User
