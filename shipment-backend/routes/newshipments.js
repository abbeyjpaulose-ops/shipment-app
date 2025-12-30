// shipment-backend/routes/newshipments.js
import express from 'express';
import Shipment from '../models/NewShipment/NewShipmentShipment.js';
import Ewaybill from '../models/NewShipment/NewShipmentEwaybill.js';
import Invoice from '../models/NewShipment/NewShipmentInvoice.js';
import InvoiceProduct from '../models/NewShipment/NewShipmentInvoiceProduct.js';
import InvoicePackage from '../models/NewShipment/NewShipmentInvoicePackage.js';
import Client from '../models/Client.js';
import Guest from '../models/Guest.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

function formatLocation(loc) {
  if (!loc) return '';
  const address = loc.address || loc.location || '';
  const pin = loc.pinCode || loc.pincode || loc.pin || '';
  const parts = [address, loc.city, loc.state, pin].filter(Boolean);
  return parts.join(', ');
}

function findLocationById(locations, targetId) {
  if (!targetId) return null;
  const matchId = String(targetId);
  return (locations || []).find((loc) => {
    const locId = loc?.delivery_id || loc?._id || loc?.id;
    return locId && String(locId) === matchId;
  }) || null;
}

async function buildShipmentViews(shipments) {
  const clientIds = new Set();
  const guestIds = new Set();
  for (const shipment of shipments || []) {
    if (shipment?.consignorTab === 'guest' && shipment?.consignorId) {
      guestIds.add(String(shipment.consignorId));
    } else if (shipment?.consignorId) {
      clientIds.add(String(shipment.consignorId));
    }
    if (shipment?.consigneeTab === 'guest' && shipment?.consigneeId) {
      guestIds.add(String(shipment.consigneeId));
    } else if (shipment?.consigneeId) {
      clientIds.add(String(shipment.consigneeId));
    }
  }

  const [clients, guests] = await Promise.all([
    clientIds.size ? Client.find({ _id: { $in: Array.from(clientIds) } }).lean() : [],
    guestIds.size ? Guest.find({ _id: { $in: Array.from(guestIds) } }).lean() : []
  ]);

  const clientsById = new Map((clients || []).map((c) => [String(c._id), c]));
  const guestsById = new Map((guests || []).map((g) => [String(g._id), g]));

  const shipmentIds = shipments.map((s) => s._id);
  const ewaybills = await Ewaybill.find({ shipmentId: { $in: shipmentIds } }).lean();
  const ewaybillIds = ewaybills.map((e) => e._id);
  const invoices = await Invoice.find({ ewaybillId: { $in: ewaybillIds } }).lean();
  const invoiceIds = invoices.map((i) => i._id);
  const products = await InvoiceProduct.find({ invoiceId: { $in: invoiceIds } }).lean();
  const packages = await InvoicePackage.find({ invoiceId: { $in: invoiceIds } }).lean();

  const productsByInvoice = new Map();
  for (const prod of products) {
    const key = prod.invoiceId.toString();
    if (!productsByInvoice.has(key)) productsByInvoice.set(key, []);
    productsByInvoice.get(key).push({
      type: prod.type,
      amount: prod.amount,
      ratePer: prod.ratePer,
      instock: prod.instock,
      intransitstock: prod.intransitstock,
      deliveredstock: prod.deliveredstock
    });
  }

  const packagesByInvoice = new Map();
  for (const pack of packages) {
    const key = pack.invoiceId.toString();
    if (!packagesByInvoice.has(key)) packagesByInvoice.set(key, []);
    packagesByInvoice.get(key).push({
      type: pack.type,
      amount: pack.amount
    });
  }

  const invoicesByEwaybill = new Map();
  for (const inv of invoices) {
    const key = inv.ewaybillId.toString();
    if (!invoicesByEwaybill.has(key)) invoicesByEwaybill.set(key, []);
    invoicesByEwaybill.get(key).push({
      number: inv.number,
      value: inv.value,
      products: productsByInvoice.get(inv._id.toString()) || [],
      packages: packagesByInvoice.get(inv._id.toString()) || []
    });
  }

  const ewaybillsByShipment = new Map();
  for (const ewb of ewaybills) {
    const key = ewb.shipmentId.toString();
    if (!ewaybillsByShipment.has(key)) ewaybillsByShipment.set(key, []);
    ewaybillsByShipment.get(key).push({
      number: ewb.number,
      date: ewb.date,
      routes: ewb.routes,
      invoices: invoicesByEwaybill.get(ewb._id.toString()) || []
    });
  }

  return shipments.map((shipment) => {
    const data = shipment.toObject ? shipment.toObject() : shipment;
    data.ewaybills = ewaybillsByShipment.get(shipment._id.toString()) || [];

    const consignorSource = shipment?.consignorTab === 'guest'
      ? guestsById.get(String(shipment?.consignorId || ''))
      : clientsById.get(String(shipment?.consignorId || ''));
    const consigneeSource = shipment?.consigneeTab === 'guest'
      ? guestsById.get(String(shipment?.consigneeId || ''))
      : clientsById.get(String(shipment?.consigneeId || ''));

    if (!data.consignor) {
      data.consignor = consignorSource?.clientName || consignorSource?.guestName || '';
    }
    if (!data.consignee) {
      data.consignee = consigneeSource?.clientName || consigneeSource?.guestName || '';
    }
    if (!data.deliveryAddress) {
      if (consigneeSource?.deliveryLocations?.length) {
        const location =
          findLocationById(consigneeSource.deliveryLocations, shipment?.deliveryLocationId) ||
          consigneeSource.deliveryLocations[0];
        data.deliveryAddress = formatLocation(location);
      } else if (consigneeSource) {
        data.deliveryAddress = formatLocation(consigneeSource);
      } else {
        data.deliveryAddress = '';
      }
    }

    return data;
  });
}

