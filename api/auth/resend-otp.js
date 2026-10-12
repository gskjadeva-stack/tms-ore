// POST /api/auth/resend-otp — issue a fresh OTP.
const crypto = require('crypto');
const { getPrisma, isProd } = require('../_db');
const { sendError } = require('../_auth');

const newOtp = () => String(crypto.randomInt(100000, 999999));

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { email } = req.body || {};
    const em = String(email || '').toLowerCase();
    const prisma = getPrisma();
    const u = await prisma.user.findUnique({ where: { email: em } });
    if (!u) return res.status(404).json({ error: 'Account not found' });
    const otp = newOtp();
    await prisma.user.update({
      where: { id: u.id },
      data: { otpCode: otp, otpExpires: new Date(Date.now() + 10 * 60 * 1000) },
    });
    // eslint-disable-next-line no-console
    console.log(`[auth] resend OTP for ${em}: ${otp}`);
    const out = { ok: true, message: 'Code sent' };
    if (!isProd()) out.dev_otp = otp;
    res.json(out);
  } catch (e) { sendError(res, e); }
};
