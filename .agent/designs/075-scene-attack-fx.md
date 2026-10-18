# 075: Attack FX inside the three.js board scene
Status: approved (user, 2026-10-18) · building on claude/eager-euler-mu7f5b
Date: 2026-10-18 · Session: claude/eager-euler-mu7f5b

## Problem
The board is three.js only (074-three-board, D220), but attack scenes still play over it as 2D layers.
Move scenes (design 063/065) are DOM ghost copies of both cards plus Canvas2D canvases, and impacts (design 068)
are a second WebGL2 canvas with a top-down camera. Flat ghosts over a tilted 3D table, two GPU contexts, and
Canvas2D shapes that the user called "flat and like clip art" (068 brief): the quality ceiling is the 2D layer.
The user asked (2026-10-18) to move attack FX into the scene: "All three layers", bloom on "Attack FX only",
impacts through the "Board camera".

## Constraints
- C1 Animations never overlap: each attack still goes through the FX queue (`netcode/advisory-animations.js`) and
  `combat.js` gets the same `{ holdMs, durationMs, contactMs, branchEndMs }` contract `playMove` returns today.
- C2 One clock: everything reads the scene clock (`board3d/scene-clock.js`, a WAAPI animation), so fx-preview
  freezes by pausing `document.getAnimations()` (D103/D118/D119).
- C3 One WebGL context: the board's (`gl/gl-renderer.js`). No second canvas for attack FX (design 074 O11).
- C4 Bloom on attack FX only: the table, cards, piles and foil render exactly as today when no attack plays, and
  are not bloomed while one does.
- C5 Impacts use the board camera (user pick). The impact prefabs, their simulation and translated shaders stay
  as design 068 imported them (D-lines of 068: bytecode-translated shaders, never hand-written).
- C6 Move specs (`moves/specs/*`, `signature/specs/*`, 225 + signatures), pose maths (`move-poses.mjs`,
  `card-motion.mjs`), move selection and attack sound are unchanged. Spec data is not edited by this design.
- C7 three.js is vendored byte-identical by `scripts/vendor-three.mjs` (D193); new three files go through it and
  its `--check` test. three is pinned at 0.185.0.
- C8 WebGL2 is required (D220); there is no 2D fallback board, so no 2D fallback for attack FX either.
  `fxDisabled()` (effects off) and `motionReduced()` keep their current meaning.
- C9 Visual work is user-checked on localhost (CLAUDE.md code standard); pure maths and recorders get unit tests.
- C10 Context loss: the board rebuilds once and gives up on the second loss (074 edge case 14). Attack FX must
  never hang the FX queue across a rebuild.

## Current state
- `mat-fx/combat.js:520-575` picks a signature or a move (`pickSignature` / `pickMove`), calls
  `moves/move-player.js playMove({ spec, attacker, defender, seed, impacts, attackerCard, strikeContext,
  branches })` and returns its `holdMs`; falls back to `playLunge` (DOM ghost) and `playAuraPulse`.
  `combat.js:285-355` plays an impact per damaged card through `impact/impact-stage.js playImpact`, else the DOM
  hit dressing (`strikeTarget`). `combat.js:306` shakes the board via `getBoardScene()?.shake`.
- `moves/move-player.js` (444 lines): one `fx-move` overlay host over both cards; back canvas, ghost `<div>`s for
  attacker/defender (+ trail ghosts for `dash`, an echo), front canvas (front + `material.grain` + top), CSS
  particle bursts (`spawnParticles`), branch lanes (design 069) on another canvas, quake jitter translating the
  host. Ghost motion = WAAPI keyframes sampled from `card-motion.mjs attackerPose/defenderPose` in lane terms
  `{ along, across, lift, scaleAlong, scaleAcross, scale, rotate, glow, heat }` × lane.h
  (`ghostTransform`, move-player.js:108). Real cards hide via `hideDuring` once ghosts decode.
- `moves/move-drawers.js` (820 lines): 27 drawers `draw(ctx, lane, s, info)` over `move-poses.mjs` (pure) and
  the material kits. The player sets the composite (source-over for vignette / smoke / shade / terrain
  cracks, `lighter` for the rest) and draws per layer back / front / top.
- `moves/materials/*.js` (5,362 lines, 28 kits + `default` = fire): Canvas2D painters, uniform interface
  (glow, body, tongue, projectile, + `sigil` / `jagStroke`). Survey: § Appendix A.
  The canvas surface they use is small and listed there (paths, arc/ellipse/curves, fill/stroke, radial and
  linear gradients, one pattern, 2 clips, blur filters, globalAlpha, composite, transform stack).
- `impact/impact-stage.js` (678 lines): own canvas + WebGL2 context over the viewport; per effect an sRGB scene
  FBO with depth, game camera `boardCamera()` (impact-geometry.mjs:36, top-down, FOV 20°, height 183),
  `placeEffect` maps the card's viewport rect to clip space; GrabPass reads the card's own art (`cardQuad`) plus
  the effect so far; one resolve pass writes premultiplied sRGB to the canvas.
- `board3d/board-scene.js` (1,097 lines): `render()` = `renderer.render(scene, camera)` on demand
  (`invalidate`), re-requests a frame while cards/piles/overlays move; `shake(offsets)` moves the camera view
  offset; `tween(id, poseFn, ms)` flies a card mesh by viewport-px poses (card-mesh.js:482).
- World frame (board-camera.mjs:1-15): 1 unit = 1 flat CSS px; x right, y up the screen, z toward the viewer; the
  flat table (x right, y up the table, z off the cloth) is that frame tilted by `tiltDeg` (12° default, 0 in the
  TCG Live preset). `tableToWorld({x,y,z}, camera)`. Card poses (`card-poses.mjs` CardPose) are flat table px.
- `board3d/card-mesh.js`: `writeRestPose(card, now, target)` (:397) places a card from `card.pose.at(now)`;
  `update(now)` (:816) runs lifts, flights, rest poses; `cornersOf(id)`, `meshOf(id)`.
- Particles: `particles.mjs burstParticles` (pure rows) → `image-logic/mat-fx.mjs:208 spawnParticles`
  (4 keyframes at offsets 0 / .08 / .55 / 1, easing `cubic-bezier(0.15, 0.7, 0.3, 1)`), CSS shapes
  `css/mat-fx.css:33-119`.

