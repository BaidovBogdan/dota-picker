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
- `GET /v1/admin/analyses?q=&status=&source=&limit=&offset=`
- `GET /v1/admin/reviews?q=&rating=&hasComment=&limit=&offset=`
- `DELETE /v1/admin/reviews/:id`
- `GET /v1/admin/meta?rank=1..8`
- `GET /v1/admin/system`
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
- Every data screen has loading, error, empty and retry states.
- Overview and Meta charts expose cursor-following tooltips and keyboard focus states.
- Meta reads the cached, validated OpenDota snapshot through the backend and reports stale or unavailable data honestly.
- Review deletion is a real irreversible database operation and requires confirmation.
- The Pro grant is a real idempotent bulk operation and requires confirmation.
- System integration groups come from the backend audit response: connected, connectable now, and blocked pending schema or telemetry.
