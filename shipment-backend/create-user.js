// shipment-backend/create-user.js
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import User from './models/User.js';

dotenv.config();
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) { console.error('Set MONGO_URI in .env'); process.exit(1); }

const email = process.argv[2];
const password = process.argv[3];
const role = process.argv[4] || 'user';
if (!email || !password) { console.error('Usage: node create-user.js email password [role]'); process.exit(1); }

await mongoose.connect(MONGO_URI);

const existing = await User.findOne({ email: email.toLowerCase() });
if (existing) {
  console.error('User already exists:', email);
  process.exit(1);
}

const hash = await bcrypt.hash(password, 10);
const user = new User({ email: email.toLowerCase(), passwordHash: hash, role });
await user.save();
console.log('✅ Created user:', email);
await mongoose.disconnect();
process.exit(0);
