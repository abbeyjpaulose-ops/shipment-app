import mongoose from 'mongoose';

const TpartnerActivitySchema = new mongoose.Schema(
  {
    createdAt: { type: Date, default: Date.now },
    tpartnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'TransportPartner', required: true },
    tpartnerName: { type: String, required: true, trim: true },
    vehicleNumbers: [{ type: String, required: true, trim: true }],
    consignmentIds: [{ type: String, required: true, trim: true }],
    pincodeDirections: [{ type: String, required: true, trim: true }],
    tripCost: { type: Number },
    status: { type: String, trim: true, default: 'scheduled' }
  },
  { timestamps: true }
);

export default mongoose.models.TpartnerActivity ||
  mongoose.model('TpartnerActivity', TpartnerActivitySchema);
