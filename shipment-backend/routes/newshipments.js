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
import Hub from '../models/Hub.js';
import Payment from '../models/Payment/Payment.js';
import PaymentEntitySummary from '../models/Payment/PaymentEntitySummary.js';
import PaymentTransaction from '../models/Payment/PaymentTransaction.js';
import Branch from '../models/Branch.js';
import { requireAuth } from '../middleware/auth.js';
import { syncPaymentsFromGeneratedInvoices } from '../services/paymentSync.js';

const router = express.Router();

function normalizeBranchIds(ids) {
  if (!Array.isArray(ids)) return [];
  return ids.map((id) => String(id || '')).filter(Boolean);
}

function getAllowedBranchIds(req) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'admin') return null;
  return normalizeBranchIds(req.user?.branchIds);
}

function normalizeAmount(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function calculateFinalAmount(ewaybills, charges, applyConsignorDiscount) {
  const safeEwaybills = Array.isArray(ewaybills) ? ewaybills : [];
  const safeCharges = charges && typeof charges === 'object' ? charges : {};
  let invoiceTotal = 0;
  let packageTotal = 0;

  for (const ewb of safeEwaybills) {
    const invoices = Array.isArray(ewb?.invoices) ? ewb.invoices : [];
    invoiceTotal += invoices.reduce((sum, inv) => {
      const products = Array.isArray(inv?.products) ? inv.products : [];
      const productTotal = products.reduce((pSum, p) => {
        const qty = normalizeAmount(p?.amount);
        const rate = normalizeAmount(p?.ratePer);
        return pSum + (qty * rate);
      }, 0);
      const invoiceValue = normalizeAmount(inv?.value);
      return sum + (productTotal > 0 ? productTotal : invoiceValue);
    }, 0);

    packageTotal += invoices.reduce((sum, inv) => {
      const packages = Array.isArray(inv?.packages) ? inv.packages : [];
      const packageSum = packages.reduce((pSum, p) => pSum + normalizeAmount(p?.amount), 0);
      return sum + packageSum;
    }, 0);
  }

  const chargeTotal = Object.entries(safeCharges)
    .filter(([key]) => key !== 'consignorDiscount')
    .reduce((sum, [, value]) => sum + normalizeAmount(value), 0);

  const subtotal = invoiceTotal + packageTotal + chargeTotal;
  const discountPercent = normalizeAmount(safeCharges?.consignorDiscount);
  const discountAmount = applyConsignorDiscount ? (subtotal * discountPercent) / 100 : 0;
  const finalAmount = subtotal - discountAmount;

  return {
    invoiceTotal,
    packageTotal,
    chargeTotal,
    subtotal,
    discountAmount,
    finalAmount
  };
}

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

function stripVehicleFromRoutes(routes, vehicleNo, clearAll) {
  if (!routes) return routes;
  const vehicleLower = String(vehicleNo || '').trim().toLowerCase();
  if (clearAll) {
    return routes;
  }
  const parts = String(routes).split('$$');
  const cleaned = parts.map((segment) => {
    if (!segment || !segment.includes('|')) return segment;
    const updated = segment.split(' -> ').map((part) => {
      const pipeIndex = part.lastIndexOf('|');
      if (pipeIndex === -1) return part;
      const left = part.slice(0, pipeIndex).trim();
      const token = part.slice(pipeIndex + 1).trim();
      if (vehicleLower && token.toLowerCase() === vehicleLower) {
        return left;
      }
      return part;
    }).join(' -> ');
    return updated;
  });
  return cleaned.join('$$');
}

function extractVehicleNumbersFromRoutes(routes) {
  const vehicles = new Set();
  const raw = String(routes || '');
  if (!raw.trim()) return [];
  const segments = raw.split('$$').map((part) => part.trim()).filter(Boolean);
  segments.forEach((segment) => {
    const parts = segment.split(' -> ').map((p) => p.trim()).filter(Boolean);
    parts.forEach((part) => {
      if (!part.includes(')')) return;
      const tokens = part.split('|').map((t) => t.trim()).filter(Boolean);
      if (tokens.length < 2) return;
      let vehicle = tokens[tokens.length - 1];
      if (vehicle.toLowerCase() === 'out for delivery' && tokens.length >= 2) {
        vehicle = tokens[tokens.length - 2];
      }
      if (!vehicle || vehicle.toLowerCase() === 'out for delivery') return;
      vehicles.add(vehicle);
    });
  });
  return Array.from(vehicles);
}

function getLastVehicleNumberFromRoutes(routes) {
  const raw = String(routes || '');
  if (!raw.trim()) return '';
  const segments = raw.split('$$').map((part) => part.trim()).filter(Boolean);
  let lastVehicle = '';
  segments.forEach((segment) => {
    const parts = segment.split(' -> ').map((p) => p.trim()).filter(Boolean);
    parts.forEach((part) => {
      if (!part.includes(')')) return;
      const tokens = part.split('|').map((t) => t.trim()).filter(Boolean);
      if (tokens.length < 2) return;
      let vehicle = tokens[tokens.length - 1];
      if (vehicle.toLowerCase() === 'out for delivery' && tokens.length >= 2) {
        vehicle = tokens[tokens.length - 2];
      }
      if (!vehicle || vehicle.toLowerCase() === 'out for delivery') return;
      lastVehicle = vehicle;
    });
  });
  return lastVehicle;
}

function getActiveVehicleStatuses() {
  return [
    'Pending',
    'Manifestation',
    'DManifestation',
    'Out for Delivery',
    'D-Out for Delivery',
    'Will be Picked-Up',
    'D-Will be Picked-Up',
    'Manifested/Pending',
    'In Transit/Pending'
  ];
}

function getVehicleCompletionBlockingStatuses() {
  return [
    'Manifestation',
    'DManifestation',
    'Out for Delivery',
    'D-Out for Delivery'
  ];
}

async function autoCompleteVehiclesIfNoActive(gstinId, routes) {
  const vehicleNumbers = extractVehicleNumbersFromRoutes(routes);
  if (!vehicleNumbers.length) return;
  const activeStatuses = getVehicleCompletionBlockingStatuses();
  const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const vehicleNo of vehicleNumbers) {
    const vehicleRegex = new RegExp(`\\|\\s*${escapeRegex(vehicleNo)}\\b`, 'i');
    const ewaybills = await Ewaybill.find({ routes: { $regex: vehicleRegex } })
      .select('shipmentId')
      .lean();
    const shipmentIds = Array.from(
      new Set((ewaybills || []).map((e) => String(e?.shipmentId || '')).filter(Boolean))
    );
    if (!shipmentIds.length) continue;
    const hasActive = await Shipment.exists({
      GSTIN_ID: gstinId,
      _id: { $in: shipmentIds },
      shipmentStatus: { $in: activeStatuses }
    });
    if (hasActive) continue;
    await Promise.all([
      Branch.updateMany(
        { GSTIN_ID: gstinId, 'vehicles.vehicleNo': vehicleNo },
        { $set: { 'vehicles.$[v].vehicleStatus': 'online' } },
        { arrayFilters: [{ 'v.vehicleNo': vehicleNo }] }
      ),
      Hub.updateMany(
        { GSTIN_ID: gstinId, 'deliveryAddresses.vehicles.vehicleNo': vehicleNo },
        { $set: { 'deliveryAddresses.$[].vehicles.$[v].vehicleStatus': 'online' } },
        { arrayFilters: [{ 'v.vehicleNo': vehicleNo }] }
      )
    ]);
  }
}

