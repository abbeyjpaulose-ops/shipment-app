import express from 'express';
import Branch from '../models/Branch.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Create new branch (admin only)
router.post('/add', requireAuth, requireAdmin, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) {
      return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    }

    const branch = new Branch({
      ...req.body,
      GSTIN_ID: gstinId,
      createdByEmail: req.user.email,
      createdByUsername: req.user.username
    });

    await branch.save();
    res.status(201).json(branch);
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({
        message: 'Duplicate key error while saving branch',
        index: err.index,
        keyPattern: err.keyPattern,
        keyValue: err.keyValue
      });
    }
    if (err && err.name === 'ValidationError') {
      const details = Object.values(err.errors || {}).map((e) => e.message);
      return res.status(400).json({ message: err.message, details });
    }
    console.error('Error saving branch:', err);
    return res.status(400).json({ message: err?.message || 'Bad Request' });
  }
});

// Get branches for current company (auth required)
router.get('/', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) {
      return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    }

    const branches = await Branch.find({ GSTIN_ID: gstinId }).sort({ createdAt: -1 });
    res.json(branches);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update branch (admin only)
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) {
      return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    }

    const branch = await Branch.findOneAndUpdate(
      { _id: req.params.id, GSTIN_ID: gstinId },
      req.body,
      { new: true }
    );
    if (!branch) return res.status(404).json({ message: 'Branch not found' });

    res.json({ success: true, branch });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Duplicate key error while updating branch',
        index: err.index,
        keyPattern: err.keyPattern,
        keyValue: err.keyValue
      });
    }
    if (err && err.name === 'ValidationError') {
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
    if (!Number.isFinite(gstinId)) {
      return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    }

    const branch = await Branch.findOne({ _id: req.params.id, GSTIN_ID: gstinId });
    if (!branch) return res.status(404).json({ message: 'Branch not found' });

    branch.status = branch.status === 'active' ? 'inactive' : 'active';
    await branch.save();

    res.json({ success: true, branch });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Backwards-compatible endpoint used by the frontend; now auth-scoped.
router.get('/by-user/:username', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) {
      return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    }

    const branches = await Branch.find({ GSTIN_ID: gstinId }).sort({ createdAt: -1 });
    res.json(branches);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

export default router;
