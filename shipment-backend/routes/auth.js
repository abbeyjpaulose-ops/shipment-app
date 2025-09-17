import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    console.log('➡️ Login attempt with username:', username);

    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) {
      console.log('❌ No user found for:', username);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    console.log('✅ User found:', user.username);
    console.log('Stored passwordHash in DB:', user.passwordHash);

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    console.log('🔑 Password comparison result:', isMatch);

    if (!isMatch) {
      console.log('❌ Wrong password for:', username);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user._id, username: user.username, role: user.role, email: user.email },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '1h' }
    );
    console.log('🎫 JWT generated successfully for:', username, user.email);

    return res.json({ token, username: user.username, role: user.role, email: user.email });
  } catch (err) {
    console.error('❌ Error in /login route:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
