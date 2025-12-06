// shipment-backend/models/Client.js
import mongoose from 'mongoose';

const ClientSchema = new mongoose.Schema({
  clientName: { type: String, required: true },
  address: { type: String, required: true },
  city: { type: String },
  state: { type: String },
  pinCode: { type: String },
  GSTIN: { type: String, required: true },
  phoneNum: { type: String, required: true },
  perDis: { type: Number, required: true }, // percentage Discount
  creditType: { type: String, enum: ['credit', 'no-credit'], default: 'no-credit' },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  branch: { type: String, required: true }, // branch name
  email: { type: String, required: true },     // from logged-in user
  username: { type: String, required: true },  // from logged-in user
  createdAt: { type: Date, default: Date.now }
});

// Unique combo: clientName + address +email
ClientSchema.index({ clientName: 1, branch: 1, email: 1 }, { unique: true });


export default mongoose.models.Client || mongoose.model('Client', ClientSchema);
