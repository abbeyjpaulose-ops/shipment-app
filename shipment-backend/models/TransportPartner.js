// models/TransportPartner.js
import mongoose from 'mongoose';

const TransportPartnerSchema = new mongoose.Schema({
  partnerName: { type: String, required: true },

  vehicleNumbers: [{ type: String, required: true }], // 👈 MULTIPLE VEHICLES

  rateType: { type: String, enum: ['km', 'day'], required: true },
  rateValue: { type: Number, required: true },

  status: { type: String, enum: ['active', 'inactive'], default: 'active' },

  email: { type: String, required: true },
  username: { type: String, required: true },

  createdAt: { type: Date, default: Date.now }
});

export default mongoose.models.TransportPartner
  || mongoose.model('TransportPartner', TransportPartnerSchema);
