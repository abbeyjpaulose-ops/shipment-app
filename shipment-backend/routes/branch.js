import express from 'express';
import Branch from '../models/Branch.js';
import Shipment from '../models/NewShipment/NewShipmentShipment.js';
import Ewaybill from '../models/NewShipment/NewShipmentEwaybill.js';
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
    const currentBranch = req.body?.currentBranch;
    if (!vehicleNo) return res.status(400).json({ message: 'Vehicle number is required' });
    if (!vehicleStatus) return res.status(400).json({ message: 'Vehicle status is required' });

    const currentBranchValue = currentBranch !== undefined && currentBranch !== null
      ? String(currentBranch).trim()
      : null;
    const update = await Branch.updateOne(
      { _id: req.params.id, GSTIN_ID: gstinId },
      {
        $set: {
          'vehicles.$[v].vehicleStatus': vehicleStatus,
          ...(currentBranchValue ? { 'vehicles.$[v].currentBranch': currentBranchValue } : {})
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
    let reverted = { matchedCount: 0, modifiedCount: 0 };
    if (vehicleStatus === 'offline') {
      const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const vehicleRegex = new RegExp(`\\|\\s*${escapeRegex(vehicleNo)}\\b`, 'i');
      const ewaybills = await Ewaybill.find({
        routes: { $regex: vehicleRegex }
      }).select('shipmentId').lean();
      const shipmentIds = Array.from(
        new Set((ewaybills || []).map((e) => String(e?.shipmentId || '')).filter(Boolean))
      );
      if (shipmentIds.length) {
        reverted = await Shipment.updateMany(
          {
            GSTIN_ID: gstinId,
            _id: { $in: shipmentIds },
            shipmentStatus: { $in: ['Manifestation', 'Out for Delivery', 'DManifestation', 'D-Out for Delivery'] }
          },
          [
            {
              $set: {
                shipmentStatus: {
                  $cond: [{ $regexMatch: { input: '$shipmentStatus', regex: /^D/ } }, 'DPending', 'Pending']
                }
              }
            }
          ]
        );
      }
    }
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