async function filterVehiclesWithoutActiveShipments(gstinId, vehicleNumbers) {
  const activeStatuses = getVehicleCompletionBlockingStatuses();
  const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const uniqueVehicles = Array.from(new Set((vehicleNumbers || []).filter(Boolean)));
  const eligible = [];

  for (const vehicleNo of uniqueVehicles) {
    const vehicleRegex = new RegExp(`\\|\\s*${escapeRegex(vehicleNo)}\\b`, 'i');
    const ewaybills = await Ewaybill.find({ routes: { $regex: vehicleRegex } })
      .select('shipmentId')
      .lean();
    const shipmentIds = Array.from(
      new Set((ewaybills || []).map((e) => String(e?.shipmentId || '')).filter(Boolean))
    );
    if (!shipmentIds.length) {
      eligible.push(vehicleNo);
      continue;
    }
    const hasActive = await Shipment.exists({
      GSTIN_ID: gstinId,
      _id: { $in: shipmentIds },
      shipmentStatus: { $in: activeStatuses }
    });
    if (!hasActive) {
      eligible.push(vehicleNo);
    }
  }

  return eligible;
}

async function autoCompleteVehicleIfNoBlocking(gstinId, vehicleNo) {
  const vehicle = String(vehicleNo || '').trim();
  if (!vehicle) return;
  const activeStatuses = getVehicleCompletionBlockingStatuses();
  const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const vehicleRegex = new RegExp(`\\|\\s*${escapeRegex(vehicle)}\\b`, 'i');
  const ewaybills = await Ewaybill.find({ routes: { $regex: vehicleRegex } })
    .select('shipmentId')
    .lean();
  const shipmentIds = Array.from(
    new Set((ewaybills || []).map((e) => String(e?.shipmentId || '')).filter(Boolean))
  );
  if (!shipmentIds.length) {
    await updateInternalVehiclesStatus(gstinId, [vehicle], 'online');
    return;
  }
  const hasBlocking = await Shipment.exists({
    GSTIN_ID: gstinId,
    _id: { $in: shipmentIds },
    shipmentStatus: { $in: activeStatuses }
  });
  if (!hasBlocking) {
    await updateInternalVehiclesStatus(gstinId, [vehicle], 'online');
  }
}

