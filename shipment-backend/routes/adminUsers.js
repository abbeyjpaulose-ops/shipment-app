import express from 'express';
import bcrypt from 'bcrypt';
import Profile from '../models/Profile.js';
import Branch from '../models/Branch.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';

const router = express.Router();

const normalizeEmail = (value) => String(value || '').toLowerCase().trim();
const normalizeText = (value) => String(value || '').trim();
const normalizeUsername = (value) => String(value || '').toLowerCase().trim();

async function withBranchNames(records = []) {
  const data = records.map((rec) => (rec?.toObject ? rec.toObject() : rec));
  const branchIds = Array.from(
    new Set(
      data
        .flatMap((rec) => [rec?.branchId, ...(rec?.branchIds || [])])
        .map((id) => String(id || ''))
        .filter(Boolean)
    )
  );
  const branches = branchIds.length
    ? await Branch.find({ _id: { $in: branchIds } }).select('_id branchName').lean()
    : [];
  const branchNameById = new Map((branches || []).map((b) => [String(b._id), b.branchName || '']));

  return data.map((rec) => {
    const isAdmin = String(rec?.role || '').toLowerCase() === 'admin';
    if (isAdmin) {
      return { ...rec, branchName: 'All Branches', branchNames: ['All Branches'] };
    }
    const branchName = branchNameById.get(String(rec?.branchId || '')) || '';
    const branchNames = (rec?.branchIds || [])
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

    const profiles = await Profile.find({ GSTIN_ID: gstinId }).sort({ _id: 1 }).lean();
    const withNames = await withBranchNames(profiles);
    res.json(withNames);
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
    const branchIdInput = normalizeText(req.body.branchId);
    const branchIdsInput = Array.isArray(req.body.branchIds) ? req.body.branchIds : null;

    if (!email || !username || !password) {
      return res.status(400).json({ message: 'email, username, and password are required' });
    }

    const existing = await Profile.findOne({ email });
    if (existing) return res.status(409).json({ message: 'User already exists for this email' });

    const passwordHash = await bcrypt.hash(password, 10);

    let branchIds =
      branchIdsInput?.map((b) => normalizeText(b)).filter(Boolean) ||
      (branchIdInput ? [branchIdInput] : []);

    if (String(role).toLowerCase() === 'admin') {
      branchIds = [];
    }

    if (!branchIds.length && String(role).toLowerCase() !== 'admin') {
      return res.status(400).json({ message: 'branchIds is required' });
    }

    const profile = await Profile.create({
      GSTIN_ID: gstinId,
      branchIds,
      branchId: branchIds[0],
      email,
      username,
      passwordHash,
      role,
      phoneNumber
    });

    const [withName] = await withBranchNames([profile]);
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

    if (req.body.branchIds !== undefined) {
      const branchIdsInput = Array.isArray(req.body.branchIds) ? req.body.branchIds : [];
      update.branchIds = branchIdsInput.map((b) => normalizeText(b)).filter(Boolean);
    } else if (req.body.branchId !== undefined) {
      update.branchIds = [normalizeText(req.body.branchId)].filter(Boolean);
    }

    if (isAdminRole) {
      update.branchIds = [];
      update.branchId = null;
    } else {
      if (update.branchIds && update.branchIds.length) {
        update.branchId = update.branchIds[0];
      }
    }

    if (req.body.password) {
      update.passwordHash = await bcrypt.hash(String(req.body.password), 10);
    }

    const profile = await Profile.findOneAndUpdate(
      { _id: userId, GSTIN_ID: gstinId },
      update,
      { new: true }
    );
    if (!profile) return res.status(404).json({ message: 'User not found' });

    const [withName] = await withBranchNames([profile]);
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
