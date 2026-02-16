import assert from 'node:assert/strict';
import { getAllowedCorsOrigins, isTruthy } from '../services/security.js';

const ENV_KEYS = ['NODE_ENV', 'CORS_ORIGINS', 'VERCEL_URL'];
const ORIGINAL_ENV = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = ORIGINAL_ENV[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function testIsTruthy() {
  assert.equal(isTruthy('true'), true);
  assert.equal(isTruthy('1'), true);
  assert.equal(isTruthy('yes'), true);
  assert.equal(isTruthy('false'), false);
  assert.equal(isTruthy('0'), false);
  assert.equal(isTruthy(undefined), false);
}

function testCorsDefaultsOutsideProduction() {
  delete process.env.NODE_ENV;
  delete process.env.CORS_ORIGINS;

  assert.deepEqual(getAllowedCorsOrigins(), [
    'http://localhost:4200',
    'http://127.0.0.1:4200'
  ]);
}

function testCorsRequiredInProduction() {
  process.env.NODE_ENV = 'production';
  delete process.env.CORS_ORIGINS;
  delete process.env.VERCEL_URL;

  assert.throws(
    () => getAllowedCorsOrigins(),
    /CORS_ORIGINS must be configured in production/
  );
}

function testVercelUrlFallbackInProduction() {
  process.env.NODE_ENV = 'production';
  delete process.env.CORS_ORIGINS;
  process.env.VERCEL_URL = 'shipment-app.vercel.app';

  assert.deepEqual(getAllowedCorsOrigins(), [
    'https://shipment-app.vercel.app'
  ]);
}

function testConfiguredCorsOriginsAreUsed() {
  process.env.NODE_ENV = 'production';
  process.env.CORS_ORIGINS = 'https://app.example.com, https://admin.example.com';

  assert.deepEqual(getAllowedCorsOrigins(), [
    'https://app.example.com',
    'https://admin.example.com'
  ]);
}

try {
  testIsTruthy();
  testCorsDefaultsOutsideProduction();
  testCorsRequiredInProduction();
  testVercelUrlFallbackInProduction();
  testConfiguredCorsOriginsAreUsed();
  console.log('security.test.js passed');
} finally {
  restoreEnv();
}