async function replaceShipmentLines(shipmentId, ewaybills, options = {}) {
  const defaultInstockToAmount = Boolean(options.defaultInstockToAmount);
  const existingEwaybills = await Ewaybill.find({ shipmentId }).select('_id');
  const ewaybillIds = existingEwaybills.map((e) => e._id);
  const invoices = await Invoice.find({ ewaybillId: { $in: ewaybillIds } }).select('_id');
  const invoiceIds = invoices.map((i) => i._id);

  await InvoiceProduct.deleteMany({ invoiceId: { $in: invoiceIds } });
  await InvoicePackage.deleteMany({ invoiceId: { $in: invoiceIds } });
  await Invoice.deleteMany({ ewaybillId: { $in: ewaybillIds } });
  await Ewaybill.deleteMany({ shipmentId });

  const ewaybillDocs = await Ewaybill.insertMany(
    (ewaybills || []).map((ewb) => ({
      shipmentId,
      number: ewb.number,
      date: ewb.date,
      routes: ewb.routes
    }))
  );

  const invoiceDocs = [];
  const productDocs = [];
  const packageDocs = [];

  for (let e = 0; e < (ewaybills || []).length; e += 1) {
    const ewb = ewaybills[e];
    const ewaybillId = ewaybillDocs[e]._id;
    for (const inv of ewb.invoices || []) {
      invoiceDocs.push({
        ewaybillId,
        number: inv.number,
        value: inv.value
      });
    }
  }

  const createdInvoices = await Invoice.insertMany(invoiceDocs);

  let invoiceCursor = 0;
  for (let e = 0; e < (ewaybills || []).length; e += 1) {
    const ewb = ewaybills[e];
    for (const inv of ewb.invoices || []) {
      const invoiceId = createdInvoices[invoiceCursor]._id;
      invoiceCursor += 1;

      for (const prod of inv.products || []) {
        const amount = Number(prod.amount) || 0;
        const instock = defaultInstockToAmount
          ? amount
          : Number(prod.instock) || 0;
        productDocs.push({
          invoiceId,
          type: prod.type,
          amount,
          ratePer: Number(prod.ratePer) || 0,
          instock,
          intransitstock: Number(prod.intransitstock) || 0,
          deliveredstock: Number(prod.deliveredstock) || 0
        });
      }

      for (const pack of inv.packages || []) {
        packageDocs.push({
          invoiceId,
          type: pack.type,
          amount: pack.amount
        });
      }
    }
  }

  if (productDocs.length) await InvoiceProduct.insertMany(productDocs);
  if (packageDocs.length) await InvoicePackage.insertMany(packageDocs);
}

