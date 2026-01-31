import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import User from './models/User.js';
import Profile from './models/Profile.js';
import { ensureGSTINVerifiedOrThrow, normalizeGSTIN } from './services/gstVerification.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('Set MONGO_URI in .env');
  process.exit(1);
}

const usage = () => {
  console.error(`Usage:
  # Create a new company (User) + admin (Profile)
  node create-user.js company-admin <GSTIN> <adminEmail> <adminUsername> <adminPassword> <companyName> <companyType> <phoneNumber> <billingAddress>

  # Add a user (Profile) under an existing company (same GSTIN)
  node create-user.js add-user <GSTIN> <email> <username> <password> <originLocId> [role]`);
};

const normalizeEmail = (value) => String(value || '').toLowerCase().trim();
const normalizeText = (value) => String(value || '').trim();
const normalizeUsername = (value) => String(value || '').toLowerCase().trim();

const main = async () => {
  const command = process.argv[2];
  if (!command) {
    usage();
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);

  if (command === 'company-admin') {
    const gstin = process.argv[3];
    const adminEmailArg = process.argv[4];
    const adminUsernameArg = process.argv[5];
    const adminPassword = process.argv[6];
    const companyNameArg = process.argv[7];
    const companyTypeArg = process.argv[8];
    const phoneNumberArg = process.argv[9];
    const billingAddressArg = process.argv[10];

    if (
      !gstin ||
      !adminEmailArg ||
      !adminUsernameArg ||
      !adminPassword ||
      !companyNameArg ||
      !companyTypeArg ||
      !phoneNumberArg ||
      !billingAddressArg
    ) {
      usage();
      process.exit(1);
    }

    const verification = await ensureGSTINVerifiedOrThrow(gstin);
    const normalizedGSTIN = verification.normalizedGSTIN || normalizeGSTIN(gstin);

    const email = normalizeEmail(adminEmailArg);
    const username = normalizeUsername(adminUsernameArg);
    const passwordHash = await bcrypt.hash(adminPassword, 10);

    const existingCompany = await User.findOne({ $or: [{ GSTIN: normalizedGSTIN }, { email }] });
    if (existingCompany) {
      console.error('Company already exists for this GSTIN/email');
      process.exit(1);
    }

    const user = await User.create({
      GSTIN: normalizedGSTIN,
      email,
      username,
      passwordHash,
      role: 'admin',
      companyName: normalizeText(companyNameArg),
      companyType: normalizeText(companyTypeArg),
      phoneNumber: normalizeText(phoneNumberArg),
      billingAddress: normalizeText(billingAddressArg),
      gstVerification: {
        status: verification.status,
        verified: Boolean(verification.verified),
        verifiedAt: verification.verified ? new Date() : undefined,
        provider: process.env.GST_VERIFY_PROVIDER || undefined,
        referenceId: verification.referenceId
      }
    });

    const profile = await Profile.create({
      GSTIN_ID: user._id,
      originLocIds: [],
      originLocId: null,
      email,
      username,
      passwordHash,
      role: 'admin'
    });

    console.log('Created company and admin', {
      GSTIN: user.GSTIN,
      GSTIN_ID: user._id,
      admin_user_id: profile._id,
      adminEmail: email
    });
    return;
  }

  if (command === 'add-user') {
    const gstin = process.argv[3];
    const emailArg = process.argv[4];
    const usernameArg = process.argv[5];
    const password = process.argv[6];
    const originLocIdArg = process.argv[7];
    const roleArg = process.argv[8] || 'user';

    if (!gstin || !emailArg || !usernameArg || !password || !originLocIdArg) {
      usage();
      process.exit(1);
    }

    const company = await User.findOne({ GSTIN: gstin });
    if (!company) {
      console.error('Company not found for GSTIN:', gstin);
      process.exit(1);
    }

    const email = normalizeEmail(emailArg);
    const username = normalizeUsername(usernameArg);
    const role = normalizeText(roleArg) || 'user';

    const existingProfile = await Profile.findOne({ email });
    if (existingProfile) {
      console.error('Profile already exists for this email');
      process.exit(1);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const isAdmin = String(role).toLowerCase() === 'admin';
    const originLocIds = isAdmin
      ? []
      : normalizeText(originLocIdArg)
          .split(',')
          .map((b) => normalizeText(b))
          .filter(Boolean);

    const profile = await Profile.create({
      GSTIN_ID: company._id,
      originLocIds,
      originLocId: originLocIds[0],
      email,
      username,
      passwordHash,
      role
    });

    console.log('Created user profile under company', {
      GSTIN: company.GSTIN,
      GSTIN_ID: company._id,
      user_id: profile._id,
      email,
      role,
      originLocIds
    });
    return;
  }

  console.error('Unknown command:', command);
  usage();
  process.exit(1);
};

main()
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
