// shipment-backend/routes/pkg.js
import express from 'express';
import Pkg from '../models/Pkg.js';

const router = express.Router();

// Create new pkg
router.post('/add', async (req, res) => {
  try {
    console.log('📥 Incoming pkg data:', req.body);  // 👈 debug log
  
    const pkg = new Pkg(req.body);
    await pkg.save();
    res.status(201).json(pkg);
  } catch (err) {
    console.error('❌ Error saving pkg:', err.message);
    res.status(400).json({ message: err.message });
  }
});

// Get pkgs for a specific user
router.get('/', async (req, res) => {
  try {
    const email = req.query.email;  // frontend will send ?email=user@example.com
    const query = email ? { email } : {};
    const pkgs = await Pkg.find(query).sort({ createdAt: -1 });
    res.json(pkgs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update pkg
router.put('/:id', async (req, res) => {
  try {
    const pkg = await Pkg.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, pkg });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Toggle status
router.patch('/:id/status', async (req, res) => {
  try {
    const pkg = await Pkg.findById(req.params.id);
    if (!pkg) return res.status(404).json({ message: 'Pkg not found' });
    pkg.status = pkg.status === 'active' ? 'inactive' : 'active';
    await pkg.save();
    res.json({ success: true, pkg });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Get pkgs by user
router.get('/by-user/:username', async (req, res) => {
  try {   
    const pkgs = await Pkg.find({
      email: req.query.email
    }).sort({ createdAt: -1 });
    
    res.json(pkgs);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET active package for dropdown
router.get('/pkglist', async (req, res) => {
  try {
    const email = req.query.emailId; // frontend sends ?email=user@example.com
    const query = email ? { email, status: 'active' } : { status: 'active' };
    const pkg = await Pkg.find(query).sort({ createdAt: -1 });
    res.json(pkg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
