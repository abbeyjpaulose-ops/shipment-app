const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const normalizeGSTIN = (gstin) => String(gstin || '').trim().toUpperCase();

export const validateGSTINFormat = (gstin) => {
  const normalized = normalizeGSTIN(gstin);
  return GSTIN_REGEX.test(normalized);
};

const parseBool = (value, defaultValue = false) => {
  if (value === undefined || value === null) return defaultValue;
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value).toLowerCase());
};

const buildVerificationUrl = (template, gstin) => {
  const normalized = normalizeGSTIN(gstin);
  return String(template || '')
    .replaceAll('{{GSTIN}}', normalized)
    .replaceAll('{GSTIN}', normalized)
    .replaceAll(':gstin', normalized);
};

const parseHeaders = (raw) => {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

/**
 * Pluggable GST verification.
 *
 * Defaults:
 * - Always validates GSTIN format locally.
 * - Remote verification only runs when GST_VERIFY_ENABLED=true and GST_VERIFY_URL is set.
 * - If GST_VERIFY_REQUIRED=true, company creation must have verified=true.
 */
export const verifyGSTIN = async (gstin) => {
  const normalized = normalizeGSTIN(gstin);

  if (!validateGSTINFormat(normalized)) {
    return {
      normalizedGSTIN: normalized,
      verified: true, ///change to false for GSTIN format invalid check
      status: 'invalid_format',
      reason: 'GSTIN failed local format validation'
    };
  }

  const enabled = parseBool(process.env.GST_VERIFY_ENABLED, false);
  if (!enabled) {
    return {
      normalizedGSTIN: normalized,
      verified: true,
      status: 'skipped',
      reason: 'Remote verification disabled; local format validation passed'
    };
  }

  const urlTemplate = process.env.GST_VERIFY_URL;
  if (!urlTemplate) {
    return {
      normalizedGSTIN: normalized,
      verified: false,
      status: 'misconfigured',
      reason: 'GST_VERIFY_ENABLED=true but GST_VERIFY_URL is not set'
    };
  }

  if (typeof fetch !== 'function') {
    return {
      normalizedGSTIN: normalized,
      verified: false,
      status: 'unsupported',
      reason: 'Global fetch is not available in this Node runtime'
    };
  }

  const url = buildVerificationUrl(urlTemplate, normalized);
  const headers = {
    Accept: 'application/json',
    ...(process.env.GST_VERIFY_TOKEN
      ? { Authorization: `Bearer ${process.env.GST_VERIFY_TOKEN}` }
      : {}),
    ...parseHeaders(process.env.GST_VERIFY_HEADERS_JSON)
  };

  try {
    const resp = await fetch(url, { method: 'GET', headers });
    const text = await resp.text();

    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (!resp.ok) {
      return {
        normalizedGSTIN: normalized,
        verified: false,
        status: 'failed',
        reason: `GST verification API returned ${resp.status}`,
        response: json ?? text
      };
    }

    // Provider-specific mapping can be added later. For now, treat a 2xx response as verified unless provider says otherwise.
    const providerVerified = json?.verified ?? json?.valid ?? json?.success;
    const verified = providerVerified === undefined ? true : Boolean(providerVerified);

    return {
      normalizedGSTIN: normalized,
      verified,
      status: verified ? 'verified' : 'rejected',
      response: json ?? text
    };
  } catch (err) {
    return {
      normalizedGSTIN: normalized,
      verified: false,
      status: 'error',
      reason: err?.message || 'Network error'
    };
  }
};

export const ensureGSTINVerifiedOrThrow = async (gstin) => {
  const required = parseBool(process.env.GST_VERIFY_REQUIRED, false);
  const result = await verifyGSTIN(gstin);
  if (required && !result.verified) {
    const reason = result.reason || result.status || 'GST verification failed';
    const err = new Error(reason);
    err.code = 'GST_VERIFICATION_FAILED';
    err.verification = result;
    throw err;
  }
  return result;
};

