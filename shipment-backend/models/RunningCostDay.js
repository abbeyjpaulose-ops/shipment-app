import mongoose from 'mongoose';

const FuelEntrySchema = new mongoose.Schema(
  {
    vehicleNo: { type: String, required: true, trim: true },
    fuelType: { type: String, trim: true, lowercase: true, enum: ['petrol', 'diesel'], default: 'diesel' },
    amount: { type: Number, required: true, min: 0 },
    notes: { type: String, trim: true },
    createdBy: { type: String, trim: true },
    createdAt: { type: Date, default: Date.now },
    isCancelled: { type: Boolean, default: false },
    cancelledBy: { type: String, trim: true },
    cancelledAt: { type: Date }
  },
  { _id: true }
);

const WorkerEntrySchema = new mongoose.Schema(
  {
    workType: { type: String, trim: true, lowercase: true, enum: ['loading', 'unloading', 'both'], default: 'loading' },
    workersCount: { type: Number, required: true, min: 0 },
    wagePerWorker: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    notes: { type: String, trim: true },
    createdBy: { type: String, trim: true },
    createdAt: { type: Date, default: Date.now },
    isCancelled: { type: Boolean, default: false },
    cancelledBy: { type: String, trim: true },
    cancelledAt: { type: Date }
  },
  { _id: true }
);

const MaintenanceEntrySchema = new mongoose.Schema(
  {
    vehicleNo: { type: String, required: true, trim: true },
    maintenanceType: {
      type: String,
      trim: true,
      lowercase: true,
      enum: ['service', 'breakdown-repair', 'other'],
      default: 'service'
    },
    amount: { type: Number, required: true, min: 0 },
    notes: { type: String, trim: true },
    createdBy: { type: String, trim: true },
    createdAt: { type: Date, default: Date.now },
    isCancelled: { type: Boolean, default: false },
    cancelledBy: { type: String, trim: true },
    cancelledAt: { type: Date }
  },
  { _id: true }
);

const RunningCostDaySchema = new mongoose.Schema(
  {
    GSTIN_ID: { type: Number, ref: 'User', required: true, index: true },
    originLocId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    dateKey: { type: String, required: true, trim: true, index: true }, // YYYY-MM-DD (UTC)
    fuelEntries: { type: [FuelEntrySchema], default: [] },
    workerEntries: { type: [WorkerEntrySchema], default: [] },
    maintenanceEntries: { type: [MaintenanceEntrySchema], default: [] }
  },
  { timestamps: true }
);

RunningCostDaySchema.index({ GSTIN_ID: 1, originLocId: 1, dateKey: 1 }, { unique: true });

export default mongoose.models.RunningCostDay ||
  mongoose.model('RunningCostDay', RunningCostDaySchema);
