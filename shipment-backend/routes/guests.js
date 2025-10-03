// shipment-backend/routes/guest.js
import express from 'express';
import Guest from '../models/Guest.js';

const router = express.Router();

// Create new guest
router.post('/add', async (req, res) => {
  try {
    console.log('📥 Incoming guest data:', req.body);  // 👈 debug log
  
    const guest = new Guest(req.body);
    await guest.save();
    res.status(201).json(guest);
  } catch (err) {
    console.error('❌ Error saving guest:', err.message);
    res.status(400).json({ message: err.message });
  }
});

// Get guests for a specific user
router.get('/', async (req, res) => {
  try {
    const email = req.query.email;  // frontend will send ?email=user@example.com
    const query = email ? { email } : {};
    const guests = await Guest.find(query).sort({ createdAt: -1 });
    res.json(guests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update guest
router.put('/:id', async (req, res) => {
  try {
    const guest = await Guest.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, guest });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Toggle status
router.patch('/:id/status', async (req, res) => {
  try {
    const guest = await Guest.findById(req.params.id);
    if (!guest) return res.status(404).json({ message: 'Guest not found' });
    guest.status = guest.status === 'active' ? 'inactive' : 'active';
    await guest.save();
    res.json({ success: true, guest });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Get guests by user
router.get('/by-user/:username', async (req, res) => {
  try {   
    const guests = await Guest.find({
      email: req.query.email
    }).sort({ createdAt: -1 });
    
    res.json(guests);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET active guests for dropdown
router.get('/guestslist', async (req, res) => {
  try {
    const email = req.query.emailId; // frontend sends ?email=user@example.com
    const query = email ? { email, status: 'active' } : { status: 'active' };
    const guests = await Guest.find(query).select('guestName address phoneNum');
    res.json(guests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


export default router;
