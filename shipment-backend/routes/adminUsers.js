import express from 'express';
import bcrypt from 'bcrypt';
import Profile from '../models/Profile.js';
import Branch from '../models/Branch.js';
import User from '../models/User.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';

const router = express.Router();
const PROFILE_PUBLIC_FIELDS = '_id GSTIN_ID email username role phoneNumber originLocId originLocIds isSuperAdminProvisioned createdAt updatedAt';

const normalizeEmail = (value) => String(value || '').toLowerCase().trim();
const normalizeText = (value) => String(value || '').trim();
const normalizeUsername = (value) => String(value || '').toLowerCase().trim();

async function withBranchNames(records = [], gstinId = null) {
  const data = records
    .map((rec) => (rec?.toObject ? rec.toObject() : rec))
    .map((rec) => {
      const safe = { ...(rec || {}) };
      delete safe.passwordHash;
      return safe;
    });
  const originLocIds = Array.from(
    new Set(
      data
        .flatMap((rec) => [rec?.originLocId, ...(rec?.originLocIds || [])])
        .map((id) => String(id || ''))
        .filter(Boolean)
    )
  );
  const branches = originLocIds.length
    ? await Branch.find({
      _id: { $in: originLocIds },
      ...(Number.isFinite(gstinId) ? { GSTIN_ID: gstinId } : {})
    }).select('_id branchName').lean()
    : [];
  const branchNameById = new Map((branches || []).map((b) => [String(b._id), b.branchName || '']));

  return data.map((rec) => {
    const isAdmin = String(rec?.role || '').toLowerCase() === 'admin';
    if (isAdmin) {
      return { ...rec, branchName: 'All Branches', branchNames: ['All Branches'] };
    }
    const branchName = branchNameById.get(String(rec?.originLocId || '')) || '';
    const branchNames = (rec?.originLocIds || [])
      .map((id) => branchNameById.get(String(id)) || '')
      .filter(Boolean);
    return { ...rec, branchName, branchNames };
  });
}

router.use(requireAuth, requireAdmin);

