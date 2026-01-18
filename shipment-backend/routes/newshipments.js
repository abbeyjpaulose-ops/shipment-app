// shipment-backend/routes/newshipments.js
import express from 'express';
import mongoose from 'mongoose';
import Shipment from '../models/NewShipment/NewShipmentShipment.js';
import Ewaybill from '../models/NewShipment/NewShipmentEwaybill.js';
import Invoice from '../models/NewShipment/NewShipmentInvoice.js';
import InvoiceProduct from '../models/NewShipment/NewShipmentInvoiceProduct.js';
import InvoicePackage from '../models/NewShipment/NewShipmentInvoicePackage.js';
import GeneratedInvoice from '../models/NewShipment/NewShipmentGeneratedInvoice.js';
import Client from '../models/Client.js';
import Guest from '../models/Guest.js';
import User from '../models/User.js';
import Payment from '../models/Payment/Payment.js';
import PaymentEntitySummary from '../models/Payment/PaymentEntitySummary.js';
import PaymentTransaction from '../models/Payment/PaymentTransaction.js';
import Branch from '../models/Branch.js';
import { requireAuth } from '../middleware/auth.js';
import { syncPaymentsFromGeneratedInvoices } from '../services/paymentSync.js';

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

function getFiscalYearWindow(date = new Date()) {
  const year = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  const start = new Date(year, 3, 1);
  const end = new Date(year + 1, 2, 31, 23, 59, 59);
  return { year, start, end, label: `${year}-${year + 1}` };
}

function buildBillingKey(shipment) {
  const clientId = shipment?.billingClientId ? String(shipment.billingClientId) : '';
  const locationId = shipment?.billingLocationId ? String(shipment.billingLocationId) : '';
  return `${clientId}::${locationId}`;
}

function normalizeInvoiceStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'paid') return 'Paid';
  if (normalized === 'active' || normalized === 'invoiced') return 'Active';
  return '';
}

async function buildBranchNameMap(branchIds = []) {
  const ids = Array.from(new Set((branchIds || []).map((id) => String(id || '')).filter(Boolean)));
  if (!ids.length) return new Map();
  const branches = await Branch.find({ _id: { $in: ids } })
    .select('_id branchName')
    .lean();
  return new Map((branches || []).map((b) => [String(b._id), b.branchName || '']));
}

