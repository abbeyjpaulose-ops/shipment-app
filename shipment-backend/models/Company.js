// shipment-backend/models/Company.js
import mongoose from 'mongoose';
import { BranchSchema } from './Branch.js';
import { HubSchema } from './Hub.js';

const CompanySchema = new mongoose.Schema({
  GSTIN: { type: String, required: true, unique: true }, // primary key
  companyName: { type: String, required: true },
  address: { type: String, required: true },
  businessType: { type: String },
  email: { type: String },    // owner / creator email
  username: { type: String }, // owner / creator username
  branch: { type: [BranchSchema], default: [] },
  hub: { type: [HubSchema], default: [] },
  pricePerNumber: { type: Number, default: 0 },
  pricePerKg: { type: Number, default: 0 },
  pricePerArea: { type: Number, default: 0 }
}, { timestamps: true });

CompanySchema.index({ GSTIN: 1 }, { unique: true });

export default mongoose.models.Company || mongoose.model('Company', CompanySchema);
