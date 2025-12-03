import mongoose from 'mongoose';

const profileSchema = new mongoose.Schema({
  name: { type: String, required: true },
  address: { type: String },
  company: { type: String },
  mobile: { type: String },
  email: { type: String, required: true },
  role: { type: String },
  photo: { type: String },          // base64 string for image
  businessType: { type: String },   // e.g., GTA-5%, Parcel-12%, Courier-18%
  pricePerNumber: { type: Number, default: 0 },
  pricePerKg: { type: Number, default: 0 },
  pricePerArea: { type: Number, default: 0 },
  username: { type: String },       // optional, if you track login
}, { timestamps: true });

const Profile = mongoose.model('Profile', profileSchema);

export default Profile;
