import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import mongoose from 'mongoose';
import authRoutes from './routes/auth.js';
import tpartnersRoutes from './routes/tpartner.js';
import branchRoutes from './routes/branch.js';
import pkgRoutes from './routes/pkg.js';
import hubRoutes from './routes/hub.js';
import clientsRoutes from './routes/clients.js';
import guestsRoutes from './routes/guests.js';
import productRoutes from './routes/product.js';
import categoriesRoutes from './routes/categories.js';
import newShipmentRoutes from './routes/newshipments.js';
import profileRoutes from './routes/profile.js';
import adminUsersRoutes from './routes/adminUsers.js';
import pricingRoutes from './routes/pricing.js';
import auditLogsRoutes from './routes/auditLogs.js';
import paymentsRoutes from './routes/payments.js';
import manifestRoutes from './routes/manifests.js';
import superAdminRoutes from './routes/superAdmin.js';
import { getAllowedCorsOrigins, isTruthy, normalizeOrigin } from './services/security.js';

dotenv.config();

const app = express();
app.disable('x-powered-by');

if (isTruthy(process.env.TRUST_PROXY)) {
  app.set('trust proxy', 1);
}

function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function createRateLimiter({
  windowMs,
  max,
  message = 'Too many requests. Please try again later.',
  keyGenerator
}) {
  const buckets = new Map();
  const safeWindowMs = toPositiveInt(windowMs, 15 * 60 * 1000);
  const safeMax = toPositiveInt(max, 250);

  return (req, res, next) => {
    const now = Date.now();
    if (buckets.size > 10000) {
      for (const [key, bucket] of buckets.entries()) {
        if (bucket.resetAt <= now) buckets.delete(key);
      }
    }

    const key = (keyGenerator ? keyGenerator(req) : '') ||
      String(req.ip || req.socket?.remoteAddress || 'unknown');
    const existing = buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      const resetAt = now + safeWindowMs;
      buckets.set(key, { count: 1, resetAt });
      res.setHeader('X-RateLimit-Limit', String(safeMax));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(safeMax - 1, 0)));
      res.setHeader('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)));
      return next();
    }

    if (existing.count >= safeMax) {
      const retryAfterSeconds = Math.max(Math.ceil((existing.resetAt - now) / 1000), 1);
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.setHeader('X-RateLimit-Limit', String(safeMax));
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('X-RateLimit-Reset', String(Math.ceil(existing.resetAt / 1000)));
      return res.status(429).json({ message });
    }

    existing.count += 1;
    buckets.set(key, existing);
    res.setHeader('X-RateLimit-Limit', String(safeMax));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(safeMax - existing.count, 0)));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(existing.resetAt / 1000)));
    return next();
  };
}

function isSecureRequest(req) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  return Boolean(req.secure) || forwardedProto === 'https';
}

function isLocalHost(req) {
  const host = String(req.hostname || '').toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function mongooseReadyStateLabel(state) {
  switch (state) {
    case 0: return 'disconnected';
    case 1: return 'connected';
    case 2: return 'connecting';
    case 3: return 'disconnecting';
    default: return `unknown(${state})`;
  }
}

const allowedOrigins = new Set(getAllowedCorsOrigins().map((origin) => normalizeOrigin(origin)).filter(Boolean));
const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    const normalizedOrigin = normalizeOrigin(origin);
    if (allowedOrigins.has(normalizedOrigin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

const apiRateLimiter = createRateLimiter({
  windowMs: process.env.API_RATE_LIMIT_WINDOW_MS,
  max: process.env.API_RATE_LIMIT_MAX,
  message: 'Too many API requests. Please try again later.'
});
const loginRateLimiter = createRateLimiter({
  windowMs: process.env.LOGIN_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000,
  max: process.env.LOGIN_RATE_LIMIT_MAX || 10,
  message: 'Too many login attempts. Please try again later.'
});

app.use('/api', apiRateLimiter);
app.use('/api/auth/login', loginRateLimiter);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (isSecureRequest(req)) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
});

if (isTruthy(process.env.ENFORCE_HTTPS)) {
  app.use((req, res, next) => {
    if (isSecureRequest(req) || isLocalHost(req)) return next();
    return res.status(400).json({ message: 'HTTPS is required' });
  });
}

const mongoUri = String(process.env.MONGO_URI || '').trim();
if (!mongoUri) {
  throw new Error('MONGO_URI is not configured');
}

let mongoConnectPromise = null;

async function ensureMongoConnected() {
  if (mongoose.connection.readyState === 1) {
    return;
  }

  if (!mongoConnectPromise) {
    const serverSelectionTimeoutMs = toPositiveInt(
      process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS,
      10000
    );
    const socketTimeoutMs = toPositiveInt(
      process.env.MONGO_SOCKET_TIMEOUT_MS,
      20000
    );

    mongoConnectPromise = mongoose
      .connect(mongoUri, {
        serverSelectionTimeoutMS: serverSelectionTimeoutMs,
        socketTimeoutMS: socketTimeoutMs
      })
      .then(() => {
        console.log('Connected to MongoDB');
      })
      .catch((err) => {
        mongoConnectPromise = null;
        throw err;
      });
  }

  await mongoConnectPromise;
}

// Start connecting immediately, but do not block startup.
ensureMongoConnected().catch((err) => {
  console.error('MongoDB connection failed:', err.message);
});

app.use('/api', async (_req, res, next) => {
  try {
    await ensureMongoConnected();
    return next();
  } catch (err) {
    console.error(
      'MongoDB unavailable for request:',
      err?.message || err,
      `state=${mongooseReadyStateLabel(mongoose.connection.readyState)}`
    );
    return res.status(503).json({ message: 'Database unavailable' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/hubs', hubRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/guests', guestsRoutes);
app.use('/api/pkgs', pkgRoutes);
app.use('/api/tpartners', tpartnersRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/newshipments', newShipmentRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/admin/users', adminUsersRoutes);
app.use('/api/pricing', pricingRoutes);
app.use('/api/audit-logs', auditLogsRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/manifests', manifestRoutes);
app.use('/api/super-admin', superAdminRoutes);

app.use((err, _req, res, next) => {
  if (err?.message === 'Not allowed by CORS') {
    return res.status(403).json({ message: 'Origin not allowed' });
  }
  if (err) {
    return res.status(500).json({ message: 'Server error' });
  }
  return next();
});

export default app;
