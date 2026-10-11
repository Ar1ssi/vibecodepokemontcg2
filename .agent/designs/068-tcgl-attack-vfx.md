# 068: TCG Live attack impact VFX — WebGL particle player
Status: approved (self — one-shot) · built on `feature/tcgl-attack-vfx`, not landed
Date: 2026-10-12 · Session: S-068 (worktree `feature/tcgl-attack-vfx`, one-shot)

## Problem
The user's request, verbatim (2026-10-12):

> The attack animations look very low quality, the shaders seem incredibly flat and like clip art. Im
> wondering how we can make them seem more like the actual pokemon games. Would a dump of pokemon
> scarlet help?

Then, after the TCG Live `attack_*` bundles were dumped and three options were laid out:

> Go one shot 1 implemenation.

Option 1 as it was offered, verbatim:

> 1. **WebGL particle player (recommended).** Data-driven player for Unity ParticleSystem modules plus
>    ~5 GLSL shader families. Reads dumped specs, so all 66 prefabs come from one engine. Replaces
>    current impact beats; current charge and travel beats stay. Reuses Unity curve maths from
>    `tcgl-fx.mjs` (D207). Large: multi-session, `feature.md` route, design first.

Context the option rests on (same message): 11 types × `Small/Medium/Large`, plus `_C` variants for
Bench targets = 66 prefabs; size rule from `FXManager.cs:1391` (damage > 150 Large, ≥ 50 Medium, else
Small); shaders are compiled, so GLSL is rewritten from the material parameters.

