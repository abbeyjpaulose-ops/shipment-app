import dotenv from 'dotenv';
import mongoose from 'mongoose';
import GeneratedInvoice from '../models/NewShipment/NewShipmentGeneratedInvoice.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('Set MONGO_URI in .env');
  process.exit(1);
}

const isLegacyIndex = (idx = {}) => {
  if (!idx.unique) return false;
  const key = idx.key || {};
  if (!key.invoiceNumber) return false;
  if (key.billingCategory) return false;
  if (!key.GSTIN_ID) return false;
  return true;
};

const run = async () => {
  await mongoose.connect(MONGO_URI);
  try {
    const indexes = await GeneratedInvoice.collection.indexes();
    const legacy = indexes.filter((idx) => isLegacyIndex(idx));
    if (!legacy.length) {
      console.log('No legacy generated-invoice indexes found.');
    } else {
      for (const idx of legacy) {
        console.log('Dropping legacy index', idx.name, idx.key);
        await GeneratedInvoice.collection.dropIndex(idx.name);
      }
    }

    const syncResult = await GeneratedInvoice.syncIndexes();
    console.log('Generated invoice indexes synced.', syncResult);
  } finally {
    await mongoose.disconnect();
  }
};

run().catch((err) => {
  console.error('Failed to fix generated-invoice indexes:', err);
  process.exit(1);
});
