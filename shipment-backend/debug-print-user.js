// debug-print-user.js
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from './models/User.js';

dotenv.config();

const email = process.argv[2];
if (!email) {
  console.error('Usage: node debug-print-user.js user@example.com');
  process.exit(1);
}

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('Set MONGO_URI in .env');
  process.exit(1);
}

await mongoose.connect(MONGO_URI);
const user = await User.findOne({ email: email.toLowerCase() }).lean();
console.log('USER:', user);
await mongoose.disconnect();
process.exit(0);
