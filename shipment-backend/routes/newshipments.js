// shipment-backend/routes/newshipments.js
import express from 'express';
import NewShipment from '../models/NewShipment.js';

const router = express.Router();

// Create new shipment
router.post('/add', async (req, res) => {
  try {
    console.log('📥 Incoming New shipment data:', req.body);  // 👈 debug log
  
    const shipment = new NewShipment(req.body);
    await shipment.save();
    res.status(201).json(shipment);
  } catch (err) {
    console.error('❌ Error saving New shipment:', err.message);
    res.status(400).json({ message: err.message });
  }
});

// Update shipment by ID
router.put('/:id', async (req, res) => {
  try {
    const shipment = await NewShipment.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, shipment });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Toggle shipment status
router.patch('/:id/status', async (req, res) => {
  try {
    const shipment = await NewShipment.findById(req.params.id);
    if (!shipment) return res.status(404).json({ message: 'Shipment not found' });

    shipment.status = shipment.status === 'active' ? 'inactive' : 'active';
    await shipment.save();
    res.json({ success: true, shipment });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Get shipments by username
router.get('/by-user/:username', async (req, res) => {
  try {
    const shipments = await NewShipment.find({
      email: req.query.email
    }).sort({ createdAt: -1 });

    console.log('📦 Shipments for:', req.query.email, shipments);

    res.json(shipments);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

export default router;
