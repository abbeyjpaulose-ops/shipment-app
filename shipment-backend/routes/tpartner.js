import express from 'express';
import mongoose from 'mongoose';
import TransportPartner from '../models/TransportPartner.js';
import Branch from '../models/Branch.js';
import Hub from '../models/Hub.js';
import Manifest from '../models/Manifest/Manifest.js';
import Payment from '../models/Payment/Payment.js';
import PaymentEntitySummary from '../models/Payment/PaymentEntitySummary.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';

const router = express.Router();

function normalizeoriginLocIds(ids) {
  if (!Array.isArray(ids)) return [];
  return ids.map((id) => String(id || '')).filter(Boolean);
}

function getAllowedoriginLocIds(req) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'admin') return null;
  return normalizeoriginLocIds(req.user?.originLocIds);
}

async function withBranchNames(records = []) {
  const data = records.map((rec) => (rec?.toObject ? rec.toObject() : rec));
  const originLocIds = Array.from(
    new Set(data.map((rec) => String(rec?.originLocId || '')).filter(Boolean))
  );
  if (!originLocIds.length) {
    return data.map((rec) => ({ ...rec, branchName: '' }));
  }
  const branches = await Branch.find({ _id: { $in: originLocIds } })
    .select('_id branchName')
    .lean();
  const branchNameById = new Map((branches || []).map((b) => [String(b._id), b.branchName || '']));
  return data.map((rec) => ({
    ...rec,
    branchName: branchNameById.get(String(rec?.originLocId || '')) || ''
  }));
}

function normalizeVehicleKey(vehicleNumber) {
  return String(vehicleNumber || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function normalizeDayKey(rawDate) {
  const date = rawDate ? new Date(rawDate) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function normalizeSavedFilter(rawFilter) {
  const value = String(rawFilter || 'all').trim().toLowerCase();
  if (['saved', 'unsaved', 'all'].includes(value)) return value;
  return 'all';
}

function normalizeDateRange(rawFrom, rawTo) {
  const fromKey = normalizeDayKey(rawFrom);
  const toKey = normalizeDayKey(rawTo);
  if (!fromKey && !toKey) return null;
  const safeFrom = fromKey || toKey;
  const safeTo = toKey || fromKey;
  if (!safeFrom || !safeTo) return null;
  const startKey = safeFrom <= safeTo ? safeFrom : safeTo;
  const endKey = safeFrom <= safeTo ? safeTo : safeFrom;
  const startWindow = buildUtcDayWindow(startKey);
  const endWindow = buildUtcDayWindow(endKey);
  if (!startWindow || !endWindow) return null;
  return {
    startKey,
    endKey,
    start: startWindow.start,
    end: endWindow.end
  };
}

function normalizeDeliveryPoints(raw) {
  let parts = [];
  if (Array.isArray(raw)) {
    parts = raw;
  } else if (raw !== undefined && raw !== null) {
    parts = String(raw).split('$$');
  }
  const seen = new Set();
  const normalized = [];
  parts.forEach((part) => {
    const value = String(part || '').trim();
    if (!value) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push(value);
  });
  return normalized;
}

function extractDeliveryPointsFromNotes(notes) {
  const text = String(notes || '').trim();
  if (!text) return [];
  const marker = text.match(/deliveryPoints=([^\n\r]*)/i);
  if (!marker?.[1]) return [];
  return normalizeDeliveryPoints(marker[1]);
}

function buildDailyPayableNotes(vehicleNumber, dayKey, deliveryPoints = []) {
  const vehicle = String(vehicleNumber || '').trim();
  const parts = [
    '[TP_DAILY_RENT]',
    `vehicle=${vehicle}`,
    `date=${dayKey}`
  ];
  if (deliveryPoints.length) {
    parts.push(`deliveryPoints=${deliveryPoints.join('$$')}`);
  }
  return parts.join(' ');
}

function buildUtcDayWindow(dayKey) {
  const [yearRaw, monthRaw, dayRaw] = String(dayKey || '').split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0));
  return { start, end };
}

// Create new transport partner (admin only)
router.post('/add', requireAuth, requireAdmin, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    const userId = Number(req.user.userId);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    if (!Number.isFinite(userId)) return res.status(400).json({ message: 'Invalid user_id' });

    const username = req.user.username || req.body.username || String(req.user.userId || req.user.id || '');
    if (!username) return res.status(400).json({ message: 'Invalid username' });

    const partner = new TransportPartner({
      ...req.body,
      GSTIN_ID: gstinId,
      user_id: userId,
      username
    });

    await partner.save();
    const [withName] = await withBranchNames([partner]);
    res.status(201).json(withName);
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({
        message: 'Duplicate key error while saving transport partner',
        index: err.index,
        keyPattern: err.keyPattern,
        keyValue: err.keyValue
      });
    }
    if (err?.name === 'ValidationError') {
      const details = Object.values(err.errors || {}).map((e) => e.message);
      return res.status(400).json({ message: err.message, details });
    }
    console.error('Error saving transport partner:', err);
    res.status(400).json({ message: err?.message || 'Bad Request' });
  }
});

