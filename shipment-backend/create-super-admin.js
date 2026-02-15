import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import User from './models/User.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('Set MONGO_URI in .env');
  process.exit(1);
}

const usage = () => {
  console.error('Usage: node create-super-admin.js <email> <username> <password> [gstin]');
};

const normalizeEmail = (value) => String(value || '').toLowerCase().trim();
const normalizeUsername = (value) => String(value || '').toLowerCase().trim();
const normalizeGSTIN = (value) => String(value || '').toUpperCase().trim();

async function main() {
  const email = normalizeEmail(process.argv[2]);
  const username = normalizeUsername(process.argv[3]);
  const password = String(process.argv[4] || '');
  const gstin = normalizeGSTIN(process.argv[5] || '99SUPERADMIN0000Z9');

  if (!email || !username || !password) {
    usage();
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);

  const existing = await User.findOne({
    $or: [{ email }, { username }, { GSTIN: gstin }]
  });
  if (existing) {
    console.error('A user already exists with the same email, username, or GSTIN');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    GSTIN: gstin,
    email,
    username,
    passwordHash,
    role: 'super-admin',
    companyName: 'Platform Super Admin',
    companyType: 'System',
    phoneNumber: '',
    billingAddress: ''
  });

  console.log('Created super-admin user', {
    GSTIN_ID: user._id,
    email: user.email,
    username: user.username,
    role: user.role
  });
}

main()
  .catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
