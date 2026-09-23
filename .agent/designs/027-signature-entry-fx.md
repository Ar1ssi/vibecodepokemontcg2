# 027: Signature entry FX — Mega and Tera
Status: visuals superseded by 034 (S278); triggers, registry and kind test still stand
Date: 2026-09-22 · Session: S259 · Builds on designs 022 and 026

## Problem
Every evolution plays the same white-silhouette burst (design 026). Pokémon TCG Live gives
Mega Evolution and Tera Pokémon their own entry animation, and plays it both when the card
evolves and when a Basic Mega/Tera is put into play (reference clips from the user:
Tera Greninja ex via Rare Candy; Mega Kangaskhan ex placed as the starting Active).

User choices (S259): scope = Mega + Tera only; also play on entry from hand; Mega stays
around the card (no whole-mat takeover); Tera crystal uses the card's type colour.

## Constraints
- Presentation only. No engine / event / payload change — `cardMoved` already carries
  `from`/`to`, and every evolve path (manual, Rare Candy, trainer steps) emits `pokemonEvolved`.
- Reduced motion + `fx-off` unchanged: the new effects are transient (no static fallback).
- Overlays never take pointer events; detached; self-removing with a timeout backstop.
- Pure math in `*.mjs` (unit-tested); DOM in `.js`. WAAPI keyframes sampled from pose fns (D103).
- The user checks visuals on localhost (memory: feedback_css_preview).

## Current state
- `client/src/setup/netcode/advisory-animations.mjs` — `EVENT_FX` maps event type → effect;
  `cardMoved` currently maps to nothing.
- `client/src/setup/netcode/mat-fx/index.js` — effect registry.
- `client/src/setup/netcode/mat-fx/lifecycle.js` / `lifecycle-pose.mjs` — `evolve` effect.
- `shared/engine/rules/card-classify.mjs` — `isMegaCard` (modern "Mega …", legacy "M …-EX",
  "Primal …-EX") and `isTeraCard` (subtype, rule text, or name).
- `client/src/setup/netcode/mat-fx/{particles,fx-colors}.mjs`, `image-logic/mat-fx.mjs` —
  the design 026 primitives (burstParticles, spawnParticles, sampleKeyframes, animateFrames).

## Options
- **Entry trigger.** A: new engine event "Pokémon played". B: map `cardMoved` into play on the
  client. Pick B: the engine already emits `cardMoved {from, to}`; no protocol change.
- **Which moves count as "entering play".** A: hand only. B: hand, deck, discard → active/bench
  (the engine's own `enteredPlayTurn` rule). Pick B: a Nest Ball'd or revived Mega Basic also
  enters play; one rule shared with the engine. Board-to-board moves (retreat, switch) never count.
- **Where the Mega/Tera test runs.** A: in `advisoryAnimationPlan` (would need the card there).
  B: in the effect, reading the card from the registry. Pick B: plans stay card-free, as today.
- **Mega hex field.** User chose card-local, so the prismatic hex pattern appears only inside the
  keystone sphere instead of across the mat.

## Design
Pure (slice 1):
- `mat-fx/entry-kind.mjs`: `signatureEntryKind(card) -> 'tera' | 'mega' | null` (Tera checked
  first; null/non-Pokémon → null).
- `advisory-animations.mjs`: `cardMoved` with `from ∈ {hand, deck, discard}` and
  `to ∈ {active, bench}` → plan `{kind:'fx', effect:'enter', user, instanceId, ...}`;
  every other `cardMoved` stays null.
- `mat-fx/entry-pose.mjs`: `TERA_ENTRY_MS` (2100), `MEGA_ENTRY_MS` (1900) and pose fns:
  `teraFlashPose`, `teraSlabPose`, `teraCrownPose`, `teraWhiteoutPose`, `teraRaysPose`,
  `teraSmokePose`; `megaSpherePose`, `megaSwirlPose`, `megaHexPose`, `megaPopPose`.
DOM:
- `mat-fx/entry.js`: `playTeraEntry(rect, card)`, `playMegaEntry(rect, card)`, and the
  `enter` effect (resolve card → kind → play, else no-op).
- `lifecycle.js` `evolve`: kind of the evolved card → Tera/Mega player; else current burst.
Tera (≈2.1 s, card-local, colour = `fxRgbForCard(card)`):
1. white flash over the card; 2. an opaque crystal slab (card-shaped, type colour, faceted
Tera-jewel pattern, pulsing glow) covers the card, with a crystal crown growing from its top,
orbit arcs and sparkles; 3. whiteout; 4. the slab shatters — type-coloured triangle shards,
light rays, a violet smoke puff — revealing the new card; 5. a few lingering glints.
Mega (≈1.9 s, card-local): a glass keystone sphere swells around the card with a prismatic
hex pattern inside; blue and orange brush-stroke swooshes (Mega-symbol colours) orbit it;
orange embers rise; closing flash with a slight card pop.

## Edge cases & failure modes
| # | Case | Expected | Covered by |
|---|---|---|---|
| 1 | Card missing / hidden (opponent setup stub, no name) | kind null: `enter` no-ops; `evolve` plays default burst | [x] entry-kind: missing or hidden cards |
| 2 | Plain ex / V / Basic enters play | no entry FX | [x] entry-kind: plain Pokémon, ex and V |
| 3 | Legacy "M …-EX" and "Primal …-EX" | Mega entry | [x] entry-kind: modern and legacy Mega |
| 4 | Tera via subtype, via rule text | Tera entry | [x] entry-kind: Tera by subtype or by rule text |
| 5 | Board-to-board move (retreat/switch/promote) | no `enter` plan | [x] advisory: board-to-board and out-of-play moves |
| 6 | Move out of play (bench→discard, →hand) | no `enter` plan | [x] advisory: board-to-board and out-of-play moves |
| 7 | Deck/discard → bench (Nest Ball, revive) | `enter` plan | [x] advisory: cardMoved from deck or discard |
| 8 | Card rect not found | no-op, no throw | [x] by construction: playSignatureEntry returns false without a rect; evolve keeps its own guard |
| 9 | No WAAPI / `finished` never resolves | final frame / backstop removal | [x] existing mat-fx-waapi tests |
| 10 | Reduced motion / fx-off | skipped (transient) | [x] existing dispatcher tests |
| 11 | Tera card with unknown type | neutral colour | [x] particles.test: fxRgbForCard |
| 12 | Pose boundaries (invisible at start/end, phases in order) | as specified | [x] entry-pose: 12 tests (ends invisible, clamping, beat order, slab under whiteout) |

## Test plan
Unit tests for entry-kind, entry-pose, and the advisory mapping; full suite per slice
(command in STATE watch-outs). DOM/visuals verified by the user on localhost.

## Migration / rollout
n/a — client presentation only; revert = revert the branch commits.

## Work plan
| Slice | Delivers | Green when |
|---|---|---|
| 1 | entry-kind, `enter` plan, registry wiring, evolve routing (both kinds fall back to the default burst until slices 2–3) | tests pass |
| 2 | Tera entry (poses + DOM + CSS) | tests pass |
| 3 | Mega entry (poses + DOM + CSS) | tests pass |

## Deviations
- Slices 2 and 3 were built and committed together: they share entry.js, entry-pose.mjs and
  one CSS block.
- A Trainer named like a Mega (edge added) is not a Pokémon entry — `signatureEntryKind` requires
  `isPokemon`.
- Rare Candy and Salvatore-style evolves emit `cardAttached` + `pokemonEvolved`, never a
  `cardMoved` into play, so an evolution never plays both `evolve` and `enter`.
