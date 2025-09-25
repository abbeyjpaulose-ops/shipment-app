// shipment-backend/models/Branch.js
import mongoose from 'mongoose';

const BranchSchema = new mongoose.Schema({
  branchName: { type: String, required: true },
  address: { type: String, required: true },
  city: { type: String },
  state: { type: String },
  pinCode: { type: String },
  GSTIN: { type: String, required: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  email: { type: String, required: true },     // from logged-in user
  username: { type: String, required: true },  // from logged-in user
  createdAt: { type: Date, default: Date.now }
});

// Unique combo: branchName + address + email
BranchSchema.index({ branchName: 1, address: 1, email: 1 }, { unique: true });

export default mongoose.models.Branch || mongoose.model('Branch', BranchSchema);
