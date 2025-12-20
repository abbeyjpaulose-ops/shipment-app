import mongoose from 'mongoose';

const EwaybillSchema = new mongoose.Schema(
  {
    shipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shipment', required: true, index: true },
    number: { type: String, trim: true },
    date: { type: Date }
  },
  { timestamps: true }
);

export default mongoose.models.Ewaybill ||
  mongoose.model('Ewaybill', EwaybillSchema);
