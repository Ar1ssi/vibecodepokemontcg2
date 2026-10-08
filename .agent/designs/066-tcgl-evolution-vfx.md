# 066: TCG Live evolution and devolution VFX
Status: approved (user request 2026-10-08: "copy the evolution effects from tcg live") · building
Date: 2026-10-08 · Session: S-066 (worktree `feature/tcgl-evolution-fx`)

## Problem
Regular evolutions play design 041's Scarlet/Violet scene (3.5 s, canvas nebula + card flip).
Devolutions play a 1.15 s ring burst. The user wants the effects TCG Live plays instead,
extracted from the game, like the KO/draw/play scenes (042–044) and the SFX (064).

## Source extract (facts, read this session)
- Game code (decompiled, `E:\TCGLive_Extract\Code\TPCI.RainierClient`):
  - `FXManager.cs:150` maps `EvolutionType.Evolve` → prefab `cards_evolution/card_evolution`,
    `Devolve` → `cards_evolution/card_devolution`.
  - `CardOwnerVFXTriggerer.cs:133-162`: the evolve prefab spawns when the new card's move onto
    the slot ENDS (`MovementVFXTiming.MovementEnded` + `PlacementFlags.Evolve`), parented to the
    card, despawned after 8 s. Cards with a `PlayVFXForEvolution` status effect play a custom
    prefab instead (Tera uses `Card_Evolution_Tera`); we keep our Mega/Tera signature entries.
  - `EvolveOperation.cs`: sound `evolveCard` starts first; opponent evolving from hand first
    reveals the card (`evoOp_revealDuration`, default 1 s); damage/attachments transfer after
    `evoOp_evoFXduration` (default 1 s). Devolve: `CreateDevolveFXOnPreviousCard` spawns the
    devolve prefab on the card that stays in the slot.
  - Evolve sound is already imported: `sfx_rain_evolve_card.wav` → cue `evolve-card` (064).
- Unity bundle `cards_evolution` (+ deps in `_shared`), dumped with UnityPy:
  - `E:\TCGLive_Extract\vfx_dump\evolution\cards_evolution.json` — full hierarchy, every
    ParticleSystem module, renderer, material (textures, colors, floats).
  - `Card_Evolution.spec.md`, `Card_Devolution.spec.md` (+ Tera/Bench/mesh prefabs) — readable spec.
  - `textures/*.png` (47, incl. `_shared` deps), `meshes/*.obj` (16: helix whorls, spiral,
    light beam, hemisphere, flash fan, cylinder, oval ring).
  - Tools: `E:\TCGLive_Extract\tools\dump_vfx.py <cache> <out> cards_evolution`,
    `summarize.py <json> <prefab>`, `timeline.py <json> <prefab>` (run with
    `E:\TCGLive_Extract\tools\venv\Scripts\python.exe -I`).
  - Scale: the card in prefab space ≈ 10 × 13 units (`Square_Pop` size3D 10×13 is the card pop).

### Card_Evolution timeline (s; delay · life · count)
Charge 0–1.0: `intro flash` 0·0.3 card-size dissolve flash · `Square intro dissolve` 0·1.0 card
silhouette dissolving in (diamond swirl) · `Glow soft core` 0·1.26 radial glow, orange → cyan →
white · `Smokes` 0·0.8 wispy cloud · `Wispy rad glow` 0.1·1.15 ×2 · `Evolution Helix` 0.1·0.8–1.0
five prismatic helix whorl meshes + three `starry spiral` trails · `rays rad` 0.2·1.0 ×2 radial
streak discs, rainbow-cycling color · `Rays prismatic set/thin/big softy` 0.2–0.3·0.2–0.6 prismatic
light-beam meshes (rate bursts in the first ~16 % of the system) · `round debris lerp` 0.2·~0.4
14 star sparks converging.
Pop 0.95–1.0: `Square_Pop` 0.95·0.08 card-size white→cyan pop · `RefractionRing` 1.0·0.35
spectrum ring · `shockwave` 1.0·0.25 hemisphere · `sparks disc outro` 1.0·0.3 · `Rays` 1.0·0.5–0.7
light shafts · `Rays_2` 1.0·0.3 flash fan · `sparkles (1)` + `Spectrum_Motes` 1.0·0.4–1.0 ×22 each ·
`Square outro dissolve` 1.0·2.0 card glow dissolving away. Everything is done by ~3.0 s.

### Card_Devolution timeline
`aura mesh intro`/`aura mesh` 0·0.5–0.6 card aura flare · `devolution glow card` 0·0.4 ·
`Smokes` ×3 · `Glow soft core` 0·0.6 · four `starry spiral` oval-ring galaxy beams 0·0.65–0.7 ·
`sparks shoot clusters` 0.05 (15 + 30) · `sparks shoot` 0.2 ×30 · `Square_Pop` 0.35·0.08 ·
`Spectrum_Motes` 0.4 ×32 · `shards` 0.4 ×13 flakes · `outro dissolve` 0.4·0.7 ripple card dissolve.

