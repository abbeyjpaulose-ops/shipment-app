import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import mongoose from 'mongoose';
import authRoutes from './routes/auth.js';  // now works
import User from './models/User.js';

const app = express();
app.use(cors());
app.use(express.json());

dotenv.config();
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error(err));

app.use('/api/auth', authRoutes);

app.listen(3000, () => console.log('🚀 Server running on port 3000'));
