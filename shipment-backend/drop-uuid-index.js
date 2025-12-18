import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('Set MONGO_URI in .env');
  process.exit(1);
}

const run = async () => {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  try {
    const result = await db.collection('users').dropIndex('uuid_1');
    console.log('Dropped index:', result);
  } catch (err) {
    if (err.codeName === 'IndexNotFound') {
      console.log('Index uuid_1 not found; nothing to drop.');
    } else {
      throw err;
    }
  } finally {
    await mongoose.disconnect();
  }
};

run().catch((err) => {
  console.error('Error dropping index:', err);
  process.exit(1);
});
