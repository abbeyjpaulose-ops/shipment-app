import express from 'express';
import TransportPartner from '../models/TransportPartner.js';

const router = express.Router();

// Create Partner
router.post('/add', async (req, res) => {
  try {
    console.log(" Request Body: ", req.body); // Debugging line
    const partner = new TransportPartner(req.body);
    await partner.save();
    res.status(201).json(partner);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Load partners by email
router.get('/', async (req, res) => {
  try {
    const partners = await TransportPartner.find({
      email: req.query.email
    }).sort({ createdAt: -1 });
    res.json(partners);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update
router.put('/:id', async (req, res) => {
  try {
    const updated = await TransportPartner.findByIdAndUpdate(
      req.params.id, req.body, { new: true }
    );
    res.json(updated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Toggle Status
router.patch('/:id/status', async (req, res) => {
  try {
    const partner = await TransportPartner.findById(req.params.id);
    partner.status = partner.status === 'active' ? 'inactive' : 'active';
    await partner.save();

    res.json(partner);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

export default router;