async function buildShipmentViews(shipments) {
  const clientIds = new Set();
  const guestIds = new Set();
  const branchIds = new Set();
  for (const shipment of shipments || []) {
    if (shipment?.branchId) {
      branchIds.add(String(shipment.branchId));
    }
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

  const [clients, guests, branchNameById] = await Promise.all([
    clientIds.size ? Client.find({ _id: { $in: Array.from(clientIds) } }).lean() : [],
    guestIds.size ? Guest.find({ _id: { $in: Array.from(guestIds) } }).lean() : [],
    buildBranchNameMap(Array.from(branchIds))
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

    data.branchName = branchNameById.get(String(data.branchId || '')) || '';
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

    const currentBranchId =
      shipmentData.currentBranchId ||
      shipmentData.originBranchId ||
      shipmentData.branchId ||
      null;
    const shipment = await Shipment.create({
      ...shipmentData,
      currentBranchId,
      GSTIN_ID: gstinId,
      username
    });
    await replaceShipmentLines(shipment._id, ewaybills || [], { defaultInstockToAmount: true });
    if (wantsSummary) {
      const branchNameById = await buildBranchNameMap([shipment.branchId]);
      res.status(201).json({
        _id: shipment._id,
        consignmentNumber: shipment.consignmentNumber,
        branchId: shipment.branchId,
        branchName: branchNameById.get(String(shipment.branchId || '')) || '',
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
  const branchId = req.query.branchId;

  if (!branchId) {
    return res.status(400).json({ message: 'Missing branchId in query parameters' });
  }
  if (branchId === 'all') {
    return res.status(400).json({ message: 'Please select a specific branch to fetch consignment number' });
  }

  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const today = new Date();
    const year = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
    const fiscalYearStart = new Date(year, 3, 1);
    const fiscalYearEnd = new Date(year + 1, 2, 31, 23, 59, 59);

    const matchQuery = branchId && branchId !== 'all'
      ? (mongoose.Types.ObjectId.isValid(branchId)
          ? { GSTIN_ID: gstinId, branchId: new mongoose.Types.ObjectId(branchId) }
          : null)
      : null;
    if (!matchQuery) {
      return res.status(400).json({ message: 'Invalid branchId' });
    }

    const result = await Shipment.aggregate([
      {
        $match: {
          ...matchQuery,
          date: { $gte: fiscalYearStart, $lte: fiscalYearEnd },
          consignmentNumber: { $regex: '^[0-9]+$' }
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

// Generate invoices by billing address + client
router.post('/generateInvoices', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const consignmentNumbers = (req.body?.consignmentNumbers || [])
      .map((c) => String(c || '').trim())
      .filter(Boolean);

    if (!consignmentNumbers.length) {
      return res.status(400).json({ message: 'Missing consignmentNumbers' });
    }

    const shipments = await Shipment.find({
      GSTIN_ID: gstinId,
      consignmentNumber: { $in: consignmentNumbers }
    }).lean();

    if (!shipments.length) {
      return res.status(404).json({ message: 'No consignments found' });
    }

    const missingBilling = shipments
      .filter((s) => !s.billingClientId || !s.billingLocationId)
      .map((s) => s.consignmentNumber);
    if (missingBilling.length) {
      return res.status(400).json({
        message: 'Missing billing client/location for consignments',
        consignments: missingBilling
      });
    }

    const branchNameById = await buildBranchNameMap(shipments.map((s) => s.branchId));
    const groups = new Map();
    for (const shipment of shipments) {
      const key = buildBillingKey(shipment);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(shipment);
    }

    const billingClientIds = Array.from(groups.values())
      .map((group) => group[0]?.billingClientId)
      .filter(Boolean)
      .map((id) => String(id));
    const clients = billingClientIds.length
      ? await Client.find({ _id: { $in: billingClientIds } }).lean()
      : [];
    const clientsById = new Map((clients || []).map((c) => [String(c._id), c]));

    const { label: fiscalYear, start: fiscalYearStart } = getFiscalYearWindow();
    const lastInvoice = await GeneratedInvoice.findOne({
      GSTIN_ID: gstinId,
      fiscalYear
    })
      .sort({ invoiceNumber: -1 })
      .select('invoiceNumber')
      .lean();
    let nextNumber = Number(lastInvoice?.invoiceNumber) || 0;

    const invoiceDocs = [];
    const updates = [];

    for (const group of groups.values()) {
      nextNumber += 1;
      const first = group[0] || {};
      const billingClientId = first.billingClientId || null;
      const billingLocationId = first.billingLocationId || null;
      const client = billingClientId ? clientsById.get(String(billingClientId)) : null;
      const location = client?.deliveryLocations?.length
        ? (findLocationById(client.deliveryLocations, billingLocationId) || client.deliveryLocations[0])
        : null;
      const billingAddress = location ? formatLocation(location) : (client?.address || '');

      const consignments = group.map((s) => ({
        consignmentNumber: String(s.consignmentNumber || ''),
        shipmentId: s._id
      }));

      invoiceDocs.push({
        GSTIN_ID: gstinId,
        fiscalYear,
        fiscalYearStart,
        invoiceNumber: nextNumber,
        billingClientId,
        billingLocationId,
        clientGSTIN: client?.GSTIN || '',
        billingAddress,
        consignments,
        createdBy: req.user.username || ''
      });

      group.forEach((shipment) => {
        const branchName = branchNameById.get(String(shipment.branchId || '')) || '';
        updates.push({
          updateOne: {
            filter: {
              GSTIN_ID: gstinId,
              consignmentNumber: shipment.consignmentNumber
            },
            update: {
              $set: {
                shipmentStatus: 'Invoiced',
                shipmentStatusDetails: branchName ? `/${branchName}` : ''
              }
            }
          }
        });
      });
    }

    const created = invoiceDocs.length ? await GeneratedInvoice.insertMany(invoiceDocs) : [];
    if (updates.length) {
      await Shipment.bulkWrite(updates);
    }

    const clientIds = Array.from(
      new Set(invoiceDocs.map((inv) => String(inv.billingClientId || '')).filter(Boolean))
    );
    if (clientIds.length) {
      await syncPaymentsFromGeneratedInvoices(gstinId, clientIds);
    }

    res.json({
      message: 'Invoices generated',
      invoices: created
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// List generated invoices (defaults to current fiscal year)
router.get('/generatedInvoices', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const fy = String(req.query.fiscalYear || '').trim();
    const fiscalWindow = getFiscalYearWindow();
    const fiscalYear = fy || fiscalWindow.label;

    const [invoices, company] = await Promise.all([
      GeneratedInvoice.find({
        GSTIN_ID: gstinId,
        fiscalYear
      }).sort({ invoiceNumber: -1 }).lean(),
      User.findById(gstinId).lean()
    ]);

    const gstPercent = Number(company?.companyType) || 0;
    const billingClientIds = invoices
      .map((inv) => String(inv?.billingClientId || ''))
      .filter(Boolean);
    const billingClients = billingClientIds.length
      ? await Client.find({ _id: { $in: billingClientIds } }).select('_id clientName').lean()
      : [];
    const billingClientById = new Map(
      (billingClients || []).map((c) => [String(c._id), c.clientName || ''])
    );

    const consignmentNumbers = invoices.flatMap((inv) =>
      (inv.consignments || []).map((c) => c.consignmentNumber)
    );
    const shipments = consignmentNumbers.length
      ? await Shipment.find({
          GSTIN_ID: gstinId,
          consignmentNumber: { $in: consignmentNumbers }
        }).lean()
      : [];
    const shipmentsByNumber = new Map(
      (shipments || []).map((s) => [String(s.consignmentNumber), s])
    );

    const response = invoices.map((inv) => ({
      ...inv,
      clientName: billingClientById.get(String(inv.billingClientId || '')) || '',
      consignments: (inv.consignments || []).map((c) => {
        const shipment = shipmentsByNumber.get(String(c.consignmentNumber)) || {};
        return {
          ...c,
          consignor: shipment.consignor || '',
          deliveryAddress: shipment.deliveryAddress || '',
          finalAmount: shipment.finalAmount || 0,
          charges: shipment.charges || {},
          date: shipment.date || null
        };
      })
    }));

    res.json({ fiscalYear, gstPercent, invoices: response });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// List available fiscal years for generated invoices
router.get('/generatedInvoices/years', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const years = await GeneratedInvoice.distinct('fiscalYear', { GSTIN_ID: gstinId });
    const sorted = (years || []).slice().sort((a, b) => String(b).localeCompare(String(a)));
    res.json({ years: sorted });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Cancel generated invoice and revert consignments
router.put('/generatedInvoices/:id/cancel', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const invoice = await GeneratedInvoice.findOne({ _id: req.params.id, GSTIN_ID: gstinId });
    if (!invoice) return res.status(404).json({ message: 'Generated invoice not found' });

    if (String(invoice.status || '').toLowerCase() !== 'cancelled') {
      invoice.status = 'cancelled';
      await invoice.save();
    }

    const consignmentNumbers = (invoice.consignments || [])
      .map((c) => String(c?.consignmentNumber || '').trim())
      .filter(Boolean);

    if (consignmentNumbers.length) {
      const shipments = await Shipment.find({
        GSTIN_ID: gstinId,
        consignmentNumber: { $in: consignmentNumbers }
      }).select('consignmentNumber branchId').lean();

      if (shipments.length) {
        const branchNameById = await buildBranchNameMap(shipments.map((s) => s.branchId));
        await Shipment.bulkWrite(
          shipments.map((shipment) => {
            const branchName = branchNameById.get(String(shipment.branchId || '')) || '';
            return {
              updateOne: {
                filter: {
                  GSTIN_ID: gstinId,
                  consignmentNumber: shipment.consignmentNumber
                },
                update: {
                  $set: {
                    shipmentStatus: 'Pre-Invoiced',
                    shipmentStatusDetails: branchName ? `/${branchName}` : ''
                  }
                }
              }
            };
          })
        );
      }
    }

    const clientIds = invoice.billingClientId ? [String(invoice.billingClientId)] : [];
    if (clientIds.length) {
      await syncPaymentsFromGeneratedInvoices(gstinId, clientIds);
    }

    res.json({ message: 'Generated invoice cancelled', invoice });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update generated invoice payment status (Paid/Active)
router.put('/generatedInvoices/:id/payment-status', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const desired = normalizeInvoiceStatus(req.body?.status);
    if (!desired) return res.status(400).json({ message: 'Invalid status' });

    const invoice = await GeneratedInvoice.findOne({ _id: req.params.id, GSTIN_ID: gstinId });
    if (!invoice) return res.status(404).json({ message: 'Generated invoice not found' });

    if (String(invoice.status || '').toLowerCase() === 'cancelled') {
      return res.status(400).json({ message: 'Cancelled invoices cannot be updated' });
    }

    const current = normalizeInvoiceStatus(invoice.status) || 'Active';
    if (current === desired) {
      return res.json({ invoice });
    }

    const consignmentNumbers = (invoice.consignments || [])
      .map((c) => String(c?.consignmentNumber || '').trim())
      .filter(Boolean);

    const shipments = consignmentNumbers.length
      ? await Shipment.find({
          GSTIN_ID: gstinId,
          consignmentNumber: { $in: consignmentNumbers }
        }).select('consignmentNumber finalAmount').lean()
      : [];
    const invoiceTotal = shipments.reduce((sum, s) => sum + Number(s.finalAmount || 0), 0);

    const delta = desired === 'Paid' ? invoiceTotal : -invoiceTotal;

    // Update shipment statuses
    const shipmentStatus = desired === 'Paid' ? 'Paid' : 'Invoiced';
    if (consignmentNumbers.length) {
      await Shipment.updateMany(
        { GSTIN_ID: gstinId, consignmentNumber: { $in: consignmentNumbers } },
        { $set: { shipmentStatus } }
      );
    }

    // Update payment summaries for client
    const billingClientId = invoice.billingClientId ? String(invoice.billingClientId) : '';
    if (billingClientId) {
      let [summary, payment] = await Promise.all([
        PaymentEntitySummary.findOne({ GSTIN_ID: gstinId, entityType: 'client', entityId: billingClientId }),
        Payment.findOne({ GSTIN_ID: gstinId, entityType: 'client', entityId: billingClientId })
      ]);

      if (!summary) {
        const totalPaid = desired === 'Paid' ? invoiceTotal : 0;
        const totalBalance = Math.max(invoiceTotal - totalPaid, 0);
        summary = await PaymentEntitySummary.create({
          GSTIN_ID: gstinId,
          entityType: 'client',
          entityId: billingClientId,
          totalDue: invoiceTotal,
          totalPaid,
          totalBalance,
          status: desired === 'Paid' ? 'Paid' : 'Active'
        });
      }

      if (summary) {
        const totalPaid = Math.max(Number(summary.totalPaid || 0) + delta, 0);
        const totalDue = Number(summary.totalDue || 0);
        const totalBalance = Math.max(totalDue - totalPaid, 0);
        summary.totalPaid = totalPaid;
        summary.totalBalance = totalBalance;
        summary.status = desired === 'Paid' ? 'Paid' : 'Active';
        summary.lastPaymentDate = desired === 'Paid' ? new Date() : summary.lastPaymentDate;
        await summary.save();
      }

      if (!payment) {
        const amountPaid = desired === 'Paid' ? invoiceTotal : 0;
        const balance = Math.max(invoiceTotal - amountPaid, 0);
        payment = await Payment.create({
          GSTIN_ID: gstinId,
          entityType: 'client',
          entityId: billingClientId,
          amountDue: invoiceTotal,
          amountPaid,
          balance,
          status: desired === 'Paid' ? 'Paid' : 'Active',
          paymentDate: desired === 'Paid' ? new Date() : null
        });
      }

      if (payment) {
        const amountPaid = Math.max(Number(payment.amountPaid || 0) + delta, 0);
        const amountDue = Number(payment.amountDue || 0);
        const balance = Math.max(amountDue - amountPaid, 0);
        payment.amountPaid = amountPaid;
        payment.balance = balance;
        payment.status = desired === 'Paid' ? 'Paid' : 'Active';
        payment.paymentDate = desired === 'Paid' ? new Date() : payment.paymentDate;
        await payment.save();

        if (desired === 'Paid') {
          const referenceNo = invoice.invoiceNumber ? `INV-${invoice.invoiceNumber}` : undefined;
          await PaymentTransaction.create({
            paymentId: payment._id,
            invoiceId: invoice._id,
            amount: invoiceTotal,
            transactionDate: new Date(),
            method: 'Invoice',
            referenceNo,
            notes: `Marked paid via invoice ${invoice.invoiceNumber || ''}`,
            status: 'posted'
          });
        } else {
          const referenceNo = invoice.invoiceNumber ? `INV-${invoice.invoiceNumber}` : undefined;
          const tx = await PaymentTransaction.findOne({
            paymentId: payment._id,
            method: 'Invoice',
            status: { $ne: 'voided' },
            ...(invoice._id ? { invoiceId: invoice._id } : {}),
            ...(referenceNo ? { referenceNo } : {})
          })
            .sort({ createdAt: -1 })
            .lean();
          if (tx?._id) {
            await PaymentTransaction.updateOne(
              { _id: tx._id },
              { $set: { status: 'voided', voidedAt: new Date(), voidReason: 'Payment cancelled' } }
            );
          }
        }
      }
    }

    invoice.status = desired;
    await invoice.save();

    const clientIds = invoice.billingClientId ? [String(invoice.billingClientId)] : [];
    if (clientIds.length) {
      await syncPaymentsFromGeneratedInvoices(gstinId, clientIds, { preserveStatus: true });
    }

    res.json({ invoice });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// GET all shipments for a company/branch
router.get('/', requireAuth, async (req, res) => {
  try {
    const { branchId } = req.query;
    if (!branchId) {
      return res.status(400).json({ message: 'branchId is required' });
    }
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    const wantsSummary = String(req.query.summary || '').toLowerCase() === 'true' || req.query.summary === '1';

    let shipments;
    if (branchId && branchId !== 'all') {
      shipments = await Shipment.find({ GSTIN_ID: gstinId, branchId }).sort({ createdAt: -1 });
    } else if (branchId === 'all') {
      shipments = await Shipment.find({ GSTIN_ID: gstinId }).sort({ createdAt: -1 });
    }

    if (wantsSummary) {
      const branchNameById = await buildBranchNameMap(shipments.map((s) => s.branchId));
      const summary = shipments.map((shipment) => {
        const data = shipment.toObject ? shipment.toObject() : shipment;
        return {
          ...data,
          branchName: branchNameById.get(String(data?.branchId || '')) || ''
        };
      });
      res.json(summary);
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
    const shipmentId = String(req.query.shipmentId || '').trim();
    if (shipmentData.paymentMode && !shipmentData.shipmentStatus) {
      shipmentData.shipmentStatus = shipmentData.paymentMode === 'To Pay' ? 'To Pay' : 'Pending';
    }
    const filter = shipmentId
      ? { _id: shipmentId, GSTIN_ID: gstinId }
      : { consignmentNumber: req.params.consignmentNumber, GSTIN_ID: gstinId };
    const shipment = await Shipment.findOneAndUpdate(
      filter,
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
    if (shipmentData.paymentMode && !shipmentData.shipmentStatus) {
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
    shipment.shipmentStatus = stillOpen ? 'Manifested/Pending' : 'Delivered';
    await shipment.save();

    const view = (await buildShipmentViews([shipment]))[0];
    res.json({ message: 'Delivery updated', data: view });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

export default router;
