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
		phoneNumber: {
			type: Number,
			required: true
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

userSchema.plugin(passportLocalMongoose);
const User = mongoose.model("User",userSchema);
passport.use(User.createStrategy());
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());
exports.User = User
