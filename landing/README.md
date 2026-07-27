# Counterpick landing exploration

Five independent static marketing directions for the upcoming Counterpick Windows desktop client. The original single-page draft is not imported by the new routes.

## Local development

```bash
npm install
npm run dev
```

## Release links

Copy `.env.example` to `.env` and set one or both values:

```dotenv
PUBLIC_DOWNLOAD_URL=https://example.com/counterpick-installer.exe
PUBLIC_BETA_URL=https://example.com/beta
```

`PUBLIC_DOWNLOAD_URL` has priority. When neither URL is set, conversion controls honestly display the Windows development state.

## Routes

- `/` — neutral concept gallery
- `/timer` — Redline, icon 10
- `/collapse` — Candidate Collapse, icon 01
- `/aperture` — Predictive Aperture, icon 03
- `/branch` — Branching Decision, icon 06
- `/counterforce` — Counterforce, icon 07
- `/previous` — preserved earlier single-page draft

All five concept routes are `noindex` until a final production direction is selected. Product truth, visual rationale, performance choices, and the route matrix live in `FIVE_DIRECTIONS.md`.

## Verification

```bash
npm run check
npm run build
npm run preview
```

The production output is generated in `dist`. New external asset provenance lives in `public/v2/SOURCES.md`.
