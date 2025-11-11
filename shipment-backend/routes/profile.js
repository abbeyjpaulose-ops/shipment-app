import express from 'express';
import Profile from '../models/Profile.js';

const router = express.Router();

// Create or update profile
router.post('/save', async (req, res) => {
  try {
    console.log('📥 Incoming profile data:', req.body);

    // Upsert: if profile exists for email, update; otherwise create new
    const profile = await Profile.findOneAndUpdate(
      { email: req.body.email },
      req.body,
      { new: true, upsert: true }
    );

    res.status(201).json(profile);
  } catch (err) {
    console.error('❌ Error saving profile:', err.message);
    res.status(400).json({ message: err.message });
  }
});

// Get profile by email
router.get('/', async (req, res) => {
  try {
    const username = req.params.username;
    const email = req.query.email;  // frontend will send ?email=user@example.com
    const query = username ? { username } : email ? { email } : {};
    const products = await Profile.find(query).sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update profile by ID
router.put('/:id', async (req, res) => {
  try {
    const profile = await Profile.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, profile });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Delete profile by ID
router.delete('/:id', async (req, res) => {
  try {
    const profile = await Profile.findByIdAndDelete(req.params.id);
    if (!profile) return res.status(404).json({ message: 'Profile not found' });
    res.json({ success: true, message: 'Profile deleted' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

export default router;
