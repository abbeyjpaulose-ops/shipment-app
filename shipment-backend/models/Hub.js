// shipment-backend/models/Hub.js
import mongoose from 'mongoose';

const HubSchema = new mongoose.Schema({
  hubName: { type: String, required: true },
  address: { type: String, required: true },
  city: { type: String },
  state: { type: String },
  pinCode: { type: String },
  GSTIN: { type: String, required: true },
  perRev: { type: Number, required: true }, // percentage revenue share
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  email: { type: String, required: true },     // from logged-in user
  username: { type: String, required: true },  // from logged-in user
  createdAt: { type: Date, default: Date.now }
});

// Unique combo: hubName + address + email
HubSchema.index({ hubName: 1, address: 1, email: 1 }, { unique: true });

export default mongoose.models.Hub || mongoose.model('Hub', HubSchema);
