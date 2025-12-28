import mongoose from 'mongoose';

const ManifestAdjustmentSchema = new mongoose.Schema(
  {
    manifestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Manifest', required: true, index: true },
    manifestationNumber: { type: Number, required: true, index: true },
    consignmentNumber: { type: String, required: true, trim: true },
    invoiceNumber: { type: String, required: true, trim: true },
    productType: { type: String, required: true, trim: true },
    deltaManifestQty: { type: Number, default: 0 },
    deltaInstock: { type: Number, default: 0 },
    deltaIntransitstock: { type: Number, default: 0 },
    deltaDeliveredstock: { type: Number, default: 0 },
    reason: { type: String, trim: true },
    createdBy: { type: String, trim: true }
  },
  { timestamps: true }
);

ManifestAdjustmentSchema.index(
  { manifestId: 1, consignmentNumber: 1, invoiceNumber: 1, productType: 1 }
);

export default mongoose.models.ManifestAdjustment ||
  mongoose.model('ManifestAdjustment', ManifestAdjustmentSchema);
