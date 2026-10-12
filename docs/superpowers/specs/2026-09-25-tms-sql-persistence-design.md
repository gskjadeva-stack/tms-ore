# TempoFlow Time & Motion Study — SQL Persistence Design

- **Date:** 2026-09-25
- **Status:** User-approved design; awaiting written-spec review
- **Project:** `C:\ADEVA\ORE Projects\TMS_hermes`
- **Scope:** Persist the shared TMS working dataset in the existing local SQL Server database and reload it after browser refresh, browser-data clearing, or use on another computer.

## 1. Goals and non-goals

### Goals

1. Save the complete Time & Motion Study working dataset to SQL Server through one global **Universal Save** button.
2. Reload the latest shared dataset from SQL after authentication and application startup.
3. Preserve current Task, Break, Yard, history, and Settings data when SQL persistence is introduced.
4. Make all authenticated users share one dataset.
5. Detect concurrent saves and reject stale writes without silently overwriting newer SQL data.
6. Keep the LLM API key out of client-readable SQL responses while allowing any authenticated user to replace it through Settings.
7. Preserve existing UTC timestamp storage, local-time display, manual time input, history stacking, authentication, and Reports behavior.

### Non-goals

- No normalized per-record SQL tables.
- No operation-by-operation SQL writes.
- No per-user datasets.
- No force-overwrite button for conflicts.
- No cloud synchronization or multi-database replication.
- No change to the existing login and registration workflows beyond reusing their authenticated backend boundary.

## 2. Verified baseline

The current frontend keeps the complete working state in browser `localStorage` under `tms_state_v1`. `tmsStore.js` loads that state at module initialization and persists it after each local mutation. A normal page refresh therefore restores records in the same browser profile, but clearing browser storage or using another computer does not.

The verified SQL database currently contains only `dbo.[User]` (the authentication table). There are no TMS persistence tables yet. The existing backend is Express + `mssql` against the local SQL Server database, and authentication is already enforced by the existing token middleware.

## 3. Chosen architecture

Use one shared, versioned SQL snapshot rather than normalized tables or immediate operation persistence.

Create a single `dbo.TmsDataset` row identified by `Id = 1`. The row contains:

- `Id int NOT NULL` — fixed shared dataset identifier.
- `Version int NOT NULL` — monotonically increasing save version.
- `StateJson nvarchar(max) NOT NULL` — complete non-secret TMS working state; the client must remove `settings.llm.apiKey` before serialization.
- `LlmSecret varbinary(max) NULL` — encrypted LLM API key.
- `LlmConfigJson nvarchar(max) NOT NULL` — provider, model, base URL, and non-secret configuration metadata.
- `UpdatedAt datetime2 NOT NULL` — last successful commit time.
- `UpdatedBy int NOT NULL` — foreign key to `dbo.[User]`.

The LLM secret is stored separately from `StateJson` even though it is part of the same shared dataset transaction. This prevents the secret from being returned by the state endpoint or accidentally rendered in a general settings response.

`localStorage` remains the browser's working copy/draft cache. It is not the durable source of truth after SQL initialization.

## 4. Backend API and security

All TMS persistence endpoints require the existing authenticated-user middleware.

### `GET /api/tms/state`

Returns:

```json
{
  "version": 3,
  "state": {},
  "llmConfig": {
    "provider": "",
    "model": "",
    "baseUrl": "",
    "hasApiKey": true
  },
  "updatedAt": "UTC ISO timestamp",
  "updatedBy": 12
}
```

The response must never contain the full LLM API key. The frontend receives only masked/presence metadata.

### `PUT /api/tms/state`

Request body:

```json
{
  "baseVersion": 3,
  "state": {},
  "llm": {
    "provider": "OpenAI",
    "model": "model-name",
    "baseUrl": "https://provider.example/v1",
    "apiKey": "new-key-or-empty"
  }
}
```

Rules:

1. Validate the authenticated user and request body.
2. Validate that `state` is a JSON object and does not contain an unbounded value beyond the existing API request limit.
3. If `apiKey` is non-empty, encrypt it with AES-256-GCM using a backend-only key.
4. If `apiKey` is empty, preserve the existing encrypted secret.
5. If `baseVersion` does not match the current SQL version, return HTTP `409` and do not change the row.
6. On a matching version, update the state, LLM config, optional secret, version, timestamp, and user in one SQL transaction.
7. Return the new version and metadata. Never return the secret.

The version check and update must be atomic at the SQL level. Do not implement it as an unprotected read followed by a separate write.

### LLM analysis endpoint

The existing `POST /api/functions/runLlmAnalysis` remains authenticated. The browser sends the prompt and employee/report context, but no API key. The backend reads the shared LLM configuration and decrypts the stored key before calling the provider. The existing provider-response parsing remains unchanged.

## 5. One-time localStorage migration

On authenticated application startup:

1. Request the current SQL dataset.
2. If SQL contains a dataset, use it and do not merge local storage.
3. If SQL is empty and `tms_state_v1` exists, import that state once, including its current LLM configuration/key, and save it as version `1`.
4. If SQL is empty and no local state exists, create the default state as version `1`.
5. Mark the migration as complete through the existence of the SQL row; do not add a second migration marker table.
6. Use an atomic insert/duplicate-key result for the initial row. If two browsers attempt first import concurrently, exactly one row may create version `1`; the other retries as a normal SQL load and does not overwrite the winner.

The migration must be safe to retry after a failed request. A failed import leaves SQL empty and the browser draft intact. A successful import is the only path that changes SQL state.

