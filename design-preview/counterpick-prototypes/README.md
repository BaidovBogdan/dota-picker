# Counterpick UI prototypes

This package is an interactive, responsive showcase of five visual directions for the Counterpick mobile experience:

1. Aegis Aperture
2. Captain's Ledger
3. Twin Ancients
4. War Table
5. Match Signal

It exists for comparing product hierarchy, visual language, motion, and state coverage before committing ideas to the native Expo application.

## Included scenarios

- Manual draft entry and photo import
- Hero catalog and recognition review
- Match Found loader with ten confirmations
- Three recommendations with fit score, strengths, and risks
- History and profile
- Sign-in, registration, and Pro presentation
- Loading, error, empty, missing-photo, quota, offline, and deletion states
- Light and dark themes
- Mobile and desktop preview layouts

All accounts, plans, uploads, purchases, and results are demonstration data. This package has no production API, authentication, billing, or persistence.

## Stack

- Node.js `>=22.13`
- Vinext and Vite
- Next.js 16 and React 19
- TypeScript and Tailwind CSS 4
- Lottie and Lucide icons

## Development

```powershell
npm ci
npm run dev
```

The main showcase is implemented in `app/page.tsx`; shared styling and responsive behavior live in `app/globals.css`.

## Validation

```powershell
npm run lint
npm test
```

`npm test` creates a production build and then runs the rendered-HTML test suite.

## Usage

Treat this directory as a design archive and behavior reference, not as reusable production UI. Before moving an idea into the mobile client, re-evaluate it against native navigation, accessibility, platform conventions, real API states, and device performance.