// Get transport partners for current company
router.get('/', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    const originLocId = String(req.query.originLocId || '').trim();
    const query = { GSTIN_ID: gstinId };
    if (originLocId && originLocId !== 'all') {
      const allowedoriginLocIds = getAllowedoriginLocIds(req);
      if (allowedoriginLocIds && !allowedoriginLocIds.includes(originLocId)) {
        return res.status(403).json({ message: 'Branch access denied' });
      }
      query.originLocId = originLocId;
    } else if (originLocId === 'all') {
      const allowedoriginLocIds = getAllowedoriginLocIds(req);
      if (allowedoriginLocIds) {
        if (!allowedoriginLocIds.length) return res.json([]);
        query.originLocId = { $in: allowedoriginLocIds };
      }
    }
    const partners = await TransportPartner.find(query).sort({ createdAt: -1 }).lean();
    const withNames = await withBranchNames(partners);
    res.json(withNames);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update transport partner (admin only)
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const partner = await TransportPartner.findOneAndUpdate(
      { _id: req.params.id, GSTIN_ID: gstinId },
      req.body,
      { new: true }
    );
    if (!partner) return res.status(404).json({ message: 'Transport partner not found' });
    const [withName] = await withBranchNames([partner]);
    res.json({ success: true, partner: withName });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Duplicate key error while updating transport partner',
        index: err.index,
        keyPattern: err.keyPattern,
        keyValue: err.keyValue
      });
    }
    if (err?.name === 'ValidationError') {
      const details = Object.values(err.errors || {}).map((e) => e.message);
      return res.status(400).json({ success: false, message: err.message, details });
    }
    res.status(400).json({ success: false, message: err.message });
  }
});

