// shipment-backend/models/Package.js
import mongoose from 'mongoose';

const PkgSchema = new mongoose.Schema({
  pkgName: { type: String, required: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  email: { type: String, required: true },     // from logged-in user
  username: { type: String, required: true },  // from logged-in user
  createdAt: { type: Date, default: Date.now }
});

// Unique combo: pkgName + address + email
PkgSchema.index({ pkgName: 1, email: 1 }, { unique: true });

export default mongoose.models.Pkg || mongoose.model('Pkg', PkgSchema);
