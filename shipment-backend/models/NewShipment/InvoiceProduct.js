import mongoose from 'mongoose';

const InvoiceProductSchema = new mongoose.Schema(
  {
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true, index: true },
    type: { type: String, required: true, trim: true },
    amount: { type: Number, required: true },
    instock: { type: Number, default: 0 },
    intransitstock: { type: Number, default: 0 },
    deliveredstock: { type: Number, default: 0 }
  },
  { timestamps: true }
);

export default mongoose.models.InvoiceProduct ||
  mongoose.model('InvoiceProduct', InvoiceProductSchema);
