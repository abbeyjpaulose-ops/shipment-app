import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import Product from '../models/Product.js';
import Client from '../models/Client.js';

const router = express.Router();

const normalizeBranch = (value) => String(value || '').trim();
const keyFor = (hsnNum, productName) =>
  `${String(hsnNum || '').toUpperCase()}::${String(productName || '').toUpperCase()}`;

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

    const merged = [];
    const map = new Map();

    // Seed with company defaults
    for (const p of defaults) {
      const key = keyFor(p.hsnNum, p.productName);
      map.set(key, {
        hsnNum: p.hsnNum,
        productName: p.productName,
        ratePerNum: p.ratePerNum ?? 0,
        ratePerVolume: p.ratePerVolume ?? 0,
        ratePerKg: p.ratePerKg ?? 0,
        source: 'company',
        productId: p._id?.toString()
      });
    }

    // Apply overrides
    for (const o of overrides) {
      const key = keyFor(o.hsnNum, o.productName);
      const base = map.get(key);
      const mergedEntry = {
        hsnNum: o.hsnNum,
        productName: o.productName,
        ratePerNum: o.ratePerNum ?? base?.ratePerNum ?? 0,
        ratePerVolume: o.ratePerVolume ?? base?.ratePerVolume ?? 0,
        ratePerKg: o.ratePerKg ?? base?.ratePerKg ?? 0,
        source: 'client',
        productId: base?.productId
      };
      map.set(key, mergedEntry);
    }

    for (const value of map.values()) merged.push(value);

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

