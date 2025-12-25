import mongoose from 'mongoose';

const InvoicePackageSchema = new mongoose.Schema(
  {
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'NewShipmentInvoice', required: true, index: true },
    type: { type: String, required: true, trim: true },
    amount: { type: Number, required: true }
  },
  { timestamps: true }
);

export default mongoose.models.NewShipmentInvoicePackage ||
  mongoose.model('NewShipmentInvoicePackage', InvoicePackageSchema);
