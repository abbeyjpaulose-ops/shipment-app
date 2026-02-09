import dotenv from 'dotenv';
import mongoose from 'mongoose';
import PreInvoice from '../models/NewShipment/NewShipmentPreInvoice.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('Set MONGO_URI in .env');
  process.exit(1);
}

const isLegacyIndex = (key = {}) => {
  const keys = Object.keys(key);
  if (keys.length === 2) {
    return key.GSTIN_ID === 1 && key.preInvoiceNumber === 1;
  }
  if (keys.length === 3) {
    return key.GSTIN_ID === 1 && key.originLocId === 1 && key.preInvoiceNumber === 1;
  }
  return false;
};

const run = async () => {
  await mongoose.connect(MONGO_URI);
  try {
    const indexes = await PreInvoice.collection.indexes();
    const legacy = indexes.filter((idx) => isLegacyIndex(idx.key));
    if (!legacy.length) {
      console.log('No legacy pre-invoice indexes found.');
    } else {
      for (const idx of legacy) {
        console.log('Dropping legacy index', idx.name, idx.key);
        await PreInvoice.collection.dropIndex(idx.name);
      }
    }

    const syncResult = await PreInvoice.syncIndexes();
    console.log('Pre-invoice indexes synced.', syncResult);
  } finally {
    await mongoose.disconnect();
  }
};

run().catch((err) => {
  console.error('Failed to fix pre-invoice indexes:', err);
  process.exit(1);
});
