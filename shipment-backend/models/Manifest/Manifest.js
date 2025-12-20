import mongoose from 'mongoose';

const ManifestSchema = new mongoose.Schema(
  {
    GSTIN_ID: { type: Number, ref: 'User', index: true },
    email: { type: String, required: true, trim: true },
    username: { type: String, required: true, trim: true },
    branch: { type: String, required: true, trim: true },
    manifestationNumber: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    mshipmentStatus: { type: String, default: 'In Transit' }
  },
  { timestamps: true }
);

ManifestSchema.index(
  { email: 1, username: 1, manifestationNumber: 1 },
  { unique: true }
);

ManifestSchema.index({ GSTIN_ID: 1, branch: 1, manifestationNumber: 1 });

export default mongoose.models.Manifest ||
  mongoose.model('Manifest', ManifestSchema);
