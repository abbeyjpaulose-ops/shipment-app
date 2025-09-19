// shipment-backend/routes/hubs.js
import express from 'express';
import Hub from '../models/Hub.js';

const router = express.Router();

// ➕ Add new hub
router.post('/add', async (req, res) => {
  try {
    const { companyName, address, city, state, pincode, gstin, perRev, status, username, email } = req.body;

    if (!companyName || !address || !gstin || !username || !email) {
      return res.status(400).json({ message: 'Required fields missing' });
    }

    const hub = new Hub({ companyName, address, city, state, pincode, gstin, perRev, status, username, email });
    await hub.save();
    res.json({ message: '✅ Hub created successfully', hub });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: '❌ Duplicate company name + address' });
    }
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// 📋 Get all hubs for a user
router.get('/by-user/:username', async (req, res) => {
  try {
      const hubs = await Hub.find({
        $or: [
          { username: req.params.username },
          { email: req.query.email }
        ]
      }).sort({ createdAt: -1 });

      console.log('❌ Wrong hub1:');

      res.json(hubs);
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
});

// ✏️ Edit hub
router.put('/edit/:id', async (req, res) => {
  try {
    const updatedHub = await Hub.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updatedHub);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// 🔄 Toggle status
router.patch('/status/:id', async (req, res) => {
  try {
    const hub = await Hub.findById(req.params.id);
    hub.status = hub.status === 'active' ? 'inactive' : 'active';
    await hub.save();
    res.json({ message: 'Status updated', hub });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
