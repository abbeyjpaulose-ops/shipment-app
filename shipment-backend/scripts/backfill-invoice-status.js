import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Shipment from '../models/NewShipment/NewShipmentShipment.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('Set MONGO_URI in .env');
  process.exit(1);
}

const run = async () => {
  await mongoose.connect(MONGO_URI);

  try {
    const filter = {
      $or: [
        { invoiceStatus: { $exists: false } },
        { invoiceStatus: null },
        { invoiceStatus: '' }
      ]
    };
    const update = { $set: { invoiceStatus: 'onProcess' } };

    const result = await Shipment.updateMany(filter, update);
    console.log('Backfill invoiceStatus complete.', {
      matched: result.matchedCount,
      modified: result.modifiedCount
    });
  } finally {
    await mongoose.disconnect();
  }
};

run().catch((err) => {
  console.error('Error backfilling invoiceStatus:', err);
  process.exit(1);
});
