import express from 'express';
import mongoose from 'mongoose';
import TpartnerActivity from '../models/TpartnerActivity.js';
import TransportPartner from '../models/TransportPartner.js';
import NewShipmentShipment from '../models/NewShipment/NewShipmentShipment.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.post('/', requireAuth, async (req, res) => {
  try {
    const {
      tpartnerId,
      tpartnerName,
      vehicleNumbers,
      consignmentIds,
      pincodeDirections,
      tripCost
    } = req.body || {};

    if (!tpartnerId || !mongoose.Types.ObjectId.isValid(tpartnerId)) {
      return res.status(400).json({ message: 'Invalid transport partner id.' });
    }
    if (!String(tpartnerName || '').trim()) {
      return res.status(400).json({ message: 'Transport partner name is required.' });
    }
    if (!Array.isArray(vehicleNumbers) || vehicleNumbers.length === 0) {
      return res.status(400).json({ message: 'At least one vehicle number is required.' });
    }
    if (!Array.isArray(consignmentIds) || consignmentIds.length === 0) {
      return res.status(400).json({ message: 'At least one consignment id is required.' });
    }
    if (!Array.isArray(pincodeDirections) || pincodeDirections.length === 0) {
      return res.status(400).json({ message: 'At least one pincode direction is required.' });
    }

    console.log('[tpartner-activity] payload', {
      tpartnerId,
      tpartnerName,
      vehicleNumbers,
      consignmentIds,
      pincodeDirections,
      tripCost
    });

    const normalizedVehicleNumbers = vehicleNumbers.map((v) => String(v || '').trim()).filter(Boolean);
    const normalizedConsignmentIds = consignmentIds.map((c) => String(c || '').trim()).filter(Boolean);
    const normalizedPincodeDirections = pincodeDirections.map((p) => String(p || '').trim()).filter(Boolean);

    const partner = await TransportPartner.findById(tpartnerId).select('vehicleNumbers').lean();
    const vehicleStatusMap = new Map(
      (partner?.vehicleNumbers || []).map((v) => [String(v?.number || '').trim(), String(v?.vehicleStatus || '')])
    );
    const anyScheduled = normalizedVehicleNumbers.some((n) => vehicleStatusMap.get(n) === 'scheduled');
    let activity;

    if (anyScheduled) {
      const update = await TpartnerActivity.findOneAndUpdate(
        { tpartnerId, vehicleNumbers: { $in: normalizedVehicleNumbers } },
        {
          $addToSet: {
            consignmentIds: { $each: normalizedConsignmentIds },
            pincodeDirections: { $each: normalizedPincodeDirections }
          }
        },
        { new: true, sort: { createdAt: -1 } }
      );
      console.log('[tpartner-activity] update result', {
        matched: Boolean(update),
        updatedId: update?._id
      });
      if (update) {
        activity = update;
      }
    }

    if (!activity) {
      activity = new TpartnerActivity({
        tpartnerId,
        tpartnerName: String(tpartnerName || '').trim(),
        vehicleNumbers: normalizedVehicleNumbers,
        consignmentIds: normalizedConsignmentIds,
        pincodeDirections: normalizedPincodeDirections,
        ...(tripCost !== undefined && tripCost !== null ? { tripCost: Number(tripCost) || 0 } : {})
      });
      await activity.save();
      console.log('[tpartner-activity] created', { id: activity?._id });
    }

    const uniqueVehicleNumbers = Array.from(new Set(normalizedVehicleNumbers));
    if (uniqueVehicleNumbers.length) {
      const statusUpdate = await TransportPartner.updateOne(
        { _id: tpartnerId },
        { $set: { 'vehicleNumbers.$[v].vehicleStatus': 'scheduled' } },
        {
          arrayFilters: [
            { 'v.number': { $in: uniqueVehicleNumbers } }
          ]
        }
      );
      console.log('[tpartner-activity] vehicle status update', statusUpdate);
    }

    res.status(201).json(activity);
  } catch (err) {
    console.error('Error creating transport partner activity:', err);
    res.status(500).json({ message: err?.message || 'Failed to create activity.' });
  }
});

