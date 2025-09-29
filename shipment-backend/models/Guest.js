// shipment-backend/models/Guest.js
import mongoose from 'mongoose';

const GuestSchema = new mongoose.Schema({
  guestName: { type: String, required: true },
  address: { type: String, required: true },
  city: { type: String },
  state: { type: String },
  pinCode: { type: String },
  phoneNum: { type: String, required: true },
  perDis: { type: Number, required: true }, // percentage Discount
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  email: { type: String, required: true },     // from logged-in user
  username: { type: String, required: true },  // from logged-in user
  createdAt: { type: Date, default: Date.now }
});

// Unique combo: guestName + address + email
GuestSchema.index({ guestName: 1, address: 1, email: 1 }, { unique: true });

export default mongoose.models.Guest || mongoose.model('Guest', GuestSchema);
