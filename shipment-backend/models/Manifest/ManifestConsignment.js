import mongoose from 'mongoose';

const ManifestConsignmentSchema = new mongoose.Schema(
  {
    manifestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Manifest', required: true, index: true },
    consignmentNumber: { type: String, required: true, trim: true },
    consignor: { type: String, trim: true },
    routes: { type: String, trim: true },
    mshipmentStatus: { type: String, trim: true }
  },
  { timestamps: true }
);

ManifestConsignmentSchema.index(
  { manifestId: 1, consignmentNumber: 1 },
  { unique: true }
);

export default mongoose.models.ManifestConsignment ||
  mongoose.model('ManifestConsignment', ManifestConsignmentSchema);
