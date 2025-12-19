// shipment-backend/routes/clients.js
import express from 'express';
import Client from '../models/Client.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Create new client (admin only)
router.post('/add', requireAuth, requireAdmin, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    const userId = Number(req.user.userId);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    if (!Number.isFinite(userId)) return res.status(400).json({ message: 'Invalid user_id' });

    const client = new Client({
      ...req.body,
      GSTIN_ID: gstinId,
      user_id: userId
    });

    await client.save();
    res.status(201).json(client);
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({
        message: 'Duplicate key error while saving client',
        index: err.index,
        keyPattern: err.keyPattern,
        keyValue: err.keyValue
      });
    }
    if (err?.name === 'ValidationError') {
      const details = Object.values(err.errors || {}).map((e) => e.message);
      return res.status(400).json({ message: err.message, details });
    }
    console.error('Error saving client:', err);
    res.status(400).json({ message: err?.message || 'Bad Request' });
  }
});

// Get clients for current company
router.get('/', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const { branch } = req.query;
    const query = { GSTIN_ID: gstinId };
    if (branch && branch !== 'All Branches') query.branch = branch;

    const clients = await Client.find(query).sort({ createdAt: -1 });
    res.json(clients);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update client (admin only)
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const client = await Client.findOneAndUpdate(
      { _id: req.params.id, GSTIN_ID: gstinId },
      req.body,
      { new: true }
    );
    if (!client) return res.status(404).json({ message: 'Client not found' });
    res.json({ success: true, client });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Duplicate key error while updating client',
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

    const client = await Client.findOne({ _id: req.params.id, GSTIN_ID: gstinId });
    if (!client) return res.status(404).json({ message: 'Client not found' });
    client.status = client.status === 'active' ? 'inactive' : 'active';
    await client.save();
    res.json({ success: true, client });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Toggle credit type (admin only)
router.patch('/:id/credit', requireAuth, requireAdmin, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const client = await Client.findOne({ _id: req.params.id, GSTIN_ID: gstinId });
    if (!client) return res.status(404).json({ message: 'Client not found' });
    client.creditType = client.creditType === 'credit' ? 'no-credit' : 'credit';
    await client.save();
    res.json({ success: true, client });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Backwards-compatible endpoint used by the frontend; now auth-scoped
router.get('/by-user/:username', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    const clients = await Client.find({ GSTIN_ID: gstinId }).sort({ createdAt: -1 });
    res.json(clients);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET active clients for dropdown (auth required)
router.get('/clientslist', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    const clients = await Client.find({ GSTIN_ID: gstinId, status: 'active' }).select('clientName GSTIN address phoneNum branch');
    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