// Create new shipment
router.post('/add', requireAuth, async (req, res) => {
  try {
    const { ewaybills, ...shipmentData } = req.body;
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    const username = req.user.username || shipmentData.username;
    if (!username) return res.status(400).json({ message: 'Invalid username' });
    const wantsSummary = String(req.query.summary || '').toLowerCase() === 'true' || req.query.summary === '1';

    const shipment = await Shipment.create({
      ...shipmentData,
      GSTIN_ID: gstinId,
      username
    });
    await replaceShipmentLines(shipment._id, ewaybills || [], { defaultInstockToAmount: true });
    if (wantsSummary) {
      res.status(201).json({
        _id: shipment._id,
        consignmentNumber: shipment.consignmentNumber,
        branch: shipment.branch,
        shipmentStatus: shipment.shipmentStatus,
        date: shipment.date,
        username: shipment.username,
        GSTIN_ID: shipment.GSTIN_ID
      });
      return;
    }
    const view = (await buildShipmentViews([shipment]))[0];
    res.status(201).json(view);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Get next consignment number for a company/branch (reset on April 1st)
router.get('/nextConsignment', requireAuth, async (req, res) => {
  const branch = req.query.branch;

  if (!branch) {
    return res.status(400).json({ message: 'Missing branch in query parameters' });
  }
  if (branch === 'All Branches') {
    return res.status(400).json({ message: 'Please select a specific branch to fetch consignment number' });
  }

  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const today = new Date();
    const year = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
    const fiscalYearStart = new Date(year, 3, 1);
    const fiscalYearEnd = new Date(year + 1, 2, 31, 23, 59, 59);

    const result = await Shipment.aggregate([
      {
        $match: {
          GSTIN_ID: gstinId,
          branch,
          date: { $gte: fiscalYearStart, $lte: fiscalYearEnd }
        }
      },
      { $addFields: { consignmentNumberInt: { $toInt: '$consignmentNumber' } } },
      { $sort: { consignmentNumberInt: -1 } },
      { $limit: 1 }
    ]);

    const lastShipment = result[0];
    let nextNumber = 1;
    if (lastShipment && lastShipment.consignmentNumberInt) {
      nextNumber = lastShipment.consignmentNumberInt + 1;
    }

    res.json({ nextNumber, fiscalYear: `${year}-${year + 1}` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get next consignment number', details: err });
  }
});

// GET all shipments for a company/branch
router.get('/', requireAuth, async (req, res) => {
  try {
    const { branch } = req.query;
    if (!branch) {
      return res.status(400).json({ message: 'Branch is required' });
    }
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    const wantsSummary = String(req.query.summary || '').toLowerCase() === 'true' || req.query.summary === '1';

    let shipments;
    if (branch === 'All Branches') {
      shipments = await Shipment.find({ GSTIN_ID: gstinId }).sort({ createdAt: -1 });
    } else {
      shipments = await Shipment.find({ GSTIN_ID: gstinId, branch }).sort({ createdAt: -1 });
    }

    if (wantsSummary) {
      res.json(shipments);
      return;
    }
    const views = await buildShipmentViews(shipments);
    res.json(views);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Edit shipment (stocks page)
router.put('/:consignmentNumber', requireAuth, async (req, res) => {
  try {
    const { ewaybills, ...shipmentData } = req.body;
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    if (shipmentData.paymentMode) {
      shipmentData.shipmentStatus = shipmentData.paymentMode === 'To Pay' ? 'To Pay' : 'Pending';
    }
    const shipment = await Shipment.findOneAndUpdate(
      { consignmentNumber: req.params.consignmentNumber, GSTIN_ID: gstinId },
      shipmentData,
      { new: true }
    );
    if (!shipment) return res.status(404).json({ message: 'Shipment not found' });
    if (ewaybills) {
      await replaceShipmentLines(shipment._id, ewaybills, { defaultInstockToAmount: false });
    }
    const view = (await buildShipmentViews([shipment]))[0];
    res.json(view);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update consignment by payload
router.post('/updateConsignment', requireAuth, async (req, res) => {
  const { updatedConsignment } = req.body;
  if (!updatedConsignment?.consignmentNumber) {
    return res.status(400).json({ message: 'Missing consignmentNumber' });
  }
  try {
    const { ewaybills, ...shipmentData } = updatedConsignment;
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    if (shipmentData.paymentMode) {
      shipmentData.shipmentStatus = shipmentData.paymentMode === 'To Pay' ? 'To Pay' : 'Pending';
    }
    const shipment = await Shipment.findOneAndUpdate(
      { consignmentNumber: updatedConsignment.consignmentNumber, GSTIN_ID: gstinId },
      shipmentData,
      { new: true }
    );
    if (!shipment) return res.status(404).json({ message: 'Shipment not found' });
    if (ewaybills) {
      await replaceShipmentLines(shipment._id, ewaybills, { defaultInstockToAmount: false });
    }
    const view = (await buildShipmentViews([shipment]))[0];
    res.json({ message: 'Consignment updated', data: view });
  } catch (err) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get specific consignment
router.get('/getConsignment', requireAuth, async (req, res) => {
  try {
    const { consignmentNumber } = req.query;
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    const shipments = await Shipment.find({ GSTIN_ID: gstinId, consignmentNumber }).sort({ createdAt: -1 });
    const views = await buildShipmentViews(shipments);
    res.json(views);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Apply delivery updates without sending the full shipment payload
router.post('/deliver', requireAuth, async (req, res) => {
  try {
    const { consignmentNumber, items } = req.body || {};
    if (!consignmentNumber || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Missing consignmentNumber or items' });
    }
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const shipment = await Shipment.findOne({ GSTIN_ID: gstinId, consignmentNumber });
    if (!shipment) return res.status(404).json({ message: 'Shipment not found' });

    const ewaybills = await Ewaybill.find({ shipmentId: shipment._id }).select('_id');
    const ewaybillIds = ewaybills.map((e) => e._id);
    const invoices = await Invoice.find({ ewaybillId: { $in: ewaybillIds } }).select('_id');
    const invoiceIds = invoices.map((i) => i._id);

    for (const item of items) {
      const type = String(item.type || '').trim();
      let remainingQty = Number(item.qty) || 0;
      if (!type || remainingQty <= 0) continue;

      const products = await InvoiceProduct.find({
        invoiceId: { $in: invoiceIds },
        type,
        intransitstock: { $gt: 0 }
      }).sort({ intransitstock: -1 });

      for (const product of products) {
        if (remainingQty <= 0) break;
        const take = Math.min(Number(product.intransitstock) || 0, remainingQty);
        if (take <= 0) continue;
        product.intransitstock = Math.max(0, (Number(product.intransitstock) || 0) - take);
        product.deliveredstock = (Number(product.deliveredstock) || 0) + take;
        await product.save();
        remainingQty -= take;
      }
    }

    const stillOpen = await InvoiceProduct.exists({
      invoiceId: { $in: invoiceIds },
      $or: [{ instock: { $gt: 0 } }, { intransitstock: { $gt: 0 } }]
    });
    shipment.shipmentStatus = stillOpen ? 'In Transit/Pending' : 'Delivered';
    await shipment.save();

    const view = (await buildShipmentViews([shipment]))[0];
    res.json({ message: 'Delivery updated', data: view });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

export default router;
