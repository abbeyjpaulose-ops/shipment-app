// shipment-backend/models/User.js
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const UserSchema = new mongoose.Schema({
  uuid: { type: String, default: uuidv4, unique: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },  // 👈 must exist
  role: { type: String, default: 'user' },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.models.User || mongoose.model('User', UserSchema);
