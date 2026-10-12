// GET /api/health
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  res.json({ ok: true, db: 'supabase-postgres', ts: new Date().toISOString() });
};
