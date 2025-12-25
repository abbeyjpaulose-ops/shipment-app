import express from 'express';
import Manifest from '../models/Manifest/Manifest.js';
import ManifestConsignment from '../models/Manifest/ManifestConsignment.js';
import ManifestInvoice from '../models/Manifest/ManifestInvoice.js';
import ManifestProduct from '../models/Manifest/ManifestProduct.js';
import Shipment from '../models/NewShipment/NewShipmentShipment.js';
import Ewaybill from '../models/NewShipment/NewShipmentEwaybill.js';
import Invoice from '../models/NewShipment/NewShipmentInvoice.js';
import InvoiceProduct from '../models/NewShipment/NewShipmentInvoiceProduct.js';
import { requireAuth } from '../middleware/auth.js';
import User from '../models/User.js';
import Profile from '../models/Profile.js';

const router = express.Router();

async function resolveEmailFromToken(req) {
  const tokenEmail = req.user?.email;
  if (tokenEmail) return tokenEmail;
  const accountType = req.user?.accountType;
  const userId = req.user?.userId;
  const gstinId = req.user?.id;

  if (accountType === 'profile' && userId) {
    const profile = await Profile.findById(userId).select('email').lean();
    if (profile?.email) return profile.email;
  }

  if (gstinId) {
    const company = await User.findById(gstinId).select('email').lean();
    if (company?.email) return company.email;
  }

  if (userId) {
    const user = await User.findById(userId).select('email').lean();
    if (user?.email) return user.email;
  }

  return null;
}

async function buildManifestViews(manifests) {
  if (!manifests.length) return [];

  const manifestIds = manifests.map((m) => m._id);
  const consignments = await ManifestConsignment.find({ manifestId: { $in: manifestIds } }).lean();
  const consignmentIds = consignments.map((c) => c._id);
  const invoices = await ManifestInvoice.find({ consignmentId: { $in: consignmentIds } }).lean();
  const invoiceIds = invoices.map((i) => i._id);
  const products = await ManifestProduct.find({ invoiceId: { $in: invoiceIds } }).lean();

  const productsByInvoice = new Map();
  for (const prod of products) {
    const key = prod.invoiceId.toString();
    if (!productsByInvoice.has(key)) productsByInvoice.set(key, []);
    productsByInvoice.get(key).push({
      type: prod.type,
      amount: prod.amount,
      instock: prod.instock,
      intransitstock: prod.intransitstock,
      deliveredstock: prod.deliveredstock,
      manifestQty: prod.manifestQty
    });
  }

  const invoicesByConsignment = new Map();
  for (const inv of invoices) {
    const key = inv.consignmentId.toString();
    if (!invoicesByConsignment.has(key)) invoicesByConsignment.set(key, []);
    invoicesByConsignment.get(key).push({
      number: inv.number,
      value: inv.value,
      products: productsByInvoice.get(inv._id.toString()) || []
    });
  }

  const consignmentsByManifest = new Map();
  for (const cons of consignments) {
    const key = cons.manifestId.toString();
    if (!consignmentsByManifest.has(key)) consignmentsByManifest.set(key, []);
    consignmentsByManifest.get(key).push({
      consignmentNumber: cons.consignmentNumber,
      consignor: cons.consignor,
      routes: cons.routes,
      mshipmentStatus: cons.mshipmentStatus,
      invoices: invoicesByConsignment.get(cons._id.toString()) || []
    });
  }

  return manifests.map((manifest) => {
    const data = manifest.toObject ? manifest.toObject() : manifest;
    data.consignments = consignmentsByManifest.get(manifest._id.toString()) || [];
    return data;
  });
}

