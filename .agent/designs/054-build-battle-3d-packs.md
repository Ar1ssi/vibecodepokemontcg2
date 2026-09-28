# 054: Build & Battle 3D packs — WebGL pillow packs, a real rip, cards out of the mouth
Status: draft
Date: 2026-09-29 · Session: S330 · depends on design 052 (unboxing scene, Pocket-style rework)

## Problem
The user finds the Build & Battle opening flat: each pack is one `<img>` with a `clip-path` tear, the
torn strip slides sideways and fades, and nothing reads as a physical object. They asked for packs
that are 3D models like Pokémon TCG Pocket, opened like Pocket, with the top actually ripped off.
User picks (2026-09-29, AskUserQuestion): Three.js WebGL · packs + rip first, box/lid/wrap later ·
cards hand off to the current DOM swipe stack.

## Constraints
- 052's house rules stay: state lives in `session.unboxing` (reducer `advanceUnboxing`), the scene
  never changes the pool, every beat is skippable, a reload lands on the settled picture, sound
  before sight via `playFxSound({ effect })`, `motionReduced()` reads only
  `localStorage['ptcg-reduce-motion']` (the user's OS reports reduced motion; never read the OS flag),
  `fxDisabled()` / `body.fx-off` kills motion and sound, no whiteouts, no sunbursts, no backdrop colour
  change, hit flares stay inside the card.
- One clock: 052 samples pure pose functions into WAAPI keyframes. WAAPI animates CSS only, so the
  WebGL side samples the same kind of pure pose functions on a `requestAnimationFrame` clock
  (`performance.now()`); every 3D animation still has one pure pose function per beat.
- No bundler, no build step (D4). Client modules are native ES modules served by `express.static`.
- New dependency ⇒ a DECISIONS line (CLAUDE.md hard rule). D4 ("no new deps") scopes the shared
  engine/netcode; this is client-only and lazily loaded.
- The server sends `Cache-Control: no-store` on every static file and has no compression
  (`server/server.js:160-163`): every byte of the library is re-downloaded on each page load that
  opens a box. Size matters.
- Card images: `assets.tcgdex.net` answers `Access-Control-Allow-Origin: *` (curl, 2026-09-29), so
  they can be WebGL textures with `crossOrigin = 'anonymous'`. The cloud sandbox blocks TCGdex
  (052 slice 3), and `server.js:229` notes Cloudflare blocks on the API: a texture load must fail
  soft.
- Pack art (`client/src/assets/build-battle/packs/me02-*.webp`, measured with PIL this session):
  780 × 1426, alpha silhouette. Rows 0–148 and 1277–1425 are the flat crimped seals, opaque edge to
  edge; the body between them is opaque from x = 17 to x = 762 (the pinched sides). The art already
  carries baked shading.
- Accessibility: the tear stays a `button` (Enter/Space tears), the swipe stack stays DOM.
- WebGL may be missing, blocked, or lost mid-scene: the current DOM scene is the fallback and must
  keep working unchanged.

## Current state (read this session, `origin/main` c0fd43b9)
- `sidebox/native-deck-builder-unboxing.js` — the whole scene. `mountUnboxingScene({root, getUnboxing,
  dispatch, packs, packModel, seed, promo, onBuildDeck})`. `render({entrance})` rebuilds the settled
  DOM for `viewOf(u)` ∈ box | spread | pocket | summary (:445). Spread: `renderSpread` (:621) builds
  one `.bb-bigpack` per untorn pack; `layoutSpread` (:636) sets translate + scale only (no rotation)
  from `packSpreadSlot`; the focus pack carries `.bb-pack__strip` (clip-path `packTearEdge`),
  `.bb-cutline` and the `button.bb-pack__top` bound by `bindTear` (:1265). Fly-out: `flyOut` (:1005)
  → `playFly` (:844) animates `.bb-bigpack__fly` from the box mouth with `packFlyPose`. Tear:
  `beatTearPack` (:1012) → `runBeat` (:948: dispatch → sound → animate → `render({entrance})`) →
  `playCut` (:881): a clipped pack image drops, the `.bb-pocket__stack` rises. Pocket/summary:
  `renderPocket` (:673), `bindSwipe`, `flipHit`, `swipeAway`, `revealAllPack`, `skipScene` (:1246).
  `busy` gates input; `generation` guards async continuations; `withBackstop` (4000 ms).
- `core/build-battle/unboxing.mjs` — pure: reducer, constants (`PACK_TORN_AT` 0.4, `TAP_SLOP_PX` 6,
  `PACK_FLY_MS` 680, `PACK_FLY_STAGGER_MS` 120, `POCKET_CUT_MS` 420, `SCENE_BACKSTOP_MS` 4000),
  `packTearProgress`, `tearReleaseOutcome`, `packSpreadSlot`, `packFlyPose`, `packTearEdge(seed,
  packIndex, teeth)` (:562: CSS polygon, tear line at 7 % of the height, teeth 2–5 % deeper, own RNG
  stream), `packArtIndexes`, `hitTierFor`, `unboxingVoiceFor`.
- `core/build-battle/box-textures.mjs` — `packArtSrc(key)`; `default-card-back.mjs`
  `resolveDefaultCardBackSrc()` (same-origin).
- `image-logic/mat-fx.mjs` — `motionReduced`, `fxDisabled`, `spawnParticles`; `mat-fx/particles.mjs`
  `burstParticles`; `mat-fx/fx-audio.mjs` `STATIC_VOICES`, `voicesFor`.
- `css/deck-builder-unboxing.css` — `.bb-stage` fixed fullscreen (z 1000); `.bb-spread` fixed inset 0;
  `.bb-bigpack` centred at 45 %, width `--bb-big-pack-w`, transform transition;
  `.bb-pack__top` 18 % tall; `.bb-pocket__stack` width `--bb-big-card-w`, 63/88.
- `css/__tests__/fx-kill-switch-css.test.mjs:155` — every idle loop in the unboxing sheet needs a
  `body.fx-off` and reduced-motion guard.
- `.claude/skills/fx-preview/rec/rec-unboxing.mjs` — Playwright recorder for the scene.
- No `client/src/vendor/`, no import map, `eslint.config.mjs` has no ignores, no `.prettierignore`.

## Options
1. **Renderer.** A: CSS 3D slats (≈16 angled slices fake the bulge) — no dependency, but no real
   light or reflection, and Chrome rasterises CSS 3D at layout size (052's sharpness fix). B:
   Three.js WebGL — real geometry, physically based foil, native-resolution rendering; costs a
   dependency. C: raw WebGL — no dependency, but hand-written PBR, env maps and matrix code is a
   library's worth of code to maintain. **Pick B** (user pick).
2. **Three.js version and files.** A: latest 0.186.1 — ships no minified build: `three.core.js`
   1.46 MB + `three.module.js` 0.66 MB, re-sent on every load (no-store, no gzip). B: 0.185.0, the
   last release with `three.core.min.js` (376 KB) + `three.module.min.js` (357 KB) = 733 KB. C:
   tree-shake with esbuild — a second new dependency for maybe 30 % less. **Pick B**, pinned exact.
   Server gzip would cut it to ≈ 180 KB, but that touches every route: filed as an issue, not done here.
3. **How the files reach the browser.** A: CDN `<script>` like socket.io — a third-party runtime
   fetch on a page that already works offline for this mode; no integrity pin. B: vendor under
   `client/src/vendor/three/`, copied from `node_modules/three` (devDependency, exact version, lockfile
   integrity) by `scripts/vendor-three.mjs`; a test proves the vendored bytes equal the pinned
   package. C: serve `node_modules` through Express — makes `three` a runtime dependency of the
   server workspace and couples deploys to install layout. **Pick B** (vendoring is existing
   practice: D97 sprites, playmats).
4. **Resolving `import ... from 'three'`** (the RoomEnvironment addon uses the bare specifier). A:
   an import map in `client/index.ejs` before the first module script. B: rewrite the specifier while
   vendoring. **Pick A**: standard, one line, later addons work untouched.
5. **Loading.** A: static import — every page load pays 733 KB. B: `import()` when the unboxing scene
   mounts at a stage before `done`; the scene keeps the DOM path until the stage is ready. **Pick B.**
6. **Pack model.** A: authored glTF from Blender — needs a toolchain the repo lacks, and the rip
   needs runtime geometry anyway. B: procedural pillow built in code from the vendored art: a
   subdivided plane per side, displaced by a pure bulge function; seals flat; alpha test cuts the
   silhouette from the art. **Pick B.**
7. **Pack look (the art already has baked shading).** A: plain lit texture — double shading, muddy.
   B: `MeshPhysicalMaterial` with the art as `map` *and* `emissiveMap` (emissive keeps the printed
   colours readable), metalness + clearcoat + light iridescence for foil, lit by a RoomEnvironment
   PMREM env map and one moving-glint directional light, `NeutralToneMapping` (keeps art colours;
   ACES desaturates). **Pick B**; numbers in § Design, tunable by the fx-designer under Deviations.
8. **Rip geometry.** A: split the grid along the jagged line — exact but fiddly triangulation per
   seed. B: two meshes: the body (full pack) and the strip (top 12 % only), each clipped by an
   `alphaMap` mask drawn from the same seeded tear line, so the jagged edge is pixel-exact on both.
   The strip peels by rotating its vertices about a hinge line, per column, following the finger;
   past `PACK_TORN_AT` it finishes the rip and flies as a rigid body. **Pick B.**
9. **Cards coming out.** A: cards drawn on top of the pack — they would show through the front. B: a
   card-stack mesh inside the pack, clipped by a local clipping plane at the mouth line
   (`renderer.localClippingEnabled`), rising while the pack drops away. **Pick B.**
10. **Hand-off to the DOM stack.** The pocket DOM renders hidden (`.is-awaiting-3d`, layout kept);
    the 3D stack settles onto the top card's measured rect; in one frame the DOM stack shows and the
    3D stack hides. The foil (CSS holo) starts at the hand-off. (User pick.)
11. **Where input lives.** A: raycast on the canvas. B: the DOM `.bb-bigpack` anchors stay
    (invisible) and keep `button.bb-pack__top` and `bindTear`; the 3D packs follow the anchors'
    rects. **Pick B**: keyboard, `TAP_SLOP_PX`, spring-back and the recorder keep working unchanged.
12. **Kill switch and motion.** `fxDisabled()` → no WebGL at all (DOM path; the kill switch means no
    FX). `motionReduced()` → WebGL static: no sway/tilt loop, every beat jumps to its end frame,
    render on demand.
13. **Box, lid, shrink-wrap** (user: later). They stay CSS here. Design 055 moves them to WebGL
    after the user has seen this pack look, since the box must match it (materials, lights, tone).

## Design
### Files
- `client/src/vendor/three/{three.core.min.js, three.module.min.js, RoomEnvironment.js, LICENSE}` —
  vendored from `three@0.185.0` (`build/` and `examples/jsm/environments/`), byte-identical.
- `scripts/vendor-three.mjs` — copies those four files from `node_modules/three`; refuses (exit 1)
  when `node_modules/three/package.json` version ≠ `THREE_VERSION` (`'0.185.0'`, exported).
- `client/index.ejs` — before `<script type="module" src="src/front-end.js">`:
  `<script type="importmap">{"imports":{"three":"/src/vendor/three/three.module.min.js"}}</script>`.
- `core/build-battle/pack3d.mjs` — pure (no `three`, no DOM), unit-tested. § Pure API.
- `sidebox/native-deck-builder-pack3d.js` — the WebGL stage (imports `three` and the vendored
  RoomEnvironment). § Stage API. Loaded only through `import()`.
- `native-deck-builder-unboxing.js` — branches spread / fly / tear / cut to the stage when it is ready.
- `css/deck-builder-unboxing.css` — `.bb-gl` canvas and `[data-render='3d']` rules.
- `mat-fx/fx-audio.mjs` — one new voice `unbox-rip-tick`.
- `eslint.config.mjs` — `{ ignores: ['client/src/vendor/**'] }`; new `.prettierignore` —
  `client/src/vendor/`.

### Pure API (`core/build-battle/pack3d.mjs`)
World units: pack width = 1. `PACK_ASPECT = 1426 / 780` (height 1.8282).
```
SEAL_TOP_V = 149 / 1426 · SEAL_BOTTOM_V = 1277 / 1426 · BODY_INSET_U = 17 / 780
BULGE = 0.05 · BULGE_RAMP_V = 0.06 · STRIP_V = 0.12
PEEL_MAX_DEG = 150 · PEEL_BAND = 0.18 · PEEL_CURL = 0.35
TILT_MAX_Y_DEG = 14 · TILT_MAX_X_DEG = 10 · TILT_FOLLOW_PER_S = 10
SWAY_Y_DEG = 4 · SWAY_X_DEG = 2 · SWAY_BOB = 0.006 · SWAY_PERIOD_Y_MS = 3200 · SWAY_PERIOD_X_MS = 4100
GRAB_LEVEL_MS = 120 · RIP_FINISH_MS = 140 · RIP_TICK_STEP = 0.1
STRIP_FLIGHT_MS = 650 · STRIP_GRAVITY = -6 · STRIP_FADE_FROM = 0.6
CARDS_RISE_MS = 420 · CARDS_RISE_AT = 0.55 · CARDS_FROM_V = -0.62 · CARDS_TO_V = 0.5
PACK_DROP_MS = 520 · PACK_DROP_AT = 0.45 · PACK_DROP_ROTATE_X_DEG = -14
STACK_SETTLE_MS = 280 · FLY_SPIN_Y_DEG = -180 · SPREAD_SIDE_Z = -0.4 · SPREAD_SIDE_ROTATE_Y_DEG = -18
CAMERA_FOV_DEG = 30 · CAMERA_DISTANCE = 6 · PIXEL_RATIO_MAX = 2 · CARD_TEXTURE_TIMEOUT_MS = 1500
```
- `pillowZ(u, v) -> number` — front-face displacement in world units at art coordinates `u, v` ∈
  [0,1] (v = 0 at the top). 0 inside either seal (`v < SEAL_TOP_V` or `v > SEAL_BOTTOM_V`) and outside
  the body columns (`u < BODY_INSET_U` or `u > 1 − BODY_INSET_U`). Otherwise
  `BULGE · across(u) · along(v)`, `across = sin(π · uBody)^0.6` with `uBody` the body-relative u,
  `along = smoothstep` over `BULGE_RAMP_V` inward from each seal edge. The back face uses `−pillowZ`.
- `packTearLine(seed, packIndex, teeth = 12) -> {x, y}[]` — the tear line of `packTearEdge` as
  numbers in [0,1], ordered left → right, from the same RNG stream and draw order (so it matches
  `packTearEdge` point for point; `packTearEdge` itself is not changed).
- `tearHingeV(line) -> number` — mean `y` of the line (the fold axis).
- `peelSide(pointerXPx, rect) -> 1|-1` — 1 (tear runs left → right) when the press lands in the
  left half of `rect`, else −1.
- `peelAngleDeg(u, progress, side) -> number` — with `s = side === 1 ? u : 1 − u` and
  `reach = progress · (1 + PEEL_BAND)`: `PEEL_MAX_DEG · smoothstep(0, PEEL_BAND, reach − s)`.
  0 at `progress = 0`; `PEEL_MAX_DEG` for every `u` at `progress = 1`.
- `peelVertex({y, z}, {hingeY, angleDeg}) -> {y, z}` — rotates the point about the horizontal hinge
  at `hingeY` toward the camera (+z), with curl: effective angle `angleDeg · (1 + PEEL_CURL · d)`
  where `d = max(0, y − hingeY)` in world units. Identity at angle 0; a point on the hinge is fixed.
- `stripFlightPose(t, {side}) -> {x, y, z, rotX, rotY, rotZ, opacity}` — closed-form rigid flight
  over `STRIP_FLIGHT_MS` (`t` ∈ [0,1], seconds `s = t · 0.65`): velocity `(1.6 · side, 1.2, 0.6)`
  world/s, gravity `STRIP_GRAVITY` on y, spin `(−3.5, 1.2 · side, 4.2 · side)` rad/s,
  `opacity = 1 − smoothstep(STRIP_FADE_FROM, 1, t)`.
- `cardsEmergePose(t) -> {v}` — stack offset in pack heights, `lerp(CARDS_FROM_V, CARDS_TO_V,
  easeLift(t))`.
- `packDropPose(t, {viewportWorldH}) -> {y, rotateXDeg}` — `y = −1.4 · viewportWorldH · t²`,
  `rotateXDeg = PACK_DROP_ROTATE_X_DEG · easeLift(t)`.
- `packFlyPose3d(t, params) -> {...packFlyPose(t, params), rotateYDeg}` — adds
  `lerp(FLY_SPIN_Y_DEG, 0, easeLift(t))` so the silver back shows first and the front turns in.
- `packSpreadSlot3d(index, focus, spacingPx) -> {...packSpreadSlot(...), zWorld, rotateYDeg}` —
  focus: 0 / 0; side packs: `SPREAD_SIDE_Z` / `SPREAD_SIDE_ROTATE_Y_DEG`.
- `swayPose(timeMs, packIndex) -> {rotateYDeg, rotateXDeg, bob}` — sines with phase
  `packIndex · 0.9` rad.
- `tiltTarget(pointer, rect) -> {rotateYDeg, rotateXDeg}` — normalised `nx, ny` ∈ [−1,1] from the
  pack rect centre (clamped), `rotateY = TILT_MAX_Y_DEG · nx`, `rotateX = −TILT_MAX_X_DEG · ny`;
  `{0,0}` for a missing pointer.
- `followTilt(current, target, dtMs) -> {rotateYDeg, rotateXDeg}` — exponential approach,
  factor `1 − exp(−TILT_FOLLOW_PER_S · dt)`; `dtMs ≤ 0` returns `current`.
- `worldPerPixel(viewportHeightPx) -> number` —
  `2 · CAMERA_DISTANCE · tan(CAMERA_FOV_DEG / 2) / viewportHeightPx` at the z = 0 plane.
- `rectToWorld(rect, viewport) -> {x, y, width, height}` — a DOM rect to the z = 0 plane (centre-origin,
  y up).
- `ripTicksCrossed(prev, next) -> number` — whole `RIP_TICK_STEP` steps crossed going up.

### Stage API (`sidebox/native-deck-builder-pack3d.js`)
`export async function createPackStage({ host, packArtUrls, cardBackUrl }) -> PackStage | null`
— returns null (never throws) when WebGL context creation fails or a texture of `packArtUrls`
fails to load. Creates `canvas.bb-gl` in `host` (the `#bbUnboxing` root), `WebGLRenderer({ canvas,
alpha: true, antialias: true })`, `setPixelRatio(min(devicePixelRatio, PIXEL_RATIO_MAX))`,
`outputColorSpace = SRGBColorSpace`, `toneMapping = NeutralToneMapping`, `localClippingEnabled =
true`, `PerspectiveCamera(CAMERA_FOV_DEG)` at z = `CAMERA_DISTANCE`, scene environment from
`PMREMGenerator.fromScene(new RoomEnvironment())`, one `DirectionalLight(0xffffff, 1.2)` at
(−2, 3, 4). A `ResizeObserver` on `host` resizes the renderer and camera aspect.
```
PackStage = {
  showSpread({ anchors, focus, artIndexes, fromBoxRect }) -> Promise<void>
      // anchors: the .bb-bigpack elements (data-pack) in spread order; fromBoxRect set → play the
      // fly-out (packFlyPose3d, PACK_FLY_STAGGER_MS, 'unbox-unwrap' per pack); resolves on landing.
  beginTear({ packIndex, side }) -> void      // level the focus pack over GRAB_LEVEL_MS, pause sway
  setTearProgress(progress) -> void          // peel; plays 'unbox-rip-tick' per ripTicksCrossed
  springBack(fromProgress) -> Promise<void>  // peel eases to 0 over SPRING_BACK_MS (160)
  rip({ fromProgress, topCard }) -> Promise<void>
      // RIP_FINISH_MS to progress 1, strip flight, 14 silver flecks (DOM spawnParticles over the
      // canvas at the far end of the tear line), cards rise (face = topCard texture), pack drops.
      // topCard: { imageUrl|null, faceDown: boolean }. Resolves when the stack is at CARDS_TO_V.
  settleStackTo(rect) -> Promise<void>       // STACK_SETTLE_MS onto the DOM top card's rect
  clearCards() -> void                       // hand-off: stack hidden, render loop idles
  jumpToEnd() -> void                        // every running animation lands on its last frame
  dispose() -> void                          // geometries, textures, PMREM, renderer, forceContextLoss
}
```
- **Pack meshes** (one group per pack): front `PlaneGeometry(1, PACK_ASPECT, 40, 72)` displaced by
  `pillowZ`, `computeVertexNormals()`; back = the same grid with `−pillowZ`, rotated π about y.
  Front material `MeshPhysicalMaterial({ map: art, emissiveMap: art, emissive: 0xffffff,
  emissiveIntensity: 0.45, metalness: 0.35, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness:
  0.18, iridescence: 0.2, envMapIntensity: 0.9, alphaTest: 0.5, alphaMap: bodyMask })`. Back map =
  a canvas: the art drawn, then `source-in` filled with `linear-gradient(#d9dbe0, #9aa0aa, #d9dbe0)`
  (silver with the art's silhouette), same material numbers without emissive. A shadow quad
  (radial-gradient canvas, alpha 0.35, 1.1× size) sits at z = −0.2 behind each pack.
- **Masks**: `bodyMask` / `stripMask` = 512 × 936 canvases from `packTearLine`: body = white below
  the line, strip = white above it (alphaMap reads green; both are greyscale).
- **Strip**: `PlaneGeometry(1, STRIP_V · PACK_ASPECT, 40, 8)` at the pack's top, UVs mapped to
  v ∈ [0, STRIP_V] of the art, front + back like the body, `alphaMap: stripMask`. Each frame of a
  peel sets every vertex from its rest position through `peelVertex` with `peelAngleDeg(u, progress,
  side)` and `tearHingeV`, then `computeVertexNormals()`. At `rip` the peeled strip leaves the pack
  group (world transform kept) and plays `stripFlightPose`.
- **Card stack**: a `BoxGeometry(63/88 · cardH, cardH, 0.035)` with `cardH` = 0.62 · pack width /
  (63/88) (fits inside the body), card-back texture on every face; the +z face gets the top card's
  texture when `topCard.faceDown` is false and it loads within `CARD_TEXTURE_TIMEOUT_MS`, else the
  card back. Material `clippingPlanes` = one plane at the pack's mouth (`tearHingeV`), updated from
  the pack's world matrix each frame; removed once the stack's bottom clears the mouth.
- **Per frame (spread)**: each pack's home = `rectToWorld(anchor.getBoundingClientRect())` (anchors
  carry translate + scale only, so the rect is exact and CSS transitions are followed for free);
  pack scale from the rect width; z and rotateY from `packSpreadSlot3d`; brightness via
  `material.color.setScalar(slot.brightness)`; focus pack: `followTilt(tiltTarget(pointer))` +
  `swayPose`; side packs: `swayPose` only. Pointer = last `pointermove` on `host` (passive).
- **Clock**: one `requestAnimationFrame` loop, running while any pack is on screen or an animation
  plays; stopped in the pocket and summary views. Each animation = `{ start, durationMs, pose,
  apply, resolve }` sampled with `performance.now()`. `motionReduced()`: no loop; every animation
  applies its last frame and resolves at once; render on demand.
- **Context loss**: `webglcontextlost` → `preventDefault()`, `onLost()` callback (the scene disposes
  the stage and re-renders on the DOM path).

### Scene integration (`native-deck-builder-unboxing.js`)
- Mount: when `getUnboxing().stage !== 'done'` and `!fxDisabled()`, start
  `import('./native-deck-builder-pack3d.js').then(m => m.createPackStage(...))`; a failed import or
  a null stage → `stage = null`, log nothing, DOM path. `root.dataset.render` = `'3d'` while a stage
  exists, else `'dom'`.
- `renderSpread` / `renderBigPack` are unchanged; with a stage, CSS hides `.bb-pack__body`,
  `.bb-pack__strip` and the art in `.bb-bigpack` (anchors keep their size), keeps
  `.bb-pack__top` (transparent) and `.bb-cutline`. After `render()`, spread view → `stage.showSpread`.
- `playFly` with a stage: the DOM box fade stays; the flights are `stage.showSpread({ fromBoxRect })`.
- `bindTear` on the focus top gets 3D callbacks: pointerdown → `stage.beginTear({ packIndex, side:
  peelSide(x, rect) })`; `onProgress` → `stage.setTearProgress`; `onSpring` → `stage.springBack`;
  `onTear` → `beatTearPack`. Keyboard (click with `detail === 0`) → `beatTearPack(packIndex, 0)`.
- `beatTearPack` with a stage: `runBeat({type:'tearPack'}, 'unbox-tear', () => stage.rip({
  fromProgress, topCard }), { cut3d: packIndex })`. `topCard` = `packs[packIndex][0]`, `faceDown` =
  `isHiddenHit(packIndex, 0)`.
- Entrance `cut3d`: the pocket renders with `.bb-pocket.is-awaiting-3d` (`visibility: hidden`);
  measure `.bb-pcard.is-top`, `await holdWhile(stage.settleStackTo(rect))`, then in one
  `requestAnimationFrame`: remove the class, `stage.clearCards()`.
- `skipScene`, unmount, and a `generation` change mid-animation call `stage.jumpToEnd()`; unmount
  calls `stage.dispose()`. `withBackstop` expiry during a stage animation → `stage.jumpToEnd()`.

### Sound
`unbox-rip-tick`: noise, bandpass 2.4 kHz, 40 ms, gain 0.12 (one voice), played by the stage per
`ripTicksCrossed` while the finger peels. Existing `unbox-tear` plays at the beat, `unbox-unwrap` per
flying pack, as today.

### CSS (`css/deck-builder-unboxing.css`)
`.bb-gl { position: fixed; inset: 0; z-index: 2; pointer-events: none; }` (above `.bb-spread` z 1,
below the dock). `[data-render='3d'] .bb-bigpack .bb-pack__body, [data-render='3d'] .bb-bigpack
.bb-pack__strip { visibility: hidden; }`, `[data-render='3d'] .bb-bigpack .bb-pack__top { z-index: 3;
background: none; }`, `.bb-pocket.is-awaiting-3d { visibility: hidden; }`. No idle CSS loop is added
(the sway runs in WebGL and obeys `motionReduced()` / `fxDisabled()` in JS).

## Edge cases & failure modes — the completeness contract; Builder ticks every row
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | WebGL unavailable / context creation fails | `createPackStage` → null; `data-render='dom'`; the 052 scene runs unchanged | [ ] |
| 2 | `import()` of the stage or vendored three fails (404, offline) | DOM path, no console error spam, scene playable | [ ] |
| 3 | pack art texture fails to load | stage → null before first use (DOM path) | [ ] |
| 4 | top-card texture 404 / CORS blocked / slower than 1500 ms | stack shows the card back; hand-off unchanged | [ ] |
| 5 | `body.fx-off` / `fxDisabled()` | no stage created, no WebGL context | [ ] |
| 6 | `motionReduced()` | stage renders static packs; no rAF loop; rip/flight/settle land at once; sounds play | [ ] |
| 7 | drag released at 39 % / 40 %, press < 6 px, Enter/Space | spring back / rip / rip / rip (052 row 5 outcomes, via the unchanged `bindTear`) | [ ] |
| 8 | pointer drag starting on the right half | peel runs right → left (`peelSide` −1) | [ ] |
| 9 | second press while a rip plays (`busy`) | ignored, as today | [ ] |
| 10 | Skip scene mid-rip / mid-fly | `jumpToEnd`, scene ends, `dispose` releases the context; no late callback touches the DOM (`generation`) | [ ] |
| 11 | tab hidden mid-rip (rAF paused) | `withBackstop` fires, `jumpToEnd`, render proceeds | [ ] |
| 12 | `webglcontextlost` mid-spread | stage disposed, scene re-renders on the DOM path at the same state | [ ] |
| 13 | reload at spread / mid-pocket / summary | spread: 3D packs at rest; pocket/summary: DOM only, no stack in the canvas | [ ] |
| 14 | box mounted and unmounted 20 times (Box ↔ Pool tabs) | one context at a time; no "Too many active WebGL contexts" warning | [ ] |
| 15 | window resize / phone width 390 px mid-spread | renderer and camera resize; packs follow the anchors; no horizontal scroll | [ ] |
| 16 | hit card on top of a fresh pack (tier ≥ 2) | 3D stack shows the card back; DOM shows the face-down hit with its aura after hand-off (052 row 14 holds) | [ ] |
| 17 | pool integrity | the stage reads `packs`, never writes; `session.unboxing` changes only through `dispatch` | [ ] |
| 18 | `packTearLine` vs `packTearEdge` | same points for seeds 1, 18, 42, 999 × packs 0–3 | [ ] |
| 19 | vendored three drifts from the pinned package | `vendor-three.test.mjs` fails | [ ] |
| 20 | `pnpm lint` / `pnpm format` | skip `client/src/vendor/**` | [ ] |

## Test plan
Unit (`core/build-battle/__tests__/pack3d.test.mjs`): `pillowZ` is 0 in both seals and outside the
body columns, peaks at `BULGE` at the body centre, symmetric in u; `packTearLine` matches
`packTearEdge` (row 18); `peelAngleDeg` 0 at progress 0, `PEEL_MAX_DEG` everywhere at 1, monotonic in
progress, mirrored by `side`; `peelVertex` identity at 0°, hinge points fixed, 90° maps `(hingeY + d,
0)` to `(hingeY, ≥ d)`; `stripFlightPose` endpoints (t = 0 at origin, opacity 1; t = 1 opacity 0,
y below the start); `cardsEmergePose` endpoints; `packDropPose(0)` = 0; `packFlyPose3d` keeps every
`packFlyPose` field and spins −180 → 0; `packSpreadSlot3d` focus vs side; `followTilt` converges and
`dt ≤ 0` is identity; `worldPerPixel` × viewport height = visible height; `rectToWorld` of the
viewport-centred rect is centred; `ripTicksCrossed(0.05, 0.31)` = 3, `(0.3, 0.2)` = 0.
`scripts/__tests__/vendor-three.test.mjs`: package.json pins `three` to exactly `THREE_VERSION`;
the four vendored files equal `node_modules/three`'s bytes.
`mat-fx/__tests__/fx-audio*.test.mjs`: `voicesFor('unbox-rip-tick')` returns one noise voice.
Browser: `rec-unboxing.mjs` launches Chromium with `--use-angle=swiftshader --enable-unsafe-swiftshader`,
asserts `data-render='3d'` at the spread, drives drag-rips on seeds 42 and 18, checks the hand-off
(pocket visible, stack cleared) and the existing pool/reload checks, records `out/unboxing.webm`
and strips at: spread idle, peel 30 %, rip frame, strip mid-flight, cards rising, hand-off. A
second pass with `localStorage['ptcg-reduce-motion']` and one with WebGL disabled
(`--disable-webgl`) asserts rows 6 and 1. The user checks the look on localhost.

## Migration / rollout
No data change: `session.unboxing` is untouched. The DOM path stays the fallback, so a broken stage
degrades to today's scene. Revert path: revert the commits; drop `three` from devDependencies and
`client/src/vendor/three/`.

## Work plan — slices ≤1 session, each leaving the repo green
| Slice | Files (create / modify) | Signatures & data shapes | Test cases: input → expected | Rulings used (source) | Green when |
|---|---|---|---|---|---|
| 1 Vendor + pure | create `scripts/vendor-three.mjs`, `scripts/__tests__/vendor-three.test.mjs`, `client/src/vendor/three/*` (4 files, by running the script), `core/build-battle/pack3d.mjs`, `core/build-battle/__tests__/pack3d.test.mjs`, `.prettierignore`; modify `package.json` (`"three": "0.185.0"` devDependency), `pnpm-lock.yaml`, `eslint.config.mjs` (ignores), `client/index.ejs` (import map), `mat-fx/fx-audio.mjs` (+`unbox-rip-tick`) and its test | § Pure API verbatim; `THREE_VERSION = '0.185.0'` | § Test plan unit rows; rows 18–20 | none (no card text) | `node --test` on the new tests, `pnpm test:changed`, `npx eslint --quiet` on touched files |
| 2 Stage: packs, spread, fly, tilt (fx-designer) | create `sidebox/native-deck-builder-pack3d.js` (`createPackStage`, `showSpread`, `dispose`, `jumpToEnd`); modify `native-deck-builder-unboxing.js` (mount/import, `data-render`, spread + fly branch), `css/deck-builder-unboxing.css` (`.bb-gl`, `[data-render='3d']` rules) | § Stage API (spread subset), § Scene integration first four bullets | rows 1–3, 5, 6, 12–15 | — | lint clean; kill-switch CSS test green; spread renders 3D in the browser on seed 42 |
| 3 Rip + cards + hand-off (fx-designer) | modify `native-deck-builder-pack3d.js` (`beginTear`, `setTearProgress`, `springBack`, `rip`, `settleStackTo`, `clearCards`), `native-deck-builder-unboxing.js` (tear callbacks, `beatTearPack`, `cut3d` entrance, skip/backstop), CSS (`.is-awaiting-3d`) | § Stage API rest, § Scene integration remaining bullets, § Sound | rows 4, 7–11, 16, 17 | — | lint clean; manual rip on seeds 42 and 18 in the browser lands on the pocket |
| 4 Verify | modify `.claude/skills/fx-preview/rec/rec-unboxing.mjs`, `.claude/skills/fx-preview/SKILL.md` (WebGL flags, 3D checks) | § Test plan browser paragraph | rows 1, 6, 13, 14 by recorder | — | recorder PASS on seeds 42/18 + reduced-motion + no-WebGL passes; full `pnpm test`; user check on localhost |

## Deviations (Builder appends here during build)

---
Self-approval checklist (only when the user is unreachable):
- [ ] Every constraint traceable into the Design section
- [ ] Every edge-case row has an expected behavior (or a written strike reason)
- [ ] Interfaces fully named and typed — no hand-waving
- [ ] Slices each ≤1 session and independently green
- [ ] Every slice row is pinned: files, signatures, test cases with expected values, card rulings
      cited (corpus row / TCGdex id) — no banned words; a builder would make zero choices
- [ ] No section reads "TBD"
