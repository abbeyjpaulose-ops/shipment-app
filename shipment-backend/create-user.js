// shipment-backend/create-user.js
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import User from './models/User.js';
import Profile from './models/Profile.js';

dotenv.config();
const MONGO_URI = process.env.MONGO_URI;
console.log('Connecting to MongoDB...', MONGO_URI);
console.log("Loaded MONGO_URI:", process.env.MONGO_URI);

if (!MONGO_URI) { 
  console.error('Set MONGO_URI in .env'); 
  process.exit(1); 
}

// CLI arguments
const email = process.argv[2];
const username = process.argv[3];
const password = process.argv[4];
const role = process.argv[5] || 'user';
const address = process.argv[6] || '';
const companyName = process.argv[7] || '';
const mobile = process.argv[8] || '';
const companyType = process.argv[9] || '';

if (!email || !username || !password) {
  console.error('Usage: node create-user.js email username password [role] [address] [companyName] [mobile] [companyType]');
  process.exit(1);
}

await mongoose.connect(MONGO_URI);

// Check if user already exists
const existing = await User.findOne({ 
  email: email.toLowerCase(), 
  username: username.toLowerCase() 
});
if (existing) {
  console.error('❌ User already exists:', email, username);
  process.exit(1);
}

// Hash password
const hash = await bcrypt.hash(password, 10);

// Create User
const user = new User({
  email: email.toLowerCase(),
  username: username.toLowerCase(),
  passwordHash: hash,
  role,
  address,
  CompanyName: companyName,
  mobile,
  CompanyType: companyType
});

await user.save();
console.log('✅ Created user:', email, username);

// Create Profile linked to User
const profile = new Profile({
  name: username,
  address,
  company: companyName,
  mobile,
  email,
  role,
  photo: '',              // default empty
  businessType: companyType,
  username
});

await profile.save();
console.log('✅ Created profile for user:', email);

// Disconnect
await mongoose.disconnect();
process.exit(0);
