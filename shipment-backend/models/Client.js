// shipment-backend/models/Client.js
import mongoose from 'mongoose';

const DeliveryLocationSchema = new mongoose.Schema(
  {
    location: { type: String, required: true, trim: true }
  },
  { _id: false }
);

const ProductPricingSchema = new mongoose.Schema(
  {
    hsnNum: { type: String, trim: true },
    productName: { type: String, trim: true },
    ratePerNum: { type: Number, default: 0 },
    ratePerVolume: { type: Number, default: 0 },
    ratePerKg: { type: Number, default: 0 }
  },
  { _id: false }
);

const ClientSchema = new mongoose.Schema({
  // Company link (User.GSTIN_ID == User._id)
  GSTIN_ID: { type: Number, ref: 'User', required: true, index: true },

  clientName: { type: String, required: true },
  address: { type: String, required: true },
  city: { type: String },
  state: { type: String },
  pinCode: { type: String },
  GSTIN: { type: String, required: true, trim: true, uppercase: true },
  phoneNum: { type: String, required: true },
  perDis: { type: Number, required: true }, // percentage Discount

  creditType: { type: String, enum: ['credit', 'no-credit'], default: 'no-credit' },  
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  branch: { type: String, required: true }, // branch name
  user_id: { type: Number, required: true }, // creator (Profile _id)

  products: {
    type: [ProductPricingSchema],
    default: []
  },

  deliveryLocations: {
    type: [DeliveryLocationSchema],
    default: []
  },

  createdAt: { type: Date, default: Date.now }
});

// Unique client per company+branch (scoped by GSTIN_ID instead of creator email)
ClientSchema.index({ GSTIN_ID: 1, clientName: 1, branch: 1 }, { unique: true });

export default mongoose.models.Client || mongoose.model('Client', ClientSchema);
