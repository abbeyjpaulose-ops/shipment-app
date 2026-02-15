import express from 'express';
import mongoose from 'mongoose';
import Branch from '../models/Branch.js';
import RunningCostDay from '../models/RunningCostDay.js';
import Payment from '../models/Payment/Payment.js';
import PaymentEntitySummary from '../models/Payment/PaymentEntitySummary.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
const PAYABLE_DIRECTION = 'payable';
const PAYABLE_DIRECTION_FILTER = { $in: [PAYABLE_DIRECTION, null] };
const RUNNING_COST_ENTRY_CONFIG = {
  fuel: { arrayField: 'fuelEntries', label: 'Fuel entry' },
  workers: { arrayField: 'workerEntries', label: 'Worker wage entry' },
  maintenance: { arrayField: 'maintenanceEntries', label: 'Maintenance entry' }
};
const RUNNING_COST_PAYMENT_CONFIG = [
  { key: 'fuel', referenceNo: 'RC-FUEL', notes: 'Running cost - fuel (auto-synced)' },
  { key: 'workers', referenceNo: 'RC-WORKERS', notes: 'Running cost - workers (auto-synced)' },
  { key: 'maintenance', referenceNo: 'RC-MAINTENANCE', notes: 'Running cost - maintenance (auto-synced)' }
];
const RUNNING_COST_REFERENCE_SET = new Set(RUNNING_COST_PAYMENT_CONFIG.map((item) => item.referenceNo));

function normalizeoriginLocIds(ids) {
  if (!Array.isArray(ids)) return [];
  return ids.map((id) => String(id || '').trim()).filter(Boolean);
}

function getAllowedoriginLocIds(req) {
  const role = String(req.user?.role || '').trim().toLowerCase();
  if (role === 'admin') return null;
  return normalizeoriginLocIds(req.user?.originLocIds);
}

