# Counterpick landing

This is the canonical pre-release marketing site for the Counterpick Windows desktop application. It presents the live-draft problem, visualizes the overlay workflow, explains the recommendation signal, and routes visitors to the configured release or beta action.

The current implementation is one animated page at `/`. Earlier multi-route design directions are retained only as research documents and are not live application routes.

## Stack

- Astro 7 with static output
- TypeScript
- GSAP and ScrollTrigger
- Tailwind CSS 4
- Local Satoshi web fonts

Node.js `>=22.12` and npm are required. The repository-wide Node.js 24 version is supported.

## Development

```powershell
npm ci
npm run dev
```

Build and preview the static site:

```powershell
npm run build
npm run preview
```

The production output is written to `dist`.

## Release actions

Create a local environment file when a real release or beta destination exists:

```powershell
Copy-Item .env.example .env
```

```dotenv
PUBLIC_DOWNLOAD_URL=https://example.com/counterpick-installer.exe
PUBLIC_BETA_URL=https://example.com/beta
```

`PUBLIC_DOWNLOAD_URL` has priority over `PUBLIC_BETA_URL`. Root-relative, HTTP, and HTTPS destinations are accepted. When neither value is configured, the interface communicates that the Windows release is still in development instead of presenting a non-functional download.

These values are public and are compiled into the static page. Do not place secrets in variables prefixed with `PUBLIC_`.

## Page structure

| Component | Responsibility |
| --- | --- |
| `Hero.astro` | Product promise and first conversion action |
| `SignalSurface.astro` | Live draft signal and overlay preview |
| `DraftStage.astro` | Recognition of the current pick state |
| `DecisionReel.astro` | Recommendation reasoning and candidate progression |
| `ConversionEnd.astro` | Final release or beta action |
| `ReleaseAction.astro` | Shared release-link rendering and external-link behavior |
| `motion.ts` | GSAP timelines, scroll behavior, and reduced-motion handling |

`src/pages/index.astro` composes the page and selects the configured download, beta, or development state. `src/styles/global.css` owns the visual system.

## Assets and attribution

Public hero and brand assets live in `public`. Their origin and usage notes are recorded in [`public/SOURCES.md`](public/SOURCES.md).

The design rationale is documented in [`DESIGN_DIRECTION.md`](DESIGN_DIRECTION.md). [`FIVE_DIRECTIONS.md`](FIVE_DIRECTIONS.md) is an archive of the exploration that preceded the selected implementation.

## Quality checks

```powershell
npm run check
npm run build
```

Before release, verify:

- keyboard navigation and visible focus;
- reduced-motion behavior;
- small mobile layouts and wide desktop layouts;
- no horizontal overflow;
- working download or beta destinations;
- optimized asset sizes and no accidental third-party network requests.
