const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const SAME_SITE_VALUES = new Set(['strict', 'lax', 'none']);
const LOCAL_CORS_ORIGINS = ['http://localhost:4200', 'http://127.0.0.1:4200'];

export function isTruthy(value) {
  return TRUE_VALUES.has(String(value || '').trim().toLowerCase());
}

export function getJwtSecret() {
  const secret = String(process.env.JWT_SECRET || '').trim();
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  return secret;
}

export function getJwtExpiresIn() {
  const expiresIn = String(process.env.JWT_EXPIRES_IN || '15m').trim();
  return expiresIn || '15m';
}

export function getAuthCookieName() {
  const cookieName = String(process.env.AUTH_COOKIE_NAME || 'auth_token').trim();
  return cookieName || 'auth_token';
}

function getCookieMaxAgeMs() {
  const parsed = Number(process.env.AUTH_COOKIE_MAX_AGE_MS);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return 15 * 60 * 1000;
}

export function shouldSetAuthCookie() {
  if (process.env.AUTH_COOKIE_ENABLED !== undefined) {
    return isTruthy(process.env.AUTH_COOKIE_ENABLED);
  }
  return true;
}

export function shouldIncludeTokenInBody() {
  if (process.env.AUTH_TOKEN_IN_BODY !== undefined) {
    return isTruthy(process.env.AUTH_TOKEN_IN_BODY);
  }
  return true;
}

export function isSecureCookieEnabled() {
  if (process.env.AUTH_COOKIE_SECURE !== undefined) {
    return isTruthy(process.env.AUTH_COOKIE_SECURE);
  }
  return String(process.env.NODE_ENV || '').toLowerCase() === 'production';
}

export function getAuthCookieOptions() {
  const secure = isSecureCookieEnabled();
  const configuredSameSite = String(process.env.AUTH_COOKIE_SAMESITE || '')
    .trim()
    .toLowerCase();
  let sameSite = SAME_SITE_VALUES.has(configuredSameSite) ? configuredSameSite : (secure ? 'none' : 'lax');
  if (sameSite === 'none' && !secure) sameSite = 'lax';

  return {
    httpOnly: true,
    secure,
    sameSite,
    path: '/',
    maxAge: getCookieMaxAgeMs()
  };
}

export function getAllowedCorsOrigins() {
  const configured = String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (configured.length) return configured;

  const environment = String(process.env.NODE_ENV || '').trim().toLowerCase();
  if (environment === 'production') {
    const vercelUrl = String(process.env.VERCEL_URL || '').trim();
    if (vercelUrl) {
      return [`https://${vercelUrl}`];
    }
    throw new Error('CORS_ORIGINS must be configured in production');
  }

  return LOCAL_CORS_ORIGINS;
}
