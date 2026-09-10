# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 70
Focus: Fixed dead Secret/Gold Rare holo overlay (data-rarity="rare holo vmax" had no CSS
  rule firing — see S70 journal), rebuilt it grain-free per user's video reference.
Active: not yet closed, 4th iteration. `client/src/css/holo/gold-secret-rare.css` (imported
  in index.css after rainbow-alt.css) targets [data-rarity="rare holo vmax"] directly instead
  of piggybacking on rainbow-alt.css's dead [data-trainer-gallery="true"]-gated rule.
  Attempts 1-2 were wrong-theory rewrites (see journal S70). After attempt 2 user reported
  "no pillars still, and the grain is too strong" — switched from guessing to real DOM
  inspection (dynamic-imported holo.mjs in-page against a synthetic canvas test card, since
  live image URLs 404 in the sandboxed browser). Found two repo-wide undefined-CSS-var bugs
  (same species as --rotate-delta, S70a): `--card-opacity` used unfallbacked in every rarity
  CSS file's calc(), pinning opacity to 1 (permanent max) instead of the intended pointer fade
  — fixed with `--card-opacity: 1;` in base.css. And confirmed by opening the raw asset that
  iri-9.webp (the "glitter" texture) is dense TV-static noise, not discrete sparkle stars —
  retuned gold-secret-rare.css's glitter tile size (150px->480px) and contrast, and the beam
  layer's blend mode (overlay->color-dodge) for more visible bands. Verified in the synthetic
  test: real shifting band, not solid static. NOT verified against real card art — user
  checks localhost.
User then said bands weren't vertical. Rotated shine:before to 90deg and added a 90deg base
  offset to shine:after (it sits on top at z-index 3 and was still horizontal, masking the
  fix). Self-check said fixed; user's annotated screenshot proved still horizontal — real
  cause was a stale cached <link> stylesheet (CSS file edits need a forced page reload in this
  browser sandbox; a cache-busted dynamic import of the .mjs only refreshes the JS, not the
  already-loaded CSS — cost real time twice this session, see journal flag). Re-verified for
  real after reload: bands read correctly oriented, checked against real card art (the actual
  PAL 279/193 reference card, once user supplied its URL) rather than a synthetic flat-color
  test (which gives false negatives under color-dodge blending).
User then said still just a horizontal line. Real cause: card__shine:after (a secondary
  black/gray "exclusion cross-hatch" layer copied from hyper-rare.css, z-index 3, on top) was
  angled ~90deg but still positioned via --background-y — the axis a 90deg (vertically-banded)
  pattern is UNIFORM along, so it never visibly moved and sat there as a static artifact
  masking the real vertical bars underneath. Deleted that layer outright instead of continuing
  to patch two interacting ones. card__shine:before (kept, the actual bars) now: position
  driven by --background-x (the axis that varies), background-size narrowed 240%->33% width so
  ~3 full color cycles show across the card (240%/70% both read as one soft wash, not distinct
  bands). Verified against real PAL 279/193 card art (images.pokemontcg.io) after confirming
  the served CSS bytes were fresh — two screenshots at different pointer positions show a real
  shifting teal/cyan vertical band pattern, not a static horizontal artifact.
Next: user does a live check in the actual app — this is the 3rd "fixed, still wrong" round,
  so treat my sandbox confirmation as promising, not certain, until they confirm. If still
  off: consider that .mat-holo (the class the real full-view popup adds, per
  full-view.js:196) has aspect-ratio/sizing overrides in base.css that my flat 350px-wide test
  div didn't reproduce — check whether card__rotator's real dimensions in that context somehow
  interact with the 33% background-size differently than my isolated test. Also note: the
  other rarity CSS files (hyper-rare, regular-holo, etc.) share the same --card-opacity bug/
  iri-noise-asset and were NOT retuned (only gold-secret-rare.css was, scoped to this task).
  Any further CSS edit: hard-reload AND confirm served bytes before re-testing, every time.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- CSS/visual verification in this repo: don't drive the Browser pane yourself — user checks
  localhost manually. See project memory `feedback_css_preview.md` (outside this repo, in the
  agent's memory dir). Still fine to use the Browser pane for non-visual checks.
- Repeating gradients in holo CSS (`.card[data-rarity=...] .card__shine` background-image:
  `repeating-linear-gradient(...)`) alias into visible noise at small card render sizes
  (deck-list thumbnails, hand). Prefer single non-repeating gradients for any new rarity CSS;
  audit existing ones (hyper-rare.css, regular-holo.css, rainbow-alt.css) if this recurs there.
- `apply-view.js`, `authoritative-dispatch.js` and `card-stats.js` must stay Node-importable.
  Never statically import `click-events.js`, `drag.js`, `process-action.js`, or anything
  reaching `state.js` — inject instead. `rules-state.mjs` IS safe and statically imported.
- Cross-client parity may only be asserted over public zones (D14). Owner-secret zones
  (hand/prizes/deck) are redacted per recipient — compare counts instead, never `deck`.
- `flip-gate-test.mjs` needs a hand-started server:
  `SERVER_AUTHORITATIVE=1 PORT=4100 node server/server.js` then `PTCG_URL=http://localhost:4100`.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S70 2026-09-10 patch(holo): Secret/Gold Rare holo overlay was dead (CSS rule gated behind
  an attribute nothing sets); rebuilt grain-free. See Focus above — not yet re-verified.
- S69 2026-09-10 feat(deck-builder): Energy tab added to Browse Sets (D18).
- S68b 2026-09-10 chore(002 D17): SERVER_AUTHORITATIVE flipped on in render.yaml.
