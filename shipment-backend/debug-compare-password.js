// shipment-backend/debug-compare-password.js
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import User from './models/User.js';

dotenv.config();
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) { console.error('Set MONGO_URI'); process.exit(1); }

const email = process.argv[2];
const plain = process.argv[3];
if (!email || !plain) { console.error('Usage: node debug-compare-password.js email plainPassword'); process.exit(1); }

await mongoose.connect(MONGO_URI);
const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
if (!user) { console.error('User not found'); process.exit(1); }
console.log('Stored hash:', user.passwordHash);
const ok = await bcrypt.compare(plain, user.passwordHash);
console.log('compare result =', ok);
await mongoose.disconnect();
process.exit(0);

const run = async () => {
  await mongoose.connect('mongodb+srv://<your-connection-string>');

  const user = await User.findOne({ email: 'test@example.com' }).select('+passwordHash');
  console.log('DB User:', user);

  const isMatch = await bcrypt.compare('mypassword', user.passwordHash);
  console.log('Password compare result:', isMatch);

  await mongoose.disconnect();
};

run();
