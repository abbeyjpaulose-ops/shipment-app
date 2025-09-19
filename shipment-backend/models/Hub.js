// shipment-backend/models/Hub.js
import mongoose from 'mongoose';

const HubSchema = new mongoose.Schema({
  companyName: { type: String, required: true },
  address: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  pincode: { type: String, required: true },
  gstin: { type: String, required: true }, // mandatory but repeatable 
  perRev: { type: String, required: true }, // percentage of revenue
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  username: { type: String, required: true }, // logged-in user
  email: { type: String, required: true },    // logged-in email
  createdAt: { type: Date, default: Date.now }
});

// Prevent duplicate companyName + address
HubSchema.index({ companyName: 1, address: 1 }, { unique: true });

export default mongoose.models.Hub || mongoose.model('Hub', HubSchema);
