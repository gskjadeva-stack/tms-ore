// POST /api/auth/reset-password-request — never leak account existence.
const crypto = require('crypto');
const { getPrisma, isProd } = require('../_db');
const { sendError } = require('../_auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { email } = req.body || {};
    const em = String(email || '').toLowerCase();
    const prisma = getPrisma();
    const u = await prisma.user.findUnique({ where: { email: em } });
    if (!u) return res.json({ ok: true });
    const token = crypto.randomBytes(24).toString('hex');
    await prisma.user.update({
      where: { id: u.id },
      data: { resetToken: token, resetExpires: new Date(Date.now() + 30 * 60 * 1000) },
    });
    // eslint-disable-next-line no-console
    console.log(`[auth] reset token for ${em}: ${token}`);
    const out = { ok: true, message: 'Reset link sent' };
    if (!isProd()) out.dev_reset_token = token;
    res.json(out);
  } catch (e) { sendError(res, e); }
};
