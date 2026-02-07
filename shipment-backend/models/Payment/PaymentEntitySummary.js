import mongoose from 'mongoose';

const PaymentEntitySummarySchema = new mongoose.Schema(
  {
    // Company link (User.GSTIN_ID == User._id)
    GSTIN_ID: { type: Number, ref: 'User', index: true },

    entityType: {
      type: String,
      required: true,
      trim: true,
      enum: ['client', 'branch', 'hub', 'transport_partner']
    },
    entityId: { type: String, required: true, trim: true },

    direction: {
      type: String,
      required: true,
      trim: true,
      enum: ['receivable', 'payable'],
      default: 'receivable'
    },

    totalDue: { type: Number, default: 0 },
    totalPaid: { type: Number, default: 0 },
    totalBalance: { type: Number, default: 0 },
    lastPaymentDate: { type: Date },
    status: { type: String, default: 'Pending', trim: true }
  },
  { timestamps: true }
);

PaymentEntitySummarySchema.index({ entityType: 1, entityId: 1, direction: 1 }, { unique: true });
PaymentEntitySummarySchema.index({ status: 1 });

export default mongoose.models.PaymentEntitySummary ||
  mongoose.model('PaymentEntitySummary', PaymentEntitySummarySchema);
