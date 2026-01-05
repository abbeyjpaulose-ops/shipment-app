import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import mongoose from 'mongoose';
import authRoutes from './routes/auth.js';  // now works
import User from './models/User.js';
import tpartnersRoutes from './routes/tpartner.js';

import branchRoutes from './routes/branch.js';
import pkgRoutes from './routes/pkg.js';
import hubRoutes from './routes/hub.js';
import clientsRoutes from './routes/clients.js';
import guestsRoutes from './routes/guests.js';
import productRoutes from './routes/product.js';
import newShipmentRoutes from './routes/newShipments.js';
import profileRoutes from './routes/profile.js';
import adminUsersRoutes from './routes/adminUsers.js';
import pricingRoutes from './routes/pricing.js';
import auditLogsRoutes from './routes/auditLogs.js';
import paymentsRoutes from './routes/payments.js';



const app = express();
app.use(cors());
app.use(express.json());

dotenv.config();
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error(err));

app.use('/api/auth', authRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/hubs', hubRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/guests', guestsRoutes);
app.use('/api/pkgs', pkgRoutes);
app.use('/api/tpartners', tpartnersRoutes);
app.use('/api/products', productRoutes);
app.use('/api/newshipments', newShipmentRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/admin/users', adminUsersRoutes);
app.use('/api/pricing', pricingRoutes);
app.use('/api/audit-logs', auditLogsRoutes);
app.use('/api/payments', paymentsRoutes);


app.listen(3000, () => console.log('🚀 Server running on port 3000'));
