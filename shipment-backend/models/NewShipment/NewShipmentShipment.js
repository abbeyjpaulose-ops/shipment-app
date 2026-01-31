import mongoose from 'mongoose';

const ShipmentSchema = new mongoose.Schema(
  {
    // Company link (User.GSTIN_ID == User._id)
    GSTIN_ID: { type: Number, ref: 'User', index: true },

    // User / branch scope
    username: { type: String, required: true, trim: true },
    originType: { type: String, enum: ['branch', 'hub'], default: 'branch', index: true },
    originLocId: { type: mongoose.Schema.Types.ObjectId, index: true },
    //vehicle
    currentLocationId: { type: mongoose.Schema.Types.ObjectId, index: true },
    currentVehicleNo: { type: String, trim: true },
    currentVehicleOwnerType: { type: String, trim: true },
    currentVehicleOwnerId: { type: mongoose.Schema.Types.ObjectId, index: true },
    //user/ branch
    
    // Consignment header
    consignmentNumber: { type: String, required: true, trim: true },
    date: { type: Date, default: Date.now },
    shipmentStatus: { type: String, default: 'Pending' },
    shipmentStatusDetails: { type: String, default: '' },

    // Consignor / Consignee
    consignorTab: { type: String, required: true, trim: true },
    consignorId: { type: mongoose.Schema.Types.ObjectId, required: true },
    consigneeTab: { type: String, trim: true },
    consigneeId: { type: mongoose.Schema.Types.ObjectId, required: true },

    // Payment
    paymentMode: { type: String, default: 'To Pay' },
    rateUnit: { type: String, default: 'box', trim: true },
    externalRefId: { type: String, trim: true },

    // Address details
    billingType: { type: String, trim: true },
    billingLocationId: { type: mongoose.Schema.Types.ObjectId },
    billingClientId: { type: mongoose.Schema.Types.ObjectId },

    pickupType: { type: String, trim: true },
    pickupLocationId: { type: mongoose.Schema.Types.ObjectId },

    deliveryType: { type: String, trim: true },
    deliveryID: { type: mongoose.Schema.Types.ObjectId },
    deliveryLocationId: { type: mongoose.Schema.Types.ObjectId },

    // Charges
    charges: {
      odc: { type: Number, default: 0 },
      unloading: { type: Number, default: 0 },
      docket: { type: Number, default: 0 },
      other: { type: Number, default: 0 },
      ccc: { type: Number, default: 0 },
      consignorDiscount: { type: Number, default: 0 }
    },
    finalAmount: { type: Number, default: 0 },
    initialPaid: { type: Number, default: 0 }
  },
  { timestamps: true }
);

// Unique per company/origin location (legacy entries use the same index definition)
ShipmentSchema.index(
  { GSTIN_ID: 1, originLocId: 1, consignmentNumber: 1 },
  { unique: true, partialFilterExpression: { GSTIN_ID: { $exists: true }, originLocId: { $exists: true } } }
);

export default mongoose.models.NewShipmentShipment ||
  mongoose.model('NewShipmentShipment', ShipmentSchema);
