const mongoose = require('mongoose');

const societySchema = mongoose.Schema(
    {
        societyName: {
            type: String,
            unique: true,
            required: true
        },
        societyAddress: {
            address: {
                type: String,
                required: true
            },
            city: {
                type: String,
                required: true
            },
            district: {
                type: String,
                required: true
            },
            postalCode: {
                type: Number,
                required: true
            }
        },
        admin: {
            type: String,
            required: true
        },
        noticeboard: Array,
        emergencyContacts: {
            plumbingService: {
                type: String,
                default: 'Not added by admin'
            },
            medicineShop: {
                type: String,
                default: 'Not added by admin'
            },
            ambulance: {
                type: String,
                default: 'Not added by admin'
            },
            doctor: {
                type: String,
                default: 'Not added by admin'
            },
            fireStation: {
                type: String,
                default: 'Not added by admin'
            },
            guard: {
                type: String,
                default: 'Not added by admin'
            },
            policeStation: {
                type: String,
                default: 'Not added by admin'
            }
        },
        maintenanceBill: {
            societyCharges: {
                type: Number,
                default: 186
            },
            repairsAndMaintenance: {
                type: Number,
                default: 1415
            },
            sinkingFund: {
                type: Number,
                default: 240
            },
            waterCharges: {
                type: Number,
                default: 150
            },
            insuranceCharges: {
                type: Number,
                default: 30
            },
            parkingCharges: {
                type: Number,
                default: 150
            },
        }
    },
    {
		timestamps: true,
	}
)

const Society = mongoose.model("society", societySchema);

// This deployment represents ONE fixed tower (27 East), so there is exactly one
// Society document. Resolve it safely on the server rather than trusting any
// client-supplied society name. If more than one somehow exists, prefer the
// oldest (the originally-registered tower) deterministically.
exports.getConfiguredSociety = () => Society.findOne().sort({ createdAt: 1 });

exports.Society = Society;