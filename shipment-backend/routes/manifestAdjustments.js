import express from 'express';
import Manifest from '../models/Manifest/Manifest.js';
import ManifestAdjustment from '../models/Manifest/ManifestAdjustment.js';
import Shipment from '../models/NewShipment/NewShipmentShipment.js';
import Ewaybill from '../models/NewShipment/NewShipmentEwaybill.js';
import Invoice from '../models/NewShipment/NewShipmentInvoice.js';
import InvoiceProduct from '../models/NewShipment/NewShipmentInvoiceProduct.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

async function applyAdjustmentToShipment(consignmentNumber, invoiceNumber, productType, deltas, gstinId) {
  const shipmentQuery = { consignmentNumber };
  if (Number.isFinite(gstinId)) shipmentQuery.GSTIN_ID = gstinId;
  const shipment = await Shipment.findOne(shipmentQuery);
  if (!shipment) return;

  const ewaybills = await Ewaybill.find({ shipmentId: shipment._id }).select('_id');
  const ewaybillIds = ewaybills.map((e) => e._id);
  const invoices = await Invoice.find({ ewaybillId: { $in: ewaybillIds } }).select('_id number');
  const invoiceIds = invoices.map((i) => i._id);

  let invoiceMatch = null;
  const normalizedInv = String(invoiceNumber || '').trim();
  if (normalizedInv) {
    invoiceMatch = invoices.find((inv) => String(inv.number || '').trim() === normalizedInv);
  }

  const productQuery = invoiceMatch
    ? { invoiceId: invoiceMatch._id, type: productType }
    : { invoiceId: { $in: invoiceIds }, type: productType };

  const product = await InvoiceProduct.findOne(productQuery);
  if (!product) return;

  const deltaInstock = Number(deltas.deltaInstock) || 0;
  const deltaIntransit = Number(deltas.deltaIntransitstock) || 0;
  const deltaDelivered = Number(deltas.deltaDeliveredstock) || 0;

  product.instock = Math.max(0, (Number(product.instock) || 0) + deltaInstock);
  product.intransitstock = Math.max(0, (Number(product.intransitstock) || 0) + deltaIntransit);
  product.deliveredstock = Math.max(0, (Number(product.deliveredstock) || 0) + deltaDelivered);
  product.amount = Math.max(
    0,
    (Number(product.amount) || 0) + deltaInstock + deltaIntransit + deltaDelivered
  );

  await product.save();
}

router.post('/add', requireAuth, async (req, res) => {
  try {
    const { manifestId, manifestationNumber, adjustments } = req.body || {};
    if (!manifestId || !Number.isFinite(Number(manifestationNumber))) {
      return res.status(400).json({ message: 'Missing manifestId or manifestationNumber' });
    }
    if (!Array.isArray(adjustments) || adjustments.length === 0) {
      return res.status(400).json({ message: 'No adjustments provided' });
    }

    const manifest = await Manifest.findById(manifestId).select('_id manifestationNumber');
    if (!manifest) return res.status(404).json({ message: 'Manifest not found' });

    const gstinId = Number(req.user?.id);
    const username = req.user?.username || '';

    const docs = adjustments.map((adj) => ({
      manifestId,
      manifestationNumber: Number(manifestationNumber),
      consignmentNumber: String(adj.consignmentNumber || '').trim(),
      invoiceNumber: String(adj.invoiceNumber || '').trim(),
      productType: String(adj.productType || '').trim(),
      deltaManifestQty: Number(adj.deltaManifestQty) || 0,
      deltaInstock: Number(adj.deltaInstock) || 0,
      deltaIntransitstock: Number(adj.deltaIntransitstock) || 0,
      deltaDeliveredstock: Number(adj.deltaDeliveredstock) || 0,
      reason: String(adj.reason || '').trim(),
      createdBy: String(adj.createdBy || username || '').trim()
    }));

    const inserted = await ManifestAdjustment.insertMany(docs);

    for (const adj of inserted) {
      await applyAdjustmentToShipment(
        adj.consignmentNumber,
        adj.invoiceNumber,
        adj.productType,
        adj,
        gstinId
      );
    }

    res.status(201).json({ success: true, adjustments: inserted });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.get('/by-manifest/:manifestId', requireAuth, async (req, res) => {
  try {
    const { manifestId } = req.params;
    if (!manifestId) return res.status(400).json({ message: 'Missing manifestId' });
    const adjustments = await ManifestAdjustment.find({ manifestId }).sort({ createdAt: -1 });
    res.json(adjustments);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
