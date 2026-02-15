import express from 'express';
import bcrypt from 'bcrypt';
import User from '../models/User.js';
import Profile from '../models/Profile.js';
import Branch from '../models/Branch.js';
import Hub from '../models/Hub.js';
import Client from '../models/Client.js';
import Guest from '../models/Guest.js';
import Pkg from '../models/Pkg.js';
import Product from '../models/Product.js';
import RunningCostDay from '../models/RunningCostDay.js';
import TransportPartner from '../models/TransportPartner.js';
import AuditLog from '../models/AuditLog.js';
import Shipment from '../models/NewShipment/NewShipmentShipment.js';
import GeneratedInvoice from '../models/NewShipment/NewShipmentGeneratedInvoice.js';
import Finvoice from '../models/NewShipment/NewShipmentFinvoice.js';
import PreInvoice from '../models/NewShipment/NewShipmentPreInvoice.js';
import PreInvoiceItem from '../models/NewShipment/NewShipmentPreInvoiceItem.js';
import Ewaybill from '../models/NewShipment/NewShipmentEwaybill.js';
import Invoice from '../models/NewShipment/NewShipmentInvoice.js';
import InvoicePackage from '../models/NewShipment/NewShipmentInvoicePackage.js';
import InvoiceProduct from '../models/NewShipment/NewShipmentInvoiceProduct.js';
import Manifest from '../models/Manifest/Manifest.js';
import ManifestItem from '../models/Manifest/ManifestItem.js';
import Payment from '../models/Payment/Payment.js';
import PaymentEntitySummary from '../models/Payment/PaymentEntitySummary.js';
import PaymentTransaction from '../models/Payment/PaymentTransaction.js';
import PaymentAllocation from '../models/Payment/PaymentAllocation.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
import { ensureGSTINVerifiedOrThrow, normalizeGSTIN } from '../services/gstVerification.js';

const router = express.Router();

const normalizeText = (value) => String(value || '').trim();
const normalizeEmail = (value) => String(value || '').toLowerCase().trim();
const normalizeUsername = (value) => String(value || '').toLowerCase().trim();
const normalizeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

router.use(requireAuth, requireSuperAdmin);

