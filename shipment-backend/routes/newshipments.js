// shipment-backend/routes/newshipments.js
import express from 'express';
import mongoose from 'mongoose';
import Shipment from '../models/NewShipment/NewShipmentShipment.js';
import Ewaybill from '../models/NewShipment/NewShipmentEwaybill.js';
import Invoice from '../models/NewShipment/NewShipmentInvoice.js';
import InvoiceProduct from '../models/NewShipment/NewShipmentInvoiceProduct.js';
import InvoicePackage from '../models/NewShipment/NewShipmentInvoicePackage.js';
import GeneratedInvoice from '../models/NewShipment/NewShipmentGeneratedInvoice.js';
import PreInvoice from '../models/NewShipment/NewShipmentPreInvoice.js';
import PreInvoiceItem from '../models/NewShipment/NewShipmentPreInvoiceItem.js';
import Client from '../models/Client.js';
import Guest from '../models/Guest.js';
import User from '../models/User.js';
import Hub from '../models/Hub.js';
import Payment from '../models/Payment/Payment.js';
import PaymentEntitySummary from '../models/Payment/PaymentEntitySummary.js';
import PaymentTransaction from '../models/Payment/PaymentTransaction.js';
import Branch from '../models/Branch.js';
import ManifestItem from '../models/Manifest/ManifestItem.js';
import { requireAuth } from '../middleware/auth.js';
import { syncPaymentsFromGeneratedInvoices } from '../services/paymentSync.js';

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

function normalizeOriginType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'hub') return 'hub';
  return 'branch';
}

function normalizeInvoiceSerialScope(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw === 'branch' || raw === 'branch-wise' || raw === 'branchwise') return 'branch';
  if (raw === 'company' || raw === 'company-wide' || raw === 'companywide' || raw === 'global') {
    return 'company';
  }
  return '';
}

function normalizeInvoiceBranchToken(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return '';
  return raw.replace(/[^A-Z0-9]/g, '');
}

function buildInvoiceCode({ yearToken, billingCategory, branchToken, invoiceNumber, branchScoped }) {
  const serial = String(invoiceNumber || '').trim();
  const category = String(billingCategory || 'B').trim().toUpperCase();
  if (branchScoped) {
    return `${yearToken}${category}${branchToken}${serial}`;
  }
  return `${yearToken}${category}${serial}`;
}

function buildInvoiceDisplayNumber({ yearToken, billingCategory, branchToken, invoiceNumber, branchScoped }) {
  const serial = String(invoiceNumber || '').trim();
  const category = String(billingCategory || 'B').trim().toUpperCase();
  const parts = [yearToken, category];
  if (branchScoped && branchToken) parts.push(branchToken);
  parts.push(serial);
  return parts.filter(Boolean).join('/');
}

const GENERATED_INVOICE_DUPLICATE_MESSAGE =
  'Duplicate invoice number detected. If you recently changed invoice series rules, run: node scripts/fix-generated-invoice-indexes.js';

function isDuplicateKeyError(err) {
  if (!err) return false;
  if (err.code === 11000) return true;
  const writeErrors = Array.isArray(err.writeErrors) ? err.writeErrors : [];
  return writeErrors.some((e) => e?.code === 11000);
}

async function resolveBillingCategory(billingEntityId, gstinId) {
  const entityId = String(billingEntityId || '').trim();
  if (!entityId) return 'B';
  const [client, hub, guest] = await Promise.all([
    Client.findOne({ _id: entityId, GSTIN_ID: gstinId }).select('_id').lean(),
    Hub.findOne({ _id: entityId, GSTIN_ID: gstinId }).select('_id').lean(),
    Guest.findOne({ _id: entityId, GSTIN_ID: gstinId }).select('_id').lean()
  ]);
  if (guest) return 'C';
  if (client || hub) return 'B';
  return 'B';
}

function ensureOriginFromExisting(shipmentData, existing) {
  if (!existing || !shipmentData) return;
  if (!shipmentData.originLocId) {
    shipmentData.originLocId = existing.originLocId || existing.originLocId|| existing.originLocId;
  }
  if (!shipmentData.originType) {
    shipmentData.originType = existing.originType
      ? normalizeOriginType(existing.originType)
      : (existing.originLocId? 'hub' : 'branch');
  }
}

function findLocationById(locations, targetId) {
  if (!targetId) return null;
  const matchId = String(targetId);
  return (locations || []).find((loc) => {
    const locId = loc?.delivery_id || loc?._id || loc?.id;
    return locId && String(locId) === matchId;
  }) || null;
}

async function resolveOriginId(originId, gstinId, allowedoriginLocIds) {
  if (!originId) {
    return { error: 'Invalid originLocId' };
  }
  if (!mongoose.Types.ObjectId.isValid(originId)) {
    return { error: 'Invalid originLocId' };
  }
  const normalizedId = new mongoose.Types.ObjectId(originId);
  const hub = await Hub.findOne({ _id: normalizedId, GSTIN_ID: gstinId }).select('_id originLocId').lean();
  if (hub) {
    if (allowedoriginLocIds && !allowedoriginLocIds.includes(String(hub.originLocId || ''))) {
      return { error: 'Branch access denied' };
    }
    return { originType: 'hub', originLocId: hub._id };
  }
  if (allowedoriginLocIds && !allowedoriginLocIds.includes(originId)) {
    return { error: 'Branch access denied' };
  }
  return { originType: 'branch', originLocId: normalizedId };
}

async function assertOriginAccess(originTypeRaw, originLocIdRaw, gstinId, allowedoriginLocIds) {
  const originType = normalizeOriginType(originTypeRaw);
  if (!originLocIdRaw) {
    return { error: 'originLocId is required', status: 400 };
  }
  if (!mongoose.Types.ObjectId.isValid(originLocIdRaw)) {
    return { error: 'Invalid originLocId', status: 400 };
  }
  const normalizedId = new mongoose.Types.ObjectId(originLocIdRaw);
  if (originType === 'hub') {
    const hub = await Hub.findOne({ _id: normalizedId, GSTIN_ID: gstinId }).select('_id originLocId').lean();
    if (!hub) {
      return { error: 'Invalid originHubId', status: 400 };
    }
    if (allowedoriginLocIds && !allowedoriginLocIds.includes(String(hub.originLocId || ''))) {
      return { error: 'Branch access denied', status: 403 };
    }
    return { originType: 'hub', originLocId: hub._id };
  }
  if (allowedoriginLocIds && !allowedoriginLocIds.includes(originLocIdRaw)) {
    return { error: 'Branch access denied', status: 403 };
  }
  return { originType: 'branch', originLocId: normalizedId };
}

