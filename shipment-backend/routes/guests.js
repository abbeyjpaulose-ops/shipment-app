// shipment-backend/routes/guest.js
import express from 'express';
import Guest from '../models/Guest.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Create new guest
router.post('/add', requireAuth, requireAdmin, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    const userId = Number(req.user.userId);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    if (!Number.isFinite(userId)) return res.status(400).json({ message: 'Invalid user_id' });

    const guest = new Guest({
      ...req.body,
      GSTIN_ID: gstinId,
      user_id: userId
    });
    await guest.save();
    res.status(201).json(guest);
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({
        message: 'Duplicate key error while saving guest',
        index: err.index,
        keyPattern: err.keyPattern,
        keyValue: err.keyValue
      });
    }
    if (err?.name === 'ValidationError') {
      const details = Object.values(err.errors || {}).map((e) => e.message);
      return res.status(400).json({ message: err.message, details });
    }
    console.error('Error saving guest:', err);
    res.status(400).json({ message: err?.message || 'Bad Request' });
  }
});

// Get guests for a specific company
router.get('/', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    const guests = await Guest.find({ GSTIN_ID: gstinId }).sort({ createdAt: -1 });
    res.json(guests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update guest
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const guest = await Guest.findOneAndUpdate(
      { _id: req.params.id, GSTIN_ID: gstinId },
      req.body,
      { new: true }
    );
    if (!guest) return res.status(404).json({ message: 'Guest not found' });
    res.json({ success: true, guest });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Duplicate key error while updating guest',
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

// Toggle status
router.patch('/:id/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const guest = await Guest.findOne({ _id: req.params.id, GSTIN_ID: gstinId });
    if (!guest) return res.status(404).json({ message: 'Guest not found' });
    guest.status = guest.status === 'active' ? 'inactive' : 'active';
    await guest.save();
    res.json({ success: true, guest });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Backwards-compatible endpoint used by the frontend; now auth-scoped.
router.get('/by-user/:username', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    const guests = await Guest.find({ GSTIN_ID: gstinId }).sort({ createdAt: -1 });
    res.json(guests);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET active guests for dropdown (auth required)
router.get('/guestslist', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    const guests = await Guest.find({ GSTIN_ID: gstinId, status: 'active' }).select('guestName address phoneNum');
    res.json(guests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

