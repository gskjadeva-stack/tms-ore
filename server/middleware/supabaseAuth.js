// ============================================================
// PLACEHOLDER — Supabase Auth JWT parsing middleware — NOT ENFORCED.
// Status: scaffolded per integration spec, inert by construction.
// This middleware currently does NOTHING except attach
// `req.supabaseUser = null` and call next(). The existing custom
// HMAC auth (authReq in index.js) remains the enforced gate.
// TO ACTIVATE (human review required):
//   1. Set SUPABASE_URL + SUPABASE_ANON_KEY env vars.
//   2. Verify a Supabase JWT with @supabase/supabase-js auth.getUser().
//   3. Decide precedence vs the custom HMAC token (replace or dual).
//   4. Add tests proving 401 on invalid Supabase JWTs.
// Until then, mounting this middleware changes NO behavior.
// ============================================================
function supabaseAuth(req, res, next) {
  req.supabaseUser = null;
  next();
}

module.exports = { supabaseAuth };
