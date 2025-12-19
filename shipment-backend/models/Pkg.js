// shipment-backend/models/Package.js
import mongoose from 'mongoose';

const PkgSchema = new mongoose.Schema({
  // Company link (User.GSTIN_ID == User._id)
  GSTIN_ID: { type: Number, ref: 'User', required: true, index: true },
  pkgName: { type: String, required: true, trim: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  user_id: { type: Number, required: true }, // creator (Profile _id)
  createdAt: { type: Date, default: Date.now }
});

// Unique package name per company
PkgSchema.index({ GSTIN_ID: 1, pkgName: 1 }, { unique: true });

export default mongoose.models.Pkg || mongoose.model('Pkg', PkgSchema);
