# 005: 3D energy tokens for attached Energy cards
Status: shipped
Date: 2026-09-10 · Session: S89

## Problem
Attached Energy cards render as stacked flat card images on the Pokémon. User wants them
rendered as 3D coin tokens (like the existing burn/poison status tokens), built from
per-type energy images, positioned in the exact same spot the flat card occupies today.

## Constraints
- Zero change to attach/detach/drag/sync machinery — energy cards are live game pieces
  (draggable, discardable, replay-synced); only the *visual* must change.
- Reuse existing "3D coin" pattern (status-marker.css, status-token-assets.mjs) for
  consistency and to avoid new asset sourcing where usable assets already exist.

## Current state
- `attach-card.js` positions `movingCard.image` (the real `<img>`, same element used
  for drag/discard/sync) as an absolutely-positioned sibling in `.play-container`,
  offset by `layer * adjustment` (energyLayer counter). This offset math must be untouched.
- `client/src/assets/coins/151MT_*_Coin.jpg` already has one official 3D coin render per
  type (Fire/Water/Grass/Lightning/Psychic/Fighting/Darkness/Metal/Dragon/Colorless) plus
  a shared `coin-back-tm.png` — the same assets used for status tokens.
- `resetImage.js` is the single chokepoint every "unattach/move" path (`move-card.js`,
  `relocate-attached-cards.js`, `evolve-card.js`, `attach-card.js`'s own re-attach) already
  calls before repositioning any image — natural place to undo the token visual.
- Nothing reads `.image.src` for game-logic identity (checked: zones, move-card, sync);
  only cosmetic/preview code (`full-view.js` hi-res upscale, double-click zoom) reads it,
  which degrades harmlessly to showing the token there too.

## Options
Swap `.image.src` to the coin PNG (store original in `dataset.energyCardSrc`) vs. build a
separate overlay element mirroring the img's box.
- Overlay: zero src risk, but must duplicate every positioning number (left/bottom/width)
  and stay in sync forever — new failure surface for no real benefit since src-read call
  sites are all cosmetic.
- Src-swap (picked): one field write/restore at the two existing chokepoints
  (`attach-card.js`, `resetImage.js`), no duplicated geometry, no new failure surface.

## Design
- `client/src/actions/move-card-bundle/energy-token-assets.mjs`:
  `ENERGY_TOKEN_FRONT` (type→coin path, using existing `151MT_*` assets),
  `ENERGY_TOKEN_BACK` (reuse `coin-back-tm.png`),
  `getEnergyTokenFront(card)` — reads `card.types[0]`, falls back to parsing `card.name`
  for a known type word, returns `null` for unmapped types (e.g. Fairy — no coin asset).
- `attach-card.js`: after the existing Energy-layer offset block, if
  `movingCard.type === 'Energy'` and `getEnergyTokenFront` returns a src:
  stash `movingCard.image.dataset.energyCardSrc = movingCard.image.src` (once),
  set `movingCard.image.src = front`, add class `energy-token-3d`.
- `reset-image.js`: if `image.dataset.energyCardSrc` is set, restore
  `image.src = image.dataset.energyCardSrc`, delete the dataset entry, remove the class.
- New CSS (`energy-token.css`, imported alongside `status-marker.css`): `.energy-token-3d`
  — circular (`border-radius: 50%`), drop shadow + inset rim highlight for a coin look.
  No transform/tilt (would skew the drag hit-box) — depth is shadow-only.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | Energy type with no coin asset (Fairy, unknown) | `getEnergyTokenFront` returns null → original card art stays, no crash | [x] covered: energy-token-assets.test.mjs |
| 2 | Special Energy with no `types` (e.g. Double Colorless) | name-keyword fallback finds "Colorless" | [x] covered: energy-token-assets.test.mjs |
| 3 | Re-attach without detach (attach→attach) | `attach-card.js` calls `resetImage` first, restoring original src before re-tokenizing — no double-stash | [x] covered: reset-image.test.mjs |
| 4 | Detach via any path (discard, KO, move to hand) | all route through `resetImage`, restoring original src | [x] covered: reset-image.test.mjs |
| 5 | Non-Energy attachment (Tool) | untouched — token logic gated on `movingCard.type === 'Energy'` | [x] covered: attach-card.test.mjs |
| 6 | Zoom/full-view of an attached token | shows the coin image (degraded hi-res probe, harmless) | n/a — cosmetic, not tested |

## Test plan
Unit: `energy-token-assets.test.mjs` (type→asset mapping, fallback, null case),
`reset-image.test.mjs` (dataset restore + class removal), light `attach-card` DOM test
using `jsdom`-free plain objects mirroring existing test style where feasible.
Manual: user verifies visually on localhost (project convention — no Browser-pane CSS
verification, see `feedback_css_preview.md`).

## Migration / rollout
n/a — pure visual change, no persisted data, instantly revertable by reverting the diff.

## Work plan
| Slice | Delivers | Green when |
|---|---|---|
| 1 | asset map + attach/reset wiring + CSS + unit tests | `pnpm test` green, manual localhost check by user |

## Deviations
(none)
