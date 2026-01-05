import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Profile from '../models/Profile.js';
import AuditLog from '../models/AuditLog.js';
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
    const branch =
      String(account.role || '').toLowerCase() === 'admin'
        ? 'All Branches'
        : accountType === 'profile'
          ? account.branch
          : 'All Branches';
    const branches =
      String(account.role || '').toLowerCase() === 'admin'
        ? ['All Branches']
        : accountType === 'profile'
          ? (Array.isArray(account.branches) && account.branches.length ? account.branches : (account.branch ? [account.branch] : []))
          : ['All Branches'];

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

    return res.json({
      token,
      username: account.username,
      role: account.role,
      email: account.email,
      accountType,
      branch,
      branches,
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