## Options
- **O1 How move beats reach the GPU.**
  A: rewrite the 27 drawers and 28 kits against new semantic GPU primitives — best ceiling, but ~6k lines
  rewritten and every approved look (063 Fire Blast) re-litigated before any move plays in-scene.
  B: a Canvas2D-compatible recorder (`createGpuCanvas`) that the unchanged drawers and kits draw on; it turns
  paths into triangles with paints evaluated on the GPU, and reads an optional `fxStyle` hint that kits set to
  get shader styles (noise flames, boiling orbs, HDR cores) — every move plays in-scene at once with today's
  composition, quality rises per material through small kit edits.
  C: keep Canvas2D and show each canvas as a CanvasTexture plane in the scene — cheapest, but LDR-clamped (no
  bloom from stacked cores) and no per-element shading: caps quality at today's.
  **Pick B.** Complete coverage in one slice, no look regression, and the style hook gives A's ceiling where it
  matters, one material at a time under user checks.
- **O2 Bloom.** A: vendor three's `UnrealBloomPass` (+ `Pass.js`, `CopyShader.js`, `LuminosityHighPassShader.js`,
  21 KB) — standard, maintained. B: hand-written dual-filter bloom — ~150 lines of ours. **Pick A** (C7 path).
- **O3 Keeping bloom off the board (C4).** A: render the board to a target and composite everything — changes
  the board's output path (tone map / colour space / MSAA). B: board renders to the canvas as today; attack FX
  render into their own HalfFloat target after a depth-only prepass of the board, are bloomed there, and are
  composited over the canvas premultiplied. **Pick B** — the board's pixels are untouched (C4) and the FX pass
  costs nothing when no attack plays.