router.get('/companies', async (_req, res) => {
  try {
    const companies = await User.find({ role: { $ne: 'super-admin' } })
      .select('_id GSTIN email username role companyName companyType phoneNumber billingAddress createdAt')
      .sort({ createdAt: -1 })
      .lean();

    const ids = companies.map((row) => Number(row?._id)).filter((id) => Number.isFinite(id));
    if (!ids.length) return res.json({ data: [] });

    const [profilesAgg, branchesAgg, hubsAgg] = await Promise.all([
      Profile.aggregate([{ $match: { GSTIN_ID: { $in: ids } } }, { $group: { _id: '$GSTIN_ID', count: { $sum: 1 } } }]),
      Branch.aggregate([{ $match: { GSTIN_ID: { $in: ids } } }, { $group: { _id: '$GSTIN_ID', count: { $sum: 1 } } }]),
      Hub.aggregate([{ $match: { GSTIN_ID: { $in: ids } } }, { $group: { _id: '$GSTIN_ID', count: { $sum: 1 } } }])
    ]);

    const profileCountById = new Map((profilesAgg || []).map((row) => [Number(row?._id), Number(row?.count || 0)]));
    const branchCountById = new Map((branchesAgg || []).map((row) => [Number(row?._id), Number(row?.count || 0)]));
    const hubCountById = new Map((hubsAgg || []).map((row) => [Number(row?._id), Number(row?.count || 0)]));

    const data = (companies || []).map((company) => {
      const gstinId = Number(company?._id);
      return {
        gstinId,
        GSTIN: company?.GSTIN || '',
        email: company?.email || '',
        username: company?.username || '',
        role: company?.role || 'admin',
        companyName: company?.companyName || '',
        companyType: company?.companyType || '',
        phoneNumber: company?.phoneNumber || '',
        billingAddress: company?.billingAddress || '',
        profileCount: Number(profileCountById.get(gstinId) || 0),
        branchCount: Number(branchCountById.get(gstinId) || 0),
        hubCount: Number(hubCountById.get(gstinId) || 0),
        createdAt: company?.createdAt || null
      };
    });

    return res.json({ data });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
});

router.post('/companies', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const username = normalizeUsername(req.body?.username);
    const password = String(req.body?.password || '');
    const role = normalizeText(req.body?.role || 'admin').toLowerCase();
    const gstinInput = normalizeText(req.body?.gstin);
    const companyName = normalizeText(req.body?.companyName);
    const billingAddress = normalizeText(req.body?.billingAddress);
    const companyType = normalizeText(req.body?.companyType);
    const phoneNumber = normalizeText(req.body?.phoneNumber);
    const taxPercent = normalizeNumber(req.body?.taxPercent, null);
    const creditDays = normalizeNumber(req.body?.creditDays, null);

    if (!email || !username || !password) {
      return res.status(400).json({ message: 'email, username, and password are required' });
    }
    if (role !== 'admin') {
      return res.status(400).json({ message: 'Only admin role is allowed for company creation' });
    }
    if (!gstinInput || !companyName || !billingAddress || !companyType || !phoneNumber) {
      return res.status(400).json({
        message: 'gstin, companyName, billingAddress, companyType, and phoneNumber are required'
      });
    }

    const verification = await ensureGSTINVerifiedOrThrow(gstinInput);
    const normalizedGSTIN = verification.normalizedGSTIN || normalizeGSTIN(gstinInput);

    const [existingUser, existingProfile] = await Promise.all([
      User.findOne({
        $or: [{ GSTIN: normalizedGSTIN }, { email }, { username }]
      }).lean(),
      Profile.findOne({
        $or: [{ email }, { username }]
      }).lean()
    ]);
    if (existingUser || existingProfile) {
      return res.status(409).json({ message: 'A user already exists with the same GSTIN/email/username' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      GSTIN: normalizedGSTIN,
      email,
      username,
      passwordHash,
      role: 'admin',
      companyName,
      companyType,
      phoneNumber,
      billingAddress,
      ...(taxPercent !== null ? { defaultTaxPercent: taxPercent } : {}),
      ...(creditDays !== null ? { defaultCreditDays: creditDays } : {}),
      gstVerification: {
        status: verification.status,
        verified: Boolean(verification.verified),
        verifiedAt: verification.verified ? new Date() : undefined,
        provider: process.env.GST_VERIFY_PROVIDER || undefined,
        referenceId: verification.referenceId
      }
    });

    const profile = await Profile.create({
      GSTIN_ID: user._id,
      originLocIds: [],
      originLocId: null,
      email,
      username,
      passwordHash,
      role: 'admin',
      isSuperAdminProvisioned: true,
      phoneNumber
    });

    return res.status(201).json({
      message: 'Company created',
      company: {
        gstinId: user._id,
        GSTIN: user.GSTIN,
        email: user.email,
        username: user.username,
        role: user.role,
        companyName: user.companyName,
        companyType: user.companyType,
        phoneNumber: user.phoneNumber,
        billingAddress: user.billingAddress
      },
      adminProfile: {
        userId: profile._id,
        email: profile.email,
        username: profile.username,
        role: profile.role
      }
    });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
});

router.delete('/companies/:id', async (req, res) => {
  try {
    const gstinId = Number(req.params.id);
    if (!Number.isFinite(gstinId)) {
      return res.status(400).json({ message: 'Invalid company id' });
    }
    if (Number(req.user?.id) === gstinId) {
      return res.status(400).json({ message: 'Cannot delete currently logged-in super admin account' });
    }

    const company = await User.findById(gstinId).lean();
    if (!company) return res.status(404).json({ message: 'Company not found' });
    if (String(company.role || '').toLowerCase() === 'super-admin') {
      return res.status(400).json({ message: 'Deleting super admin accounts is not allowed here' });
    }

    const [payments, manifests, preInvoices, shipments] = await Promise.all([
      Payment.find({ GSTIN_ID: gstinId }).select('_id').lean(),
      Manifest.find({ GSTIN_ID: gstinId }).select('_id').lean(),
      PreInvoice.find({ GSTIN_ID: gstinId }).select('_id').lean(),
      Shipment.find({ GSTIN_ID: gstinId }).select('_id').lean()
    ]);

    const paymentIds = (payments || []).map((row) => row?._id).filter(Boolean);
    const manifestIds = (manifests || []).map((row) => row?._id).filter(Boolean);
    const preInvoiceIds = (preInvoices || []).map((row) => row?._id).filter(Boolean);
    const shipmentIds = (shipments || []).map((row) => row?._id).filter(Boolean);

    const ewaybills = shipmentIds.length
      ? await Ewaybill.find({ shipmentId: { $in: shipmentIds } }).select('_id').lean()
      : [];
    const ewaybillIds = (ewaybills || []).map((row) => row?._id).filter(Boolean);

    const invoices = ewaybillIds.length
      ? await Invoice.find({ ewaybillId: { $in: ewaybillIds } }).select('_id').lean()
      : [];
    const invoiceIds = (invoices || []).map((row) => row?._id).filter(Boolean);

    const results = await Promise.all([
      invoiceIds.length ? InvoicePackage.deleteMany({ invoiceId: { $in: invoiceIds } }) : Promise.resolve({ deletedCount: 0 }),
      invoiceIds.length ? InvoiceProduct.deleteMany({ invoiceId: { $in: invoiceIds } }) : Promise.resolve({ deletedCount: 0 }),
      ewaybillIds.length ? Invoice.deleteMany({ ewaybillId: { $in: ewaybillIds } }) : Promise.resolve({ deletedCount: 0 }),
      shipmentIds.length ? Ewaybill.deleteMany({ shipmentId: { $in: shipmentIds } }) : Promise.resolve({ deletedCount: 0 }),
      ManifestItem.deleteMany({ manifestId: { $in: manifestIds } }),
      Manifest.deleteMany({ GSTIN_ID: gstinId }),
      PreInvoiceItem.deleteMany({ preInvoiceId: { $in: preInvoiceIds } }),
      PreInvoice.deleteMany({ GSTIN_ID: gstinId }),
      GeneratedInvoice.deleteMany({ GSTIN_ID: gstinId }),
      Finvoice.deleteMany({ GSTIN_ID: gstinId }),
      PaymentAllocation.deleteMany({ GSTIN_ID: gstinId }),
      paymentIds.length ? PaymentTransaction.deleteMany({ paymentId: { $in: paymentIds } }) : Promise.resolve({ deletedCount: 0 }),
      PaymentEntitySummary.deleteMany({ GSTIN_ID: gstinId }),
      Payment.deleteMany({ GSTIN_ID: gstinId }),
      Shipment.deleteMany({ GSTIN_ID: gstinId }),
      Client.deleteMany({ GSTIN_ID: gstinId }),
      Guest.deleteMany({ GSTIN_ID: gstinId }),
      Product.deleteMany({ GSTIN_ID: gstinId }),
      Pkg.deleteMany({ GSTIN_ID: gstinId }),
      Branch.deleteMany({ GSTIN_ID: gstinId }),
      Hub.deleteMany({ GSTIN_ID: gstinId }),
      TransportPartner.deleteMany({ GSTIN_ID: gstinId }),
      RunningCostDay.deleteMany({ GSTIN_ID: gstinId }),
      Profile.deleteMany({ GSTIN_ID: gstinId }),
      AuditLog.deleteMany({ GSTIN_ID: gstinId }),
      User.deleteOne({ _id: gstinId })
    ]);

    const [
      invoicePackagesDelete,
      invoiceProductsDelete,
      invoicesDelete,
      ewaybillsDelete,
      manifestItemsDelete,
      manifestsDelete,
      preInvoiceItemsDelete,
      preInvoicesDelete,
      generatedInvoicesDelete,
      finvoicesDelete,
      paymentAllocationsDelete,
      paymentTransactionsDelete,
      paymentSummariesDelete,
      paymentsDelete,
      shipmentsDelete,
      clientsDelete,
      guestsDelete,
      productsDelete,
      pkgsDelete,
      branchesDelete,
      hubsDelete,
      partnersDelete,
      runningCostsDelete,
      profilesDelete,
      auditLogsDelete,
      usersDelete
    ] = results;

    return res.json({
      message: 'Company deleted',
      deleted: {
        users: Number(usersDelete?.deletedCount || 0),
        profiles: Number(profilesDelete?.deletedCount || 0),
        branches: Number(branchesDelete?.deletedCount || 0),
        hubs: Number(hubsDelete?.deletedCount || 0),
        clients: Number(clientsDelete?.deletedCount || 0),
        guests: Number(guestsDelete?.deletedCount || 0),
        products: Number(productsDelete?.deletedCount || 0),
        packages: Number(pkgsDelete?.deletedCount || 0),
        shipments: Number(shipmentsDelete?.deletedCount || 0),
        ewaybills: Number(ewaybillsDelete?.deletedCount || 0),
        invoices: Number(invoicesDelete?.deletedCount || 0),
        invoicePackages: Number(invoicePackagesDelete?.deletedCount || 0),
        invoiceProducts: Number(invoiceProductsDelete?.deletedCount || 0),
        generatedInvoices: Number(generatedInvoicesDelete?.deletedCount || 0),
        preInvoices: Number(preInvoicesDelete?.deletedCount || 0),
        preInvoiceItems: Number(preInvoiceItemsDelete?.deletedCount || 0),
        finvoices: Number(finvoicesDelete?.deletedCount || 0),
        payments: Number(paymentsDelete?.deletedCount || 0),
        paymentTransactions: Number(paymentTransactionsDelete?.deletedCount || 0),
        paymentAllocations: Number(paymentAllocationsDelete?.deletedCount || 0),
        paymentSummaries: Number(paymentSummariesDelete?.deletedCount || 0),
        manifests: Number(manifestsDelete?.deletedCount || 0),
        manifestItems: Number(manifestItemsDelete?.deletedCount || 0),
        transportPartners: Number(partnersDelete?.deletedCount || 0),
        runningCosts: Number(runningCostsDelete?.deletedCount || 0),
        auditLogs: Number(auditLogsDelete?.deletedCount || 0)
      }
    });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
});

export default router;
