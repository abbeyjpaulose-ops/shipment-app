import mongoose from 'mongoose';

const ManifestInvoiceSchema = new mongoose.Schema(
  {
    consignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'ManifestConsignment', required: true, index: true },
    number: { type: String, required: true, trim: true },
    value: { type: Number, default: 0 }
  },
  { timestamps: true }
);

ManifestInvoiceSchema.index(
  { consignmentId: 1, number: 1 },
  { unique: true }
);

export default mongoose.models.ManifestInvoice ||
  mongoose.model('ManifestInvoice', ManifestInvoiceSchema);
