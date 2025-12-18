import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 }
});

const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

const UserSchema = new mongoose.Schema(
  {
    // Primary key: auto-generated numeric GSTIN_ID (stored in _id).
    _id: { type: Number, alias: 'GSTIN_ID' },
    GSTIN: { type: String, required: true, unique: true, trim: true, uppercase: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    username: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, default: 'user' },
    companyName: { type: String, trim: true },
    companyType: { type: String, trim: true },
    phoneNumber: { type: String, trim: true },
    billingAddress: { type: String, trim: true },

    // Future: GST verification integration (optional metadata).
    gstVerification: {
      status: { type: String },
      verified: { type: Boolean, default: false },
      verifiedAt: { type: Date },
      provider: { type: String },
      referenceId: { type: String }
    }
  },
  { timestamps: true }
);

UserSchema.pre('save', async function (next) {
  if (!this.isNew || this._id !== undefined) return next();
  try {
    const counter = await Counter.findByIdAndUpdate(
      'gstinId',
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this._id = counter.seq;
    next();
  } catch (err) {
    next(err);
  }
});

UserSchema.index({ GSTIN: 1 }, { unique: true });
UserSchema.index({ email: 1 }, { unique: true });

export default mongoose.models.User || mongoose.model('User', UserSchema);
