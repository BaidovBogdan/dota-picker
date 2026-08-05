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

The console uses these production endpoints:

- `GET /v1/admin/overview?days=7|30`
- `GET /v1/admin/users`
- `GET /v1/admin/analyses`
- `GET /v1/admin/reviews`
- `DELETE /v1/admin/reviews/:id`
- `GET /v1/admin/system`
- `POST /v1/admin/grants/pro-all`

The Meta page intentionally displays an unavailable state until a dedicated audited admin snapshot contract exists. Account deletion, suspension, quota edits, session revocation and analysis retry are also disabled until protected endpoints and action auditing are implemented.

## Development

Requirements: Node.js 24 and npm.

```powershell
npm ci
npm run dev
```

The UI expects the API at same-origin `/v1/admin`. For local full-stack testing, open it through the server or configure a local reverse proxy that routes `/v1` to the Counterpick backend.

## Build

```powershell
npm run typecheck
npm run build
```

Vite builds with `base: '/admin/'`. The backend serves the generated assets and SPA fallback from `/admin/`, keeping authentication and data requests same-origin.

## Operational notes

- All lists show the number loaded and the real server-side total when it is larger.
- Every data screen has loading, error, empty and retry states.
- Review deletion is a real irreversible database operation and requires confirmation.
- The Pro grant is a real idempotent bulk operation and requires confirmation.
- System integration groups come from the backend audit response: connected, connectable now, and blocked pending schema or telemetry.
