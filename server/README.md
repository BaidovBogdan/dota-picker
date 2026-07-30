# Counterpick API

The Counterpick API provides guest and account authentication, quota management, Dota 2 hero data, image recognition, counterpick recommendations, analysis history, feedback, and billing synchronization for the mobile application.

Recommendations use a hybrid pipeline:

1. OpenDota data produces a deterministic, role-compatible candidate pool.
2. Gemini may rerank only those candidates under a constrained response schema.
3. The deterministic ranking remains the safe fallback when Gemini is disabled, unavailable, invalid, or too slow.

## Stack

- Node.js 24 and TypeScript 6
- Fastify 5 with Zod validation
- PostgreSQL and Drizzle ORM
- JWT access tokens, rotating opaque refresh tokens, and Argon2id
- OpenDota for heroes, meta, and matchup statistics
- Gemini for photo recognition and optional recommendation reranking
- Swagger/OpenAPI, Helmet, CORS, rate limiting, and Pino
- Vitest and ESLint

## Local setup

Requirements:

- Node.js 24 and npm
- Docker Desktop with Compose, or an accessible PostgreSQL instance
- Access to the OpenDota API
- A Gemini API key only if photo recognition or AI reranking must run

From the `server` directory:

```powershell
Copy-Item .env.example .env
docker compose up -d postgres
npm ci
npm run db:migrate
npm run dev
```

The API starts on `http://localhost:4000` by default. Useful local endpoints:

- OpenAPI UI: `http://localhost:4000/docs`
- Liveness: `http://localhost:4000/health/live`
- Readiness, including the database check: `http://localhost:4000/health/ready`

Migrations do not run automatically when the server starts.

## Environment

Use `.env.example` as the complete source of supported variables. The main groups are:

| Group | Variables |
| --- | --- |
| Runtime | `NODE_ENV`, `HOST`, `PORT`, `TRUST_PROXY`, `LOG_LEVEL`, `CORS_ORIGINS` |
| Database | `DATABASE_URL`, `MIGRATION_DATABASE_URL` |
| Authentication | `JWT_SECRET`, `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL_DAYS` |
| OTP | `OTP_STATIC_CODE`, `ALLOW_STATIC_OTP_IN_PRODUCTION`, TTL, attempt, cooldown, and rate-window settings |
| Quotas | `FREE_QUOTA_*`, `PRO_QUOTA_*` |
| OpenDota | `OPEN_DOTA_BASE_URL`, timeout, fresh-cache, and stale-cache settings |
| Gemini | `GEMINI_API_KEY`, vision and recommendation models, and timeouts |
| Uploads | `MAX_IMAGE_BYTES` |
| Idempotency | `IDEMPOTENCY_TTL_HOURS`, `IDEMPOTENCY_LEASE_SECONDS` |
| Billing | RevenueCat webhook secret, entitlement ID, app IDs, and sandbox policy |
| Administration | `ADMIN_API_KEY` |

`JWT_SECRET` must contain at least 32 characters. `REVENUECAT_WEBHOOK_SECRET` must contain at least 24 characters for the server to boot.

`MIGRATION_DATABASE_URL` is optional locally. In hosted PostgreSQL environments, use a pooled URL for `DATABASE_URL` and a direct URL for migrations when the provider recommends that split.

## OTP status

OTP challenges use four digits. The current pre-launch environment can accept the static code `1234` when `OTP_STATIC_CODE=1234` is configured.

This mode does not send email and is not suitable for a public release. Before production traffic:

- integrate an email provider;
- remove `OTP_STATIC_CODE`;
- set `ALLOW_STATIC_OTP_IN_PRODUCTION=false`;
- verify resend throttling, expiry, attempt limits, and abuse monitoring.

The Render blueprint currently enables the static code intentionally for private pre-launch testing.

## API overview

All product routes use the `/v1` prefix. Request and response schemas are available in Swagger.

### Authentication

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/v1/auth/guest` | Create or resume a device-bound guest account |
| `POST` | `/v1/auth/otp/request` | Request an OTP challenge for registration, login, or reset |
| `POST` | `/v1/auth/otp/request-authenticated` | Request an OTP challenge for an authenticated account action |
| `POST` | `/v1/auth/register` | Create an account after a valid OTP challenge |
| `POST` | `/v1/auth/login` | Sign in with password and OTP verification |
| `POST` | `/v1/auth/upgrade-guest` | Convert the authenticated guest into an account |
| `POST` | `/v1/auth/password/reset` | Reset a password with an OTP challenge |
| `POST` | `/v1/auth/password/change` | Change a password with current credentials and OTP |
| `POST` | `/v1/auth/refresh` | Rotate a refresh token and issue a new access token |
| `POST` | `/v1/auth/logout` | Revoke a refresh token |

Registration, login, guest upgrade, and password operations consume the `challengeId` returned by the OTP request plus a four-digit code delivered out of band. In the current pre-launch static mode, that code is `1234`.

### Account and quota

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/v1/me` | Read the authenticated account |
| `DELETE` | `/v1/me` | Delete the authenticated account |
| `GET` | `/v1/quota` | Read the authoritative quota state |
| `POST` | `/v1/quota/reset` | Reset quota in non-production environments only |

