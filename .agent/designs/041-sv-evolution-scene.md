# 041: Scarlet/Violet evolution scene for regular evolutions
Status: built S304 — slices 1–2 green, video delivered; uncommitted pending the user's call (self-approved design, flagged at close)
Date: 2026-09-25 · Session: S304

## Problem
A regular (non-Mega, non-Tera) evolution plays a 1.15 s white-silhouette pop (design 026). The
user wants it "exciting", after their clip of the Scarlet/Violet evolution (7.9 s): a nebula,
pearly-white glow, light ribbons, a starburst whiteout, and a sky-blue reveal with a "X evolved
into Y" dialog. Mega and Tera keep their signature entries (designs 027/036/037).

## Constraints
- D103[mat-fx]: WAAPI keyframes sampled from pure pose fns; D118/D119: canvas redraws read the
  WAAPI clock via the shared `playCanvasStage`. So the stepped-clock capture drives every layer.
- Cosmetic only: board state is already applied; nothing may gate input. Self-removing overlays,
  backstop timers; `body.fx-off .fx-overlay` hides it; the fx queue budget is 2500 ms.
- The dispatcher is the single sound choke point (design 024), and it sounds BEFORE the effect.
- No audio assets exist; sound is synthesized voices (design 024 O1).
- Opp board iframe is rotated 180° (`.opp { scaleX(-1) scaleY(-1) }`); in-play opp cards read
  upside down, so card art in the overlay must turn with them.

## Current state
- `advisory-animations.mjs` maps `pokemonEvolved {playerId, instanceId (new card),
  targetInstanceId}` → fx plan `evolve`; `fx-queue` paces it with `HOLD_MS.evolve` (240).
- `dispatcher.mjs` plays `playFxSound(plan)` then `EFFECTS.evolve` (`lifecycle.js`).
- `lifecycle.js evolve`: Mega/Tera → `playSignatureEntry` (entry.js); else the burst
  (`evolveSilhouettePose`/`evolvePillarPose`/`evolveBurstPose`, `.fx-evolve-burst__*` CSS).
- By the time the effect runs the DOM diff already shows the NEW card on top of the stack
  (`apply-view layoutCardStack`: visible = `topPokemonCard([root, ...stackAttached])`).
- `origins.mjs captureOrigins` (called from `handleBeforeApply`, pre-diff) snapshots rect+src for
  retreat/trainer/combat; `takeOrigin(id)` consumes.
- `entry.js playCanvasStage` (private) — square canvas redrawn from its own WAAPI clock.
- `fx-audio.mjs voicesFor('evolve')` = 4-note arpeggio; driver `fx-audio.js` has a fixed 8 ms
  attack and static filter frequency.

## Options
1. Old-card art. A: capture the pre-evolution visible card pre-diff (origins) — true "old glows,
   new emerges"; one more capture. B: whiten the new card from t=0 — spoils nothing only if the
   white lands before the first paint, and the old Pokémon never appears. **Pick A**; B is the
   fallback when no snapshot exists.
2. Rendering. A: one canvas with the card art drawn in — needs image decode/CORS care. B: two
   canvas stages (back: nebula/sky/rays/back ribbons; front: beads/front ribbons/starburst/
   whiteout/glitter) sandwiching DOM card images — ribbons wrap around the card in depth, art
   stays crisp `<img>`. **Pick B.**
3. Sound selection. A: the effect plays its own sound — breaks the choke point. B: index.js
   enriches the plan with `signature` (from the evolved card) before `playFxSound`; the palette
   picks the score or the old arpeggio. **Pick B** (one line at the call site, pure palette).
4. Caption place. A: SV-style bottom-of-screen box — covers the hand, far from the card. B: box
   anchored under the card (above when no room), clamped to the viewport. **Pick B.**
5. Length/hold. 3200 ms (Mega's length). Hold = reveal (~1900 ms) so a follow-up effect (attach,
   ability) lands as the new Pokémon emerges, not inside the whiteout; within the 2500 budget.

