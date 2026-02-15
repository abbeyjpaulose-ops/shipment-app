import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import Product from '../models/Product.js';
import Client from '../models/Client.js';
import Branch from '../models/Branch.js';

const router = express.Router();

const normalizeoriginLocIds = (ids) =>
  Array.isArray(ids) ? ids.map((id) => String(id || '')).filter(Boolean) : [];
const getAllowedoriginLocIds = (req) => {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'admin') return null;
  return normalizeoriginLocIds(req.user?.originLocIds);
};

const normalizeId = (value) => String(value || '').trim();
const keyFor = (hsnNum, productName) =>
  `${String(hsnNum || '').toUpperCase()}::${String(productName || '').toUpperCase()}`;
const rateFieldForUnit = (rateUnit) => {
  switch (String(rateUnit || '').toLowerCase()) {
    case 'cm3':
    case 'volume':
      return 'ratePerVolume';
    case 'kg':
      return 'ratePerKg';
    default:
      return 'ratePerNum';
  }
};

const rateForEntry = (entry, rateUnit) => {
  const field = rateFieldForUnit(rateUnit);
  return Number(entry?.rate?.[field]) || 0;
};

const rateForRoute = (rates, pickupLocationId, deliveryLocationId, rateUnit) => {
  if (!Array.isArray(rates) || !pickupLocationId || !deliveryLocationId) return null;
  const pickup = normalizeId(pickupLocationId);
  const delivery = normalizeId(deliveryLocationId);
  const match = rates.find((r) =>
    normalizeId(r?.pickupLocationId) === pickup &&
    normalizeId(r?.deliveryLocationId) === delivery
  );
  if (!match) return null;
  return rateForEntry(match, rateUnit);
};

// Get pricing suggestions for a branch, with optional client overrides
router.get('/suggestions', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const originLocId = normalizeId(req.query.originLocId);
    if (!originLocId || originLocId === 'all') {
      return res.status(400).json({ message: 'originLocId is required and must not be "all"' });
    }
    const allowedoriginLocIds = getAllowedoriginLocIds(req);
    if (allowedoriginLocIds && !allowedoriginLocIds.includes(originLocId)) {
      return res.status(403).json({ message: 'Branch access denied' });
    }

    const clientId = req.query.clientId;
    const pickupLocationId = normalizeId(req.query.pickupLocationId);
    const deliveryLocationId = normalizeId(req.query.deliveryLocationId);
    const rateUnit = req.query.rateUnit;

    // Company defaults
    const branchFilters = [];
    if (originLocId && originLocId !== 'all') {
      branchFilters.push({ originLocId });
    }
    const defaults = await Product.find({
      GSTIN_ID: gstinId,
      ...(branchFilters.length ? { $or: branchFilters } : {})
    }).lean();

    // Client overrides (if provided)
    let overrides = [];
    if (clientId) {
      const client = await Client.findOne({ _id: clientId, GSTIN_ID: gstinId }).lean();
      overrides = client?.products || [];
    }

    const map = new Map();

    // Seed with company defaults
    for (const p of defaults) {
      const key = keyFor(p.hsnNum, p.productName);
      map.set(key, {
        hsnNum: p.hsnNum,
        productName: p.productName,
        suggestedRate: rateForRoute(p.rates, pickupLocationId, deliveryLocationId, rateUnit),
        source: 'company',
        productId: p._id?.toString()
      });
    }

    // Apply overrides
    for (const o of overrides) {
      const key = keyFor(o.hsnNum, o.productName);
      const base = map.get(key);
      const suggestedRate = rateForRoute(o.rates, pickupLocationId, deliveryLocationId, rateUnit);
      const mergedEntry = {
        hsnNum: o.hsnNum,
        productName: o.productName,
        suggestedRate: suggestedRate ?? base?.suggestedRate ?? null,
        source: suggestedRate !== null ? 'client' : base?.source || 'company',
        productId: base?.productId
      };
      map.set(key, mergedEntry);
    }

    const merged = Array.from(map.values());

    const branch = await Branch.findOne({ _id: originLocId, GSTIN_ID: gstinId })
      .select('branchName')
      .lean();
    res.json({
      originLocId: originLocId || '',
      branchName: branch?.branchName || '',
      clientId: clientId || null,
      count: merged.length,
      pricing: merged
    });
  } catch (err) {
    console.error('Error building pricing suggestions:', err);
    res.status(500).json({ message: err.message });
  }
});

export default router;