Default limits are three free attempts with one refill every 24 hours, and a Pro capacity of 100 refilled to 100 every 24 hours. All values are configurable.

### Heroes and meta

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/v1/heroes` | Hero catalog and rank-aware statistics |
| `GET` | `/v1/heroes/meta` | Current patch and data-refresh metadata |
| `GET` | `/v1/heroes/meta-positions` | Eligible hero-position statistics for the selected rank |
| `GET` | `/v1/heroes/:heroId/detail` | Rank win rates and recent build timing groups |

Meta responses use a fresh cache and may use a bounded stale snapshot when OpenDota is temporarily unavailable.

### Analyses

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/v1/analyses/manual` | Create recommendations from a structured draft |
| `POST` | `/v1/analyses/photo/recognize` | Recognize heroes from one image |
| `POST` | `/v1/analyses/desktop` | Recognize a desktop draft frame and create at most one result per draft session |
| `GET` | `/v1/analyses/history` | Read paginated account history |
| `GET` | `/v1/analyses/history/:id` | Read one saved analysis |

Analysis POST routes require `Authorization: Bearer <token>` and a unique `Idempotency-Key`. Reusing the same key with the same request returns the stored result; reusing it for different input is rejected.

Photo recognition accepts one multipart field named `image`. Supported types are JPEG, PNG, and WebP. The default maximum size is 5 MiB. The image is validated, EXIF-oriented, bounded, and processed in memory rather than stored as an analysis attachment. A direct narrow pick bar stays intact; full screenshots, letterboxed captures, and portrait or landscape monitor photos use bounded horizontal candidate extraction so the central hero grid is not submitted as a pick list. Recognized identities remain review-required because provider confidence is not independent visual proof.

Desktop analysis accepts the same in-memory image formats plus `sessionId`, `revision`, `position`, and optional `rank` query parameters. It returns `waiting` until at least two enemy picks are recognized confidently, then reserves one quota attempt and returns `completed`. Frame and session idempotency prevent duplicate recognition and duplicate quota charges.

### Reviews

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/v1/analyses/:id/review` | Create or update the authenticated user's review |
| `GET` | `/v1/account/reviews` | List the authenticated user's reviews |
| `DELETE` | `/v1/account/reviews/:id` | Delete the authenticated user's review |
| `GET` | `/v1/admin/reviews` | List reviews for moderation |
| `DELETE` | `/v1/admin/reviews/:id` | Delete a review as an administrator |

Admin review routes use the `x-admin-key` header. That key must remain server-side and must never be embedded in the admin browser bundle.

### Billing

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/v1/billing/status` | Read the current entitlement and quota state |
| `POST` | `/v1/billing/webhooks/revenuecat` | Apply verified RevenueCat entitlement events |

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the TypeScript server in watch mode |
| `npm run build` | Compile the production server |
| `npm start` | Run the compiled server |
| `npm run typecheck` | Type-check without emitting files |
| `npm run lint` | Run ESLint |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run eval:photo` | Run the opt-in real-provider photo corpus; requires `QA_EMAIL` and `QA_PASSWORD` |
| `npm run db:generate` | Generate a Drizzle migration |
| `npm run db:migrate` | Apply pending migrations |

## Deployment

The repository includes:

- `server/Dockerfile` for a production container;
- `render.yaml` for the current Render service;
- a readiness endpoint at `/health/ready`;
- a CI workflow that can run checks and database migrations before deployment.

Use deployment secrets for the database, JWT, Gemini, RevenueCat, and admin values. Do not commit a populated `.env`.

## Operational guarantees

- Authenticated analysis ownership is checked before history or review access.
- Refresh tokens rotate and can be revoked.
- Photo recognition has user and IP rate limits.
- Analysis creation is idempotent and quota-aware.
- Gemini output is schema-validated and cannot introduce heroes outside the deterministic candidate pool.
- Provider failures map to controlled API errors or the deterministic recommendation fallback.
- Sensitive authorization and admin headers are redacted from logs.
