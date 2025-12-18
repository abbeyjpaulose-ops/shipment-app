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

    branch: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    username: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, default: 'user' }
  },
  { timestamps: true }
);

ProfileSchema.pre('validate', function (next) {
  if (String(this.role || '').toLowerCase() === 'admin') {
    this.branch = 'All Branches';
  }
  if (!this.branch) return next(new Error('branch is required'));
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
