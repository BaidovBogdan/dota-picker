# Counterpick home concepts, 2026

This directory preserves the home-screen exploration that led to the current Counterpick visual direction. It is a static design archive, not production application code or a source of current product data.

The scenario, patch `7.41d`, rank, position, opponents, and quota shown here are a snapshot from July 23, 2026. They must not be interpreted as live API values.

## Open the archive

No installation or build is required. Open `index.html` in a browser.

- `index.html` opens the selected second-round comparison.
- `round2.html` presents one second-round concept at a time.
- `round2-board.html` places the second-round screens side by side.
- `index.html?round=1` opens the original five-direction gallery.
- `contact-sheet.html` provides the original comparison board.

The gallery supports its visible controls and keyboard arrow navigation.

## Original directions

| Direction | Core idea |
| --- | --- |
| Draft War Room | Tactical counter-route and command-room language |
| TI Broadcast | Mobile tournament broadcast with a hero cut and lower thirds |
| Coach Notebook | A structured personal draft review on a physical planning sheet |
| Ancient Relic | A restrained artifact and draft-seal metaphor |
| Kinetic Arena | Screen-print energy and an asymmetric hero wheel |

Each direction uses the same product scenario so the comparison reflects design choices rather than different content.

## Second round

The second round retained TI Broadcast and replaced the other directions with:

- Last Pick Clock
- Dota Draft Chamber
- Hero Contact Sheet
- LAN Room '05

The current mobile client subsequently adopted parts of the TI Broadcast language, including editorial typography, live-signal color, and broadcast-style hierarchy. The client remains the source of truth for implemented UI.

See [`ROUND2.md`](ROUND2.md) for the detailed second-round rationale and asset notes.

## Product principles captured here

- The home screen should start or resume a draft rather than behave like a metrics dashboard.
- Scan is the primary action; manual entry remains a complete alternative.
- Recommendation context includes opponents, optional allies, position, rank, patch, and data freshness.
- Radiant and Dire meaning is never communicated by color alone.
- Primary touch targets remain at least 44 pt on iOS and 48 dp on Android.
- Reduced Motion removes nonessential ticker, pulse, and morph behavior.
- A selected visual direction must extend through result, history, profile, loading, error, quota, and offline states.

## Asset notice

Some concepts use Valve or Steam-hosted Dota 2 imagery for internal design evaluation. Dota 2 and related marks belong to Valve Corporation. Counterpick is not affiliated with Valve, and production use of third-party assets requires a separate rights review.
