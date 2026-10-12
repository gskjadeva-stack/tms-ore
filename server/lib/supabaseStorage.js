// ============================================================
// PLACEHOLDER — Supabase Storage utility — NOT ACTIVATED.
// Status: scaffolded per integration spec, inert by construction.
// Nothing in the codebase imports or calls these functions.
// Each stub throws when called so accidental use fails loudly.
// TO ACTIVATE (human review required):
//   1. Set SUPABASE_URL + SUPABASE_ANON_KEY (or SERVICE_ROLE_KEY
//      server-side only, never exposed to the browser).
//   2. Create the storage bucket in the Supabase dashboard.
//   3. Implement with @supabase/supabase-js createClient + RLS policies.
//   4. Wire callers explicitly + add tests.
// ============================================================
function notActivated(op) {
  throw new Error(`Supabase Storage placeholder — not activated (called ${op})`);
}

async function uploadFile() {
  notActivated('uploadFile');
}

async function getPublicUrl() {
  notActivated('getPublicUrl');
}

async function deleteFile() {
  notActivated('deleteFile');
}

module.exports = { uploadFile, getPublicUrl, deleteFile };
