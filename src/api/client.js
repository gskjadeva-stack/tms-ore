// Fetch-based B44-compatible data client over the local Express API (localhost:3010).
// Sets globalThis.__B44_DB__ (the junk-stub `const db = globalThis.__B44_DB__ || ...`
// lines at the top of the legacy page files bind to THIS object) and exports `db`
// with B44 signatures:
//   auth.{isAuthenticated, me, loginViaEmailPassword, register, verifyOtp,
//         resendOtp, setToken, logout, redirectToLogin, loginWithProvider,
//         resetPasswordRequest, resetPassword}
//   app.getPublicSettings()
//   functions.invoke("runLlmAnalysis", payload)
import { appParams } from '@/lib/app-params';

const TOKEN_KEY = 'base44_access_token';
const getToken = () => localStorage.getItem(TOKEN_KEY);
const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

async function api(path, opts = {}) {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText || 'Request failed');
    err.status = res.status;
    err.data = data;
    err.extra_data = data.extra_data;
    throw err;
  }
  return data;
}

// ---- auth (B44 signatures) ----
const auth = {
  // SYNC — AuthContext requires a sync check (a Promise here breaks route guards)
  isAuthenticated: () => Boolean(getToken()),
  async me() {
    if (!getToken()) { const e = new Error('Not authenticated'); e.status = 401; throw e; }
    try {
      return await api('/auth/me');
    } catch (e) {
      // dead token must be cleared or isAuthenticated() stays true → redirect loop
      if (e.status === 401 || e.status === 403) setToken(null);
      throw e;
    }
  },
  async loginViaEmailPassword(email, password) {
    const r = await api('/auth/login', { method: 'POST', body: { email, password } });
    setToken(r.access_token);
    return r.user;
  },
  async register({ email, password }) {
    return api('/auth/register', { method: 'POST', body: { email, password } });
  },
  async verifyOtp({ email, otpCode }) {
    const r = await api('/auth/verify-otp', { method: 'POST', body: { email, otpCode } });
    setToken(r.access_token);
    return r;
  },
  async resendOtp(email) {
    return api('/auth/resend-otp', { method: 'POST', body: { email } });
  },
  setToken,
  logout() {
    setToken(null);
    // local backend has no hosted login page — go to /login
    window.location.href = '/login';
  },
  redirectToLogin() {
    window.location.href = '/login';
  },
  loginWithProvider() {
    alert('Google OAuth is not available on the local backend. Use email/password.');
  },
  async resetPasswordRequest(email) {
    return api('/auth/reset-password-request', { method: 'POST', body: { email } });
  },
  async resetPassword({ resetToken, newPassword }) {
    return api('/auth/reset-password', { method: 'POST', body: { resetToken, newPassword } });
  },
};

export const db = {
  auth,
  app: {
    async getPublicSettings() {
      return api('/app-settings');
    },
  },
  functions: {
    async invoke(name, payload) {
      return api(`/functions/${name}`, { method: 'POST', body: payload });
    },
  },
};

export const base44 = db;
export default db;

// minimal axios-like shim — kept for parity with the B44 SDK boot path
globalThis.createAxiosClient = ({ baseURL, headers = {}, token }) => ({
  async get(path) {
    const res = await fetch(`${baseURL}${path}`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || res.statusText || 'Request failed');
      err.status = res.status;
      err.data = data;
      err.extra_data = data.extra_data;
      throw err;
    }
    return data;
  },
});

globalThis.__B44_DB__ = db;
void appParams; // kept for parity with the B44 SDK client (token in localStorage is read live)
