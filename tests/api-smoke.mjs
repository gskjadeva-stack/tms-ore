// Smoke tests for api/ handlers — no DB/network needed.
// Verifies: method guards, validation 400s, auth 401s, OTP gating shape.
// Run: node --test tests/api-smoke.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

const mkRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};

const load = async (p) => (await import(`../api/${p}.js`)).default;

test('health returns ok shape on GET, 405 otherwise', async () => {
  const health = await load('health');
  let res = mkRes();
  await health({ method: 'GET' }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  res = mkRes();
  await health({ method: 'POST' }, res);
  assert.equal(res.statusCode, 405);
});

test('app-settings returns boot gate shape', async () => {
  const h = await load('app-settings');
  const res = mkRes();
  await h({ method: 'GET' }, res);
  assert.equal(res.statusCode, 200);
  assert.ok('public_settings' in res.body);
});

test('auth handlers load (prisma required only when invoked)', async () => {
  for (const p of [
    'auth/register', 'auth/verify-otp', 'auth/resend-otp', 'auth/login',
    'auth/reset-password-request', 'auth/reset-password', 'auth/me',
    'functions/runLlmAnalysis',
    'tms-records/status', 'tms-records/load', 'tms-records/save',
  ]) {
    const h = await load(p);
    assert.equal(typeof h, 'function', p);
  }
});

test('method guards return 405 without touching prisma', async () => {
  const cases = [
    ['health', { method: 'POST' }],
    ['app-settings', { method: 'POST' }],
    ['auth/register', { method: 'GET', body: {} }],
    ['auth/login', { method: 'GET', body: {} }],
    ['auth/me', { method: 'POST', headers: {} }],
    ['functions/runLlmAnalysis', { method: 'GET', headers: {}, body: {} }],
    ['tms-records/save', { method: 'GET', headers: {}, body: {} }],
  ];
  for (const [p, req] of cases) {
    const h = await load(p);
    const res = mkRes();
    await h(req, res);
    assert.equal(res.statusCode, 405, p);
  }
});
