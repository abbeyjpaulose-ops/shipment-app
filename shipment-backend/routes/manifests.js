// shipment-backend/routes/manifests.js
import express from 'express';
import mongoose from 'mongoose';
import Manifest from '../models/Manifest/Manifest.js';
import ManifestItem from '../models/Manifest/ManifestItem.js';
import Shipment from '../models/NewShipment/NewShipmentShipment.js';
import Hub from '../models/Hub.js';
import Branch from '../models/Branch.js';
import { requireAuth } from '../middleware/auth.js';
import { buildShipmentViews } from './newshipments.js';

const router = express.Router();

function normalizeoriginLocIds(ids) {
  if (!Array.isArray(ids)) return [];
  return ids.map((id) => String(id || '')).filter(Boolean);
}

function getAllowedoriginLocIds(req) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'admin') return null;
  return normalizeoriginLocIds(req.user?.originLocIds);
}

async function ensureManifestEntityAccess(entityType, entityId, gstinId, allowedoriginLocIds, cachedHuboriginLocId) {
  if (!allowedoriginLocIds) return { ok: true };
  if (entityType === 'branch') {
    if (allowedoriginLocIds.includes(entityId)) {
      return { ok: true };
    }
    return { ok: false, message: 'Branch access denied' };
  }
  const huboriginLocId = cachedHuboriginLocId || (await Hub.findOne({ _id: entityId, GSTIN_ID: gstinId }).select('_id originLocId').lean())?.originLocId;
  if (!huboriginLocId || !allowedoriginLocIds.includes(String(huboriginLocId))) {
    return { ok: false, message: 'Hub access denied' };
  }
  return { ok: true };
}

function getFiscalYearWindow(date = new Date()) {
  const year = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  const start = new Date(year, 3, 1);
  const end = new Date(year + 1, 2, 31, 23, 59, 59);
  return { year, start, end, label: `${year}-${year + 1}` };
}

async function getNextManifestSequence(gstinId, entityType, entityId, fiscalYear) {
  const last = await Manifest.findOne({
    GSTIN_ID: gstinId,
    entityType,
    entityId,
    fiscalYear
  })
    .sort({ manifestSequence: -1 })
    .select('manifestSequence')
    .lean();
  const nextSequence = Number(last?.manifestSequence || 0) + 1;
  return nextSequence;
}

function buildManifestNumber(sequence) {
  const padded = String(sequence).padStart(6, '0');
  return `MF${padded}`;
}

async function updateVehicleCurrentLocation(gstinId, vehicleNo, locationId, locationType) {
  const vehicle = String(vehicleNo || '').trim();
  const location = String(locationId || '').trim();
  const type = String(locationType || '').trim().toLowerCase();
  if (!vehicle || !location) return;
  const arrayFilters = [{ 'v.vehicleNo': vehicle, 'v.vehicleStatus': { $ne: 'offline' } }];
  await Promise.all([
    Branch.updateMany(
      { GSTIN_ID: gstinId, 'vehicles.vehicleNo': vehicle },
      { $set: { 'vehicles.$[v].currentLocationId': location, 'vehicles.$[v].currentLocationType': type } },
      { arrayFilters }
    ),
    Hub.updateMany(
      { GSTIN_ID: gstinId, 'deliveryAddresses.vehicles.vehicleNo': vehicle },
      { $set: { 'deliveryAddresses.$[].vehicles.$[v].currentLocationId': location, 'deliveryAddresses.$[].vehicles.$[v].currentLocationType': type } },
      { arrayFilters }
    )
  ]);
}

async function updateVehicleStatusByNumber(gstinId, vehicleNo, status) {
  const vehicle = String(vehicleNo || '').trim();
  const nextStatus = String(status || '').trim();
  if (!vehicle || !nextStatus) return;
  const arrayFilters = [{ 'v.vehicleNo': vehicle }];
  await Promise.all([
    Branch.updateMany(
      { GSTIN_ID: gstinId, 'vehicles.vehicleNo': vehicle },
      { $set: { 'vehicles.$[v].vehicleStatus': nextStatus } },
      { arrayFilters }
    ),
    Hub.updateMany(
      { GSTIN_ID: gstinId, 'deliveryAddresses.vehicles.vehicleNo': vehicle },
      { $set: { 'deliveryAddresses.$[].vehicles.$[v].vehicleStatus': nextStatus } },
      { arrayFilters }
    )
  ]);
}

