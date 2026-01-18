// shipment-backend/models/Client.js
import mongoose from 'mongoose';

const DeliveryLocationSchema = new mongoose.Schema(
  {
    delivery_id: {
      type: mongoose.Schema.Types.ObjectId,
      default: () => new mongoose.Types.ObjectId()
    },
    address: { type: String, required: true, trim: true },
    location: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    pinCode: { type: String, trim: true }
  },
  { _id: false }
);

DeliveryLocationSchema.pre('validate', function(next) {
  if (!this.address && this.location) {
    this.address = this.location;
  }
  next();
});

const ProductPricingSchema = new mongoose.Schema(
  {
    product_id: {
      type: mongoose.Schema.Types.ObjectId,
      default: () => new mongoose.Types.ObjectId()
    },
    hsnNum: { type: String, trim: true },
    productName: { type: String, trim: true },
    rates: {
      type: [
        new mongoose.Schema(
          {
            pickupLocationId: { type: mongoose.Schema.Types.ObjectId },
            deliveryLocationId: { type: mongoose.Schema.Types.ObjectId },
            rate: {
              type: new mongoose.Schema(
                {
                  ratePerNum: { type: Number, default: 0 },
                  ratePerVolume: { type: Number, default: 0 },
                  ratePerKg: { type: Number, default: 0 }
                },
                { _id: false }
              ),
              default: () => ({})
            }
          },
          { _id: false }
        )
      ],
      default: []
    }
  },
  { _id: false }
);

const ClientSchema = new mongoose.Schema({
  // Company link (User.GSTIN_ID == User._id)
  GSTIN_ID: { type: Number, ref: 'User', required: true, index: true },

  clientName: { type: String, required: true },
  GSTIN: { type: String, required: true, trim: true, uppercase: true },
  phoneNum: { type: String, required: true },
  perDis: { type: Number, required: true, default: 0 }, // percentage Discount

  creditType: { type: String, enum: ['credit', 'no-credit'], default: 'no-credit' },  
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true }, // branch _id
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
ClientSchema.index({ GSTIN_ID: 1, clientName: 1, branchId: 1 }, { unique: true });

ClientSchema.virtual('address').get(function() {
  return this.deliveryLocations?.[0]?.address || this.deliveryLocations?.[0]?.location || '';
});

ClientSchema.virtual('city').get(function() {
  return this.deliveryLocations?.[0]?.city || '';
});

ClientSchema.virtual('state').get(function() {
  return this.deliveryLocations?.[0]?.state || '';
});

ClientSchema.virtual('pinCode').get(function() {
  return this.deliveryLocations?.[0]?.pinCode || '';
});

ClientSchema.set('toJSON', { virtuals: true });
ClientSchema.set('toObject', { virtuals: true });

export default mongoose.models.Client || mongoose.model('Client', ClientSchema);
