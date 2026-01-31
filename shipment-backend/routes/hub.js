import express from 'express';
import mongoose from 'mongoose';
import Hub from '../models/Hub.js';
import Branch from '../models/Branch.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Create new hub (admin only)
router.post('/add', requireAuth, requireAdmin, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    const userId = Number(req.user.userId);
    if (!Number.isFinite(gstinId)) {
      return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    }
    if (!Number.isFinite(userId)) {
      return res.status(400).json({ message: 'Invalid user_id' });
    }

    const hub = new Hub({
      ...req.body,
      GSTIN_ID: gstinId,
      user_id: userId
    });

    await hub.save();
    const hasMissingLocation = (hub?.deliveryAddresses || []).some((addr) =>
      (addr?.vehicles || []).some((v) => !v?.currentLocationId)
    );
    if (hasMissingLocation) {
      await Hub.updateOne(
        { _id: hub._id, GSTIN_ID: gstinId },
        { $set: { 'deliveryAddresses.$[].vehicles.$[v].currentLocationId': hub._id } },
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
    res.status(201).json(hub);
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({
        message: 'Duplicate key error while saving hub',
        index: err.index,
        keyPattern: err.keyPattern,
        keyValue: err.keyValue
      });
    }
    if (err && err.name === 'ValidationError') {
      const details = Object.values(err.errors || {}).map((e) => e.message);
      return res.status(400).json({ message: err.message, details });
    }
    console.error('Error saving hub:', err);
    return res.status(400).json({ message: err?.message || 'Bad Request' });
  }
});

// Get hubs for current company (auth required)
router.get('/', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) {
      return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    }

    const vehicleStatusNot = String(req.query.vehicleStatusNot || '').trim();
    const hubs = await Hub.find({ GSTIN_ID: gstinId })
      .sort({ createdAt: -1 })
      .lean();
    if (!vehicleStatusNot) {
      return res.json(hubs);
    }
    const filtered = (hubs || []).map((hub) => ({
      ...hub,
      deliveryAddresses: (hub?.deliveryAddresses || []).map((addr) => ({
        ...addr,
        vehicles: (addr?.vehicles || []).filter((v) =>
          String(v?.vehicleStatus || '').trim() !== vehicleStatusNot
        )
      }))
    }));
    res.json(filtered);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update hub (admin only)
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) {
      return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    }

    const hub = await Hub.findOneAndUpdate(
      { _id: req.params.id, GSTIN_ID: gstinId },
      req.body,
      { new: true }
    );
    if (!hub) return res.status(404).json({ message: 'Hub not found' });

    res.json({ success: true, hub });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Duplicate key error while updating hub',
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

    const hub = await Hub.findOne({ _id: req.params.id, GSTIN_ID: gstinId });
    if (!hub) return res.status(404).json({ message: 'Hub not found' });

    hub.status = hub.status === 'active' ? 'inactive' : 'active';
    await hub.save();

    res.json({ success: true, hub });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Update vehicle status for a hub vehicle (auth required)
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
    const update = await Hub.updateOne(
      { _id: req.params.id, GSTIN_ID: gstinId },
      {
        $set: {
          'deliveryAddresses.$[].vehicles.$[v].vehicleStatus': vehicleStatus,
          ...(currentLocationId ? { 'deliveryAddresses.$[].vehicles.$[v].currentLocationId': currentLocationId } : {}),
          ...(currentLocationId && currentLocationType ? { 'deliveryAddresses.$[].vehicles.$[v].currentLocationType': currentLocationType } : {})
        }
      },
      { arrayFilters: [{ 'v.vehicleNo': vehicleNo }] }
    );

    if (!update?.matchedCount) {
      return res.status(404).json({ message: 'Hub not found' });
    }
    const hub = await Hub.findOne({
      _id: req.params.id,
      GSTIN_ID: gstinId,
      'deliveryAddresses.vehicles.vehicleNo': vehicleNo
    }).select('deliveryAddresses').lean();
    let updatedVehicle = null;
    (hub?.deliveryAddresses || []).some((addr) => {
      const found = (addr?.vehicles || []).find(
        (v) => String(v?.vehicleNo || '').trim() === vehicleNo
      );
      if (found) {
        updatedVehicle = found;
        return true;
      }
      return false;
    });
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

    const hubs = await Hub.find({ GSTIN_ID: gstinId }).sort({ createdAt: -1 });
    res.json(hubs);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

export default router;
