import mongoose from 'mongoose';

const PaymentSchema = new mongoose.Schema(
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

    referenceNo: { type: String, trim: true },
    amountDue: { type: Number, default: 0 },
    amountPaid: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
    currency: { type: String, default: 'INR', trim: true },
    status: { type: String, default: 'Pending', trim: true },
    paymentMethod: { type: String, trim: true },
    paymentDate: { type: Date },
    dueDate: { type: Date },
    notes: { type: String, trim: true }
  },
  { timestamps: true }
);

PaymentSchema.index({ entityType: 1, entityId: 1, direction: 1 });
PaymentSchema.index({ status: 1 });
PaymentSchema.index({ dueDate: 1 });
PaymentSchema.index(
  { entityType: 1, entityId: 1, direction: 1, referenceNo: 1 },
  { unique: true, partialFilterExpression: { referenceNo: { $type: 'string' } } }
);

export default mongoose.models.Payment ||
  mongoose.model('Payment', PaymentSchema);