## Constraints
- D103/D118/D119: WAAPI keyframes from pure pose fns; canvas layers read the WAAPI clock via
  `playCanvasStage` (`mat-fx/canvas-stage.js`) so stepped-clock capture drives every layer.
- Cosmetic only: board already applied; nothing gates input; self-removing `fx-overlay`
  layers + backstop timers; `body.fx-off .fx-overlay` hides it; fx-queue budget 2500 ms.
- Opp board is rotated 180° (`frameTurnOf`); card art layers turn with it.
- Mega/Tera evolutions keep `playSignatureEntry` (D118–D122) unchanged.
- Sound: unchanged — `evolve-scene` and `evolve` cues already map to `evolve-card` (sfx-cues.mjs).
- Never gate on prefers-reduced-motion beyond what the dispatcher already does (user memory).
- This replaces design 041's scene (D153): delete the SV scene code it supersedes, no dead code.

## Design
- Assets: the textures the two prefabs use, copied from the dump into
  `client/src/assets/fx/evolution/` (WebP or PNG, only the ones the build draws). Builder
  records the list and the conversion command in Deviations.
- `mat-fx/evolve-scene.mjs` (pure): TCG Live timeline as data (emitters with delay/life/count,
  size and color-over-life keys from the dump, in card-height units) + pose fns + seeded scene.
- `mat-fx/evolve-scene.js` (DOM): `playEvolveScene({rect, turn, ...})` draws the evolve prefab
  over the evolved card; new `playDevolveScene` (same module or `devolve-scene.*`) for devolve.
- `lifecycle.js`: `evolve` keeps the signature branch, else plays the TCG Live evolve;
  `devolve` plays the TCG Live devolve. Holds in `fx-holds.mjs` sized to the new timelines.
- Builder (fx-designer) owns rendering choices (canvas vs DOM/CSS, mesh approximations of
  helix/beam/hemisphere) and records them in Deviations.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | no rect for card | effect returns 0, nothing drawn | [x] lifecycle.js `evolve`/`devolve` return 0; `playScene` rejects a bad rect |
| 2 | texture fails to load | that layer skips; scene still completes and removes itself | [x] tcgl-canvas.js `textureOf` → null skips the op; the clock still ends |
| 3 | t outside [0,1] / NaN | poses clamp | [x] evolve-scene/devolve-scene/tcgl-fx tests (finite ops at −1, NaN, past the end) |
| 4 | two evolutions in one batch | each plays on its own card; paced by hold | [x] one overlay per plan; hold 1300 (fx-holds test) |
| 5 | opp-side card | layers turned 180° with the frame | [x] host `rotate(turn)` from `frameTurnOf`; capture opp-active |
| 6 | Mega/Tera evolution | signature entry unchanged | [x] lifecycle.js `evolve` signature branch untouched |
| 7 | fx off mid-scene | `body.fx-off .fx-overlay` hides every layer | [x] the host is an `.fx-overlay` (fx-kill-switch-css test) |
| 8 | no WAAPI / no 2D context | end frame applied; host removed by backstop | [x] `playCanvasStage` resolves at once; `removeWhen` + backstop (scene ms + 400) |

## Test plan
Unit tests for the pure timeline/pose module (ranges, ordering, determinism, clamp) and holds.
Visual: stepped-clock capture (`.agent/scratch/evolve/capture-evolve.mjs` method), self + opp +
bench, contact sheet + video; the user checks on localhost.

## Migration / rollout
n/a: client cosmetic only; revert = revert the commit (041 scene returns with it).

## Work plan
| Slice | Delivers | Green when |
|---|---|---|
| 1 | evolve: assets, pure timeline module, DOM driver, wiring, holds, tests | unit tests + lint green; capture frames show charge → pop → outro |
| 2 | devolve: same for Card_Devolution | same |

## Deviations (Builder appends here during build)
- Rendering: one Canvas 2D stage per card (`playCanvasStage`, 5 card heights square, rim fades
  from 72 % of its radius), every layer drawn additively ('lighter'); the overlay host is
  `mix-blend-mode: screen` so light only ever adds to the card and mat. Pure ops come from
  `evolve-scene.mjs` / `devolve-scene.mjs` (kinds: sprite, dissolve, polar, ribbon, frame,
  cutout); `tcgl-canvas.js` draws them; `tcgl-fx.mjs` holds the Unity maths (curves, gradients,
  rate births, 60 fps limit-velocity damping, dissolve, polar UVs). No WebGL.
- Scale: CARD_UNITS = 11 prefab units per card height, not 13. Card_Sharp's card silhouette
  (devolve glow card 12.79 × 0.934 × 0.922 = 11.0), the CardHighlightRing mesh (8.8 × 11) and the
  visible core of Square_Pop's rounded-blur texture (0.8 × 13 = 10.4) all agree on ~11; 7.9 × 11
  is the card's 0.716 aspect, so one isotropic unit (card height / 11) maps the prefab.
