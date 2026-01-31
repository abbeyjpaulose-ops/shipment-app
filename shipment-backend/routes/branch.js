import express from 'express';
import mongoose from 'mongoose';
import Branch from '../models/Branch.js';
import Hub from '../models/Hub.js';
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
    if (Array.isArray(branch?.vehicles) && branch.vehicles.some((v) => !v?.currentLocationId)) {
      await Branch.updateOne(
        { _id: branch._id, GSTIN_ID: gstinId },
        { $set: { 'vehicles.$[v].currentLocationId': branch._id } },
        {
          arrayFilters: [{
            $or: [
              { 'v.currentLocationId': { $exists: false } },
              { 'v.currentLocationId': null },
              { 'v.currentLocationId': '' }
            ]
          }]
        }
      );
    }
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

    const vehicleStatusNot = String(req.query.vehicleStatusNot || '').trim();
    const branches = await Branch.find({ GSTIN_ID: gstinId })
      .sort({ createdAt: -1 })
      .lean();
    if (!vehicleStatusNot) {
      return res.json(branches);
    }
    const filtered = (branches || []).map((branch) => ({
      ...branch,
      vehicles: (branch?.vehicles || []).filter((v) =>
        String(v?.vehicleStatus || '').trim() !== vehicleStatusNot
      )
    }));
    res.json(filtered);
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

// Update vehicle status for a branch vehicle (auth required)
router.patch('/:id/vehicle-status', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) {
      return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    }

    const vehicleNo = String(req.body?.vehicleNo || req.body?.vehicleNumber || '').trim();
    const vehicleStatus = String(req.body?.vehicleStatus || '').trim();
    const currentLocationRaw = req.body?.currentLocationId ?? req.body?.currentBranch;
    const currentLocationTypeRaw = req.body?.currentLocationType ?? req.body?.currentLocationOwnerType;
    if (!vehicleNo) return res.status(400).json({ message: 'Vehicle number is required' });
    if (!vehicleStatus) return res.status(400).json({ message: 'Vehicle status is required' });

    let currentLocationId = null;
    let currentLocationType = '';
    if (currentLocationRaw !== undefined && currentLocationRaw !== null) {
      const raw = String(currentLocationRaw).trim();
      if (raw) {
        if (mongoose.Types.ObjectId.isValid(raw)) {
          currentLocationId = raw;
        } else {
          const [branchMatch, hubMatch] = await Promise.all([
            Branch.findOne({ GSTIN_ID: gstinId, branchName: raw }).select('_id').lean(),
            Hub.findOne({ GSTIN_ID: gstinId, hubName: raw }).select('_id').lean()
          ]);
          currentLocationId = branchMatch?._id || hubMatch?._id || null;
          currentLocationType = branchMatch?._id ? 'branch' : (hubMatch?._id ? 'hub' : '');
        }
      }
    }
    const currentLocationTypeCandidate = String(currentLocationTypeRaw || '').trim().toLowerCase();
    if (['branch', 'hub'].includes(currentLocationTypeCandidate)) {
      currentLocationType = currentLocationTypeCandidate;
    }
    const update = await Branch.updateOne(
      { _id: req.params.id, GSTIN_ID: gstinId },
      {
        $set: {
          'vehicles.$[v].vehicleStatus': vehicleStatus,
          ...(currentLocationId ? { 'vehicles.$[v].currentLocationId': currentLocationId } : {}),
          ...(currentLocationId && currentLocationType ? { 'vehicles.$[v].currentLocationType': currentLocationType } : {})
        }
      },
      { arrayFilters: [{ 'v.vehicleNo': vehicleNo }] }
    );

    if (!update?.matchedCount) {
      return res.status(404).json({ message: 'Branch not found' });
    }
    const branch = await Branch.findOne({
      _id: req.params.id,
      GSTIN_ID: gstinId,
      'vehicles.vehicleNo': vehicleNo
    }).select('vehicles').lean();
    const updatedVehicle = (branch?.vehicles || []).find(
      (v) => String(v?.vehicleNo || '').trim() === vehicleNo
    );
    const reverted = { matchedCount: 0, modifiedCount: 0 };
    res.json({
      success: true,
      update,
      reverted,
      vehicle: updatedVehicle ? { vehicleNo, vehicleStatus: updatedVehicle.vehicleStatus } : null
    });
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
