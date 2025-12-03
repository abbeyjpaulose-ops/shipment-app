// shipment-backend/models/NewShipment.js
import mongoose from 'mongoose';

//
// PACKAGE
//
const PackageSchema = new mongoose.Schema({
  type: { type: String, required: false },
  amount: { type: Number, required: false }
});

//
// PRODUCT
//
const ProductSchema = new mongoose.Schema({
  type: { type: String, required: true },
  amount: { type: Number, required: true },
  instock: { type: Number, required: false },
  intransitstock: { type: Number, required: false },
  deliveredstock: { type: Number, required: false }
});

//
// INVOICE
//
const InvoiceSchema = new mongoose.Schema({
  number: { type: String, required: false },
  value: { type: Number, required: true },
  packages: [PackageSchema],
  products: [ProductSchema]
});

//
// **NEW** E-WAYBILL (Parent of invoices)
//
const EwaybillSchema = new mongoose.Schema({
  number: { type: String, required: false },
  date: { type: Date, required: false },
  invoices: [InvoiceSchema]
});

//
// CHARGES
//
const ChargesSchema = new mongoose.Schema({
  odc: { type: Number },
  unloading: { type: Number },
  docket: { type: Number },
  other: { type: Number },
  ccc: { type: Number },
  consignorDiscount: { type: Number }
});

//
// MAIN SHIPMENT MODEL
//
const NewShipmentSchema = new mongoose.Schema({
  email: { type: String, required: true },       // User email
  username: { type: String, required: true },    // Username
  branch: { type: String, required: true },      // Branch

  // SECTION 1 – Consignment Header
  consignmentNumber: { type: String, required: true },
  date: { type: Date },
  shipmentStatus: { type: String },
  shipmentStatusDetails: { type: String },

  // NEW — MULTIPLE EWAYBILLS
  ewaybills: [EwaybillSchema],

  // SECTION 2 – Consignor / Consignee
  consignorTab: { type: String, required: true }, 
  consignor: { type: String, required: true },
  consignorGST: { type: String },
  consignorAddress: { type: String },
  consignorPhone: { type: String },

  consigneeTab: { type: String },
  consignee: { type: String, required: true },
  consigneeGST: { type: String },
  consigneeAddress: { type: String },
  consigneePhone: { type: String },

  paymentMode: { type: String },
  externalRefId: { type: String },

  // SECTION 3 – Address Details
  billingType: { type: String },
  billingName: { type: String },
  billingGSTIN: { type: String },
  billingAddress: { type: String },
  billingPhone: { type: String },

  pickupType: { type: String },
  pickupName: { type: String },
  pickupAddress: { type: String },
  pickupPhone: { type: String },

  deliveryType: { type: String },
  deliveryName: { type: String },
  deliveryAddress: { type: String },
  deliveryPhone: { type: String },

  // SECTION 6 – Charges
  charges: ChargesSchema,
  finalAmount: { type: Number },

  createdAt: { type: Date, default: Date.now }
});

// Ensure unique consignment per branch & user
NewShipmentSchema.index(
  { consignmentNumber: 1, branch: 1, email: 1 },
  { unique: true }
);

export default mongoose.models.NewShipment ||
  mongoose.model('NewShipment', NewShipmentSchema);