- Materials read as: the custom-curve value is the dissolve amount (texels darker than it are
  eaten: ≤ 0 shows all, ≥ 1 none), which makes `Square intro dissolve` (1 → −1) fill the card
  in and every outro (−0.25 → 0.82 etc.) eat it away. Radial shaders sample their texture in
  polar UVs (u = angle, v = radius) with the material's tiling and RadialPannerSpeed. Helix
  vertex colours (pure blue → red) are read as shader data, not tint. `sparkles (1)` and
  `Spectrum_Motes` reference no texture in the dump ([None]); they draw
  TEX_VFX_Star_Variants_SubUV_2x2_Blur (a 2×2 sheet matching their 2×2 flipbook).
- Back/front: the big glows (smokes, glow core, wisps, radial rays, big softy beams, sparkles)
  draw before a card-shaped cutout, so they glow around the card and never over its art; the
  card layers, helix, trails, beams, pop and outro draw after it.
- Meshes (`.agent/scratch/evolve/project.py` → `emit.py` → `emit-geometry.mjs`, data in
  `evolve-geometry.mjs`): each particle's size, ZXY start rotation and parent transforms are
  applied, then projected onto the card plane. Helix001/004–007 → ribbons (rails u = 0/1);
  Spiral3 ×3 → tube centreline + half-width ribbons with Debris_Glow star dots; Lightbeam002 →
  8 light-shaft blades; Oval_ring01 → ellipse bands (inner 0.785 of the rim). Approximated:
  SM_VFX_Evolution_Flash (`Rays_2`) as a 4-spoke prismatic flash; SM_VFX_Hemisphere_2
  (`shockwave`, squashed to z 0.001) as a flat Radial_Line_Circle disc; pCylinder1 (flat) as a
  polar spark disc; Card_Aura_Flare_More_Combo as flame bands on the card's four edges
  (`fillFrame`); the devolve `shards` flake mesh as the flake_glow02 sprite. Spin over
  lifetime turns the projected 2D rails (−spin: the projection mirrors). Perspective is dropped
  (our board is top-down), so TCG Live's camera-facing depth (BoxEdge particles flying at the
  camera) shows as a short outward drift.
- Shape scales: the dump wrote every shape `scale` as 0 (dump_vfx.py reads `m_Scale`, which
  this bundle stores). Read again from the bundle (`.agent/scratch/evolve/probe_shape.py`):
  evolve motes box 10 × 14, debris/sparks ring = highlight-ring mesh × (1.29, 0.76) turned 90°,
  devolve clusters box 10.2 × 7.4 turned 90°, shards box 6.39 × 7.74, devolve motes circle
  scaled 10.1 × 14.07.
- Taste (house rule 1 vs the TCG Live copy): TCG Live tone-maps HDR glows; a canvas clips at
  white, so the wide glows are scaled down (`LEVEL` in evolve-scene.mjs: glow core 0.4, wisps
  0.45, radial rays 0.8, refraction 0.51, shockwave 0.55, shafts 0.75, flash 0.6) to keep the
  card silhouette the brightest thing. At the pop (1.0–1.15 s) the light around the card is
  still near-white out to ~1.5 card heights: local, but the user should judge it. Light shafts
  taper toward hub and tip (LightRay_Prismatic has no fade along its length).
- Timing: evolve 3.0 s (charge 0–1.0, pop 0.95–1.0, outro to 3.0), hold `evolve-scene` 1300
  (TCG Live moves damage/attachments 1 s in; the next effect lands as the shafts fade). Devolve
  1.4 s (pop 0.35 s), hold `devolve` 700. Sound unchanged (`evolve-scene` → evolve-card cue).
- Removed (041 superseded): the SV scene code in evolve-scene.mjs/.js, its CSS
  (`.fx-evolve-scene*`, `.fx-evolve-burst*`, `.fx-devolve-burst`), `devolveBurstPose` /
  `DEVOLVE_BURST_MS`, and the pre-evolution snapshot in origins.mjs (only the 041 scene read it).
- Textures (31, client/src/assets/fx/evolution/*.webp, 2.2 MB PNG → 416 KB lossless WebP):
  every file's ALPHA carries the value the shader read (masks/noise: alpha = R or A, RGB white;
  additive colour textures: alpha = max(RGB), RGB = colour / alpha; Rays_Prismatic02,
  Prismatic_Vert, Prismatic_Blurry_Tile, Spectrum_Light kept as RGBA), downscaled to ≤ 256 px
  (Victory rays 256 × 512). Command:
  `E:\TCGLive_Extract\tools\venv\Scripts\python.exe -I .agent/scratch/evolve/convert_textures.py E:/TCGLive_Extract/vfx_dump/evolution/textures client/src/assets/fx/evolution`
  (the script's LIST names each texture, its mode and size). Loaded on idle (`requestIdleCallback`)
  and again on first play.
- Capture: `.agent/scratch/evolve/capture-evolve.mjs [evolve|devolve|both]` (stepped WAAPI
  clock, long backstop timers stubbed while stepping; `STEP_ONLY=1` skips the videos),
  `sheet_frames.py` contact sheets, `layers.mjs` per-layer debug sheets.