function normalizeDateKey(rawDate) {
  const date = rawDate ? new Date(rawDate) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function toNonNegativeNumber(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

function normalizeMoney(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Number(value.toFixed(2));
}

function getVehicleOptions(branch) {
  const values = Array.isArray(branch?.vehicles) ? branch.vehicles : [];
  return Array.from(
    new Set(
      values
        .map((vehicle) => String(vehicle?.vehicleNo || '').trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));
}

function isEntryCancelled(entry) {
  return Boolean(entry?.isCancelled);
}

function getWorkerEntryAmount(entry) {
  const explicitTotal = Number(entry?.totalAmount);
  const computedTotal = Number(entry?.workersCount || 0) * Number(entry?.wagePerWorker || 0);
  const value = Number.isFinite(explicitTotal) ? explicitTotal : computedTotal;
  return Math.max(normalizeMoney(value), 0);
}

function buildSummaryPayload(doc) {
  const fuelEntries = Array.isArray(doc?.fuelEntries) ? doc.fuelEntries : [];
  const workerEntries = Array.isArray(doc?.workerEntries) ? doc.workerEntries : [];
  const maintenanceEntries = Array.isArray(doc?.maintenanceEntries) ? doc.maintenanceEntries : [];

  const activeFuelEntries = fuelEntries.filter((entry) => !isEntryCancelled(entry));
  const activeWorkerEntries = workerEntries.filter((entry) => !isEntryCancelled(entry));
  const activeMaintenanceEntries = maintenanceEntries.filter((entry) => !isEntryCancelled(entry));

  const fuelTotal = normalizeMoney(
    activeFuelEntries.reduce((sum, entry) => sum + Math.max(Number(entry?.amount || 0), 0), 0)
  );
  const workersTotal = normalizeMoney(activeWorkerEntries.reduce((sum, entry) => sum + getWorkerEntryAmount(entry), 0));
  const maintenanceTotal = normalizeMoney(
    activeMaintenanceEntries.reduce((sum, entry) => sum + Math.max(Number(entry?.amount || 0), 0), 0)
  );
  const grandTotal = normalizeMoney(fuelTotal + workersTotal + maintenanceTotal);

  return {
    fuelEntries,
    workerEntries,
    maintenanceEntries,
    summary: {
      fuelTotal,
      workersTotal,
      maintenanceTotal,
      grandTotal,
      fuelCount: activeFuelEntries.length,
      workersCount: activeWorkerEntries.length,
      maintenanceCount: activeMaintenanceEntries.length
    }
  };
}

function getRunningCostEntryConfig(entryTypeRaw) {
  const entryType = String(entryTypeRaw || '').trim().toLowerCase();
  return RUNNING_COST_ENTRY_CONFIG[entryType] || null;
}

async function calculateBranchRunningCostBreakdown(gstinId, originLocId) {
  const docs = await RunningCostDay.find({
    GSTIN_ID: gstinId,
    originLocId
  })
    .select('fuelEntries workerEntries maintenanceEntries')
    .lean();

  const totals = {
    fuel: 0,
    workers: 0,
    maintenance: 0
  };
  (docs || []).forEach((dayDoc) => {
    const fuelEntries = Array.isArray(dayDoc?.fuelEntries) ? dayDoc.fuelEntries : [];
    const workerEntries = Array.isArray(dayDoc?.workerEntries) ? dayDoc.workerEntries : [];
    const maintenanceEntries = Array.isArray(dayDoc?.maintenanceEntries) ? dayDoc.maintenanceEntries : [];

    totals.fuel += fuelEntries.reduce((sum, entry) => {
      if (isEntryCancelled(entry)) return sum;
      return sum + Math.max(Number(entry?.amount || 0), 0);
    }, 0);
    totals.workers += workerEntries.reduce((sum, entry) => {
      if (isEntryCancelled(entry)) return sum;
      return sum + getWorkerEntryAmount(entry);
    }, 0);
    totals.maintenance += maintenanceEntries.reduce((sum, entry) => {
      if (isEntryCancelled(entry)) return sum;
      return sum + Math.max(Number(entry?.amount || 0), 0);
    }, 0);
  });

  const fuel = normalizeMoney(totals.fuel);
  const workers = normalizeMoney(totals.workers);
  const maintenance = normalizeMoney(totals.maintenance);
  return {
    fuel,
    workers,
    maintenance,
    total: normalizeMoney(fuel + workers + maintenance)
  };
}

function getPrimaryRunningCostCategoryRef(breakdown) {
  for (const config of RUNNING_COST_PAYMENT_CONFIG) {
    if (normalizeMoney(breakdown?.[config.key]) > 0) return config.referenceNo;
  }
  return RUNNING_COST_PAYMENT_CONFIG[0].referenceNo;
}

function getLatestPaymentDate(payments) {
  return (payments || []).reduce((latest, payment) => {
    const value = payment?.paymentDate ? new Date(payment.paymentDate) : null;
    if (!value || Number.isNaN(value.getTime())) return latest;
    if (!latest) return value;
    return value > latest ? value : latest;
  }, null);
}

async function syncBranchPayableDue(gstinId, originLocId) {
  const entityId = String(originLocId || '').trim();
  if (!entityId) return null;

  const breakdown = await calculateBranchRunningCostBreakdown(gstinId, originLocId);
  const summaryFilter = {
    GSTIN_ID: gstinId,
    entityType: 'branch',
    entityId,
    direction: PAYABLE_DIRECTION_FILTER
  };

  const currentPayments = await Payment.find(summaryFilter)
    .sort({ updatedAt: -1, createdAt: -1 });
  const categorizedPaymentByRef = new Map();
  const nonReferencedPayments = [];
  currentPayments.forEach((payment) => {
    const ref = String(payment?.referenceNo || '').trim().toUpperCase();
    if (RUNNING_COST_REFERENCE_SET.has(ref)) {
      categorizedPaymentByRef.set(ref, payment);
      return;
    }
    if (!ref) {
      nonReferencedPayments.push(payment);
    }
  });

  let migrationCandidate = null;
  if (!categorizedPaymentByRef.size && nonReferencedPayments.length) {
    const expectedTotal = normalizeMoney(breakdown.total);
    migrationCandidate = nonReferencedPayments.find((payment) => {
      const paymentMethod = String(payment?.paymentMethod || '').trim();
      const paymentDue = normalizeMoney(payment?.amountDue || 0);
      return !paymentMethod && Math.abs(paymentDue - expectedTotal) < 0.01;
    }) || null;
    if (!migrationCandidate && nonReferencedPayments.length === 1) {
      const lone = nonReferencedPayments[0];
      if (!String(lone?.paymentMethod || '').trim()) migrationCandidate = lone;
    }
  }

  let migrationTargetRef = '';
  if (migrationCandidate) {
    migrationTargetRef = getPrimaryRunningCostCategoryRef(breakdown);
  }

  for (const config of RUNNING_COST_PAYMENT_CONFIG) {
    const dueAmount = normalizeMoney(breakdown?.[config.key] || 0);
    let payment = categorizedPaymentByRef.get(config.referenceNo) || null;

    if (!payment && migrationCandidate && migrationTargetRef === config.referenceNo) {
      payment = migrationCandidate;
      migrationCandidate = null;
    }

    if (!payment) {
      payment = await Payment.create({
        GSTIN_ID: gstinId,
        entityType: 'branch',
        entityId,
        direction: PAYABLE_DIRECTION,
        referenceNo: config.referenceNo,
        amountDue: dueAmount,
        amountPaid: 0,
        balance: dueAmount,
        status: dueAmount <= 0 ? 'Paid' : 'Pending',
        notes: config.notes
      });
    } else {
      const paidAmount = normalizeMoney(payment.amountPaid || 0);
      const balanceAmount = Math.max(normalizeMoney(dueAmount - paidAmount), 0);
      payment.direction = PAYABLE_DIRECTION;
      payment.referenceNo = config.referenceNo;
      payment.amountDue = dueAmount;
      payment.amountPaid = paidAmount;
      payment.balance = balanceAmount;
      payment.status = balanceAmount <= 0 ? 'Paid' : 'Pending';
      if (!String(payment.notes || '').trim()) {
        payment.notes = config.notes;
      }
      await payment.save();
    }
  }

  const refreshedPayments = await Payment.find(summaryFilter)
    .select('amountDue amountPaid paymentDate')
    .lean();
  const totalDue = normalizeMoney(
    (refreshedPayments || []).reduce((sum, payment) => sum + normalizeMoney(payment?.amountDue || 0), 0)
  );
  const totalPaid = normalizeMoney(
    (refreshedPayments || []).reduce((sum, payment) => sum + normalizeMoney(payment?.amountPaid || 0), 0)
  );
  const totalBalance = Math.max(normalizeMoney(totalDue - totalPaid), 0);
  const status = totalBalance <= 0 ? 'Paid' : 'Pending';
  const lastPaymentDate = getLatestPaymentDate(refreshedPayments);

  let summary = await PaymentEntitySummary.findOne(summaryFilter);
  if (!summary) {
    summary = await PaymentEntitySummary.create({
      GSTIN_ID: gstinId,
      entityType: 'branch',
      entityId,
      direction: PAYABLE_DIRECTION,
      totalDue,
      totalPaid,
      totalBalance,
      status,
      lastPaymentDate
    });
  } else {
    summary.totalDue = totalDue;
    summary.totalPaid = totalPaid;
    summary.totalBalance = totalBalance;
    summary.status = status;
    summary.direction = PAYABLE_DIRECTION;
    summary.lastPaymentDate = lastPaymentDate;
    await summary.save();
  }

  return {
    entityType: 'branch',
    entityId,
    direction: PAYABLE_DIRECTION,
    totalDue: normalizeMoney(summary.totalDue || 0),
    totalPaid: normalizeMoney(summary.totalPaid || 0),
    totalBalance: normalizeMoney(summary.totalBalance || 0),
    status: summary.status || 'Pending',
    breakdown
  };
}

async function cancelRunningCostEntry({
  gstinId,
  originLocId,
  dateKey,
  entryType,
  entryId,
  cancelledBy
}) {
  const config = getRunningCostEntryConfig(entryType);
  if (!config) {
    return { ok: false, code: 400, message: 'Invalid entry type' };
  }
  if (!mongoose.Types.ObjectId.isValid(entryId)) {
    return { ok: false, code: 400, message: 'Invalid entry id' };
  }

  const entryObjectId = new mongoose.Types.ObjectId(String(entryId));
  const entryFilterKey = `${config.arrayField}._id`;
  const updateSet = {
    [`${config.arrayField}.$[entry].isCancelled`]: true,
    [`${config.arrayField}.$[entry].cancelledAt`]: new Date()
  };
  if (cancelledBy) {
    updateSet[`${config.arrayField}.$[entry].cancelledBy`] = cancelledBy;
  }
  const update = {
    $set: updateSet
  };
  const result = await RunningCostDay.updateOne(
    {
      GSTIN_ID: gstinId,
      originLocId,
      dateKey,
      [entryFilterKey]: entryObjectId
    },
    update,
    {
      arrayFilters: [{ 'entry._id': entryObjectId, 'entry.isCancelled': { $ne: true } }]
    }
  );

  if (result.modifiedCount > 0) {
    return { ok: true, message: `${config.label} cancelled` };
  }

  const hasEntry = await RunningCostDay.exists({
    GSTIN_ID: gstinId,
    originLocId,
    dateKey,
    [entryFilterKey]: entryObjectId
  });
  if (!hasEntry) {
    return { ok: false, code: 404, message: `${config.label} not found` };
  }

  return { ok: false, code: 409, message: `${config.label} already cancelled` };
}

async function resolveBranchScope(req, gstinId, originLocIdRaw) {
  const originLocId = String(originLocIdRaw || '').trim();
  if (!originLocId || originLocId === 'all' || originLocId === 'all-hubs') {
    return {
      ok: false,
      code: 400,
      message: 'Please select a specific branch to manage running cost.'
    };
  }
  if (!mongoose.Types.ObjectId.isValid(originLocId)) {
    return { ok: false, code: 400, message: 'Invalid branch id' };
  }

  const allowedoriginLocIds = getAllowedoriginLocIds(req);
  if (allowedoriginLocIds && !allowedoriginLocIds.includes(originLocId)) {
    return { ok: false, code: 403, message: 'Branch access denied' };
  }

  const branch = await Branch.findOne({ _id: originLocId, GSTIN_ID: gstinId })
    .select('_id branchName vehicles.vehicleNo')
    .lean();
  if (!branch) {
    return { ok: false, code: 404, message: 'Branch not found' };
  }

  return { ok: true, originLocId, branch };
}

router.get('/running-costs', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const dateKey = normalizeDateKey(req.query.date);
    if (!dateKey) return res.status(400).json({ message: 'Valid date is required' });

    const scope = await resolveBranchScope(req, gstinId, req.query.originLocId);
    if (!scope.ok) {
      return res.status(scope.code).json({
        message: scope.message,
        date: dateKey,
        originLocId: '',
        branchName: '',
        vehicleOptions: [],
        fuelEntries: [],
        workerEntries: [],
        maintenanceEntries: [],
        summary: {
          fuelTotal: 0,
          workersTotal: 0,
          maintenanceTotal: 0,
          grandTotal: 0,
          fuelCount: 0,
          workersCount: 0,
          maintenanceCount: 0
        }
      });
    }

    const dayDoc = await RunningCostDay.findOne({
      GSTIN_ID: gstinId,
      originLocId: scope.originLocId,
      dateKey
    }).lean();
    const payload = buildSummaryPayload(dayDoc);

    return res.json({
      date: dateKey,
      originLocId: scope.originLocId,
      branchName: String(scope.branch?.branchName || '').trim(),
      vehicleOptions: getVehicleOptions(scope.branch),
      ...payload
    });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
});

router.post('/running-costs/fuel', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const dateKey = normalizeDateKey(req.body?.date);
    if (!dateKey) return res.status(400).json({ message: 'Valid date is required' });

    const scope = await resolveBranchScope(req, gstinId, req.body?.originLocId);
    if (!scope.ok) return res.status(scope.code).json({ message: scope.message });

    const vehicleNo = String(req.body?.vehicleNo || '').trim();
    if (!vehicleNo) return res.status(400).json({ message: 'Vehicle number is required' });

    const amount = toNonNegativeNumber(req.body?.amount);
    if (amount === null) return res.status(400).json({ message: 'Valid amount is required' });

    const fuelTypeRaw = String(req.body?.fuelType || '').trim().toLowerCase();
    const fuelType = ['petrol', 'diesel'].includes(fuelTypeRaw) ? fuelTypeRaw : 'diesel';
    const notes = String(req.body?.notes || '').trim();

    await RunningCostDay.updateOne(
      {
        GSTIN_ID: gstinId,
        originLocId: scope.originLocId,
        dateKey
      },
      {
        $setOnInsert: {
          GSTIN_ID: gstinId,
          originLocId: scope.originLocId,
          dateKey
        },
        $push: {
          fuelEntries: {
            vehicleNo,
            fuelType,
            amount,
            notes,
            createdBy: String(req.user?.username || req.user?.email || '').trim(),
            createdAt: new Date()
          }
        }
      },
      { upsert: true }
    );

    let paymentSync = null;
    try {
      paymentSync = await syncBranchPayableDue(gstinId, scope.originLocId);
    } catch (syncErr) {
      console.error('Failed to sync branch payable due after fuel entry', {
        gstinId,
        originLocId: scope.originLocId,
        dateKey,
        err: syncErr
      });
    }

    return res.status(201).json({
      message: 'Fuel charge added',
      ...(paymentSync ? { paymentSync } : {})
    });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
});

router.post('/running-costs/workers', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const dateKey = normalizeDateKey(req.body?.date);
    if (!dateKey) return res.status(400).json({ message: 'Valid date is required' });

    const scope = await resolveBranchScope(req, gstinId, req.body?.originLocId);
    if (!scope.ok) return res.status(scope.code).json({ message: scope.message });

    const workersCount = toNonNegativeNumber(req.body?.workersCount);
    const wagePerWorker = toNonNegativeNumber(req.body?.wagePerWorker);
    if (workersCount === null || wagePerWorker === null) {
      return res.status(400).json({ message: 'Valid workers count and wage are required' });
    }

    const workTypeRaw = String(req.body?.workType || '').trim().toLowerCase();
    const workType = ['loading', 'unloading', 'both'].includes(workTypeRaw) ? workTypeRaw : 'loading';
    const totalAmount = Math.max(Number((workersCount * wagePerWorker).toFixed(2)), 0);
    const notes = String(req.body?.notes || '').trim();

    await RunningCostDay.updateOne(
      {
        GSTIN_ID: gstinId,
        originLocId: scope.originLocId,
        dateKey
      },
      {
        $setOnInsert: {
          GSTIN_ID: gstinId,
          originLocId: scope.originLocId,
          dateKey
        },
        $push: {
          workerEntries: {
            workType,
            workersCount,
            wagePerWorker,
            totalAmount,
            notes,
            createdBy: String(req.user?.username || req.user?.email || '').trim(),
            createdAt: new Date()
          }
        }
      },
      { upsert: true }
    );

    let paymentSync = null;
    try {
      paymentSync = await syncBranchPayableDue(gstinId, scope.originLocId);
    } catch (syncErr) {
      console.error('Failed to sync branch payable due after worker entry', {
        gstinId,
        originLocId: scope.originLocId,
        dateKey,
        err: syncErr
      });
    }

    return res.status(201).json({
      message: 'Worker wage entry added',
      ...(paymentSync ? { paymentSync } : {})
    });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
});

