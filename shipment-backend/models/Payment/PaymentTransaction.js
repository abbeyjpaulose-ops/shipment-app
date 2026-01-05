import mongoose from 'mongoose';

const PaymentTransactionSchema = new mongoose.Schema(
  {
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', required: true },
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'NewShipmentGeneratedInvoice' },
    amount: { type: Number, required: true },
    transactionDate: { type: Date, required: true },
    method: { type: String, trim: true },
    referenceNo: { type: String, trim: true },
    notes: { type: String, trim: true },
    status: { type: String, trim: true, default: 'posted' },
    voidedAt: { type: Date },
    voidReason: { type: String, trim: true }
  },
  { timestamps: true }
);

PaymentTransactionSchema.index({ paymentId: 1 });
PaymentTransactionSchema.index({ invoiceId: 1 });
PaymentTransactionSchema.index({ referenceNo: 1 });

export default mongoose.models.PaymentTransaction ||
  mongoose.model('PaymentTransaction', PaymentTransactionSchema);
