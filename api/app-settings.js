// GET /api/app-settings — static public gate for AuthContext boot.
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  res.json({ id: 'prod', public_settings: {} });
};
