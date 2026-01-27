import mongoose from 'mongoose';

// Sub-schema for vehicles under a branch
const VehicleSchema = new mongoose.Schema(
  {
    vehicleNo: { type: String, required: true, trim: true },
    driverPhone: { type: String, required: true, trim: true },
    vehicleStatus: { type: String, trim: true, default: 'online' },
    currentLocationId: { type: mongoose.Schema.Types.ObjectId }
  },
  { _id: false }
);

// Address entry for branch (allows storing address _id)
const AddressSchema = new mongoose.Schema(
  {
    address: { type: String, required: true, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    pinCode: { type: String, trim: true },
    phoneNum: { type: String, trim: true }
  },
  { _id: true }
);

export const BranchSchema = new mongoose.Schema(
  {
    // Company link (User.GSTIN_ID == User._id)
    GSTIN_ID: { type: Number, ref: 'User', required: true, index: true },

    branchName: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    pinCode: { type: String, trim: true },
    phoneNum: { type: String, required: true, trim: true },

    addresses: { type: [AddressSchema], default: [] },

    vehicles: { type: [VehicleSchema], default: [] },

    status: { type: String, enum: ['active', 'inactive'], default: 'active' },

    // Audit fields
    createdByEmail: { type: String, trim: true, lowercase: true },
    createdByUsername: { type: String, trim: true }
  },
  { timestamps: true }
);

// Unique per company: branchName
BranchSchema.index({ GSTIN_ID: 1, branchName: 1 }, { unique: true });

export default mongoose.models.Branch || mongoose.model('Branch', BranchSchema);
