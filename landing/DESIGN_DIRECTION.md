# Counterpick landing direction

## Product position

Counterpick is an in-game decision layer for the Dota 2 draft. Install the Windows app, launch Dota 2, and receive three ranked, explained recommendations inside the live draft. The website must sell that zero-friction loop rather than AI as an abstract feature.

The recommendation engine is data-first. It weighs matchup evidence, role fit, current-patch role meta, team fit, and sample reliability. AI may break a close call, but it does not invent the candidate pool.

## Audience and job

The primary audience is active ranked players across positions P1-P5 and brackets Herald-Immortal.

> When the pick timer is running, show me three defensible heroes for this exact draft and explain the trade-offs before I commit.

## Core promise

> THE DRAFT MOVES. YOUR ANSWER APPEARS.

Counterpick follows the live Dota 2 draft and surfaces three role-aware, data-backed options in an in-game overlay. No screenshots, typing, or alt-tab.

## Experience law

The page behaves as one narrowing decision. Enemy picks create noise, icon 10 gathers that field, its three red segments become the recommendations, and the recommendations resolve into the overlay. Every section advances that transformation instead of introducing an unrelated visual metaphor.

Icon 10 persists behind the full journey and moves continuously between chapters. During the pinned draft chapter its position and scale lock while its rotation continues, so scroll input still has visible feedback without competing with the product scene.

Motion has four master chapters:

1. Hero signal field and icon assembly.
2. Interest journey from automatic detection to explained choice.
3. One pinned draft climax moving through detected, ranked, and overlay states.
4. Conversion chapter where icon 10 reassembles around the final action.

There is no preloader, sound gate, custom cursor, autoplay carousel, or effect without a narrative job.

## Visual system

- Satoshi typography with wide editorial headlines and short line lengths.
- Paper `#F9F6F0`, ink `#101217`, and signal red `#F12218`.
- Red is reserved for decisions, active routes, status, and conversion.
- Icon 10 is a segmented system: many black candidate shards narrow to three red recommendation wedges.
- Surfaces are continuous and asymmetrical; small cards are used only where the product itself contains discrete recommendations.
- Dota hero imagery provides product context and never becomes a decorative wallpaper.
- A lightweight two-dimensional canvas may add atmosphere in the hero, but the product story remains legible without it.

## AIDA flow

- Attention: explicit automatic-overlay promise and an immediate live-draft-to-three-picks proof.
- Interest: one gapless signal surface and a horizontal workflow showing open, queue, and choose.
- Desire: a pinned draft scene followed by user-controlled scenarios that expose the recommendation logic.
- Action: honest Free and Pro quotas, release status, FAQ, and the Windows action.

## Future gameplay video seam

The pinned draft scene is deliberately split into three independent layers:

1. `media-layer` - the current abstract Dota scene, replaceable by the user's edited gameplay video.
2. `overlay-layer` - the Counterpick recommendation UI that can remain synchronized over the footage.
3. `narrative-layer` - captions and progress that explain what the viewer is seeing.

Adding the real video later should replace only the media layer. The page structure, overlay, copy, pricing, and surrounding motion do not need to be rebuilt.

## Content boundaries

The page does not invent accuracy, latency, FPS impact, MMR gains, download counts, testimonials, VAC status, installer size, release version, fixed pricing, or privacy guarantees.

Verified product facts:

- Three recommendations per analysis.
- Positions P1-P5.
- Brackets Herald-Immortal.
- Matchup, role, meta, team-fit, and reliability scoring.
- Current-patch role meta and rolling matchup evidence.
- Free starts with three analyses and refills one every 24 hours up to three.
- Pro supports up to 100 analyses every 24 hours.
- Monthly and annual prices are localized dynamically by the billing platform.

## Release configuration

`PUBLIC_DOWNLOAD_URL` enables the production "Download for Windows" action.

`PUBLIC_BETA_URL` enables the pre-release "Join the Windows beta" action.

When neither exists, the page displays an honest development status instead of linking to a nonexistent installer.

## Performance budgets

- Static HTML contains all primary copy, pricing, FAQ, and release messaging.
- Initial JavaScript target: 65 KB gzip or less.
- Initial CSS target: 35 KB gzip or less.
- One direct GSAP runtime, no React root and no Three.js runtime.
- Canvas DPR capped at 1.5 and paused while hidden or offscreen.
- LCP target: 2.5 seconds or less.
- INP target: 200 milliseconds or less.
- CLS target: 0.05 or less.

## Responsive and accessible behavior

Desktop receives the single pinned draft chapter.

Touch devices receive the same story as a natural vertical sequence without pinning. Reduced-motion mode removes scrub, pinning, marquee movement, and the canvas loop while keeping the final overlay understandable.

Controls remain keyboard accessible, focus-visible, and labeled. Decorative canvas content is hidden from assistive technology.
