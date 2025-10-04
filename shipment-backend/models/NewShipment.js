// shipment-backend/models/NewShipment.js
import mongoose from 'mongoose';

const InvoiceSchema = new mongoose.Schema({
  number: { type: String },
  value: { type: Number }
});

const PackageSchema = new mongoose.Schema({
  type: { type: String },
  amount: { type: Number }
});

const ProductSchema = new mongoose.Schema({
  type: { type: String },
  amount: { type: Number }
});

const ChargesSchema = new mongoose.Schema({
  odc: { type: Number },
  unloading: { type: Number },
  docket: { type: Number },
  other: { type: Number },
  ccc: { type: Number }
});

const NewShipmentSchema = new mongoose.Schema({
  email: { type: String, required: true },       // from logged-in user
  username: { type: String, required: true },    // from logged-in user
  branch: { type: String, required: true },      // branch selected in sidebar

  // Section 1
  ewaybillNumber: { type: String },
  consignmentNumber: { type: String },
  date: { type: Date },
  shipmentStatus: { type: String },
  shipmentStatusDetails: { type: String },


  // Section 2 - Consignor / Consignee / Guest
  consignorTab: { type: String },                // 'consignor' or 'guest'
  consignor: { type: String },
  consignorGST: { type: String },
  consignorAddress: { type: String },
  consignorPhone: { type: String },

  consigneeTab: { type: String },                // 'consignee' or 'guest'
  consignee: { type: String },
  consigneeGST: { type: String },
  consigneeAddress: { type: String },
  consigneePhone: { type: String },
  consigneeGuestName: { type: String },
  consigneeGuestPhone: { type: String },
  consigneeGuestAddress: { type: String },

  paymentMode: { type: String },
  externalRefId: { type: String },

  // Section 3 - Address Details
  billingType: { type: String },
  billingName: { type: String },
  billingGSTIN: { type: String },
  billingAddress: { type: String },

  pickupType: { type: String },
  pickupName: { type: String },
  pickupAddress: { type: String },

  deliveryType: { type: String },
  deliveryName: { type: String },
  deliveryAddress: { type: String },

  // Section 4 - Invoices
  invoices: [InvoiceSchema],

  // Section 5 - Packages
  packages: [PackageSchema],
  products: [ProductSchema],

  // Section 6 - Charges
  charges: ChargesSchema,
  finalAmount: { type: Number },

  createdAt: { type: Date, default: Date.now }
});

// Optional: Add a unique index if needed, e.g. on consignmentNumber + branch
NewShipmentSchema.index({ consignmentNumber: 1, branch: 1, email: 1 }, { unique: true });

export default mongoose.models.NewShipment || mongoose.model('NewShipment', NewShipmentSchema);
