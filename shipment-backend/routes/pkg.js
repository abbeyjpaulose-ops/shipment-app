// shipment-backend/routes/pkg.js
import express from 'express';
import Pkg from '../models/Pkg.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Create new pkg (admin only)
router.post('/add', requireAuth, requireAdmin, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    const userId = Number(req.user.userId);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    if (!Number.isFinite(userId)) return res.status(400).json({ message: 'Invalid user_id' });

    const pkg = new Pkg({
      ...req.body,
      GSTIN_ID: gstinId,
      user_id: userId
    });

    await pkg.save();
    res.status(201).json(pkg);
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({
        message: 'Duplicate key error while saving pkg',
        index: err.index,
        keyPattern: err.keyPattern,
        keyValue: err.keyValue
      });
    }
    if (err?.name === 'ValidationError') {
      const details = Object.values(err.errors || {}).map((e) => e.message);
      return res.status(400).json({ message: err.message, details });
    }
    console.error('Error saving pkg:', err);
    res.status(400).json({ message: err?.message || 'Bad Request' });
  }
});

// Get pkgs for current company
router.get('/', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    const pkgs = await Pkg.find({ GSTIN_ID: gstinId }).sort({ createdAt: -1 });
    res.json(pkgs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update pkg (admin only)
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const pkg = await Pkg.findOneAndUpdate(
      { _id: req.params.id, GSTIN_ID: gstinId },
      req.body,
      { new: true }
    );
    if (!pkg) return res.status(404).json({ message: 'Pkg not found' });
    res.json({ success: true, pkg });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Duplicate key error while updating pkg',
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

    const pkg = await Pkg.findOne({ _id: req.params.id, GSTIN_ID: gstinId });
    if (!pkg) return res.status(404).json({ message: 'Pkg not found' });
    pkg.status = pkg.status === 'active' ? 'inactive' : 'active';
    await pkg.save();
    res.json({ success: true, pkg });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Backwards-compatible endpoint used by the frontend; now auth-scoped
router.get('/by-user/:username', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    const pkgs = await Pkg.find({ GSTIN_ID: gstinId }).sort({ createdAt: -1 });
    res.json(pkgs);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET active package for dropdown (auth required)
router.get('/pkglist', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    const pkg = await Pkg.find({ GSTIN_ID: gstinId, status: 'active' }).sort({ createdAt: -1 });
    res.json(pkg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
