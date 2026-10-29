# 077: Element shaders — per-type GPU effects as real 3D meshes
Status: approved (user, 2026-10-29: "No agents, go one at a time")
Date: 2026-10-29 · Session: S076 follow-up (branch claude/tender-gates-gye2a3)

## Problem
User (2026-10-25..29): attacks "look like clip art"; "I want proper shaders for water lightning fire etc", "look
significantly more 3d and like the examples" (Scarlet/Violet move videos, refs/063-move-refs.json). Design 076 added
modifiers, lift, cast shadows and volume shading to the vector GPU canvas; agents' honest verdict per move: still flat.
Cause: every effect is a vector path filled with a gradient, 5–10 px wide, on a near-top-down camera. Picks (user):
hybrid look (own GLSL + TCG Live textures already in the repo), bigger effects, a textured particle layer, and all
types in the first batch. Out of scope: camera moves, move selection/timing/sound, TCG Live impact prefabs (068 stays),
KO/evolve scenes.

## Constraints
- FX run in the three.js board's FX pass (fx-layer.js): HalfFloat target, depth prepass of the card occluders,
  UnrealBloomPass threshold 1.0 (only HDR > 1 blooms), composite over the canvas. Elements render inside that pass.
- Board animations play one after another via the FX queue (CLAUDE.md); a scene's hold is time-based (holdMs),
  so elements never extend or block a hold.
- Canvas2D fallback (design 063 move-player on a 2D context, no-WebGL, node tests) must keep working unchanged:
  every element path is optional and falls back to the existing kit method.
- three.js is vendored (STATE watch-out); node tests must not need WebGL: pure maths in .mjs, GL in .js.
- Textures: TCG Live attack textures are committed under client/src/assets/fx/attack/textures (design 068,
  `pnpm fx:import-attack`); reuse them by file name. No new dependency, no new asset pipeline.
