import express from 'express';
import TransportPartner from '../models/TransportPartner.js';
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
    const branchId = String(req.query.branchId || '').trim();
    const query = { GSTIN_ID: gstinId };
    if (branchId && branchId !== 'all') {
      query.branchId = branchId;
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

// Backwards-compatible endpoint used by the frontend; now auth-scoped.
router.get('/by-user/:username', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    const branchId = String(req.query.branchId || '').trim();
    const query = { GSTIN_ID: gstinId };
    if (branchId && branchId !== 'all') {
      query.branchId = branchId;
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
    const branchId = String(req.query.branchId || '').trim();
    const query = { GSTIN_ID: gstinId, status: 'active' };
    if (branchId && branchId !== 'all') {
      query.branchId = branchId;
    }
    const partners = await TransportPartner.find(query)
      .select('partnerName address phoneNum vehicleNumbers branchId')
      .lean();
    const withNames = await withBranchNames(partners);
    res.json(withNames);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
