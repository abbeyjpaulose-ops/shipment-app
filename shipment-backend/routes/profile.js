import express from 'express';
import Profile from '../models/Profile.js';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';

const router = express.Router();

async function recordAuditLog(payload) {
  try {
    await AuditLog.create(payload);
  } catch (err) {
    console.error('Audit log write failed:', err.message);
  }
}

function normalizeBusinessType(value) {
  const raw = String(value || '').trim();
  if (!raw) return { value: '', label: '' };
  const normalized = raw.toLowerCase();
  if (normalized.includes('gta') || normalized.includes('transport')) {
    return { value: '5', label: 'Goods Transport Agency (GTA) - 5%' };
  }
  if (normalized.includes('parcel')) {
    return { value: '12', label: 'Parcel - 12%' };
  }
  if (normalized.includes('courier')) {
    return { value: '18', label: 'Courier - 18%' };
  }
  if (raw === '5' || raw === '12' || raw === '18') {
    const labelMap = {
      '5': 'Goods Transport Agency (GTA) - 5%',
      '12': 'Parcel - 12%',
      '18': 'Courier - 18%'
    };
    return { value: raw, label: labelMap[raw] || raw };
  }
  return { value: raw, label: raw };
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

function toCompanyTypeLabel(value) {
  const info = normalizeBusinessType(value);
  if (info.value === '5') return 'Goods Transport Agency (GTA)';
  if (info.value === '12') return 'Parcel';
  if (info.value === '18') return 'Courier';
  return String(value || '').trim();
}

// Create or update profile
router.post('/save', requireAuth, requireAdmin, async (req, res) => {
  try {
    const invoiceSerialScope = normalizeInvoiceSerialScope(req.body?.invoiceSerialScope);
    console.log('📥 Incoming profile data:', req.body);

    // Upsert: if profile exists for email, update; otherwise create new
    const profile = await Profile.findOneAndUpdate(
      { email: req.body.email },
      req.body,
      { new: true, upsert: true }
    );

    if (req.body.businessType) {
      const nextType = toCompanyTypeLabel(req.body.businessType);
      const company = await User.findById(req.user.id).lean();
      const prevType = String(company?.companyType || '').trim();
      if (nextType && nextType !== prevType) {
        await User.findByIdAndUpdate(req.user.id, { companyType: nextType });
        await recordAuditLog({
          GSTIN_ID: Number(req.user.id),
          actorUserId: Number(req.user.userId),
          actorUsername: req.user.username,
          actorEmail: req.user.email,
          actorRole: req.user.role,
          action: 'businessType.update',
          entity: 'User',
          source: 'profile-save',
          before: { companyType: prevType },
          after: { companyType: nextType }
        });
      }
    }

    await User.findByIdAndUpdate(req.user.id, {
      email: String(req.body.email || '').trim() || undefined,
      phoneNumber: String(req.body.mobile || '').trim() || undefined,
      billingAddress: String(req.body.address || '').trim() || undefined,
      ...(invoiceSerialScope ? { invoiceSerialScope } : {})
    });

    const company = await User.findById(req.user.id).lean();
    const companyTypeInfo = normalizeBusinessType(company?.companyType);
    const resolvedSerialScope =
      normalizeInvoiceSerialScope(profile?.invoiceSerialScope || company?.invoiceSerialScope) ||
      'company';
    res.status(201).json({
      ...profile.toObject(),
      businessType: profile.businessType || companyTypeInfo.value || '',
      businessTypeLabel: companyTypeInfo.label || '',
      invoiceSerialScope: resolvedSerialScope,
      gstin: company?.GSTIN || ''
    });
  } catch (err) {
    console.error('❌ Error saving profile:', err.message);
    res.status(400).json({ message: err.message });
  }
});

// Get profile by email
router.get('/', requireAuth, async (req, res) => {
  try {
    const username = String(req.query.user || req.query.username || req.params.username || '').trim();
    const email = String(req.query.email || '').trim(); // frontend will send ?email=user@example.com
    const query = username ? { username } : email ? { email } : {};
    const profiles = await Profile.find(query).sort({ createdAt: -1 }).lean();
    const gstinId = Number(req.user?.id);
    const company = Number.isFinite(gstinId) ? await User.findById(gstinId).lean() : null;
    const resolvedSerialScope =
      normalizeInvoiceSerialScope(company?.invoiceSerialScope) || 'company';

    if (!profiles.length) {
      const userQuery = username ? { username } : email ? { email } : {};
      const user = Object.keys(userQuery).length ? await User.findOne(userQuery).lean() : company;
      if (!user) {
        res.json([]);
        return;
      }

      const companyTypeInfo = normalizeBusinessType(user.companyType);
      const fallback = {
        name: user.username || '',
        photo: '',
        address: user.billingAddress || '',
        company: user.companyName || '',
        mobile: user.phoneNumber || '',
        email: user.email || '',
        role: user.role || '',
        businessType: companyTypeInfo.value || '',
        businessTypeLabel: companyTypeInfo.label || '',
        invoiceSerialScope: resolvedSerialScope,
        GSTIN_ID: user._id,
        gstin: user.GSTIN || ''
      };
      res.json([fallback]);
      return;
    }

    const companyTypeInfo = normalizeBusinessType(company?.companyType);

    const enriched = profiles.map((p) => ({
      ...p,
      name: p.name || company?.username || '',
      address: p.address || company?.billingAddress || '',
      company: p.company || company?.companyName || '',
      mobile: p.mobile || company?.phoneNumber || '',
      email: p.email || company?.email || '',
      role: p.role || company?.role || '',
      businessType: p.businessType || companyTypeInfo.value || '',
      businessTypeLabel: companyTypeInfo.label || '',
      invoiceSerialScope:
        normalizeInvoiceSerialScope(p.invoiceSerialScope || company?.invoiceSerialScope) ||
        'company',
      gstin: company?.GSTIN || ''
    }));

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin-only: backfill businessType on profiles from company record
router.post('/migrateBusinessType', requireAuth, requireAdmin, async (req, res) => {
  try {
    const gstinId = Number(req.user?.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const company = await User.findById(gstinId).lean();
    const companyType = String(company?.companyType || '').trim();
    if (!companyType) {
      return res.status(400).json({ message: 'Missing companyType on company record' });
    }

    const result = await Profile.updateMany(
      {
        GSTIN_ID: gstinId,
        $or: [{ businessType: { $exists: false } }, { businessType: '' }, { businessType: null }]
      },
      { $set: { businessType: companyType } }
    );

    await recordAuditLog({
      GSTIN_ID: gstinId,
      actorUserId: Number(req.user.userId),
      actorUsername: req.user.username,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      action: 'businessType.backfill',
      entity: 'Profile',
      source: 'profile-migrate',
      metadata: {
        companyType,
        matched: result.matchedCount ?? result.n,
        modified: result.modifiedCount ?? result.nModified
      }
    });

    res.json({
      message: 'Profile businessType backfilled',
      matched: result.matchedCount ?? result.n,
      modified: result.modifiedCount ?? result.nModified
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update profile by ID
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const profile = await Profile.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, profile });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Delete profile by ID
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const profile = await Profile.findByIdAndDelete(req.params.id);
    if (!profile) return res.status(404).json({ message: 'Profile not found' });
    res.json({ success: true, message: 'Profile deleted' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

export default router;