// Create a manifest for a consignment
router.post('/', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const statusRaw = String(req.body?.status || 'Scheduled').trim();
    const status = statusRaw.toLowerCase() === 'manifestation'
      ? 'Scheduled'
      : statusRaw;
    const vehicleNo = String(req.body?.vehicleNo || '').trim();
    const isPickup = String(status).toLowerCase() === 'will be picked-up';
    if (!vehicleNo && !isPickup) {
      return res.status(400).json({ message: 'vehicleNo is required' });
    }

    const entityTypeRaw = String(req.body?.entityType || '').trim().toLowerCase();
    const entityIdRaw = String(req.body?.entityId || '').trim();
    const deliveryTypeRaw = String(req.body?.deliveryType || '').trim().toLowerCase();
    const deliveryIdRaw = String(req.body?.deliveryId || '').trim();
    if (!['branch', 'hub'].includes(entityTypeRaw)) {
      return res.status(400).json({ message: 'entityType must be "branch" or "hub"' });
    }
    if (!mongoose.Types.ObjectId.isValid(entityIdRaw)) {
      return res.status(400).json({ message: 'Invalid entityId' });
    }
    if (deliveryIdRaw && !mongoose.Types.ObjectId.isValid(deliveryIdRaw)) {
      return res.status(400).json({ message: 'Invalid deliveryId' });
    }

    const allowedoriginLocIds = getAllowedoriginLocIds(req);
    if (allowedoriginLocIds) {
      if (entityTypeRaw === 'branch') {
        if (!allowedoriginLocIds.includes(entityIdRaw)) {
          return res.status(403).json({ message: 'Branch access denied' });
        }
      } else {
        const hub = await Hub.findOne({ _id: entityIdRaw, GSTIN_ID: gstinId })
          .select('_id originLocId')
          .lean();
        const huboriginLocId = String(hub?.originLocId || '');
        if (!hub || !huboriginLocId || !allowedoriginLocIds.includes(huboriginLocId)) {
          return res.status(403).json({ message: 'Hub access denied' });
        }
      }
    }

    const consignments = Array.isArray(req.body?.consignments) ? req.body.consignments : [];
    if (!consignments.length) {
      return res.status(400).json({ message: 'consignments array is required' });
    }

    const shipmentIds = [];
    const consignmentNumbers = [];
    consignments.forEach((c) => {
      const shipmentId = String(c?.shipmentId || '').trim();
      const consignmentNumber = String(c?.consignmentNumber || '').trim();
      if (shipmentId && mongoose.Types.ObjectId.isValid(shipmentId)) {
        shipmentIds.push(new mongoose.Types.ObjectId(shipmentId));
      } else if (consignmentNumber) {
        consignmentNumbers.push(consignmentNumber);
      }
    });

    const shipments = await Shipment.find({
      GSTIN_ID: gstinId,
      $or: [
        shipmentIds.length ? { _id: { $in: shipmentIds } } : null,
        consignmentNumbers.length ? { consignmentNumber: { $in: consignmentNumbers } } : null
      ].filter(Boolean)
    })
      .select('_id consignmentNumber originLocId originLocIdoriginType originLocId')
      .lean();

    if (!shipments.length) {
      return res.status(404).json({ message: 'No consignments found' });
    }

    const shipmentById = new Map(shipments.map((s) => [String(s._id), s]));
    const shipmentByConsignment = new Map(shipments.map((s) => [String(s.consignmentNumber), s]));
    const items = [];
    for (const c of consignments) {
      const shipmentId = String(c?.shipmentId || '').trim();
      const consignmentNumber = String(c?.consignmentNumber || '').trim();
      const status = String(c?.status || 'Manifested').trim();
      const deliveredAt = c?.deliveredAt ? new Date(c.deliveredAt) : null;
      let shipment = null;
      if (shipmentId) shipment = shipmentById.get(shipmentId);
      if (!shipment && consignmentNumber) shipment = shipmentByConsignment.get(consignmentNumber);
      if (!shipment?._id) continue;
      items.push({
        shipmentId: shipment._id,
        consignmentNumber: shipment.consignmentNumber || consignmentNumber || '',
        status,
        deliveredAt
      });
    }

    if (!items.length) {
      return res.status(400).json({ message: 'No valid consignments found' });
    }

    const { label: fiscalYear, start: fiscalYearStart } = getFiscalYearWindow();
    let createdManifest = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const manifestSequence = await getNextManifestSequence(
        gstinId,
        entityTypeRaw,
        entityIdRaw,
        fiscalYear
      );
      const manifestNumber = buildManifestNumber(manifestSequence);
      try {
        createdManifest = await Manifest.create({
          GSTIN_ID: gstinId,
          entityType: entityTypeRaw,
          entityId: entityIdRaw,
          deliveryType: deliveryTypeRaw || undefined,
          deliveryId: deliveryIdRaw || undefined,
          fiscalYear,
          fiscalYearStart,
          manifestSequence,
          manifestNumber,
          vehicleNo,
          status
        });
        break;
      } catch (err) {
        if (err?.code !== 11000) throw err;
      }
    }

    if (!createdManifest) {
      return res.status(409).json({ message: 'Failed to allocate manifest number. Please retry.' });
    }

    const itemDocs = items.map((item) => ({
      ...item,
      manifestId: createdManifest._id
    }));
    const createdItems = await ManifestItem.insertMany(itemDocs);

    res.status(201).json({ manifest: createdManifest, items: createdItems });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// List manifests for a company (optionally scoped by branch/status/vehicle)
