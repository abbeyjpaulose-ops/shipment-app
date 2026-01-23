import mongoose from 'mongoose';

const VehicleActivitySchema = new mongoose.Schema(
  {
    createdAt: { type: Date, default: Date.now },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    vehicleNumbers: [{ type: String, required: true, trim: true }],
    consignmentIds: [{ type: String, required: true, trim: true }],
    pincodeDirections: [{ type: String, required: true, trim: true }],
    tripCost: { type: Number },
    status: { type: String, trim: true, default: 'scheduled' }
  },
  { timestamps: true }
);

export default mongoose.models.VehicleActivity ||
  mongoose.model('VehicleActivity', VehicleActivitySchema);
