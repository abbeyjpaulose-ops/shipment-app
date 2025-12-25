import mongoose from 'mongoose';

const InvoiceSchema = new mongoose.Schema(
  {
    ewaybillId: { type: mongoose.Schema.Types.ObjectId, ref: 'NewShipmentEwaybill', required: true, index: true },
    number: { type: String, trim: true },
    value: { type: Number, required: true, default: 0 }
  },
  { timestamps: true }
);

export default mongoose.models.NewShipmentInvoice ||
  mongoose.model('NewShipmentInvoice', InvoiceSchema);
