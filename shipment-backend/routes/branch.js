// shipment-backend/routes/branch.js
import express from 'express';
import Branch from '../models/Branch.js';

const router = express.Router();

// Create new branch
router.post('/add', async (req, res) => {
  try {
    console.log('📥 Incoming branch data:', req.body);  // 👈 debug log
  
    const branch = new Branch(req.body);
    await branch.save();
    res.status(201).json(branch);
  } catch (err) {
    console.error('❌ Error saving branch:', err.message);
    res.status(400).json({ message: err.message });
  }
});

// Get branches for a specific user
router.get('/', async (req, res) => {
  try {
    const email = req.query.email;  // frontend will send ?email=user@example.com
    const query = email ? { email } : {};
    const branches = await Branch.find(query).sort({ createdAt: -1 });
    res.json(branches);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update branch
router.put('/:id', async (req, res) => {
  try {
    const branch = await Branch.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, branch });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Toggle status
router.patch('/:id/status', async (req, res) => {
  try {
    const branch = await Branch.findById(req.params.id);
    if (!branch) return res.status(404).json({ message: 'Branch not found' });
    branch.status = branch.status === 'active' ? 'inactive' : 'active';
    await branch.save();
    res.json({ success: true, branch });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Get branches by user
router.get('/by-user/:username', async (req, res) => {
  try {   
    const branches = await Branch.find({
      email: req.query.email
    }).sort({ createdAt: -1 });

    console.log('📥 Branch:', req.query.email, branches);

    res.json(branches);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});


export default router;
