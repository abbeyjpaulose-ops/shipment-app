import mongoose from 'mongoose';

const EwaybillSchema = new mongoose.Schema(
  {
    shipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'NewShipmentShipment', required: true, index: true },
    number: { type: String, trim: true },
    date: { type: Date }
  },
  { timestamps: true }
);

export default mongoose.models.NewShipmentEwaybill ||
  mongoose.model('NewShipmentEwaybill', EwaybillSchema);
