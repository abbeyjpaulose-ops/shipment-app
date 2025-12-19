// shipment-backend/models/Package.js
import mongoose from 'mongoose';

const ProductSchema = new mongoose.Schema({
  // Company link (User.GSTIN_ID == User._id)
  GSTIN_ID: { type: Number, ref: 'User', required: true, index: true },
  branch: { type: String, required: true, trim: true },

  hsnNum: { type: String, required: true, trim: true },
  productName: { type: String, required: true, trim: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  ratePerNum: { type: Number, default: 0 },
  ratePerVolume: { type: Number, default: 0 },
  ratePerKg: { type: Number, default: 0 },
  user_id: { type: Number, required: true }, // creator (Profile _id)
  createdAt: { type: Date, default: Date.now }
});

// Unique product per company + branch
ProductSchema.index({ GSTIN_ID: 1, branch: 1, hsnNum: 1, productName: 1 }, { unique: true });

export default mongoose.models.Product || mongoose.model('Product', ProductSchema);
