// POST /api/auth/login — email + password; unverified -> 403 + fresh OTP.
const crypto = require('crypto');
const { getPrisma, isProd } = require('../_db');
const { publicUser, sendError, signToken, verifyPassword } = require('../_auth');

const newOtp = () => String(crypto.randomInt(100000, 999999));

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { email, password } = req.body || {};
    const em = String(email || '').toLowerCase();
    const prisma = getPrisma();
    const u = await prisma.user.findUnique({ where: { email: em } });
    if (!u || !u.passwordHash || !verifyPassword(password || '', u.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    if (!u.emailVerified) {
      const otp = newOtp();
      await prisma.user.update({
        where: { id: u.id },
        data: { otpCode: otp, otpExpires: new Date(Date.now() + 10 * 60 * 1000) },
      });
      // eslint-disable-next-line no-console
      console.log(`[auth] unverified-login OTP for ${em}: ${otp}`);
      const out = { error: 'Email not verified. A new code was sent.', needs_otp: true };
      if (!isProd()) out.dev_otp = otp;
      return res.status(403).json(out);
    }
    res.json({ ok: true, access_token: signToken(u.id), user: publicUser(u) });
  } catch (e) { sendError(res, e); }
};
