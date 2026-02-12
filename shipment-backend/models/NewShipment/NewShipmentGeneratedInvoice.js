import mongoose from 'mongoose';

const ConsignmentRefSchema = new mongoose.Schema(
  {
    consignmentNumber: { type: String, required: true, trim: true },
    shipmentId: { type: mongoose.Schema.Types.ObjectId, required: true },
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
  { _id: false }
);

const GeneratedInvoiceSchema = new mongoose.Schema(
  {
    // Company link (User.GSTIN_ID == User._id)
    GSTIN_ID: { type: Number, ref: 'User', required: true, index: true },

    // Fiscal year scope for invoice numbering
    fiscalYear: { type: String, required: true, trim: true },
    fiscalYearStart: { type: Date, required: true },

    invoiceNumber: { type: Number, required: true },
    invoiceCode: { type: String, trim: true },
    invoiceDisplayNumber: { type: String, trim: true },
    billingCategory: { type: String, trim: true, enum: ['B', 'C'], default: 'B' },
    invoiceSerialScope: { type: String, trim: true, default: 'company' },
    originLocId: { type: mongoose.Schema.Types.ObjectId, index: true },

    // Billing details (resolved from billingClientId + billingLocationId)
    billingClientId: { type: mongoose.Schema.Types.ObjectId },
    billingLocationId: { type: mongoose.Schema.Types.ObjectId },
    clientGSTIN: { type: String, trim: true },
    billingAddress: { type: String, trim: true },

    consignments: { type: [ConsignmentRefSchema], default: [] },

    createdBy: { type: String, trim: true },
    status: { type: String, trim: true, default: 'active' }
  },
  { timestamps: true }
);

GeneratedInvoiceSchema.index(
  { GSTIN_ID: 1, fiscalYear: 1, billingCategory: 1, invoiceNumber: 1 },
  {
    unique: true,
    partialFilterExpression: {
      $or: [
        { invoiceSerialScope: 'company' },
        { invoiceSerialScope: { $exists: false } },
        { invoiceSerialScope: null },
        { invoiceSerialScope: '' }
      ],
      billingCategory: { $exists: true }
    }
  }
);

GeneratedInvoiceSchema.index(
  { GSTIN_ID: 1, fiscalYear: 1, originLocId: 1, billingCategory: 1, invoiceNumber: 1 },
  {
    unique: true,
    partialFilterExpression: {
      invoiceSerialScope: 'branch',
      originLocId: { $exists: true },
      billingCategory: { $exists: true }
    }
  }
);

GeneratedInvoiceSchema.index(
  { GSTIN_ID: 1, fiscalYear: 1, billingClientId: 1, billingLocationId: 1 }
);

export default mongoose.models.NewShipmentGeneratedInvoice ||
  mongoose.model('NewShipmentGeneratedInvoice', GeneratedInvoiceSchema);
