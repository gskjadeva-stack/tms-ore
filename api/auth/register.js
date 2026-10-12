// POST /api/auth/register — create account + OTP (10-min expiry).
// Prod: OTP is logged server-side only; dev_otp returned only off-prod.
const crypto = require('crypto');
const { getPrisma, isProd } = require('../_db');
const { hashPassword, sendError } = require('../_auth');

const newOtp = () => String(crypto.randomInt(100000, 999999));
const otpExpiry = () => new Date(Date.now() + 10 * 60 * 1000);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    const em = String(email).toLowerCase();
    const prisma = getPrisma();
    const exists = await prisma.user.findUnique({ where: { email: em } });
    if (exists) return res.status(409).json({ error: 'An account with this email already exists' });
    const otp = newOtp();
    await prisma.user.create({
      data: { email: em, passwordHash: hashPassword(password), emailVerified: false, otpCode: otp, otpExpires: otpExpiry() },
    });
    // eslint-disable-next-line no-console
    console.log(`[auth] register OTP for ${em}: ${otp}`);
    const out = { ok: true, message: 'Verification code sent' };
    if (!isProd()) out.dev_otp = otp;
    res.json(out);
  } catch (e) { sendError(res, e); }
};
