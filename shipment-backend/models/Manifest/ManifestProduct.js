import mongoose from 'mongoose';

const ManifestProductSchema = new mongoose.Schema(
  {
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'ManifestInvoice', required: true, index: true },
    type: { type: String, required: true, trim: true },
    amount: { type: Number, default: 0 },
    instock: { type: Number, default: 0 },
    intransitstock: { type: Number, default: 0 },
    deliveredstock: { type: Number, default: 0 },
    manifestQty: { type: Number, default: 0 }
  },
  { timestamps: true }
);

export default mongoose.models.ManifestProduct ||
  mongoose.model('ManifestProduct', ManifestProductSchema);
