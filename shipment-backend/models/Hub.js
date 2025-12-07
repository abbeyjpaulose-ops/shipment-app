// shipment-backend/models/Hub.js
import mongoose from 'mongoose';

// Vehicle under a particular delivery address
const VehicleSchema = new mongoose.Schema({
  vehicleNo: { type: String, required: true },
  driverPhone: { type: String, required: true }
});

// Delivery / Pickup Address with vehicles mapped to it
const AddressSchema = new mongoose.Schema({
  location: { type: String, required: true },
  vehicles: {
    type: [VehicleSchema],
    default: []
  }
});

const HubSchema = new mongoose.Schema({
  hubName: { type: String, required: true },
  address: { type: String, required: true },
  city: { type: String },
  state: { type: String },
  pinCode: { type: String },
  GSTIN: { type: String, required: true },
  perRev: { type: Number, required: true },
  phoneNum: { type: String, required: true },

  // ⬇️ Vehicles grouped under each delivery location
  deliveryAddresses: {
    type: [AddressSchema],
    default: []
  },

  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  email: { type: String, required: true },
  username: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

// Ensure unique hub per user
HubSchema.index({ hubName: 1, address: 1, email: 1 }, { unique: true });

export default mongoose.models.Hub || mongoose.model('Hub', HubSchema);
