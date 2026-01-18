import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 }
});

const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

const ProfileSchema = new mongoose.Schema(
  {
    // Primary key: auto-generated numeric user_id (stored in _id).
    _id: { type: Number, alias: 'user_id' },

    // Link to the company (User) via GSTIN_ID (User _id).
    GSTIN_ID: { type: Number, ref: 'User', required: true, index: true },

    // Allowed branch ids for this user. Admins get all branches.
    branchIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    // Default/selected branch id.
    branchId: { type: mongoose.Schema.Types.ObjectId },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    username: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, default: 'user' },
    phoneNumber: { type: String, trim: true },
    businessType: { type: String, trim: true }
  },
  { timestamps: true }
);

ProfileSchema.pre('validate', function (next) {
  if (String(this.role || '').toLowerCase() === 'admin') {
    this.branchIds = [];
    this.branchId = null;
    return next();
  }

  // Normalize branch ids; support legacy single-branch writes via `branchId`.
  const normalizedBranchIds = (Array.isArray(this.branchIds) ? this.branchIds : [])
    .map((b) => String(b || '').trim())
    .filter(Boolean);

  if (normalizedBranchIds.length === 0 && this.branchId) {
    normalizedBranchIds.push(String(this.branchId).trim());
  }

  // Deduplicate while preserving order
  const seen = new Set();
  this.branchIds = normalizedBranchIds.filter((b) => {
    const key = b.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (!this.branchIds.length) return next(new Error('branchIds is required'));
  if (!this.branchId) this.branchId = this.branchIds[0];
  next();
});

ProfileSchema.pre('save', async function (next) {
  if (!this.isNew || this._id !== undefined) return next();
  try {
    const counter = await Counter.findByIdAndUpdate(
      'profileUserId',
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this._id = counter.seq;
    next();
  } catch (err) {
    next(err);
  }
});

ProfileSchema.index({ GSTIN_ID: 1 });
ProfileSchema.index({ email: 1 }, { unique: true });

export default mongoose.models.Profile || mongoose.model('Profile', ProfileSchema);
