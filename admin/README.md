# Counterpick Admin

Production administrative console for Counterpick. The interface reads data from the protected same-origin API and contains no runtime fixtures or local fake mutations.

## Authentication

1. An administrator enters `ADMIN_API_KEY` on the login screen.
2. The browser sends it once to `POST /v1/admin/session`.
3. The key is not saved. Only the returned 15-minute admin JWT is stored in `sessionStorage`.
4. Every subsequent request uses `Authorization: Bearer <token>`.
5. Closing the tab removes the session. A `401` response signs the administrator out.

Never put `ADMIN_API_KEY` in a Vite environment variable or browser bundle.

## Real data

The console uses these protected server endpoints:

- `GET /v1/admin/overview?days=7|30`
- `GET /v1/admin/users?q=&kind=&plan=&limit=&offset=`
- `GET /v1/admin/analyses?id=&accountId=&q=&status=&source=&limit=&offset=`
- `GET /v1/admin/reviews?accountId=&q=&rating=&hasComment=&limit=&offset=`
- `DELETE /v1/admin/reviews/:id`
- `GET /v1/admin/meta?rank=1..8`
- `GET /v1/admin/system`
- `GET /v1/admin/diagnostics/sessions?limit=&offset=&q=&appVersion=&mode=&status=&hasErrors=&from=&to=`
- `GET /v1/admin/diagnostics/sessions/:id?limit=&beforeSequence=`
- `POST /v1/admin/grants/pro-all`

Account deletion, suspension, quota edits, session revocation and analysis retry are not exposed because protected mutation endpoints and action auditing are not implemented. The UI does not render placeholder controls for them.

## Development

Requirements: Node.js 24 and npm.

```powershell
npm ci
npm run dev
```

The UI expects the API at same-origin `/v1/admin`. The Vite development server proxies `/v1` to `http://127.0.0.1:4000`; run the backend there for local full-stack testing.

## Build

```powershell
npm run typecheck
npm run build
```

Vite builds with `base: '/admin/'`. The backend serves the generated assets and SPA fallback from `/admin/`, keeping authentication and data requests same-origin.

## Operational notes

- Search, filters and pagination for users, analyses and reviews run on the server and expose the real total.
- User details expose stored account, plan, quota, billing timestamps and aggregate analysis counts, with exact links to account-scoped analyses and reviews.
- Analysis details expose the saved draft, recommendation assets and metrics, revision, quota events and payload provenance. Historical payloads that do not match the current schema remain isolated as raw JSON instead of failing the whole page.
- Source screenshots are processed in memory and intentionally not stored. The console shows retention status and metadata without inventing a preview.
- Every data screen has loading, error, empty and retry states.
- Overview and Meta charts expose cursor-following tooltips and keyboard focus states.
- Meta reads the cached, validated OpenDota snapshot through the backend and reports stale or unavailable data honestly.
- Review deletion is a real irreversible database operation and requires confirmation.
- The Pro grant is a real idempotent bulk operation and requires confirmation.
- System integration groups come from the backend audit response: connected, connectable now, and blocked pending schema or telemetry.
- Admin API responses use `Cache-Control: no-store` and `Pragma: no-cache` so account and diagnostic data are not retained in the browser cache after logout.
- The overview shows recent billing webhook and admin audit events. Full raw journals are not exposed until redaction, retention and pagination policies are defined.
- Diagnostics lists only sessions uploaded after a user explicitly opted in. Local logs are never read by this page, and remote sessions expire after at most 30 days.
- To investigate a draft, open its timeline and compare recognized slot/hero/side data with acknowledged `overlay_state.visibleSlots`, pick count, orientation source and ally group. Older events use a stable sequence cursor and preserve the total captured when the timeline was opened; refresh explicitly to include newer events. Request the user's separate local log only if the structured events are insufficient.
- Diagnostics intentionally omits screenshots, image bytes, raw GSI, names, Steam IDs, tokens, file paths, error messages and stack traces. Do not add a raw-payload viewer that bypasses this contract.
