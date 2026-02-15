import express from 'express';
import mongoose from 'mongoose';
import Payment from '../models/Payment/Payment.js';
import PaymentEntitySummary from '../models/Payment/PaymentEntitySummary.js';
import PaymentTransaction from '../models/Payment/PaymentTransaction.js';
import PaymentAllocation from '../models/Payment/PaymentAllocation.js';
import GeneratedInvoice from '../models/NewShipment/NewShipmentGeneratedInvoice.js';
import Shipment from '../models/NewShipment/NewShipmentShipment.js';
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

function normalizePaymentStatus(raw) {
  return String(raw || '').trim().toLowerCase() === 'paid' ? 'paid' : 'pending';
}

function formatPaymentStatus(raw) {
  return normalizePaymentStatus(raw) === 'paid' ? 'Paid' : 'Pending';
}

function normalizeMoney(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(2));
}

function getInvoiceTotal(invoiceDoc) {
  const consignments = Array.isArray(invoiceDoc?.consignments) ? invoiceDoc.consignments : [];
  const total = consignments.reduce((sum, item) => sum + Number(item?.finalAmount || 0), 0);
  return normalizeMoney(total);
}

function canUseInvoiceAllocations(entityType, direction) {
  return String(entityType || '').trim() === 'client' &&
    String(direction || '').trim().toLowerCase() === 'receivable';
}

function normalizeAllocationInput(allocationsRaw) {
  if (!Array.isArray(allocationsRaw)) return [];
  const normalized = [];
  allocationsRaw.forEach((rawItem, idx) => {
    const amount = Number(rawItem?.amount);
    const invoiceId = String(rawItem?.invoiceId || '').trim();
    const invoiceNumberValue = String(rawItem?.invoiceNumber ?? '').trim();
    const invoiceNumber = invoiceNumberValue ? Number(invoiceNumberValue) : null;
    const notes = String(rawItem?.notes || '').trim();
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(`Invalid allocation amount at row ${idx + 1}`);
    }
    if (!invoiceId && !Number.isFinite(invoiceNumber)) {
      throw new Error(`Missing invoice identifier at row ${idx + 1}`);
    }
    if (invoiceId && !mongoose.Types.ObjectId.isValid(invoiceId)) {
      throw new Error(`Invalid invoiceId at row ${idx + 1}`);
    }
    normalized.push({
      amount: normalizeMoney(amount),
      invoiceId: invoiceId || '',
      invoiceNumber: Number.isFinite(invoiceNumber) ? Number(invoiceNumber) : null,
      notes
    });
  });
  return normalized;
}

