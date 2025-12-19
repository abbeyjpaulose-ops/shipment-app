import mongoose from 'mongoose';

const TransportPartnerSchema = new mongoose.Schema(
  {
    // Company link (User.GSTIN_ID == User._id)
    GSTIN_ID: { type: Number, ref: 'User', required: true, index: true },

    partnerName: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    pinCode: { type: String, trim: true },
    GSTIN: { type: String, required: true, trim: true, uppercase: true },

    vehicleNumbers: [
      {
        number: { type: String, required: true, trim: true },
        phone: { type: String, required: true, trim: true }
      }
    ],

    rateType: { type: String, enum: ['km', 'day'], required: true },
    rateValue: { type: Number, required: true },

    status: { type: String, enum: ['active', 'inactive'], default: 'active' },

    email: { type: String, required: true, lowercase: true, trim: true }, // audit
    username: { type: String, required: true, trim: true }, // audit

    createdAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

// Unique transport partner per company
TransportPartnerSchema.index({ GSTIN_ID: 1, partnerName: 1, address: 1 }, { unique: true });

export default mongoose.models.TransportPartner ||
 mongoose.model('TransportPartner', TransportPartnerSchema);
