# Counterpick

Counterpick is a Dota 2 draft assistant that turns a visible or manually entered draft into role-aware hero recommendations. It combines current OpenDota statistics with a constrained Gemini reranker and a deterministic fallback, so a recommendation can still be produced when the AI provider is unavailable.

The repository contains the mobile product, API, Windows desktop companion, protected administration console, public landing page, research probes, and archived design explorations.

## Repository map

| Directory | Purpose | Status |
| --- | --- | --- |
| [`client`](client/README.md) | Expo application for iOS and Android | Main product |
| [`server`](server/README.md) | Fastify API, PostgreSQL data layer, OpenDota and Gemini integrations | Main backend |
| [`desktop/app`](desktop/app/README.md) | Electron companion with automatic Dota 2 draft detection | Main desktop product |
| [`admin`](admin/README.md) | Protected React/Vite operations dashboard backed by the real API and database | Operations console |
| [`landing`](landing/README.md) | Astro marketing site for the Windows client | Canonical pre-release landing |
| [`desktop/gsi-probe`](desktop/gsi-probe/README.md) | Local Valve Game State Integration research receiver | Research tool |
| [`desktop/capture-probe`](desktop/capture-probe/README.md) | Safe Windows window-capture proof of concept | Research tool |
| [`design-preview`](design-preview) | Historical UI directions and interactive prototypes | Design archive |

There is no root npm workspace. Install dependencies and run commands inside the package you are working on.

## Product capabilities

- Guest-first onboarding with optional OTP-gated account flows.
- Draft recognition from a JPEG, PNG, or WebP image.
- Four-step manual draft entry for opponents, allies, rank, and position.
- Three explainable counterpick recommendations with risks and confidence signals.
- Live hero meta, rank-specific win rates, build timing examples, wishlist, and history.
- Free and Pro quotas, RevenueCat billing adapter, and analysis feedback.
- Russian and English localization with system, light, and dark themes.
- A deterministic recommendation path when Gemini reranking is disabled or unavailable.
- An opt-in Windows assistant that watches the Dota 2 draft, skips unchanged frames, and updates one live result as the draft gains new picks.
- Optional exact-pick ingestion through a local Overwolf companion; its public Appstore release is still pending.

## Technology

- Mobile: Expo 57, React Native 0.86, React 19, Expo Router, Reanimated, TanStack Query, and Zustand.
- API: Node.js 24, Fastify 5, TypeScript, PostgreSQL, Drizzle ORM, OpenDota, and Gemini.
- Desktop: Electron 43, React 19, TypeScript, electron-vite, TanStack Query, Zustand, GSAP, and Valve Game State Integration.
- Admin: React 19 and Vite 6.
- Landing: Astro 7, GSAP, and Tailwind CSS 4.
- Desktop research: Node.js GSI tooling and a Windows C++20 capture probe.

## Quick start

Use Node.js 24 and npm. Run each block from the repository root in a separate terminal. Start the API first:

```powershell
cd server
Copy-Item .env.example .env
docker compose up -d postgres
npm ci
npm run db:migrate
npm run dev
```

In another terminal, start the mobile client:

```powershell
cd client
Copy-Item .env.example .env
npm ci
npm start
```

To run the Windows desktop companion against the Render API:

```powershell
cd desktop/app
npm install
npm run dev
```

For a local API, set `EXPO_PUBLIC_API_URL=http://localhost:4000/v1` in `client/.env`. A physical phone must use an address it can reach over the local network or HTTPS; `localhost` on the phone refers to the phone itself.

Package-specific setup, environment variables, and operational notes are documented in the linked README files above.

## Quality checks

Run each relevant block from the repository root:

```powershell
cd client
npm run typecheck
npm run lint
```

```powershell
cd server
npm run typecheck
npm run lint
npm test
```

```powershell
cd landing
npm run check
npm run build
```

## Security

- Keep secrets in local or deployment environment variables. Commit only `.env.example` files.
- Never place Gemini, admin, database, JWT, or RevenueCat secret keys in the mobile bundle.
- The static OTP code is a pre-launch convenience and must be disabled before public production use.
- Do not point local development or QA scripts at production databases or billing data.

## Current scope

The mobile client, desktop companion, and API are the primary product surfaces. Vision mode uses GSI to detect the draft phase, local player's team, and selected hero. The raw selected-hero ID/name stay in memory and are not sent or stored; only the derived visual-group side and source label accompany changed Dota-window captures. Vision processes those captures in memory and updates the same saved analysis through a bounded live revision chain. Overwolf Live uses exact structured pick events through an authenticated loopback companion, but that companion is not yet published in the Overwolf Appstore. The probes remain isolated research tools. The Astro package is the canonical public landing. The protected admin console reads real accounts, analyses, quota events, reviews, meta snapshots and system status from the same-origin API. Source screenshots are intentionally not persisted, and integrations without required external configuration are reported as unavailable rather than represented with placeholder data.
