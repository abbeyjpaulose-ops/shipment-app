import mongoose from 'mongoose';

const ManifestItemSchema = new mongoose.Schema(
  {
    manifestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Manifest', required: true, index: true },
    shipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'NewShipmentShipment', required: true, index: true },
    consignmentNumber: { type: String, trim: true },
    status: { type: String, default: 'Manifested', trim: true },
    deliveredAt: { type: Date }
  },
  { timestamps: true }
);

ManifestItemSchema.index({ manifestId: 1, shipmentId: 1 }, { unique: true });

export default mongoose.models.ManifestItem || mongoose.model('ManifestItem', ManifestItemSchema);
