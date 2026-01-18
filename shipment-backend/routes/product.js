// shipment-backend/routes/product.js
import express from 'express';
import Product from '../models/Product.js';
import Branch from '../models/Branch.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';

const router = express.Router();

async function withBranchNames(records = []) {
  const data = records.map((rec) => (rec?.toObject ? rec.toObject() : rec));
  const branchIds = Array.from(
    new Set(data.map((rec) => String(rec?.branchId || '')).filter(Boolean))
  );
  if (!branchIds.length) {
    return data.map((rec) => ({ ...rec, branchName: '' }));
  }
  const branches = await Branch.find({ _id: { $in: branchIds } })
    .select('_id branchName')
    .lean();
  const branchNameById = new Map((branches || []).map((b) => [String(b._id), b.branchName || '']));
  return data.map((rec) => ({
    ...rec,
    branchName: branchNameById.get(String(rec?.branchId || '')) || ''
  }));
}

// Create new product (admin only)
router.post('/add', requireAuth, requireAdmin, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    const branchId = String(req.body?.branchId || '').trim();
    if (!branchId || branchId === 'all') {
      return res.status(400).json({ message: 'branchId is required' });
    }

    const product = new Product({
      ...req.body,
      GSTIN_ID: gstinId,
      user_id: Number(req.user.userId)
    });
    await product.save();
    const [withName] = await withBranchNames([product]);
    res.status(201).json(withName);
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({
        message: 'Duplicate key error while saving product',
        index: err.index,
        keyPattern: err.keyPattern,
        keyValue: err.keyValue
      });
    }
    if (err?.name === 'ValidationError') {
      const details = Object.values(err.errors || {}).map((e) => e.message);
      return res.status(400).json({ message: err.message, details });
    }
    console.error('Error saving product:', err);
    res.status(400).json({ message: err?.message || 'Bad Request' });
  }
});

// Get products for current company
router.get('/', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    const branchId = String(req.query.branchId || '').trim();
    const branchFilters = [];
    if (branchId && branchId !== 'all') branchFilters.push({ branchId });
    const products = await Product.find({
      GSTIN_ID: gstinId,
      ...(branchFilters.length ? { $or: branchFilters } : {})
    }).sort({ createdAt: -1 }).lean();
    const withNames = await withBranchNames(products);
    res.json(withNames);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update product (admin only)
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, GSTIN_ID: gstinId },
      req.body,
      { new: true }
    );
    if (!product) return res.status(404).json({ message: 'Product not found' });
    const [withName] = await withBranchNames([product]);
    res.json({ success: true, product: withName });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Duplicate key error while updating product',
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

    const product = await Product.findOne({ _id: req.params.id, GSTIN_ID: gstinId });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    product.status = product.status === 'active' ? 'inactive' : 'active';
    await product.save();
    res.json({ success: true, product });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Backwards-compatible endpoint used by the frontend; now auth-scoped
router.get('/by-user/:username', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    const branchId = String(req.query.branchId || '').trim();
    const branchFilters = [];
    if (branchId && branchId !== 'all') branchFilters.push({ branchId });
    const products = await Product.find({
      GSTIN_ID: gstinId,
      ...(branchFilters.length ? { $or: branchFilters } : {})
    }).sort({ createdAt: -1 }).lean();
    const withNames = await withBranchNames(products);
    res.json(withNames);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET active product for dropdown (auth required)
router.get('/productlist', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    const branchId = String(req.query.branchId || '').trim();
    const branchFilters = [];
    if (branchId && branchId !== 'all') branchFilters.push({ branchId });
    const products = await Product.find({
      GSTIN_ID: gstinId,
      status: 'active',
      ...(branchFilters.length ? { $or: branchFilters } : {})
    }).sort({ createdAt: -1 }).lean();
    const withNames = await withBranchNames(products);
    res.json(withNames);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