async function updateInternalVehiclesToScheduled(gstinId, routes) {
  const vehicleNumbers = extractVehicleNumbersFromRoutes(routes);
  if (!vehicleNumbers.length) return;
  const uniqueVehicles = Array.from(new Set(vehicleNumbers));
  const lastVehicle = getLastVehicleNumberFromRoutes(routes) || uniqueVehicles[uniqueVehicles.length - 1];
  const others = uniqueVehicles.filter((v) => v !== lastVehicle);
  if (others.length) {
    await updateInternalVehiclesStatus(gstinId, others, 'online');
  }
  if (lastVehicle) {
    await updateInternalVehiclesStatus(gstinId, [lastVehicle], 'scheduled');
  }
}

async function updateInternalVehiclesStatus(gstinId, vehicleNumbers, status) {
  if (!vehicleNumbers.length) return;
  const safeStatus = String(status || '').trim() || 'online';
  const arrayFilters = [{ 'v.vehicleNo': { $in: vehicleNumbers }, 'v.vehicleStatus': { $ne: 'offline' } }];
  await Promise.all([
    Branch.updateMany(
      { GSTIN_ID: gstinId, 'vehicles.vehicleNo': { $in: vehicleNumbers } },
      { $set: { 'vehicles.$[v].vehicleStatus': safeStatus } },
      { arrayFilters }
    ),
    Hub.updateMany(
      { GSTIN_ID: gstinId, 'deliveryAddresses.vehicles.vehicleNo': { $in: vehicleNumbers } },
      { $set: { 'deliveryAddresses.$[].vehicles.$[v].vehicleStatus': safeStatus } },
      { arrayFilters }
    )
  ]);
}

async function updateInternalVehicleStatusWithLocation(gstinId, vehicleNo, status, locationId) {
  const vehicle = String(vehicleNo || '').trim();
  if (!vehicle) return;
  const safeStatus = String(status || '').trim() || 'online';
  const location = String(locationId || '').trim();
  const arrayFilters = [{ 'v.vehicleNo': vehicle, 'v.vehicleStatus': { $ne: 'offline' } }];
  const update = location
    ? { $set: { 'vehicles.$[v].vehicleStatus': safeStatus, 'vehicles.$[v].currentLocationId': location } }
    : { $set: { 'vehicles.$[v].vehicleStatus': safeStatus } };
  const hubUpdate = location
    ? { $set: { 'deliveryAddresses.$[].vehicles.$[v].vehicleStatus': safeStatus, 'deliveryAddresses.$[].vehicles.$[v].currentLocationId': location } }
    : { $set: { 'deliveryAddresses.$[].vehicles.$[v].vehicleStatus': safeStatus } };
  await Promise.all([
    Branch.updateMany(
      { GSTIN_ID: gstinId, 'vehicles.vehicleNo': vehicle },
      update,
      { arrayFilters }
    ),
    Hub.updateMany(
      { GSTIN_ID: gstinId, 'deliveryAddresses.vehicles.vehicleNo': vehicle },
      hubUpdate,
      { arrayFilters }
    )
  ]);
}