router.post('/running-costs/maintenance', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const dateKey = normalizeDateKey(req.body?.date);
    if (!dateKey) return res.status(400).json({ message: 'Valid date is required' });

    const scope = await resolveBranchScope(req, gstinId, req.body?.originLocId);
    if (!scope.ok) return res.status(scope.code).json({ message: scope.message });

    const vehicleNo = String(req.body?.vehicleNo || '').trim();
    if (!vehicleNo) return res.status(400).json({ message: 'Vehicle number is required' });

    const amount = toNonNegativeNumber(req.body?.amount);
    if (amount === null) return res.status(400).json({ message: 'Valid amount is required' });

    const maintenanceTypeRaw = String(req.body?.maintenanceType || '').trim().toLowerCase();
    const maintenanceType = ['service', 'breakdown-repair', 'other'].includes(maintenanceTypeRaw)
      ? maintenanceTypeRaw
      : 'service';
    const notes = String(req.body?.notes || '').trim();

    await RunningCostDay.updateOne(
      {
        GSTIN_ID: gstinId,
        originLocId: scope.originLocId,
        dateKey
      },
      {
        $setOnInsert: {
          GSTIN_ID: gstinId,
          originLocId: scope.originLocId,
          dateKey
        },
        $push: {
          maintenanceEntries: {
            vehicleNo,
            maintenanceType,
            amount,
            notes,
            createdBy: String(req.user?.username || req.user?.email || '').trim(),
            createdAt: new Date()
          }
        }
      },
      { upsert: true }
    );

    let paymentSync = null;
    try {
      paymentSync = await syncBranchPayableDue(gstinId, scope.originLocId);
    } catch (syncErr) {
      console.error('Failed to sync branch payable due after maintenance entry', {
        gstinId,
        originLocId: scope.originLocId,
        dateKey,
        err: syncErr
      });
    }

    return res.status(201).json({
      message: 'Maintenance cost added',
      ...(paymentSync ? { paymentSync } : {})
    });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
});

