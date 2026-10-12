// POST /api/auth/verify-otp — verify email, return HMAC access token.
const { getPrisma } = require('../_db');
const { publicUser, sendError, signToken } = require('../_auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { email, otpCode } = req.body || {};
    const prisma = getPrisma();
    const u = await prisma.user.findUnique({ where: { email: String(email || '').toLowerCase() } });
    if (!u) return res.status(404).json({ error: 'Account not found' });
    if (!u.otpCode || u.otpCode !== otpCode || !u.otpExpires || new Date(u.otpExpires) < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired verification code' });
    }
    await prisma.user.update({
      where: { id: u.id },
      data: { emailVerified: true, otpCode: null, otpExpires: null },
    });
    res.json({ ok: true, access_token: signToken(u.id), user: publicUser(u) });
  } catch (e) { sendError(res, e); }
};
