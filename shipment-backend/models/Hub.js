import mongoose from 'mongoose';

// Vehicle under a particular delivery address
const VehicleSchema = new mongoose.Schema(
  {
    vehicleNo: { type: String, required: true, trim: true },
    driverPhone: { type: String, required: true, trim: true },
    vehicleStatus: { type: String, trim: true, default: 'online' },
    currentLocationId: { type: mongoose.Schema.Types.ObjectId },
    currentLocationType: { type: String, trim: true, lowercase: true }
  },
  { _id: false }
);

// Delivery / Pickup Address with vehicles mapped to it
const AddressSchema = new mongoose.Schema(
  {
    location: { type: String, required: true, trim: true },
    vehicles: { type: [VehicleSchema], default: [] }
  },
  { _id: true }
);

export const HubSchema = new mongoose.Schema(
  {
    // Company link (User.GSTIN_ID == User._id)
    GSTIN_ID: { type: Number, ref: 'User', required: true, index: true },

    hubName: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    pinCode: { type: String, trim: true },
    perRev: { type: Number, required: true },
    phoneNum: { type: String, required: true, trim: true },

    deliveryAddresses: { type: [AddressSchema], default: [] },

    status: { type: String, enum: ['active', 'inactive'], default: 'active' },

    // Creator (audit)
    user_id: { type: Number, required: true }
  },
  { timestamps: true }
);

// Branch lookups within a company

// Unique hub within a company (regardless of branch)
HubSchema.index({ GSTIN_ID: 1, hubName: 1, address: 1 }, { unique: true });

export default mongoose.models.Hub || mongoose.model('Hub', HubSchema);