router.get('/', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const status = String(req.query.status || '').trim();
    const vehicleNo = String(req.query.vehicleNo || '').trim();
    const consignmentNumber = String(req.query.consignmentNumber || '').trim();
    const originLocId = String(req.query.originLocId || '').trim();
    const originTypeQuery = String(req.query.originType || '').trim().toLowerCase();
    const originLocIdQuery = String(req.query.originLocId || '').trim();
    const entityType = String(req.query.entityType || '').trim().toLowerCase();
    const entityId = String(req.query.entityId || '').trim();

    const allowedoriginLocIds = getAllowedoriginLocIds(req);
    const filter = { GSTIN_ID: gstinId };
    let entityTypeFilter = '';
    let entityIdFilter = '';

    if (originTypeQuery && originLocIdQuery) {
      if (!['branch', 'hub'].includes(originTypeQuery)) {
        return res.status(400).json({ message: 'Invalid originType' });
      }
      if (!mongoose.Types.ObjectId.isValid(originLocIdQuery)) {
        return res.status(400).json({ message: 'Invalid originLocId' });
      }
      const access = await ensureManifestEntityAccess(
        originTypeQuery,
        originLocIdQuery,
        gstinId,
        allowedoriginLocIds
      );
      if (!access.ok) return res.status(403).json({ message: access.message });
      entityTypeFilter = originTypeQuery;
      entityIdFilter = originLocIdQuery;
    } else if (entityType && entityId) {
      if (!['branch', 'hub'].includes(entityType)) {
        return res.status(400).json({ message: 'Invalid entityType' });
      }
      if (!mongoose.Types.ObjectId.isValid(entityId)) {
        return res.status(400).json({ message: 'Invalid entityId' });
      }
      const access = await ensureManifestEntityAccess(entityType, entityId, gstinId, allowedoriginLocIds);
      if (!access.ok) return res.status(403).json({ message: access.message });
      entityTypeFilter = entityType;
      entityIdFilter = entityId;
    } else if (originLocId) {
      if (originLocId === 'all') {
        if (allowedoriginLocIds) {
          if (!allowedoriginLocIds.length) return res.json([]);
          filter.entityType = 'branch';
          filter.entityId = { $in: allowedoriginLocIds };
        }
      } else if (originLocId === 'all-hubs') {
        if (allowedoriginLocIds && !allowedoriginLocIds.length) return res.json([]);
        const hubQuery = { GSTIN_ID: gstinId };
        if (allowedoriginLocIds) {
          hubQuery.originLocId = { $in: allowedoriginLocIds };
        }
        const hubs = await Hub.find(hubQuery).select('_id').lean();
        const hubIds = (hubs || []).map((h) => String(h?._id || '')).filter(Boolean);
        if (!hubIds.length) return res.json([]);
        filter.entityType = 'hub';
        filter.entityId = { $in: hubIds };
      } else {
        if (!mongoose.Types.ObjectId.isValid(originLocId)) {
          return res.status(400).json({ message: 'Invalid originLocId' });
        }
        const hub = await Hub.findOne({ _id: originLocId, GSTIN_ID: gstinId })
          .select('_id originLocId')
          .lean();
        if (hub) {
          const huboriginLocId = String(hub.originLocId || '');
          const access = await ensureManifestEntityAccess(
            'hub',
            originLocId,
            gstinId,
            allowedoriginLocIds,
            huboriginLocId
          );
          if (!access.ok) return res.status(403).json({ message: access.message });
          entityTypeFilter = 'hub';
          entityIdFilter = originLocId;
        } else {
          if (allowedoriginLocIds && !allowedoriginLocIds.includes(originLocId)) {
            return res.status(403).json({ message: 'Branch access denied' });
          }
          entityTypeFilter = 'branch';
          entityIdFilter = originLocId;
        }
      }
    } else if (allowedoriginLocIds) {
      if (!allowedoriginLocIds.length) return res.json([]);
      filter.entityType = 'branch';
      filter.entityId = { $in: allowedoriginLocIds };
    }

    if (entityTypeFilter && entityIdFilter) {
      filter.entityType = entityTypeFilter;
      filter.entityId = entityIdFilter;
    }

    if (status) filter.status = status;
    if (vehicleNo) filter.vehicleNo = vehicleNo;
    if (consignmentNumber) {
      const items = await ManifestItem.find({ consignmentNumber }).select('manifestId').lean();
      const manifestIds = items.map((i) => i.manifestId);
      if (!manifestIds.length) return res.json([]);
      filter._id = { $in: manifestIds };
    }

    const manifests = await Manifest.find(filter).sort({ manifestSequence: -1 }).lean();
    if (!manifests.length) return res.json([]);
    const manifestIds = manifests.map((m) => m._id);
    const items = await ManifestItem.find({ manifestId: { $in: manifestIds } }).lean();
    const itemsByManifest = new Map();
    for (const item of items) {
      const key = String(item.manifestId);
      if (!itemsByManifest.has(key)) itemsByManifest.set(key, []);
      itemsByManifest.get(key).push(item);
    }

    const shipmentIds = Array.from(new Set(
      (items || []).map((i) => String(i?.shipmentId || '')).filter(Boolean)
    ));
    const consignmentNumbers = Array.from(new Set(
      (items || []).map((i) => String(i?.consignmentNumber || '')).filter(Boolean)
    ));

    let shipmentStatusById = new Map();
    let shipmentStatusByConsignment = new Map();
    if (shipmentIds.length || consignmentNumbers.length) {
      const shipments = await Shipment.find({
        GSTIN_ID: gstinId,
        $or: [
          shipmentIds.length ? { _id: { $in: shipmentIds } } : null,
          consignmentNumbers.length ? { consignmentNumber: { $in: consignmentNumbers } } : null
        ].filter(Boolean)
      }).select('_id consignmentNumber shipmentStatus').lean();
      shipmentStatusById = new Map(
        (shipments || []).map((s) => [String(s._id), String(s?.shipmentStatus || '').trim()])
      );
      shipmentStatusByConsignment = new Map(
        (shipments || []).map((s) => [String(s?.consignmentNumber || ''), String(s?.shipmentStatus || '').trim()])
      );
    }

    let scheduledManifestIds = new Set();
    let scheduledByConsignment = new Map();
    if (shipmentIds.length || consignmentNumbers.length) {
      const relatedItems = await ManifestItem.find({
        $or: [
          shipmentIds.length ? { shipmentId: { $in: shipmentIds } } : null,
          consignmentNumbers.length ? { consignmentNumber: { $in: consignmentNumbers } } : null
        ].filter(Boolean)
      }).select('manifestId shipmentId consignmentNumber').lean();
      const relatedManifestIds = Array.from(new Set(
        (relatedItems || []).map((i) => String(i?.manifestId || '')).filter(Boolean)
      ));
      if (relatedManifestIds.length) {
        const scheduled = await Manifest.find({
          GSTIN_ID: gstinId,
          status: 'Scheduled',
          _id: { $in: relatedManifestIds }
        }).select('_id').lean();
        scheduledManifestIds = new Set((scheduled || []).map((m) => String(m._id)));
      }
      scheduledByConsignment = new Map();
      (relatedItems || []).forEach((item) => {
        const manifestId = String(item?.manifestId || '');
        if (!scheduledManifestIds.has(manifestId)) return;
        const key = String(item?.shipmentId || item?.consignmentNumber || '').trim();
        if (!key) return;
        const list = scheduledByConsignment.get(key) || new Set();
        list.add(manifestId);
        scheduledByConsignment.set(key, list);
      });
    }

    const payload = manifests.map((m) => {
      const manifestItems = itemsByManifest.get(String(m._id)) || [];
      const hasDelivered = manifestItems.some((item) => {
        const shipmentId = String(item?.shipmentId || '').trim();
        const consignmentNumber = String(item?.consignmentNumber || '').trim();
        const status = shipmentId
          ? shipmentStatusById.get(shipmentId)
          : shipmentStatusByConsignment.get(consignmentNumber);
        return String(status || '').trim().toLowerCase() === 'delivered';
      });
      const hasOtherScheduled = manifestItems.some((item) => {
        const shipmentId = String(item?.shipmentId || '').trim();
        const consignmentNumber = String(item?.consignmentNumber || '').trim();
        const key = shipmentId || consignmentNumber;
        if (!key) return false;
        const scheduledList = scheduledByConsignment.get(key);
        if (!scheduledList || !scheduledList.size) return false;
        if (scheduledList.size > 1) return true;
        return !scheduledList.has(String(m._id));
      });
      const normalizedStatus = String(m?.status || '').trim().toLowerCase();
      const canUncancel = normalizedStatus === 'cancelled' &&
        !hasDelivered &&
        !hasOtherScheduled;
      return {
        ...m,
        items: manifestItems,
        canUncancel
      };
    });
    res.json(payload);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// List eligible consignments to add to a manifest (auth required)
router.get('/:id/eligible-consignments', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const manifestId = String(req.params.id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(manifestId)) {
      return res.status(400).json({ message: 'Invalid manifest id' });
    }

    const manifest = await Manifest.findOne({ _id: manifestId, GSTIN_ID: gstinId }).lean();
    if (!manifest) return res.status(404).json({ message: 'Manifest not found' });

    const allowedoriginLocIds = getAllowedoriginLocIds(req);
    if (allowedoriginLocIds) {
      if (manifest.entityType === 'branch') {
        if (!allowedoriginLocIds.includes(String(manifest.entityId))) {
          return res.status(403).json({ message: 'Branch access denied' });
        }
      } else if (manifest.entityType === 'hub') {
        const hub = await Hub.findOne({ _id: manifest.entityId, GSTIN_ID: gstinId })
          .select('_id originLocId')
          .lean();
        const huboriginLocId = String(hub?.originLocId || '');
        if (!hub || !huboriginLocId || !allowedoriginLocIds.includes(huboriginLocId)) {
          return res.status(403).json({ message: 'Hub access denied' });
        }
      }
    }

    const existingItems = await ManifestItem.find({ manifestId })
      .select('shipmentId consignmentNumber')
      .lean();
    const existingShipmentIds = new Set(
      (existingItems || []).map((i) => String(i?.shipmentId || '')).filter(Boolean)
    );
    const entityType = String(manifest.entityType || '').trim().toLowerCase();
    const entityId = String(manifest.entityId || '').trim();
    if (!['branch', 'hub'].includes(entityType) || !mongoose.Types.ObjectId.isValid(entityId)) {
      return res.status(400).json({ message: 'Invalid manifest entity' });
    }

    const originId = new mongoose.Types.ObjectId(entityId);
    const eligible = await Shipment.find({
      GSTIN_ID: gstinId,
      shipmentStatus: { $in: ['Pending', 'DPending'] },
      $or: [
        { currentLocationId: originId },
        { currentLocationId: entityId }
      ]
    })
      .select('_id consignmentNumber shipmentStatus originLocId originLocIdoriginType originLocId')
      .lean();

    const filtered = (eligible || []).filter((s) => {
      const id = String(s?._id || '');
      if (id && existingShipmentIds.has(id)) return false;
      return true;
    });

    res.json({ consignments: filtered });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Get all consignments linked to a manifest
router.get('/:id/consignments', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const manifestId = String(req.params.id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(manifestId)) {
      return res.status(400).json({ message: 'Invalid manifest id' });
    }

    const manifest = await Manifest.findOne({ _id: manifestId, GSTIN_ID: gstinId }).lean();
    if (!manifest) return res.status(404).json({ message: 'Manifest not found' });

    const allowedoriginLocIds = getAllowedoriginLocIds(req);
    if (allowedoriginLocIds) {
      if (manifest.entityType === 'branch') {
        if (!allowedoriginLocIds.includes(String(manifest.entityId))) {
          return res.status(403).json({ message: 'Branch access denied' });
        }
      } else if (manifest.entityType === 'hub') {
        const hub = await Hub.findOne({ _id: manifest.entityId, GSTIN_ID: gstinId })
          .select('_id originLocId')
          .lean();
        const huboriginLocId = String(hub?.originLocId || '');
        if (!hub || !huboriginLocId || !allowedoriginLocIds.includes(huboriginLocId)) {
          return res.status(403).json({ message: 'Hub access denied' });
        }
      }
    }

    const manifestItems = await ManifestItem.find({ manifestId })
      .select('shipmentId')
      .lean();

    if (!manifestItems.length) {
      return res.json([]);
    }

    const shipmentIds = Array.from(new Set(
      manifestItems.map((item) => String(item?.shipmentId || '').trim()).filter((id) => mongoose.Types.ObjectId.isValid(id))
    ));
    if (!shipmentIds.length) {
      return res.json([]);
    }
    const shipments = await Shipment.find({
      GSTIN_ID: gstinId,
      _id: { $in: shipmentIds }
    }).lean();
    const shipmentMap = new Map((shipments || []).map((s) => [String(s._id), s]));

    const results = [];
    for (const item of manifestItems) {
      const shipment = shipmentMap.get(String(item?.shipmentId || '').trim());
      if (!shipment) continue;
      results.push({
        shipment,
        manifestId,
        manifestItemId: String(item?._id || '')
      });
    }

    if (!results.length) {
      return res.json([]);
    }

    const views = await buildShipmentViews(results.map((entry) => entry.shipment));
    const payload = views.map((view, index) => ({
      ...view,
      manifestId: results[index].manifestId,
      manifestItemId: results[index].manifestItemId
    }));
    res.json(payload);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Add/remove consignments from a manifest (auth required)
router.patch('/:id/consignments', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const manifestId = String(req.params.id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(manifestId)) {
      return res.status(400).json({ message: 'Invalid manifest id' });
    }

    const manifest = await Manifest.findOne({ _id: manifestId, GSTIN_ID: gstinId }).lean();
    if (!manifest) return res.status(404).json({ message: 'Manifest not found' });

    const normalizedStatus = String(manifest?.status || '').trim().toLowerCase();
    if (normalizedStatus === 'completed' || normalizedStatus === 'cancelled') {
      return res.status(400).json({ message: 'Cannot modify consignments for completed/cancelled manifests' });
    }

    const allowedoriginLocIds = getAllowedoriginLocIds(req);
    if (allowedoriginLocIds) {
      if (manifest.entityType === 'branch') {
        if (!allowedoriginLocIds.includes(String(manifest.entityId))) {
          return res.status(403).json({ message: 'Branch access denied' });
        }
      } else if (manifest.entityType === 'hub') {
        const hub = await Hub.findOne({ _id: manifest.entityId, GSTIN_ID: gstinId })
          .select('_id originLocId')
          .lean();
        const huboriginLocId = String(hub?.originLocId || '');
        if (!hub || !huboriginLocId || !allowedoriginLocIds.includes(huboriginLocId)) {
          return res.status(403).json({ message: 'Hub access denied' });
        }
      }
    }

    const addIds = Array.isArray(req.body?.addShipmentIds) ? req.body.addShipmentIds : [];
    const removeIds = Array.isArray(req.body?.removeShipmentIds) ? req.body.removeShipmentIds : [];

    const addIdValues = addIds.map((id) => String(id || '').trim()).filter(Boolean);
    const removeIdValues = removeIds.map((id) => String(id || '').trim()).filter(Boolean);

    let removedCount = 0;
    if (removeIdValues.length) {
      const removeMatch = {
        manifestId,
        shipmentId: { $in: removeIdValues }
      };
      if (removeMatch.shipmentId.$in.length) {
        const existingItems = await ManifestItem.find(removeMatch)
          .select('shipmentId')
          .lean();
        const shipmentIds = (existingItems || []).map((i) => i?.shipmentId).filter(Boolean);
        if (shipmentIds.length || existingItems.length) {
          const updateIds = shipmentIds.filter((id) => mongoose.Types.ObjectId.isValid(String(id)));
          if (updateIds.length) {
            await Shipment.updateMany(
              { GSTIN_ID: gstinId, _id: { $in: updateIds } },
              [
                {
                  $set: {
                    shipmentStatus: {
                      $cond: [{ $regexMatch: { input: '$shipmentStatus', regex: /^D/i } }, 'DPending', 'Pending']
                    }
                  }
                }
              ]
            );
          }
        }
        const del = await ManifestItem.deleteMany(removeMatch);
        removedCount = del?.deletedCount || 0;
      }
    }

    let addedCount = 0;
    if (addIdValues.length) {
      const addMatch = {
        GSTIN_ID: gstinId,
        _id: { $in: addIdValues },
        shipmentStatus: { $in: ['Pending', 'DPending'] }
      };
      const shipments = await Shipment.find(addMatch)
        .select('_id consignmentNumber shipmentStatus')
        .lean();
      const existingItems = await ManifestItem.find({ manifestId })
        .select('shipmentId')
        .lean();
      const existingShipmentIds = new Set(
        (existingItems || []).map((i) => String(i?.shipmentId || '')).filter(Boolean)
      );
      const toInsert = (shipments || [])
        .filter((s) => !existingShipmentIds.has(String(s._id)))
        .map((s) => ({
          manifestId,
          shipmentId: s._id,
          consignmentNumber: s?.consignmentNumber || '',
          status: manifest?.status || 'Manifested'
        }));
      if (toInsert.length) {
        await ManifestItem.insertMany(toInsert);
        addedCount = toInsert.length;
      }
      const addShipmentIds = (shipments || []).map((s) => s._id).filter(Boolean);
      if (addShipmentIds.length) {
        await Shipment.updateMany(
          { GSTIN_ID: gstinId, _id: { $in: addShipmentIds } },
          [
            {
              $set: {
                shipmentStatus: {
                  $cond: [{ $regexMatch: { input: '$shipmentStatus', regex: /^D/i } }, 'DManifestation', 'Manifestation']
                }
              }
            }
          ]
        );
      }
    }

    const remainingItems = await ManifestItem.find({ manifestId }).lean();
    if (!remainingItems.length) {
      await Manifest.updateOne(
        { _id: manifestId, GSTIN_ID: gstinId },
        { $set: { status: 'Cancelled', deliveredAt: null } }
      );
    }

    const updatedManifest = await Manifest.findOne({ _id: manifestId, GSTIN_ID: gstinId }).lean();
    res.json({
      manifest: updatedManifest,
      items: remainingItems,
      addedCount,
      removedCount
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Mark a manifest (and items) delivered or update status
router.put('/:id/status', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const manifestId = String(req.params.id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(manifestId)) {
      return res.status(400).json({ message: 'Invalid manifest id' });
    }

    const manifest = await Manifest.findOne({ _id: manifestId, GSTIN_ID: gstinId }).lean();
    if (!manifest) return res.status(404).json({ message: 'Manifest not found' });

    const allowedoriginLocIds = getAllowedoriginLocIds(req);
    if (allowedoriginLocIds) {
      if (manifest.entityType === 'branch') {
        if (!allowedoriginLocIds.includes(String(manifest.entityId))) {
          return res.status(403).json({ message: 'Branch access denied' });
        }
      } else if (manifest.entityType === 'hub') {
        const hub = await Hub.findOne({ _id: manifest.entityId, GSTIN_ID: gstinId })
          .select('_id originLocId')
          .lean();
        const huboriginLocId = String(hub?.originLocId || '');
        if (!hub || !huboriginLocId || !allowedoriginLocIds.includes(huboriginLocId)) {
          return res.status(403).json({ message: 'Hub access denied' });
        }
      }
    }

    const status = String(req.body?.status || 'Completed').trim();
    const normalizedStatus = String(status).trim().toLowerCase();
    const deliveredAt = req.body?.deliveredAt ? new Date(req.body.deliveredAt) : new Date();
    const deliveredAtValue = normalizedStatus === 'completed' ? deliveredAt : null;

    await Promise.all([
      Manifest.updateOne(
        { _id: manifestId, GSTIN_ID: gstinId },
        { $set: { status, deliveredAt: deliveredAtValue } }
      ),
      ManifestItem.updateMany(
        { manifestId },
        { $set: { status, deliveredAt: deliveredAtValue } }
      )
    ]);

    let cancelStats = null;
    if (normalizedStatus === 'cancelled') {
      const manifestItems = await ManifestItem.find({ manifestId })
        .select('shipmentId consignmentNumber')
        .lean();
      const shipmentIds = (manifestItems || [])
        .map((i) => i?.shipmentId)
        .filter(Boolean);
      const consignmentNumbers = (manifestItems || [])
        .map((i) => String(i?.consignmentNumber || '').trim())
        .filter(Boolean);
      const match = {
        GSTIN_ID: gstinId
      };
      if (shipmentIds.length) {
        match._id = { $in: shipmentIds };
      }
      cancelStats = {
        shipmentIdsCount: shipmentIds.length,
        consignmentNumbersCount: consignmentNumbers.length
      };
      if (shipmentIds.length) {
        const dPrefixExpr = {
          $regexMatch: {
            input: { $trim: { input: '$shipmentStatus' } },
            regex: /^D/i
          }
        };
        const dpendingResult = await Shipment.updateMany(
          {
            ...match,
            $expr: dPrefixExpr
          },
          { $set: { shipmentStatus: 'DPending' } }
        );
        const pendingResult = await Shipment.updateMany(
          {
            ...match,
            $expr: { $not: [dPrefixExpr] }
          },
          { $set: { shipmentStatus: 'Pending' } }
        );
        cancelStats = {
          ...cancelStats,
          dpendingMatched: dpendingResult?.matchedCount || 0,
          dpendingModified: dpendingResult?.modifiedCount || 0,
          pendingMatched: pendingResult?.matchedCount || 0,
          pendingModified: pendingResult?.modifiedCount || 0
        };
        res.setHeader('x-cancelled-dpending-matched', String(dpendingResult?.matchedCount || 0));
        res.setHeader('x-cancelled-dpending-modified', String(dpendingResult?.modifiedCount || 0));
        res.setHeader('x-cancelled-pending-matched', String(pendingResult?.matchedCount || 0));
        res.setHeader('x-cancelled-pending-modified', String(pendingResult?.modifiedCount || 0));
      }
    }

    if (normalizedStatus === 'scheduled') {
      const manifestItems = await ManifestItem.find({ manifestId })
        .select('shipmentId consignmentNumber')
        .lean();
      const shipmentIds = (manifestItems || [])
        .map((i) => i?.shipmentId)
        .filter(Boolean);
      if (shipmentIds.length) {
        const match = {
          GSTIN_ID: gstinId,
          _id: { $in: shipmentIds }
        };
        await Shipment.updateMany(
          {
            ...match,
            shipmentStatus: { $regex: /^DPending/i }
          },
          { $set: { shipmentStatus: 'DManifestation' } }
        );
        await Shipment.updateMany(
          {
            ...match,
            shipmentStatus: { $regex: /^Pending/i }
          },
          { $set: { shipmentStatus: 'Manifestation' } }
        );
      }
    }

    if (normalizedStatus === 'completed') {
      const deliveryId = String(manifest?.deliveryId || '').trim();
      const deliveryType = String(manifest?.deliveryType || '').trim().toLowerCase();
      const fallbackType = String(manifest?.entityType || '').trim().toLowerCase();
      const fallbackId = String(manifest?.entityId || '').trim();
      const targetLocationId = deliveryId || fallbackId;
      const targetLocationType = deliveryType || fallbackType;
      if (manifest?.vehicleNo && targetLocationId) {
        await updateVehicleCurrentLocation(
          gstinId,
          manifest.vehicleNo,
          targetLocationId,
          targetLocationType
        );
      }
      const manifestItems = await ManifestItem.find({ manifestId })
        .select('shipmentId')
        .lean();
      const shipmentIds = (manifestItems || [])
        .map((i) => i?.shipmentId)
        .filter(Boolean);
      if (shipmentIds.length) {
        const shipments = await Shipment.find({ GSTIN_ID: gstinId, _id: { $in: shipmentIds } })
          .select('_id shipmentStatus')
          .lean();
        const updates = (shipments || []).map((s) => {
          const currentStatus = String(s?.shipmentStatus || '').trim();
          const normalized = currentStatus.toLowerCase().replace(/[^a-z]/g, '');
          const isManifestationLike = normalized.includes('manifestation') || normalized.includes('dmanifestation');
          const nextStatus = isManifestationLike
            ? 'DPending'
            : 'Delivered';
          return {
            updateOne: {
              filter: { _id: s._id, GSTIN_ID: gstinId },
              update: {
                  $set: {
                    shipmentStatus: nextStatus,
                    currentLocationId: targetLocationId,
                    currentVehicleNo: '',
                    currentVehicleOwnerType: '',
                    currentVehicleOwnerId: null
                  }
              }
            }
          };
        });
        if (updates.length) {
          await Shipment.bulkWrite(updates);
        }
      }
    }

    const updated = await Manifest.findOne({ _id: manifestId, GSTIN_ID: gstinId }).lean();
    const items = await ManifestItem.find({ manifestId }).lean();
    res.json({ manifest: updated, items, cancelStats });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update manifest vehicle (auth required)
router.patch('/:id/vehicle', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const manifestId = String(req.params.id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(manifestId)) {
      return res.status(400).json({ message: 'Invalid manifest id' });
    }

    const vehicleNo = String(req.body?.vehicleNo || '').trim();
    if (!vehicleNo) return res.status(400).json({ message: 'Vehicle number is required' });

    const manifest = await Manifest.findOne({ _id: manifestId, GSTIN_ID: gstinId }).lean();
    if (!manifest) return res.status(404).json({ message: 'Manifest not found' });

    const allowedoriginLocIds = getAllowedoriginLocIds(req);
    if (allowedoriginLocIds) {
      if (manifest.entityType === 'branch') {
        if (!allowedoriginLocIds.includes(String(manifest.entityId))) {
          return res.status(403).json({ message: 'Branch access denied' });
        }
      } else if (manifest.entityType === 'hub') {
        const hub = await Hub.findOne({ _id: manifest.entityId, GSTIN_ID: gstinId })
          .select('_id originLocId')
          .lean();
        const huboriginLocId = String(hub?.originLocId || '');
        if (!hub || !huboriginLocId || !allowedoriginLocIds.includes(huboriginLocId)) {
          return res.status(403).json({ message: 'Hub access denied' });
        }
      }
    }

    await Manifest.updateOne(
      { _id: manifestId, GSTIN_ID: gstinId },
      { $set: { vehicleNo } }
    );
    await updateVehicleStatusByNumber(gstinId, vehicleNo, 'scheduled');
    const previousVehicle = String(manifest?.vehicleNo || '').trim();
    if (previousVehicle && previousVehicle !== vehicleNo) {
      await updateVehicleStatusByNumber(gstinId, previousVehicle, 'online');
    }

    const updated = await Manifest.findOne({ _id: manifestId, GSTIN_ID: gstinId }).lean();
    res.json({ manifest: updated });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

export default router;
