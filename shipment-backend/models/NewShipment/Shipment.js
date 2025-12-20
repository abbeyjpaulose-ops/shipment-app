import mongoose from 'mongoose';

const ShipmentSchema = new mongoose.Schema(
  {
    // Company link (User.GSTIN_ID == User._id)
    GSTIN_ID: { type: Number, ref: 'User', index: true },

    // User / branch scope
    username: { type: String, required: true, trim: true },
    branch: { type: String, required: true, trim: true },

    // Consignment header
    consignmentNumber: { type: String, required: true, trim: true },
    date: { type: Date, default: Date.now },
    shipmentStatus: { type: String, default: 'Pending' },
    shipmentStatusDetails: { type: String, default: '' },

    // Consignor / Consignee
    consignorTab: { type: String, required: true, trim: true },
    consignor: { type: String, required: true, trim: true },
    consignorGST: { type: String, trim: true },
    consignorAddress: { type: String, trim: true },
    consignorPhone: { type: String, trim: true },

    consigneeTab: { type: String, trim: true },
    consignee: { type: String, required: true, trim: true },
    consigneeGST: { type: String, trim: true },
    consigneeAddress: { type: String, trim: true },
    consigneePhone: { type: String, trim: true },

    // Payment
    paymentMode: { type: String, default: 'To Pay' },
    externalRefId: { type: String, trim: true },

    // Address details
    billingType: { type: String, trim: true },
    billingName: { type: String, trim: true },
    billingGSTIN: { type: String, trim: true },
    billingAddress: { type: String, trim: true },
    billingPhone: { type: String, trim: true },

    pickupType: { type: String, trim: true },
    pickupName: { type: String, trim: true },
    pickupAddress: { type: String, trim: true },
    pickupPhone: { type: String, trim: true },

    deliveryType: { type: String, trim: true },
    deliveryName: { type: String, trim: true },
    deliveryAddress: { type: String, trim: true },
    deliveryPhone: { type: String, trim: true },

    // Charges
    charges: {
      odc: { type: Number, default: 0 },
      unloading: { type: Number, default: 0 },
      docket: { type: Number, default: 0 },
      other: { type: Number, default: 0 },
      ccc: { type: Number, default: 0 },
      consignorDiscount: { type: Number, default: 0 }
    },
    finalAmount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

// Unique per company/branch (when GSTIN_ID present)
ShipmentSchema.index(
  { GSTIN_ID: 1, branch: 1, consignmentNumber: 1 },
  { unique: true, partialFilterExpression: { GSTIN_ID: { $exists: true } } }
);

// Unique per user/branch
ShipmentSchema.index(
  { username: 1, branch: 1, consignmentNumber: 1 },
  { unique: true }
);

export default mongoose.models.Shipment ||
  mongoose.model('Shipment', ShipmentSchema);
