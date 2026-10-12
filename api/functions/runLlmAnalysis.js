// POST /api/functions/runLlmAnalysis — proxy a user-configured
// OpenAI-compatible endpoint. Credentials come from Settings in the UI
// and are passed per-call. Server-side call avoids browser CORS.
const { requireUser, sendError } = require('../_auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    await requireUser(req);
    const { apiKey, baseUrl, model, prompt, provider } = req.body || {};
    if (!apiKey || !String(apiKey).trim()) {
      return res.status(400).json({ error: 'Missing API key (Settings → LLM configuration).' });
    }
    if (!baseUrl || !String(baseUrl).trim()) {
      return res.status(400).json({ error: 'Missing Base URL (Settings → LLM configuration).' });
    }
    if (!model || !String(model).trim()) {
      return res.status(400).json({ error: 'Missing Model (Settings → LLM configuration).' });
    }
    if (!prompt || !String(prompt).trim()) {
      return res.status(400).json({ error: 'No data provided for analysis.' });
    }

    const trimmedBase = String(baseUrl).trim().replace(/\/+$/, '');
    const endpoint = trimmedBase.endsWith('/chat/completions') ? trimmedBase : `${trimmedBase}/chat/completions`;

    let resp;
    try {
      resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${String(apiKey).trim()}` },
        body: JSON.stringify({ model: String(model).trim(), messages: [{ role: 'user', content: prompt }] }),
      });
    } catch (netErr) {
      return res.status(502).json({
        error: `Could not reach ${provider || 'the provider'} at ${endpoint}. ${(netErr && netErr.message) || 'Network error.'}`,
      });
    }
    if (!resp.ok) {
      let detail = '';
      try { detail = await resp.text(); } catch (_) { /* keep empty */ }
      return res.status(502).json({ error: `Provider returned HTTP ${resp.status}. ${String(detail).slice(0, 500)}` });
    }
    const raw = await resp.json();
    // Some OpenAI-compatible gateways wrap the payload in a top-level
    // `data` key: {"data": {"choices": [...]}}. Unwrap before parsing.
    const data = raw && raw.data && raw.data.choices ? raw.data : raw;
    const content = (data && data.choices && data.choices[0] && (data.choices[0].message
      ? data.choices[0].message.content : data.choices[0].text))
      || (typeof data === 'string' ? data : '');
    if (!content) return res.status(502).json({ error: 'Provider returned an empty analysis.' });
    res.json({ analysis: content, endpoint });
  } catch (e) { sendError(res, e); }
};