router.post('/running-costs/:entryType/:entryId/cancel', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const dateKey = normalizeDateKey(req.body?.date);
    if (!dateKey) return res.status(400).json({ message: 'Valid date is required' });

    const scope = await resolveBranchScope(req, gstinId, req.body?.originLocId);
    if (!scope.ok) return res.status(scope.code).json({ message: scope.message });

    const entryType = String(req.params.entryType || '').trim().toLowerCase();
    const entryId = String(req.params.entryId || '').trim();

    const cancelResult = await cancelRunningCostEntry({
      gstinId,
      originLocId: scope.originLocId,
      dateKey,
      entryType,
      entryId,
      cancelledBy: String(req.user?.username || req.user?.email || '').trim()
    });
    if (!cancelResult.ok) {
      return res.status(cancelResult.code || 400).json({ message: cancelResult.message });
    }

    let paymentSync = null;
    try {
      paymentSync = await syncBranchPayableDue(gstinId, scope.originLocId);
    } catch (syncErr) {
      console.error('Failed to sync branch payable due after running-cost cancellation', {
        gstinId,
        originLocId: scope.originLocId,
        dateKey,
        entryType,
        entryId,
        err: syncErr
      });
    }

    return res.json({
      message: cancelResult.message,
      ...(paymentSync ? { paymentSync } : {})
    });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
});

export default router;
