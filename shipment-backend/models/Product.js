// shipment-backend/models/Package.js
import mongoose from 'mongoose';

const RateSchema = new mongoose.Schema(
  {
    ratePerNum: { type: Number, default: 0 },
    ratePerVolume: { type: Number, default: 0 },
    ratePerKg: { type: Number, default: 0 }
  },
  { _id: false }
);

const RateEntrySchema = new mongoose.Schema(
  {
    pickupPincode: { type: String, trim: true },
    deliveryPincode: { type: String, trim: true },
    rate: { type: RateSchema, default: () => ({}) }
  },
  { _id: false }
);

const ProductSchema = new mongoose.Schema({
  // Company link (User.GSTIN_ID == User._id)
  GSTIN_ID: { type: Number, ref: 'User', required: true, index: true },
  branch: { type: String, required: true, trim: true },

  hsnNum: { type: String, required: true, trim: true },
  productName: { type: String, required: true, trim: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  rates: { type: [RateEntrySchema], default: [] },
  user_id: { type: Number, required: true }, // creator (Profile _id)
  createdAt: { type: Date, default: Date.now }
});

// Unique product per company + branch
ProductSchema.index({ GSTIN_ID: 1, branch: 1, hsnNum: 1, productName: 1 }, { unique: true });

export default mongoose.models.Product || mongoose.model('Product', ProductSchema);
