import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('➡️ Login attempt with email:', email);

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      console.log('❌ No user found for:', email);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    console.log('✅ User found:', user.email);
    console.log('Stored passwordHash in DB:', user.passwordHash);

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    console.log('🔑 Password comparison result:', isMatch);

    if (!isMatch) {
      console.log('❌ Wrong password for:', email);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '1h' }
    );
    console.log('🎫 JWT generated successfully for:', email);

    return res.json({ token, email: user.email, role: user.role });
  } catch (err) {
    console.error('❌ Error in /login route:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
