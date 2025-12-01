// shipment-backend/models/Package.js
import mongoose from 'mongoose';

const ProductSchema = new mongoose.Schema({
  hsnNum: { type: String, required: true },
  productName: { type: String, required: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  ratePerNum: { type: Number, default: 0 },
  ratePerVolume: { type: Number, default: 0 },
  ratePerKg: { type: Number, default: 0 },
  email: { type: String, required: true },     // from logged-in user
  username: { type: String, required: true },  // from logged-in user
  createdAt: { type: Date, default: Date.now }
});

// Unique combo: productName + address + email
ProductSchema.index({ hsnNum : 1, productName: 1, email: 1 }, { unique: true });

export default mongoose.models.Product || mongoose.model('Product', ProductSchema);