## Design
Files:
- `mat-fx/evolve-scene.mjs` (pure, DOM-free): `EVOLVE_SCENE_MS = 3200`, `EVOLVE_REVEAL_AT`,
  `EVOLVE_PALETTE`; `evolveScenePose(t)` → every beat 0..1; `buildEvolveScene(seed)` → clouds,
  stars, beads, ribbons, spikes, speed-lines, bokeh, rays, glitter; `drawEvolveBack(ctx,t,g)`,
  `drawEvolveFront(ctx,t,g)` with `g = {cx, cy, unit, card:{width,height}, scene, time}`;
  `oldCardPose`, `newCardPose`, `stageDimPose`, `screenFlashPose`, `captionPose` (DOM layer
  poses); `evolveCaption(from, to)`; `captionRect(card, viewport)`; `turnOfMatrix(m)`.
- `mat-fx/evolve-scene.js` (DOM): `playEvolveScene({rect, turn, from:{src,name}, to:{src,name}})`
  — viewport dim, host overlay at the card with back canvas / card layers / front canvas,
  viewport flash, typed caption box. All layers `removeWhen` + backstop.
- `mat-fx/canvas-stage.js`: `playCanvasStage` moved out of entry.js (shared, D119).
- `origins.mjs`: on `pokemonEvolved`, capture the target stack's visible card
  (`visibleStackRecord(registry, targetInstanceId)`) keyed by the NEW `instanceId`, plus its
  `name`; `discardOrigins` drops it.
- `lifecycle.js evolve`: signature → unchanged; else `playEvolveScene` with `takeOrigin`, returns
  `holdFor('evolve-scene')`. Old burst poses/CSS removed; devolve keeps its ring (rename
  `EVOLVE_BURST_MS` → `DEVOLVE_BURST_MS`).
- `fx-audio.mjs`: new static sound `'evolve-scene'` = `EVOLVE_SCORE` (shimmer + riser + pad →
  whiteout chord + boom → reveal fanfare + sparkles); `'evolve'` stays the signature arpeggio.
  `fx-audio.js`: optional `attack` (s) and `filter.freqTo`.
- `index.js`: `playSound: (plan) => playFxSound(soundPlanFor(plan))` — an evolve whose card has
  no signature entry sounds as `'evolve-scene'`.
- `fx-holds.mjs`: `'evolve-scene': 2000`.
Timeline (t of 3200 ms) — as built after the v3 revision (see Deviations): awaken 0–.30
(nebula iris, stars, old card → pearl white) · gather .12–.68 (bead pairs rise) · surge .28–.64
(starburst core flares round the card, max 0.58 card heights; spikes, speed-lines, bokeh) · hand-over
at .64 (flare peak: pearl old card → pearl new card at the same scale/lift) · reveal .64–1 (flare,
spikes, lines, bokeh die down by .86; new card pulses and drains from white .68–.86; glitter;
nebula, halo and dim hold to .82 and fade by .98; card fades onto the real one .93–1).

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | no rect for new or target card | effect returns 0 (no hold), nothing drawn | [x] reasoning: guard kept from old evolve (`if (!rect) return 0`) |
| 2 | no pre-diff snapshot (fx toggled on mid-batch, capture failed) | old layer is a pearl card fading in over 130 ms; caption uses "Evolved into Y!" | [x] covered: `evolveCaption: missing names`, `oldCardPose: no art` |
| 3 | names missing / blank / non-string | caption omitted when no new name; trimmed | [x] covered: `evolveCaption: missing names` |
| 4 | t outside [0,1], NaN | poses clamp; draw no-ops on bad unit/scene | [x] covered: `evolveScenePose: clamped`, `drawEvolve*: bad input` |
| 5 | two evolutions in one batch | each captured by its own new id; scenes paced by hold, overlap past budget | [x] covered: `origins: two evolutions` |
| 6 | evolve target is a Stage 1 (top) or the root Basic | visible card resolved via stack either way | [x] covered: `visibleStackRecord: root / top / attached` |
| 7 | skipped event (catch-up/hidden) | `discardOrigins` drops the evolve snapshot | [x] covered: `origins: discard drops evolve snapshot` |
| 8 | Mega/Tera evolution | signature entry unchanged; sound = old arpeggio | [x] covered: `fx-audio: evolve (under a Mega/Tera entry) and devolve are mirror figures` + reasoning: `soundPlanFor` keeps `evolve` when `signatureEntryKind` is set |
| 9 | opp-side card (rotated frame) | card layers turned 180° | [x] covered: `turnOfMatrix` |
| 10 | card near viewport edge | caption above card or clamped inside viewport | [x] covered: `captionRect: *` |
| 11 | no WAAPI / no 2D context | animateFrames applies end frame; stage resolves; host removed by backstop | [x] reasoning: existing `animateFrames`/`playCanvasStage` fallbacks |
| 12 | fx turned off mid-scene | `body.fx-off .fx-overlay` hides every layer | [x] reasoning: all layers carry `fx-overlay` |
| 13 | reduced motion | dispatcher uses `STATIC_FALLBACKS` (none) → no scene; score still plays (024: sound ≠ motion) | [x] reasoning: dispatcher unchanged |

