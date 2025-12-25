import mongoose from 'mongoose';

const InvoiceProductSchema = new mongoose.Schema(
  {
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'NewShipmentInvoice', required: true, index: true },
    type: { type: String, required: true, trim: true },
    amount: { type: Number, required: true },
    instock: { type: Number, default: 0 },
    intransitstock: { type: Number, default: 0 },
    deliveredstock: { type: Number, default: 0 }
  },
  { timestamps: true }
);

export default mongoose.models.NewShipmentInvoiceProduct ||
  mongoose.model('NewShipmentInvoiceProduct', InvoiceProductSchema);