router.get('/latest', requireAuth, async (req, res) => {
  try {
    const tpartnerId = String(req.query.tpartnerId || '').trim();
    const vehicleNumber = String(req.query.vehicleNumber || '').trim();
    if (!tpartnerId || !mongoose.Types.ObjectId.isValid(tpartnerId)) {
      return res.status(400).json({ message: 'Invalid transport partner id.' });
    }
    if (!vehicleNumber) {
      return res.status(400).json({ message: 'Vehicle number is required.' });
    }

    const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const vehicleRegex = new RegExp(`^${escapeRegex(vehicleNumber)}$`, 'i');

    let activity = await TpartnerActivity.findOne({
      tpartnerId,
      vehicleNumbers: vehicleRegex
    }).sort({ createdAt: -1 }).lean();

    if (!activity) {
      activity = await TpartnerActivity.findOne({ tpartnerId })
        .sort({ createdAt: -1 })
        .lean();
    }

    if (!activity) {
      return res.json(null);
    }

    const rawIds = Array.isArray(activity?.consignmentIds) ? activity.consignmentIds : [];
    const consignmentObjectIds = rawIds
      .map((id) => String(id || '').replace(/^\$\$/, '').trim())
      .filter((id) => mongoose.Types.ObjectId.isValid(id));
    let consignmentNumbers = [];
    if (consignmentObjectIds.length) {
      const shipments = await NewShipmentShipment.find({ _id: { $in: consignmentObjectIds } })
        .select('_id consignmentNumber')
        .lean();
      const numberById = new Map(
        (shipments || []).map((s) => [String(s._id), s.consignmentNumber])
      );
      consignmentNumbers = consignmentObjectIds
        .map((id) => numberById.get(id))
        .filter(Boolean);
    }

    res.json({ ...activity, consignmentNumbers });
  } catch (err) {
    console.error('Error fetching transport partner activity:', err);
    res.status(500).json({ message: err?.message || 'Failed to fetch activity.' });
  }
});

router.patch('/status', requireAuth, async (req, res) => {
  try {
    const tpartnerId = String(req.body?.tpartnerId || '').trim();
    const vehicleNumber = String(req.body?.vehicleNumber || '').trim();
    const status = String(req.body?.status || '').trim();
    if (!tpartnerId || !mongoose.Types.ObjectId.isValid(tpartnerId)) {
      return res.status(400).json({ message: 'Invalid transport partner id.' });
    }
    if (!vehicleNumber) {
      return res.status(400).json({ message: 'Vehicle number is required.' });
    }
    if (!status) {
      return res.status(400).json({ message: 'Status is required.' });
    }

    const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const vehicleRegex = new RegExp(`^${escapeRegex(vehicleNumber)}$`, 'i');

    const activity = await TpartnerActivity.findOneAndUpdate(
      { tpartnerId, vehicleNumbers: vehicleRegex },
      { $set: { status } },
      { new: true, sort: { createdAt: -1 } }
    );

    res.json({ success: true, activity });
  } catch (err) {
    console.error('Error updating transport partner activity status:', err);
    res.status(500).json({ message: err?.message || 'Failed to update activity status.' });
  }
});

router.get('/consignments', requireAuth, async (req, res) => {
  try {
    const tpartnerId = String(req.query.tpartnerId || '').trim();
    const vehicleNumber = String(req.query.vehicleNumber || '').trim();
    const statusFilter = String(req.query.statusFilter || 'manifestation').trim().toLowerCase();
    if (!tpartnerId || !mongoose.Types.ObjectId.isValid(tpartnerId)) {
      return res.status(400).json({ message: 'Invalid transport partner id.' });
    }
    if (!vehicleNumber) {
      return res.status(400).json({ message: 'Vehicle number is required.' });
    }

    const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const vehicleRegex = new RegExp(`^${escapeRegex(vehicleNumber)}$`, 'i');

    const activity = await TpartnerActivity.findOne({
      tpartnerId,
      vehicleNumbers: vehicleRegex
    }).sort({ createdAt: -1 }).lean();

    if (!activity) {
      return res.json({ consignments: [] });
    }

    const rawIds = Array.isArray(activity?.consignmentIds) ? activity.consignmentIds : [];
    const consignmentObjectIds = rawIds
      .map((id) => String(id || '').replace(/^\$\$/, '').trim())
      .filter((id) => mongoose.Types.ObjectId.isValid(id));

    if (!consignmentObjectIds.length) {
      return res.json({ consignments: [] });
    }

    const statusCriteria = statusFilter === 'all'
      ? {}
      : { shipmentStatus: { $in: ['Manifestation', 'DManifestation'] } };
    const shipments = await NewShipmentShipment.find({
      _id: { $in: consignmentObjectIds },
      ...statusCriteria
    }).select('_id consignmentNumber shipmentStatus').lean();

    const consignments = (shipments || []).map((s) => ({
      id: String(s._id),
      consignmentNumber: s.consignmentNumber,
      shipmentStatus: s.shipmentStatus
    }));

    res.json({ consignments });
  } catch (err) {
    console.error('Error fetching activity consignments:', err);
    res.status(500).json({ message: err?.message || 'Failed to fetch consignments.' });
  }
});

export default router;
