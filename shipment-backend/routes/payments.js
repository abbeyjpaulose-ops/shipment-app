import express from 'express';
import mongoose from 'mongoose';
import Payment from '../models/Payment/Payment.js';
import PaymentEntitySummary from '../models/Payment/PaymentEntitySummary.js';
import PaymentTransaction from '../models/Payment/PaymentTransaction.js';
import Client from '../models/Client.js';
import Branch from '../models/Branch.js';
import Hub from '../models/Hub.js';
import TransportPartner from '../models/TransportPartner.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { syncPaymentsFromGeneratedInvoices } from '../services/paymentSync.js';

const router = express.Router();

const ENTITY_CONFIG = {
  client: { key: 'clients', model: Client, nameField: 'clientName' },
  branch: { key: 'branches', model: Branch, nameField: 'branchName' },
  hub: { key: 'hubs', model: Hub, nameField: 'hubName' },
  transport_partner: { key: 'transportPartners', model: TransportPartner, nameField: 'partnerName' }
};

const ENTITY_TYPES = Object.keys(ENTITY_CONFIG);
const DIRECTION_TYPES = ['receivable', 'payable'];

function normalizeDirection(raw) {
  const direction = String(raw || '').trim().toLowerCase();
  if (!direction) return null;
  return DIRECTION_TYPES.includes(direction) ? direction : null;
}

function buildDirectionFilter(direction, includeMissing = false) {
  if (!direction) return null;
  return includeMissing ? { $in: [direction, null] } : direction;
}

function buildNameMap(records, nameField) {
  const map = new Map();
  (records || []).forEach((rec) => {
    const id = String(rec?._id || '');
    if (!id) return;
    map.set(id, rec?.[nameField] || id);
  });
  return map;
}

