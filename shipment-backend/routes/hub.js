// shipment-backend/routes/hub.js
import express from 'express';
import Hub from '../models/Hub.js';

const router = express.Router();

// Create new hub
router.post('/add', async (req, res) => {
  try {
    console.log('📥 Incoming hub data:', req.body);  // 👈 debug log
  
    const hub = new Hub(req.body);
    await hub.save();
    res.status(201).json(hub);
  } catch (err) {
    console.error('❌ Error saving hub:', err.message);
    res.status(400).json({ message: err.message });
  }
});

// Get hubs for a specific user
router.get('/', async (req, res) => {
  try {
    const email = req.query.email;  // frontend will send ?email=user@example.com
    const query = email ? { email } : {};
    const hubs = await Hub.find(query).sort({ createdAt: -1 });
    res.json(hubs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update hub
router.put('/:id', async (req, res) => {
  try {
    const hub = await Hub.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, hub });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Toggle status
router.patch('/:id/status', async (req, res) => {
  try {
    const hub = await Hub.findById(req.params.id);
    if (!hub) return res.status(404).json({ message: 'Hub not found' });
    hub.status = hub.status === 'active' ? 'inactive' : 'active';
    await hub.save();
    res.json({ success: true, hub });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Get hubs by user
router.get('/by-user/:username', async (req, res) => {
  try {   
    const hubs = await Hub.find({
      email: req.query.email
    }).sort({ createdAt: -1 });

    console.log('📥 Hub:', req.query.email, hubs);

    res.json(hubs);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

export default router;
