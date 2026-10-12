// GET /api/auth/me — current user (Bearer token required).
const { publicUser, requireUser, sendError } = require('../_auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const user = await requireUser(req);
    res.json(publicUser(user));
  } catch (e) { sendError(res, e); }
};