## Acceptance
| # | Criterion (the brief's words) | Evidence |
|---|---|---|
| A1 | "Data-driven player for Unity ParticleSystem modules" | ✓ `impact/impact-sim.mjs` (14 modules: main, emission, shape, velocity, limit, force, noise, colour, size, rotation, texture sheet, custom data, trails, sub-emitters). Test "all 66 committed prefabs simulate through the game’s 4 s without a bad number" |
| A2 | "plus ~5 GLSL shader families" | ✓ exceeded: the game's own 32 shaders, translated from their bytecode (`shaders.json`). `rec-attack-impact.mjs` over all 6 variants × 11 types: exit 0, no link error (SwiftShader) |
| A3 | "Reads dumped specs, so all 66 prefabs come from one engine" | ✓ test "the 11 types × 6 variants = 66 prefabs are present"; the same 66 rendered by `rec-attack-impact.mjs` |
| A4 | "Replaces current impact beats" | ✓ `rec-attack-hit.mjs` (real `attack` + `damage` through combat.js): `seen {"stageShown":true,"dressing":0,"moveScene":1,"numbers":2}`, exit 0. Test "withoutImpactBeats drops Fire Blast’s flash, smoke and embers and keeps its flare" |
| A5 | "current charge and travel beats stay" | ✓ test "across every shipped move the charge and travel beats all survive" (225 specs) |
| A6 | "Reuses Unity curve maths from `tcgl-fx.mjs` (D207)" | ✓ `impact-curves.mjs` evaluates every curve and gradient with `curveAt` / `gradientAt` / `lerp`; the importer bakes Unity's Hermite curves to those keys (test "bakeCurve stays within 0.5 % of the spline", checked through `curveAt`). `CARD_UNITS` is not reused — see Deviations |
| A7 | Size rule: "damage > 150 Large, ≥ 50 Medium, else Small"; "`_C` variants for Bench targets" | ✓ test "damage picks the size by the game’s thresholds (edge 3)"; `rec-attack-hit.mjs` with `BENCH=1` plays both hits (2 damage numbers, one stage). The Bench check itself (`impactTargetFor`, the card's zone tag) is exercised only by that run |
| A8 | "make them seem more like the actual pokemon games" (not "flat", not "clip art") | user check on localhost — FX work is not self-graded. Contact sheets of all 11 types were looked at for defects only (see Deviations) |

## Assumptions
| # | Gap | Decided (assumed) | Why |
|---|---|---|---|
| S1 | "Land" not stated | `Land: branch` | workflow default |
| S2 | Which prefab plays for a move whose main-series type is not the card's printed type | The move's `vgType` picks the TCG type; the printed type wins when it is one of that `vgType`'s TCG types (O7) | the user's standing FX feedback: one palette from build-up through payoff |
| S3 | Which beats are "impact beats" | The generic contact dressing only (O6). Move-identity payoffs (starFlare, pillar, terrain, bolt, slashArc, cloud, glyph, spiral, vignette, aura, rain, speedRays) stay | "charge and travel beats stay"; the 大 flare of Fire Blast is a look the user approved in 063 |
| S4 | Refraction materials need the screen behind them; the board is DOM | They refract the defender's card art plus the particle layers under them; the mat around the card is not bent (O8) | a WebGL canvas cannot read DOM pixels |
| S5 | Bench cards' size in the game is not in the dump | The game's Bench card is taken as 0.7 of its Active card (the `_C` prefabs' scale ratios: fire 0.69 / 0.70, lightning 0.5 / 0.8). `BenchController.BenchParameters.scale` holds the real number; it was not found in `level6` | sets the px size of a `_C` effect on our Bench card |
| S6 | Camera post effects (`SCG_Bloom` exists in the client code; whether the board camera carries it is not in the dump) | None | Graphics tiers say `useHDR: false`; nothing to bloom past 1.0 |
| S7 | The game's board hex ripple (`SpawnHexFXEvent`) and the per-attack authored FX (`Attack_*_Impact_1/2`, `IsCustomAuthoredCard`) | Out of scope | not among the 66 prefabs the brief names |
| S8 | Reduce-motion setting | Nothing new: the dispatcher already skips `damage` and `attack` under the app's reduce-motion setting (no static fallback), and `fx-off` plays nothing | the prefab replaces a dressing that follows the same switches |
| S9 | A prefab asset still loading when its attack starts | That attack plays today's dressing; the load continues for the next one | never delay a hit on a download |
| S10 | Zero-damage attacks and prevented damage | No prefab (no `damage` plan → nothing spawns), as in the game (`ApplyDamageOperation` spawns per damage delta) | the game's rule |
| S11 | Repo weight | Textures committed lossless (WebP, RGB kept under alpha 0), ~8.4 MB for 137 | dissolve thresholds read mask values; lossy masks band |

## Constraints
- No build step, native ESM, no new dependency (PROJECT.md): raw WebGL2, not three.js (O1).
- Pure logic is unit-tested with `node --test`, no jsdom: simulation, geometry, selection and the importer
  are `.mjs` with no DOM; only the stage (`.js`) touches WebGL and the DOM.
- D103 / D118 single clock: the stage's time is a WAAPI animation's `currentTime`, so frozen-time capture
  (fx-preview) works. The simulation must therefore be seekable: any time is reached by deterministic
  fixed steps from 0.
- D105: `motionReduced()` follows the app setting only; `fxDisabled()` suppresses everything.
- Hard rule 7 does not apply (no card text). No engine, rules or netcode change: this is client FX.
- User FX feedback (memory): no whiteouts, one palette through the payoff.
- The extract (`E:/TCGLive_Extract`, Unity cache) is not in the repo: the committed assets are the
  importer's output; the importer is rerunnable (`pnpm fx:import-attack`).

## Current state (read this session)
- `combat.js`: `attack(plan)` plays a move scene (`playMove`) or a lunge and announces contact on the
  impact queue; `damage(plan)` queues a job that, at contact, shows the number, `strikeTarget` (DOM flash,
  slash, sparks, ring — the generic hit dressing) and the table shake.
- `moves/move-player.js` `playMove`: 2 Canvas 2D stages + ghosts. 144 move specs + 81 signature specs;
  beats are `{at, until, layer, drawer, params}`. After contact the specs draw `impactFlash` (252 beats),
  `shards` (169), `ring` (149), `smoke` (58), `splash` (32) and 296 defender-anchored particle bursts.
- Everything is procedural: `createRadialGradient`, paths, `ctx.filter = blur()`, one noise tile.
- TCG Live (decompiled `FXManager.cs`, `FXEvent.cs`, `ApplyDamageOperation.cs`): per damaged card it
  spawns `attack_<type>/Attack_<Type>_Impact_<Small|Medium|Large>[_C]` (`_C` when the target is on the
  Bench), type = the attacking card's first type, size from the damage delta. The FX root has world scale 1
  and rotation card · Rx(−90°); the card is Rx(90°), so a prefab is authored world-aligned: Y toward the
  camera, X right, Z up the screen for the owner (rotated 180° about Y for the far seat). Camera: straight
  down, FOV 20°, 183 units above the board (design 067). Cleanup after 4 s.
- The dump (this session, `scripts/fx/attack/dump_attack_vfx.py` → 61 MB raw JSON): 66 prefabs, 1438 active
  particle systems, no MonoBehaviours, no MeshRenderers, no animation clips. Modules in use: Initial 1438,
  Emission 1313, ColorOverLifetime 1274, SizeOverLifetime 1127, Shape 956 (sphere, cone, circle, hemisphere,
  cone volume, rectangle, box, edge, donut), TextureSheet 386, CustomData 303, RotationOverLifetime 296,
  LimitVelocity 210, VelocityOverLifetime 140, Noise 115, Force 115, Trails 8, SubEmitters 6. Render modes:
  billboard 974, mesh 388, stretched 68, vertical 6, horizontal 2. 248 materials on 32 shaders, 137 textures,
  39 meshes. Project colour space: Linear; forward, LDR, soft particles off.
- Shaders: every compiled variant is D3D11 bytecode that `D3DDisassemble` turns into text, and the Shader
  object carries the reflection tables (constant-buffer layout by name, texture slots) and the pass state.
  The whole set uses ~35 opcodes. Built-in uniforms used: `unity_MatrixVP`, `unity_ObjectToWorld`,
  `unity_WorldToObject`, `_WorldSpaceCameraPos`, `_ProjectionParams`, `_Time`. Three shaders have a GrabPass.

## Options
- **O1 Renderer.** A: three.js (vendored) — 1 MB lazy import before the first hit, and its material system
  fights hand-fed vertex streams. B: raw WebGL2 — ~500 lines, no load cost. **Pick B.**
- **O2 Shaders.** A: write ~5 GLSL families from the parameter names (the brief's plan) — a guess at every
  formula. B: translate the game's own bytecode: disassemble, then transpile the assembly to GLSL ES 3.00
  with registers kept as `ivec4` bit patterns (`floatBitsToInt`), so comparison masks and float maths are
  both exact. **Pick B** — recon showed the bytecode and its name tables are readable; 32 exact shaders from
  one translator beat 5 approximate families. A2 is met by more than it asked.
- **O3 Simulation.** A: closed-form pose per particle (as 066) — cannot express noise, drag, limits, forces.
  B: fixed-step (1/60 s) simulation, replayed from 0 on a backward seek. **Pick B.**
- **O4 Camera.** The game's: perspective, straight down, FOV 20°, 183 units up, centred on the target card;
  1 unit = card height / 11 (`CARD_UNITS`, 066). Our mat tilts 12° — the card rect already carries it.
- **O5 Colour.** A: blend in gamma space on the canvas. B: the game's linear pipeline — sRGB textures
  decoded on sample, an `SRGB8_ALPHA8` framebuffer so every blend is linear, one resolve pass to the
  premultiplied canvas. **Pick B.** Each Unity blend maps exactly to a premultiplied one: `SrcAlpha
  OneMinusSrcAlpha` → over; `One One` / `SrcAlpha One` → add colour, keep coverage; `One OneMinusSrcAlpha` → premultiplied over.
- **O6 Impact beats** (S3): replaced = `strikeTarget` in `combat.js`, and in a spec the beats that start at
  or after `contactMs` with drawer `impactFlash`, `shards`, `smoke`, or `ring` / `splash` not aimed at the
  attacker, plus particle bursts anchored on the defender at or after contact.
- **O7 Impact type** (S2): `IMPACT_TYPES_BY_VG` lists each main-series type's TCG types; the printed type
  if listed, else the first. No move (lunge) → the printed type. Unknown → colorless.
- **O8 Refraction** (S4): a grab texture = the defender's card art quad + the framebuffer so far.
- **O9 Assets.** Per type one JSON (`<type>.json`: its 6 prefabs, materials, the ids it needs), shared
  `shaders.json`, `meshes.json`, `textures/*.webp`; fetched on first need, cached for the session.

## Design
Pipeline: Unity cache → `dump_attack_vfx.py` (extract only) → `attack-raw.json` + WebP + mesh JSON →
`import-tcgl-attack-fx.mjs` (all choices) → committed `client/src/assets/fx/attack/`.

Importer (`scripts/fx/attack/`, pure libs under `lib/`):
- `lib/dxbc-to-glsl.mjs` `transpile(asm, {stage, bindings}) → {glsl, attributes|varyings, buffers, textures}`.
  Registers `ivec4`; operands parsed as register / constant-buffer / immediate with swizzle, negate, abs;
  a 4-wide swizzle is positional under the destination mask, a 1-wide one replicates. Constant buffers
  become `uniform vec4 cbN[len]`; the name → offset table is emitted beside the source.
- `lib/shader-variant.mjs` picks the pass (first non-grab, non-shadow) and the variant whose keywords are
  ⊆ {`DIRECTIONAL`}; merges common + variant parameter tables; fails on an unmapped register.
- `lib/bake-curve.mjs` `bakeCurve(unityCurve) → [[t, v], …]` (Hermite with weights ignored → polyline, error
  ≤ 0.5 % of range) so the runtime evaluates with `curveAt` from `tcgl-fx.mjs` (A6); gradients keep their keys.
- `lib/normalize-system.mjs` typetree → compact system: only enabled modules, MinMax as
  `c | [lo, hi] | {k, s} | {k, k2, s}`; renderer fields; world transform chain kept as position / quaternion / scale.
- `lib/builtin-meshes.mjs` Unity's Quad (10210) and Plane (10209).

Runtime (`client/src/setup/netcode/mat-fx/impact/`):
- `impact-math.mjs` vec3 / quat / mat4 (column-major), `eulerZXY`.
- `impact-random.mjs` `createRandom(seed)` (mulberry32) with `range`, `sign`, forked streams per system.
- `impact-curves.mjs` `evalMinMax(curve, t, lerp)`, `evalGradient(…)` on top of `curveAt` / `gradientAt`.
- `impact-shapes.mjs` `emitFromShape(shape, random) → {position, direction}` for the nine shape types.
- `impact-noise.mjs` 3-D gradient noise + curl-free octave sum for the Noise module.
- `impact-sim.mjs` `createSystem(spec, worldMatrix, random)` → `{advanceTo(t), particles, alive}`; modules
  applied per step in Unity's order: emit → (age) → forces / gravity → velocity-over-lifetime → noise →
  limit / drag → integrate → size / colour / rotation / frame / custom data. Sub-emitters fire on birth / death.
- `impact-geometry.mjs` `buildVertices(system, camera) → {buffers, indexCount}` for billboard, stretched,
  horizontal, vertical, mesh and trail ribbons; vertex streams packed as the renderer lists them.
- `impact-draw-order.mjs` `drawOrder(systems, camera)`: render queue, sorting order, then far-to-near with
  sorting fudge.
- `impact-select.mjs` `impactTypeFor(card, vgType)`, `impactSizeFor(damage)`, `impactPrefabName(type, size,
  bench)`, `isImpactBeat(beat, spec)`, `withoutImpactBeats(spec)`.
- `impact-assets.js` fetch + decode + cache (`prepareImpact(type) → Promise`, `impactReady(type)`).
- `impact-stage.js` one shared WebGL2 context on a viewport overlay canvas; `playImpact({type, size, bench,
  rect, turn, cardSrc, seed}) → {durationMs} | null`. Programs compiled on first use; frame loop reads the
  WAAPI clock; context loss → all running effects end, `impactReady` false until rebuilt.

Integration: `combat.js` `attack()` calls `prepareImpact(type)`; when `impactReady(type)` it passes
`withoutImpactBeats(spec)` to `playMove` and tags the strike context `impactType`. `damage()`'s job plays
`playImpact` instead of `strikeTarget` when the context carries `impactType` (or, with no move scene, when
the type is ready); number and table shake are unchanged. `attackBanner()` also calls `prepareImpact`.

Lab: `client/src/dev/attack-fx-lab.html` — pick type / size / bench / seed, play on a card image, scrub time.
Capture: `.claude/skills/fx-preview/rec/rec-attack-impact.mjs` — frozen-time contact sheets per prefab.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | no `damage` plan / zero damage / missing rect | no prefab, no error | [x] `damage()` returns before queueing without a hit or a rect; a zero-damage attack takes the aura-pulse path, which announces no strike; `playImpact` returns null for a rect ≤ 1 px |
| 2 | unknown type, unknown vgType, card without types | colorless prefab | [x] test "the move’s type picks the prefab; the printed type breaks a tie (edge 2)" |
| 3 | damage 49 / 50 / 150 / 151 | Small / Medium / Medium / Large | [x] test "damage picks the size by the game’s thresholds (edge 3)" |
| 4 | several hits at once (Active + Bench spread) | one effect per target, `_C` on the Bench, one shared context | [x] `BENCH=1 rec-attack-hit.mjs` exit 0; the lab sheet plays 8 effects on the one canvas |
| 5 | WebGL2 missing, context lost, shader compile fails | today's dressing (`strikeTarget`, full spec beats); logged once | [x] `WEBGL=0 rec-attack-hit.mjs`: `seen {"stageShown":false,"dressing":1,…}`, exit 0. Context loss (`discardStage`) and a failed link (`brokenTypes`) take the same not-ready path; read, not exercised |
| 6 | asset fetch fails or is still loading | today's dressing for that attack; retry on the next | [x] `readyImpactType` decides once per attack; a rejected load drops its promise (`impact-assets.js`). Seen in the first e2e run: a type not ready → the move kept its beats |
| 7 | seek backward / frozen-time capture | state at t equals a fresh run to t | [x] test "time moves in whole steps, so a seek back equals a fresh run (edge 7)"; the lab sheet freezes 8 clocks |
| 8 | `fx-off` | nothing plays | [x] `prepareImpact` and `playImpact` return early on `fxDisabled()`; the canvas carries `.fx-overlay` (hidden under `body.fx-off`). Read, not exercised |
| 9 | far seat's card | prefab rotated 180° about the view axis (`turn`) | [x] `FAR=1 rec-attack-impact.mjs`: the Fighting column comes from the other side; `SIDE=opp rec-attack-hit.mjs` exit 0 |
| 10 | a shader uses an opcode or register the translator does not know | importer exits non-zero naming it | [x] test "an opcode the translator does not know throws, naming it"; `translateStage` throws on a constant read outside the reflection tables |
| 11 | a curve with one key / no keys; a burst with 0 count; maxParticles reached | constant / 0; no birth; births stop at the cap | [x] tests "bakeCurve keeps a straight line as two keys and reads empty as nothing", "rate over time, the particle cap and the start delay" |
| 12 | tab hidden mid-effect | effect ends at its duration; canvas cleared | [x] the clock is a WAAPI animation: it finishes while rAF is paused, and the next frame drops the effect and hides the canvas. Read, not exercised |

## Test plan
Unit (`node --test`): transpiler opcodes and bindings, curve baking error bound, normalizer, shapes
(points inside the shape, direction unit length), simulation (birth counts, lifetime, seek determinism,
caps), geometry (vertex counts, stream packing, billboard facing), draw order, selection rules. A corpus
test loads every committed type JSON and simulates all 66 prefabs to 4 s without NaN.
Visual: `rec-attack-impact.mjs` contact sheets for the 11 Medium prefabs (defects only; taste is the user's).

## Migration / rollout
n/a — additive client assets and code. Revert = revert the branch; no data touched.

## Work plan
| Slice | Files | Signatures | Tests | Green when |
|---|---|---|---|---|
| 1 | `scripts/fx/attack/{dump_attack_vfx.py, import-tcgl-attack-fx.mjs, lib/*.mjs, __tests__/*}`, `client/src/assets/fx/attack/**`, `package.json` (`fx:import-attack`) | as in Design › Importer | `mad r0.xy, v1.xyxx, cb0[4].yzyy, r1.xyxx` → `r0.xy = floatBitsToInt(…)`; `lt` → 0 / −1 masks; unknown opcode throws; `bakeCurve` of a 2-key ease within 0.5 % | importer writes 11 type files, tests green |
| 2 | `impact/{impact-math, impact-random, impact-curves, impact-shapes, impact-noise, impact-sim}.mjs` + tests | as in Design › Runtime | burst 5 at t=0, life 1 → 5 alive at 0.5, 0 at 1.01; `advanceTo(0.5)` after `advanceTo(1)` equals a fresh `advanceTo(0.5)`; cone angle 0 → direction = axis | tests green, corpus sim runs |
| 3 | `impact/{impact-geometry, impact-draw-order}.mjs` + tests | as in Design › Runtime | billboard = 4 verts / 6 indices per particle, normal toward camera; custom stream `[pos, normal, color, uv, custom1.xyzw]` → TEXCOORD0.zw = custom1.xy, TEXCOORD1.xy = custom1.zw | tests green |
| 4 | `impact/{impact-assets, impact-stage}.js`, `client/src/dev/attack-fx-lab.html`, `rec/rec-attack-impact.mjs`, `css/mat-fx.css` | `playImpact`, `prepareImpact`, `impactReady` | visual-only (exempt); lab renders every prefab without GL errors | contact sheets written, no console errors |
| 5 | `impact/impact-select.mjs` + tests, `combat.js`, `moves/move-player.js` | as in Design › Integration | edge rows 1–4, 9; `withoutImpactBeats(fireBlast)` drops impactFlash + smoke + the ember burst, keeps starFlare / speedRays / vignette | tests green, e2e attack shows the prefab |
| 6 | fixes from the contact sheets | — | — | 11 types render plausibly; full `pnpm test` green |

Delegation: inline. Each slice interprets Unity behaviour as it goes; that judgment cannot be pinned
tighter than the code itself (DELEGATION row 1).

## Deviations (Builder appends here during build)
- **Scale (structural, O4 re-decided).** A prefab unit is not card height / 11. An attack FX event keeps world
  scale 1 (`FXController.CreateFXEvent` sets `localScale` before parenting), while the evolution FX that
  `CARD_UNITS = 11` was measured on inherits its card's scale (`ParentAndClear`). The game's Active card is its
  mesh (8.9 units, design 067) times the Active slot mover's world scale (`level6`
  `board_active_player/Active`: 1.7 × 0.95 = 1.615) = 14.37 units. `impact-stage.js` uses that.
- **Prefab root.** The game clears the root's saved transform on spawn (`ParentAndClear`); the importer does
  too. Grass Medium had a stale root offset of −7.18 units that put it below the card.
- **Rotation.** One rotation angle turns a quad or a mesh about the axis it faces along (Z), not Y: the flat
  ring meshes ("Explode big wave") were tilting into the board and being cut by it. Facing the camera the
  angle is negated (a billboard turns clockwise); in the system's own frame it is not.
- **GrabPass (O8 detail).** A refraction shader draws twice: its colour, then a coverage pass (the same
  program reading a coverage copy of the grab texture), so bent card art hides the card it came from
  instead of adding to it. The grab targets are made on first use.
- **Warm-up (added).** `installImpactWarmup` loads both Active Pokémon's types on `board-view-applied`, so
  the first hit of a game usually has its prefab; the banner and the attack still prepare the exact type.
- **Capture (added).** `rec/rec-attack-hit.mjs` drives a real attack through combat.js on the e2e board
  (prefab on, WebGL off, far seat, Bench hit).
- **Built-in meshes.** Unity's Sphere joined the Quad and the Plane (one mesh particle uses it).
- **Stage memory.** The framebuffers are capped at 3.2 MP (the pixel ratio gives way on large viewports).
- **Independent review (run on the branch, findings fixed in slice 6).**
  - Translator: `mov` / `movc` read a negate or abs on a source as float (41 instructions in the corpus,
    the Rainbow Nova shaders among them, were negated as integers); a signed literal under a negate keeps
    its parentheses; `checkStageLink` refuses a pixel input whose register differs from the vertex output's.
  - Stage: a failure outside one effect's draw discards the stage and sends hits back to today's dressing
    for the session (a dead frame loop used to keep `playImpact` answering yes); every effect starts from a
    reset GL state; a GrabPass copies only the patch around its card and sets the shader's cull after it.
  - Combat: a scene keeps its contact dressing unless its defender takes a hit (`sceneSpecFor`: a status
    move by name, a Bench-only attack); a prefab that throws falls back to `strikeTarget`.
  - Simulation: a burst time or rate that is not a number cannot loop forever; an emitter added to the
    list being walked is kept.

## For the landing commit (Land: branch — nothing below is done yet)
- `STATE.md`: Focus / Active → attack hits play TCG Live impact prefabs (068), awaiting the user's localhost check.
- `DECISIONS.md` (next free numbers): [mat-fx] attack hits play TCG Live's impact prefabs on one WebGL2 stage,
  replacing the DOM hit dressing and the specs' contact-dressing beats (design 068) · [mat-fx] the game's shaders
  are translated from their D3D bytecode at import (`pnpm fx:import-attack`), never hand-written · [mat-fx] the
  stage blends in linear space (sRGB framebuffer) and resolves to a premultiplied canvas · (assumed) S2, S3, S5.
- `ISSUES.md`: charge and travel beats are still procedural Canvas 2D (the shader layer could draw them) ·
  the game's board hex ripple and per-attack authored FX are not ported · the game's Bench card scale is
  unverified (S5) · confirm against game footage: stretched-billboard anchor, rotation signs, the Water splash
  seam · refraction bends the card's art and the effect's own particles, not the mat.
- `MAP.md`: `client/src/setup/netcode/mat-fx/impact/`, `scripts/fx/attack/`, `client/src/assets/fx/attack/`,
  `client/src/dev/attack-fx-lab.html`, `rec/rec-attack-impact.mjs`, `rec/rec-attack-hit.mjs`.
- `.agent/areas/netcode.md` § Mat FX: one clause for the impact stage.
- `NEXTSTEPS.md` ledger → `.agent/archive/NEXTSTEPS-history.md`; this design → `Status: shipped`.

---
Self-approval checklist:
- [x] Every constraint traceable into the Design section
- [x] Every edge-case row has an expected behavior
- [x] Interfaces named and typed
- [x] Slices each independently green
- [x] Slice rows carry files, signatures and test cases; no card rulings involved
- [x] No section reads "TBD"
