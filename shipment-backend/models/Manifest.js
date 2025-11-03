import mongoose from 'mongoose';

const ManifestProductSchema = new mongoose.Schema({
  type: String,
  amount: Number,
  instock: Number,
  manifestQty: Number,
  shipmentStatus: { type: String, default: 'In Transit' }
});

const ManifestInvoiceSchema = new mongoose.Schema({
  number: String,
  value: Number,
  products: [ManifestProductSchema]
});

const CEwaybillSchema = new mongoose.Schema({
  editTime: Date,
  user: String,
  vehicleNumber: String,
  cEwaybillNumber: String,
  enterTime: Date
});


const ManifestConsignmentSchema = new mongoose.Schema({
  consignmentNumber: String,
  consignor: String,
  invoices: [ManifestInvoiceSchema],
  cEwaybill: [CEwaybillSchema],
  routes: String
});

const ManifestSchema = new mongoose.Schema({
  email: { type: String, required: true },
  username: { type: String, required: true },
  branch: { type: String, required: true },
  manifestationNumber: { type: Number, required: true, unique: false },
  date: { type: Date, default: Date.now },
  mshipmentStatus: { type: String, default: 'In Transit' },
  consignments: [ManifestConsignmentSchema]
});

// Unique combo: manifestationNumber + address + email
ManifestSchema.index({ manifestationNumber: 1, address: 1, email: 1 }, { unique: true });

export default mongoose.models.Manifest || mongoose.model('Manifest', ManifestSchema);
