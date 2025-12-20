import mongoose from 'mongoose';

const InvoiceSchema = new mongoose.Schema(
  {
    ewaybillId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ewaybill', required: true, index: true },
    number: { type: String, trim: true },
    value: { type: Number, required: true, default: 0 }
  },
  { timestamps: true }
);

export default mongoose.models.Invoice ||
  mongoose.model('Invoice', InvoiceSchema);
