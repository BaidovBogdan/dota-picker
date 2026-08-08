# Local portrait feature index

`hero-portrait-index.json` contains compact, low-resolution, mean-centered numerical descriptors generated from Dota 2 hero portrait images. Source portrait pixels and source image assets are not stored in the generated index. The generator records deterministic catalog, source-image, generator, and feature-code hashes inside the artifact. Wall-clock generation timestamps are intentionally omitted so identical inputs produce identical output.

Dota 2, its hero names, portraits, artwork, and related trademarks are owned by Valve Corporation and their respective rights holders. This repository does not claim ownership of, or grant a license for, those source assets. The generated descriptor artifact requires legal review before public redistribution. Source URLs and hashes are recorded for traceability, not as a statement of license.

The regression fixtures in `server/test/fixtures` are user-provided or derived QA crops. Third-party web-reference screenshots are not stored in the repository.

The generator verifies that every one of the 5,715 generated descriptors remains inside the coarse top-16 shortlist before writing the index. The portable screenshot corpus separately verifies exact occupied slots, sparse two-to-four-pick drafts, common resolutions, overlays, duplicates, ambiguous occupied slots, and non-draft negatives.

Legal review status: required before public redistribution.

For `local-portrait-index-v2-match-score`, the API `confidence` field is a conservative descriptor-match score composed from cosine similarity, the nearest-alternative margin, and crop reliability. It is not an empirical probability. `needsReview`, `quality`, and the independently supplied orientation signal determine whether a result may be used automatically.

Gemini detections use the same UI field as a conservative provider match score, capped at 0.93 for a high-reliability crop and lower for degraded crops. It is not presented as a calibrated probability; exact catalog identity, complete slot inventory, draft evidence, crop reliability, and orientation are validated independently.

Screenshot recognition intentionally returns `detectedPosition: null`. The player-card-name heuristic was removed because the reviewed real draft screenshots show a visible local username and do not provide a reliable image-only signal for the player's role. Vision mode uses the saved manual position; structured Overwolf mode may use its roster role.