async function replaceManifestLines(manifestId, consignments) {
  const existingConsignments = await ManifestConsignment.find({ manifestId }).select('_id');
  const consignmentIds = existingConsignments.map((c) => c._id);
  const invoices = await ManifestInvoice.find({ consignmentId: { $in: consignmentIds } }).select('_id');
  const invoiceIds = invoices.map((i) => i._id);

  await ManifestProduct.deleteMany({ invoiceId: { $in: invoiceIds } });
  await ManifestInvoice.deleteMany({ consignmentId: { $in: consignmentIds } });
  await ManifestConsignment.deleteMany({ manifestId });

  const consignmentDocs = await ManifestConsignment.insertMany(
    (consignments || []).map((cons) => ({
      manifestId,
      consignmentNumber: cons.consignmentNumber,
      consignor: cons.consignor,
      routes: cons.routes,
      mshipmentStatus: cons.mshipmentStatus
    }))
  );

  const invoiceDocs = [];
  for (let c = 0; c < (consignments || []).length; c += 1) {
    const cons = consignments[c];
    const consignmentId = consignmentDocs[c]._id;
    const consignmentNumber = String(cons.consignmentNumber || 'NA').trim();
    const invoices = cons.invoices || [];
    for (let invIndex = 0; invIndex < invoices.length; invIndex += 1) {
      const inv = invoices[invIndex];
      const rawNumber = String(inv.number || inv.invoicenum || '').trim();
      let number = rawNumber || `MAN-${consignmentNumber}-${invIndex + 1}`;
      if (!String(number).trim()) {
        number = `MAN-${Date.now()}-${c + 1}-${invIndex + 1}`;
      }
      invoiceDocs.push({
        consignmentId,
        number,
        value: Number(inv.value) || 0
      });
    }
  }

  const createdInvoices = invoiceDocs.length ? await ManifestInvoice.insertMany(invoiceDocs) : [];

  const productDocs = [];
  let invoiceCursor = 0;
  for (let c = 0; c < (consignments || []).length; c += 1) {
    const cons = consignments[c];
    const invoices = cons.invoices || [];
    for (let invIndex = 0; invIndex < invoices.length; invIndex += 1) {
      const inv = invoices[invIndex];
      const invoiceId = createdInvoices[invoiceCursor]?._id;
      invoiceCursor += 1;
      if (!invoiceId) continue;

      for (const prod of inv.products || []) {
        productDocs.push({
          invoiceId,
          type: prod.type,
          amount: Number(prod.amount) || 0,
          instock: Number(prod.instock) || 0,
          intransitstock: Number(prod.intransitstock) || 0,
          deliveredstock: Number(prod.deliveredstock) || 0,
          manifestQty: Number(prod.manifestQty) || 0
        });
      }
    }
  }

  if (productDocs.length) await ManifestProduct.insertMany(productDocs);
}

