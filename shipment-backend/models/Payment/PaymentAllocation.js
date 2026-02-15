import mongoose from 'mongoose';

const PaymentAllocationSchema = new mongoose.Schema(
  {
    GSTIN_ID: { type: Number, ref: 'User', required: true, index: true },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', required: true, index: true },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentTransaction', required: true, index: true },
    entityType: {
      type: String,
      required: true,
      trim: true,
      enum: ['client', 'branch', 'hub', 'transport_partner']
    },
    entityId: { type: String, required: true, trim: true, index: true },
    direction: {
      type: String,
      required: true,
      trim: true,
      enum: ['receivable', 'payable'],
      default: 'receivable'
    },
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'NewShipmentGeneratedInvoice', required: true, index: true },
    invoiceNumber: { type: Number, index: true },
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, trim: true, default: 'posted' },
    notes: { type: String, trim: true },
    voidedAt: { type: Date },
    voidReason: { type: String, trim: true }
  },
  { timestamps: true }
);

PaymentAllocationSchema.index({ transactionId: 1, status: 1 });
PaymentAllocationSchema.index({ invoiceId: 1, status: 1 });
PaymentAllocationSchema.index({ entityType: 1, entityId: 1, direction: 1, status: 1 });

export default mongoose.models.PaymentAllocation ||
  mongoose.model('PaymentAllocation', PaymentAllocationSchema);