async function updateInternalVehicleLocation(gstinId, vehicleNo, locationId, ownerType, ownerId) {
  const vehicle = String(vehicleNo || '').trim();
  const location = String(locationId || '').trim();
  if (!vehicle || !location) return;
  const arrayFilters = [{ 'v.vehicleNo': vehicle, 'v.vehicleStatus': { $ne: 'offline' } }];
  const ownerTypeValue = String(ownerType || '').trim().toLowerCase();
  const ownerIdValue = String(ownerId || '').trim();
  const updates = [];
  if (ownerTypeValue === 'branch' && ownerIdValue) {
    updates.push(
      Branch.updateMany(
        { _id: ownerIdValue, GSTIN_ID: gstinId, 'vehicles.vehicleNo': vehicle },
        { $set: { 'vehicles.$[v].currentLocationId': location } },
        { arrayFilters }
      )
    );
  } else if (ownerTypeValue === 'hub' && ownerIdValue) {
    updates.push(
      Hub.updateMany(
        { _id: ownerIdValue, GSTIN_ID: gstinId, 'deliveryAddresses.vehicles.vehicleNo': vehicle },
        { $set: { 'deliveryAddresses.$[].vehicles.$[v].currentLocationId': location } },
        { arrayFilters }
      )
    );
  } else {
    updates.push(
      Branch.updateMany(
        { GSTIN_ID: gstinId, 'vehicles.vehicleNo': vehicle },
        { $set: { 'vehicles.$[v].currentLocationId': location } },
        { arrayFilters }
      )
    );
    updates.push(
      Hub.updateMany(
        { GSTIN_ID: gstinId, 'deliveryAddresses.vehicles.vehicleNo': vehicle },
        { $set: { 'deliveryAddresses.$[].vehicles.$[v].currentLocationId': location } },
        { arrayFilters }
      )
    );
  }
  await Promise.all(updates);
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
router.post('/quote', requireAuth, (req, res) => {
  const { ewaybills, charges, applyConsignorDiscount } = req.body || {};
  const totals = calculateFinalAmount(ewaybills, charges, applyConsignorDiscount !== false);
  res.json({
    finalAmount: totals.finalAmount,
    subtotal: totals.subtotal,
    discountAmount: totals.discountAmount
  });
});

router.post('/add', requireAuth, async (req, res) => {
  try {
    const { ewaybills, ...shipmentData } = req.body;
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    const username = req.user.username || shipmentData.username;
    if (!username) return res.status(400).json({ message: 'Invalid username' });
    const wantsAllHubs = shipmentData.allHubs === true ||
      String(shipmentData.allHubs || '').toLowerCase() === 'true';
    if (wantsAllHubs) {
      const hubId = String(shipmentData.originHubId || shipmentData.hubId || '').trim();
      if (!hubId) {
        return res.status(400).json({ message: 'originHubId is required for All Hubs consignments' });
      }
      if (!mongoose.Types.ObjectId.isValid(hubId)) {
        return res.status(400).json({ message: 'Invalid originHubId' });
      }
      const hub = await Hub.findOne({ _id: hubId, GSTIN_ID: gstinId }).select('_id branchId').lean();
      if (!hub?.branchId) {
        return res.status(400).json({ message: 'Invalid hub selection' });
      }
      shipmentData.originHubId = hub._id;
      shipmentData.branchId = hub._id;
      shipmentData.allHubs = true;
      if (!shipmentData.currentLocationId && !shipmentData.currentBranchId) {
        shipmentData.currentLocationId = hub._id;
      }
    } else {
      shipmentData.allHubs = false;
    }
    const branchId = String(shipmentData.branchId || '').trim();
    if (!branchId || branchId === 'all') {
      return res.status(400).json({ message: 'branchId is required and must not be "all"' });
    }
    if (!mongoose.Types.ObjectId.isValid(branchId)) {
      return res.status(400).json({ message: 'Invalid branchId' });
    }
    const allowedBranchIds = getAllowedBranchIds(req);
    if (allowedBranchIds) {
      if (wantsAllHubs) {
        const hub = await Hub.findOne({ _id: branchId, GSTIN_ID: gstinId })
          .select('_id branchId')
          .lean();
        const hubBranchId = String(hub?.branchId || '');
        if (!hubBranchId || !allowedBranchIds.includes(hubBranchId)) {
          return res.status(403).json({ message: 'Branch access denied' });
        }
      } else if (!allowedBranchIds.includes(branchId)) {
        return res.status(403).json({ message: 'Branch access denied' });
      }
    }
    const wantsSummary = String(req.query.summary || '').toLowerCase() === 'true' || req.query.summary === '1';

    if (!shipmentData.billingClientId &&
        shipmentData.billingType === 'consignor' &&
        shipmentData.consignorTab === 'consignor') {
      shipmentData.billingClientId = shipmentData.consignorId;
    }

    const totals = calculateFinalAmount(ewaybills, shipmentData.charges, shipmentData.applyConsignorDiscount !== false);
    shipmentData.finalAmount = totals.finalAmount;
    delete shipmentData.applyConsignorDiscount;

    if (!shipmentData.currentLocationId && shipmentData.currentBranchId) {
      shipmentData.currentLocationId = shipmentData.currentBranchId;
    }
    delete shipmentData.currentBranchId;

    const currentLocationId =
      shipmentData.currentLocationId ||
      shipmentData.originBranchId ||
      shipmentData.branchId ||
      null;
    const shipment = await Shipment.create({
      ...shipmentData,
      currentLocationId,
      GSTIN_ID: gstinId,
      username
    });
    const paymentEntityId = shipment.billingClientId;
    if (paymentEntityId) {
      const paymentGstinId = Number(shipment.GSTIN_ID);
      if (!Number.isFinite(paymentGstinId)) {
        console.error('Invalid GSTIN_ID on shipment for payment creation', {
          shipmentId: String(shipment._id || ''),
          GSTIN_ID: shipment.GSTIN_ID
        });
      } else {
        let entityType = 'client';
        const [client, hub] = await Promise.all([
          Client.findOne({ _id: paymentEntityId, GSTIN_ID: paymentGstinId }).select('_id').lean(),
          Hub.findOne({ _id: paymentEntityId, GSTIN_ID: paymentGstinId }).select('_id').lean()
        ]);
        if (!client && hub) {
          entityType = 'hub';
        }
        const amountDue = Number(shipment.finalAmount) || 0;
        const amountPaid = Number(shipment.initialPaid) || 0;
        const balance = amountDue - amountPaid;
        const isPaid = amountDue > 0 && balance <= 0;
        const referenceNo = `${String(shipment.branchId)}$$${String(shipment._id)}`;
        const paymentPayload = {
          entityType,
          entityId: String(paymentEntityId),
          referenceNo,
          amountDue,
          amountPaid,
          balance,
          currency: 'rupees',
          status: isPaid ? 'Paid' : 'Pending',
          paymentDate: isPaid ? new Date() : null,
          paymentMethod: 'recievable',
          notes: '',
          dueDate: null
        };
        try {
          const paymentResult = await Payment.updateOne(
            { entityType, entityId: String(paymentEntityId), referenceNo },
            {
              $setOnInsert: { ...paymentPayload, GSTIN_ID: paymentGstinId }
            },
            { upsert: true }
          );
          if (!paymentResult?.upsertedId) {
            console.warn('Payment record already exists or was not inserted', {
              referenceNo,
              entityId: String(paymentEntityId),
              gstinId
            });
          }
        } catch (err) {
          console.error('Failed to create payment record', { referenceNo, gstinId: paymentGstinId, err });
        }
      }
    }
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
  const branchId = String(req.query.branchId || '').trim();

  if (!branchId) {
    return res.status(400).json({ message: 'Missing branchId in query parameters' });
  }
  if (branchId === 'all') {
    return res.status(400).json({ message: 'Please select a specific branch to fetch consignment number' });
  }
  const allowedBranchIds = getAllowedBranchIds(req);

  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const today = new Date();
    const year = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
    const fiscalYearStart = new Date(year, 3, 1);
    const fiscalYearEnd = new Date(year + 1, 2, 31, 23, 59, 59);

    let matchQuery = null;
    if (branchId === 'all-hubs') {
      if (allowedBranchIds && !allowedBranchIds.length) {
        return res.status(403).json({ message: 'Branch access denied' });
      }
      const hubQuery = { GSTIN_ID: gstinId };
      if (allowedBranchIds) {
        hubQuery.branchId = { $in: allowedBranchIds };
      }
      const hubIds = await Hub.find(hubQuery).select('_id').lean();
      const allowedHubIds = (hubIds || []).map((h) => String(h?._id || '')).filter(Boolean);
      if (!allowedHubIds.length) {
        return res.json({ nextNumber: 1, fiscalYear: `${year}-${year + 1}` });
      }
      matchQuery = {
        GSTIN_ID: gstinId,
        allHubs: true,
        branchId: { $in: allowedHubIds }
      };
    } else {
      if (allowedBranchIds && !allowedBranchIds.includes(String(branchId))) {
        return res.status(403).json({ message: 'Branch access denied' });
      }
      matchQuery = mongoose.Types.ObjectId.isValid(branchId)
        ? { GSTIN_ID: gstinId, branchId: new mongoose.Types.ObjectId(branchId) }
        : null;
    }
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
    const allowedBranchIds = getAllowedBranchIds(req);
    if (branchId && branchId !== 'all') {
      if (allowedBranchIds && !allowedBranchIds.includes(String(branchId))) {
        return res.status(403).json({ message: 'Branch access denied' });
      }
      shipments = await Shipment.find({ GSTIN_ID: gstinId, branchId }).sort({ createdAt: -1 });
    } else if (branchId === 'all') {
      if (allowedBranchIds) {
        if (!allowedBranchIds.length) {
          return res.json([]);
        }
        const hubs = await Hub.find({ GSTIN_ID: gstinId, branchId: { $in: allowedBranchIds } })
          .select('_id')
          .lean();
        const allowedHubIds = (hubs || []).map((h) => String(h?._id || '')).filter(Boolean);
        const allowedLocationIds = Array.from(new Set([...allowedBranchIds, ...allowedHubIds]));
        shipments = await Shipment.find({ GSTIN_ID: gstinId, branchId: { $in: allowedLocationIds } })
          .sort({ createdAt: -1 });
      } else {
        shipments = await Shipment.find({ GSTIN_ID: gstinId }).sort({ createdAt: -1 });
      }
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
    const hubIdRaw = req.body?.hubId;
    const hubChargeRaw = req.body?.hubCharge;
    const clearVehicleNo = String(req.body?.clearVehicleNo || '').trim();
    const clearAllVehicles = req.body?.clearAllVehicles === true;
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    const shipmentIdRaw = String(req.query.shipmentId || req.body?.shipmentId || '').trim();
    const shipmentId = mongoose.Types.ObjectId.isValid(shipmentIdRaw) ? shipmentIdRaw : '';
    delete shipmentData._id;
    delete shipmentData.consignmentNumber;
    delete shipmentData.GSTIN_ID;
    delete shipmentData.branchId;
    delete shipmentData.branchName;
    if (!shipmentData.currentLocationId && shipmentData.currentBranchId) {
      shipmentData.currentLocationId = shipmentData.currentBranchId;
    }
    delete shipmentData.currentBranchId;
      if (shipmentData.paymentMode && !shipmentData.shipmentStatus) {
        shipmentData.shipmentStatus = shipmentData.paymentMode === 'To Pay' ? 'To Pay' : 'Pending';
      }
      const filter = shipmentId
        ? { _id: shipmentId, GSTIN_ID: gstinId }
        : { consignmentNumber: req.params.consignmentNumber, GSTIN_ID: gstinId };
      const existingShipment = await Shipment.findOne(filter).select('shipmentStatus').lean();
      const shipment = await Shipment.findOneAndUpdate(
        filter,
        shipmentData,
        { new: true }
      );
      if (!shipment) return res.status(404).json({ message: 'Shipment not found' });
    if (ewaybills) {
      await replaceShipmentLines(shipment._id, ewaybills, { defaultInstockToAmount: false });
    }
      const nextStatus = String(shipmentData.shipmentStatus || shipment.shipmentStatus || '').trim();
      const deliveredVehicleNo = String(shipmentData.currentVehicleNo || '').trim();
      const deliveredLocationId = String(shipmentData.currentLocationId || '').trim();
      const deliveredVehicleOwnerType = String(shipmentData.currentVehicleOwnerType || '').trim();
      const deliveredVehicleOwnerId = String(shipmentData.currentVehicleOwnerId || '').trim();
      if (['DPending', 'Delivered'].includes(nextStatus)) {
        shipmentData.currentVehicleNo = '';
        shipmentData.currentVehicleOwnerType = '';
        shipmentData.currentVehicleOwnerId = null;
      }
      let didUpdateVehicleLocation = false;
      if (['DPending', 'Delivered'].includes(nextStatus)) {
        if (deliveredLocationId && deliveredVehicleNo) {
          await updateInternalVehicleLocation(
            gstinId,
            deliveredVehicleNo,
            deliveredLocationId,
            deliveredVehicleOwnerType,
            deliveredVehicleOwnerId
          );
          didUpdateVehicleLocation = true;
        }
      }
      const previousStatus = String(existingShipment?.shipmentStatus || '').trim();
      const autoClearAllVehicles =
        ['Manifestation', 'DManifestation'].includes(previousStatus) &&
        ['Delivered', 'DPending'].includes(nextStatus);
      const shouldClearVehicles = Boolean(clearVehicleNo || clearAllVehicles || autoClearAllVehicles);

      if (shouldClearVehicles && shipment?._id) {
        let routeSource = '';
        if (Array.isArray(ewaybills) && ewaybills.length) {
          routeSource = ewaybills.map((ewb) => String(ewb?.routes || '')).join('$$');
        }
        if (!routeSource) {
        const stored = await Ewaybill.find({ shipmentId: shipment._id })
          .select('routes')
          .lean();
        routeSource = (stored || []).map((ewb) => String(ewb?.routes || '')).join('$$');
      }
      const vehiclesToClear = clearVehicleNo ? [clearVehicleNo] : extractVehicleNumbersFromRoutes(routeSource);
      const vehiclesToOnline = await filterVehiclesWithoutActiveShipments(gstinId, vehiclesToClear);
        if (vehiclesToOnline.length) {
          const deliveredLocationId = String(shipmentData.currentLocationId || '').trim();
          const fallbackVehicle = String(shipmentData.currentVehicleNo || '').trim();
          if (deliveredLocationId) {
            const lastVehicle = routeSource ? getLastVehicleNumberFromRoutes(routeSource) : '';
            const chosenVehicle = String(lastVehicle || fallbackVehicle || '').trim();
            const chosenLower = chosenVehicle.toLowerCase();
            const remaining = chosenVehicle
              ? vehiclesToOnline.filter((v) => String(v || '').trim().toLowerCase() !== chosenLower)
              : vehiclesToOnline;
            if (chosenVehicle && vehiclesToOnline.some((v) => String(v || '').trim().toLowerCase() === chosenLower)) {
              await updateInternalVehicleStatusWithLocation(gstinId, chosenVehicle, 'online', deliveredLocationId);
            }
            if (remaining.length) {
              await updateInternalVehiclesStatus(gstinId, remaining, 'online');
            }
          } else {
            await updateInternalVehiclesStatus(gstinId, vehiclesToOnline, 'online');
          }
        }
    }
      if (shouldClearVehicles && shipment?._id) {
        const existing = await Ewaybill.find({ shipmentId: shipment._id }).select('_id routes').lean();
        const updates = (existing || []).map((ewb) => {
          const nextRoutes = stripVehicleFromRoutes(
            ewb.routes || '',
            clearVehicleNo,
            clearAllVehicles || autoClearAllVehicles
          );
          if (nextRoutes === ewb.routes) return null;
          return {
            updateOne: {
              filter: { _id: ewb._id },
            update: { $set: { routes: nextRoutes } }
          }
        };
      }).filter(Boolean);
      if (updates.length) {
        await Ewaybill.bulkWrite(updates);
      }
    }

      const status = nextStatus;
    if (['Manifestation', 'Out for Delivery', 'DManifestation', 'D-Out for Delivery'].includes(status)) {
      const routesSource = Array.isArray(ewaybills) && ewaybills.length
        ? ewaybills.map((ewb) => String(ewb?.routes || '')).join('$$')
        : '';
      if (routesSource) {
        await updateInternalVehiclesToScheduled(gstinId, routesSource);
      } else {
        const stored = await Ewaybill.find({ shipmentId: shipment._id })
          .select('routes')
          .lean();
        const combinedRoutes = (stored || []).map((ewb) => String(ewb?.routes || '')).join('$$');
        if (combinedRoutes) {
          await updateInternalVehiclesToScheduled(gstinId, combinedRoutes);
        }
      }
    }

    if (['Pending', 'DPending', 'Delivered'].includes(status)) {
      if (['DPending', 'Delivered'].includes(status) && !didUpdateVehicleLocation) {
        const view = (await buildShipmentViews([shipment]))[0];
        res.json(view);
        return;
      }
      const routesSource = Array.isArray(ewaybills) && ewaybills.length
        ? ewaybills.map((ewb) => String(ewb?.routes || '')).join('$$')
        : '';
      if (deliveredVehicleNo) {
        await autoCompleteVehicleIfNoBlocking(gstinId, deliveredVehicleNo);
      } else if (routesSource) {
        await autoCompleteVehiclesIfNoActive(gstinId, routesSource);
      } else {
        const stored = await Ewaybill.find({ shipmentId: shipment._id })
          .select('routes')
          .lean();
        const combinedRoutes = (stored || []).map((ewb) => String(ewb?.routes || '')).join('$$');
        if (combinedRoutes) {
          await autoCompleteVehiclesIfNoActive(gstinId, combinedRoutes);
        }
      }
    }

    const hubId = String(hubIdRaw || '').trim();
    const hubIdValid = hubId && mongoose.Types.ObjectId.isValid(hubId);
    const hubCharge = Math.max(Number(hubChargeRaw) || 0, 0);
    if (hubIdValid) {
      const hubExists = await Hub.findOne({ _id: hubId, GSTIN_ID: gstinId }).select('_id').lean();
      if (hubExists) {
        const referenceNo = `${String(shipment._id)}$$hubcharge`;
        const existingPayment = await Payment.findOne({
          GSTIN_ID: gstinId,
          entityType: 'hub',
          entityId: hubId,
          referenceNo
        }).lean();
        const previousDue = Number(existingPayment?.amountDue || 0);
        const amountPaid = Number(existingPayment?.amountPaid || 0);
        const balance = Math.max(hubCharge - amountPaid, 0);
        const status = balance <= 0 ? 'Paid' : 'Pending';

        await Payment.updateOne(
          { GSTIN_ID: gstinId, entityType: 'hub', entityId: hubId, referenceNo },
          {
            $set: {
              amountDue: hubCharge,
              amountPaid,
              balance,
              currency: 'rupees',
              status,
              paymentMethod: 'payable',
              paymentDate: balance <= 0 ? new Date() : null
            },
            $setOnInsert: {
              GSTIN_ID: gstinId,
              entityType: 'hub',
              entityId: hubId,
              referenceNo,
              notes: `Hub charge for consignment ${String(shipment.consignmentNumber || '')}`.trim()
            }
          },
          { upsert: true }
        );

        let summary = await PaymentEntitySummary.findOne({
          GSTIN_ID: gstinId,
          entityType: 'hub',
          entityId: hubId
        });
        if (!summary) {
          summary = await PaymentEntitySummary.create({
            GSTIN_ID: gstinId,
            entityType: 'hub',
            entityId: hubId,
            totalDue: hubCharge,
            totalPaid: amountPaid,
            totalBalance: balance,
            status
          });
        } else {
          const deltaDue = hubCharge - previousDue;
          const totalDue = Math.max(Number(summary.totalDue || 0) + deltaDue, 0);
          const totalPaid = Number(summary.totalPaid || 0);
          const totalBalance = Math.max(totalDue - totalPaid, 0);
          summary.totalDue = totalDue;
          summary.totalBalance = totalBalance;
          summary.status = totalBalance <= 0 ? 'Paid' : 'Pending';
          await summary.save();
        }
      }
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
    if (!shipmentData.currentLocationId && shipmentData.currentBranchId) {
      shipmentData.currentLocationId = shipmentData.currentBranchId;
    }
    delete shipmentData.currentBranchId;
    if (shipmentData.paymentMode && !shipmentData.shipmentStatus) {
      shipmentData.shipmentStatus = shipmentData.paymentMode === 'To Pay' ? 'To Pay' : 'Pending';
    }
    const nextStatus = String(shipmentData.shipmentStatus || '').trim();
    if (['DPending', 'Delivered'].includes(nextStatus)) {
      shipmentData.currentVehicleNo = '';
      shipmentData.currentVehicleOwnerType = '';
      shipmentData.currentVehicleOwnerId = null;
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

// Fetch consignments assigned to a vehicle number (auth required)
router.get('/vehicle-consignments', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    const vehicleNumber = String(req.query.vehicleNumber || '').trim();
    const statusFilter = String(req.query.statusFilter || 'manifestation').trim().toLowerCase();
    if (!vehicleNumber) {
      return res.status(400).json({ message: 'Vehicle number is required.' });
    }

    const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const vehicleRegex = new RegExp(`\\|\\s*${escapeRegex(vehicleNumber)}\\b`, 'i');

    const ewaybills = await Ewaybill.find({ routes: { $regex: vehicleRegex } })
      .select('shipmentId')
      .lean();
    const shipmentIds = Array.from(
      new Set((ewaybills || []).map((e) => String(e?.shipmentId || '')).filter(Boolean))
    );
    if (!shipmentIds.length) {
      return res.json({ consignments: [] });
    }

    let statusCriteria = {};
    if (statusFilter === 'manifestation') {
      statusCriteria = { shipmentStatus: { $in: ['Manifestation', 'DManifestation'] } };
    } else if (statusFilter === 'assigned') {
      statusCriteria = { shipmentStatus: { $in: getActiveVehicleStatuses() } };
    }
    const shipments = await Shipment.find({
      GSTIN_ID: gstinId,
      _id: { $in: shipmentIds },
      ...statusCriteria
    }).select('_id consignmentNumber shipmentStatus shipmentStatusDetails').lean();

    const consignments = (shipments || []).map((s) => ({
      id: String(s._id),
      consignmentNumber: s.consignmentNumber,
      shipmentStatus: s.shipmentStatus,
      shipmentStatusDetails: s.shipmentStatusDetails
    }));

    res.json({ consignments });
  } catch (err) {
    res.status(500).json({ message: err?.message || 'Failed to fetch consignments.' });
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

