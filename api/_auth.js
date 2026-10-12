// Shared auth helpers for Vercel serverless functions.
// Ported from server/index.js (scrypt password + HMAC token scheme).
// TOKEN_SECRET comes from env only — no filesystem fallback in prod.
const crypto = require('crypto');
const { getPrisma, getTokenSecret } = require('./_db');

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
}

function verifyPassword(pw, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  return crypto.timingSafeEqual(
    Buffer.from(hash, 'hex'),
    crypto.scryptSync(pw || '', salt, 64)
  );
}

function signToken(userId) {
  const exp = Date.now() + 30 * 24 * 3600 * 1000;
  const payload = `${userId}:${exp}`;
  const sig = crypto.createHmac('sha256', getTokenSecret()).update(payload).digest('hex');
  return `${payload}:${sig}`;
}

function readToken(token) {
  if (!token) return null;
  const parts = token.split(':');
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts;
  const expect = crypto.createHmac('sha256', getTokenSecret()).update(`${userId}:${exp}`).digest('hex');
  if (sig !== expect || Number(exp) < Date.now()) return null;
  return userId;
}

function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    full_name: u.fullName ?? null,
    role: u.role,
    created_date: u.createdDate,
  };
}

async function requireUser(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer /i, '');
  const userId = readToken(token);
  if (!userId) {
    const err = new Error('Authentication required');
    err.status = 401;
    throw err;
  }
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
  if (!user) {
    const err = new Error('User not found');
    err.status = 401;
    throw err;
  }
  return user;
}

function sendError(res, err) {
  // eslint-disable-next-line no-console
  console.error('[api-error]', err && err.message ? err.message : err);
  res.status(err && err.status ? err.status : 500).json({
    error: (err && err.message) || 'Internal server error',
    ...(err && err.extra ? err.extra : {}),
  });
}

module.exports = {
  hashPassword,
  verifyPassword,
  signToken,
  readToken,
  publicUser,
  requireUser,
  sendError,
};
