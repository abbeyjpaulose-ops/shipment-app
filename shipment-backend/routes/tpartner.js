import express from 'express';
import TransportPartner from '../models/TransportPartner.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';

const router = express.Router();

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
    res.status(201).json(partner);
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
    const partners = await TransportPartner.find({ GSTIN_ID: gstinId }).sort({ createdAt: -1 });
    res.json(partners);
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
    res.json({ success: true, partner });
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

// Backwards-compatible endpoint used by the frontend; now auth-scoped.
router.get('/by-user/:username', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    const partners = await TransportPartner.find({ GSTIN_ID: gstinId }).sort({ createdAt: -1 });
    res.json(partners);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET active partners for dropdown (auth required)
router.get('/tpartnerslist', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    const partners = await TransportPartner.find({ GSTIN_ID: gstinId, status: 'active' }).select('partnerName address phoneNum');
    res.json(partners);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
