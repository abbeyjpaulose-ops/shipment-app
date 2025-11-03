// shipment-backend/models/NewShipment.js
import mongoose from 'mongoose';

const PackageSchema = new mongoose.Schema({
  type: { type: String, required: false },
  amount: { type: Number, required: false }
});

const ProductSchema = new mongoose.Schema({
  type: { type: String, required: false },
  amount: { type: Number, required: false },
  instock: { type: Number, required: false },
  intransitstock: { type: Number, required: false },
  deliveredstock: { type: Number, required: false }
});

const InvoiceSchema = new mongoose.Schema({
  number: { type: String, required: false },
  value: { type: Number, required: false },
  packages: [PackageSchema],
  products: [ProductSchema]
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
  consignmentNumber: { type: String, required: true },
  date: { type: Date },
  shipmentStatus: { type: String },
  shipmentStatusDetails: { type: String },


  // Section 2 - Consignor / Consignee / Guest
  consignorTab: { type: String, required: true },                // 'consignor' or 'guest'
  consignor: { type: String, required: true },
  consignorGST: { type: String },
  consignorAddress: { type: String },
  consignorPhone: { type: String },

  consigneeTab: { type: String },                // 'consignee' or 'guest'
  consignee: { type: String, required: true },
  consigneeGST: { type: String },
  consigneeAddress: { type: String },
  consigneePhone: { type: String },

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

  // Section 6 - Charges
  charges: ChargesSchema,
  finalAmount: { type: Number },

  createdAt: { type: Date, default: Date.now }
});

// Optional: Add a unique index if needed, e.g. on consignmentNumber + branch
NewShipmentSchema.index({ consignmentNumber: 1, branch: 1, email: 1 }, { unique: true });

export default mongoose.models.NewShipment || mongoose.model('NewShipment', NewShipmentSchema);
