import mongoose from 'mongoose';

const FinvoiceSchema = new mongoose.Schema(
  {
    // Company link (User.GSTIN_ID == User._id)
    GSTIN_ID: { type: Number, ref: 'User', required: true, index: true },

    // Branch scope for serial generation
    originLocId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },

    // Billing entity (client/hub/etc)
    billingEntityId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },

    // B2B/B2C series marker (B = business, C = consumer)
    billingCategory: { type: String, trim: true, enum: ['B', 'C'], index: true },

    // Serial finvoice number
    finvoiceNumber: { type: Number, required: true },

    createdBy: { type: String, trim: true },
    status: { type: String, trim: true, default: 'invoiced' }
  },
  { timestamps: true }
);

FinvoiceSchema.index(
  { GSTIN_ID: 1, originLocId: 1, billingCategory: 1, finvoiceNumber: 1 },
  { unique: true }
);

FinvoiceSchema.index(
  { GSTIN_ID: 1, billingEntityId: 1 }
);

export default mongoose.models.NewShipmentFinvoice ||
  mongoose.model('NewShipmentFinvoice', FinvoiceSchema);
