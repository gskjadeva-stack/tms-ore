// TMS backend — Express + Prisma against Supabase PostgreSQL.
// Replaces the former local SQL Server (mssql) backend; same 13-route
// API surface and JSON shapes. See implementation_plan.md (v3).
// server/schema.sql is a FROZEN MSSQL reference — the Postgres truth is
// prisma/schema.prisma + prisma/migration.sql.
// Surface (only what the frontend actually calls):
//   GET  /api/health
//   GET  /api/app-settings            (db.app.getPublicSettings())
//   POST /api/auth/register | verify-otp | resend-otp | login |
//        reset-password-request | reset-password
//   GET  /api/auth/me                 (db.auth.me())
//   POST /api/functions/runLlmAnalysis (db.functions.invoke("runLlmAnalysis", ...))
//   GET  /api/tms-records/status | load
//   POST /api/tms-records/save
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getPrisma } = require('./db');
const { supabaseAuth } = require('./middleware/supabaseAuth');

const PORT = process.env.PORT || 3010;

// Prisma client (Supabase Postgres via DATABASE_URL pooler).
const prisma = getPrisma();

// --- auth helpers (scrypt + HMAC token, same scheme as the Bukidnon backend) ---
const TOKEN_SECRET_FILE = path.join(__dirname, '.token-secret');
// Prod parity: env secret wins (Vercel serverless has no persistent
// filesystem). File fallback is local-dev only.
let TOKEN_SECRET = (process.env.TOKEN_SECRET || '').trim();
if (!TOKEN_SECRET) {
  if (fs.existsSync(TOKEN_SECRET_FILE)) TOKEN_SECRET = fs.readFileSync(TOKEN_SECRET_FILE, 'utf8').trim();
  else { TOKEN_SECRET = crypto.randomBytes(32).toString('hex'); fs.writeFileSync(TOKEN_SECRET_FILE, TOKEN_SECRET); }
}
const isProd = () => process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';

const hashPassword = (pw) => {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
};
const verifyPassword = (pw, stored) => {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), crypto.scryptSync(pw, salt, 64));
};
const signToken = (userId) => {
  const exp = Date.now() + 30 * 24 * 3600 * 1000;
  const payload = `${userId}:${exp}`;
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
  return `${payload}:${sig}`;
};
const readToken = (token) => {
  if (!token) return null;
  const parts = token.split(':');
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts;
  const expect = crypto.createHmac('sha256', TOKEN_SECRET).update(`${userId}:${exp}`).digest('hex');
  if (sig !== expect || Number(exp) < Date.now()) return null;
  return userId;
};

const publicUser = (u) => ({ id: u.id, email: u.email, full_name: u.fullName ?? u.full_name ?? null, role: u.role, created_date: u.createdDate ?? u.created_date });

const otpExpiry = () => new Date(Date.now() + 10 * 60 * 1000);
const newOtp = () => String(crypto.randomInt(100000, 999999));
const logOtp = (tag, email, code) => console.log(`[auth] ${tag} OTP for ${email}: ${code}`);

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

