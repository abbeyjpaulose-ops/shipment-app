import mongoose from 'mongoose';

const PreInvoiceItemSchema = new mongoose.Schema(
  {
    preInvoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'NewShipmentPreInvoice',
      required: true,
      index: true
    },
    shipmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'NewShipmentShipment',
      required: true,
      index: true
    },
    consignmentNumber: { type: String, required: true, trim: true },
    taxableValue: { type: Number, default: 0 },
    igstPercent: { type: Number, default: 0 },
    igstAmount: { type: Number, default: 0 },
    finalAmount: { type: Number, default: 0 },
    initialPaid: { type: Number, default: 0 },
    charges: {
      odc: { type: Number, default: 0 },
      unloading: { type: Number, default: 0 },
      docket: { type: Number, default: 0 },
      other: { type: Number, default: 0 },
      ccc: { type: Number, default: 0 },
      consignorDiscount: { type: Number, default: 0 }
    }
  },
  { timestamps: true }
);

PreInvoiceItemSchema.index(
  { preInvoiceId: 1, shipmentId: 1 },
  { unique: true }
);

export default mongoose.models.NewShipmentPreInvoiceItem ||
  mongoose.model('NewShipmentPreInvoiceItem', PreInvoiceItemSchema);
