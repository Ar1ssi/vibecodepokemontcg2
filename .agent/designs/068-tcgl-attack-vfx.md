# 068: TCG Live attack impact VFX — WebGL particle player
Status: approved (self — one-shot)
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
| A1 | "Data-driven player for Unity ParticleSystem modules" | |
| A2 | "plus ~5 GLSL shader families" | |
| A3 | "Reads dumped specs, so all 66 prefabs come from one engine" | |
| A4 | "Replaces current impact beats" | |
| A5 | "current charge and travel beats stay" | |
| A6 | "Reuses Unity curve maths from `tcgl-fx.mjs` (D207)" | |
| A7 | Size rule: "damage > 150 Large, ≥ 50 Medium, else Small"; "`_C` variants for Bench targets" | |
| A8 | "make them seem more like the actual pokemon games" (not "flat", not "clip art") | user check on localhost — FX work is not self-graded |

## Assumptions
| # | Gap | Decided (assumed) | Why |
|---|---|---|---|
| S1 | "Land" not stated | `Land: branch` | workflow default |
| S2 | Which prefab plays for a move whose main-series type is not the card's printed type | The move's `vgType` picks the TCG type; the printed type wins when it is one of that `vgType`'s TCG types (O7) | the user's standing FX feedback: one palette from build-up through payoff |
| S3 | Which beats are "impact beats" | The generic contact dressing only (O6). Move-identity payoffs (starFlare, pillar, terrain, bolt, slashArc, cloud, glyph, spiral, vignette, aura, rain, speedRays) stay | "charge and travel beats stay"; the 大 flare of Fire Blast is a look the user approved in 063 |
| S4 | Refraction materials need the screen behind them; the board is DOM | They refract the defender's card art plus the particle layers under them; the mat around the card is not bent (O8) | a WebGL canvas cannot read DOM pixels |
| S5 | Bench cards' size in the game is not in the dump | The game's Bench card is taken as 0.7 of its Active card (the `_C` prefabs' scale ratios: fire 0.69 / 0.70, lightning 0.5 / 0.8) | sets the px size of a `_C` effect on our Bench card |
| S6 | Camera post effects (`SCG_Bloom` exists in the client code; whether the board camera carries it is not in the dump) | None | Graphics tiers say `useHDR: false`; nothing to bloom past 1.0 |
| S7 | The game's board hex ripple (`SpawnHexFXEvent`) and the per-attack authored FX (`Attack_*_Impact_1/2`, `IsCustomAuthoredCard`) | Out of scope | not among the 66 prefabs the brief names |
| S8 | Reduce-motion setting | The prefab still plays (it replaces a hit dressing that also plays); `fx-off` plays nothing, as today | matches what `strikeTarget` does today |
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
| 1 | no `damage` plan / zero damage / missing rect | no prefab, no error | [ ] |
| 2 | unknown type, unknown vgType, card without types | colorless prefab | [ ] |
| 3 | damage 49 / 50 / 150 / 151 | Small / Medium / Medium / Large | [ ] |
| 4 | several hits at once (Active + Bench spread) | one effect per target, `_C` on the Bench, one shared context | [ ] |
| 5 | WebGL2 missing, context lost, shader compile fails | today's dressing (`strikeTarget`, full spec beats); logged once | [ ] |
| 6 | asset fetch fails or is still loading | today's dressing for that attack; retry on the next | [ ] |
| 7 | seek backward / frozen-time capture | state at t equals a fresh run to t | [ ] |
| 8 | `fx-off` | nothing plays | [ ] |
| 9 | far seat's card | prefab rotated 180° about the view axis (`turn`) | [ ] |
| 10 | a shader uses an opcode or register the translator does not know | importer exits non-zero naming it | [ ] |
| 11 | a curve with one key / no keys; a burst with 0 count; maxParticles reached | constant / 0; no birth; births stop at the cap | [ ] |
| 12 | tab hidden mid-effect | effect ends at its duration; canvas cleared | [ ] |

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

---
Self-approval checklist:
- [x] Every constraint traceable into the Design section
- [x] Every edge-case row has an expected behavior
- [x] Interfaces named and typed
- [x] Slices each independently green
- [x] Slice rows carry files, signatures and test cases; no card rulings involved
- [x] No section reads "TBD"
