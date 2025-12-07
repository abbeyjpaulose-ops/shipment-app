import mongoose from 'mongoose';

const TransportPartnerSchema = new mongoose.Schema({
  partnerName: { type: String, required: true },
  address: { type: String, required: true },
  city: { type: String },
  state: { type: String },
  pinCode: { type: String },
  GSTIN: { type: String, required: true },

  vehicleNumbers: [
    {
      number: { type: String, required: true },
      phone: { type: String, required: true }
    }
  ],

  rateType: { type: String, enum: ['km', 'day'], required: true },
  rateValue: { type: Number, required: true },

  status: { type: String, enum: ['active', 'inactive'], default: 'active' },

  email: { type: String, required: true },
  username: { type: String, required: true },

  createdAt: { type: Date, default: Date.now }
});

export default mongoose.models.TransportPartner ||
 mongoose.model('TransportPartner', TransportPartnerSchema);
