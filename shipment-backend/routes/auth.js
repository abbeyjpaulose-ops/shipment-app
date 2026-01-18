import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Profile from '../models/Profile.js';
import AuditLog from '../models/AuditLog.js';
import Branch from '../models/Branch.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const normalizedUsername = String(username || '').toLowerCase().trim();
    if (!normalizedUsername || !password) {
      return res.status(400).json({ message: 'username and password are required' });
    }

    // Admin/company accounts live in User; regular users live in Profile.
    let accountType = 'user';
    let account = await User.findOne({ username: normalizedUsername });

    if (!account) {
      accountType = 'profile';
      account = await Profile.findOne({ username: normalizedUsername });
    }

    if (!account) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(String(password), account.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Always set `id` to GSTIN_ID (company id) so company-scoped APIs work for all users.
    const gstinId = accountType === 'profile' ? account.GSTIN_ID : account._id;
    const isAdmin = String(account.role || '').toLowerCase() === 'admin';
    const branchId =
      isAdmin
        ? 'all'
        : accountType === 'profile'
          ? account.branchId
          : 'all';
    const branchIds =
      isAdmin
        ? ['all']
        : accountType === 'profile'
          ? (Array.isArray(account.branchIds) && account.branchIds.length
            ? account.branchIds
            : (account.branchId ? [account.branchId] : []))
          : ['all'];

    let gstin = accountType === 'user' ? account.GSTIN : null;
    if (!gstin) {
      const company = await User.findById(gstinId);
      gstin = company?.GSTIN || null;
    }

    const token = jwt.sign(
      {
        id: gstinId,
        userId: account._id,
        username: account.username,
        role: account.role,
        email: account.email,
        accountType
      },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '1h' }
    );

    try {
      await AuditLog.create({
        GSTIN_ID: gstinId,
        actorUserId: Number(account._id),
        actorUsername: account.username,
        actorEmail: account.email,
        actorRole: account.role,
        action: 'auth.login',
        entity: accountType === 'user' ? 'User' : 'Profile',
        source: 'auth-login',
        metadata: {
          ip: req.ip,
          userAgent: req.get('user-agent') || ''
        }
      });
    } catch (err) {
      console.error('Audit log write failed:', err.message);
    }

    let branchName = '';
    let branchNames = [];
    if (branchId === 'all') {
      branchName = 'All Branches';
      branchNames = ['All Branches'];
    } else if (branchId) {
      const ids = Array.from(new Set([branchId, ...(branchIds || [])].map((id) => String(id))));
      const branches = await Branch.find({ _id: { $in: ids } }).select('_id branchName').lean();
      const branchNameById = new Map((branches || []).map((b) => [String(b._id), b.branchName || '']));
      branchName = branchNameById.get(String(branchId)) || '';
      branchNames = (branchIds || [])
        .map((id) => branchNameById.get(String(id)) || '')
        .filter(Boolean);
    }

    return res.json({
      token,
      username: account.username,
      role: account.role,
      email: account.email,
      accountType,
      branchId,
      branchIds,
      branchName,
      branchNames,
      GSTIN_ID: gstinId,
      GSTIN: gstin
    });
  } catch (err) {
    console.error('Error in /login route:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/logout', requireAuth, async (req, res) => {
  try {
    await AuditLog.create({
      GSTIN_ID: Number(req.user.id),
      actorUserId: Number(req.user.userId),
      actorUsername: req.user.username,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      action: 'auth.logout',
      entity: req.user.accountType === 'user' ? 'User' : 'Profile',
      source: 'auth-logout',
      metadata: {
        ip: req.ip,
        userAgent: req.get('user-agent') || ''
      }
    });
  } catch (err) {
    console.error('Audit log write failed:', err.message);
  }

  res.json({ success: true });
});

export default router;
