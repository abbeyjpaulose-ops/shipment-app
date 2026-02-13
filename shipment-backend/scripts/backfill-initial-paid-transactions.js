import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Shipment from '../models/NewShipment/NewShipmentShipment.js';
import Payment from '../models/Payment/Payment.js';
import PaymentTransaction from '../models/Payment/PaymentTransaction.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('Set MONGO_URI in .env');
  process.exit(1);
}

function normalizeDirection(raw) {
  const value = String(raw || '').trim().toLowerCase();
  return value === 'payable' ? 'payable' : 'receivable';
}

function buildPaymentReference(shipment) {
  const originReference = String(shipment?.originLocId || '').trim();
  return `${originReference}$$${String(shipment?._id || '')}`;
}

function buildInitialPaidReference(shipmentId) {
  return `INITPAID-${String(shipmentId || '')}`;
}

const run = async () => {
  await mongoose.connect(MONGO_URI);
  try {
    const shipments = await Shipment.find({
      initialPaid: { $gt: 0 },
      GSTIN_ID: { $exists: true }
    })
      .select('_id GSTIN_ID consignmentNumber originLocId initialPaid date createdAt')
      .lean();

    let scanned = 0;
    let created = 0;
    let skippedNoPayment = 0;
    let skippedNoDelta = 0;
    let skippedExistingInitialTx = 0;
    let errors = 0;

    for (const shipment of shipments) {
      scanned += 1;
      try {
        const gstinId = Number(shipment?.GSTIN_ID);
        if (!Number.isFinite(gstinId)) {
          skippedNoPayment += 1;
          continue;
        }

        const payment = await Payment.findOne({
          GSTIN_ID: gstinId,
          referenceNo: buildPaymentReference(shipment),
          direction: { $in: ['receivable', null] }
        })
          .sort({ updatedAt: -1, createdAt: -1 })
          .lean();

        if (!payment?._id) {
          skippedNoPayment += 1;
          continue;
        }

        const paymentId = payment._id;
        const direction = normalizeDirection(payment?.direction);
        const initialPaidRef = buildInitialPaidReference(shipment?._id);
        const existingInitialPaidTx = await PaymentTransaction.findOne({
          paymentId,
          method: 'Initial Paid',
          referenceNo: initialPaidRef
        })
          .select('_id')
          .lean();
        if (existingInitialPaidTx?._id) {
          skippedExistingInitialTx += 1;
          continue;
        }

        const targetPaid = Math.max(
          Number(payment?.amountPaid ?? shipment?.initialPaid ?? 0) || 0,
          0
        );
        if (!(targetPaid > 0)) {
          skippedNoDelta += 1;
          continue;
        }

        const postedTransactions = await PaymentTransaction.find({
          paymentId,
          status: { $ne: 'voided' }
        })
          .select('amount')
          .lean();
        const postedTotal = (postedTransactions || []).reduce(
          (sum, tx) => sum + Math.max(Number(tx?.amount) || 0, 0),
          0
        );
        const missingAmount = Math.max(targetPaid - postedTotal, 0);
        if (!(missingAmount > 0)) {
          skippedNoDelta += 1;
          continue;
        }

        await PaymentTransaction.create({
          paymentId,
          direction,
          amount: missingAmount,
          transactionDate: shipment?.date || shipment?.createdAt || new Date(),
          method: 'Initial Paid',
          referenceNo: initialPaidRef,
          notes: `Initial paid captured for consignment ${String(shipment?.consignmentNumber || '')}`.trim(),
          status: 'posted'
        });
        created += 1;
      } catch (err) {
        errors += 1;
        console.error('Failed to backfill shipment initial-paid transaction', {
          shipmentId: String(shipment?._id || ''),
          consignmentNumber: String(shipment?.consignmentNumber || ''),
          err: err?.message || err
        });
      }
    }

    console.log('Backfill initial-paid transactions complete.', {
      scanned,
      created,
      skippedNoPayment,
      skippedNoDelta,
      skippedExistingInitialTx,
      errors
    });
  } finally {
    await mongoose.disconnect();
  }
};

run().catch((err) => {
  console.error('Error backfilling initial-paid transactions:', err);
  process.exit(1);
});
