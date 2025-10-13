import mongoose from 'mongoose';

const ManifestProductSchema = new mongoose.Schema({
  type: String,
  amount: Number,
  instock: Number,
  manifestQty: Number
});

const ManifestInvoiceSchema = new mongoose.Schema({
  number: String,
  value: Number,
  products: [ManifestProductSchema]
});

const ManifestConsignmentSchema = new mongoose.Schema({
  consignmentNumber: String,
  consignor: String,
  invoices: [ManifestInvoiceSchema]
});

const ManifestSchema = new mongoose.Schema({
  email: { type: String, required: true },
  username: { type: String, required: true },
  branch: { type: String, required: true },
  manifestationNumber: { type: Number, required: true, unique: false },
  date: { type: Date, default: Date.now },
  consignments: [ManifestConsignmentSchema]
});


// Unique combo: manifestName + address + email
ManifestSchema.index({ manifestationNumber: 1, address: 1, email: 1 }, { unique: true });

export default mongoose.models.Manifest || mongoose.model('Manifest', ManifestSchema);
