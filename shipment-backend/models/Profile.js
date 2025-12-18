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

    // Allowed branches for this user. Admins are forced to "All Branches".
    branches: { type: [String], default: [] },
    // Default/selected branch (kept for backward compatibility and quick access).
    branch: { type: String, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    username: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, default: 'user' }
  },
  { timestamps: true }
);

ProfileSchema.pre('validate', function (next) {
  if (String(this.role || '').toLowerCase() === 'admin') {
    this.branches = ['All Branches'];
    this.branch = 'All Branches';
    return next();
  }

  // Normalize branches; support legacy single-branch writes via `branch`.
  const normalizedBranches = (Array.isArray(this.branches) ? this.branches : [])
    .map((b) => String(b || '').trim())
    .filter(Boolean);

  if (normalizedBranches.length === 0 && this.branch) {
    normalizedBranches.push(String(this.branch).trim());
  }

  // Deduplicate while preserving order
  const seen = new Set();
  this.branches = normalizedBranches.filter((b) => {
    const key = b.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (!this.branches.length) return next(new Error('branches is required'));
  if (!this.branch) this.branch = this.branches[0];
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
