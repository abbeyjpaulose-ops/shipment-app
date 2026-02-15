import jwt from 'jsonwebtoken';
import { getAuthCookieName, getJwtSecret } from '../services/security.js';

function extractBearerToken(headerValue) {
  const header = String(headerValue || '').trim();
  if (!header) return '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return '';
  return token.trim();
}

function extractCookieToken(cookieHeaderValue) {
  const cookieHeader = String(cookieHeaderValue || '').trim();
  if (!cookieHeader) return '';
  const cookieName = getAuthCookieName();
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [nameRaw, ...valueParts] = String(part || '').trim().split('=');
    const name = String(nameRaw || '').trim();
    if (!name || name !== cookieName) continue;
    const value = valueParts.join('=').trim();
    if (!value) continue;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return '';
}

function getTokenFromRequest(req) {
  const bearerToken = extractBearerToken(req.headers.authorization);
  if (bearerToken) return bearerToken;
  return extractCookieToken(req.headers.cookie);
}

export const requireAuth = (req, res, next) => {
  let jwtSecret = '';
  try {
    jwtSecret = getJwtSecret();
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Authentication configuration error' });
  }

  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ message: 'Missing authentication token' });
    }

    const payload = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

export const requireAdmin = (req, res, next) => {
  const role = String(req.user?.role || '').toLowerCase();
  if (role !== 'admin') {
    return res.status(403).json({ message: 'No privileges' });
  }
  next();
};

export const requireSuperAdmin = (req, res, next) => {
  const role = String(req.user?.role || '').toLowerCase();
  if (role !== 'super-admin') {
    return res.status(403).json({ message: 'Super admin privileges required' });
  }
  next();
};
