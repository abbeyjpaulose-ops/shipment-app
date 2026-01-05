import express from 'express';
import bcrypt from 'bcrypt';
import Profile from '../models/Profile.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';

const router = express.Router();

const normalizeEmail = (value) => String(value || '').toLowerCase().trim();
const normalizeText = (value) => String(value || '').trim();
const normalizeUsername = (value) => String(value || '').toLowerCase().trim();

router.use(requireAuth, requireAdmin);

// List users (profiles) under the admin's company (same GSTIN_ID)
router.get('/', async (req, res) => {
  try {
    const gstinId = Number(req.user.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const profiles = await Profile.find({ GSTIN_ID: gstinId }).sort({ _id: 1 });
    res.json(profiles);
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
    const branchInput = normalizeText(req.body.branch);
    const branchesInput = Array.isArray(req.body.branches) ? req.body.branches : null;

    if (!email || !username || !password) {
      return res.status(400).json({ message: 'email, username, and password are required' });
    }

    const existing = await Profile.findOne({ email });
    if (existing) return res.status(409).json({ message: 'User already exists for this email' });

    const passwordHash = await bcrypt.hash(password, 10);

    let branches =
      branchesInput?.map((b) => normalizeText(b)).filter(Boolean) ||
      (branchInput ? [branchInput] : []);

    if (String(role).toLowerCase() === 'admin') {
      branches = ['All Branches'];
    }

    if (!branches.length) return res.status(400).json({ message: 'branches is required' });

    const profile = await Profile.create({
      GSTIN_ID: gstinId,
      branches,
      branch: branches[0],
      email,
      username,
      passwordHash,
      role,
      phoneNumber
    });

    res.status(201).json(profile);
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

    if (req.body.branches !== undefined) {
      const branchesInput = Array.isArray(req.body.branches) ? req.body.branches : [];
      update.branches = branchesInput.map((b) => normalizeText(b)).filter(Boolean);
    } else if (req.body.branch !== undefined) {
      update.branches = [normalizeText(req.body.branch)].filter(Boolean);
    }

    if (isAdminRole) {
      update.branches = ['All Branches'];
      update.branch = 'All Branches';
    } else {
      if (update.branches && update.branches.length) {
        update.branch = update.branches[0];
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

    res.json(profile);
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
