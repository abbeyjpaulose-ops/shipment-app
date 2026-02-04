import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Branch from '../models/Branch.js';

dotenv.config();

const { MONGO_URI } = process.env;

const validPrefix = (value) => /^[A-Z0-9]{1,3}$/.test(value);

const derivePrefix = (name = '') => {
  const alphaNumeric = String(name)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  return alphaNumeric ? alphaNumeric.slice(0, 3) : null;
};

const run = async () => {
  if (!MONGO_URI) {
    throw new Error('MONGO_URI is not set in the environment.');
  }

  await mongoose.connect(MONGO_URI);

  const cursor = Branch.find().cursor();
  let updated = 0;
  let skipped = 0;

  for await (const branch of cursor) {
    if (branch.prefix && validPrefix(branch.prefix)) {
      skipped += 1;
      continue;
    }

    const newPrefix = derivePrefix(branch.branchName);
    if (!newPrefix) {
      console.warn(`Skipping branch ${branch._id}: no derivable prefix`);
      skipped += 1;
      continue;
    }

    await Branch.updateOne(
      { _id: branch._id },
      { $set: { prefix: newPrefix } }
    );

    updated += 1;
    console.log(`Updated branch ${branch._id} with prefix ${newPrefix}`);
  }

  await mongoose.disconnect();
  console.log(`Migration complete: ${updated} updated, ${skipped} skipped.`);
};

run().catch((error) => {
  console.error('Migration failed', error);
  process.exit(1);
});