- **O4 Where an effect lives in 3D.** A: camera-facing billboards. B: planes parallel to the table at a layer
  height, lane maths in flat table px (y flipped to the 2D lane's y-down). **Pick B**: the board camera is near
  top-down (12° tilt, 0° TCG Live), so 2D-authored scenes keep their approved composition; depth comes from the
  layer heights (back under the cards, front/top over them) and from the real card meshes moving.
- **O5 Colour space of the FX target.** A: linear. B: sRGB-space values like Canvas2D (palettes are sRGB bytes),
  premultiplied, HalfFloat so additive stacks exceed 1.0 and feed bloom. **Pick B**: same colours as today's
  canvases, and impacts already resolve to premultiplied sRGB.
- **O6 Impacts on the shared context.** A: port impacts to three materials — GrabPass and Unity blend/cull state
  fight three's render loop. B: keep `impact-stage.js`'s raw-GL pipeline, run it on the board renderer's context
  in a "scene host" mode (board camera VP, targets sized to the drawing buffer, resolve into the FX target, then
  `renderer.resetState()`). **Pick B**; GrabPass then reads the rendered board, so refraction bends the real mat
  (fixes 068's open "refraction bends the card's art, not the mat").
- **O7 Card motion.** A: the existing viewport-px `tween`. B: a new pool `drive(id, offsetAt, ms)` that adds a
  flat-table offset onto the card's own rest pose each frame. **Pick B**: the lane is in table px (O4), so
  contact lands exactly; the card keeps its own pose underneath.
- **O8 Clip (2 uses).** A: CPU polygon clipping. B: stencil (the FX target gets a stencil buffer).
  **Pick B** — general and exact.
- **O9 Transition.** A: per-move routing while ports land. B (enabled by O1-B): one switch — once the in-scene
  player lands every attack plays in-scene, then the 2D move player is deleted. **Pick B.**

## Design

### File map (new unless marked)
- `client/src/setup/board3d/fx/fx-stage.mjs` — pure: stage frame, particle keyframe sampler, drive offsets.
- `client/src/setup/board3d/fx/gpu-canvas.mjs` — pure: the Canvas2D-subset recorder → vertex runs + paint table.
- `client/src/setup/board3d/fx/gpu-canvas-mesh.js` — three: uploads a recording, one draw per run.
- `client/src/setup/board3d/fx/gpu-canvas-shader.mjs` — GLSL ES 3.00 sources (strings) for the recorder's material.
- `client/src/setup/board3d/fx/fx-layer.js` — three: FX target, prepass, bloom, composite, scene registry.
- `client/src/setup/board3d/fx/card-overlay.js` — three: card-art quads (trails, echo) and rim/heat tints.
- `client/src/setup/netcode/mat-fx/moves/scene-move-player.js` — `playMoveInScene`, same contract as `playMove`.
- `client/src/setup/netcode/mat-fx/moves/particle-shapes.mjs` — draws one particle kind on any ctx-like.
- modified: `scripts/vendor-three.mjs`, `board3d/board-scene.js`, `board3d/card-mesh.js`, `board3d/board3d.js`,
  `netcode/mat-fx/combat.js`, `netcode/mat-fx/impact/impact-stage.js`, `impact/impact-geometry.mjs`,
  material kits (style hints only, slices 9+).
- deleted (slice 8): the DOM/canvas body of `move-player.js` (ghosts, canvases, CSS bursts, branch canvas),
  impact-stage's own canvas mode, `.fx-move*` CSS, `grainPass` use by moves.

### Stage frame (fx-stage.mjs)
Stage px = flat table px with y flipped: stage `(sx, sy, z)` ↔ table `(x = sx, y = −sy, z)`. Lane maths
(`move-geometry.mjs`) runs unchanged on stage rects.
- `stageRectOf({ x, y, widthPx, heightPx })` → `{ left: x − w/2, top: −y − h/2, width: w, height: h }`.
- `stageToWorldMatrix(tiltDeg)` → `Float32Array(16)`, column-major: columns `[1,0,0,0]`,
  `[0, −cos a, sin a, 0]`, `[0, sin a, cos a, 0]`, `[0,0,0,1]` (a = tiltDeg in rad) — i.e.
  `tableToWorld` after the y flip.
- Layer heights (stage px off the cloth): `LAYER_Z = { back: 0.25, front: 3, top: 4 }`; back is depth-tested
  against the board (under card faces, which rest at ≥ the card thickness), front/top draw over everything.
- `driveOffset(lane, pose)` for a card-motion pose → `{ dx, dy, dz, yawDeg, scaleAlong, scaleAcross, scale,
  laneAngleDeg }` in TABLE px: stage `(ux·along + nx·across)·h`, `(uy·along + ny·across)·h` then y flipped
  (`dy = −stageY`); `dz = lift·h`; `yawDeg = rotate`; the squash keeps `scaleAlong / scaleAcross` about
  `laneAngleDeg` exactly as `ghostTransform` (move-player.js:108).
- `particleState(row, elapsedMs, { durationMs, delayMs = 0 })` → `null` before its start or after its end, else
  `{ x, y, rotateDeg, scale, opacity }`: local time `t = (elapsed − delayMs − durationMs·row.delay) /
  (durationMs·row.life)`, eased by cubic-bezier(0.15, 0.7, 0.3, 1), then linear between the four keyframes of
  `spawnParticles` (offsets 0, .08, .55, 1: translate 0 → .12·d → (.8·d + .3·gravity) → (d + gravity);
  opacity 0 → 1 → 1 → 0; scale startScale(1) → startScale → midScale(.9) → 0; rotate = `row.angle` when
  `row.orient !== false`).

### GPU canvas (gpu-canvas.mjs) — the recorder
`createGpuCanvas({ triangulate, size = 4096 })` → a ctx-like object plus `{ begin(pass), recording(), reset() }`.
`triangulate(contour: {x,y}[], holes: {x,y}[][]) → [i,j,k][]` is injected (browser and tests pass three's
`ShapeUtils.triangulateShape`), so the module stays pure.
- Supported surface (everything the drawers, kits, units and particle shapes call — survey list):
  `save restore translate rotate scale setTransform resetTransform beginPath moveTo lineTo arc ellipse
  quadraticCurveTo bezierCurveTo closePath rect fill stroke fillRect clip createRadialGradient
  createLinearGradient createPattern(…, 'repeat')`; properties `fillStyle strokeStyle lineWidth lineCap lineJoin
  globalAlpha globalCompositeOperation ('source-over' | 'lighter') filter ('none' | 'blur(Npx)')
  lineDashOffset`, `setLineDash(segments)`; plus `fxStyle` (see Styles). Anything else is a no-op that logs
  once per name (`console.debug('gpu-canvas: unsupported', name)`), never throws.
- Colour strings: `rgb(…)`, `rgba(…)`, `#rgb`, `#rrggbb` (what `rgbCss` and kits emit); unparseable → transparent.
- Paths flatten curves into polylines: arc/ellipse with `max(8, ceil(|sweep| · r / 2))` segments capped at 96;
  quadratic / bezier with 12 segments. Points are transformed by the current matrix when added.
- `fill()` (nonzero, per subpath; a subpath with < 3 points is skipped): triangulate each closed subpath; a
  subpath with the opposite winding of the first and wholly inside it becomes a hole.
- Edge softness: every fill and stroke gets an outer feather band of `feather = max(0.75, blurPx·1.5)` stage px
  (blurPx from the current `filter`), alpha ramping 1 → 0 across it (per-vertex `edge` attribute 1 → 0).
- `stroke()`: each polyline segment becomes a quad of half-width `lineWidth/2 + feather`, joins filled with a
  round fan (`lineJoin` 'round', default 'miter' clamped to 2·halfWidth, 'bevel'), caps per `lineCap`
  ('butt' | 'round' | 'square'); a per-vertex `along` distance drives dashes (`setLineDash`, `lineDashOffset`) in
  the shader.
- Paints → one row of the paint table (`Float32Array`, 12 vec4 per row): kind (0 solid, 1 linear, 2 radial
  two-circle, 3 pattern), geometry (gradient points/radii already transformed to stage px; for a transform
  with non-uniform scale the radial gradient is evaluated in the gradient's own space via an inverse 2×3 matrix
  stored in the row), up to 8 stops (offset + premultiplied rgba, `globalAlpha` folded in), style id + params.
  Pattern: the noise tile (`getNoiseTile`) is the only pattern; it is recorded as kind 3 with its tile size and
  the inverse transform, sampled from a texture the mesh uploads once.
- Blend: `globalCompositeOperation` 'lighter' → `add`, anything else → `over`.
- `clip()`: records the current path as a stencil-write run (stencil ref = clip depth); later runs until the
  matching `restore()` test `stencil == depth`; `restore()` past a clip records a stencil-clear run for that
  path. Nesting depth ≤ 4 (deeper clips are ignored with one debug line).
- `begin({ layer, z, depthTest })` starts a pass; the recording is an ordered list of runs; consecutive draws
  with the same `{ layer, z, depthTest, blend, stencil }` merge. Vertex layout per vertex (11 floats): `x y z`
  (stage px; z = pass z), `edge`, `along`, `halfWidth`, `paint` (row index), `u v` (style space: stage px
  divided by the pass's `unit` = lane h), `seed`, `time`.
- `recording()` → `{ vertices: Float32Array, paints: Float32Array, runs: [{ layer, z, depthTest, blend,
  stencil: { op: 'none'|'write'|'test'|'clear', ref }, first, count }], paintCount }`. `reset()` keeps the
  buffers (grown ×2 on demand, capped at `size` paint rows / 2^20 vertices; past a cap further draws are
  dropped with one debug line per frame).

### GPU canvas material (gpu-canvas-shader.mjs, gpu-canvas-mesh.js)
- One `RawShaderMaterial` (GLSL3) per blend × depth-test × stencil state, sharing the shaders. The vertex shader
  applies `uStageToWorld` then the board camera (`projectionMatrix * viewMatrix`). The fragment shader reads the
  paint row from a float `DataTexture` (12 × paintCount, RGBA32F, NEAREST), evaluates the paint (linear: t =
  projection on the axis; radial: the Canvas2D two-circle conical formula, outside-cone fragments transparent;
  pattern: texture × repeat), multiplies by `edge` (smoothstep), applies dashes, then the style, and writes
  premultiplied rgba. Add = `ONE, ONE` (alpha untouched: `ZERO, ONE`); over = `ONE, ONE_MINUS_SRC_ALPHA` both.
- `createGpuCanvasMesh({ three, maxVertices })` → `{ object3d, upload(recording), dispose() }`: one
  `BufferGeometry` with `DynamicDrawUsage` attributes, one draw group per run (`geometry.addGroup(first,
  count, materialIndex)`), `renderOrder` by run order, `object3d.layers.set(FX_LAYER)`, `frustumCulled = false`.
  Stencil runs use `stencilWrite`, `stencilFunc`, `stencilRef`, `stencilZPass` on their materials.

### Styles (the quality hook)
A kit sets `ctx.fxStyle = { id, ...params }` before fills it wants shaded and `null` after (a real 2D context
ignores the property, so the kit stays valid on Canvas2D). The recorder stores `id` and 3 params in the paint
row. Style ids and their fragment work (u, v = stage px / lane h; `time`, `seed` per vertex):
- `0 flat` — the paint as is.
- `1 flame` `{ erode = 0.45, speed = 1.6, gain = 1.8 }` — 3-octave fbm(u·6, v·6 − time·speed, seed); alpha ×=
  smoothstep(erode − .2, erode + .2, paintAlpha + .5·(noise − .5)); rgb × (1 + gain·smoothstep(.75, 1, paintLuma)).
- `2 orb` `{ boil = 0.35, limb = 0.35, gain = 2.2 }` — radial paints only: r = gradient t; rgb ×= (1 − limb·r²)
  + boil·(fbm(u·5 + time·.7, v·5, seed) − .5); core (t < .3) rgb × (1 + gain·(1 − t/.3)).
- `3 liquid` `{ gloss = 0.6 }` — rim highlight where edge < .5: + gloss·white·(1 − edge·2).
- `4 energy` `{ streak = 0.5, speed = 3, gain = 1.6 }` — streaks along `along`: rgb × (1 + streak·sin(along·.2 −
  time·speed·6)) and HDR gain on luma > .8.
- `5 crystal` `{ facets = 6, sheen = 0.5 }` — banded sheen from atan2 of the fill's centroid offset.
- `6 smoke` `{ churn = 0.5 }` — over-blend fbm churn on alpha.
- `7 shadow` `{ depth = 0.3 }` — darkening veil, over blend: rgb × (1 − depth·fbm).
Constants are the starting values; the user-checked style slices may retune them (logged under Deviations as
cosmetic). With no `fxStyle`, output equals the Canvas2D paint (parity).

### FX layer (fx-layer.js)
`createFxLayer({ three, renderer, scene, camera, UnrealBloomPass, motionReduced })` →
`{ add(entry), active(), render(), resize(width, height), stageToWorld(tiltDeg), group, dispose() }`.
- `FX_LAYER = 1` (three `Layers`). The board camera renders layer 0 only (default); FX objects live on layer 1
  in a `Group` added to the board scene (`group.name = 'board3d-fx'`).
- `add({ frame(nowMs) → boolean })`: a running entry; `frame` records its draws for this frame and returns
  false when finished (the entry is dropped). `active()` = entries remain or an impact plays.
- `render()` (called by board-scene after `renderer.render(scene, camera)`, only when `active()`):
  1. run every entry's `frame(clock.now())` (each in try/catch: a throwing entry logs once and is dropped);
  2. `setRenderTarget(fxTarget)`; clear colour (0,0,0,0), depth, stencil;
  3. depth prepass: `camera.layers.set(0)`, `scene.overrideMaterial = depthOnly` (`MeshBasicMaterial({
     colorWrite: false })`), `renderer.render(scene, camera)`; restore `overrideMaterial = null`;
  4. FX pass: `camera.layers.set(FX_LAYER)`, `renderer.render(scene, camera)`; `camera.layers.set(0)`;
  5. impacts: `impact-stage.js drawInScene({ gl, camera, drawingBufferSize, boardFramebuffer: null })` into the
     bound fxTarget, then `renderer.resetState()`;
  6. bloom: `bloom.render(renderer, null, fxTarget)` (UnrealBloomPass, `strength 0.9, radius 0.5,
     threshold 1.0`, resolution = half the drawing buffer);
  7. `setRenderTarget(null)`; composite a full-screen triangle sampling fxTarget with `ONE,
     ONE_MINUS_SRC_ALPHA` onto the canvas, clamping rgb to [0,1].
- `fxTarget`: `WebGLRenderTarget(w, h, { type: HalfFloatType, depthBuffer: true, stencilBuffer: true,
  samples: 0 })` at the drawing-buffer size; `resize` follows board-scene's `setViewport`.
- Threshold 1.0 means only additive stacks above 1 (hot cores, style gains) bloom; LDR impacts (068 S6) and
  over-blended veils never do.
- `motionReduced()` true → bloom skipped (step 6), everything else unchanged.
- `dispose()` drops entries, disposes the target, bloom, materials, meshes; called from board-scene dispose.

### Board scene + card pool hooks
- `card-mesh.js` pool gains:
  `drive(id, offsetAt: (elapsedMs) => DriveOffset|null, ms) → Promise<void>` — `card.drive = { offsetAt, start,
  ms, resolve }`; `writeRestPose` takes an optional offset and applies `x += dx, y += dy, z += dz, yawDeg +=
  yawDeg, s *= scale`, and the along/across squash as a non-uniform scale about `laneAngleDeg` in the card's
  table plane (mesh `scale.set` after rotating the squash axes into the card frame). `update` places driven
  cards every frame (counts as moving). A drive ends when `elapsed ≥ ms` (offset cleared, mesh back on its own
  pose, resolves), when a `tween`/`lift` starts on the card, or on release/dispose (resolves). A lifted card
  ignores `drive` (resolves at once). `offsetAt` throwing ends the drive with one warning.
  `tablePoseOf(id) → { x, y, z, yawDeg, widthPx, heightPx } | null` (own pose now; `heightPx = geometry.h · s`).
  `frontMapOf(id) → Texture | null` (the front material's `map` once ready).
- `board-scene.js` gains passthroughs `drive`, `cardTablePose`, `cardFrontMap`, and `fx` (the layer).
  `render()`: after `renderer.render(scene, camera)`, `if (fx.active()) fx.render()`; `animating` includes
  `fx.active()`. `setViewport` calls `fx.resize`. `dispose` calls `fx.dispose()` first.
- `board3d.js` loads `../../vendor/three/addons/postprocessing/UnrealBloomPass.js` in `loadModules` and passes
  `UnrealBloomPass` into `createBoardScene` (new optional option; absent → no bloom, used by node tests).

### In-scene move player (scene-move-player.js)
`playMoveInScene({ scene, spec, attackerId, defenderId, seed = 1, impacts = null, attackerCard = null,
strikeContext = null, branches = [] })` → `{ holdMs, durationMs, contactMs, branchEndMs } | null`
(`branches`: `{ id, delayMs }[]` — card ids instead of rects).
1. Stage rects from `scene.cardTablePose` of both ids (`stageRectOf`); null → return null (combat falls back
   as today). `lane = laneGeometry(fromRect, toRect)`; null → null.
2. Beats resolved exactly as move-player.js (`resolveBeatColours`, `withDefaults`, `tintCache`), drawn by the
   existing `DRAWERS[beat.drawer].draw(gpuCtx, lane, progress, info)` with `info` built as `sceneInfo` does.
   Per frame, for each layer in back → front → top: `begin({ layer, z: LAYER_Z[layer], depthTest: layer ===
   'back' })`, then the source-over beats, then the lighter beats (the 2D order, move-player.js:333). The grain
   pass is not drawn (shader styles replace it).
3. Card motion: `scene.drive(attackerId, (ms) => driveOffset(lane, attackerAt(ms)), durationMs)` and the
   defender likewise (`attackerAt` / `defenderAt` as move-player.js:385-400). Rim glow (`glow`/`heat`) and heat
   (`heat`, cold tint when `defender.motion === 'freeze'`) draw as card-overlay quads in the material's
   `palette.hot` (cold: `[150, 205, 255]`) at the driven card's corners, additive, alpha = the pose value.
4. Trails (`attacker.motion === 'dash'`: TRAILS lags/alphas, window as `animateTrail`) and the echo
   (`ECHO_PARAMS`, as `animateEcho`) draw as card-art quads (`card-overlay.js`, `frontMapOf`) at the lagged
   pose's corners, over blend, in the front pass z − 0.5.
5. Particles: each `spec.particles[k]` at `burst.at` builds rows with `burstParticles` (same args as
   `spawnBurst`, h = lane.h), anchored at the attacker/defender stage centre; each frame `particleState` gives
   each row's pose, drawn by `particle-shapes.mjs drawParticle(ctx, kind, state, size, aspect, colour)` on the
   GPU canvas in the top pass, additive.
6. Quake: the summed `terrainPose(...).jitter` (as drawBack) offsets every stage point of this scene (a
   recorder `translate` before each layer) and both drives (`dx += jitter.x`, `dy −= jitter.y`).
7. Branch lanes (design 069): `travelBeats(spec)` replayed per branch lane (`laneGeometry(attackerRect,
   branchRect)`, `delayMs`), in the front pass, as `playBranches` does.
8. `impacts?.strikeIn?.(contactMs, { direction: lane.angleDeg, attackerCard, move: spec.id, family:
   spec.family, ...strikeContext })` — unchanged payload; `direction` is now the stage angle.
9. The entry ends at `max(durationMs, branchEndMs) + max burst duration`; returns `{ holdMs: contactMs + 40,
   durationMs, contactMs, branchEndMs }`. `fxDisabled()` → null (combat's existing gate decides first).
`combat.js` calls `playMoveInScene` with ids where it calls `playMove` today (signature and pick paths);
`playLunge`'s DOM ghost moves to a `drive` too (the generic lunge pose `lungePoseFor` mapped through the lane).

### Impacts in the scene (impact-stage.js scene host)
- New export `drawInScene({ gl, camera, drawingBufferSize, boardFramebuffer = null })` and `attachInScene(gl)`
  / `detachInScene()`: the stage's programs, textures, buffers and targets are created on the board context
  (`attachInScene` from fx-layer construction; `detachInScene` on dispose or context loss). `playImpact` keeps
  its signature but takes `cardId` instead of `rect` when in scene mode (`{ type, variant, cardId, bench, turn,
  cardSrc, seed }`), and the effect asks the scene for the card's table pose each frame.
- Placement: prefab root `M = T(world centre of the card face, + card thickness) · B · Rseat · S`, `S =
  heightPx / (GAME_ACTIVE_CARD_UNITS · (bench ? GAME_BENCH_CARD_SCALE : 1))`, `B` maps prefab axes to the world
  frame through the table frame: prefab X → table x, prefab Y → table z (toward the camera), prefab Z → table y
  (up the table for the owner), `Rseat` = 180° about prefab Y for the far seat (`turn` 180). VP = board
  `projectionMatrix · matrixWorldInverse` (view offset and shake included) · M.
- Camera for billboards/sorting (`effect.camera`): the board camera's position and right/up/forward axes
  expressed in prefab space (M⁻¹), plus `depthOf(p) = dot(p − position, forward)`;
  `impact-geometry.mjs` uses `camera.depthOf(particle.pos)` where it uses `|camera.position[1] − pos[1]|` today
  (:100); `boardCamera()` gains the same `depthOf` (so 068's top-down path is numerically unchanged).
- Targets sized to the drawing buffer; `resizeTargets` reads `drawingBufferSize` instead of the window.
- GrabPass: the board region is blitted from the canvas framebuffer (read 0) into a new RGBA8 `targets.board`
  (same size, same rect — legal for a multisampled source), then drawn flipped into `targets.grab` with a new
  utility mode 4 (decode sRGB, then copy) in place of the `cardQuad` art; coverage target = 1 inside the region.
- Resolve: utility mode 0 output (premultiplied sRGB) drawn into the bound fxTarget with `ONE,
  ONE_MINUS_SRC_ALPHA` instead of to the stage canvas. The stage's own canvas, `placeEffect`'s viewport maths
  and `cardQuad` are deleted in slice 8.
- After its draws: `gl.bindFramebuffer(gl.FRAMEBUFFER, <fxTarget fb>)` restored by `renderer.resetState()` +
  `renderer.setRenderTarget(fxTarget)` in fx-layer.

### State & lifecycle, concurrency
- One attack scene at a time (FX queue), but impacts of a multi-hit (069) overlap the move entry; all entries
  share one recorder per frame (reset each frame).
- Board rebuild (context lost once): the old scene's fx layer is disposed → entries dropped, drives resolved,
  `detachInScene` frees impact resources; the FX queue hold is time-based (holdMs), so nothing waits on them.
- Tab hidden: the clock stops (board3d.js); entries resume on the next tick at the WAAPI time (frozen time =
  frozen scene, C2).

## Edge cases & failure modes — the completeness contract; Builder ticks every row
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | empty: spec with 0 beats, 0 particles | cards drive, nothing drawn, contract values returned | [ ] scene-move-player test "beatless spec" |
| 2 | invalid: unknown drawer name / beat throws | that beat skipped, logged once per `spec:index`, others draw | [ ] scene-move-player test "throwing drawer" |
| 3 | invalid colour string / unsupported ctx call | transparent / no-op with one debug line, never throws | [ ] gpu-canvas tests "bad colour", "unsupported call" |
| 4 | boundaries: subpath of 0–2 points; zero-width stroke; r ≤ 0 arc | skipped; no NaN vertices | [ ] gpu-canvas test "degenerate paths" |
| 5 | boundaries: paint/vertex cap reached | further draws dropped, one debug line per frame | [ ] gpu-canvas test "cap" |
| 6 | attacker or defender not drawn by the scene (no table pose) | `playMoveInScene` returns null → combat's lunge/aura path | [ ] scene-move-player test "missing card" |
| 7 | attacker and defender at the same point | `laneGeometry` null → null | [ ] scene-move-player test "coincident" |
| 8 | repeated: a second scene while one runs (multi-hit impacts, queue misuse) | both entries draw; drives on the same card: the newer replaces (older resolves) | [ ] card-mesh drive test "replace" |
| 9 | card leaves the board mid-drive (KO applied early) | drive resolves; scene keeps drawing at the last stage rect | [ ] card-mesh drive test "release" |
| 10 | tween / lift starts on a driven card | drive ends and resolves; tween/lift owns the mesh | [ ] card-mesh drive test "tween wins" |
| 11 | dependency: UnrealBloomPass missing (node, load failure) | FX render without bloom | [ ] fx-layer test "no bloom" |
| 12 | dependency: impact assets not ready / shaders fail | `playImpact` null → DOM hit dressing as today | [ ] existing combat tests + impact-stage test "scene host not attached" |
| 13 | partial failure: entry `frame` throws | entry dropped, logged once, others render | [ ] fx-layer test "throwing entry" |
| 14 | context lost mid-attack | layer disposed, drives resolved, impact resources detached; queue continues on holdMs | [ ] fx-layer test "dispose resolves" + reasoning (rebuild path, 074 #14) |
| 15 | frozen time (fx-preview pause) | frame N redraws identically (deterministic recorder for equal `nowMs`) | [ ] scene-move-player test "same time, same recording" |
| 16 | motion reduced | bloom off; scenes play as today's 2D did under reduced motion (the same gates in combat) | [ ] fx-layer test "reduced" |
| 17 | far seat attacks (lane points up the screen) | lane maths seat-free; impact Rseat 180° | [ ] fx-stage test "far seat lane"; impact placement test "far seat" |
| 18 | TCG Live camera preset (tilt 0) / tilt 12° / resize mid-scene | stageToWorld follows `camera.tiltDeg` every frame; target resizes | [ ] fx-stage test "tilt 0 = identity flip"; fx-layer test "resize" |
| 19 | nothing attacking | `fx.active()` false: zero extra passes, board pixels identical | [ ] fx-layer test "idle renders nothing" |
| 20 | clip nested > 4 / restore without save | extra clips ignored with one debug line; restore at depth 0 is a no-op | [ ] gpu-canvas test "clip depth" |
| 21 | self-intersecting / wrong-winding outline (wobbly tongue) | triangulated as given, no crash; holes only when wholly inside | [ ] gpu-canvas test "self-intersecting" |
| 22 | branch lane to a card the scene no longer draws | that branch skipped | [ ] scene-move-player test "missing branch" |
| 23 | `fxDisabled()` | in-scene player not called (combat gate) / returns null | [ ] scene-move-player test "fx off" |

## Test plan
- Unit (`node --test`): `fx-stage.test.mjs` (frame maths, particle sampler against the 4 keyframes, drive
  offsets vs `ghostTransform` numbers), `gpu-canvas.test.mjs` (each supported call → expected vertices / runs /
  paint rows; caps; clip runs; feather from blur; dash `along`), `card-mesh-drive.test.mjs` (three in node, as
  card-mesh-flight.test), `fx-layer.test.mjs` (fake renderer recording calls: pass order, layers, no-bloom,
  idle, resize, throwing entry, dispose), `scene-move-player.test.mjs` (fake scene + real recorder: contract
  values, drives started with the right offsets at t = contact, strikeIn payload, determinism),
  `impact-placement.test.mjs` (pure part of the scene-host placement: axes, seat, scale, `depthOf`).
- Parity check (slice 6): `rec-move.mjs` for fire-blast, one move per type and one signature, frames compared
  side by side with the 2D captures taken before slice 6 (`.agent/scratch/moves/`), user check on localhost.
- Existing e2e: `scripts/e2e/board3d-*` and `test-card-inspector-e2e.mjs` must stay green.
- User checks: after slice 6 (parity + bloom + mesh cards), slice 7 (impacts on the board camera), slice 9
  (Fire Blast style pass — the quality bar), each style slice after.

## Migration / rollout
No data. One switch (O9): slice 6 routes every attack in-scene; until slice 8 the 2D player is still in the tree
and `combat.js` keeps a one-line fallback to it when `getBoardScene()` is null (a board that failed to start
already shows nothing, D220). Revert path: revert slice 6's `combat.js` hunk — the 2D player still works until
slice 8 deletes it; after slice 8, revert the slice-8 commit.

## Work plan — slices ≤1 session, each leaving the repo green
| Slice | Files (create / modify) | Signatures & data shapes | Test cases: input → expected | Rulings used (source) | Green when |
|---|---|---|---|---|---|
| 1 Vendor bloom | modify `scripts/vendor-three.mjs` (VENDORED_FILES += `addons/postprocessing/UnrealBloomPass.js`, `addons/postprocessing/Pass.js`, `addons/shaders/CopyShader.js`, `addons/shaders/LuminosityHighPassShader.js` ← `examples/jsm/…` same subpaths; `mkdirSync(dirname(dest), { recursive: true })` per file); create the 4 vendored files by running it | unchanged exports | existing vendor test: `driftedFiles()` → `[]`; `--check` exit 0 | n/a | `node scripts/vendor-three.mjs --check` 0; vendor test green |
| 2 Stage maths | create `board3d/fx/fx-stage.mjs`, `board3d/fx/__tests__/fx-stage.test.mjs` | `stageRectOf`, `stageToWorldMatrix`, `LAYER_Z`, `driveOffset`, `particleState` as § Stage frame | `stageRectOf({x:10,y:20,widthPx:90,heightPx:126})` → `{left:-35,top:-83,width:90,height:126}`; matrix(12°)·(10,20,5,1) = `tableToWorld({x:10,y:-20,z:5},{tiltDeg:12})` ±1e-9; tilt 0 → diag(1,−1,1); lane right (ux 1) along .5 h 100 → dx 50, dy 0; lane down (uy 1) along .5 → dy −50; particle at t=.08 (eased) → translate .12·d, opacity 1; before start → null; after life → null | n/a | test file green |
| 3 Recorder: paths, fills, paints | create `board3d/fx/gpu-canvas.mjs`, `__tests__/gpu-canvas.test.mjs` | § GPU canvas: transform stack, path building, `fill`, `fillRect`, solid/linear/radial paints, colours, `globalAlpha`, composite → blend, runs, caps, unsupported no-op | rect fill 10×10 solid red → 2 triangles + feather band, paint row kind 0 rgba (1,0,0,1); `globalAlpha .5` → premult (.5,0,0,.5); radial(5,5,0,5,5,10) stops [0 white,1 transparent] → kind 2 row with circles; 'lighter' then 'source-over' → 2 runs add, over; 2 consecutive same-state fills → 1 run; `rotate(π/2)` then moveTo(1,0) → vertex (0,1); bad colour → alpha 0; `drawImage` → no-op + 1 debug line; > cap → dropped | n/a | test file green |
| 4 Recorder: strokes, dashes, blur, pattern, clip, styles | modify `gpu-canvas.mjs` + its test | `stroke` (caps, joins), `setLineDash`/`lineDashOffset` → `along`, `filter` blur → feather, `createPattern` → kind 3, `clip` stencil runs, `fxStyle` → row style id/params | 2-point line width 4 butt → quad half-width 2+feather; round cap → fan vertices; `blur(8px)` fill → feather 12; dash [5,7] → `along` 0..len on the strip; `clip()` then fill then `restore()` → runs write/test/clear with ref 1; 5 nested clips → 4 honoured; `fxStyle {id:1}` → row style 1, then `null` → style 0 | n/a | test file green |
| 5 GPU canvas material + FX layer + scene hooks | create `fx/gpu-canvas-shader.mjs`, `fx/gpu-canvas-mesh.js`, `fx/fx-layer.js`, `fx/__tests__/fx-layer.test.mjs`, `board3d/__tests__/card-mesh-drive.test.mjs`; modify `board-scene.js`, `card-mesh.js`, `board3d.js` | § GPU canvas material, § FX layer, § Board scene + card pool hooks | fake renderer: active entry → call order `setRenderTarget(fx)`, prepass (override set, layers 0), FX pass (layers 1), bloom.render, `setRenderTarget(null)`, composite; idle → no calls; no UnrealBloomPass → no bloom call; throwing entry dropped; drive at t: pose x = rest x + dx; drive end → rest pose; tween on driven card resolves drive; released card resolves drive | n/a | tests green; boot harness `scripts/e2e/board3d-*` green |
| 6 In-scene player + switch | create `moves/scene-move-player.js`, `moves/particle-shapes.mjs`, `fx/card-overlay.js`, `moves/__tests__/scene-move-player.test.mjs`, `moves/__tests__/particle-shapes.test.mjs`; modify `combat.js` (signature + pick + lunge paths call the scene player with ids; 2D fallback only when `getBoardScene()` null) | § In-scene move player | fire-blast with fake scene: returns `{holdMs:1040,durationMs:1900,contactMs:1000,branchEndMs:0}`; drives started on both ids; at elapsed 1000 the recording has runs in back/front/top; strikeIn called once with contactMs 1000 and `move:'fire-blast'`; same nowMs twice → equal recordings; missing card → null; throwing drawer → others drawn; every `PARTICLE_KINDS` kind draws ≥1 fill on a recorder | n/a | tests green; `rec-move.mjs` fire-blast + 1 per type captured; user parity check |
| 7 Impacts in scene | modify `impact/impact-stage.js`, `impact/impact-geometry.mjs`, `combat.js` (`playImpact` with `cardId` on the 3D board), `fx/fx-layer.js` (attach, step 5); create `impact/__tests__/impact-placement.test.mjs` | § Impacts in the scene | near-seat Active: prefab (0,0,1) → +table y, (0,1,0) → +table z, (1,0,0) → +table x; far seat: Z → −y, X → −x; scale for heightPx 168 = 168/(8.9·1.615); bench ×(1/0.7); `boardCamera().depthOf([0,0,0])` = 183 | game data per design 068 (`Card.obj` 8.9, Active scale 1.615) | tests green; `rec-attack-impact.mjs` on the 3D board; user check |
| 8 Delete the 2D paths | modify `move-player.js` (delete; keep exported pure helpers `tintCache`, `resolveBeatColours` by moving them to `moves/beat-colours.mjs`), `combat.js` (drop the 2D fallback and DOM lunge ghost), `impact-stage.js` (drop own canvas mode, `placeEffect`, `cardQuad`), `css/mat-fx.css` (`.fx-move*`, `.fx-lunge*`), tests that imported deleted code | n/a | every test importing move-player.js updated to beat-colours.mjs; grep `fx-move__ghost` → 0 hits | n/a | `pnpm test` green; e2e green |
| 9 Fire Blast style pass (fx-designer) | modify `materials/fire.js` (tongue: `fxStyle {id:1}` on the 3 passes; body/glow: `{id:2}`), shader constants in `gpu-canvas-shader.mjs` | § Styles | parity test: a recording with no fxStyle has style 0 everywhere; fire tongue rows carry style 1 | user's Fire Blast approval (063) is the baseline | user approves on localhost |
| 10–14 Style passes (fx-designer), one group per slice | 10 water, ice, aurora, poison, mud (liquid/crystal) · 11 electric, psychic, fairy, stellar, normal (energy) · 12 grass, petal, solar, bug, buzz, silver, flying · 13 dark, ghost, dragon, steel, fighting, aura (shadow/energy) · 14 rock, ancient, gem, ground (crystal/smoke) | `fxStyle` hints in those kits only | per kit: rows carry the chosen style ids; no-hint parity test stays green | n/a | user approves each group |

## Deviations (Builder appends here during build)

## Appendix A — material kit survey (read-only, 2026-10-18)

Paths relative to `client/src/setup/netcode/mat-fx/moves/materials/`; D = `../move-drawers.js`.
Every kit: `key, palette{deep,body,hot,core,white}, shade, smoke, particle, glow, body, tongue,
projectile, grain (grainPass; stellar no-op), withPalette`. `default` = `fire` (index.js:52;
`materialFor` falls back to fire for unknown keys).

### Canvas calls the kits + drawers make (grep counts)
beginPath 136 · fillStyle 134 · fill 132 · strokeStyle 76 · stroke 75 · lineWidth 73 · arc 67 ·
lineTo 61 · moveTo 59 · createRadialGradient 36 · lineCap 24 · filter 24 (11 blur + 11 resets
+ guarded resets) · lineJoin 23 · closePath 21 · ellipse 16 · save/restore 10 · translate 8 ·
rotate 5 · globalAlpha 5 · fillRect 3 · setLineDash 2 · quadraticCurveTo 2 ·
globalCompositeOperation 2 (inShadow) · createPattern 2 (shade drawer D:692, grainPass) ·
createLinearGradient 2 · clip 2 (shade D:697, fairy.js:226) · bezierCurveTo 2 · scale 1 ·
putImageData 1 (getNoiseTile build only).

### Blur (`ctx.filter = blur(...)`): one blurred pass per tongue, sized as a fraction of width
fire.js:50 · grass.js:278 (solar) · electric.js:157, :209 (jagStroke) · fighting.js:134 (fighting,
aura) · dark.js:133 · steel.js:126 · dragon.js:107 · fairy.js:173 · ghost.js:186 · normal.js:47.

### inShadow (_shared.js:75) — switches to source-over inside an additive beat
Used by dark, ghost, poison, ground, mud, rock, ancient, bug (tips). Order of blend switches
inside one beat therefore matters.

### sphere (_shared.js:103) — two-circle radial gradient
`createRadialGradient(x - r*lift, y - r*lift, 0, x, y, r)`: focal point offset up-left by
`lift` (default .15; water .3, grass .25, steel .35, fighting/psychic 0).

### tongue() per kit (outline fn, passes)
| kit | outline | passes | blur |
|---|---|---|---|
| fire | tongueOutline | body .6 s1 · hot .8 s.66 · core .9·hot s.4 | w·.12 pass 1 |
| water | tongueOutline amp .4 | body .55 fill · white .85·hot left-edge stroke · 3-5 drops | — |
| grass, petal | leafOutline | body .9 · hot .75·hot sunlit half · deep .85 veins | — |
| solar | tongueOutline | as fire | w·.12 |
| electric | jagOutline | edge .45 (blur) · body .95 @.45w · white·hot @.15w | w·.1 |
| fighting, aura | streakOutline | body .55 (blur) · hot .85 s.55 · white .9·hot s.22 | w·.08 |
| psychic | tongueOutline amp .3 | body .45 · core .85·hot centre stroke | — |
| dark | tongueOutline/shardOutline | hot halo (blur) 1.5w · inShadow deep .9 .8w · hot left edge | yes |
| steel | bladeOutline/shardOutline | edge halo (blur) · linear brush hot/body/deep · white spec line | yes |
| dragon | tongueOutline/shardOutline | body .65 (blur) · hot .8 s.66 · ember .85·hot s.38 | w·.12 |
| fairy | tongueOutline/sparkleShard | body .5 (blur) · hot .7 s.55 · gold twinkles | w·.1 |
| ghost | tongueOutline amp 1.2/shard | body .65 (blur) · hot .6·hot s.55 · inShadow deep centre | w·.12 |
| poison | tongueOutline/shard | ooze .35 · streamGlobs .8 · core glints | — |
| ground | spikeOutline/shard | inShadow body · inShadow deep facet · hot left edge | — |
| mud | tongueOutline/shard | inShadow deep · inShadow streamGlobs body · core glints | — |
| rock, ancient | spireOutline/shard | inShadow body · inShadow deep · rim stroke | — |
| gem | inline spindle/shard | body .6 · hot .8 @.45w · white stroke | — |
| flying | crescentOutline/featherOutline | body .45 · white outer-edge stroke | — |
| ice, aurora | icicleOutline/shard | body .55 · hot facet · white 1px miter stroke | — |
| bug, buzz | needleOutline/shard | body .85 · core centre stroke · inShadow deep tip | — |
| silver | tongueOutline amp .3/shard | body .45 · white stroke | — |
| normal | tongueOutline | hot .75 (blur) · core .9·hot s.6 | w·.08 |
| stellar | ice crystal + icicleOutline 1.12w | ice passes · accent stroke | — |

### body() / projectile() / extras — see the subagent report summarised here
- Bodies are spheres (+ rings, facets, swirls, crackle jags, helix strands) per kit; dark/ghost/
  ground/mud/rock bodies draw partly inShadow.
- Projectiles = glow (≈2.2r) + N tongues fanned behind + body + kit decoration (sparks, drops,
  leaves pinwheel, crackle, streaks, ribbons, puff trails).
- Extras: `electric.jagStroke` (bolt drawer D:543, blurred 2.4w edge pass); `sigil` on fighting,
  psychic, steel, fairy, ghost, poison, ground (glyph drawer D:646 only).
- `dragon.body` / `fairy.body` take a 7th `time` arg the drawers never pass (pre-existing).

### Particle field per kit (className, colour key, aspect)
fire ember/hot/.3 · water droplet/hot/1 · grass leaf/body/.5 · petal leaf/body/.6 · solar mote/hot/1 ·
electric streak/hot/.2 · fighting streak/white/.25 · aura streak/hot/.25 · psychic mote/hot/1 ·
dark streak/hot/.3 · steel streak/white/.2 · dragon ember/ember/.3 · fairy twinkle/hot/1 ·
ghost mote/hot/1 · poison glob/hot/1 · ground shard/hot/.6 · mud glob/body/1 · rock shard/hot/.6 ·
ancient shard/hot/.6 · gem twinkle/hot/1 · flying feather/hot/.35 · ice shard/hot/.6 ·
aurora twinkle/lilac/1 · bug shard/hot/.6 · buzz = bug · silver mote/hot/1 ·
normal streak/[255,224,102]/.3 · stellar twinkle/hot/1.

### _units.js (drawUnit D:66): body, rings, spiked, facet, hoop (uses ctx.scale), crescent,
fist (fillRect), hex, wheel — all plain path fills/strokes + radial gradients.