// Add new manifestation
router.post('/add', requireAuth, async (req, res) => {
  try {
    const { email, username, branch, consignments, manifestationNumber, date } = req.body;
    const resolvedEmail = email || await resolveEmailFromToken(req);
    const resolvedUsername = username || req.user?.username;
    if (!resolvedEmail || !resolvedUsername || !branch || !consignments || consignments.length === 0) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    let nextManifestNo = Number(manifestationNumber);
    if (!Number.isFinite(nextManifestNo)) {
      const lastManifest = await Manifest.findOne({ email: resolvedEmail, username: resolvedUsername })
        .sort({ manifestationNumber: -1 });
      nextManifestNo = lastManifest ? lastManifest.manifestationNumber + 1 : 1;
    }
    const gstinId = Number(req.user?.id);

    const newManifest = new Manifest({
      GSTIN_ID: Number.isFinite(gstinId) ? gstinId : undefined,
      email: resolvedEmail,
      username: resolvedUsername,
      branch,
      manifestationNumber: nextManifestNo,
      date: date || new Date()
    });

    await newManifest.save();
    await replaceManifestLines(newManifest._id, consignments || []);

    // Update corresponding shipment stock
    for (const consignment of consignments) {
      const shipmentQuery = { consignmentNumber: consignment.consignmentNumber };
      if (Number.isFinite(gstinId)) shipmentQuery.GSTIN_ID = gstinId;
      const shipment = await Shipment.findOne(shipmentQuery);
      if (!shipment) continue;
      let hasManifestQty = false;

      const ewaybills = await Ewaybill.find({ shipmentId: shipment._id }).select('_id');
      const ewaybillIds = ewaybills.map((e) => e._id);
      const invoices = await Invoice.find({ ewaybillId: { $in: ewaybillIds } }).select('_id number');
      const invoiceIds = invoices.map((i) => i._id);

      for (const inv of consignment.invoices || []) {
        const manifestInvNumber = String(inv.number || inv.invoicenum || '').trim();
        const shipmentInvoice = invoices.find(
          (i) => String(i.number || '').trim() === manifestInvNumber
        );

        for (const prod of inv.products || []) {
          const productType = String(prod.type || '').trim();
          if (!productType) continue;
          let shipmentProduct = null;
          if (shipmentInvoice) {
            shipmentProduct = await InvoiceProduct.findOne({
              invoiceId: shipmentInvoice._id,
              type: productType
            });
          }
          if (!shipmentProduct) {
            shipmentProduct = await InvoiceProduct.findOne({
              invoiceId: { $in: invoiceIds },
              type: productType
            });
          }
          if (!shipmentProduct) continue;

          let remainingQty = Number(prod.manifestQty) || 0;
          if (remainingQty <= 0) continue;
          hasManifestQty = true;

          const applyQty = Math.min(remainingQty, shipmentProduct.instock || 0);
          if (applyQty > 0) {
            shipmentProduct.instock = Math.max(0, shipmentProduct.instock - applyQty);
            shipmentProduct.intransitstock = (shipmentProduct.intransitstock || 0) + applyQty;
            await shipmentProduct.save();
            remainingQty -= applyQty;
          }

          if (remainingQty > 0) {
            const fallbackProducts = await InvoiceProduct.find({
              invoiceId: { $in: invoiceIds },
              type: productType,
              instock: { $gt: 0 }
            }).sort({ instock: -1 });

            for (const candidate of fallbackProducts) {
              if (remainingQty <= 0) break;
              const candidateTake = Math.min(candidate.instock || 0, remainingQty);
              if (candidateTake <= 0) continue;
              candidate.instock = Math.max(0, candidate.instock - candidateTake);
              candidate.intransitstock = (candidate.intransitstock || 0) + candidateTake;
              await candidate.save();
              remainingQty -= candidateTake;
            }
          }

        }
      }

      const stillHasStock = await InvoiceProduct.exists({
        invoiceId: { $in: invoiceIds },
        instock: { $gt: 0 }
      });
      if (hasManifestQty) {
        shipment.shipmentStatus = stillHasStock ? 'In Transit/Pending' : 'In Transit';
        await shipment.save();
      }
    }

    res.status(201).json({
      success: true,
      message: 'Manifestation saved and shipment stock updated.',
      manifestationNumber: nextManifestNo
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Get all manifests for a specific user (sorted by latest)
router.get('/', requireAuth, async (req, res) => {
  try {
    const { email, branch } = req.query;
    const resolvedEmail = email || await resolveEmailFromToken(req);
    if (!resolvedEmail || !branch) {
      return res.status(400).json({ message: 'Email and branch are required' });
    }
    const gstinId = Number(req.user?.id);

    let manifests;
    if (branch === 'All Branches') {
      manifests = Number.isFinite(gstinId)
        ? await Manifest.find({ GSTIN_ID: gstinId }).sort({ createdAt: -1 })
        : await Manifest.find({ email: resolvedEmail }).sort({ createdAt: -1 });
    } else {
      manifests = Number.isFinite(gstinId)
        ? await Manifest.find({ GSTIN_ID: gstinId, branch }).sort({ createdAt: -1 })
        : await Manifest.find({ email: resolvedEmail, branch }).sort({ createdAt: -1 });
    }

    const views = await buildManifestViews(manifests);
    res.json(views);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update a manifest by ID
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { consignments, _id, ...manifestData } = req.body || {};
    const manifest = await Manifest.findByIdAndUpdate(req.params.id, manifestData, { new: true });
    if (!manifest) return res.status(404).json({ success: false, message: 'Manifest not found' });
    if (consignments) await replaceManifestLines(manifest._id, consignments);
    const view = (await buildManifestViews([manifest]))[0];
    res.json({ success: true, manifest: view });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Get manifests by username and email
router.get('/by-user/:username', requireAuth, async (req, res) => {
  try {
    const { email } = req.query;
    const resolvedEmail = email || await resolveEmailFromToken(req);
    if (!resolvedEmail) return res.status(400).json({ message: 'Email is required' });
    const manifests = await Manifest.find({ email: resolvedEmail, username: req.params.username })
      .sort({ date: -1 });
    const views = await buildManifestViews(manifests);
    res.json(views);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Get manifest list for dropdown or summary view
router.get('/manifestlist', requireAuth, async (req, res) => {
  try {
    const email = req.query.emailId || await resolveEmailFromToken(req);
    const query = email ? { email } : {};
    const manifests = await Manifest.find(query).sort({ manifestationNumber: -1 });
    const views = await buildManifestViews(manifests);
    const list = views.map((m) => ({
      manifestationNumber: m.manifestationNumber,
      date: m.date,
      consignments: m.consignments || []
    }));
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get next manifestation number
router.get('/next-number', requireAuth, async (req, res) => {
  try {
    const email = req.query.email || await resolveEmailFromToken(req);
    const username = req.query.username || req.user?.username;
    if (!email || !username) {
      return res.status(400).json({ message: 'Email and username are required' });
    }
    const lastManifest = await Manifest.findOne({ email, username }).sort({ manifestationNumber: -1 });
    const nextManifestationNumber = lastManifest ? lastManifest.manifestationNumber + 1 : 1;
    res.json({ nextManifestationNumber: String(nextManifestationNumber) });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update by manifestation number
router.post('/manifestationNumber', requireAuth, async (req, res) => {
  try {
    const { consignments, manifestationNumber, _id, ...manifestData } = req.body || {};
    const numberValue = Number(manifestationNumber);
    if (!Number.isFinite(numberValue)) {
      return res.status(400).json({ message: 'Invalid manifestationNumber' });
    }
    const filter = { manifestationNumber: numberValue };
    if (req.user?.email) filter.email = req.user.email;
    const gstinId = Number(req.user?.id);
    if (Number.isFinite(gstinId)) filter.GSTIN_ID = gstinId;

    const manifest = await Manifest.findOneAndUpdate(filter, manifestData, { new: true });
    if (!manifest) return res.status(404).json({ message: 'Manifest not found' });
    if (consignments) await replaceManifestLines(manifest._id, consignments);
    const view = (await buildManifestViews([manifest]))[0];
    res.json(view);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

export default router;
