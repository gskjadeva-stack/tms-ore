# TempoFlow (TMS_hermes) — User Guide: Paano i-run ang Both Servers

> Lahat ng nasa guide na ito ay tested at working as of 2026-09-23.
> Backend: Express + SQL Server (`TMS` database sa `.\SQLEXPRESS`), port **3010**
> Frontend: Vite (React), port **5173**

---

## 1. One-time setup (gawin lang isang beses)

Bukas ka ng **Git Bash** (o kahit anong terminal) sa project folder:

```
C:\ADEVA\ORE Projects\TMS_hermes
```

```bash
# a) Frontend dependencies
npm install

# b) Backend dependencies
cd server
npm install

# c) Database — gagawa ng TMS database, User table, at tms_app SQL login
sqlcmd -S ".\SQLEXPRESS" -E -C -i schema.sql
```

> Kung sasabihin ng sqlcmd na "already exists" — OK lang, ibig sabihin
> nagawa na. Huwag ulitin nang paulit-ulit.

**Tignan kung tama ang `server\.env`:**

```
PORT=3010
MSSQL_SERVER=.\SQLEXPRESS
MSSQL_DATABASE=TMS
MSSQL_USER=tms_app
MSSQL_PASSWORD=TmsLocal2026!
```

---

## 2. I-run ang BOTH servers (dalawang terminal, hindi pwedeng isa lang)

### Terminal 1 — Backend (port 3010)

```bash
cd "C:\ADEVA\ORE Projects\TMS_hermes\server"
npm start
```

Expected output:
```
[db] connected to localhost\SQLEXPRESS/TMS
[api] TMS backend listening on http://localhost:3010
```

**HUWAG isara itong terminal habang gumagamit ka ng app** — kapag sinara mo,
mamamatay ang backend at mag-eerror lahat ng login/LLM calls.

### Terminal 2 — Frontend (port 5173)

Bagong terminal window:

```bash
cd "C:\ADEVA\ORE Projects\TMS_hermes"
npm run dev
```

Expected output:
```
VITE v8.3.0  ready in XXX ms
➜  Local:   http://localhost:5173/
```

### Bukas: http://localhost:5173

Ide-redirect ka sa **/login**. Wala pang account? I-click ang **"Create one"**
o pumunta sa **/register**.

---

## 3. Pag-register ng bagong user (first time)

1. Sa **/register**: ilagay email + password + confirm password → **Create account**
2. Lilitaw ang **"Verify your email"** screen na hihingi ng 6-digit code.
3. **Dito makikita ang code:** sa **Terminal 1 (backend)**, may lalabas na linya:
   ```
   [auth] register OTP for <email-mo>: 175917
   ```
   *(Walang email na tumatawag locally — backend console ang "inbox".)*
4. I-type ang code sa OTP screen → **Verify**
5. Awtomatikong papasok ka sa **Time Capture** screen.

**Kapag nakalimutan mo ang password:**
1. Sa **/login** → "Forgot password?" → ilagay ang email
2. Sa **backend console** may lalabas na `reset token for <email>: <hex>`
3. Puntahan sa browser: `http://localhost:5173/reset-password?token=<ang-hex-dito>`
4. Ilagay ang bagong password.

**May existing test account na:**
| Email | Password |
|---|---|
| `kijoh@tempoflow.local` | `Tempo2026!` |
| `cap@test.local` | `NewPass123!` |

---

## 4. Quick health check (para malaman mong buhay ang dalawa)

```bash
# Backend — dapat sumagot ng {"ok":true,"db":"TMS",...}
curl http://localhost:3010/api/health

# Frontend — dapat HTTP 200
curl -o /dev/null -w "%{http_code}" http://localhost:5173/
```

Kapag gumagana ang frontend pero nag-eerror ang login/register:
tignan mo kung buhay pa ang Terminal 1 (backend). Ang frontend ay
**naka-depende sa backend** — pinapasa lang nito ang `/api` calls
sa port 3010 (naka-config sa `vite.config.js`).

---

## 5. Troubleshooting

| Problema | Solusyon |
|---|---|
| `EADDRINUSE` sa backend | May ibang process sa 3010. Sarahan ang lumang node, o palitan ang `PORT` sa `server/.env` **at** ang `target` sa `vite.config.js` proxy. |
| Blank page sa 5173 | First load minsan 30–60s (malaking dep tree). Reload ulit pagkatapos maghintay. Kung dead pa rin, tignan ang `vite-dev.err.log` / i-restart ang Terminal 2. |
| "Invalid or expired verification code" | Expired ang OTP (10-min validity). Mag-click ng **Resend** — bagong code ang lalabas sa backend console. |
| Login failed pero tama ang password | Siguradong buhay ang backend: `curl http://localhost:3010/api/health`. |
| Nawala ang mga employee/tasks/shifts | Naka-localStorage ang TMS data — **per browser/per computer** iyan. Kapag nag-clear ka ng browser data, mawawala. Ang USERS lang ang naka-SQL. |
| Gustong mag-reset ng lahat | Browser DevTools → Application → Local Storage → `http://localhost:5173` → burahin ang `tms_state_v1` key. |

---

## 6. Ano ang nasaan

```
TMS_hermes/
├── server/                 ← BACKEND (Express + SQL Server)
│   ├── index.js            ← lahat ng API routes
│   ├── schema.sql          ← DB setup (TMS db, User table, tms_app login)
│   ├── .env                ← DB credentials (huwag i-commit)
│   └── backend.log         ← dito lumalabas ang OTP codes at errors
├── src/
│   ├── api/client.js       ← frontend→backend client
│   ├── lib/tmsStore.js     ← TMS data store (localStorage)
│   └── pages/              ← Login, Register, TimeCapture, Reports, atbp.
└── vite.config.js          ← frontend config + /api proxy
```

**Mga verified API endpoints ng backend:**

| Endpoint | Ginagawa |
|---|---|
| `GET /api/health` | Health check |
| `GET /api/app-settings` | App boot settings |
| `POST /api/auth/register` | Gumawa ng account (+ OTP) |
| `POST /api/auth/verify-otp` | I-verify ang email |
| `POST /api/auth/resend-otp` | Bagong OTP |
| `POST /api/auth/login` | Email + password login |
| `POST /api/auth/reset-password-request` | Reset token (sa console lumalabas) |
| `POST /api/auth/reset-password` | I-set ang bagong password |
| `GET /api/auth/me` | Current user (kailangan ng Bearer token) |
| `POST /api/functions/runLlmAnalysis` | LLM proxy (Reports page) — kailangan ng API key na naka-config sa Settings → LLM Configuration |
