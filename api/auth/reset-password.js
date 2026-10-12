// POST /api/auth/reset-password — set new password via reset token.
const { getPrisma } = require('../_db');
const { hashPassword, sendError } = require('../_auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { resetToken, newPassword } = req.body || {};
    if (!resetToken || !newPassword) return res.status(400).json({ error: 'Missing token or password' });
    const prisma = getPrisma();
    const u = await prisma.user.findFirst({ where: { resetToken } });
    if (!u || !u.resetExpires || new Date(u.resetExpires) < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }
    await prisma.user.update({
      where: { id: u.id },
      data: { passwordHash: hashPassword(newPassword), resetToken: null, resetExpires: null, emailVerified: true },
    });
    res.json({ ok: true });
  } catch (e) { sendError(res, e); }
};
