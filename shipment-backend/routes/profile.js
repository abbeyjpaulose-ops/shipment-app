import express from 'express';
import Profile from '../models/Profile.js';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';

const router = express.Router();
const PROFILE_PUBLIC_FIELDS = '_id GSTIN_ID email username role phoneNumber businessType originLocId originLocIds isSuperAdminProvisioned createdAt updatedAt';

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

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeProfileId(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeProfileData(profile) {
  const safe = profile?.toObject ? profile.toObject() : { ...(profile || {}) };
  delete safe.passwordHash;
  return safe;
}

function pickProfileUpdate(rawBody = {}, { allowIdentity = false, allowRoleAndScope = false } = {}) {
  const update = {};
  if (allowIdentity) {
    if (rawBody.email !== undefined) update.email = normalizeEmail(rawBody.email);
    if (rawBody.username !== undefined) update.username = normalizeUsername(rawBody.username);
  }
  if (allowRoleAndScope) {
    if (rawBody.role !== undefined) update.role = String(rawBody.role || '').trim() || 'user';
    if (rawBody.originLocId !== undefined) {
      update.originLocId = String(rawBody.originLocId || '').trim() || null;
    }
    if (rawBody.originLocIds !== undefined) {
      update.originLocIds = Array.isArray(rawBody.originLocIds)
        ? rawBody.originLocIds.map((id) => String(id || '').trim()).filter(Boolean)
        : [];
      if (update.originLocIds.length && !update.originLocId) {
        update.originLocId = update.originLocIds[0];
      }
    }
  }
  if (rawBody.phoneNumber !== undefined || rawBody.mobile !== undefined) {
    update.phoneNumber = String(rawBody.phoneNumber ?? rawBody.mobile ?? '').trim();
  }
  if (rawBody.businessType !== undefined) {
    update.businessType = String(rawBody.businessType || '').trim();
  }

  delete update.passwordHash;
  delete update.GSTIN_ID;
  delete update.isSuperAdminProvisioned;
  delete update._id;
  return update;
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
    const gstinId = Number(req.user?.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const invoiceSerialScope = normalizeInvoiceSerialScope(req.body?.invoiceSerialScope);
    const targetEmail = normalizeEmail(req.body?.email || req.user?.email);
    const targetUsername = normalizeUsername(req.body?.username || req.user?.username);
    const profileFilter = {
      GSTIN_ID: gstinId,
      $or: [
        ...(targetEmail ? [{ email: targetEmail }] : []),
        ...(targetUsername ? [{ username: targetUsername }] : [])
      ]
    };

    const profileUpdate = pickProfileUpdate(req.body, { allowIdentity: true });
    let profile = null;
    if (profileFilter.$or.length && Object.keys(profileUpdate).length) {
      profile = await Profile.findOneAndUpdate(profileFilter, profileUpdate, { new: true })
        .select(PROFILE_PUBLIC_FIELDS);
    } else if (profileFilter.$or.length) {
      profile = await Profile.findOne(profileFilter).select(PROFILE_PUBLIC_FIELDS);
    }

    if (req.body.businessType) {
      const nextType = toCompanyTypeLabel(req.body.businessType);
      const company = await User.findById(gstinId).lean();
      const prevType = String(company?.companyType || '').trim();
      if (nextType && nextType !== prevType) {
        await User.findByIdAndUpdate(gstinId, { companyType: nextType });
        await recordAuditLog({
          GSTIN_ID: gstinId,
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

    await User.findByIdAndUpdate(gstinId, {
      email: String(req.body.email || '').trim() || undefined,
      phoneNumber: String(req.body.mobile || '').trim() || undefined,
      billingAddress: String(req.body.address || '').trim() || undefined,
      ...(invoiceSerialScope ? { invoiceSerialScope } : {})
    });

    const company = await User.findById(gstinId).lean();
    const companyTypeInfo = normalizeBusinessType(company?.companyType);
    const resolvedSerialScope =
      normalizeInvoiceSerialScope(profile?.invoiceSerialScope || company?.invoiceSerialScope) ||
      'company';

    res.status(201).json({
      ...sanitizeProfileData(profile),
      businessType: profile?.businessType || companyTypeInfo.value || '',
      businessTypeLabel: companyTypeInfo.label || '',
      invoiceSerialScope: resolvedSerialScope,
      gstin: company?.GSTIN || ''
    });
  } catch (err) {
    console.error('Error saving profile:', err.message);
    res.status(400).json({ message: err.message });
  }
});

// Get profile by email
router.get('/', requireAuth, async (req, res) => {
  try {
    const gstinId = Number(req.user?.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const username = normalizeUsername(req.query.user || req.query.username || req.params.username || '');
    const email = normalizeEmail(req.query.email || '');
    const query = { GSTIN_ID: gstinId };
    if (username) query.username = username;
    else if (email) query.email = email;

    const profiles = await Profile.find(query)
      .select(PROFILE_PUBLIC_FIELDS)
      .sort({ createdAt: -1 })
      .lean();
    const company = await User.findById(gstinId).lean();
    const resolvedSerialScope = normalizeInvoiceSerialScope(company?.invoiceSerialScope) || 'company';

    if (!profiles.length) {
      if (!company) {
        res.json([]);
        return;
      }

      const companyTypeInfo = normalizeBusinessType(company.companyType);
      const fallback = {
        name: company.username || '',
        photo: '',
        address: company.billingAddress || '',
        company: company.companyName || '',
        mobile: company.phoneNumber || '',
        email: company.email || '',
        role: company.role || '',
        businessType: companyTypeInfo.value || '',
        businessTypeLabel: companyTypeInfo.label || '',
        invoiceSerialScope: resolvedSerialScope,
        GSTIN_ID: company._id,
        gstin: company.GSTIN || ''
      };
      res.json([fallback]);
      return;
    }

    const companyTypeInfo = normalizeBusinessType(company?.companyType);

    const enriched = profiles.map((p) => {
      const safe = sanitizeProfileData(p);
      return {
        ...safe,
        name: safe.name || company?.username || '',
        address: safe.address || company?.billingAddress || '',
        company: safe.company || company?.companyName || '',
        mobile: safe.mobile || safe.phoneNumber || company?.phoneNumber || '',
        email: safe.email || company?.email || '',
        role: safe.role || company?.role || '',
        businessType: safe.businessType || companyTypeInfo.value || '',
        businessTypeLabel: companyTypeInfo.label || '',
        invoiceSerialScope:
          normalizeInvoiceSerialScope(safe.invoiceSerialScope || company?.invoiceSerialScope) ||
          'company',
        gstin: company?.GSTIN || ''
      };
    });

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
    const gstinId = Number(req.user?.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const profileId = normalizeProfileId(req.params.id);
    if (!Number.isFinite(profileId)) return res.status(400).json({ message: 'Invalid profile id' });

    const isAdmin = String(req.user?.role || '').trim().toLowerCase() === 'admin';
    const requesterUserId = Number(req.user?.userId);
    if (!isAdmin && requesterUserId !== profileId) {
      return res.status(403).json({ message: 'Profile access denied' });
    }

    const update = pickProfileUpdate(req.body, {
      allowIdentity: isAdmin,
      allowRoleAndScope: isAdmin
    });
    if (!Object.keys(update).length) {
      return res.status(400).json({ message: 'No updatable profile fields provided' });
    }

    const profile = await Profile.findOneAndUpdate(
      { _id: profileId, GSTIN_ID: gstinId },
      update,
      { new: true }
    ).select(PROFILE_PUBLIC_FIELDS);
    if (!profile) return res.status(404).json({ message: 'Profile not found' });

    res.json({ success: true, profile: sanitizeProfileData(profile) });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Delete profile by ID
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const gstinId = Number(req.user?.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const profileId = normalizeProfileId(req.params.id);
    if (!Number.isFinite(profileId)) return res.status(400).json({ message: 'Invalid profile id' });
    if (Number(req.user?.userId) === profileId) {
      return res.status(400).json({ message: 'Cannot delete your own profile' });
    }

    const profile = await Profile.findOne({ _id: profileId, GSTIN_ID: gstinId })
      .select('isSuperAdminProvisioned')
      .lean();
    if (!profile) return res.status(404).json({ message: 'Profile not found' });
    if (Boolean(profile.isSuperAdminProvisioned)) {
      return res.status(400).json({ message: 'Cannot delete super-admin provisioned profile' });
    }

    await Profile.deleteOne({ _id: profileId, GSTIN_ID: gstinId });
    res.json({ success: true, message: 'Profile deleted' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

export default router;