// Toggle status (admin only)
router.patch('/:id/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const partner = await TransportPartner.findOne({ _id: req.params.id, GSTIN_ID: gstinId });
    if (!partner) return res.status(404).json({ message: 'Transport partner not found' });
    partner.status = partner.status === 'active' ? 'inactive' : 'active';
    await partner.save();
    res.json({ success: true, partner });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Update vehicle status (admin only)
router.patch('/:id/vehicle-status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const vehicleNumber = String(req.body?.vehicleNumber || '').trim();
    const vehicleStatus = String(req.body?.vehicleStatus || '').trim();
    const vehicleDailyCost = req.body?.vehicleDailyCost;
    if (!vehicleNumber) return res.status(400).json({ message: 'Vehicle number is required' });
    if (!vehicleStatus) return res.status(400).json({ message: 'Vehicle status is required' });

    const vehicleCostValue = vehicleDailyCost !== undefined && vehicleDailyCost !== null
      ? Number(vehicleDailyCost)
      : null;
    const update = await TransportPartner.updateOne(
      { _id: req.params.id, GSTIN_ID: gstinId },
      {
        $set: {
          'vehicleNumbers.$[v].vehicleStatus': vehicleStatus,
          ...(vehicleCostValue !== null && !Number.isNaN(vehicleCostValue)
            ? { 'vehicleNumbers.$[v].vehicleDailyCost': vehicleCostValue }
            : {})
        }
      },
      { arrayFilters: [{ 'v.number': vehicleNumber }] }
    );

    if (!update?.matchedCount) {
      return res.status(404).json({ message: 'Transport partner not found' });
    }
    res.json({ success: true, update });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Backwards-compatible endpoint used by the frontend; now auth-scoped.
router.get('/by-user/:username', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    const originLocId = String(req.query.originLocId || '').trim();
    const query = { GSTIN_ID: gstinId };
    if (originLocId && originLocId !== 'all') {
      const allowedoriginLocIds = getAllowedoriginLocIds(req);
      if (allowedoriginLocIds && !allowedoriginLocIds.includes(originLocId)) {
        return res.status(403).json({ message: 'Branch access denied' });
      }
      query.originLocId = originLocId;
    } else if (originLocId === 'all') {
      const allowedoriginLocIds = getAllowedoriginLocIds(req);
      if (allowedoriginLocIds) {
        if (!allowedoriginLocIds.length) return res.json([]);
        query.originLocId = { $in: allowedoriginLocIds };
      }
    }
    const partners = await TransportPartner.find(query).sort({ createdAt: -1 }).lean();
    const withNames = await withBranchNames(partners);
    res.json(withNames);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET active partners for dropdown (auth required)
router.get('/tpartnerslist', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    const originLocId = String(req.query.originLocId || '').trim();
    const query = { GSTIN_ID: gstinId, status: 'active' };
    if (originLocId && originLocId !== 'all') {
      const allowedoriginLocIds = getAllowedoriginLocIds(req);
      if (allowedoriginLocIds && !allowedoriginLocIds.includes(originLocId)) {
        return res.status(403).json({ message: 'Branch access denied' });
      }
      query.originLocId = originLocId;
    } else if (originLocId === 'all') {
      const allowedoriginLocIds = getAllowedoriginLocIds(req);
      if (allowedoriginLocIds) {
        if (!allowedoriginLocIds.length) return res.json([]);
        query.originLocId = { $in: allowedoriginLocIds };
      }
    }
    const partners = await TransportPartner.find(query)
      .select('partnerName address phoneNum vehicleNumbers originLocId')
      .lean();
    const withNames = await withBranchNames(partners);
    res.json(withNames);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List transport-partner vehicles used in manifests for a given date range.
router.get('/daily-payable-candidates', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const legacyDate = String(req.query.date || '').trim();
    const dateRange = normalizeDateRange(req.query.dateFrom || legacyDate, req.query.dateTo || legacyDate);
    if (!dateRange) {
      return res.status(400).json({ message: 'Valid date range is required' });
    }
    const savedFilter = normalizeSavedFilter(req.query.savedFilter);

    const originLocId = String(req.query.originLocId || '').trim();
    const allowedoriginLocIds = getAllowedoriginLocIds(req);
    const partnerQuery = { GSTIN_ID: gstinId };
    if (originLocId && originLocId !== 'all') {
      if (allowedoriginLocIds && !allowedoriginLocIds.includes(originLocId)) {
        return res.status(403).json({ message: 'Branch access denied' });
      }
      partnerQuery.originLocId = originLocId;
    } else if (originLocId === 'all') {
      if (allowedoriginLocIds) {
        if (!allowedoriginLocIds.length) return res.json({ data: [] });
        partnerQuery.originLocId = { $in: allowedoriginLocIds };
      }
    } else if (allowedoriginLocIds) {
      if (!allowedoriginLocIds.length) return res.json({ data: [] });
      partnerQuery.originLocId = { $in: allowedoriginLocIds };
    }

    const partners = await TransportPartner.find(partnerQuery)
      .select('_id partnerName vehicleNumbers.number vehicleNumbers.vehicleDailyCost vehicleNumbers.rateType vehicleNumbers.rateValue')
      .lean();
    if (!partners.length) return res.json({ data: [] });

    const vehicleMatches = new Map();
    const ambiguousVehicleKeys = new Set();
    (partners || []).forEach((partner) => {
      const partnerId = String(partner?._id || '').trim();
      const partnerName = String(partner?.partnerName || '').trim();
      const vehicles = Array.isArray(partner?.vehicleNumbers) ? partner.vehicleNumbers : [];
      vehicles.forEach((vehicle) => {
        const vehicleNumber = String(vehicle?.number || '').trim();
        if (!vehicleNumber) return;
        const vehicleKey = normalizeVehicleKey(vehicleNumber);
        const dailyCost = Number(vehicle?.vehicleDailyCost);
        const rateType = String(vehicle?.rateType || '').trim().toLowerCase();
        const rateValue = Number(vehicle?.rateValue);
        const defaultAmount = Number.isFinite(dailyCost) && dailyCost > 0
          ? dailyCost
          : (rateType === 'day' && Number.isFinite(rateValue) && rateValue > 0 ? rateValue : 0);
        const meta = {
          partnerId,
          partnerName,
          vehicleNumber,
          vehicleKey,
          defaultAmount
        };
        if (!vehicleMatches.has(vehicleKey)) {
          vehicleMatches.set(vehicleKey, meta);
          return;
        }
        ambiguousVehicleKeys.add(vehicleKey);
      });
    });

    if (ambiguousVehicleKeys.size) {
      ambiguousVehicleKeys.forEach((key) => vehicleMatches.delete(key));
    }

    if (!vehicleMatches.size) return res.json({ data: [] });

    const manifests = await Manifest.find({
      GSTIN_ID: gstinId,
      createdAt: { $gte: dateRange.start, $lt: dateRange.end },
      vehicleNo: { $exists: true, $ne: '' },
      status: { $not: /^\s*cancelled\s*$/i }
    })
      .select('vehicleNo deliveryType deliveryId entityType entityId createdAt')
      .lean();

    const rowsByKey = new Map();
    (manifests || []).forEach((manifest) => {
      const vehicleNumber = String(manifest?.vehicleNo || '').trim();
      if (!vehicleNumber) return;
      const vehicleKey = normalizeVehicleKey(vehicleNumber);
      const vehicleMeta = vehicleMatches.get(vehicleKey);
      if (!vehicleMeta) return;
      const manifestDayKey = normalizeDayKey(manifest?.createdAt);
      if (!manifestDayKey) return;

      const rowKey = `${vehicleMeta.partnerId}::${vehicleKey}::${manifestDayKey}`;
      const row = rowsByKey.get(rowKey) || {
        partnerId: vehicleMeta.partnerId,
        partnerName: vehicleMeta.partnerName,
        vehicleNumber: vehicleMeta.vehicleNumber,
        vehicleKey,
        date: manifestDayKey,
        defaultAmount: Number(vehicleMeta.defaultAmount || 0),
        pointRefs: []
      };

      const pointType = String(manifest?.deliveryType || manifest?.entityType || '').trim().toLowerCase();
      const pointId = String(manifest?.deliveryId || manifest?.entityId || '').trim();
      if (pointId && ['branch', 'hub'].includes(pointType)) {
        row.pointRefs.push({ type: pointType, id: pointId });
      }

      rowsByKey.set(rowKey, row);
    });

    const rows = Array.from(rowsByKey.values());
    if (!rows.length) return res.json({ data: [] });

    const branchIds = new Set();
    const hubIds = new Set();
    rows.forEach((row) => {
      (row.pointRefs || []).forEach((point) => {
        if (!point?.id) return;
        if (point.type === 'hub') hubIds.add(String(point.id));
        if (point.type === 'branch') branchIds.add(String(point.id));
      });
    });

    const [branches, hubs] = await Promise.all([
      branchIds.size
        ? Branch.find({ _id: { $in: Array.from(branchIds) }, GSTIN_ID: gstinId })
          .select('_id branchName')
          .lean()
        : [],
      hubIds.size
        ? Hub.find({ _id: { $in: Array.from(hubIds) }, GSTIN_ID: gstinId })
          .select('_id hubName')
          .lean()
        : []
    ]);

    const branchNameById = new Map((branches || []).map((b) => [String(b?._id || ''), String(b?.branchName || '').trim()]));
    const hubNameById = new Map((hubs || []).map((h) => [String(h?._id || ''), String(h?.hubName || '').trim()]));

    const referenceNumbers = rows.map((row) => `TPDAY::${row.date}::${row.vehicleKey}`);
    const partnerIds = Array.from(new Set(rows.map((row) => String(row.partnerId || '')).filter(Boolean)));
    const direction = 'payable';
    const existingPayments = await Payment.find({
      GSTIN_ID: gstinId,
      entityType: 'transport_partner',
      entityId: { $in: partnerIds },
      direction: { $in: [direction, null] },
      referenceNo: { $in: referenceNumbers }
    })
      .select('_id entityId referenceNo amountDue notes')
      .lean();
    const existingPaymentByKey = new Map();
    (existingPayments || []).forEach((payment) => {
      const partnerId = String(payment?.entityId || '').trim();
      const referenceNo = String(payment?.referenceNo || '').trim();
      if (!partnerId || !referenceNo) return;
      existingPaymentByKey.set(`${partnerId}::${referenceNo}`, payment);
    });

    const data = rows.map((row) => {
      const pointNames = normalizeDeliveryPoints(
        (row.pointRefs || []).map((point) => {
          const id = String(point?.id || '').trim();
          if (!id) return '';
          if (point.type === 'hub') return hubNameById.get(id) || id;
          return branchNameById.get(id) || id;
        })
      );
      const referenceNo = `TPDAY::${row.date}::${row.vehicleKey}`;
      const existingPayment = existingPaymentByKey.get(`${row.partnerId}::${referenceNo}`);
      const existingAmountDue = Math.max(Number(existingPayment?.amountDue || 0), 0);
      const mergedPoints = pointNames.length
        ? pointNames
        : extractDeliveryPointsFromNotes(existingPayment?.notes);
      const suggestedAmountDue = existingAmountDue > 0
        ? existingAmountDue
        : Math.max(Number(row.defaultAmount || 0), 0);
      return {
        partnerId: row.partnerId,
        partnerName: row.partnerName,
        vehicleNumber: row.vehicleNumber,
        date: row.date,
        deliveryPoints: mergedPoints,
        referenceNo,
        defaultAmount: Math.max(Number(row.defaultAmount || 0), 0),
        existingAmountDue,
        hasSavedPayment: Boolean(existingPayment),
        suggestedAmountDue
      };
    }).sort((a, b) => {
      const byDate = String(b.date || '').localeCompare(String(a.date || ''));
      if (byDate !== 0) return byDate;
      const byPartner = String(a.partnerName || '').localeCompare(String(b.partnerName || ''));
      if (byPartner !== 0) return byPartner;
      return String(a.vehicleNumber || '').localeCompare(String(b.vehicleNumber || ''));
    });

    let filteredData = data;
    if (savedFilter === 'saved') {
      filteredData = data.filter((row) => row.hasSavedPayment);
    } else if (savedFilter === 'unsaved') {
      filteredData = data.filter((row) => !row.hasSavedPayment);
    }

    res.json({
      data: filteredData,
      filters: {
        dateFrom: dateRange.startKey,
        dateTo: dateRange.endKey,
        savedFilter
      }
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Create/update one daily payable row per partner + vehicle + date.
router.post('/:id/daily-payable', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const partnerId = String(req.params.id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(partnerId)) {
      return res.status(400).json({ message: 'Invalid transport partner id' });
    }

    const vehicleNumber = String(req.body?.vehicleNumber || '').trim();
    if (!vehicleNumber) {
      return res.status(400).json({ message: 'Vehicle number is required' });
    }

    const dayKey = normalizeDayKey(req.body?.date);
    if (!dayKey) {
      return res.status(400).json({ message: 'Valid date is required' });
    }

    const rawAmountDue = Number(req.body?.amountDue);
    if (!Number.isFinite(rawAmountDue) || rawAmountDue < 0) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }
    const amountDue = Math.max(rawAmountDue, 0);
    const requestedDeliveryPoints = normalizeDeliveryPoints(req.body?.deliveryPoints);

    const partner = await TransportPartner.findOne({ _id: partnerId, GSTIN_ID: gstinId })
      .select('_id originLocId partnerName vehicleNumbers.number')
      .lean();
    if (!partner) {
      return res.status(404).json({ message: 'Transport partner not found' });
    }

    const allowedoriginLocIds = getAllowedoriginLocIds(req);
    if (allowedoriginLocIds) {
      const partneroriginLocId = String(partner?.originLocId || '');
      if (!partneroriginLocId || !allowedoriginLocIds.includes(partneroriginLocId)) {
        return res.status(403).json({ message: 'Branch access denied' });
      }
    }

    const normalizedVehicle = normalizeVehicleKey(vehicleNumber);
    const partnerVehicles = Array.isArray(partner?.vehicleNumbers)
      ? partner.vehicleNumbers.map((v) => normalizeVehicleKey(v?.number))
      : [];
    if (partnerVehicles.length && !partnerVehicles.includes(normalizedVehicle)) {
      return res.status(400).json({ message: 'Vehicle does not belong to the selected transport partner' });
    }

    const direction = 'payable';
    const directionFilter = { $in: [direction, null] };
    const referenceNo = `TPDAY::${dayKey}::${normalizedVehicle}`;
    const paymentBaseFilter = {
      GSTIN_ID: gstinId,
      entityType: 'transport_partner',
      entityId: partnerId,
      referenceNo
    };

    let existingPayment = await Payment.findOne({
      ...paymentBaseFilter,
      direction: directionFilter
    }).lean();
    if (!existingPayment) {
      const fallbackPayments = await Payment.find(paymentBaseFilter)
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(2)
        .lean();
      if (fallbackPayments.length === 1) {
        existingPayment = fallbackPayments[0];
      }
    }

    const previousDue = Number(existingPayment?.amountDue || 0);
    const amountPaid = Math.max(Number(existingPayment?.amountPaid || 0), 0);
    const balance = Math.max(amountDue - amountPaid, 0);
    const status = balance <= 0 ? 'Paid' : 'Pending';
    const dueDate = new Date(`${dayKey}T00:00:00.000Z`);
    const mergedDeliveryPoints = normalizeDeliveryPoints([
      ...extractDeliveryPointsFromNotes(existingPayment?.notes),
      ...requestedDeliveryPoints
    ]);
    const notes = buildDailyPayableNotes(vehicleNumber, dayKey, mergedDeliveryPoints);

    await Payment.updateOne(
      existingPayment?._id
        ? { _id: existingPayment._id }
        : {
            ...paymentBaseFilter,
            direction: directionFilter
          },
      {
        $set: {
          amountDue,
          amountPaid,
          balance,
          currency: 'INR',
          status,
          direction,
          paymentMethod: 'payable',
          dueDate,
          notes,
          paymentDate: balance <= 0 ? new Date() : null
        },
        $setOnInsert: {
          GSTIN_ID: gstinId,
          entityType: 'transport_partner',
          entityId: partnerId,
          referenceNo
        }
      },
      { upsert: true }
    );

    const summaryBaseFilter = {
      GSTIN_ID: gstinId,
      entityType: 'transport_partner',
      entityId: partnerId
    };
    let summary = await PaymentEntitySummary.findOne({
      ...summaryBaseFilter,
      direction: directionFilter
    });
    if (!summary) {
      const fallbackSummaries = await PaymentEntitySummary.find(summaryBaseFilter)
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(2);
      if (fallbackSummaries.length === 1) {
        summary = fallbackSummaries[0];
      }
    }

    if (!summary) {
      summary = await PaymentEntitySummary.create({
        GSTIN_ID: gstinId,
        entityType: 'transport_partner',
        entityId: partnerId,
        direction,
        totalDue: amountDue,
        totalPaid: amountPaid,
        totalBalance: balance,
        status
      });
    } else {
      const deltaDue = amountDue - previousDue;
      const totalDue = Math.max(Number(summary.totalDue || 0) + deltaDue, 0);
      const totalPaid = Math.max(Number(summary.totalPaid || 0), 0);
      const totalBalance = Math.max(totalDue - totalPaid, 0);
      summary.totalDue = totalDue;
      summary.totalBalance = totalBalance;
      summary.status = totalBalance <= 0 ? 'Paid' : 'Pending';
      summary.direction = direction;
      await summary.save();
    }

    const updatedPayment = await Payment.findOne({
      ...paymentBaseFilter,
      direction: directionFilter
    }).lean();

    res.json({
      message: existingPayment ? 'Daily payable updated' : 'Daily payable created',
      payment: updatedPayment,
      mergedDeliveryPoints
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

export default router;
