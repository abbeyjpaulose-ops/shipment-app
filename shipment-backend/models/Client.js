// shipment-backend/models/Client.js
import mongoose from 'mongoose';

const ClientSchema = new mongoose.Schema({
  clientName: { type: String, required: true },
  address: { type: String, required: true },
  city: { type: String },
  state: { type: String },
  pinCode: { type: String },
  GSTIN: { type: String, required: true },
  perDis: { type: Number, required: true }, // percentage Discount
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  email: { type: String, required: true },     // from logged-in user
  username: { type: String, required: true },  // from logged-in user
  createdAt: { type: Date, default: Date.now }
});

// Unique combo: clientName + address
ClientSchema.index({ clientName: 1, address: 1 }, { unique: true });

export default mongoose.models.Client || mongoose.model('Client', ClientSchema);
