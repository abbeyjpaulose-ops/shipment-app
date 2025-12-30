import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import Product from '../models/Product.js';
import Client from '../models/Client.js';

const router = express.Router();

const normalizeBranch = (value) => String(value || '').trim();
const normalizePin = (value) => String(value || '').trim();
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

const rateForRoute = (rates, pickupPincode, deliveryPincode, rateUnit) => {
  if (!Array.isArray(rates) || !pickupPincode || !deliveryPincode) return null;
  const pickup = normalizePin(pickupPincode);
  const delivery = normalizePin(deliveryPincode);
  const match = rates.find((r) =>
    normalizePin(r?.pickupPincode) === pickup &&
    normalizePin(r?.deliveryPincode) === delivery
  );
  if (!match) return null;
  return rateForEntry(match, rateUnit);
};

// Get pricing suggestions for a branch, with optional client overrides
router.get('/suggestions', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const branch = normalizeBranch(req.query.branch);
    if (!branch || branch === 'All Branches') {
      return res.status(400).json({ message: 'branch is required and must not be "All Branches"' });
    }

    const clientId = req.query.clientId;
    const pickupPincode = normalizePin(req.query.pickupPincode);
    const deliveryPincode = normalizePin(req.query.deliveryPincode);
    const rateUnit = req.query.rateUnit;

    // Company defaults
    const defaults = await Product.find({
      GSTIN_ID: gstinId,
      branch
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
        suggestedRate: rateForRoute(p.rates, pickupPincode, deliveryPincode, rateUnit),
        source: 'company',
        productId: p._id?.toString()
      });
    }

    // Apply overrides
    for (const o of overrides) {
      const key = keyFor(o.hsnNum, o.productName);
      const base = map.get(key);
      const suggestedRate = rateForRoute(o.rates, pickupPincode, deliveryPincode, rateUnit);
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

    res.json({
      branch,
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
