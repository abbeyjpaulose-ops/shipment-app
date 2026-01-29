import mongoose from 'mongoose';

const ManifestSchema = new mongoose.Schema(
  {
    // Company link (User.GSTIN_ID == User._id)
    GSTIN_ID: { type: Number, ref: 'User', required: true, index: true },

    // Entity scope for serial generation (branch/hub)
    entityType: { type: String, required: true, trim: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },

    // Next delivery point from Manifestation Terminal
    deliveryType: { type: String, trim: true },
    deliveryId: { type: mongoose.Schema.Types.ObjectId, index: true },

    // Fiscal year scope for serial generation
    fiscalYear: { type: String, required: true, trim: true },
    fiscalYearStart: { type: Date, required: true },

    // Serial number (MF prefix) + numeric sequence (per GSTIN + entity + fiscalYear)
    manifestNumber: { type: String, required: true, trim: true },
    manifestSequence: { type: Number, required: true },

    vehicleNo: { type: String, trim: true },

    status: { type: String, default: 'Manifested', trim: true },
    deliveredAt: { type: Date }
  },
  { timestamps: true }
);

ManifestSchema.index(
  { GSTIN_ID: 1, entityType: 1, entityId: 1, fiscalYear: 1, manifestSequence: 1 },
  { unique: true }
);
ManifestSchema.index(
  { GSTIN_ID: 1, entityType: 1, entityId: 1, fiscalYear: 1, manifestNumber: 1 },
  { unique: true }
);
ManifestSchema.index({ GSTIN_ID: 1, vehicleNo: 1 });

export default mongoose.models.Manifest || mongoose.model('Manifest', ManifestSchema);
