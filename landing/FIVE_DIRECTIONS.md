# Counterpick — five landing directions

## Product truth

Counterpick is a future Windows companion for the Dota 2 draft. The intended flow is:

`install → launch before queue → detect the visible draft → rank three options → show an in-game overlay → player decides`

The existing recommendation backend already returns three ranked candidates and considers matchup evidence, position fit, current role meta, team needs, and data reliability.

The Windows shell, continuous recognition, installer, and overlay are still in development. Every direction therefore uses future-facing release copy and avoids unverified claims about latency, accuracy, performance impact, supported display modes, anti-cheat compatibility, installer size, or MMR gains.

## Conversion model

- Free exposes the complete recommendation engine.
- Free starts with three analyses and restores one every 24 hours up to three.
- Pro supports up to 100 analyses every 24 hours.
- Final Windows pricing and checkout details are intentionally not invented.
- The primary action is controlled by `PUBLIC_DOWNLOAD_URL` and `PUBLIC_BETA_URL`.
- When neither is configured, the action leads to an honest release-status chapter.

## Shared story

All five directions follow the same AIDA logic without sharing one visual template:

1. Attention: draft pressure and the future Windows promise.
2. Interest: visible draft context becomes three recommendations.
3. Desire: matchups, position, role meta, team needs, and reliability explain why the answer changes.
4. Action: Free versus Pro, release status, FAQ, and a final Windows CTA.

The product stage is split conceptually into media, overlay, and narrative layers. Real gameplay video can later replace the illustrative media layer without rebuilding the recommendation overlay or surrounding copy.

## Direction matrix

### `/timer` — Redline, icon 10

- Primary recommendation.
- Strict paper, ink, and signal-red palette.
- The segmented mark acts as timer, narrowing field, and scroll motif.
- Artistic asymmetric hero.
- Card stacking and scrubbed text.

### `/collapse` — Candidate Collapse, icon 01

- Highest explanatory clarity.
- Ink, paper, and cyan palette.
- Candidate fragments physically compress into three viable lines.
- Editorial split hero.
- Scrubbed narrative and image scale/fade.

### `/aperture` — Predictive Aperture, icon 03

- Highest spatial depth without WebGL.
- Black, mint, and violet palette.
- The mark opens through context layers and exposes the decision.
- Editorial split hero.
- One controlled pinned climax and scrubbed copy.

### `/branch` — Branching Decision, icon 06

- Most editorial and explainable.
- Warm paper, cobalt, coral, and black palette.
- SVG-like paths keep alternatives visible instead of hiding trade-offs.
- Artistic asymmetric hero.
- Scrubbed text and image scale/fade.

### `/counterforce` — Counterforce, icon 07

- Most aggressive esports direction.
- Black, plum, and acid-lime palette.
- Enemy pressure and the team response collide around the recommendation.
- Cinematic centered hero.
- One pinned conflict scene and image scale/fade.

## Performance decision

Three.js is intentionally absent from this exploration. The reference audit showed that the strongest relevant effect is a coherent transformation:

`candidate pool → draft context → three options → player choice`

SVG, composited hero imagery, CSS light, and GSAP can tell that story with much lower GPU and bundle cost. A selected direction can still receive one lazy-loaded, viewport-bound 3D scene later if testing proves that it adds meaning rather than decoration.

## Quality gates

- Static HTML preserves the complete product and pricing story without JavaScript.
- Each concept imports only its own CSS and motion entrypoint.
- All grids use dense, mathematically complete layouts.
- No preloader, sound gate, custom cursor, smooth-scroll hijacking, fake testimonial, or fake score.
- Desktop pinning becomes natural vertical flow on touch and reduced-motion devices.
- Every concept remains understandable with motion disabled.
- All hero imagery is freshly retrieved from Valve's Dota 2 web CDN and documented in `public/v2/SOURCES.md`.
- The five exploration routes are `noindex` until one direction is selected for production.