async function main() {
  // Prisma connects lazily; verify reachability before listening.
  await prisma.$queryRaw`SELECT 1`;
  console.log('[db] connected to Supabase Postgres via Prisma');

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '5mb' }));
  // PLACEHOLDER Supabase Auth JWT middleware — mounted but NOT ENFORCED
  // (no-op pass-through; the custom HMAC authReq below stays the gate).
  app.use(supabaseAuth);

  app.get('/api/health', (req, res) => res.json({ ok: true, db: 'supabase-postgres', ts: new Date().toISOString() }));

  // ---- public app settings (AuthContext boot) ----
  // Static object: TMS keeps its real settings client-side (localStorage), and
  // appPublicSettings is not consumed anywhere downstream.
  app.get('/api/app-settings', (req, res) => res.json({ id: 'local', public_settings: {} }));

  // ---- auth (Prisma + Supabase Postgres; same shapes/codes) ----
  app.post('/api/auth/register', wrap(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    const em = email.toLowerCase();
    const exists = await prisma.user.findUnique({ where: { email: em }, select: { id: true } });
    if (exists) return res.status(409).json({ error: 'An account with this email already exists' });
    const otp = newOtp();
    await prisma.user.create({
      data: { email: em, passwordHash: hashPassword(password), emailVerified: false, otpCode: otp, otpExpires: otpExpiry() },
    });
    logOtp('register', em, otp);
    // Prod parity: OTP is logged server-side only in production.
    // Local dev keeps dev_otp for the no-SMTP flow (see RUN_GUIDE.md).
    const out = { ok: true, message: 'Verification code sent' };
    if (!isProd()) out.dev_otp = otp;
    res.json(out);
  }));

  app.post('/api/auth/verify-otp', wrap(async (req, res) => {
    const { email, otpCode } = req.body || {};
    const u = await prisma.user.findUnique({ where: { email: (email || '').toLowerCase() } });
    if (!u) return res.status(404).json({ error: 'Account not found' });
    if (!u.otpCode || u.otpCode !== otpCode || !u.otpExpires || new Date(u.otpExpires) < new Date())
      return res.status(400).json({ error: 'Invalid or expired verification code' });
    await prisma.user.update({
      where: { id: u.id },
      data: { emailVerified: true, otpCode: null, otpExpires: null },
    });
    res.json({ ok: true, access_token: signToken(u.id), user: publicUser(u) });
  }));

  app.post('/api/auth/resend-otp', wrap(async (req, res) => {
    const { email } = req.body || {};
    const em = (email || '').toLowerCase();
    const target = await prisma.user.findUnique({ where: { email: em }, select: { id: true } });
    if (!target) return res.status(404).json({ error: 'Account not found' });
    const otp = newOtp();
    await prisma.user.update({
      where: { id: target.id },
      data: { otpCode: otp, otpExpires: otpExpiry() },
    });
    logOtp('resend', em, otp);
    const resendOut = { ok: true, message: 'Code sent' };
    if (!isProd()) resendOut.dev_otp = otp;
    res.json(resendOut);
  }));

  app.post('/api/auth/login', wrap(async (req, res) => {
    const { email, password } = req.body || {};
    const em = (email || '').toLowerCase();
    const u = await prisma.user.findUnique({ where: { email: em } });
    if (!u || !u.passwordHash || !verifyPassword(password || '', u.passwordHash))
      return res.status(401).json({ error: 'Invalid email or password' });
    if (!u.emailVerified) {
      const otp = newOtp();
      await prisma.user.update({
        where: { id: u.id },
        data: { otpCode: otp, otpExpires: otpExpiry() },
      });
      logOtp('unverified-login', em, otp);
      const unverifiedOut = { error: 'Email not verified. A new code was sent.', needs_otp: true };
      if (!isProd()) unverifiedOut.dev_otp = otp;
      return res.status(403).json(unverifiedOut);
    }
    res.json({ ok: true, access_token: signToken(u.id), user: publicUser(u) });
  }));

  app.post('/api/auth/reset-password-request', wrap(async (req, res) => {
    const { email } = req.body || {};
    const em = (email || '').toLowerCase();
    const u = await prisma.user.findUnique({ where: { email: em }, select: { id: true } });
    if (!u) return res.json({ ok: true }); // never leak existence
    const token = crypto.randomBytes(24).toString('hex');
    await prisma.user.update({
      where: { id: u.id },
      data: { resetToken: token, resetExpires: new Date(Date.now() + 30 * 60 * 1000) },
    });
    console.log(`[auth] reset token for ${em}: ${token}`);
    const resetOut = { ok: true, message: 'Reset link sent' };
    if (!isProd()) resetOut.dev_reset_token = token;
    res.json(resetOut);
  }));

  app.post('/api/auth/reset-password', wrap(async (req, res) => {
    const { resetToken, newPassword } = req.body || {};
    if (!resetToken || !newPassword) return res.status(400).json({ error: 'Missing token or password' });
    const u = await prisma.user.findFirst({ where: { resetToken } });
    if (!u || !u.resetExpires || new Date(u.resetExpires) < new Date()) return res.status(400).json({ error: 'Invalid or expired reset token' });
    await prisma.user.update({
      where: { id: u.id },
      data: { passwordHash: hashPassword(newPassword), resetToken: null, resetExpires: null, emailVerified: true },
    });
    res.json({ ok: true });
  }));

  const authReq = wrap(async (req, res, next) => {
    const token = (req.headers.authorization || '').replace(/^Bearer /i, '');
    const userId = readToken(token);
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    next();
  });

  app.get('/api/auth/me', authReq, (req, res) => res.json(publicUser(req.user)));

  // ---- LLM analysis proxy (ported from base44/functions/runLlmAnalysis/entry.ts) ----
  // Credentials (apiKey/baseUrl/model) are user-supplied via Settings (localStorage)
  // and passed in the payload at call time. Server-side call avoids browser CORS.
  app.post('/api/functions/runLlmAnalysis', authReq, wrap(async (req, res) => {
    const { apiKey, baseUrl, model, prompt, provider } = req.body || {};
    if (!apiKey || !apiKey.trim())
      return res.status(400).json({ error: 'Missing API key (Settings → LLM configuration).' });
    if (!baseUrl || !baseUrl.trim())
      return res.status(400).json({ error: 'Missing Base URL (Settings → LLM configuration).' });
    if (!model || !model.trim())
      return res.status(400).json({ error: 'Missing Model (Settings → LLM configuration).' });
    if (!prompt || !prompt.trim())
      return res.status(400).json({ error: 'No data provided for analysis.' });

    const trimmedBase = baseUrl.trim().replace(/\/+$/, '');
    const endpoint = trimmedBase.endsWith('/chat/completions') ? trimmedBase : `${trimmedBase}/chat/completions`;

    let resp;
    try {
      resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey.trim()}` },
        body: JSON.stringify({ model: model.trim(), messages: [{ role: 'user', content: prompt }] }),
      });
    } catch (netErr) {
      return res.status(502).json({
        error: `Could not reach ${provider || 'the provider'} at ${endpoint}. ${netErr?.message || 'Network error.'}`,
      });
    }
    if (!resp.ok) {
      let detail = '';
      try { detail = await resp.text(); } catch (_) { /* keep empty */ }
      return res.status(502).json({ error: `Provider returned HTTP ${resp.status}. ${detail.slice(0, 500)}` });
    }
    const raw = await resp.json();
    // Some OpenAI-compatible gateways (e.g. api.cline.bot) wrap the payload in a
    // top-level `data` key: {"data": {"choices": [...]}}. Unwrap before parsing.
    const data = raw?.data?.choices ? raw.data : raw;
    const content = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? (typeof data === 'string' ? data : '');
    if (!content) return res.status(502).json({ error: 'Provider returned an empty analysis.' });
    res.json({ analysis: content, endpoint });
  }));

  // ---- TMS time records persistence (mirrors the browser tmsStore) ----
  // Authenticated. Save = full snapshot replace (transactional).
  // Only finalized/stopped data is stored — live running/paused timers
  // keep ticking in the browser only.
  // Prisma value helpers: plain Date / BigInt (no mssql typed wrappers).
  const T = (v) => (v ? new Date(v) : null);
  const I = (v) => (v === null || v === undefined ? null : BigInt(Number(v) || 0));

  app.get('/api/tms-records/status', authReq, wrap(async (req, res) => {
    const [employees, tasks, assignments, shiftDefinitions, shiftRecords, taskEntries, pauseEvents, breakRecords] =
      await Promise.all([
        prisma.tmsEmployee.count(), prisma.tmsTask.count(), prisma.tmsAssignment.count(),
        prisma.tmsShiftDefinition.count(), prisma.tmsShiftRecord.count(), prisma.tmsTaskEntry.count(),
        prisma.tmsPauseEvent.count(), prisma.tmsBreakRecord.count(),
      ]);
    const counts = {
      TmsEmployee: employees, TmsTask: tasks, TmsAssignment: assignments,
      TmsShiftDefinition: shiftDefinitions, TmsShiftRecord: shiftRecords,
      TmsTaskEntry: taskEntries, TmsPauseEvent: pauseEvents, TmsBreakRecord: breakRecords,
    };
    const snap = await prisma.tmsSnapshot.findFirst({ orderBy: { id: 'desc' } }).catch(() => null);
    res.json({ ok: true, counts, lastSavedAt: snap?.savedAt || null });
  }));

  app.get('/api/tms-records/load', authReq, wrap(async (req, res) => {
    const [employees, tasks, assignments, shiftDefinitions, shiftRecords, taskEntries, pauseEvents, breakRecords] =
      await Promise.all([
        prisma.tmsEmployee.findMany({ orderBy: { name: 'asc' } }),
        prisma.tmsTask.findMany({ orderBy: { name: 'asc' } }),
        prisma.tmsAssignment.findMany({ orderBy: { id: 'asc' } }),
        prisma.tmsShiftDefinition.findMany({ orderBy: { name: 'asc' } }),
        prisma.tmsShiftRecord.findMany({ orderBy: { date: 'asc' } }),
        prisma.tmsTaskEntry.findMany({ orderBy: { date: 'asc' } }),
        prisma.tmsPauseEvent.findMany({ orderBy: { id: 'asc' } }),
        prisma.tmsBreakRecord.findMany({ orderBy: { date: 'asc' } }),
      ]);
    const byEntry = {};
    pauseEvents.forEach((p) => {
      const k = p.taskEntryId;
      (byEntry[k] = byEntry[k] || []).push({
        id: p.id,
        timePaused: p.timePaused ? new Date(p.timePaused).toISOString() : null,
        timeResumed: p.timeResumed ? new Date(p.timeResumed).toISOString() : null,
        intervalMs: p.intervalMs === null ? null : Number(p.intervalMs),
      });
    });
    res.json({
      ok: true,
      employees: employees.map((e) => ({ id: e.id, name: e.name, notes: e.notes || "", remarks: e.remarks || "" })),
      tasks: tasks.map((t) => ({ id: t.id, name: t.name })),
      assignments: assignments.map((a) => ({ id: a.id, employeeId: a.employeeId, taskId: a.taskId })),
      shiftDefinitions: shiftDefinitions.map((d) => ({ id: d.id, name: d.name, start: d.startHhmm, end: d.endHhmm })),
      shiftRecords: shiftRecords.map((r) => ({
        id: r.id, employeeId: r.employeeId, date: r.date, shiftTime: r.shiftTime,
        timeInYard: r.timeInYard ? new Date(r.timeInYard).toISOString() : null,
        timeOutYard: r.timeOutYard ? new Date(r.timeOutYard).toISOString() : null,
        attendanceStatus: r.attendanceStatus, reason: r.reason, notes: r.notes, remarks: r.remarks,
      })),
      taskTimeEntries: taskEntries.map((e) => ({
        key: `${e.employeeId}:${e.taskId}`, id: e.id, employeeId: e.employeeId, taskId: e.taskId,
        date: e.date,
        timeStarted: e.timeStarted ? new Date(e.timeStarted).toISOString() : null,
        runningSince: null, accumulatedActiveMs: Number(e.totalDurationMs) || 0,
        pausedAt: null, pauseEvents: byEntry[e.id] || [],
        timeFinished: e.timeFinished ? new Date(e.timeFinished).toISOString() : null,
        totalDurationMs: Number(e.totalDurationMs) || 0,
        totalPausedMs: Number(e.totalPausedMs) || 0,
        status: e.status || 'stopped', triggeringLevel: e.triggeringLevel,
      })),
      breakRecords: breakRecords.map((b) => ({
        id: b.id, employeeId: b.employeeId, date: b.date,
        timeStarted: b.timeStarted ? new Date(b.timeStarted).toISOString() : null,
        timeFinished: b.timeFinished ? new Date(b.timeFinished).toISOString() : null,
        durationMs: b.durationMs === null ? null : Number(b.durationMs),
        status: b.status,
      })),
    });
  }));

  app.post('/api/tms-records/save', authReq, wrap(async (req, res) => {
    const b = req.body || {};
    // Prisma value helpers above return plain Date / BigInt | null.
    // createMany rows must not contain undefined — normalize to null.
    const employees = (b.employees || []).map((e) => ({ id: e.id, name: e.name, notes: e.notes || null, remarks: e.remarks || null }));
    const tasks = (b.tasks || []).map((t) => ({ id: t.id, name: t.name }));
    const assignments = (b.assignments || []).map((a) => ({ id: a.id, employeeId: a.employeeId, taskId: a.taskId }));
    const shiftDefinitions = (b.shiftDefinitions || []).map((d) => ({ id: d.id, name: d.name, startHhmm: d.start, endHhmm: d.end }));
    const shiftRecords = (b.shiftRecords || []).map((r) => ({
      id: r.id, employeeId: r.employeeId, date: r.date, shiftTime: r.shiftTime || null,
      timeInYard: T(r.timeInYard), timeOutYard: T(r.timeOutYard),
      attendanceStatus: r.attendanceStatus || null, reason: r.reason || null,
      notes: r.notes || null, remarks: r.remarks || null,
    }));
    const entries = b.taskTimeEntries || [];
    const taskEntries = entries.map((e) => ({
      id: e.id, employeeId: e.employeeId, taskId: e.taskId, date: e.date,
      timeStarted: T(e.timeStarted), timeFinished: T(e.timeFinished),
      totalDurationMs: I(e.totalDurationMs) ?? BigInt(0),
      totalPausedMs: I(e.totalPausedMs) ?? BigInt(0),
      status: e.status || 'stopped', triggeringLevel: e.triggeringLevel || null,
    }));
    const pauses = [];
    entries.forEach((e) => (e.pauseEvents || []).forEach((pe, i) => pauses.push({
      id: pe.id || `${e.id}:pe${i}`, taskEntryId: e.id,
      timePaused: T(pe.timePaused), timeResumed: T(pe.timeResumed),
      intervalMs: pe.intervalMs === null || pe.intervalMs === undefined ? null : I(pe.intervalMs),
    })));
    const breakRecords = (b.breakRecords || []).map((x) => ({
      id: x.id, employeeId: x.employeeId, date: x.date,
      timeStarted: T(x.timeStarted), timeFinished: T(x.timeFinished),
      durationMs: x.durationMs === null || x.durationMs === undefined ? null : I(x.durationMs),
      status: x.status || null,
    }));
    // Full snapshot replace in one transaction (delete children first).
    await prisma.$transaction([
      prisma.tmsPauseEvent.deleteMany(),
      prisma.tmsTaskEntry.deleteMany(),
      prisma.tmsShiftRecord.deleteMany(),
      prisma.tmsBreakRecord.deleteMany(),
      prisma.tmsAssignment.deleteMany(),
      prisma.tmsShiftDefinition.deleteMany(),
      prisma.tmsTask.deleteMany(),
      prisma.tmsEmployee.deleteMany(),
      ...(employees.length ? [prisma.tmsEmployee.createMany({ data: employees })] : []),
      ...(tasks.length ? [prisma.tmsTask.createMany({ data: tasks })] : []),
      ...(assignments.length ? [prisma.tmsAssignment.createMany({ data: assignments })] : []),
      ...(shiftDefinitions.length ? [prisma.tmsShiftDefinition.createMany({ data: shiftDefinitions })] : []),
      ...(shiftRecords.length ? [prisma.tmsShiftRecord.createMany({ data: shiftRecords })] : []),
      ...(taskEntries.length ? [prisma.tmsTaskEntry.createMany({ data: taskEntries })] : []),
      ...(pauses.length ? [prisma.tmsPauseEvent.createMany({ data: pauses })] : []),
      ...(breakRecords.length ? [prisma.tmsBreakRecord.createMany({ data: breakRecords })] : []),
      prisma.tmsSnapshot.create({ data: { savedBy: req.user.email, entryCount: entries.length } }),
    ]);
    res.json({ ok: true, saved: { employees: employees.length, tasks: tasks.length, entries: entries.length, pauses: pauses.length } });
  }));
  app.use((err, req, res, next) => {
    console.error('[error]', err.message || err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  });

  app.listen(PORT, () => console.log(`[api] TMS backend listening on http://localhost:${PORT}`));
}

main().catch(e => { console.error('[fatal]', e); process.exit(1); });