- `motionReduced()` (D105) skips bloom only; elements still draw (they carry the attack's information).
- SwiftShader in CI/captures: shaders must compile on WebGL2/ANGLE-SwiftShader; per-frame cost bounded by caps.

## Current state
- `board3d/fx/fx-layer.js` — runs FX entries each frame into one gpu-canvas recorder, uploads it to
  `gpu-canvas-mesh.js` (layer FX_LAYER in `group`), renders occluder depth then FX into `target`, impacts, bloom,
  composite.
- `board3d/fx/gpu-canvas.mjs` + `-shader.mjs` — Canvas2D-compatible recorder (paths → triangles + paint rows), styles,
  076 modifiers (`fxMod`), lift (`fxLift`, `liftPoint`), cast pass. `ctx.getTransform()` exists (line ~642).
- `netcode/mat-fx/moves/scene-move-player.js` — per frame: cast pass, back pass (beats + rims/trails), front, top
  (beats + burst particles via `particle-shapes.mjs drawParticle`). `info = { elapsedMs, time, seed, material, spec }`.
- `moves/move-drawers.js` — 30 drawers (DRAWERS registry, `guarded()` wrapper) choreograph poses, lift (076
  `lifted`), dissolve (`burning`) and call kit methods: `glow(ctx,x,y,r,alpha)`, `body(ctx,x,y,r,alpha,heat)`,
  `tongue(ctx,spec,opts)`, `projectile(ctx,body)`, `jagStroke(ctx,lines,{width,alpha})`, `sigil(ctx,x,y,r,s)`, plus
  `drawUnit` (UNITS shapes in the kit palette). Some drawers paint directly on ctx (rings, terrain, vignette).
- `moves/materials/*.js` — 28 canvas kits keyed in `materials/index.js` (`MATERIALS`, `materialFor`).
- `netcode/mat-fx/impact/*` — TCG Live impact prefabs on their own GL programs (068); `impact-assets.js` loads the
  attack textures (`/src/assets/fx/attack/`, ImageBitmap, flipY, no premultiply).

## Options
1. **Where elements plug in.** A: new element drawers replacing move-drawers (re-choreograph 30 drawers × types;
   loses 063/065/076 timing work). B: intercept at the kit-method seam — an element kit overrides `body`,
   `tongue`, `projectile`, `jagStroke`, `glow`, `sigil` per type and emits meshes at the poses drawers already
   compute, plus an optional whole-beat override per drawer for shapes drawers paint directly. **Pick B**: keeps all
   choreography, lift and dissolve; per-type files are disjoint, so agents build in parallel; unoverridden methods
   fall back to canvas.
2. **Rendering form.** A: more styles inside the gpu-canvas fragment shader (still flat paths). B: dedicated three.js
   meshes per element kind (instanced billboards, ribbons, spheres, debris) with their own ShaderMaterials in the
   FX group. **Pick B**: real geometry at real heights, per-kind shaders, depth-tested against cards.
3. **Look source** (user pick: hybrid). Own GLSL for structure (fractal bolt paths, flame/fireball noise volumes,
   refraction, lens fields) + TCG Live textures for detail (flipbooks, caustics, sparks, smoke, splashes).
4. **Background for refraction/lensing.** A: none (water as tinted glass only). B: copy the board's rendered frame
   into a `FramebufferTexture` once per FX frame (`renderer.copyFramebufferToTexture`) as `uBoard`. **Pick B**:
   one copy per frame, only while an element that declares `needsBoard` is live.
5. **Element positions.** A: elements get lane-space params and redo lift maths. B: the recorder exposes
   `ctx.stagePoint(x, y)` (current transform + 076 lift → stage px + height) and `ctx.stageScale()`; element kits
   convert with them. **Pick B**: one source of truth for transform and lift.
6. **Cast pass and Canvas2D.** Element kits run only when `ctx.fxElements?.live` is true (GPU canvas, not a cast
   pass). In the cast pass, the canvas kit draws, so shadows/light pools stay. On a 2D context there is no
   `fxElements`, so nothing changes.

## Design
### Element layer (`board3d/fx/elements/element-layer.js`)
`createElementLayer({ three, renderer, group, textures, debug })` →
`{ emitter, frame({ timeSeconds, stageToWorld, camera, size }), needsBoard(): boolean, setBoard(texture), dispose() }`.
- Registry `ELEMENT_KINDS` (`elements/index.js`): `{ [kind]: defineKind }`. `defineKind({ three, textures })` →
  `{ kind, capacity, needsBoard, object3d, begin(), push(params) → boolean, finish(uniforms) }`.
  `push` returns false past `capacity` (one debug line per kind per session).
- `emitter.emit(kind, params)`: unknown kind → one debug line, ignored. `emitter.live` true while recording a
  non-cast pass on the GPU canvas. fx-layer sets `recorder.ctx.fxElements = emitter` (and `live` per pass via
  `begin`).
- Frame: `begin()` every kind at frame start; entries record (canvas + emits); `finish(uniforms)` uploads instances.
  Shared uniforms: `uTime` (s, wrapped mod 512 as gpu-canvas), `uStageToWorld`, `uBoard` (FramebufferTexture or a
  1×1 black), `uViewport` (drawing buffer px). Objects use `three.ShaderMaterial` (built-in camera matrices),
  `depthTest: true, depthWrite: false`, `transparent: true`, layer FX_LAYER, `frustumCulled = false`,
  `renderOrder` per kind (gpu-canvas mesh = 10; elements 20–40).
- fx-layer order: occluder depth → (if `needsBoard`) copy canvas into `uBoard` before switching target → FX layer
  render (gpu-canvas mesh + element objects) → impacts → bloom → composite.

### Params (all stage px; height `z` px above the cloth; colours linear 0–1, may exceed 1 for HDR)
Common: `{ at: {x, y, z}, size, alpha, seed, dissolve }`. Kinds add their own (pinned per kind in its file's
JSDoc; the kind's pure `.mjs` packer validates and clamps them; invalid numbers → instance dropped).

### Recorder additions (`gpu-canvas.mjs`)
`ctx.stagePoint(x, y)` → `{ x, y, z }` (transform, then `liftPoint`, z = pass.z + h); `ctx.stageScale()` → √|det|
of the transform; `ctx.fxElements` property (inert object slot); `begin({ cast })` sets
`fxElements.live = !cast` when an emitter is attached.

### Element kits (`netcode/mat-fx/moves/elements/<type>.js`)
`export const fire = elementKit({ body, tongue, projectile, glow, jagStroke, sigil, beats: { [drawer]: fn } })` —
any subset. Each method has the canvas kit's signature `(ctx, ...args)` and receives the canvas kit as `this.base`
for parts it keeps on canvas. `beats[drawer](ctx, lane, s, info)` replaces a whole drawer for that material.
Helpers (`moves/elements/_emit.js`): `stageOf(ctx, x, y)`, `stageLen(ctx, px)`, `alphaOf(ctx, alpha)` (×
globalAlpha), `dissolveOf(ctx)` (`ctx.fxMod?.dissolve?.amount ?? 0`), `emit(ctx, kind, params)`.
`materials/index.js` `materialFor(key)` returns the canvas kit merged with `ELEMENT_KITS[key]` through
`withElements(kit, elementKit)`: each overridden method routes to the element kit when `ctx.fxElements?.live`,
else to the canvas kit; `drawBeat(name)` exposes `beats`. `move-drawers.js guarded()` calls
`info.material.drawBeat?.(name)` when `ctx.fxElements?.live` and uses it instead of the drawer.
`particle-shapes.mjs drawParticle`: when `ctx.fxElements?.live`, emits a `sprite` (kind → texture per
`PARTICLE_SPRITES`) instead of the vector shape.

### Kinds — first batch (one owner each; file = `board3d/fx/elements/<kind>.js` + pure `<kind>.mjs`)
| Kind | Look | Owner |
|---|---|---|
| `sprite` | instanced camera-facing textured quad: flipbook sub-UV (cols×rows, fps), rotation, HDR tint, additive or alpha, soft fade, dissolve. The particle base. | slice 1 (foundation) |
| `fireball` | camera-facing quad raymarching a noise sphere: domain-warped fbm, blackbody ramp (deep red → white, HDR core), flame flipbook detail, heat-haze rim | fire agent |
| `flameJet` | quad stretched along an axis (base→tip), flowing flame noise + `TEX_VFX_Flame_2x2`/`Fire_Flame_Pointy`, taper, blackbody ramp, curl | fire agent |
| `bolt` | CPU fractal path (midpoint displacement + branches, pure .mjs, re-rolled at `flickerHz`), camera-facing ribbon, core/glow profile, HDR white core, `ElectricCrack` sub-UV detail | lightning agent |
| `plasma` | electric orb: crackling noise shell + inner arcs | lightning agent |
| `waterBeam` | ribbon/tube along a path with flowing normals (`T_VFX_Water_Beam`, `Caustic_Noodly`), refraction of `uBoard`, fresnel, spec, foam edges | water agent |
| `waterDrop` | refractive sphere billboard (normal from sphere, `uBoard` offset, rim, spec) | water agent |
| `splash` | flipbook sheet (`T_VFX_Water_Splash_2x2`, `Splash_Water_1x4`) standing up | water agent |
| `lens` | psychic field: `uBoard` lensing + chromatic split ring (`Psychic_Ring_Offset`, `Spectrum_Ring`) | psychic/ghost agent |
| `smoke` | volumetric billboard: flow-mapped `RenderClouds` + soft depth, ink/void tints | psychic/ghost agent |
| `debris` | instanced lit 3D rocks (noise-displaced icosahedron, Lambert + rim, tumble) and leaves (sprite atlas `T_VFX_Leaves_2x2`) | grass/rock agent |

### Sizes
Element kits scale up from the canvas sizes they receive (bigger effects, user pick): each kit names
`SCALE` constants at the top of its file; first values 1.6–2.5× the canvas radius/width, tuned against references.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | no emits in a frame | every kind's instance count 0; nothing draws; `needsBoard` false (no copy) | [x] covered: element-layer.test 'sprite: buckets…' (empty frame), 'the board is copied only when…' |
| 2 | invalid params (NaN, negative size, unknown kind) | instance dropped / emit ignored, one debug line per kind | [x] covered: sprite.test 'normalizeSprite…', element-layer.test 'emits reach a kind only while live…' |
| 3 | capacity reached | further pushes dropped this frame, one debug line per kind per session | [x] covered: element-layer.test 'sprite: a texture not loaded yet…' |
| 4 | two scenes overlap (multi-hit impacts + move) | both emit into the same frame; instances accumulate | [x] covered: element-layer.test 'two scenes in one frame…' |
| 5 | texture fails to load / not yet loaded | kind draws with its procedural fallback (`uHasTex` 0); retried next attack | [x] covered: element-layer.test (uHasTex 0 path) + check-element-shaders sample 'missing-texture.webp' |
| 6 | shader fails to compile | the shader check script fails in CI before landing; at runtime three logs once and that kind draws nothing (the move still plays; other kinds and canvas parts draw) | [x] covered: scripts/fx/check-element-shaders.mjs (caught gl_FragColor under GLSL3); element-layer.test 'a kind that throws…' |
| 7 | cast pass | element kits not called; canvas kit draws shadows/light pools | [x] covered: elements-routing.test 'begin turns elements live…', 'withElements routes…', 'a drawer hands its whole beat…' |
| 8 | Canvas2D context / node tests | no `fxElements`; all kits draw as before | [x] covered: elements-routing.test 'withElements routes…' (no emitter), full mat-fx suite unchanged |
| 9 | board render target not the canvas (future offscreen) | `uBoard` copy skipped, 1×1 black bound; refraction degrades to tint | [x] covered: element-layer.test 'the board is copied only when…' (black stand-in) |
| 10 | context lost / fx-layer disposed | element layer disposes geometry, materials, textures it created | [x] covered: element-layer.test 'finish wraps time… dispose frees every kind' |
| 11 | reduced motion | bloom off (fx-layer); elements unchanged | [x] reasoning: fx-layer skips only bloom under motionReduced(); the element layer has no motion branch |
| 12 | dissolve amount 1 | instance fully transparent (shader discard), not dropped (keeps noise stable) | [x] reasoning: elDissolve(amount 1) → k = n − 1 ≤ 0 → alpha 0 → discard; the instance stays queued (sprite/fire/water/lens/smoke/debris shaders) |

## Test plan
- Node: every pure packer/path module (`*.mjs`) — params → instance arrays, clamps, drops, caps; bolt path
  determinism (same seed/time bucket → same path); `withElements` routing (live / cast / no emitter); recorder
  `stagePoint`/`stageScale`; drawParticle routing.
- Browser: `scripts/fx/check-element-shaders.mjs` compiles every kind's material in Chromium (SwiftShader) and
  renders one frame of each with no GL errors.
- Visual: fx-preview captures per type — reference | before | after strips (agents), user checks on localhost.

## Migration / rollout
No data. Rollout is per type: a type without an element kit draws as today. Revert path: drop `ELEMENT_KITS`
entries (or the whole wrap in `materialFor`) — the canvas path is untouched.

## Work plan — slices ≤1 session, each leaving the repo green
| Slice | Files (create / modify) | Signatures & data shapes | Test cases: input → expected | Rulings used | Green when |
|---|---|---|---|---|---|
| 1 foundation (lead) | create `board3d/fx/elements/{element-layer.js,index.js,element-textures.js,sprite.js,sprite.mjs}`, `moves/elements/{_emit.js,_kit.js,index.js}`, `scripts/fx/check-element-shaders.mjs`; modify `gpu-canvas.mjs`, `fx-layer.js`, `materials/index.js`, `move-drawers.js` (guarded), `particle-shapes.mjs` | as § Design | stagePoint under translate+lift → stage px + z; withElements: live→element, cast→canvas, no emitter→canvas; sprite pack: NaN dropped, cap hit → false; drawParticle live → one sprite emit | n/a | unit tests + shader check green; moves unchanged without element kits |
| 2 fire (agent) | create `elements/{fireball,flameJet}.{js,mjs}`, `moves/elements/fire.js` (+ dragon reuse optional) + tests; one line each in both index files | kinds per table | packer clamps; kit routes body→fireball, tongue→flameJet | refs: Fire Blast / Flamethrower EV videos | tests + shader check; captures |
| 3 lightning (agent) | `elements/{bolt,plasma}.{js,mjs}`, `moves/elements/electric.js` | bolt path: `boltPath({from,to,seed,bucket,jag,branches})` → points[] | same seed+bucket → identical path; branch count ≤ max | Thunder / Thunderbolt EV videos | same |
| 4 water (agent) | `elements/{waterBeam,waterDrop,splash}.{js,mjs}`, `moves/elements/water.js` (+ ice optional) | waterBeam path points + width | — | Hydro Pump / Water Gun EV | same |
| 5 psychic/ghost/dark (agent) | `elements/{lens,smoke}.{js,mjs}`, `moves/elements/{psychic,ghost,dark}.js` | — | — | Psychic / Shadow Ball EV | same |
| 6 grass/rock/ground (agent) | `elements/debris.{js,mjs}`, `moves/elements/{grass,rock,ground}.js` | — | — | Rock Slide / Leaf Storm EV | same |
| 7 second batch | remaining types on existing kinds | — | — | — | after 2–6 land |

## Deviations (Builder appends here during build)
- Slice 1: sprites take a `channel` ('r' | 'a' | 'rgba'): most TCG Live particle textures are greyscale masks in RGB
  with no alpha, a few keep the mask in alpha, colour sprites keep both (probed 2026-10-29).
- Slice 1: billboards lean toward the camera by half their size (`elBillboard(..., lean)`), so a quad does not cut
  through the cards/cloth behind it with a hard line (seen in the first check render).
- Slice 1: GLSL3 ShaderMaterial in three r185 has no `gl_FragColor`; kinds declare `out vec4 fragColor`.
- Build is sequential, no agents (user, 2026-10-29); the work-plan rows' "(agent)" read "(lead)".
- Slice 2: TEX_VFX_Dot_Glow is a hard-edged disc; glows and embers use TEX_VFX_Gradient_Radial(_Small). Flame-jet roots
  fade (a fan of jets stacks white at its hub otherwise); the fire ramp's HDR boost covers only t > 0.94.
- Slice 3: bolt segments blend with MaxEquation (summing knots every joint). Bolts take the drawer's polylines; no
  CPU fractal path module was needed (`boltPath` in the slice row is the drawers' existing boltPoses).
- Slice 4: the beat hook moved from guarded() onto the raw drawer (`elementable`), inside lift and burn wrappers, so an
  element beat rises and dissolves like the canvas one; an element beat may return false to defer to canvas. The board
  copy calls renderer.resetState() first: three's binding cache drifted and the copy landed in the 1×1 stand-in
  (INVALID_VALUE, found by the check script's per-step GL error attribution).
- Slice 5: ghost and dark share one smoke-made kit (`shadow.js`); fire's smoke beat is soot from the same helper.
- Slice 6: grass is leaves only (sprite kind); rock/ground share a stone kit (`earth.js`). Debris writes depth.
- Slice 7 (user: "do slice 7"): every material has an element kit. Shared beats for all types (`_shared-beats.js`):
  impact flash (glow, TCG Live impact ring, spikes, flash lines), slash (the type's tongue + a Slash_1x4 streak aligned
  on screen), aura (inner glow + energy ring). Kits reused by palette: dragon/solar → fire; poison/mud → water + gas;
  fairy/stellar → psychic lens; ancient → rock. New small kits: energy (fighting, aura, normal, buzz: force spheres +
  flame streaks), crystal (ice/aurora drops + glossy shards, gem/steel light spheres + shards, bug needles), air
  (flying, silver: Slash02 swipes + white air), petal leaves. Sprites gained `alignDeg` (a stage heading projected on
  screen); debris gained `gloss` / `smooth`. Steel and gem orbs are light spheres, not metal balls: Flash Cannon's beam
  motes are bodies and read black as polished metal. Checked: Dragon Pulse, Aura Sphere, Close Combat, Iron Tail,
  Flash Cannon, Moonblast, Ice Beam, Avalanche, Sludge Bomb, X-Scissor, Pin Missile, Hurricane, Petal Dance.
