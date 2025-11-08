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
router.get('/profile', async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const profile = await Profile.findOne({ email });
    res.json(profile);
  } catch (err) {
    console.error('❌ Error loading profile:', err.message);
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