## 6. Frontend state and Universal Save

The existing store remains the component-facing state boundary, but it gains a small persistence controller around the existing actions rather than replacing all timer logic.

### Working-copy lifecycle

- On authenticated startup, load SQL state before rendering the main app.
- The controller stores `loadedVersion`, `status`, and the last server error.
- Any local mutation marks the working copy `Unsaved` and updates the local draft cache.
- `Universal Save` sends the complete working state and current LLM config/key input in one request.
- Success sets `loadedVersion` to the returned version and status to `Saved`.
- Failure leaves the working copy intact and status `Unsaved` with the actual error message.

### Global control

Replace the current sidebar footer text `Data stored locally in this browser.` with a persistence status area in `Layout.jsx`:

- source label: `Data source: SQL Server`
- status: `Saved`, `Unsaved`, `Saving`, or `Conflict`
- one `Universal Save` button available on every authenticated main page
- disabled while loading or saving

No per-row Save buttons are added. Existing Start, Stop, Pause, Resume, manual-entry, and editing controls continue to change only the local working copy until Universal Save is pressed.

## 7. Reload, conflicts, and failure behavior

### Startup failure

If authenticated startup cannot load SQL, show a blocking error with a `Retry` action. Do not silently load stale browser data as if it were the latest saved dataset.

### Unsaved browser navigation/reload

- The persistence controller must use a page `beforeunload` guard only when the working copy is `Unsaved`; normal in-app route changes do not require a browser unload confirmation.
- On an accepted page reload, the authenticated app performs a fresh SQL load. If the user cancels, keep the current working copy.

### Concurrent save conflict

A `409` response means another user has already committed a newer version.

- Preserve the local unsaved draft in memory/local draft cache.
- Do not replace it with SQL automatically.
- Show `Conflict detected` with:
  - `Reload latest`, which discards the draft only after explicit confirmation;
  - `Download unsaved copy`, which exports the draft as JSON before any discard.
- Do not provide a force-overwrite path in this minimum design.

## 8. LLM Settings and Reports behavior

Settings displays the provider, model, and base URL. The API key input is blank on load and shows `Stored securely` when the server reports that a key exists. A blank key means “keep the existing key.” A non-blank value is included only in the next Universal Save request.

The LLM key is encrypted at rest with AES-256-GCM. The encryption key is backend-only configuration in `server/.env`; it is not sent to the browser and is not placed in `StateJson`. The backend is the only component allowed to decrypt it. API responses expose only `hasApiKey` and non-secret configuration.

Reports must not send the API key from browser state. The Reports page sends the prompt and provider model/base URL are either sent as non-secret context or read by the backend from the shared configuration. The backend must use the stored encrypted key for the provider request.

## 9. Implementation boundaries

Expected production changes are limited to:

- `server/index.js` — SQL migration, authenticated TMS endpoints, transactional version check, encrypted key handling, and backend-only LLM secret use.
- `src/api/client.js` — typed fetch methods for the TMS state endpoints while preserving the existing B44-compatible client surface.
- `src/lib/tmsStore.js` — working-copy status/version integration and explicit save/load actions; timer/history behavior remains intact.
- One focused persistence/load module under `src/lib/` if needed to keep App/store concerns separated.
- `src/App.jsx` — load the shared state before rendering the authenticated main app and provide the blocking retry state.
- `src/components/Layout.jsx` — global Universal Save and persistence status.
- `src/pages/Settings.jsx` — write-only masked LLM key controls and SQL status.
- `src/pages/Reports.jsx` — remove browser-side API-key transmission.

No changes are planned to Time Capture timer semantics, manual time validation, 12-hour display formatting, task/break history stacking, authentication pages, or the existing provider response unwrapping.

## 10. Verification plan

Implementation must use test-first development. Each behavior is written and observed failing before the minimum production code is added.

### Store/controller tests

- SQL state replaces the local working copy.
- A local mutation changes `Saved` to `Unsaved`.
- One-time import occurs only when SQL is empty.
- Successful Save updates the loaded version.
- A `409` response preserves the local draft.
- Blank LLM key means preserve existing server secret.
- Startup SQL failure exposes retry and does not treat stale local data as current.
- Unsaved reload confirmation behavior is covered at the controller boundary.

### Backend tests

- All TMS endpoints reject missing/invalid authentication.
- First save creates version `1`.
- Matching `baseVersion` increments the version once.
- Stale `baseVersion` returns `409` and leaves SQL unchanged.
- State and LLM replacement commit atomically.
- The stored key is encrypted and no GET response includes the full key.
- Analysis uses the backend-stored key and retains the existing wrapped-response parsing.
- Repeated migration attempts do not duplicate a dataset after SQL is populated.
- Concurrent first imports create exactly one SQL dataset row.

### Static and live verification

- Existing utility and store tests remain green.
- Lint and production build pass, with the known pre-existing TypeScript baseline reported separately if it remains.
- Live authenticated E2E proves: save, browser-data clear, reload from SQL, visible history and Yard values, stale-save conflict, masked LLM Settings, and a real Reports request.
- Server cleanup is verified by process state, closed ports, and HTTP connection failure. No process is reported running based only on a startup banner or heartbeat.

## 11. Explicit non-implementation constraints

- Do not add normalized SQL tables unless the one-snapshot design is rejected in a later explicit design review.
- Do not silently overwrite stale saves.
- Do not return or log the LLM API key.
- Do not treat localStorage as the durable source of truth after SQL initialization.
- Do not claim Git commit status: the project directory is not currently a Git repository.