router.get('/summary', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const requestedType = String(req.query.entityType || '').trim();
    const types = requestedType ? [requestedType] : ENTITY_TYPES;
    const validTypes = types.filter((t) => ENTITY_TYPES.includes(t));

    if (!validTypes.length) {
      return res.status(400).json({ message: 'Invalid entityType' });
    }

    const requestedDirection = normalizeDirection(req.query.direction);
    if (req.query.direction && !requestedDirection) {
      return res.status(400).json({ message: 'Invalid direction' });
    }

    const directionFilter = buildDirectionFilter(requestedDirection, true);
    const summaries = await PaymentEntitySummary.find({
      GSTIN_ID: gstinId,
      entityType: { $in: validTypes },
      ...(directionFilter ? { direction: directionFilter } : {})
    }).lean();

    const response = {
      clients: [],
      branches: [],
      hubs: [],
      transportPartners: []
    };

    for (const entityType of validTypes) {
      const config = ENTITY_CONFIG[entityType];
      const typedSummaries = summaries.filter((s) => s.entityType === entityType);
      const entityIds = typedSummaries.map((s) => String(s.entityId || '')).filter(Boolean);
      const validEntityIds = entityIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
      const entities = validEntityIds.length
        ? await config.model.find({ _id: { $in: validEntityIds } }).lean()
        : [];
      const names = buildNameMap(entities, config.nameField);

      response[config.key] = typedSummaries
        .map((s) => ({
          entityId: String(s.entityId || ''),
          name: names.get(String(s.entityId || '')) || String(s.entityId || ''),
          direction: s.direction || requestedDirection || 'receivable',
          totalDue: s.totalDue || 0,
          totalPaid: s.totalPaid || 0,
          totalBalance: s.totalBalance || 0,
          lastPaymentDate: s.lastPaymentDate || null,
          status: s.status || 'Pending'
        }))
        .sort((a, b) => Number(b.totalBalance || 0) - Number(a.totalBalance || 0));
    }

    res.json({ data: response });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/sync/generated-invoices', requireAuth, requireAdmin, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const clientIds = Array.isArray(req.body?.clientIds) ? req.body.clientIds : null;
    const result = await syncPaymentsFromGeneratedInvoices(gstinId, clientIds);
    res.json({
      message: 'Payments synced from generated invoices',
      entities: result.entities
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.get('/:entityType/:entityId/transactions', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const entityType = String(req.params.entityType || '').trim();
    const entityId = String(req.params.entityId || '').trim();
    if (!ENTITY_TYPES.includes(entityType)) {
      return res.status(400).json({ message: 'Invalid entityType' });
    }
    if (!entityId) return res.status(400).json({ message: 'Missing entityId' });

    const requestedDirection = normalizeDirection(req.query.direction);
    if (req.query.direction && !requestedDirection) {
      return res.status(400).json({ message: 'Invalid direction' });
    }

    const baseFilter = { GSTIN_ID: gstinId, entityType, entityId };
    let payment = null;
    let resolvedDirection = requestedDirection || null;

    if (requestedDirection) {
      payment = await Payment.findOne({
        ...baseFilter,
        direction: buildDirectionFilter(requestedDirection, true)
      }).lean();
    } else {
      payment = await Payment.findOne({
        ...baseFilter,
        direction: buildDirectionFilter('receivable', true)
      }).lean();
      if (!payment) {
        payment = await Payment.findOne({ ...baseFilter, direction: 'payable' }).lean();
      }
    }

    if (!resolvedDirection) {
      resolvedDirection = payment?.direction || 'receivable';
    }

    const summary = await PaymentEntitySummary.findOne({
      ...baseFilter,
      direction: buildDirectionFilter(resolvedDirection, true)
    }).lean();

    if (payment && !payment.direction) payment.direction = resolvedDirection;
    if (summary && !summary.direction) summary.direction = resolvedDirection;

    const transactions = payment
      ? await PaymentTransaction.find({ paymentId: payment._id })
          .sort({ transactionDate: -1, createdAt: -1 })
          .lean()
      : [];

    res.json({
      payment,
      summary,
      transactions
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/:entityType/:entityId/summary/due', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const entityType = String(req.params.entityType || '').trim();
    const entityId = String(req.params.entityId || '').trim();
    if (!ENTITY_TYPES.includes(entityType)) {
      return res.status(400).json({ message: 'Invalid entityType' });
    }
    if (!entityId) return res.status(400).json({ message: 'Missing entityId' });

    const requestedDirection = normalizeDirection(req.body?.direction ?? req.query?.direction);
    if ((req.body?.direction || req.query?.direction) && !requestedDirection) {
      return res.status(400).json({ message: 'Invalid direction' });
    }
    const direction = requestedDirection || 'receivable';
    const directionFilter = buildDirectionFilter(direction, true);

    const totalDue = Number(req.body?.totalDue);
    if (!Number.isFinite(totalDue) || totalDue < 0) {
      return res.status(400).json({ message: 'Invalid totalDue' });
    }

    let summary = await PaymentEntitySummary.findOne({
      GSTIN_ID: gstinId,
      entityType,
      entityId,
      direction: directionFilter
    });
    if (!summary) {
      summary = await PaymentEntitySummary.create({
        GSTIN_ID: gstinId,
        entityType,
        entityId,
        direction,
        totalDue,
        totalPaid: 0,
        totalBalance: totalDue,
        status: totalDue <= 0 ? 'Paid' : 'Pending'
      });
    } else {
      const paid = Number(summary.totalPaid || 0);
      const balance = Math.max(totalDue - paid, 0);
      summary.totalDue = totalDue;
      summary.totalBalance = balance;
      summary.status = balance <= 0 ? 'Paid' : 'Pending';
      summary.direction = direction;
      await summary.save();
    }

    let payment = await Payment.findOne({
      GSTIN_ID: gstinId,
      entityType,
      entityId,
      direction: directionFilter
    });
    if (!payment) {
      payment = await Payment.create({
        GSTIN_ID: gstinId,
        entityType,
        entityId,
        direction,
        amountDue: summary.totalDue || 0,
        amountPaid: summary.totalPaid || 0,
        balance: summary.totalBalance || 0,
        status: summary.status || 'Pending'
      });
    } else {
      payment.amountDue = summary.totalDue || 0;
      payment.amountPaid = summary.totalPaid || 0;
      payment.balance = summary.totalBalance || 0;
      payment.status = summary.status || 'Pending';
      payment.direction = direction;
      await payment.save();
    }

    res.json({ summary, payment });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/:entityType/:entityId/transactions', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const entityType = String(req.params.entityType || '').trim();
    const entityId = String(req.params.entityId || '').trim();
    if (!ENTITY_TYPES.includes(entityType)) {
      return res.status(400).json({ message: 'Invalid entityType' });
    }
    if (!entityId) return res.status(400).json({ message: 'Missing entityId' });

    const requestedDirection = normalizeDirection(req.body?.direction ?? req.query?.direction);
    if ((req.body?.direction || req.query?.direction) && !requestedDirection) {
      return res.status(400).json({ message: 'Invalid direction' });
    }
    const direction = requestedDirection || 'receivable';
    const directionFilter = buildDirectionFilter(direction, true);

    const amount = Number(req.body?.amount || 0);
    const method = String(req.body?.method || '').trim();
    const referenceNo = String(req.body?.referenceNo || '').trim();
    const notes = String(req.body?.notes || '').trim();
    const transactionDate = new Date(req.body?.transactionDate || '');

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: 'Invalid amount' });
    }
    if (!method) return res.status(400).json({ message: 'Missing method' });
    if (Number.isNaN(transactionDate.getTime())) {
      return res.status(400).json({ message: 'Invalid transactionDate' });
    }

    let summary = await PaymentEntitySummary.findOne({
      GSTIN_ID: gstinId,
      entityType,
      entityId,
      direction: directionFilter
    });

    if (!summary) {
      summary = await PaymentEntitySummary.create({
        GSTIN_ID: gstinId,
        entityType,
        entityId,
        direction,
        totalDue: 0,
        totalPaid: 0,
        totalBalance: 0,
        status: 'Pending'
      });
    }

    let payment = await Payment.findOne({
      GSTIN_ID: gstinId,
      entityType,
      entityId,
      direction: directionFilter
    });
    if (!payment) {
      payment = await Payment.create({
        GSTIN_ID: gstinId,
        entityType,
        entityId,
        direction,
        amountDue: summary.totalDue || 0,
        amountPaid: summary.totalPaid || 0,
        balance: summary.totalBalance || 0,
        status: summary.status || 'Pending'
      });
    }

    const updatedPaid = Number(payment.amountPaid || 0) + amount;
    const due = Number(payment.amountDue || 0);
    const balance = Math.max(due - updatedPaid, 0);
    const status = balance <= 0 ? 'Paid' : 'Pending';

    payment.amountPaid = updatedPaid;
    payment.balance = balance;
    payment.status = status;
    payment.paymentMethod = method;
    payment.paymentDate = transactionDate;
    payment.direction = direction;
    if (referenceNo) payment.referenceNo = referenceNo;
    if (notes) payment.notes = notes;
    await payment.save();

    const transaction = await PaymentTransaction.create({
      paymentId: payment._id,
      direction: payment.direction || direction,
      amount,
      transactionDate,
      method,
      referenceNo: referenceNo || undefined,
      notes: notes || undefined,
      status: 'posted'
    });

    const summaryPaid = Number(summary.totalPaid || 0) + amount;
    const summaryDue = Number(summary.totalDue || 0);
    const summaryBalance = Math.max(summaryDue - summaryPaid, 0);

    summary.totalPaid = summaryPaid;
    summary.totalBalance = summaryBalance;
    summary.lastPaymentDate = transactionDate;
    summary.status = summaryBalance <= 0 ? 'Paid' : 'Pending';
    summary.direction = direction;
    await summary.save();

    res.status(201).json({
      payment,
      summary,
      transaction
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/:entityType/:entityId/transactions/:transactionId/void', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const entityType = String(req.params.entityType || '').trim();
    const entityId = String(req.params.entityId || '').trim();
    const transactionId = String(req.params.transactionId || '').trim();
    if (!ENTITY_TYPES.includes(entityType)) {
      return res.status(400).json({ message: 'Invalid entityType' });
    }
    if (!entityId) return res.status(400).json({ message: 'Missing entityId' });
    if (!transactionId) return res.status(400).json({ message: 'Missing transactionId' });

    const transaction = await PaymentTransaction.findOne({ _id: transactionId });
    if (!transaction) return res.status(404).json({ message: 'Transaction not found' });
    if (String(transaction.status || '') === 'voided') {
      return res.status(400).json({ message: 'Transaction already voided' });
    }

    const payment = await Payment.findOne({
      _id: transaction.paymentId,
      GSTIN_ID: gstinId,
      entityType,
      entityId
    });
    if (!payment) return res.status(404).json({ message: 'Payment not found' });

    const voidReason = String(req.body?.voidReason || '').trim();
    transaction.status = 'voided';
    transaction.voidedAt = new Date();
    if (!transaction.direction && payment.direction) transaction.direction = payment.direction;
    if (voidReason) transaction.voidReason = voidReason;
    await transaction.save();

    const amount = Number(transaction.amount || 0);
    const paid = Math.max(Number(payment.amountPaid || 0) - amount, 0);
    const due = Number(payment.amountDue || 0);
    const balance = Math.max(due - paid, 0);
    payment.amountPaid = paid;
    payment.balance = balance;
    payment.status = balance <= 0 ? 'Paid' : 'Pending';

    const lastPosted = await PaymentTransaction.findOne({
      paymentId: payment._id,
      status: { $ne: 'voided' }
    }).sort({ transactionDate: -1, createdAt: -1 });
    payment.paymentDate = lastPosted?.transactionDate || null;
    await payment.save();

    const direction = payment.direction || 'receivable';
    const summary = await PaymentEntitySummary.findOne({
      GSTIN_ID: gstinId,
      entityType,
      entityId,
      direction: buildDirectionFilter(direction, true)
    });
    if (summary) {
      const summaryPaid = Math.max(Number(summary.totalPaid || 0) - amount, 0);
      const summaryDue = Number(summary.totalDue || 0);
      const summaryBalance = Math.max(summaryDue - summaryPaid, 0);
      summary.totalPaid = summaryPaid;
      summary.totalBalance = summaryBalance;
      summary.lastPaymentDate = lastPosted?.transactionDate || null;
      summary.status = summaryBalance <= 0 ? 'Paid' : 'Pending';
      summary.direction = direction;
      await summary.save();
    }

    res.json({ transaction, payment, summary });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Admin-only: backfill invoiceId for invoice transactions using referenceNo (INV-<number>)
router.post('/transactions/backfill-invoice-ids', requireAuth, requireAdmin, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const txs = await PaymentTransaction.find({
      invoiceId: { $exists: false },
      method: 'Invoice',
      referenceNo: { $regex: /^INV-/ }
    }).lean();

    if (!txs.length) {
      return res.json({ message: 'No invoice transactions to backfill', updated: 0 });
    }

    const numbers = Array.from(
      new Set(
        txs
          .map((t) => String(t.referenceNo || '').replace(/^INV-/, '').trim())
          .filter((n) => n && !Number.isNaN(Number(n)))
      )
    );

    const invoices = numbers.length
      ? await GeneratedInvoice.find({
          GSTIN_ID: gstinId,
          invoiceNumber: { $in: numbers.map((n) => Number(n)) }
        }).select('_id invoiceNumber').lean()
      : [];
    const invoiceByNumber = new Map(
      invoices.map((inv) => [String(inv.invoiceNumber), inv._id])
    );

    const ops = txs
      .map((tx) => {
        const num = String(tx.referenceNo || '').replace(/^INV-/, '').trim();
        const invoiceId = invoiceByNumber.get(num);
        if (!invoiceId) return null;
        return {
          updateOne: {
            filter: { _id: tx._id },
            update: { $set: { invoiceId } }
          }
        };
      })
      .filter(Boolean);

    if (!ops.length) {
      return res.json({ message: 'No matching invoices found', updated: 0 });
    }

    const result = await PaymentTransaction.bulkWrite(ops);
    res.json({ message: 'Invoice IDs backfilled', updated: result.modifiedCount ?? 0 });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

export default router;
