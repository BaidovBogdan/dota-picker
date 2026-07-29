# Counterpick admin

Counterpick Admin is a lightweight React dashboard prototype for operational views such as users, analyses, quotas, plans, system status, and review moderation.

## Current status

The interface currently uses in-memory fixtures from `src/data/mock-data.ts`. Actions such as filtering, deletion, status changes, and manual checks are demonstrations and do not mutate the production API or database.

Before this panel can be deployed as an operational tool, it needs authenticated server integration, role-based access, audit logging, pagination, and confirmation rules for destructive actions.

## Stack

- React 19
- Vite 6
- TypeScript
- Lucide icons

## Requirements

- Node.js 24
- npm

## Development

From the `admin` directory:

```powershell
npm ci
npm run dev
```

The development server binds to `0.0.0.0`, so it can be opened from another device on the same trusted network.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run typecheck` | Run the TypeScript project build without the production bundle |
| `npm run build` | Type-check and create the production bundle |
| `npm run preview` | Preview the built application |

## Data and security

- Do not treat the displayed metrics or accounts as real data.
- Never expose `ADMIN_API_KEY` in a browser bundle.
- A production version should authenticate an administrator through the API and use short-lived authorization rather than a static client-side secret.
- User deletion and review moderation must be performed by protected server endpoints and recorded in an audit trail.
