// shipment-backend/routes/clients.js
import express from 'express';
import Client from '../models/Client.js';
import Branch from '../models/Branch.js';
import Shipment from '../models/NewShipment/NewShipmentShipment.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';

const router = express.Router();

function normalizeClientPayload(payload = {}) {
  const normalized = { ...payload };
  const deliveryLocations = Array.isArray(normalized.deliveryLocations)
    ? normalized.deliveryLocations.map((loc) => ({ ...loc }))
    : [];

  const address = normalized.address;
  const city = normalized.city;
  const state = normalized.state;
  const pinCode = normalized.pinCode;
  const hasTopAddress = Boolean(address || city || state || pinCode);

  if (hasTopAddress) {
    const first = deliveryLocations[0] ? { ...deliveryLocations[0] } : {};
    if (address) {
      first.address = address;
      if (!first.location) {
        first.location = address;
      }
    }
    if (city) first.city = city;
    if (state) first.state = state;
    if (pinCode) first.pinCode = pinCode;
    if (deliveryLocations.length) {
      deliveryLocations[0] = first;
    } else {
      deliveryLocations.push(first);
    }
  }

  normalized.deliveryLocations = deliveryLocations;
  delete normalized.address;
  delete normalized.city;
  delete normalized.state;
  delete normalized.pinCode;
  return normalized;
}

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

// Create new client (admin only)
router.post('/add', requireAuth, requireAdmin, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    const userId = Number(req.user.userId);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    if (!Number.isFinite(userId)) return res.status(400).json({ message: 'Invalid user_id' });

    const client = new Client({
      ...normalizeClientPayload(req.body),
      GSTIN_ID: gstinId,
      user_id: userId
    });

    await client.save();
    const [withName] = await withBranchNames([client]);
    res.status(201).json(withName);
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

    const { branchId } = req.query;
    const query = { GSTIN_ID: gstinId };
    if (branchId && branchId !== 'all') {
      query.branchId = branchId;
    }

    const clients = await Client.find(query).sort({ createdAt: -1 }).lean();
    const withNames = await withBranchNames(clients);
    res.json(withNames);
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
      normalizeClientPayload(req.body),
      { new: true }
    );
    if (!client) return res.status(404).json({ message: 'Client not found' });
    const [withName] = await withBranchNames([client]);
    res.json({ success: true, client: withName });
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


// Update client pricing for a pickup/delivery route
router.post('/:id/pricing', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const client = await Client.findOne({ _id: req.params.id, GSTIN_ID: gstinId });
    if (!client) return res.status(404).json({ message: 'Client not found' });

    let pickupLocationId = String(req.body?.pickupLocationId || '').trim();
    let deliveryLocationId = String(req.body?.deliveryLocationId || '').trim();
    const consignmentNumber = String(req.body?.consignmentNumber || '').trim();
    const rateUnit = String(req.body?.rateUnit || '').toLowerCase();
    const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];

    if (!pickupLocationId || !deliveryLocationId) {
      const shipmentQuery = {
        GSTIN_ID: gstinId,
        $or: [{ consignorId: client._id }, { billingClientId: client._id }],
        pickupLocationId: { $exists: true, $ne: null },
        deliveryLocationId: { $exists: true, $ne: null }
      };
      const shipment = consignmentNumber
        ? await Shipment.findOne({ ...shipmentQuery, consignmentNumber })
            .select('pickupLocationId deliveryLocationId')
            .lean()
        : await Shipment.findOne(shipmentQuery)
            .sort({ createdAt: -1 })
            .select('pickupLocationId deliveryLocationId')
            .lean();
      if (shipment) {
        if (!pickupLocationId) {
          pickupLocationId = String(shipment.pickupLocationId || '').trim();
        }
        if (!deliveryLocationId) {
          deliveryLocationId = String(shipment.deliveryLocationId || '').trim();
        }
      }
    }

    if (!pickupLocationId || !deliveryLocationId) {
      return res.status(400).json({ message: 'pickupLocationId and deliveryLocationId are required' });
    }

    const rateField = rateUnit === 'cm3' || rateUnit === 'volume'
      ? 'ratePerVolume'
      : rateUnit === 'kg'
        ? 'ratePerKg'
        : 'ratePerNum';

    if (!Array.isArray(client.products)) {
      client.products = [];
    }

    const normalizeToken = (value) => String(value || '').trim().toUpperCase();

    updates.forEach((u) => {
      const productName = String(u?.productName || '').trim();
      if (!productName) return;
      const hsnNum = String(u?.hsnNum || '').trim();
      const rawRate = u?.ratePer ?? u?.enteredRate ?? u?.rate;
      const ratePer = Number(rawRate);
      if (!Number.isFinite(ratePer)) return;

      const normalizedProductName = normalizeToken(productName);
      const normalizedHsn = normalizeToken(hsnNum);

      let product = client.products.find((p) =>
        normalizeToken(p.productName) === normalizedProductName &&
        (!normalizedHsn || normalizeToken(p.hsnNum) === normalizedHsn)
      );
      if (!product && normalizedHsn) {
        product = client.products.find((p) =>
          normalizeToken(p.productName) === normalizedProductName
        );
      }
      if (!product) {
        client.products.push({ hsnNum, productName, rates: [] });
        product = client.products[client.products.length - 1];
      } else if (normalizedHsn && !String(product.hsnNum || '').trim()) {
        product.hsnNum = hsnNum;
      }
      if (!Array.isArray(product.rates)) product.rates = [];

      let rateEntry = product.rates.find((r) =>
        String(r.pickupLocationId || '').trim() === pickupLocationId &&
        String(r.deliveryLocationId || '').trim() === deliveryLocationId
      );
      if (!rateEntry) {
        product.rates.push({
          pickupLocationId,
          deliveryLocationId,
          rate: { [rateField]: ratePer }
        });
        return;
      }
      rateEntry.pickupLocationId = pickupLocationId;
      rateEntry.deliveryLocationId = deliveryLocationId;
      const existingRate = rateEntry.rate?.toObject ? rateEntry.rate.toObject() : (rateEntry.rate || {});
      rateEntry.rate = { ...existingRate, [rateField]: ratePer };
    });

    client.markModified('products');
    await client.save();
    const updated = await Client.findById(client._id).select('products');
    res.json({ success: true, products: updated?.products || [] });
  } catch (err) {
    res.status(400).json({ message: err.message });
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
    const clients = await Client.find({ GSTIN_ID: gstinId }).sort({ createdAt: -1 }).lean();
    const withNames = await withBranchNames(clients);
    res.json(withNames);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET active clients for dropdown (auth required)
router.get('/clientslist', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    const { branchId } = req.query;
    const query = { GSTIN_ID: gstinId, status: 'active' };
    if (branchId && branchId !== 'all') {
      query.branchId = branchId;
    }
    const clients = await Client.find(query)
      .select('clientName GSTIN phoneNum branchId creditType perDis deliveryLocations')
      .lean();
    const withNames = await withBranchNames(clients);
    res.json(withNames);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
