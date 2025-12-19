// shipment-backend/models/Guest.js
import mongoose from 'mongoose';

const GuestSchema = new mongoose.Schema({
  // Company link (User.GSTIN_ID == User._id)
  GSTIN_ID: { type: Number, ref: 'User', required: true, index: true },
  guestName: { type: String, required: true },
  address: { type: String, required: true },
  city: { type: String },
  state: { type: String },
  pinCode: { type: String },
  phoneNum: { type: String, required: true },
  perDis: { type: Number, required: true }, // percentage Discount
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  user_id: { type: Number, required: true }, // creator (Profile _id)
  createdAt: { type: Date, default: Date.now }
});

// Unique guest per company (scoped by GSTIN_ID instead of creator email)
GuestSchema.index({ GSTIN_ID: 1, guestName: 1, address: 1 }, { unique: true });

export default mongoose.models.Guest || mongoose.model('Guest', GuestSchema);
