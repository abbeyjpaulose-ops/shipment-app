import dotenv from 'dotenv';
import mongoose from 'mongoose';
import PreInvoiceItem from '../models/NewShipment/NewShipmentPreInvoiceItem.js';
import Shipment from '../models/NewShipment/NewShipmentShipment.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('Set MONGO_URI in .env');
  process.exit(1);
}

const normalizeCharges = (charges = {}) => ({
  odc: Number(charges?.odc || 0),
  unloading: Number(charges?.unloading || 0),
  docket: Number(charges?.docket || 0),
  other: Number(charges?.other || 0),
  ccc: Number(charges?.ccc || 0),
  consignorDiscount: Number(charges?.consignorDiscount || 0)
});

const run = async () => {
  await mongoose.connect(MONGO_URI);

  try {
    const filter = {
      $or: [
        { igstPercent: { $exists: false } },
        { igstAmount: { $exists: false } },
        { finalAmount: { $exists: false } },
        { initialPaid: { $exists: false } },
        { charges: { $exists: false } }
      ]
    };

    const items = await PreInvoiceItem.find(filter)
      .select('_id shipmentId taxableValue igstPercent igstAmount finalAmount initialPaid charges')
      .lean();

    if (!items.length) {
      console.log('No pre-invoice items require backfill.');
      return;
    }

    const shipmentIds = items
      .map((item) => String(item?.shipmentId || ''))
      .filter(Boolean);

    const shipments = shipmentIds.length
      ? await Shipment.find({ _id: { $in: shipmentIds } })
          .select('_id taxableValue igstPercent finalAmount initialPaid charges')
          .lean()
      : [];

    const shipmentById = new Map((shipments || []).map((s) => [String(s._id), s]));

    const updates = [];
    let skipped = 0;

    for (const item of items) {
      const shipment = shipmentById.get(String(item?.shipmentId || ''));
      if (!shipment) {
        skipped += 1;
        continue;
      }

      const taxableValue = Number(item?.taxableValue ?? shipment?.taxableValue ?? 0);
      const igstPercent = Number(item?.igstPercent ?? shipment?.igstPercent ?? 0);
      const igstAmount = Number(item?.igstAmount ?? (taxableValue * (igstPercent / 100)));
      const finalAmount = Number(item?.finalAmount ?? shipment?.finalAmount ?? (taxableValue + igstAmount));
      const initialPaid = Number(item?.initialPaid ?? shipment?.initialPaid ?? 0);

      const hasCharges = item?.charges && typeof item.charges === 'object';
      const missingChargeField = !hasCharges || ['odc', 'unloading', 'docket', 'other', 'ccc', 'consignorDiscount']
        .some((key) => item?.charges?.[key] === undefined);

      const set = {};
      if (item?.igstPercent === undefined) set.igstPercent = igstPercent;
      if (item?.igstAmount === undefined) set.igstAmount = igstAmount;
      if (item?.finalAmount === undefined) set.finalAmount = finalAmount;
      if (item?.initialPaid === undefined) set.initialPaid = initialPaid;
      if (missingChargeField) set.charges = normalizeCharges(shipment?.charges || {});

      if (Object.keys(set).length === 0) {
        skipped += 1;
        continue;
      }

      updates.push({
        updateOne: {
          filter: { _id: item._id },
          update: { $set: set }
        }
      });
    }

    if (!updates.length) {
      console.log('No updates needed after evaluation.', { skipped });
      return;
    }

    const result = await PreInvoiceItem.bulkWrite(updates);
    console.log('Pre-invoice item backfill complete.', {
      matched: result.matchedCount,
      modified: result.modifiedCount,
      skipped
    });
  } finally {
    await mongoose.disconnect();
  }
};

run().catch((err) => {
  console.error('Error backfilling pre-invoice items:', err);
  process.exit(1);
});
