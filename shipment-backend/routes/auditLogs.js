import express from 'express';
import AuditLog from '../models/AuditLog.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const gstinId = Number(req.user?.id);
    if (!Number.isFinite(gstinId)) return res.status(400).json({ message: 'Invalid GSTIN_ID' });

    const { startDate, endDate, action, user, limit, page } = req.query || {};
    const query = { GSTIN_ID: gstinId };

    if (action) {
      query.action = { $regex: String(action).trim(), $options: 'i' };
    }

    if (user) {
      const term = String(user).trim();
      query.$or = [
        { actorUsername: { $regex: term, $options: 'i' } },
        { actorEmail: { $regex: term, $options: 'i' } }
      ];
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate && !Number.isNaN(Date.parse(startDate))) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate && !Number.isNaN(Date.parse(endDate))) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
      if (!Object.keys(query.createdAt).length) {
        delete query.createdAt;
      }
    }

    let limitNum = Number(limit) || 100;
    if (limitNum > 500) limitNum = 500;
    if (limitNum < 1) limitNum = 1;

    let pageNum = Number(page) || 1;
    if (pageNum < 1) pageNum = 1;

    const skip = (pageNum - 1) * limitNum;
    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      AuditLog.countDocuments(query)
    ]);

    res.json({
      logs,
      total,
      page: pageNum,
      limit: limitNum
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

export default router;