// List users (profiles) under the admin's company (same GSTIN_ID)
router.get('/', async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const profiles = await Profile.find({ GSTIN_ID: gstinId })
      .select(PROFILE_PUBLIC_FIELDS)
      .sort({ _id: 1 })
      .lean();
    const company = await User.findById(gstinId).select('email username').lean();
    const companyEmail = normalizeEmail(company?.email);
    const companyUsername = normalizeUsername(company?.username);

    const withNames = await withBranchNames(profiles, gstinId);
    const enriched = (withNames || []).map((row) => {
      const role = String(row?.role || '').toLowerCase();
      const emailMatchesCompany = companyEmail && normalizeEmail(row?.email) === companyEmail;
      const usernameMatchesCompany = companyUsername && normalizeUsername(row?.username) === companyUsername;
      const isPrimaryAdmin = role === 'admin' && (emailMatchesCompany || usernameMatchesCompany);
      return {
        ...row,
        isSuperAdminProvisioned: Boolean(row?.isSuperAdminProvisioned || isPrimaryAdmin)
      };
    });
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create a new user (profile) under the same company
router.post('/', async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const email = normalizeEmail(req.body.email);
    const username = normalizeUsername(req.body.username);
    const password = String(req.body.password || '');
    const role = normalizeText(req.body.role) || 'user';
    const phoneNumber = normalizeText(req.body.phoneNumber);
    const originLocIdInput = normalizeText(req.body.originLocId);
    const originLocIdsInput = Array.isArray(req.body.originLocIds) ? req.body.originLocIds : null;

    if (!email || !username || !password) {
      return res.status(400).json({ message: 'email, username, and password are required' });
    }

    const existing = await Profile.findOne({ email });
    if (existing) return res.status(409).json({ message: 'User already exists for this email' });

    const passwordHash = await bcrypt.hash(password, 10);

    let originLocIds =
      originLocIdsInput?.map((b) => normalizeText(b)).filter(Boolean) ||
      (originLocIdInput ? [originLocIdInput] : []);

    if (String(role).toLowerCase() === 'admin') {
      originLocIds = [];
    }

    if (!originLocIds.length && String(role).toLowerCase() !== 'admin') {
      return res.status(400).json({ message: 'originLocIds is required' });
    }

    const profile = await Profile.create({
      GSTIN_ID: gstinId,
      originLocIds,
      originLocId: originLocIds[0],
      email,
      username,
      passwordHash,
      role,
      phoneNumber
    });

    const safeProfile = await Profile.findById(profile._id).select(PROFILE_PUBLIC_FIELDS);
    const [withName] = await withBranchNames([safeProfile || profile], gstinId);
    res.status(201).json(withName);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update a user (profile) under the same company
router.put('/:id', async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const userId = Number(req.params.id);
    if (!Number.isFinite(userId)) return res.status(400).json({ message: 'Invalid user_id' });

    const update = {};
    if (req.body.email !== undefined) update.email = normalizeEmail(req.body.email);
    if (req.body.username !== undefined) update.username = normalizeUsername(req.body.username);
    if (req.body.role !== undefined) update.role = normalizeText(req.body.role) || 'user';
    if (req.body.phoneNumber !== undefined) update.phoneNumber = normalizeText(req.body.phoneNumber);

    const role = update.role;
    const isAdminRole = String(role || '').toLowerCase() === 'admin';

    if (req.body.originLocIds !== undefined) {
      const originLocIdsInput = Array.isArray(req.body.originLocIds) ? req.body.originLocIds : [];
      update.originLocIds = originLocIdsInput.map((b) => normalizeText(b)).filter(Boolean);
    } else if (req.body.originLocId !== undefined) {
      update.originLocIds = [normalizeText(req.body.originLocId)].filter(Boolean);
    }

    if (isAdminRole) {
      update.originLocIds = [];
      update.originLocId = null;
    } else {
      if (update.originLocIds && update.originLocIds.length) {
        update.originLocId = update.originLocIds[0];
      }
    }

    if (req.body.password) {
      update.passwordHash = await bcrypt.hash(String(req.body.password), 10);
    }

    const profile = await Profile.findOneAndUpdate(
      { _id: userId, GSTIN_ID: gstinId },
      update,
      { new: true }
    ).select(PROFILE_PUBLIC_FIELDS);
    if (!profile) return res.status(404).json({ message: 'User not found' });

    const [withName] = await withBranchNames([profile], gstinId);
    res.json(withName);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Delete a user (profile) under the same company
router.delete('/:id', async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const userId = Number(req.params.id);
    if (!Number.isFinite(userId)) return res.status(400).json({ message: 'Invalid user_id' });

    const profile = await Profile.findOne({ _id: userId, GSTIN_ID: gstinId });
    if (!profile) return res.status(404).json({ message: 'User not found' });
    const company = await User.findById(gstinId).select('email username').lean();
    const companyEmail = normalizeEmail(company?.email);
    const companyUsername = normalizeUsername(company?.username);
    const isPrimaryAdmin =
      String(profile?.role || '').toLowerCase() === 'admin' &&
      (
        (companyEmail && normalizeEmail(profile?.email) === companyEmail) ||
        (companyUsername && normalizeUsername(profile?.username) === companyUsername)
      );
    if (Boolean(profile.isSuperAdminProvisioned || isPrimaryAdmin)) {
      return res.status(400).json({ message: 'Cannot delete super-admin provisioned admin user' });
    }
    if (normalizeEmail(profile.email) === normalizeEmail(req.user.email)) {
      return res.status(400).json({ message: 'Cannot delete your own admin user' });
    }

    await Profile.deleteOne({ _id: userId, GSTIN_ID: gstinId });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

export default router;