async function resolveAndValidateAllocations({
  gstinId,
  entityType,
  entityId,
  direction,
  paymentAmount,
  allocationsRaw
}) {
  const normalizedAllocations = normalizeAllocationInput(allocationsRaw);
  if (!normalizedAllocations.length) return [];
  if (!canUseInvoiceAllocations(entityType, direction)) {
    throw new Error('Invoice allocations are allowed only for client receivable payments');
  }

  const invoiceIds = Array.from(
    new Set(
      normalizedAllocations
        .map((item) => String(item.invoiceId || '').trim())
        .filter(Boolean)
    )
  );
  const invoiceNumbers = Array.from(
    new Set(
      normalizedAllocations
        .map((item) => item.invoiceNumber)
        .filter((value) => Number.isFinite(value))
    )
  );

  const invoices = await GeneratedInvoice.find({
    GSTIN_ID: gstinId,
    billingClientId: entityId,
    status: { $nin: ['cancelled', 'deleted'] },
    $or: [
      ...(invoiceIds.length ? [{ _id: { $in: invoiceIds.map((id) => new mongoose.Types.ObjectId(id)) } }] : []),
      ...(invoiceNumbers.length ? [{ invoiceNumber: { $in: invoiceNumbers } }] : [])
    ]
  })
    .select('_id invoiceNumber consignments billingClientId')
    .lean();

  const invoiceById = new Map((invoices || []).map((inv) => [String(inv?._id || ''), inv]));
  const invoiceByNumber = new Map(
    (invoices || [])
      .filter((inv) => Number.isFinite(Number(inv?.invoiceNumber)))
      .map((inv) => [Number(inv.invoiceNumber), inv])
  );

  const mergedByInvoiceId = new Map();
  for (const item of normalizedAllocations) {
    const byId = item.invoiceId ? invoiceById.get(String(item.invoiceId)) : null;
    const byNumber = Number.isFinite(item.invoiceNumber) ? invoiceByNumber.get(Number(item.invoiceNumber)) : null;
    const invoice = byId || byNumber || null;
    if (!invoice?._id) {
      throw new Error('One or more allocation invoices not found for this client');
    }
    const invoiceId = String(invoice._id);
    const current = mergedByInvoiceId.get(invoiceId) || {
      invoiceId,
      invoiceNumber: Number(invoice.invoiceNumber || 0) || null,
      amount: 0,
      notes: []
    };
    current.amount = normalizeMoney(current.amount + normalizeMoney(item.amount));
    if (item.notes) current.notes.push(item.notes);
    mergedByInvoiceId.set(invoiceId, current);
  }

  const mergedAllocations = Array.from(mergedByInvoiceId.values());
  const totalAllocated = normalizeMoney(
    mergedAllocations.reduce((sum, item) => sum + normalizeMoney(item.amount), 0)
  );
  if (totalAllocated > normalizeMoney(paymentAmount) + 0.0001) {
    throw new Error('Allocated total cannot exceed payment amount');
  }

  const allocationAgg = await PaymentAllocation.aggregate([
    {
      $match: {
        GSTIN_ID: gstinId,
        entityType: 'client',
        entityId: String(entityId),
        direction: 'receivable',
        invoiceId: { $in: mergedAllocations.map((item) => new mongoose.Types.ObjectId(item.invoiceId)) },
        status: { $ne: 'voided' }
      }
    },
    {
      $group: {
        _id: '$invoiceId',
        totalAllocated: { $sum: '$amount' }
      }
    }
  ]);
  const allocatedByInvoiceId = new Map(
    (allocationAgg || []).map((row) => [String(row?._id || ''), normalizeMoney(row?.totalAllocated || 0)])
  );

  for (const item of mergedAllocations) {
    const invoice = invoiceById.get(String(item.invoiceId));
    const invoiceTotal = getInvoiceTotal(invoice);
    const alreadyAllocated = normalizeMoney(allocatedByInvoiceId.get(String(item.invoiceId)) || 0);
    const outstanding = Math.max(normalizeMoney(invoiceTotal - alreadyAllocated), 0);
    if (normalizeMoney(item.amount) > outstanding + 0.0001) {
      throw new Error(`Allocation exceeds outstanding amount for invoice ${invoice?.invoiceNumber || ''}`.trim());
    }
  }

  return mergedAllocations.map((item) => ({
    invoiceId: item.invoiceId,
    invoiceNumber: item.invoiceNumber,
    amount: normalizeMoney(item.amount),
    notes: item.notes.join(' | ')
  }));
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
    const [summaries, payments] = await Promise.all([
      PaymentEntitySummary.find({
        GSTIN_ID: gstinId,
        entityType: { $in: validTypes },
        ...(directionFilter ? { direction: directionFilter } : {})
      }).lean(),
      Payment.find({
        GSTIN_ID: gstinId,
        entityType: { $in: validTypes },
        ...(directionFilter ? { direction: directionFilter } : {})
      })
        .select('entityType entityId direction amountDue amountPaid balance paymentDate')
        .lean()
    ]);

    const makeKey = (entityType, entityId, direction) =>
      `${String(entityType || '').trim().toLowerCase()}$$${String(entityId || '').trim()}$$${String(direction || '').trim().toLowerCase() || 'receivable'}`;

    const summaryByKey = new Map();
    (summaries || []).forEach((summary) => {
      const entityType = String(summary?.entityType || '').trim().toLowerCase();
      const entityId = String(summary?.entityId || '').trim();
      if (!entityType || !entityId) return;
      const direction = normalizeDirection(summary?.direction) || requestedDirection || 'receivable';
      summaryByKey.set(makeKey(entityType, entityId, direction), summary);
    });

    const paymentAggByKey = new Map();
    (payments || []).forEach((payment) => {
      const entityType = String(payment?.entityType || '').trim().toLowerCase();
      const entityId = String(payment?.entityId || '').trim();
      if (!entityType || !entityId) return;
      const direction = normalizeDirection(payment?.direction) || requestedDirection || 'receivable';
      const key = makeKey(entityType, entityId, direction);
      const current = paymentAggByKey.get(key) || {
        entityType,
        entityId,
        direction,
        totalDue: 0,
        totalPaid: 0,
        totalBalance: 0,
        lastPaymentDate: null
      };
      current.totalDue += Number(payment?.amountDue || 0);
      current.totalPaid += Number(payment?.amountPaid || 0);
      current.totalBalance += Number(payment?.balance || 0);
      const paymentDate = payment?.paymentDate ? new Date(payment.paymentDate) : null;
      if (paymentDate && !Number.isNaN(paymentDate.getTime())) {
        if (!current.lastPaymentDate || paymentDate > new Date(current.lastPaymentDate)) {
          current.lastPaymentDate = paymentDate;
        }
      }
      paymentAggByKey.set(key, current);
    });

    const mergedByType = new Map();
    const mergedKeys = new Set([...summaryByKey.keys(), ...paymentAggByKey.keys()]);
    mergedKeys.forEach((key) => {
      const summary = summaryByKey.get(key);
      const paymentAgg = paymentAggByKey.get(key);
      const fallbackEntityType = String(summary?.entityType || paymentAgg?.entityType || '').trim().toLowerCase();
      if (!fallbackEntityType) return;
      const row = {
        entityType: fallbackEntityType,
        entityId: String(summary?.entityId || paymentAgg?.entityId || '').trim(),
        direction: String(summary?.direction || paymentAgg?.direction || requestedDirection || 'receivable').trim().toLowerCase() || 'receivable',
        totalDue: paymentAgg ? Number(paymentAgg.totalDue || 0) : Number(summary?.totalDue || 0),
        totalPaid: paymentAgg ? Number(paymentAgg.totalPaid || 0) : Number(summary?.totalPaid || 0),
        totalBalance: 0,
        lastPaymentDate: paymentAgg?.lastPaymentDate || summary?.lastPaymentDate || null
      };
      row.totalBalance = Math.max(Number(row.totalDue || 0) - Number(row.totalPaid || 0), 0);
      row.status = formatPaymentStatus(row.totalBalance <= 0 ? 'Paid' : 'Pending');
      if (!row.entityId) return;
      const arr = mergedByType.get(fallbackEntityType) || [];
      arr.push(row);
      mergedByType.set(fallbackEntityType, arr);
    });

    const response = {
      clients: [],
      branches: [],
      hubs: [],
      transportPartners: []
    };

    for (const entityType of validTypes) {
      const config = ENTITY_CONFIG[entityType];
      const typedSummaries = mergedByType.get(entityType) || [];
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
          direction: normalizeDirection(s.direction) || requestedDirection || 'receivable',
          totalDue: Number(s.totalDue || 0),
          totalPaid: Number(s.totalPaid || 0),
          totalBalance: Number(s.totalBalance || 0),
          lastPaymentDate: s.lastPaymentDate || null,
          status: formatPaymentStatus(s.status)
        }))
        .sort((a, b) => Number(b.totalBalance || 0) - Number(a.totalBalance || 0));
    }

    res.json({ data: response });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.get('/transactions', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const requestedType = String(req.query.entityType || '').trim();
    if (requestedType && !ENTITY_TYPES.includes(requestedType)) {
      return res.status(400).json({ message: 'Invalid entityType' });
    }

    const requestedDirection = normalizeDirection(req.query.direction);
    if (req.query.direction && !requestedDirection) {
      return res.status(400).json({ message: 'Invalid direction' });
    }
    const directionFilter = buildDirectionFilter(requestedDirection, true);

    const requestedStatus = String(req.query.status || '').trim().toLowerCase();
    const statusFilter = requestedStatus && requestedStatus !== 'all' ? requestedStatus : null;

    const payments = await Payment.find({
      GSTIN_ID: gstinId,
      ...(requestedType ? { entityType: requestedType } : {}),
      ...(directionFilter ? { direction: directionFilter } : {})
    })
      .select('_id entityType entityId direction')
      .lean();

    if (!payments.length) {
      return res.json({ data: [] });
    }

    const paymentById = new Map(payments.map((p) => [String(p._id), p]));
    const paymentIds = payments.map((p) => p._id);
    const txQuery = { paymentId: { $in: paymentIds } };
    if (statusFilter === 'posted') {
      txQuery.$or = [
        { status: 'posted' },
        { status: { $exists: false } },
        { status: null }
      ];
    } else if (statusFilter) {
      txQuery.status = statusFilter;
    }

    const transactions = await PaymentTransaction.find(txQuery)
      .sort({ transactionDate: -1, createdAt: -1 })
      .lean();
    const transactionIds = (transactions || []).map((tx) => tx?._id).filter(Boolean);
    const allocations = transactionIds.length
      ? await PaymentAllocation.find({
          transactionId: { $in: transactionIds }
        })
          .select('transactionId invoiceId invoiceNumber amount status voidedAt voidReason notes')
          .lean()
      : [];
    const allocationsByTransactionId = new Map();
    (allocations || []).forEach((row) => {
      const key = String(row?.transactionId || '');
      if (!key) return;
      const arr = allocationsByTransactionId.get(key) || [];
      arr.push({
        invoiceId: row?.invoiceId || null,
        invoiceNumber: Number(row?.invoiceNumber || 0) || null,
        amount: Number(row?.amount || 0),
        status: row?.status || 'posted',
        voidedAt: row?.voidedAt || null,
        voidReason: row?.voidReason || '',
        notes: row?.notes || ''
      });
      allocationsByTransactionId.set(key, arr);
    });

    const entityIdsByType = Object.fromEntries(
      ENTITY_TYPES.map((entityType) => [entityType, new Set()])
    );

    transactions.forEach((tx) => {
      const payment = paymentById.get(String(tx.paymentId || ''));
      if (!payment) return;
      const entityType = String(payment.entityType || '');
      const entityId = String(payment.entityId || '');
      if (!ENTITY_TYPES.includes(entityType)) return;
      if (!mongoose.Types.ObjectId.isValid(entityId)) return;
      entityIdsByType[entityType].add(entityId);
    });

    const entityNameMaps = {};
    for (const entityType of ENTITY_TYPES) {
      const config = ENTITY_CONFIG[entityType];
      const ids = Array.from(entityIdsByType[entityType] || []);
      if (!ids.length) {
        entityNameMaps[entityType] = new Map();
        continue;
      }
      const records = await config.model.find({ _id: { $in: ids } }).lean();
      entityNameMaps[entityType] = buildNameMap(records, config.nameField);
    }

    const data = transactions
      .map((tx) => {
        const payment = paymentById.get(String(tx.paymentId || ''));
        if (!payment) return null;
        const entityType = String(payment.entityType || '');
        const entityId = String(payment.entityId || '');
        if (!entityType || !entityId) return null;
        return {
          _id: tx._id,
          paymentId: tx.paymentId,
          invoiceId: tx.invoiceId || null,
          entityType,
          entityId,
          entityName: entityNameMaps[entityType]?.get(entityId) || entityId,
          direction: tx.direction || payment.direction || 'receivable',
          amount: Number(tx.amount || 0),
          transactionDate: tx.transactionDate || null,
          method: tx.method || '',
          referenceNo: tx.referenceNo || '',
          notes: tx.notes || '',
          status: tx.status || 'posted',
          voidedAt: tx.voidedAt || null,
          voidReason: tx.voidReason || '',
          createdAt: tx.createdAt || null,
          allocations: allocationsByTransactionId.get(String(tx._id || '')) || []
        };
      })
      .filter(Boolean);

    res.json({ data });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.get('/records', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const requestedType = String(req.query.entityType || '').trim();
    if (requestedType && !ENTITY_TYPES.includes(requestedType)) {
      return res.status(400).json({ message: 'Invalid entityType' });
    }

    const requestedDirection = normalizeDirection(req.query.direction);
    if (req.query.direction && !requestedDirection) {
      return res.status(400).json({ message: 'Invalid direction' });
    }
    const directionFilter = buildDirectionFilter(requestedDirection, true);

    const requestedStatus = String(req.query.status || '').trim().toLowerCase();
    const statusFilter = requestedStatus && requestedStatus !== 'all' ? requestedStatus : null;

    const payments = await Payment.find({
      GSTIN_ID: gstinId,
      ...(requestedType ? { entityType: requestedType } : {}),
      ...(directionFilter ? { direction: directionFilter } : {})
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();

    if (!payments.length) {
      return res.json({ data: [] });
    }

    const entityIdsByType = Object.fromEntries(
      ENTITY_TYPES.map((entityType) => [entityType, new Set()])
    );

    payments.forEach((payment) => {
      const entityType = String(payment.entityType || '');
      const entityId = String(payment.entityId || '');
      if (!ENTITY_TYPES.includes(entityType)) return;
      if (!mongoose.Types.ObjectId.isValid(entityId)) return;
      entityIdsByType[entityType].add(entityId);
    });

    const entityNameMaps = {};
    for (const entityType of ENTITY_TYPES) {
      const config = ENTITY_CONFIG[entityType];
      const ids = Array.from(entityIdsByType[entityType] || []);
      if (!ids.length) {
        entityNameMaps[entityType] = new Map();
        continue;
      }
      const records = await config.model.find({ _id: { $in: ids } }).lean();
      entityNameMaps[entityType] = buildNameMap(records, config.nameField);
    }

    const data = payments
      .filter((payment) => {
        if (!statusFilter) return true;
        const normalizedPaymentStatus = normalizePaymentStatus(payment.status);
        if (statusFilter === 'active') {
          return normalizedPaymentStatus === 'pending';
        }
        return normalizedPaymentStatus === statusFilter;
      })
      .map((payment) => {
        const entityType = String(payment.entityType || '');
        const entityId = String(payment.entityId || '');
        return {
          _id: payment._id,
          entityType,
          entityId,
          entityName: entityNameMaps[entityType]?.get(entityId) || entityId,
          direction: payment.direction || 'receivable',
          referenceNo: payment.referenceNo || '',
          amountDue: Number(payment.amountDue || 0),
          amountPaid: Number(payment.amountPaid || 0),
          balance: Number(payment.balance || 0),
          currency: payment.currency || 'INR',
          status: formatPaymentStatus(payment.status),
          paymentMethod: payment.paymentMethod || '',
          paymentDate: payment.paymentDate || null,
          dueDate: payment.dueDate || null,
          notes: payment.notes || '',
          createdAt: payment.createdAt || null,
          updatedAt: payment.updatedAt || null
        };
      });

    res.json({ data });
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

router.get('/:entityType/:entityId/invoices/outstanding', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const entityType = String(req.params.entityType || '').trim();
    const entityId = String(req.params.entityId || '').trim();
    if (entityType !== 'client') {
      return res.status(400).json({ message: 'Invoice outstanding is supported only for client entityType' });
    }
    if (!entityId) return res.status(400).json({ message: 'Missing entityId' });

    const hasObjectIdFormat = mongoose.Types.ObjectId.isValid(entityId);
    const clientMatch = hasObjectIdFormat
      ? {
          $or: [
            { billingClientId: new mongoose.Types.ObjectId(entityId) },
            { $expr: { $eq: [{ $toString: '$billingClientId' }, entityId] } }
          ]
        }
      : { $expr: { $eq: [{ $toString: '$billingClientId' }, entityId] } };

    const invoices = await GeneratedInvoice.find({
      GSTIN_ID: gstinId,
      ...clientMatch,
      status: { $nin: ['cancelled', 'deleted'] }
    })
      .select('_id invoiceNumber invoiceCode invoiceDisplayNumber consignments createdAt updatedAt status')
      .sort({ invoiceNumber: -1, createdAt: -1 })
      .lean();

    if (!invoices.length) {
      return res.json({
        data: [],
        summary: {
          invoiceCount: 0,
          totalDue: 0,
          totalAllocated: 0,
          totalBalance: 0
        }
      });
    }

    const invoiceIds = invoices.map((inv) => inv._id).filter(Boolean);
    const allocationAgg = await PaymentAllocation.aggregate([
      {
        $match: {
          GSTIN_ID: gstinId,
          entityType: 'client',
          entityId: String(entityId),
          direction: 'receivable',
          invoiceId: { $in: invoiceIds },
          status: { $ne: 'voided' }
        }
      },
      {
        $group: {
          _id: '$invoiceId',
          totalAllocated: { $sum: '$amount' }
        }
      }
    ]);
    const allocatedByInvoiceId = new Map(
      (allocationAgg || []).map((row) => [String(row?._id || ''), normalizeMoney(row?.totalAllocated || 0)])
    );

    const mappedInvoices = (invoices || []).map((invoice) => {
      const invoiceId = String(invoice?._id || '');
      const invoiceTotal = getInvoiceTotal(invoice);
      const allocated = normalizeMoney(allocatedByInvoiceId.get(invoiceId) || 0);
      const balance = Math.max(normalizeMoney(invoiceTotal - allocated), 0);
      const status = balance <= 0 ? 'Paid' : allocated > 0 ? 'Partially Paid' : 'Pending';
      return {
        invoiceId,
        invoiceNumber: Number(invoice?.invoiceNumber || 0) || null,
        invoiceCode: invoice?.invoiceCode || '',
        invoiceDisplayNumber: invoice?.invoiceDisplayNumber || '',
        totalDue: invoiceTotal,
        totalAllocated: allocated,
        totalBalance: balance,
        status,
        createdAt: invoice?.createdAt || null,
        updatedAt: invoice?.updatedAt || null
      };
    });
    const data = mappedInvoices.filter((row) => Number(row?.totalBalance || 0) > 0.0001);

    const summary = data.reduce(
      (acc, row) => {
        acc.totalDue = normalizeMoney(acc.totalDue + Number(row?.totalDue || 0));
        acc.totalAllocated = normalizeMoney(acc.totalAllocated + Number(row?.totalAllocated || 0));
        acc.totalBalance = normalizeMoney(acc.totalBalance + Number(row?.totalBalance || 0));
        return acc;
      },
      {
        invoiceCount: data.length,
        totalDue: 0,
        totalAllocated: 0,
        totalBalance: 0
      }
    );

    return res.json({ data, summary });
  } catch (err) {
    return res.status(400).json({ message: err.message });
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
    let resolvedDirection = requestedDirection || null;
    if (!resolvedDirection) {
      const [hasReceivablePayment, hasPayablePayment, hasReceivableSummary, hasPayableSummary] = await Promise.all([
        Payment.exists({ ...baseFilter, direction: buildDirectionFilter('receivable', true) }),
        Payment.exists({ ...baseFilter, direction: 'payable' }),
        PaymentEntitySummary.exists({ ...baseFilter, direction: buildDirectionFilter('receivable', true) }),
        PaymentEntitySummary.exists({ ...baseFilter, direction: 'payable' })
      ]);
      if (hasReceivablePayment || hasReceivableSummary) {
        resolvedDirection = 'receivable';
      } else if (hasPayablePayment || hasPayableSummary) {
        resolvedDirection = 'payable';
      } else {
        resolvedDirection = 'receivable';
      }
    }

    const directionFilter = buildDirectionFilter(resolvedDirection, true);
    const [payments, summaryDoc] = await Promise.all([
      Payment.find({
        ...baseFilter,
        direction: directionFilter
      })
        .sort({ updatedAt: -1, createdAt: -1 })
        .lean(),
      PaymentEntitySummary.findOne({
        ...baseFilter,
        direction: directionFilter
      }).lean()
    ]);

    const payment = payments[0] || null;
    if (payment && !payment.direction) payment.direction = resolvedDirection;

    const paymentIds = (payments || []).map((p) => p?._id).filter(Boolean);
    const transactions = paymentIds.length
      ? await PaymentTransaction.find({ paymentId: { $in: paymentIds } })
          .sort({ transactionDate: -1, createdAt: -1 })
          .lean()
      : [];
    const transactionIds = (transactions || []).map((tx) => tx?._id).filter(Boolean);
    const allocations = transactionIds.length
      ? await PaymentAllocation.find({
          transactionId: { $in: transactionIds }
        })
          .select('transactionId invoiceId invoiceNumber amount status voidedAt voidReason notes')
          .lean()
      : [];
    const allocationsByTransactionId = new Map();
    (allocations || []).forEach((row) => {
      const key = String(row?.transactionId || '');
      if (!key) return;
      const arr = allocationsByTransactionId.get(key) || [];
      arr.push({
        invoiceId: row?.invoiceId || null,
        invoiceNumber: Number(row?.invoiceNumber || 0) || null,
        amount: Number(row?.amount || 0),
        status: row?.status || 'posted',
        voidedAt: row?.voidedAt || null,
        voidReason: row?.voidReason || '',
        notes: row?.notes || ''
      });
      allocationsByTransactionId.set(key, arr);
    });
    const transactionsWithAllocations = (transactions || []).map((tx) => ({
      ...tx,
      allocations: allocationsByTransactionId.get(String(tx?._id || '')) || []
    }));

    const totalDue = payments.length
      ? (payments || []).reduce((sum, p) => sum + Number(p?.amountDue || 0), 0)
      : Number(summaryDoc?.totalDue || 0);
    const totalPaid = payments.length
      ? (payments || []).reduce((sum, p) => sum + Number(p?.amountPaid || 0), 0)
      : Number(summaryDoc?.totalPaid || 0);
    const totalBalance = Math.max(totalDue - totalPaid, 0);
    const latestPaymentDate = (payments || []).reduce((latest, p) => {
      const value = p?.paymentDate ? new Date(p.paymentDate) : null;
      if (!value || Number.isNaN(value.getTime())) return latest;
      if (!latest) return value;
      return value > latest ? value : latest;
    }, null);
    const summary = (summaryDoc || payments.length)
      ? {
          ...(summaryDoc || {}),
          direction: normalizeDirection(summaryDoc?.direction) || resolvedDirection,
          totalDue,
          totalPaid,
          totalBalance,
          lastPaymentDate: latestPaymentDate || summaryDoc?.lastPaymentDate || null,
          status: formatPaymentStatus(totalBalance <= 0 ? 'Paid' : 'Pending')
        }
      : null;

    res.json({
      payment,
      summary,
      transactions: transactionsWithAllocations
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
    const allocationsRaw = req.body?.allocations;
    const transactionDate = new Date(req.body?.transactionDate || '');

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: 'Invalid amount' });
    }
    if (!method) return res.status(400).json({ message: 'Missing method' });
    if (Number.isNaN(transactionDate.getTime())) {
      return res.status(400).json({ message: 'Invalid transactionDate' });
    }
    const allocations = await resolveAndValidateAllocations({
      gstinId,
      entityType,
      entityId,
      direction,
      paymentAmount: amount,
      allocationsRaw
    });

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

    const requestedInvoiceIdRaw = String(req.body?.invoiceId || '').trim();
    const requestedInvoiceId = requestedInvoiceIdRaw && mongoose.Types.ObjectId.isValid(requestedInvoiceIdRaw)
      ? new mongoose.Types.ObjectId(requestedInvoiceIdRaw)
      : null;
    const transactionInvoiceId = allocations.length === 1
      ? new mongoose.Types.ObjectId(String(allocations[0].invoiceId))
      : requestedInvoiceId;

    const transaction = await PaymentTransaction.create({
      paymentId: payment._id,
      ...(transactionInvoiceId ? { invoiceId: transactionInvoiceId } : {}),
      direction: payment.direction || direction,
      amount,
      transactionDate,
      method,
      referenceNo: referenceNo || undefined,
      notes: notes || undefined,
      status: 'posted'
    });

    if (allocations.length) {
      await PaymentAllocation.insertMany(
        allocations.map((allocation) => ({
          GSTIN_ID: gstinId,
          paymentId: payment._id,
          transactionId: transaction._id,
          entityType,
          entityId,
          direction: payment.direction || direction,
          invoiceId: allocation.invoiceId,
          invoiceNumber: allocation.invoiceNumber || undefined,
          amount: normalizeMoney(allocation.amount),
          status: 'posted',
          notes: allocation.notes || undefined
        }))
      );
    }

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
      transaction,
      allocations
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
    const allocationRows = await PaymentAllocation.find({
      transactionId: transaction._id
    })
      .select('_id invoiceId')
      .lean();
    const allocationInvoiceIds = Array.from(
      new Set(
        (allocationRows || [])
          .map((row) => String(row?.invoiceId || '').trim())
          .filter((id) => id && mongoose.Types.ObjectId.isValid(id))
      )
    );
    if (allocationRows.length) {
      const allocationUpdate = {
        status: 'voided',
        voidedAt: new Date()
      };
      if (voidReason) allocationUpdate.voidReason = voidReason;
      await PaymentAllocation.updateMany(
        {
          transactionId: transaction._id,
          status: { $ne: 'voided' }
        },
        { $set: allocationUpdate }
      );
    }

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

    const invoiceIdCandidates = new Set(allocationInvoiceIds);
    const isInvoiceTransaction =
      String(transaction.method || '').trim().toLowerCase() === 'invoice' ||
      Boolean(transaction.invoiceId);

    if (isInvoiceTransaction) {
      const invoiceId = String(transaction.invoiceId || '').trim();
      if (invoiceId && mongoose.Types.ObjectId.isValid(invoiceId)) {
        invoiceIdCandidates.add(invoiceId);
      } else {
        const invoiceRef = String(transaction.referenceNo || '').trim();
        const match = invoiceRef.match(/^INV-(\d+)$/i);
        if (match?.[1]) {
          const refInvoice = await GeneratedInvoice.findOne({
            GSTIN_ID: gstinId,
            invoiceNumber: Number(match[1]),
            status: { $nin: ['cancelled', 'deleted'] }
          }).sort({ createdAt: -1 });
          if (refInvoice?._id) {
            invoiceIdCandidates.add(String(refInvoice._id));
          }
        }
      }
    }

    const invoiceIdsToRefresh = Array.from(invoiceIdCandidates)
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));
    const invoices = invoiceIdsToRefresh.length
      ? await GeneratedInvoice.find({
          _id: { $in: invoiceIdsToRefresh },
          GSTIN_ID: gstinId
        })
      : [];
    for (const invoice of invoices) {
      const invoiceStatus = String(invoice.status || '').trim().toLowerCase();
      if (['cancelled', 'deleted'].includes(invoiceStatus)) continue;
      invoice.status = 'Active';
      await invoice.save();

      const consignmentNumbers = (invoice.consignments || [])
        .map((c) => String(c?.consignmentNumber || '').trim())
        .filter(Boolean);

      if (consignmentNumbers.length) {
        await Shipment.updateMany(
          { GSTIN_ID: gstinId, consignmentNumber: { $in: consignmentNumbers } },
          { $set: { shipmentStatus: 'Invoiced' } }
        );
      }

      const clientIds = invoice.billingClientId ? [String(invoice.billingClientId)] : [];
      if (clientIds.length) {
        await syncPaymentsFromGeneratedInvoices(gstinId, clientIds, { preserveStatus: true });
      }
    }

    const invoice = invoices[0] || null;
    res.json({ transaction, payment, summary, invoice, invoices });
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
