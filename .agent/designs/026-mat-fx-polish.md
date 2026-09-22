# 026: Mat FX polish — higher-quality battle effects
Status: approved (user, S257: all 4 increments, Rodin font)
Date: 2026-09-22 · Session: S257 · Builds on design 022

## Problem
Design 022 shipped every mat effect, but they read as cheap: hit/KO/evolve are the same
radial blob + one ring, nothing uses the card's type colour, all motion is JS-written styles
on the main thread (energy snap animates `box-shadow` per frame), text is default Impact.
Two sequencing bugs also hurt: the engine pushes `attackExecuted` AFTER the damage events, so
the hit number plays before the lunge; and a KO'd defender is gone from the DOM by the time
events fan out, so the killing blow shows no damage number and no lunge.

## Constraints
- Presentation only. No engine / event / payload change. No new effect names.
- Reduced motion + `fx-off` behaviour unchanged (dispatcher guards stay as they are).
- Overlays never take pointer events; detached and always self-removing (timeout backstop).
- Pure math stays in `*-pose.mjs` / `.mjs` (unit-tested); DOM in `.js`.
- CSS/visual check is the user's on localhost (memory: feedback_css_preview).

## Current state
- `setup/image-logic/mat-fx.mjs` — spawnOverlay / runPose (rAF) / rectForInstance / guards.
- `setup/netcode/mat-fx/{combat,status,lifecycle,flow}.js` + `*-pose.mjs` — the effects.
- `setup/netcode/mat-fx/origins.mjs` — pre-diff rect/src snapshots (retreat, trainer).
- `setup/image-logic/knockout-flight.js` + `knockout-pose.mjs` — KO ghost + burst.
- `setup/rules/card-glow-colors.mjs` — `TYPE_GLOW` rgb per energy type (reused for FX colour).
- `css/mat-fx.css` — all parent-page `fx-` classes.

## Options
- **Animation driver.** A: keep rAF `runPose` writing styles. B: sample the existing pose
  functions into WAAPI keyframes (`el.animate`). Pick B for new/rewritten effects: compositor
  thread (transform/opacity only), no per-frame JS, pose fns stay the tested source of truth.
  runPose stays for the KO ghost (filter animation) and as the no-`animate` fallback.
- **Particles.** A: CSS keyframes with custom props per particle. B: pure seeded particle
  table (`particles.mjs`) + one WAAPI animation per `<i>`. Pick B: deterministic + testable.
- **Hit/KO timing.** A: delay the whole damage handler a fixed time. B: an impact queue —
  damage/KO jobs wait one macrotask; if an `attack` arrives in the same batch they fire at
  the lunge's strike moment, else immediately. Pick B: correct with and without an attack.
- **KO'd defender rect.** Capture pre-diff origins for `attackExecuted` (attacker, defender)
  and `damageUpdated` (target) in `origins.mjs`; effects use the live rect, else the origin.

## Design
Primitives (slice 1): `mat-fx.mjs` gains `sampleKeyframes(poseFn, toFrame, n)` (pure),
`animateFrames(el, frames, opts) -> Promise`, `removeWhen(host, promises, backstopMs)`,
`spawnParticles(host, particles, {color, className, duration})`. New pure
`mat-fx/particles.mjs` (`burstParticles`, `seededRandom` moved-shared) and
`mat-fx/fx-colors.mjs` (`fxRgbForCard(card)`: Pokémon → first type, Energy → its type,
else neutral; `rgbCss(rgb, a)`). Rodin `@font-face` in mat-fx.css; `--fx-font` token.
Combat (slice 2): damage number = elastic overshoot pop, gradient fill, drift, per-card stack
offset, weakness tag; hit = directional slash + type-coloured sparks + white flash ghost;
smooth damped table shake; lunge = wind-up → strike → recoil, real card hidden meanwhile;
impact queue; KO = hold ghost until impact, shockwave + shard particles.
Status/evolve/energy (slice 3): per-condition particles, card-scaled label; evolve = white
silhouette flash of the card art + light pillar + rising sparkles; energy = type-coloured
ring burst + sparkles, no animated box-shadow.
Flow (slice 4): card present with backdrop dim + shine sweep + 3D settle; banners = skewed
stripe with accent rules, light sweep, Rodin; ability banner near its Pokémon; confetti with
flutter, sway, gravity, two side cannons.

## Edge cases & failure modes
| # | Case | Expected | Covered by |
|---|---|---|---|
| 1 | Element lacks `animate` (old browser / jsdom) | final frame applied, host still removed | [ ] unit: animateFrames fallback |
| 2 | `finished` never resolves (tab hidden, cancel) | backstop timeout removes host | [ ] unit: removeWhen backstop |
| 3 | Attack with no damage events in batch | queue delay resets, next batch immediate | [ ] unit: impact queue |
| 4 | Damage with no attack (poison, bench snipe via trainer) | plays immediately | [ ] unit: impact queue |
| 5 | Defender KO'd (element removed pre-fanout) | number + flash + lunge use origin rect | [ ] unit: origins captures attack/damage ids |
| 6 | Unknown / missing card types | neutral colour, no throw | [ ] unit: fxRgbForCard |
| 7 | Same card hit several times in one batch | numbers stack upward, don't overlap | [ ] unit: stackOffset |
| 8 | Lunge cancelled / attacker removed mid-lunge | real card visibility restored | [ ] by construction: restore in finally + backstop |
| 9 | Reduced motion / fx-off | unchanged: dispatcher skips transient FX | [x] existing dispatcher tests |
| 10 | Particle count bounded | ≤ 24 per burst | [ ] unit: burstParticles clamps |

## Test plan
Unit tests beside each pose/pure module (`node --test`); DOM paths verified by the user on
localhost. Run the full suite command from STATE watch-outs per slice.

## Migration / rollout
n/a — client presentation only; revert = revert the branch commits.

## Work plan
| Slice | Delivers | Green when |
|---|---|---|
| 1 | Primitives: sampler, animateFrames, removeWhen, particles, fx-colors, font token | unit tests pass, visuals unchanged |
| 2 | Combat + KO + impact queue + origin fallback | tests pass; user eyeballs a hit and a KO |
| 3 | Status, evolve, energy | tests pass |
| 4 | Present, banners, confetti | tests pass |

## Deviations