## Test plan
Unit: `evolve-scene.test.mjs` (pose ranges/ordering, scene determinism, draw call budgets and
palette on a recording ctx, caption text/placement, turn), `origins.test.mjs` (evolve capture),
`fx-audio.test.mjs` (score vs arpeggio, envelope fields), `fx-holds.test.mjs`,
`lifecycle-pose.test.mjs` (removed poses). Visual: stepped-clock capture (capture-fx method)
of the real effect over an `applyView` board, self + opp, frames → contact sheet + video.

## Migration / rollout
n/a: client cosmetic only; revert = revert the commit.

## Work plan
| Slice | Delivers | Green when |
|---|---|---|
| 1 | pure module + DOM driver + wiring + audio + CSS + tests | unit tests + lint green |
| 2 | stepped-clock capture, tuning, video | frames match the clip's beats |

## Deviations (Builder appends here during build)
- Sound: a new static `'evolve-scene'` voice set, chosen in index.js `soundPlanFor` (the
  dispatcher sounds before the effect runs); `voicesFor('evolve')` stays the signature arpeggio.
  Hold is 2000 ms, not 1900. Design text above synced.
- Slice 2 tuning: the screen flash peak went 0.55 → 0.82 (`SCREEN_FLASH_PEAK`) with a
  pearl-lavender gradient. At 0.55, white over the dark board read as grey fog, not light.
- Caption box slides in during the whiteout, before the reveal. Kept: the clip does the same.
- Capture: `.agent/scratch/evolve/capture-evolve.mjs` (real `applyView` + advisory hooks,
  stepped WAAPI clock, self/bench/opp), `sheet.py`, `encode.py`. Output is VP8 WebM through
  Playwright's ffmpeg: this machine has no H.264 encoder with rate control (OpenCV's writes ~21 MB/s).
- Code has no caption box, viewport flash or ribbons (gone before v2; `captionPose`,
  `screenFlashPose`, `evolveCaption`, `captionRect` do not exist). Edge rows 2/3/10's caption parts
  and the Design list's caption/flash items are void.
- v3 (user, 2026-09-25): the user rejected the whiteout and the sky-blue reveal with turning god
  rays as off-style next to the nebula beats. Removed `whiteout`/`sky`/`rays` beats, their draw fns,
  `rays`/`skyClouds` from the scene and `sky`/`skyDeep` from the palette. The nebula, halo and dim now
  hold through the reveal; the core flare is capped (`CORE_REACH` 0.58) and peaks at the hand-over;
  the new card starts at the old card's scale/lift (no jump) and pulses instead of popping from
  1.2. Score's hit (`FLARE_S`, 2.0 s) is unchanged. Tests: no whiteout/sky/rays beats, no front
  glow wider than 1.5 card heights above 0.5 alpha, seamless hand-over, nebula backs the reveal.
- v4 (user, S306): palette light blue/cyan (no purple); starburst core + speed-lines removed; spread
  ~halved (nebula 1.3, bokeh ≤1.2, beads ±0.8, glitter ±0.75 card heights; stage 4.2). Depth: card
  leans/rocks in perspective and flips 180° edge-on through the white hand-over, sheen sweeps, side
  shade, rim/drop shadow; near/far beads. Timing: card clock 3.2 s + `GLOW_HOLD_MS` 300 hover after
  the flip (scene 3.5 s, flare still at 2.05 s); no pulse (one size change only); new card clears
  to 45 % pearl glow and eases down (sine) while dissolving. Timeline section above is v3-stale.

---
Self-approval checklist (only when the user is unreachable):
- [x] Every constraint traceable into the Design section
- [x] Every edge-case row has an expected behavior (or a written strike reason)
- [x] Interfaces fully named and typed — no hand-waving
- [x] Slices each ≤1 session and independently green
- [x] No section reads "TBD"
