// shipment-backend/models/User.js
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const UserSchema = new mongoose.Schema({
  uuid: { type: String, default: uuidv4, unique: true },
  email: { type: String, required: true },
  username: { type: String, required: true },
  passwordHash: { type: String, required: true },
  role: { type: String, default: 'user' },
  createdAt: { type: Date, default: Date.now }
});

// ✅ Compound unique index on (email, username) +email
UserSchema.index({ email: 1, address: 1, email: 1 }, { unique: true });

export default mongoose.models.User || mongoose.model('User', UserSchema);
