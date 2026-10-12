# TempoFlow — Time & Motion Study (TMS_hermes)

Base44-exported React app, re-backed by a **local Express + SQL Server backend**
(`server/`, database `TMS` on `.\SQLEXPRESS`). The Base44 cloud backend and its
Deno dev runtime are gone; auth, app settings, and the LLM analysis proxy now
run locally. App data (employees/tasks/timers) still lives in the browser
(localStorage) by design — see `src/lib/tmsStore.js`.

## Prerequisites

1. Node.js 22+
2. SQL Server Express (`.\\SQLEXPRESS`), reachable as admin via `sqlcmd -E`

## One-time setup

```bash
npm install                    # frontend deps
cd server && npm install       # backend deps
sqlcmd -S ".\SQLEXPRESS" -E -C -i schema.sql   # creates TMS db, dbo.[User], tms_app login
```

`server/.env` holds the app's SQL login (tms_app — NOT integrated auth; the
mssql driver cannot authenticate via integrated auth on this box).

## Run locally (two servers)

```bash
# terminal 1 — backend on :3010
cd server && npm start

# terminal 2 — frontend on :5173 (proxies /api -> :3010)
npm run dev
```

Open http://localhost:5173 → redirected to /login. Register with any email;
**no SMTP locally** — the 6-digit OTP is printed to the backend console
(`[auth] register OTP for <email>: <code>`) and password-reset tokens likewise
(`dev_reset_token`).

## Checks

- `npm run build` — full production build
- `npm run lint` — eslint
- `curl http://localhost:3010/api/health` → `{"ok":true,"db":"TMS",...}`

## Production deploy (Vercel + Supabase)

**Status (2026-10-12): all local tasks complete, NOT yet deployed.**
Git has 2 commits (`632112d` port + `a9561e3` migration SQL). Tests green
(smoke 4/4, tmsUtils 9/9), `prisma validate` valid, Prisma Client 5.22.0
generated, `npm run lint` clean, `npm run build` succeeded (16.99s),
`prisma/migration.sql` (129 lines, 10 tables) committed. There is no live
frontend or backend URL until the steps below run on a machine with
Supabase/Vercel network access (direct DB host is ENOTFOUND from the
sandbox; no Vercel session exists). Do not invent URLs — the
Vercel-assigned `https://<project>.vercel.app` appears only after
`vercel --prod`.

What exists: `api/**/*.js` serverless handlers (Prisma + Postgres port
of `server/index.js`), `prisma/schema.prisma` (9 tables mirroring
`server/schema.sql`), `vercel.json` (single project: `dist/` +
`/api/*`, SPA fallback), `package.json` scripts `vercel-build` +
`db:migrate`, `tests/api-smoke.mjs` (4 passing, no DB needed),
`prisma validate` passing, `node --check` clean on all handlers.

Steps (operator-run; secrets via dashboard/`.env` only, never commit):

```powershell
cd c:\ADEVA\Projects\TMS_hermes
npm install
# create .env (NOT committed; see .env.example): DATABASE_URL (pooler
# 6543 ?pgbouncer=true), DIRECT_URL (5432), TOKEN_SECRET (random 32B hex)
npx prisma migrate dev --name init   # or: npm run db:migrate (deploy)
npm run lint
npm run build
git init; git add -A; git commit -m "Vercel+Supabase port"
npx vercel login
npx vercel link                      # team: gskjadeva-6395's projects
npx vercel env add DATABASE_URL
npx vercel env add DIRECT_URL
npx vercel env add TOKEN_SECRET
npx vercel --prod
```

After deploy: frontend + backend share ONE URL —
`https://<project>.vercel.app` and `https://<project>.vercel.app/api/*`.
Verify: `GET /api/health`, full auth flow, `tms-records/save→load`,
Reports LLM proxy, no `dev_otp` in prod JSON, deep link `/records`
loads `index.html`. Supabase Table Editor must show the 9 tables.

Notes: `server/` stays local-dev only (SQL Server). `api/` is the prod
path (Supabase Postgres). OTP has no SMTP — prod logs server-side only.

## Backend surface

`server/index.js` (Express + mssql, port from `server/.env`, default 3010):

- `GET /api/health`
- `GET /api/app-settings` (public settings gate for AuthContext boot)
- `POST /api/auth/register | verify-otp | resend-otp | login | reset-password-request | reset-password`
- `GET /api/auth/me` (Bearer token)
- `POST /api/functions/runLlmAnalysis` (proxies a user-configured OpenAI-compatible endpoint; credentials come from Settings → LLM configuration in the UI)

The frontend client is `src/api/client.js` — it sets `globalThis.__B44_DB__`
so the legacy stub lines at the top of the page files bind to it (same pattern
as the Bukidnon local backend).
