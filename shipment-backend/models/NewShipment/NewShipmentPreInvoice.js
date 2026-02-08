import mongoose from 'mongoose';

const PreInvoiceSchema = new mongoose.Schema(
  {
    // Company link (User.GSTIN_ID == User._id)
    GSTIN_ID: { type: Number, ref: 'User', required: true, index: true },

    // Branch scope for serial generation
    originLocId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },

    // Billing entity (client/hub/etc)
    billingEntityId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },

    // Serial pre-invoice number
    preInvoiceNumber: { type: Number, required: true },

    createdBy: { type: String, trim: true },
    status: { type: String, trim: true, default: 'pre-invoiced' }
  },
  { timestamps: true }
);

PreInvoiceSchema.index(
  { GSTIN_ID: 1, originLocId: 1, preInvoiceNumber: 1 },
  { unique: true }
);

PreInvoiceSchema.index(
  { GSTIN_ID: 1, billingEntityId: 1 }
);

export default mongoose.models.NewShipmentPreInvoice ||
  mongoose.model('NewShipmentPreInvoice', PreInvoiceSchema);