function getOriginKey(shipment) {
  return String(shipment.originLocId || shipment.originLocId|| shipment.originLocId || '');
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

async function buildOriginNameMap(originIds = []) {
  const ids = Array.from(new Set((originIds || []).map((id) => String(id || '')).filter(Boolean)));
  if (!ids.length) return new Map();
  const [branches, hubs] = await Promise.all([
    Branch.find({ _id: { $in: ids }, branchName: { $exists: true } }).select('_id branchName').lean(),
    Hub.find({ _id: { $in: ids } }).select('_id hubName').lean()
  ]);
  const map = new Map();
  (branches || []).forEach((branch) => {
    if (branch?._id) map.set(String(branch._id), branch.branchName || '');
  });
  (hubs || []).forEach((hub) => {
    if (hub?._id) map.set(String(hub._id), hub.hubName || '');
  });
  return map;
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

export async function buildShipmentViews(shipments) {
  const clientIds = new Set();
  const guestIds = new Set();
  const originIds = new Set();
  for (const shipment of shipments || []) {
    const originId = shipment?.originLocId || shipment?.originLocId|| shipment?.originLocId;
    if (originId) {
      originIds.add(String(originId));
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

  const [clients, guests, originNameById] = await Promise.all([
    clientIds.size ? Client.find({ _id: { $in: Array.from(clientIds) } }).lean() : [],
    guestIds.size ? Guest.find({ _id: { $in: Array.from(guestIds) } }).lean() : [],
    buildOriginNameMap(Array.from(originIds))
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

    const originKey = String(shipment.originLocId || shipment.originLocId|| shipment.originLocId || '');
    data.branchName = originNameById.get(originKey) || '';
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
    const allowedoriginLocIds = getAllowedoriginLocIds(req);
    const originTypeRaw = shipmentData.originType || (String(shipmentData.allHubs || '').toLowerCase() === 'true' ? 'hub' : 'branch');
    let originLocIdRaw = String(shipmentData.originLocId || shipmentData.originLocId || shipmentData.originLocId|| '').trim();
    if (!originLocIdRaw && originTypeRaw === 'hub' && shipmentData.hubId) {
      originLocIdRaw = String(shipmentData.hubId).trim();
    }
    const originAccess = await assertOriginAccess(originTypeRaw, originLocIdRaw, gstinId, allowedoriginLocIds);
    if (originAccess.error) {
      return res.status(originAccess.status || 400).json({ message: originAccess.error });
    }
    shipmentData.originType = originAccess.originType;
    shipmentData.originLocId = originAccess.originLocId;
    shipmentData.allHubs = originAccess.originType === 'hub';
    const wantsSummary = String(req.query.summary || '').toLowerCase() === 'true' || req.query.summary === '1';

    if (!shipmentData.billingClientId &&
        shipmentData.billingType === 'consignor' &&
        shipmentData.consignorTab === 'consignor') {
      shipmentData.billingClientId = shipmentData.consignorId;
    }

    const totals = calculateFinalAmount(ewaybills, shipmentData.charges, shipmentData.applyConsignorDiscount !== false);
    shipmentData.finalAmount = totals.finalAmount;
    const taxableValue = Number(shipmentData.taxableValue);
    shipmentData.taxableValue = Number.isFinite(taxableValue) ? taxableValue : totals.finalAmount;
    const igstPercent = Number(shipmentData.igstPercent);
    shipmentData.igstPercent = Number.isFinite(igstPercent) ? igstPercent : 0;
    delete shipmentData.applyConsignorDiscount;

    if (!shipmentData.currentLocationId && shipmentData.currentoriginLocId) {
      shipmentData.currentLocationId = shipmentData.currentoriginLocId;
    }
    delete shipmentData.currentoriginLocId;

    const currentLocationId =
      shipmentData.currentLocationId ||
      shipmentData.originoriginLocId ||
      shipmentData.originLocId ||
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
        const amountDue = Math.max(Number(shipment.finalAmount) || 0, 0);
        const rawInitialPaid = Math.max(Number(shipment.initialPaid) || 0, 0);
        const amountPaid = Math.min(rawInitialPaid, amountDue);
        const balance = Math.max(amountDue - amountPaid, 0);
        const paymentStatus = balance <= 0 ? 'Paid' : 'Pending';
        const direction = 'receivable';
        const originReference = getOriginKey(shipment) || '';
        const referenceNo = `${originReference}$$${String(shipment._id)}`;
        const initialPaidTxReference = `INITPAID-${String(shipment._id)}`;
        const paymentBaseFilter = {
          GSTIN_ID: paymentGstinId,
          entityType,
          entityId: String(paymentEntityId),
          referenceNo
        };
        const directionFilter = { $in: [direction, null] };
        try {
          const existingPayment = await Payment.findOne({
            ...paymentBaseFilter,
            direction: directionFilter
          }).lean();
          const previousDue = Number(existingPayment?.amountDue || 0);
          const previousPaid = Number(existingPayment?.amountPaid || 0);
          await Payment.updateOne(
            existingPayment?._id
              ? { _id: existingPayment._id }
              : {
                  ...paymentBaseFilter,
                  direction: directionFilter
                },
            {
              $setOnInsert: {
                GSTIN_ID: paymentGstinId,
                entityType,
                entityId: String(paymentEntityId),
                referenceNo,
                notes: '',
                dueDate: null
              },
              $set: {
                direction,
                amountDue,
                amountPaid,
                balance,
                currency: 'rupees',
                status: paymentStatus,
                paymentDate: amountPaid > 0 ? new Date() : null,
                paymentMethod: 'receivable'
              }
            },
            { upsert: true }
          );

          let summary = await PaymentEntitySummary.findOne({
            GSTIN_ID: paymentGstinId,
            entityType,
            entityId: String(paymentEntityId),
            direction: directionFilter
          });
          if (!summary) {
            summary = await PaymentEntitySummary.create({
              GSTIN_ID: paymentGstinId,
              entityType,
              entityId: String(paymentEntityId),
              direction,
              totalDue: amountDue,
              totalPaid: amountPaid,
              totalBalance: balance,
              lastPaymentDate: amountPaid > 0 ? new Date() : null,
              status: paymentStatus
            });
          } else {
            const totalDue = Math.max(Number(summary.totalDue || 0) + (amountDue - previousDue), 0);
            const totalPaid = Math.max(Number(summary.totalPaid || 0) + (amountPaid - previousPaid), 0);
            const totalBalance = Math.max(totalDue - totalPaid, 0);
            summary.totalDue = totalDue;
            summary.totalPaid = totalPaid;
            summary.totalBalance = totalBalance;
            summary.status = totalBalance <= 0 ? 'Paid' : 'Pending';
            summary.direction = direction;
            if (amountPaid > previousPaid) {
              summary.lastPaymentDate = new Date();
            }
            await summary.save();
          }

          const initialPaidDelta = Math.max(amountPaid - previousPaid, 0);
          if (initialPaidDelta > 0) {
            const paymentDoc = existingPayment?._id
              ? { _id: existingPayment._id }
              : await Payment.findOne({
                  ...paymentBaseFilter,
                  direction
                })
                  .select('_id')
                  .lean();
            const paymentId = paymentDoc?._id ? String(paymentDoc._id) : '';
            if (paymentId) {
              const existingInitialPaidTx = await PaymentTransaction.findOne({
                paymentId,
                method: 'Initial Paid',
                referenceNo: initialPaidTxReference
              })
                .select('_id')
                .lean();
              if (!existingInitialPaidTx?._id) {
                await PaymentTransaction.create({
                  paymentId,
                  direction,
                  amount: initialPaidDelta,
                  transactionDate: shipment?.date || shipment?.createdAt || new Date(),
                  method: 'Initial Paid',
                  referenceNo: initialPaidTxReference,
                  notes: `Initial paid captured for consignment ${String(shipment.consignmentNumber || '')}`.trim(),
                  status: 'posted'
                });
              }
            }
          }
        } catch (err) {
          console.error('Failed to create payment record', { referenceNo, gstinId: paymentGstinId, err });
        }
      }
    }
    await replaceShipmentLines(shipment._id, ewaybills || [], { defaultInstockToAmount: true });
    if (wantsSummary) {
      const originNameById = await buildOriginNameMap([
        shipment.originLocId || shipment.originLocId|| shipment.originLocId
      ]);
      const originKey = String(shipment.originLocId || shipment.originLocId|| shipment.originLocId || '');
      res.status(201).json({
        _id: shipment._id,
        consignmentNumber: shipment.consignmentNumber,
        originLocId: shipment.originLocId,
        branchName: originNameById.get(originKey) || '',
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

// Get next consignment number for a company/origin (reset on April 1st)
router.get('/nextConsignment', requireAuth, async (req, res) => {
  const originIdParam = String(req.query.originLocId || '').trim();
  const originTypeParam = String(req.query.originType || '').trim().toLowerCase();
  const originLocIdParam = String(req.query.originLocId || '').trim();
  const allowedoriginLocIds = getAllowedoriginLocIds(req);

  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const originFilterSource = originTypeParam && originIdParam
      ? { type: originTypeParam, id: originIdParam }
      : (originLocIdParam ? { type: 'branch', id: originLocIdParam } : null);
    if (!originFilterSource) {
      return res.status(400).json({ message: 'Missing origin parameters' });
    }

    const originAccess = await assertOriginAccess(
      originFilterSource.type,
      originFilterSource.id,
      gstinId,
      allowedoriginLocIds
    );
    if (originAccess.error) {
      return res.status(originAccess.status || 400).json({ message: originAccess.error });
    }

    const today = new Date();
    const year = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
    const fiscalYearStart = new Date(year, 3, 1);
    const fiscalYearEnd = new Date(year + 1, 2, 31, 23, 59, 59);

    const matchQuery = {
      GSTIN_ID: gstinId,
      originType: originAccess.originType,
      originLocId: originAccess.originLocId
    };

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

    const source = String(req.body?.source || '').trim().toLowerCase();
    const rawPreInvoiceIds = Array.isArray(req.body?.preInvoiceIds) ? req.body.preInvoiceIds : [];
    const preInvoiceIds = rawPreInvoiceIds
      .map((id) => String(id || '').trim())
      .filter((id) => mongoose.Types.ObjectId.isValid(id));
    const usePreInvoices = source === 'preinvoices' || preInvoiceIds.length > 0;

    if (usePreInvoices) {
      const preInvoiceFilter = {
        GSTIN_ID: gstinId,
        status: { $ne: 'deleted' }
      };
      let targetPreInvoiceIds = [...preInvoiceIds];
      if (!targetPreInvoiceIds.length) {
        const itemMatches = await PreInvoiceItem.find({
          consignmentNumber: { $in: consignmentNumbers }
        }).select('preInvoiceId').lean();
        targetPreInvoiceIds = Array.from(
          new Set(
            (itemMatches || [])
              .map((item) => String(item?.preInvoiceId || ''))
              .filter((id) => mongoose.Types.ObjectId.isValid(id))
          )
        );
      }
      if (targetPreInvoiceIds.length) {
        preInvoiceFilter._id = { $in: targetPreInvoiceIds };
      }

      const preInvoices = await PreInvoice.find(preInvoiceFilter).lean();
      if (!preInvoices.length) {
        return res.status(404).json({ message: 'Pre-invoices not found' });
      }

      const preInvoiceIdList = preInvoices.map((pre) => pre._id);
      const items = await PreInvoiceItem.find({ preInvoiceId: { $in: preInvoiceIdList } }).lean();
      if (!items.length) {
        return res.status(400).json({ message: 'Missing pre-invoice items' });
      }

      const itemsByPreInvoiceId = new Map();
      (items || []).forEach((item) => {
        const key = String(item.preInvoiceId || '');
        if (!key) return;
        if (!itemsByPreInvoiceId.has(key)) itemsByPreInvoiceId.set(key, []);
        itemsByPreInvoiceId.get(key).push({
          consignmentNumber: item.consignmentNumber,
          shipmentId: item.shipmentId,
          taxableValue: Number(item?.taxableValue ?? 0) || 0,
          igstPercent: Number(item?.igstPercent ?? 0) || 0,
          igstAmount: Number(item?.igstAmount ?? 0) || 0,
          finalAmount: Number(item?.finalAmount ?? 0) || 0,
          initialPaid: Number(item?.initialPaid ?? 0) || 0,
          charges: {
            odc: Number(item?.charges?.odc || 0),
            unloading: Number(item?.charges?.unloading || 0),
            docket: Number(item?.charges?.docket || 0),
            other: Number(item?.charges?.other || 0),
            ccc: Number(item?.charges?.ccc || 0),
            consignorDiscount: Number(item?.charges?.consignorDiscount || 0)
          }
        });
      });

      const billingEntityIds = preInvoices
        .map((pre) => String(pre?.billingEntityId || ''))
        .filter(Boolean);
      const [clients, hubs, guests] = await Promise.all([
        billingEntityIds.length
          ? Client.find({ _id: { $in: billingEntityIds } }).lean()
          : [],
        billingEntityIds.length
          ? Hub.find({ _id: { $in: billingEntityIds } }).lean()
          : [],
        billingEntityIds.length
          ? Guest.find({ _id: { $in: billingEntityIds } }).lean()
          : []
      ]);
      const nameById = new Map();
      const typeById = new Map();
      const addressById = new Map();
      const gstinById = new Map();
      (clients || []).forEach((client) => {
        if (!client?._id) return;
        const id = String(client._id);
        nameById.set(id, client.clientName || '');
        typeById.set(id, 'client');
        if (client?.GSTIN) gstinById.set(id, client.GSTIN);
        const location = client?.deliveryLocations?.length ? client.deliveryLocations[0] : null;
        const address = location ? formatLocation(location) : (client?.address || '');
        if (address) addressById.set(id, address);
      });
      (hubs || []).forEach((hub) => {
        if (!hub?._id) return;
        const id = String(hub._id);
        nameById.set(id, hub.hubName || '');
        typeById.set(id, 'hub');
        const parts = [hub.address, hub.city, hub.state, hub.pinCode].filter(Boolean);
        if (parts.length) addressById.set(id, parts.join(', '));
      });
      (guests || []).forEach((guest) => {
        if (!guest?._id) return;
        const id = String(guest._id);
        nameById.set(id, guest.guestName || '');
        typeById.set(id, 'guest');
        const parts = [guest.address, guest.city, guest.state, guest.pinCode].filter(Boolean);
        if (parts.length) addressById.set(id, parts.join(', '));
      });

      const branchIdsForLabel = Array.from(
        new Set(
          preInvoices
            .map((pre) => String(pre?.originLocId || ''))
            .filter(Boolean)
        )
      );
      const branchesForLabel = branchIdsForLabel.length
        ? await Branch.find({ _id: { $in: branchIdsForLabel }, GSTIN_ID: gstinId })
            .select('_id prefix branchName')
            .lean()
        : [];
      const branchLabelById = new Map(
        (branchesForLabel || []).map((b) => [
          String(b._id),
          String(b.prefix || b.branchName || '').trim()
        ])
      );
      const branchNameById = new Map(
        (branchesForLabel || []).map((b) => [String(b._id), b.branchName || ''])
      );

      const company = await User.findById(gstinId).select('invoiceSerialScope').lean();
      const invoiceSerialScope =
        normalizeInvoiceSerialScope(company?.invoiceSerialScope) || 'company';
      const branchScoped = invoiceSerialScope === 'branch';

      const { label: fiscalYear, start: fiscalYearStart } = getFiscalYearWindow();
      const yearToken = String((fiscalYearStart?.getFullYear?.() || new Date().getFullYear()) + 1)
        .slice(-2);
      const categories = Array.from(
        new Set(
          preInvoices
            .map((pre) => String(pre?.billingCategory || 'B').trim().toUpperCase() || 'B')
        )
      );
      if (!categories.length) categories.push('B');

      let nextNumberBySeries = new Map();

      if (branchScoped) {
        const branchObjectIds = branchIdsForLabel
          .filter((id) => mongoose.Types.ObjectId.isValid(id))
          .map((id) => new mongoose.Types.ObjectId(id));
        const lastByBranch = branchObjectIds.length
          ? await GeneratedInvoice.aggregate([
              {
                $match: {
                  GSTIN_ID: gstinId,
                  fiscalYear,
                  invoiceSerialScope: 'branch',
                  originLocId: { $in: branchObjectIds }
                }
              },
              {
                $addFields: {
                  billingCategorySafe: {
                    $cond: [
                      { $in: ['$billingCategory', ['B', 'C']] },
                      '$billingCategory',
                      'B'
                    ]
                  }
                }
              },
              {
                $group: {
                  _id: { originLocId: '$originLocId', billingCategory: '$billingCategorySafe' },
                  maxNumber: { $max: '$invoiceNumber' }
                }
              }
            ])
          : [];
        nextNumberBySeries = new Map();
        branchIdsForLabel.forEach((id) => {
          categories.forEach((cat) => {
            nextNumberBySeries.set(`${id}::${cat}`, 0);
          });
        });
        lastByBranch.forEach((row) => {
          const originKey = String(row?._id?.originLocId || '');
          const categoryKey = String(row?._id?.billingCategory || 'B').toUpperCase();
          if (!originKey) return;
          nextNumberBySeries.set(`${originKey}::${categoryKey}`, Number(row.maxNumber) || 0);
        });
      } else {
        const lastByCategory = await GeneratedInvoice.aggregate([
          {
            $match: {
              GSTIN_ID: gstinId,
              fiscalYear,
              $or: [
                { invoiceSerialScope: 'company' },
                { invoiceSerialScope: { $exists: false } },
                { invoiceSerialScope: null },
                { invoiceSerialScope: '' }
              ]
            }
          },
          {
            $addFields: {
              billingCategorySafe: {
                $cond: [
                  { $in: ['$billingCategory', ['B', 'C']] },
                  '$billingCategory',
                  'B'
                ]
              }
            }
          },
          { $group: { _id: '$billingCategorySafe', maxNumber: { $max: '$invoiceNumber' } } }
        ]);
        nextNumberBySeries = new Map(categories.map((cat) => [cat, 0]));
        lastByCategory.forEach((row) => {
          const categoryKey = String(row?._id || 'B').toUpperCase();
          nextNumberBySeries.set(categoryKey, Number(row.maxNumber) || 0);
        });
      }

      const invoiceDocs = [];
      const updates = [];
      const clientIdSet = new Set((clients || []).map((c) => String(c._id)));

      for (const pre of preInvoices) {
        const preId = String(pre?._id || '');
        const consignments = itemsByPreInvoiceId.get(preId) || [];
        if (!consignments.length) continue;

        const originLocId = String(pre?.originLocId || '');
        const billingEntityId = pre?.billingEntityId || null;
        const billingCategory = String(pre?.billingCategory || 'B').trim().toUpperCase() || 'B';
        const seriesKey = branchScoped ? `${originLocId}::${billingCategory}` : billingCategory;
        const current = nextNumberBySeries.get(seriesKey) || 0;
        const invoiceNumber = current + 1;
        nextNumberBySeries.set(seriesKey, invoiceNumber);
        const branchLabel = branchLabelById.get(originLocId) || '';
        const branchToken = normalizeInvoiceBranchToken(branchLabel);
        const invoiceCode = buildInvoiceCode({
          yearToken,
          billingCategory,
          branchToken,
          invoiceNumber,
          branchScoped
        });
        const invoiceDisplayNumber = buildInvoiceDisplayNumber({
          yearToken,
          billingCategory,
          branchToken,
          invoiceNumber,
          branchScoped
        });
        const billingAddress = addressById.get(String(billingEntityId || '')) || '';
        const clientGSTIN = gstinById.get(String(billingEntityId || '')) || '';

        invoiceDocs.push({
          GSTIN_ID: gstinId,
          fiscalYear,
          fiscalYearStart,
          invoiceNumber,
          invoiceSerialScope: invoiceSerialScope,
          originLocId: branchScoped && mongoose.Types.ObjectId.isValid(originLocId) ? originLocId : undefined,
          billingCategory,
          invoiceCode,
          invoiceDisplayNumber,
          billingClientId: billingEntityId,
          clientGSTIN,
          billingAddress,
          consignments,
          createdBy: req.user.username || ''
        });

        const branchName = branchNameById.get(originLocId) || '';
        consignments.forEach((consignment) => {
          updates.push({
            updateOne: {
              filter: {
                GSTIN_ID: gstinId,
                consignmentNumber: consignment.consignmentNumber
              },
              update: {
                $set: {
                  shipmentStatus: 'Invoiced',
                  invoiceStatus: 'invoiced',
                  shipmentStatusDetails: branchName ? `/${branchName}` : ''
                }
              }
            }
          });
        });
      }

      let created = [];
      if (invoiceDocs.length) {
        try {
          created = await GeneratedInvoice.insertMany(invoiceDocs);
        } catch (err) {
          if (isDuplicateKeyError(err)) {
            return res.status(409).json({ message: GENERATED_INVOICE_DUPLICATE_MESSAGE });
          }
          throw err;
        }
      }
      if (updates.length) {
        await Shipment.bulkWrite(updates);
      }
      if (preInvoiceIdList.length) {
        await PreInvoice.updateMany(
          { _id: { $in: preInvoiceIdList }, GSTIN_ID: gstinId, status: { $ne: 'deleted' } },
          { $set: { status: 'invoiced' } }
        );
      }

      const clientIds = Array.from(
        new Set(
          invoiceDocs
            .map((inv) => String(inv.billingClientId || ''))
            .filter((id) => clientIdSet.has(id))
        )
      );
      if (clientIds.length) {
        await syncPaymentsFromGeneratedInvoices(gstinId, clientIds);
      }

      return res.json({
        message: 'Invoices generated',
        invoices: created
      });
    }

    const missingBillingClient = shipments
      .filter((s) => !s.billingClientId)
      .map((s) => s.consignmentNumber);
    if (missingBillingClient.length) {
      return res.status(400).json({
        message: 'Missing billing client for consignments',
        consignments: missingBillingClient
      });
    }

    const consignmentCategoryByNumber = new Map();
    const preInvoiceItems = await PreInvoiceItem.find({
      consignmentNumber: { $in: consignmentNumbers }
    }).select('preInvoiceId consignmentNumber').lean();
    if (preInvoiceItems.length) {
      const preInvoiceIds = Array.from(
        new Set(
          (preInvoiceItems || [])
            .map((item) => String(item?.preInvoiceId || ''))
            .filter((id) => mongoose.Types.ObjectId.isValid(id))
        )
      );
      const preInvoices = preInvoiceIds.length
        ? await PreInvoice.find({ _id: { $in: preInvoiceIds }, GSTIN_ID: gstinId })
            .select('_id billingCategory')
            .lean()
        : [];
      const categoryByPreId = new Map(
        (preInvoices || []).map((pre) => [
          String(pre._id),
          String(pre?.billingCategory || 'B').trim().toUpperCase() || 'B'
        ])
      );
      preInvoiceItems.forEach((item) => {
        const category = categoryByPreId.get(String(item?.preInvoiceId || '')) || '';
        if (!category) return;
        consignmentCategoryByNumber.set(String(item.consignmentNumber || ''), category);
      });
    }

    const billingClientIds = Array.from(
      new Set(
        shipments
          .map((s) => String(s.billingClientId || ''))
          .filter(Boolean)
      )
    );
    const clients = billingClientIds.length
      ? await Client.find({ _id: { $in: billingClientIds } }).lean()
      : [];
    const clientsById = new Map((clients || []).map((c) => [String(c._id), c]));

    const billingCategoryById = new Map();
    if (billingClientIds.length) {
      const uniqueBillingIds = Array.from(new Set(billingClientIds));
      const pairs = await Promise.all(
        uniqueBillingIds.map(async (id) => {
          const category = await resolveBillingCategory(id, gstinId);
          return [id, category];
        })
      );
      pairs.forEach(([id, category]) => {
        billingCategoryById.set(String(id), String(category || 'B').trim().toUpperCase() || 'B');
      });
    }

    shipments.forEach((s) => {
      const consignmentKey = String(s.consignmentNumber || '');
      const fromPre = consignmentCategoryByNumber.get(consignmentKey);
      const fromEntity = billingCategoryById.get(String(s.billingClientId || ''));
      s._billingCategory = (fromPre || fromEntity || 'B');
    });

    const missingBillingLocation = [];
    shipments.forEach((s) => {
      if (s.billingLocationId) return;
      const client = clientsById.get(String(s.billingClientId || ''));
      const fallback = client?.deliveryLocations?.[0] || null;
      const fallbackId = fallback?.delivery_id || fallback?._id || fallback?.id || '';
      if (fallbackId) {
        s.billingLocationId = fallbackId;
        s._resolvedBillingLocationId = fallbackId;
      } else {
        missingBillingLocation.push(s.consignmentNumber);
      }
    });
    if (missingBillingLocation.length) {
      return res.status(400).json({
        message: 'Missing billing location for consignments',
        consignments: missingBillingLocation
      });
    }

    const company = await User.findById(gstinId).select('invoiceSerialScope').lean();
    const invoiceSerialScope =
      normalizeInvoiceSerialScope(company?.invoiceSerialScope) || 'company';
    const branchScoped = invoiceSerialScope === 'branch';

    const hubIds = shipments
      .filter((s) => normalizeOriginType(s?.originType) === 'hub')
      .map((s) => String(s.originLocId || ''))
      .filter(Boolean);
    const hubs = hubIds.length
      ? await Hub.find({ _id: { $in: hubIds }, GSTIN_ID: gstinId }).select('_id originLocId').lean()
      : [];
    const hubOriginById = new Map(
      (hubs || []).map((h) => [String(h._id), String(h.originLocId || '')])
    );

    const missingBranch = [];
    shipments.forEach((s) => {
      const originType = normalizeOriginType(s?.originType);
      const branchId = originType === 'hub'
        ? (hubOriginById.get(String(s.originLocId || '')) || '')
        : String(s.originLocId || '');
      s._invoiceOriginLocId = branchId;
      if (branchScoped && !branchId) {
        missingBranch.push(s.consignmentNumber);
      }
    });
    if (branchScoped && missingBranch.length) {
      return res.status(400).json({
        message: 'Missing branch for consignments',
        consignments: missingBranch
      });
    }

    const branchIdsForLabel = Array.from(
      new Set(
        shipments
          .map((s) => String(s._invoiceOriginLocId || ''))
          .filter(Boolean)
      )
    );
    const branchesForLabel = branchIdsForLabel.length
      ? await Branch.find({ _id: { $in: branchIdsForLabel }, GSTIN_ID: gstinId })
          .select('_id prefix branchName')
          .lean()
      : [];
    const branchLabelById = new Map(
      (branchesForLabel || []).map((b) => [
        String(b._id),
        String(b.prefix || b.branchName || '').trim()
      ])
    );

    const originNameById = await buildOriginNameMap(
      shipments.map((s) => s.originLocId || s.originLocId|| s.originLocId)
    );
    const groups = new Map();
    for (const shipment of shipments) {
      const categoryKey = String(shipment?._billingCategory || 'B').trim().toUpperCase() || 'B';
      const key = branchScoped
        ? `${buildBillingKey(shipment)}::${shipment._invoiceOriginLocId || ''}::${categoryKey}`
        : `${buildBillingKey(shipment)}::${categoryKey}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(shipment);
    }

    const { label: fiscalYear, start: fiscalYearStart } = getFiscalYearWindow();
    const yearToken = String((fiscalYearStart?.getFullYear?.() || new Date().getFullYear()) + 1)
      .slice(-2);
    const categories = Array.from(
      new Set(
        shipments.map((s) => String(s?._billingCategory || 'B').trim().toUpperCase() || 'B')
      )
    );
    if (!categories.length) categories.push('B');

    let nextNumberBySeries = new Map();

    if (branchScoped) {
      const branchIds = Array.from(
        new Set(
          shipments
            .map((s) => String(s._invoiceOriginLocId || ''))
            .filter(Boolean)
        )
      );
      const branchObjectIds = branchIds
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));
      const lastByBranch = branchObjectIds.length
        ? await GeneratedInvoice.aggregate([
            {
              $match: {
                GSTIN_ID: gstinId,
                fiscalYear,
                invoiceSerialScope: 'branch',
                originLocId: { $in: branchObjectIds }
              }
            },
            {
              $addFields: {
                billingCategorySafe: {
                  $cond: [
                    { $in: ['$billingCategory', ['B', 'C']] },
                    '$billingCategory',
                    'B'
                  ]
                }
              }
            },
            {
              $group: {
                _id: { originLocId: '$originLocId', billingCategory: '$billingCategorySafe' },
                maxNumber: { $max: '$invoiceNumber' }
              }
            }
          ])
        : [];
      nextNumberBySeries = new Map();
      branchIds.forEach((id) => {
        categories.forEach((cat) => {
          nextNumberBySeries.set(`${id}::${cat}`, 0);
        });
      });
      lastByBranch.forEach((row) => {
        const originKey = String(row?._id?.originLocId || '');
        const categoryKey = String(row?._id?.billingCategory || 'B').toUpperCase();
        if (!originKey) return;
        nextNumberBySeries.set(`${originKey}::${categoryKey}`, Number(row.maxNumber) || 0);
      });
    } else {
      const lastByCategory = await GeneratedInvoice.aggregate([
        {
          $match: {
            GSTIN_ID: gstinId,
            fiscalYear,
            $or: [
              { invoiceSerialScope: 'company' },
              { invoiceSerialScope: { $exists: false } },
              { invoiceSerialScope: null },
              { invoiceSerialScope: '' }
            ]
          }
        },
        {
          $addFields: {
            billingCategorySafe: {
              $cond: [
                { $in: ['$billingCategory', ['B', 'C']] },
                '$billingCategory',
                'B'
              ]
            }
          }
        },
        { $group: { _id: '$billingCategorySafe', maxNumber: { $max: '$invoiceNumber' } } }
      ]);
      nextNumberBySeries = new Map(categories.map((cat) => [cat, 0]));
      lastByCategory.forEach((row) => {
        const categoryKey = String(row?._id || 'B').toUpperCase();
        nextNumberBySeries.set(categoryKey, Number(row.maxNumber) || 0);
      });
    }

    const invoiceDocs = [];
    const updates = [];

    for (const group of groups.values()) {
      const first = group[0] || {};
      const originLocId = String(first?._invoiceOriginLocId || '');
      const billingClientId = first.billingClientId || null;
      const billingLocationId = first.billingLocationId || null;
      const billingCategory = String(first?._billingCategory || 'B').trim().toUpperCase() || 'B';
      const seriesKey = branchScoped ? `${originLocId}::${billingCategory}` : billingCategory;
      const current = nextNumberBySeries.get(seriesKey) || 0;
      const invoiceNumber = current + 1;
      nextNumberBySeries.set(seriesKey, invoiceNumber);
      const branchLabel = branchLabelById.get(originLocId) || '';
      const branchToken = normalizeInvoiceBranchToken(branchLabel);
      const invoiceCode = buildInvoiceCode({
        yearToken,
        billingCategory,
        branchToken,
        invoiceNumber,
        branchScoped
      });
      const invoiceDisplayNumber = buildInvoiceDisplayNumber({
        yearToken,
        billingCategory,
        branchToken,
        invoiceNumber,
        branchScoped
      });
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
        invoiceNumber,
        invoiceSerialScope: invoiceSerialScope,
        originLocId: branchScoped && mongoose.Types.ObjectId.isValid(originLocId) ? originLocId : undefined,
        billingCategory,
        invoiceCode,
        invoiceDisplayNumber,
        billingClientId,
        billingLocationId,
        clientGSTIN: client?.GSTIN || '',
        billingAddress,
        consignments,
        createdBy: req.user.username || ''
      });

      group.forEach((shipment) => {
        const originKey = String(
          shipment.originLocId || shipment.originLocId|| shipment.originLocId || ''
        );
        const branchName = originNameById.get(originKey) || '';
        const updateSet = {
          shipmentStatus: 'Invoiced',
          invoiceStatus: 'invoiced',
          shipmentStatusDetails: branchName ? `/${branchName}` : ''
        };
        if (shipment._resolvedBillingLocationId) {
          updateSet.billingLocationId = shipment._resolvedBillingLocationId;
        }
        updates.push({
          updateOne: {
            filter: {
              GSTIN_ID: gstinId,
              consignmentNumber: shipment.consignmentNumber
            },
            update: {
              $set: updateSet
            }
          }
        });
      });
    }

    let created = [];
    if (invoiceDocs.length) {
      try {
        created = await GeneratedInvoice.insertMany(invoiceDocs);
      } catch (err) {
        if (isDuplicateKeyError(err)) {
          return res.status(409).json({ message: GENERATED_INVOICE_DUPLICATE_MESSAGE });
        }
        throw err;
      }
    }
    if (updates.length) {
      await Shipment.bulkWrite(updates);
    }
    if (consignmentNumbers.length) {
      const preInvoiceItems = await PreInvoiceItem.find({
        consignmentNumber: { $in: consignmentNumbers }
      }).select('preInvoiceId').lean();
      const preInvoiceIds = Array.from(
        new Set(
          (preInvoiceItems || [])
            .map((item) => String(item?.preInvoiceId || ''))
            .filter((id) => mongoose.Types.ObjectId.isValid(id))
        )
      );
      if (preInvoiceIds.length) {
        await PreInvoice.updateMany(
          { _id: { $in: preInvoiceIds }, GSTIN_ID: gstinId, status: { $ne: 'deleted' } },
          { $set: { status: 'invoiced' } }
        );
      }
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

// Generate pre-invoice (single billing entity)
router.post('/preInvoices', requireAuth, async (req, res) => {
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

    const foundNumbers = new Set(shipments.map((s) => String(s.consignmentNumber || '').trim()));
    const missing = consignmentNumbers.filter((c) => !foundNumbers.has(c));
    if (missing.length) {
      return res.status(404).json({ message: 'Consignments not found', consignments: missing });
    }

    const missingBilling = shipments
      .filter((s) => !s.billingClientId)
      .map((s) => s.consignmentNumber);
    if (missingBilling.length) {
      return res.status(400).json({
        message: 'Missing billing entity for consignments',
        consignments: missingBilling
      });
    }

    const billingIds = new Set(shipments.map((s) => String(s.billingClientId || '')).filter(Boolean));
    if (billingIds.size > 1) {
      return res.status(400).json({ message: 'Different Billing Entity' });
    }

    const hubIds = shipments
      .filter((s) => normalizeOriginType(s?.originType) === 'hub')
      .map((s) => String(s.originLocId || ''))
      .filter(Boolean);
    const hubs = hubIds.length
      ? await Hub.find({ _id: { $in: hubIds }, GSTIN_ID: gstinId }).select('_id originLocId').lean()
      : [];
    const hubOriginById = new Map((hubs || []).map((h) => [String(h._id), String(h.originLocId || '')]));

    const branchIds = new Set();
    const missingBranch = [];
    shipments.forEach((s) => {
      if (normalizeOriginType(s?.originType) === 'hub') {
        const branchId = hubOriginById.get(String(s.originLocId || '')) || '';
        if (branchId) {
          branchIds.add(branchId);
        } else {
          missingBranch.push(s.consignmentNumber);
        }
      } else {
        const branchId = String(s.originLocId || '');
        if (branchId) {
          branchIds.add(branchId);
        } else {
          missingBranch.push(s.consignmentNumber);
        }
      }
    });

    if (missingBranch.length) {
      return res.status(400).json({
        message: 'Missing branch for consignments',
        consignments: missingBranch
      });
    }
    if (branchIds.size > 1) {
      return res.status(400).json({ message: 'Different Branch' });
    }
    const originLocId = Array.from(branchIds)[0];

    const billingEntityId = shipments[0]?.billingClientId || null;
    const billingCategory = await resolveBillingCategory(billingEntityId, gstinId);

    const lastPreInvoice = await PreInvoice.findOne({ GSTIN_ID: gstinId, originLocId, billingCategory })
      .sort({ preInvoiceNumber: -1 })
      .select('preInvoiceNumber')
      .lean();
    let nextNumber = Number(lastPreInvoice?.preInvoiceNumber) || 0;
    nextNumber += 1;

    const created = await PreInvoice.create({
      GSTIN_ID: gstinId,
      originLocId,
      billingEntityId,
      billingCategory,
      preInvoiceNumber: nextNumber,
      createdBy: req.user.username || ''
    });

      const items = shipments.map((s) => {
        const taxableValue = Number(s.taxableValue || 0);
        const igstPercent = Number(s.igstPercent || 0);
        const igstAmount = taxableValue * (igstPercent / 100);
        const finalAmount = Number(s.finalAmount || 0) || (taxableValue + igstAmount);
        const charges = s.charges || {};
        return {
          preInvoiceId: created._id,
          shipmentId: s._id,
          consignmentNumber: String(s.consignmentNumber || ''),
          taxableValue,
          igstPercent,
          igstAmount,
          finalAmount,
          initialPaid: Number(s.initialPaid || 0),
          charges: {
            odc: Number(charges?.odc || 0),
            unloading: Number(charges?.unloading || 0),
            docket: Number(charges?.docket || 0),
            other: Number(charges?.other || 0),
            ccc: Number(charges?.ccc || 0),
            consignorDiscount: Number(charges?.consignorDiscount || 0)
          }
        };
      });

    if (items.length) {
      await PreInvoiceItem.insertMany(items);
    }

    await Shipment.updateMany(
      { GSTIN_ID: gstinId, consignmentNumber: { $in: consignmentNumbers } },
      { $set: { invoiceStatus: 'pre-invoiced' } }
    );

    res.json({ message: 'Pre-invoice created', preInvoice: created });
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
    const billingEntityIds = invoices
      .map((inv) => String(inv?.billingClientId || ''))
      .filter(Boolean);
    const [clients, hubs, guests] = await Promise.all([
      billingEntityIds.length
        ? Client.find({ _id: { $in: billingEntityIds } }).lean()
        : [],
      billingEntityIds.length
        ? Hub.find({ _id: { $in: billingEntityIds } }).lean()
        : [],
      billingEntityIds.length
        ? Guest.find({ _id: { $in: billingEntityIds } }).lean()
        : []
    ]);
    const nameById = new Map();
    const typeById = new Map();
    const gstinById = new Map();
    (clients || []).forEach((client) => {
      if (!client?._id) return;
      const id = String(client._id);
      nameById.set(id, client.clientName || '');
      typeById.set(id, 'client');
      if (client?.GSTIN) gstinById.set(id, client.GSTIN);
    });
    (hubs || []).forEach((hub) => {
      if (!hub?._id) return;
      const id = String(hub._id);
      if (!nameById.has(id)) nameById.set(id, hub.hubName || '');
      if (!typeById.has(id)) typeById.set(id, 'hub');
    });
    (guests || []).forEach((guest) => {
      if (!guest?._id) return;
      const id = String(guest._id);
      if (!nameById.has(id)) nameById.set(id, guest.guestName || '');
      if (!typeById.has(id)) typeById.set(id, 'guest');
    });

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
      clientName: nameById.get(String(inv.billingClientId || '')) || '',
      billingEntityType: typeById.get(String(inv.billingClientId || '')) || '',
      clientGSTIN: inv.clientGSTIN || gstinById.get(String(inv.billingClientId || '')) || '',
      consignments: (inv.consignments || []).map((c) => {
        const shipment = shipmentsByNumber.get(String(c.consignmentNumber)) || {};
        const fallbackTaxable = Number(shipment?.taxableValue || 0);
        const fallbackIgst = Number(shipment?.igstPercent || 0);
        return {
          ...c,
          consignor: shipment.consignor || '',
          deliveryAddress: shipment.deliveryAddress || '',
          taxableValue: Number(c?.taxableValue ?? fallbackTaxable) || 0,
          igstPercent: Number(c?.igstPercent ?? fallbackIgst) || 0,
          igstAmount:
            Number(c?.igstAmount ?? 0) ||
            (fallbackTaxable * (fallbackIgst / 100)),
          finalAmount: Number(c?.finalAmount ?? shipment.finalAmount ?? 0) || 0,
          charges: c?.charges || shipment.charges || {},
          date: shipment.date || null
        };
      })
    }));

    res.json({ fiscalYear, gstPercent, invoices: response });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Soft-delete pre-invoices (and reset related shipments)
router.delete('/preInvoices', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const rawIds = Array.isArray(req.body?.preInvoiceIds) ? req.body.preInvoiceIds : [];
    const ids = rawIds
      .map((id) => String(id || '').trim())
      .filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (!ids.length) {
      return res.status(400).json({ message: 'Missing preInvoiceIds' });
    }

    const preInvoices = await PreInvoice.find({
      _id: { $in: ids },
      GSTIN_ID: gstinId
    }).select('_id status').lean();
    const preInvoiceIds = (preInvoices || []).map((p) => String(p._id || '')).filter(Boolean);
    if (!preInvoiceIds.length) {
      return res.status(404).json({ message: 'Pre-invoices not found' });
    }

    const items = await PreInvoiceItem.find({ preInvoiceId: { $in: preInvoiceIds } })
      .select('shipmentId consignmentNumber')
      .lean();
    const consignmentNumbers = Array.from(
      new Set((items || []).map((i) => String(i?.consignmentNumber || '')).filter(Boolean))
    );

    await PreInvoice.updateMany(
      { _id: { $in: preInvoiceIds }, GSTIN_ID: gstinId },
      { $set: { status: 'deleted' } }
    );

    if (consignmentNumbers.length) {
      await Shipment.updateMany(
        { GSTIN_ID: gstinId, consignmentNumber: { $in: consignmentNumbers }, invoiceStatus: 'pre-invoiced' },
        { $set: { invoiceStatus: 'onProcess' } }
      );
    }

    res.json({ success: true, deleted: preInvoiceIds.length });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// List pre-invoices for current company
router.get('/preInvoices', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const originLocId = String(req.query.originLocId || '').trim();
    const filter = { GSTIN_ID: gstinId };
    if (originLocId) {
      if (!mongoose.Types.ObjectId.isValid(originLocId)) {
        return res.status(400).json({ message: 'Invalid originLocId' });
      }
      filter.originLocId = originLocId;
    }

    const preInvoices = await PreInvoice.find(filter)
      .sort({ preInvoiceNumber: -1 })
      .lean();

    if (!preInvoices.length) {
      return res.json({ preInvoices: [] });
    }

    const preInvoiceIds = preInvoices.map((pre) => pre._id);
    const items = await PreInvoiceItem.find({ preInvoiceId: { $in: preInvoiceIds } }).lean();
    const shipmentIds = (items || [])
      .filter((item) => !item?.charges || item?.igstPercent === undefined || item?.igstAmount === undefined)
      .map((item) => String(item?.shipmentId || ''))
      .filter(Boolean);
    const shipments = shipmentIds.length
      ? await Shipment.find({ _id: { $in: shipmentIds }, GSTIN_ID: gstinId })
          .select('_id charges initialPaid taxableValue igstPercent finalAmount')
          .lean()
      : [];
    const shipmentById = new Map((shipments || []).map((s) => [String(s._id), s]));

    const itemsByPreInvoiceId = new Map();
    (items || []).forEach((item) => {
      const key = String(item.preInvoiceId || '');
      if (!key) return;
      if (!itemsByPreInvoiceId.has(key)) itemsByPreInvoiceId.set(key, []);
      const shipment = shipmentById.get(String(item?.shipmentId || ''));
      const charges = item?.charges || shipment?.charges || {};
      const taxableValue = Number(item?.taxableValue ?? shipment?.taxableValue ?? 0) || 0;
      const igstPercent = Number(item?.igstPercent ?? shipment?.igstPercent ?? 0) || 0;
      const igstAmount = Number(item?.igstAmount ?? 0) || (taxableValue * (igstPercent / 100));
      const finalAmount = Number(item?.finalAmount ?? shipment?.finalAmount ?? 0) || (taxableValue + igstAmount);
      itemsByPreInvoiceId.get(key).push({
        consignmentNumber: item.consignmentNumber,
        shipmentId: item.shipmentId,
        taxableValue,
        charges: {
          odc: Number(charges?.odc || 0),
          unloading: Number(charges?.unloading || 0),
          docket: Number(charges?.docket || 0),
          other: Number(charges?.other || 0),
          ccc: Number(charges?.ccc || 0),
          consignorDiscount: Number(charges?.consignorDiscount || 0)
        },
        initialPaid: Number(item?.initialPaid ?? shipment?.initialPaid ?? 0),
        igstPercent,
        igstAmount,
        finalAmount
      });
    });

    const billingEntityIds = preInvoices
      .map((pre) => String(pre?.billingEntityId || ''))
      .filter(Boolean);
    const [clients, hubs, guests] = await Promise.all([
      billingEntityIds.length
        ? Client.find({ _id: { $in: billingEntityIds } }).select('_id clientName').lean()
        : [],
      billingEntityIds.length
        ? Hub.find({ _id: { $in: billingEntityIds } }).select('_id hubName').lean()
        : [],
      billingEntityIds.length
        ? Guest.find({ _id: { $in: billingEntityIds } }).select('_id guestName').lean()
        : []
    ]);
    const nameById = new Map();
    const typeById = new Map();
    (clients || []).forEach((client) => {
      if (!client?._id) return;
      const id = String(client._id);
      nameById.set(id, client.clientName || '');
      typeById.set(id, 'client');
    });
    (hubs || []).forEach((hub) => {
      if (!hub?._id) return;
      const id = String(hub._id);
      if (!nameById.has(id)) nameById.set(id, hub.hubName || '');
      if (!typeById.has(id)) typeById.set(id, 'hub');
    });
    (guests || []).forEach((guest) => {
      if (!guest?._id) return;
      const id = String(guest._id);
      if (!nameById.has(id)) nameById.set(id, guest.guestName || '');
      if (!typeById.has(id)) typeById.set(id, 'guest');
    });

    const response = preInvoices.map((pre) => ({
      ...pre,
      billingEntityName: nameById.get(String(pre?.billingEntityId || '')) || '',
      billingEntityType: typeById.get(String(pre?.billingEntityId || '')) || '',
      consignments: itemsByPreInvoiceId.get(String(pre._id)) || []
    }));

    res.json({ preInvoices: response });
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

// Delete generated invoice and revert consignments
router.put('/generatedInvoices/:id/cancel', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const invoice = await GeneratedInvoice.findOne({ _id: req.params.id, GSTIN_ID: gstinId });
    if (!invoice) return res.status(404).json({ message: 'Generated invoice not found' });

    const currentStatus = String(invoice.status || '').trim().toLowerCase();
    if (currentStatus !== 'deleted') {
      invoice.status = 'deleted';
      await invoice.save();
    }

    const consignmentNumbers = (invoice.consignments || [])
      .map((c) => String(c?.consignmentNumber || '').trim())
      .filter(Boolean);

    if (consignmentNumbers.length) {
      const shipments = await Shipment.find({
        GSTIN_ID: gstinId,
        consignmentNumber: { $in: consignmentNumbers }
      })
        .select('consignmentNumber originLocId originLocIdoriginLocId')
        .lean();

      if (shipments.length) {
        const originNameById = await buildOriginNameMap(
          shipments.map((s) => s.originLocId || s.originLocId|| s.originLocId)
        );
        await Shipment.bulkWrite(
          shipments.map((shipment) => {
            const originKey = String(
              shipment.originLocId || shipment.originLocId|| shipment.originLocId || ''
            );
            const branchName = originNameById.get(originKey) || '';
            return {
              updateOne: {
                filter: {
                  GSTIN_ID: gstinId,
                  consignmentNumber: shipment.consignmentNumber
                },
                update: {
                  $set: {
                    shipmentStatus: 'Pre-Invoiced',
                    invoiceStatus: 'pre-invoiced',
                    shipmentStatusDetails: branchName ? `/${branchName}` : ''
                  }
                }
              }
            };
          })
        );
      }

      const preInvoiceItems = await PreInvoiceItem.find({
        consignmentNumber: { $in: consignmentNumbers }
      }).select('preInvoiceId').lean();
      const preInvoiceIds = Array.from(
        new Set(
          (preInvoiceItems || [])
            .map((item) => String(item?.preInvoiceId || ''))
            .filter((id) => mongoose.Types.ObjectId.isValid(id))
        )
      );
      if (preInvoiceIds.length) {
        await PreInvoice.updateMany(
          { _id: { $in: preInvoiceIds }, GSTIN_ID: gstinId, status: { $ne: 'deleted' } },
          { $set: { status: 'pre-invoiced' } }
        );
      }
    }

    const clientIds = invoice.billingClientId ? [String(invoice.billingClientId)] : [];
    if (clientIds.length) {
      await syncPaymentsFromGeneratedInvoices(gstinId, clientIds);
    }

    res.json({ message: 'Generated invoice deleted', invoice });
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

    if (['cancelled', 'deleted'].includes(String(invoice.status || '').toLowerCase())) {
      return res.status(400).json({ message: 'Deleted invoices cannot be updated' });
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
      const direction = 'receivable';
      const directionFilter = { $in: [direction, null] };
      let [summary, payment] = await Promise.all([
        PaymentEntitySummary.findOne({
          GSTIN_ID: gstinId,
          entityType: 'client',
          entityId: billingClientId,
          direction: directionFilter
        }),
        Payment.findOne({
          GSTIN_ID: gstinId,
          entityType: 'client',
          entityId: billingClientId,
          direction: directionFilter
        })
      ]);

      if (!summary) {
        const totalPaid = desired === 'Paid' ? invoiceTotal : 0;
        const totalBalance = Math.max(invoiceTotal - totalPaid, 0);
        summary = await PaymentEntitySummary.create({
          GSTIN_ID: gstinId,
          entityType: 'client',
          entityId: billingClientId,
          direction,
          totalDue: invoiceTotal,
          totalPaid,
          totalBalance,
          status: desired === 'Paid' ? 'Paid' : 'Pending'
        });
      }

      if (summary) {
        const totalPaid = Math.max(Number(summary.totalPaid || 0) + delta, 0);
        const totalDue = Number(summary.totalDue || 0);
        const totalBalance = Math.max(totalDue - totalPaid, 0);
        summary.totalPaid = totalPaid;
        summary.totalBalance = totalBalance;
        summary.status = desired === 'Paid' ? 'Paid' : 'Pending';
        summary.lastPaymentDate = desired === 'Paid' ? new Date() : summary.lastPaymentDate;
        summary.direction = direction;
        await summary.save();
      }

      if (!payment) {
        const amountPaid = desired === 'Paid' ? invoiceTotal : 0;
        const balance = Math.max(invoiceTotal - amountPaid, 0);
        payment = await Payment.create({
          GSTIN_ID: gstinId,
          entityType: 'client',
          entityId: billingClientId,
          direction,
          amountDue: invoiceTotal,
          amountPaid,
          balance,
          status: desired === 'Paid' ? 'Paid' : 'Pending',
          paymentDate: desired === 'Paid' ? new Date() : null
        });
      }

      if (payment) {
        const amountPaid = Math.max(Number(payment.amountPaid || 0) + delta, 0);
        const amountDue = Number(payment.amountDue || 0);
        const balance = Math.max(amountDue - amountPaid, 0);
        payment.amountPaid = amountPaid;
        payment.balance = balance;
        payment.status = desired === 'Paid' ? 'Paid' : 'Pending';
        payment.paymentDate = desired === 'Paid' ? new Date() : payment.paymentDate;
        payment.direction = direction;
        await payment.save();

        if (desired === 'Paid') {
          const referenceNo = invoice.invoiceNumber ? `INV-${invoice.invoiceNumber}` : undefined;
          await PaymentTransaction.create({
            paymentId: payment._id,
            invoiceId: invoice._id,
            direction: payment.direction || direction,
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
    const originId = String(req.query.originLocId || '').trim();
    if (!originId) {
      return res.status(400).json({ message: 'originLocId is required' });
    }
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });
    const wantsSummary = String(req.query.summary || '').toLowerCase() === 'true' || req.query.summary === '1';

    let shipments;
    const allowedoriginLocIds = getAllowedoriginLocIds(req);
    if (originId === 'all') {
      if (allowedoriginLocIds) {
        if (!allowedoriginLocIds.length) {
          return res.json([]);
        }
        const hubs = await Hub.find({ GSTIN_ID: gstinId, originLocId: { $in: allowedoriginLocIds } })
          .select('_id')
          .lean();
        const allowedHubIds = (hubs || []).map((h) => String(h?._id || '')).filter(Boolean);
        const allowedLocationIds = Array.from(new Set([...allowedoriginLocIds, ...allowedHubIds]));
        shipments = await Shipment.find({
          GSTIN_ID: gstinId,
          originLocId: { $in: allowedLocationIds }
        }).sort({ createdAt: -1 });
      } else {
        shipments = await Shipment.find({ GSTIN_ID: gstinId }).sort({ createdAt: -1 });
      }
    } else if (originId === 'all-hubs') {
      if (allowedoriginLocIds && !allowedoriginLocIds.length) {
        return res.json([]);
      }
      const hubQuery = { GSTIN_ID: gstinId };
      if (allowedoriginLocIds) {
        hubQuery.originLocId = { $in: allowedoriginLocIds };
      }
      const hubs = await Hub.find(hubQuery).select('_id').lean();
      const allowedHubIds = (hubs || []).map((h) => String(h?._id || '')).filter(Boolean);
      if (!allowedHubIds.length) {
        return res.json([]);
      }
      shipments = await Shipment.find({
        GSTIN_ID: gstinId,
        originType: 'hub',
        originLocId: { $in: allowedHubIds }
      }).sort({ createdAt: -1 });
    } else {
      const originResult = await resolveOriginId(originId, gstinId, allowedoriginLocIds);
      if (originResult.error) {
        return res.status(400).json({ message: originResult.error });
      }
      shipments = await Shipment.find({
        GSTIN_ID: gstinId,
        originType: originResult.originType,
        originLocId: originResult.originLocId
      }).sort({ createdAt: -1 });
    }

    if (wantsSummary) {
      const originNameMap = await buildOriginNameMap(shipments.map((s) => s.originLocId));
      const summary = shipments.map((shipment) => {
        const data = shipment.toObject ? shipment.toObject() : shipment;
        return {
          ...data,
          branchName: originNameMap.get(String(data?.originLocId || '')) || ''
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
    delete shipmentData.originLocId;
    delete shipmentData.branchName;
    if (!shipmentData.currentLocationId && shipmentData.currentoriginLocId) {
      shipmentData.currentLocationId = shipmentData.currentoriginLocId;
    }
    delete shipmentData.currentoriginLocId;
      if (shipmentData.paymentMode && !shipmentData.shipmentStatus) {
        shipmentData.shipmentStatus = shipmentData.paymentMode === 'To Pay' ? 'To Pay' : 'Pending';
      }
      const filter = shipmentId
        ? { _id: shipmentId, GSTIN_ID: gstinId }
        : { consignmentNumber: req.params.consignmentNumber, GSTIN_ID: gstinId };
      const existingShipment = await Shipment.findOne(filter)
        .select('shipmentStatus originLocId originType originLocIdoriginLocId')
        .lean();
      ensureOriginFromExisting(shipmentData, existingShipment);
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
      try {
        const hubExists = await Hub.findOne({ _id: hubId, GSTIN_ID: gstinId }).select('_id').lean();
        if (hubExists) {
          const referenceNo = `${String(shipment._id)}$$hubcharge`;
          const direction = 'payable';
          const directionFilter = { $in: [direction, null] };
          const paymentBaseFilter = {
            GSTIN_ID: gstinId,
            entityType: 'hub',
            entityId: hubId,
            referenceNo
          };
          let existingPayment = await Payment.findOne({
            ...paymentBaseFilter,
            direction: directionFilter
          }).lean();
          if (!existingPayment) {
            const fallbackPayments = await Payment.find(paymentBaseFilter)
              .sort({ updatedAt: -1, createdAt: -1 })
              .limit(2)
              .lean();
            if (fallbackPayments.length === 1) {
              existingPayment = fallbackPayments[0];
            }
          }
          const previousDue = Number(existingPayment?.amountDue || 0);
          const amountPaid = Number(existingPayment?.amountPaid || 0);
          const balance = Math.max(hubCharge - amountPaid, 0);
          const status = balance <= 0 ? 'Paid' : 'Pending';

          await Payment.updateOne(
            existingPayment?._id
              ? { _id: existingPayment._id }
              : {
                  ...paymentBaseFilter,
                  direction: directionFilter
                },
            {
              $set: {
                amountDue: hubCharge,
                amountPaid,
                balance,
                currency: 'rupees',
                status,
                direction,
                paymentMethod: 'payable',
                paymentDate: balance <= 0 ? new Date() : null
              },
              $setOnInsert: {
                GSTIN_ID: gstinId,
                entityType: 'hub',
                entityId: hubId,
                referenceNo,
                direction,
                notes: `Hub charge for consignment ${String(shipment.consignmentNumber || '')}`.trim()
              }
            },
            { upsert: true }
          );

          const summaryBaseFilter = {
            GSTIN_ID: gstinId,
            entityType: 'hub',
            entityId: hubId
          };
          let summary = await PaymentEntitySummary.findOne({
            ...summaryBaseFilter,
            direction: directionFilter
          });
          if (!summary) {
            const fallbackSummaries = await PaymentEntitySummary.find(summaryBaseFilter)
              .sort({ updatedAt: -1, createdAt: -1 })
              .limit(2);
            if (fallbackSummaries.length === 1) {
              summary = fallbackSummaries[0];
            }
          }
          if (!summary) {
            summary = await PaymentEntitySummary.create({
              GSTIN_ID: gstinId,
              entityType: 'hub',
              entityId: hubId,
              direction,
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
            summary.direction = direction;
            await summary.save();
          }
        }
      } catch (paymentErr) {
        console.error('Hub charge sync failed for consignment update:', paymentErr);
      }
    }

    const view = (await buildShipmentViews([shipment]))[0];
    res.json(view);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Delete shipment (and reverse initial-paid payment impact)
router.delete('/:consignmentNumber', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const shipmentIdRaw = String(req.query.shipmentId || req.body?.shipmentId || '').trim();
    const shipmentId = mongoose.Types.ObjectId.isValid(shipmentIdRaw) ? shipmentIdRaw : '';
    const filter = shipmentId
      ? { _id: shipmentId, GSTIN_ID: gstinId }
      : { consignmentNumber: req.params.consignmentNumber, GSTIN_ID: gstinId };

    const shipment = await Shipment.findOne(filter).lean();
    if (!shipment) return res.status(404).json({ message: 'Shipment not found' });

    const consignmentNumber = String(shipment?.consignmentNumber || '').trim();
    const shipmentObjectId = shipment?._id;
    if (!shipmentObjectId) {
      return res.status(400).json({ message: 'Invalid shipment id' });
    }

    const [hasManifestItems, hasActiveInvoice] = await Promise.all([
      ManifestItem.exists({
        $or: [
          { shipmentId: shipmentObjectId },
          ...(consignmentNumber ? [{ consignmentNumber }] : [])
        ]
      }),
      GeneratedInvoice.exists({
        GSTIN_ID: gstinId,
        status: { $nin: ['cancelled', 'deleted'] },
        ...(consignmentNumber ? { 'consignments.consignmentNumber': consignmentNumber } : {})
      })
    ]);

    if (hasManifestItems) {
      return res.status(409).json({
        message: 'Cannot delete consignment linked to a manifest. Remove it from manifest first.'
      });
    }
    if (hasActiveInvoice) {
      return res.status(409).json({
        message: 'Cannot delete consignment linked to an active invoice.'
      });
    }

    const preInvoiceItem = await PreInvoiceItem.findOne({
      $or: [
        { shipmentId: shipmentObjectId },
        ...(consignmentNumber ? [{ consignmentNumber }] : [])
      ]
    })
      .select('preInvoiceId')
      .lean();
    if (preInvoiceItem?.preInvoiceId) {
      const activePreInvoice = await PreInvoice.exists({
        _id: preInvoiceItem.preInvoiceId,
        GSTIN_ID: gstinId,
        status: { $ne: 'deleted' }
      });
      if (activePreInvoice) {
        return res.status(409).json({
          message: 'Cannot delete consignment linked to an active pre-invoice.'
        });
      }
    }

    const direction = 'receivable';
    const directionFilter = { $in: [direction, null] };
    const originReference = getOriginKey(shipment) || '';
    const referenceNo = `${originReference}$$${String(shipmentObjectId)}`;
    const initialPaidTxReference = `INITPAID-${String(shipmentObjectId)}`;

    const payment = await Payment.findOne({
      GSTIN_ID: gstinId,
      referenceNo,
      direction: directionFilter
    }).sort({ updatedAt: -1, createdAt: -1 });

    const paymentAdjustment = {
      dueRemoved: 0,
      paidRemoved: 0,
      voidedInitialPaidTransactions: 0
    };

    if (payment?._id) {
      const removedDue = Math.max(Number(payment.amountDue || 0), 0);
      const removedPaid = Math.max(Number(payment.amountPaid || 0), 0);
      const paymentEntityType = String(payment.entityType || 'client');
      const paymentEntityId = String(payment.entityId || '');

      const voidResult = await PaymentTransaction.updateMany(
        {
          paymentId: payment._id,
          method: 'Initial Paid',
          referenceNo: initialPaidTxReference,
          status: { $ne: 'voided' }
        },
        {
          $set: {
            status: 'voided',
            voidedAt: new Date(),
            voidReason: 'Shipment deleted'
          }
        }
      );

      const existingNotes = String(payment.notes || '').trim();
      const deleteNote = `Shipment deleted: ${consignmentNumber || String(shipmentObjectId)}`;
      payment.amountDue = 0;
      payment.amountPaid = 0;
      payment.balance = 0;
      payment.status = 'Paid';
      payment.paymentDate = null;
      payment.direction = direction;
      payment.paymentMethod = payment.paymentMethod || 'receivable';
      payment.notes = existingNotes
        ? `${existingNotes} | ${deleteNote}`
        : deleteNote;
      await payment.save();

      paymentAdjustment.dueRemoved = removedDue;
      paymentAdjustment.paidRemoved = removedPaid;
      paymentAdjustment.voidedInitialPaidTransactions = Number(voidResult?.modifiedCount || 0);

      if (paymentEntityId) {
        const summary = await PaymentEntitySummary.findOne({
          GSTIN_ID: gstinId,
          entityType: paymentEntityType,
          entityId: paymentEntityId,
          direction: directionFilter
        });
        if (summary) {
          const totalDue = Math.max(Number(summary.totalDue || 0) - removedDue, 0);
          const totalPaid = Math.max(Number(summary.totalPaid || 0) - removedPaid, 0);
          const totalBalance = Math.max(totalDue - totalPaid, 0);

          const entityPayments = await Payment.find({
            GSTIN_ID: gstinId,
            entityType: paymentEntityType,
            entityId: paymentEntityId,
            direction: directionFilter
          })
            .select('_id')
            .lean();
          const entityPaymentIds = (entityPayments || [])
            .map((p) => p?._id)
            .filter(Boolean);
          let latestPostedTx = null;
          if (entityPaymentIds.length) {
            latestPostedTx = await PaymentTransaction.findOne({
              paymentId: { $in: entityPaymentIds },
              status: { $ne: 'voided' }
            })
              .sort({ transactionDate: -1, createdAt: -1 })
              .select('transactionDate')
              .lean();
          }

          summary.totalDue = totalDue;
          summary.totalPaid = totalPaid;
          summary.totalBalance = totalBalance;
          summary.status = totalBalance <= 0 ? 'Paid' : 'Pending';
          summary.direction = direction;
          summary.lastPaymentDate = latestPostedTx?.transactionDate || null;
          await summary.save();
        }
      }
    }

    const ewaybills = await Ewaybill.find({ shipmentId: shipmentObjectId }).select('_id').lean();
    const ewaybillIds = (ewaybills || []).map((ewb) => ewb?._id).filter(Boolean);
    if (ewaybillIds.length) {
      const invoices = await Invoice.find({ ewaybillId: { $in: ewaybillIds } }).select('_id').lean();
      const invoiceIds = (invoices || []).map((inv) => inv?._id).filter(Boolean);
      if (invoiceIds.length) {
        await Promise.all([
          InvoiceProduct.deleteMany({ invoiceId: { $in: invoiceIds } }),
          InvoicePackage.deleteMany({ invoiceId: { $in: invoiceIds } })
        ]);
      }
      await Promise.all([
        Invoice.deleteMany({ ewaybillId: { $in: ewaybillIds } }),
        Ewaybill.deleteMany({ shipmentId: shipmentObjectId })
      ]);
    }

    await Shipment.deleteOne({ _id: shipmentObjectId, GSTIN_ID: gstinId });

    res.json({
      success: true,
      message: 'Shipment deleted and initial payment reversed.',
      shipmentId: String(shipmentObjectId),
      consignmentNumber,
      paymentAdjustment
    });
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
    if (!shipmentData.currentLocationId && shipmentData.currentoriginLocId) {
      shipmentData.currentLocationId = shipmentData.currentoriginLocId;
    }
    delete shipmentData.currentoriginLocId;
    if (shipmentData.paymentMode && !shipmentData.shipmentStatus) {
      shipmentData.shipmentStatus = shipmentData.paymentMode === 'To Pay' ? 'To Pay' : 'Pending';
    }
    const nextStatus = String(shipmentData.shipmentStatus || '').trim();
    if (['DPending', 'Delivered'].includes(nextStatus)) {
      shipmentData.currentVehicleNo = '';
      shipmentData.currentVehicleOwnerType = '';
      shipmentData.currentVehicleOwnerId = null;
    }
    const existingShipment = await Shipment.findOne({
      consignmentNumber: updatedConsignment.consignmentNumber,
      GSTIN_ID: gstinId
    }).lean();
    if (!existingShipment) return res.status(404).json({ message: 'Shipment not found' });
    ensureOriginFromExisting(shipmentData, existingShipment);
    const shipment = await Shipment.findOneAndUpdate(
      { consignmentNumber: updatedConsignment.consignmentNumber, GSTIN_ID: gstinId },
      shipmentData,
      { new: true }
    );
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

