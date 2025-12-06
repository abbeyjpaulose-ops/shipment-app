// shipment-backend/models/Branch.js
import mongoose from 'mongoose';

// Sub-schema for vehicles under a branch
const VehicleSchema = new mongoose.Schema({
  vehicleNo: { type: String, required: true },
  driverPhone: { type: String, required: true }
});

const BranchSchema = new mongoose.Schema({
  branchName: { type: String, required: true },
  address: { type: String, required: true },
  city: { type: String },
  state: { type: String },
  pinCode: { type: String },
  GSTIN: { type: String, required: true },

  phoneNum: { type: String, required: true },

  vehicles: {
    type: [VehicleSchema],
    default: []
  },

  status: { type: String, enum: ['active', 'inactive'], default: 'active' },

  email: { type: String, required: true },     // Who added this
  username: { type: String, required: true },  // Who added this

  createdAt: { type: Date, default: Date.now }
});

// Unique Index: branchName + address + email = unique per user
BranchSchema.index({ branchName: 1, address: 1, email: 1 }, { unique: true });

export default mongoose.models.Branch || mongoose.model('Branch', BranchSchema);
