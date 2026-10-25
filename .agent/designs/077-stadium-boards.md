# 077: Stadium boards — the table becomes the Stadium's place while it is in play
Status: draft
Date: 2026-10-25 · Session: S—

## Problem
TCG Live has full-board "Jumbotron" environments (Water → a beach with waves and foam, Fire → a lava
field, ...). The user wants the same idea keyed to Stadium cards: while a Homebrew (`customhb`) Stadium
is in play, the 3D table shows that Stadium's place (Surfing Beach → beach, Scorched Earth → scorched
lava ground). Today a Stadium only gets the generic `trainer-play` card presentation; the table never
changes.

## Constraints
- three.js is the only board, WebGL2 required (D220). The environment lives in the 3D scene.
- Board animations play one after another through the FX queue (`netcode/advisory-animations.js`);
  an animation's plan returns a hold that lasts until its scene ends (CLAUDE.md § Code standard).
- Board state is already applied when plans run; FX are cosmetic and never gate input
  (advisory-animations.js:291). The environment must converge to the real Stadium even when its plan
  is dropped (catch-up replay, hidden tab, FX off, restart).
- Reduced motion is opt-in only (`ptcg-reduce-motion`, D105); never read the OS flag (user memory).
- FX style: no whiteouts, no spinning sunburst rays, one palette through the payoff (user memory).
- TCG Live assets are allowed in this repo (D203 sounds, D207 evolution prefabs, D213 sleeves); big
  binaries go to R2, not git (D217). Budget here: ≤ 4 MB of committed WebP.
- The render loop is on demand (`board-scene.js:273-294`); a persistent animated layer must not
  keep the GPU at 60 fps for the whole match.
- Card readability beats spectacle: zones and cards must stay legible on every environment.

## Current state
Facts read this session.
- **TCG Live reference** (`E:\tcglive_extract`): `MatchBoardFXController` + `BoardFXSettings` drive
  one shared center board. Modes Persistent / OneShot / Dissolve / Pulse / ReducedPersistent. A new
  layer renders on top of the old one and the old one despawns after 1 s; the reveal is a mask that
  grows as a hex grid (`Mask_Grow` 3 s, water `M_VFX_Water_HexGrid_Mask_*`); exit is a 3 s
  dissolve through the type's `*_Mask_Dissolve` texture. Side is shown only by rotating the board
  0°/180° toward the owner. Type boards exist for 11 types but no live code feeds them a type
  (only debug controllers); Stadiums get only a 5 s one-shot (`board_stadium`). Composition per
  type: ground mesh + texture, 1–2 looping overlay layers, one-shot particles, border glow.
  Ground textures (2:1, Poké Ball at center), already exported as PNG under
  `E:\tcglive_extract\pokemon_Pokemon TCG Live\board_<type>\Texture2D\`:
  `board_water/T_VFX_Water_BeachSand_D.png` 2048×1024, `board_fire/T_Jumbotron_Fireboard_D.png`
  2048×1024 (+ `_BurnMask`), `board_lightning/T_VFX_Lightning_Background_D.png` 2048×1024 (+
  `ElectricCrack_2x4`), `board_grass/T_Grass_Base_D.png` 1024×512 (+ `Cloud_Shadows`,
  `Gusts_Mask`, `Leaves_2x2`). `board_metal` holds only a UV atlas plus tileables
  (`T_VFX_Metal_Hex_D.png` 512², `Sheen_Wipe`); `board_psychic` holds channel-packed
  `Galaxy_RGBA` + `Swirl`; `board_dark` is empty. Contact sheet: `.agent/scratch/stadium-env/tcgl-boards.png`.
- **Homebrew Stadiums** — `client/src/assets/custom-sets/customhb/set.json`, `trainerType === 'Stadium'`,
  17 cards: 030 Forest of Vitality, 051 Stormy Mountains, 052 Crystal Cave, 162 Steel Shelter,
  163 Full Metal Lab, 197 Mystery Garden, 198 Old Cemetery, 199 Dimension Valley, 209 Surfing Beach,
  212 Brooklet Hill, 239 Fighting Stadium, 240 Mountain Ring, 253 Perilous Jungle, 254 Dark City,
  278 Levincia, 289 Magma Basin, 299 Scorched Earth.
- **Stadium state**: one `state.stadium` card or null (`shared/engine/state.mjs:112`), sent as
  `view.stadium` (`shared/engine/view.mjs:203`). Engine cards carry `id`, `set`, `number`, `name`,
  `ownerId` (`shared/engine/cards.mjs:34-44`). Not every Stadium entry emits `cardMoved`
  (board/choice path `effects/trainer.mjs:160-169`), so events are not a reliable trigger; the view is.
- **3D board**: `board3d.js:415` `onViewApplied` builds the model with `board-model.mjs`
  `boardModelFrom`; `stadiumOf` (`board-model.mjs:378`) → `{instanceId, src, name, facing}`; the model
  diff exposes `stadiumChanged` (:565). `onViewApplied` runs after apply-view has handed every
  advisory event to the FX queue (`apply-view.js:2501` then `board-view-applied` at :2513), so a plan
  pushed there lands after the Stadium's `trainer-play`.
- **Table**: `table-mesh.js` `createTable` — floor, per-half `backing`/`ambient`/`art`/`overlay`
  meshes at `Z = { floor: -2, backing: 0, ambient: 0.25, art: 0.5, overlay: 1 }` (:15) inside the
  tilted table `group`; `overlay` is the mat's zone-outline SVG (only when the mat spec has one).
  `board-scene.js:197` creates it, `:407` `table.setLayout(next)`, `:414` `setMat`.
- **Render loop**: `board-scene.js:273` `render()` re-arms itself only while `pool`/`piles`/`overlays`
  `update(now)` or the FX layer report motion.
- **FX queue**: `advisory-animations.js:297` `createFxQueue({run: runPlan, ...})`; `runPlan` (:272)
  switches on `plan.kind`; skip rule `shouldAnimateMirror` (:378-392) clears the queue; other clears
  at :309 (FX off) and :313 (`game-restarted`). `fx-queue.mjs:106` `push`, :113 `clear`.
- **Settings**: `fx-settings.mjs` keys + `readSettings` (:45); `fx-settings.js` setters +
  `onFxSettingsChanged`; checkbox in `client/index.ejs` (~:474) wired in
  `initialization/document-event-listeners/sidebox/settings.js:107-113`; `mat-fx.mjs` accessors
  `motionReduced` (:22), `fxDisabled`.

## Options
**O1 · What triggers the environment**
- A: advisory events (`trainerPlayed {stadium:true}`, `cardMoved from stadium`). Matches other FX, but
  misses the board/choice entry path and reconnects.
- B: the applied view (`model.stadium` change in `onViewApplied`), animation queued from there.
  Covers every entry/exit path, reconnect and spectators by construction.
- **Pick B.** The view is truth; the queue only decides *when* the transition plays.

**O2 · Persistent or one-shot**
- A: one-shot takeover like TCG Live's Stadium (5 s, then back to the mat). Cheap, but not what was asked.
- B: persistent while the Stadium is in play, like TCG Live's type boards. The user's words: "the
  board changes to a beach".
- **Pick B.** Intro reveal, steady ambient loop, exit dissolve; replacement cross-reveals.

**O3 · Where the art comes from**
- A: the Stadium card's own illustration stretched over the table. Always on-theme, zero assets, but a
  ~600 px illustration blurs at board size and fights the cards for attention.
- B: fully procedural shaders per Stadium. No assets, resolution-free, but 17 bespoke shaders is weeks
  of taste iteration and won't match TCG Live's look.
- C: TCG Live's board textures (ground + overlay + dissolve masks), grouped into 7 kits, one shared
  shader, per-Stadium parameters (tint, intensities, particles). Matches the reference, data-driven,
  ~3 MB of WebP.
- **Pick C.** Same source the reference uses; adding a Stadium later is one table row.

**O4 · How much of the table it covers**
- A: whole table under the zone outlines (TCG Live covers its whole board).
- B: a band around the Stadium zone only. Readable but reads as a decal, not a place.
- **Pick A**, plus "zone wells": the shader darkens and desaturates inside every zone rect so empty
  zones stay visible on any mat, with or without an outline overlay.

**O5 · Rendering cost of the ambient loop**
- A: render every frame (60 fps) while a Stadium is in play. Simple; costs battery all match.
- B: ambient frames capped at 30 fps on a timer; intro/exit at full rate; no ambient frames when FX are
  off, reduced motion is on, or the tab is hidden.
- **Pick B.**

**O6 · Keeping the environment truthful when its plan is dropped**
- A: snap after a timeout. Fragile while long attack scenes are queued.
- B: the controller keeps `target` (from the view) apart from `shown`; a queued plan animates
  `shown → target` when it runs; every queue clear and every skipped push calls `settle()`, which
  snaps `shown = target`.
- **Pick B.**

**O7 · Which cards qualify**
- A: Homebrew Stadium ids only (`customhb-NNN`), as asked.
- B: match by name, so real prints of the same Stadium (Dimension Valley PHF, Mountain Ring PRC, …) also
  get it.
- **Pick A**, keyed by id. B is a later one-line change in `environmentKeyFor` if wanted.

**O8 · Audio**
- A: per-kit loop + outro like TCG Live's `jumbotronPersistent`. Loops for a whole match grate.
- B: no new audio; the Stadium's existing `trainer-play` sound covers the moment.
- **Pick B.** Ambience audio is an ISSUES line, not this design.

## Design
### Data — `client/src/setup/board3d/stadium-environments.mjs` (pure)
- `environmentKeyFor(card)`: `card.id` when it matches `/^customhb-\d{3}$/`; else, when
  `card.set === 'customhb'` and `card.number` parses to an integer, `customhb-` + the number padded to
  3 digits; else `null`. Null/undefined card → `null`.
- `KITS` — texture paths are relative to `client/src/assets/fx/stadium-env/`:

| Kit | ground | groundTiling | overlay (mode) | dissolve | particles sprite |
|---|---|---|---|---|---|
| beach | beach-sand.webp | [1,1] | foam.webp (`scroll`) | water-dissolve.webp | bubbles.webp |
| volcano | fireboard.webp | [1,1] | fire-burnmask.webp (`pulse`) | fire-dissolve.webp | ember.webp |
| storm | lightning-ground.webp | [1,1] | electric-crack-2x4.webp (`flipbook`) | lightning-dissolve.webp | mote.webp |
| plains | grass-base.webp | [1,1] | grass-cloud-shadows.webp (`scroll`) | grass-dissolve.webp | leaves-2x2.webp |
| metal | metal-hex.webp | [6,3] | metal-sheen.webp (`scroll`) | metal-dissolve.webp | mote.webp |
| void | (none: `baseColor`) | — | psychic-galaxy.webp (`colorize`) + psychic-swirl.webp (`swirl`) | colorless-dissolve.webp | mote.webp |
| arena | lightning-ground.webp | [1,1] | fighting-decal.webp (`decal`) | stadium-dissolve.webp | — |

- `STADIUM_ENVIRONMENTS` — keyed by card id. `tint` multiplies the ground; `overlayColor` colors the
  overlay; `overlayStrength` 0–1; `saturation` 0–2 (1 = unchanged); `particles: {count, color} | null`.

| id | Stadium | kit | tint | overlayColor | overlayStrength | saturation | particles |
|---|---|---|---|---|---|---|---|
| customhb-030 | Forest of Vitality | plains | #b8e07a | #1d3a12 | 0.55 | 1.2 | {48, #d8ffa0} |
| customhb-051 | Stormy Mountains | storm | #8fa0c8 | #bfe0ff | 0.8 | 0.9 | {24, #d0e8ff} |
| customhb-052 | Crystal Cave | metal | #9fe3ff | #e6b8ff | 0.6 | 1.1 | {64, #e6f8ff} |
| customhb-162 | Steel Shelter | metal | #c9d2dc | #ffffff | 0.5 | 0.6 | null |
| customhb-163 | Full Metal Lab | metal | #e8ecf2 | #6ad4ff | 0.7 | 0.8 | null |
| customhb-197 | Mystery Garden | plains | #c79be0 | #2a1238 | 0.5 | 1.1 | {40, #ffb8f0} |
| customhb-198 | Old Cemetery | void | #1b1424 | #6b4e8f | 0.45 | 0.7 | {32, #b8a0d8} |
| customhb-199 | Dimension Valley | void | #120a1e | #b05cff | 0.9 | 1.3 | {48, #e0b8ff} |
| customhb-209 | Surfing Beach | beach | #ffffff | #ffffff | 0.85 | 1.0 | {24, #c8f0ff} |
| customhb-212 | Brooklet Hill | beach | #c8e6b0 | #e0fff0 | 0.5 | 1.0 | {16, #c8f0ff} |
| customhb-239 | Fighting Stadium | arena | #d9a46b | #ffffff | 1.0 | 0.9 | null |
| customhb-240 | Mountain Ring | arena | #a89c8c | #ffffff | 0.8 | 0.5 | null |
| customhb-253 | Perilous Jungle | plains | #5f8a3a | #0e1a08 | 0.7 | 1.1 | {40, #b04cff} |
| customhb-254 | Dark City | void | #0c0a12 | #3a2f5a | 0.35 | 0.6 | {20, #8a78c0} |
| customhb-278 | Levincia | storm | #ffe27a | #ffd400 | 1.0 | 1.2 | {32, #fff2a0} |
| customhb-289 | Magma Basin | volcano | #ffffff | #ff5a1a | 1.0 | 1.1 | {64, #ffb060} |
| customhb-299 | Scorched Earth | volcano | #9a8478 | #ff7a30 | 0.35 | 0.6 | {28, #ffa060} |

  For `void`, `tint` is `baseColor`. Values are first-pass taste; the user tunes on localhost.
- `environmentFor(card)` → `{ key, kit, ...row, textures }` (textures = the kit row with full URLs)
  or `null` when the key is null or unknown.

### Timeline — `client/src/setup/board3d/stadium-environment-timeline.mjs` (pure)
Constants: `INTRO_MS = 1600`, `EXIT_MS = 900`, `AMBIENT_FPS = 30`.
`createEnvironmentTimeline()` returns a state object with methods (all take `now` ms):
- `setTarget(spec | null)` — records the target; returns `true` when it differs from `target` by `key`
  (and `facing`).
- `play(now)` — starts the transition `shown → target` and returns its hold:
  `INTRO_MS` when entering or swapping, `EXIT_MS` when leaving, `0` when `shown` already equals
  `target`. A swap keeps the outgoing layer at full strength under the incoming reveal and drops it at
  the end (TCG Live's overlap).
- `settle()` — ends any transition and sets `shown = target`.
- `frame(now)` → `{ layers: [{ spec, reveal: 0..1, exit: 0..1 }], animating: boolean }`. `reveal` uses
  ease-out-cubic over `INTRO_MS`; `exit` uses ease-in-quad over `EXIT_MS`; after a transition ends,
  `layers` holds only the shown spec at `reveal 1, exit 0`.
- `current()` → `{ shown, target }` keys, for tests and the debug log.

### Mesh — `client/src/setup/board3d/stadium-environment-mesh.js`
`createStadiumEnvironment({ three, textures, parent, clock, motionReduced, fxDisabled, onNeedsRender })`
→ `{ setLayout(layout), setTarget(spec|null), play(): number, settle(), update(now): boolean, dispose() }`.
- Adds one `three.Group` named `board3d-stadium-env` to `parent` (the table `group`) at `z = 0.75`
  (new `Z.environment` in `table-mesh.js`: above `art`, below the zone `overlay`).
- Per layer: one `PlaneGeometry` covering `tableBounds(layout)` (`table-uv.mjs`) — the whole table —
  with a `ShaderMaterial` from `stadium-environment-shader.mjs`; `transparent`, `depthWrite: false`.
  A swap shows two layers; otherwise one.
- Ground UVs cover-fit the 2:1 texture to the table bounds, centered. When the target `facing` is
  `'opp'` the UVs rotate 180° so the scene faces the Stadium's owner.
- Zone wells: `setLayout` collects every zone rect of both halves from the layout (active, 5 bench,
  deck, discard, prizes, stadium) into a `vec4[24]` uniform in table UV space.
- Particles: one `three.Points` per layer, `count` from the row (max 64), positions seeded once,
  motion computed in the vertex shader from `uTime` (drift upward + sway); additive blending; none
  when the row has `particles: null` or motion is reduced.
- Textures load through the scene's texture cache (`textures.acquire/release`, as `table-mesh.js`
  does); a layer shows only after its ground (or, for `void`, its overlay) has loaded.
- `update(now)`: copies `timeline.frame(now)` into uniforms; returns `true` while a transition runs.
  While a layer is steady, ambient animation requests one frame every `1000 / AMBIENT_FPS` ms via
  `setTimeout(onNeedsRender)` — not when `fxDisabled()` or `motionReduced()` (static frame, `uTime`
  frozen) or `document.hidden`.
- `play()`: `fxDisabled()` or `motionReduced()` → `settle()` and return `0`; else `timeline.play(now)`
  and `onNeedsRender()`.

### Shader — `client/src/setup/board3d/stadium-environment-shader.mjs` (pure strings + uniform builder)
`environmentUniforms(three, spec)` and GLSL `VERTEX`/`FRAGMENT`. Fragment, in order:
1. Ground: `texture(uGround, uv * uTiling) * uTint`, saturation mix toward luma by `uSaturation`;
   `void` uses `uBaseColor`.
2. Overlay by `uOverlayMode`: `scroll` — sample at `uv + uTime * vec2(0.012, 0.006)`, add
   `uOverlayColor * value * uOverlayStrength`; `pulse` — mask × `(0.6 + 0.4 sin(uTime * 1.6))`,
   added as emissive; `flipbook` — 2×4 frames, one flash every 2.6 s lasting 0.25 s; `colorize` —
   galaxy R/G/B channels weighted into `uOverlayColor` shades; `swirl` — second overlay rotated by
   `uTime * 0.05` around the center; `decal` — texture centered at the table center, 0.45 of table
   height, alpha-blended.
3. Zone wells: inside any zone rect (6 px soft edge) multiply by 0.62 and desaturate 40 %.
4. Steady dim: multiply by 0.85.
5. Reveal: hex grid, cell 48 table px; a cell shows when the distance from its center to `uOrigin`
   (the Stadium zone center) is below `uReveal * maxDistance`; the 1-cell band at the front adds
   `uOverlayColor * 0.6` (border glow, the kit's own color — no white flash).
6. Exit: alpha = `smoothstep(uExit - 0.08, uExit, texture(uDissolve, uv).r)`; the dissolve edge glows
   `uOverlayColor * 0.5`.

### Wiring
- `board-model.mjs` `stadiumOf` adds `cardId` (`stadium.id || ''`), `set` (`stadium.set || ''`) and
  `number` (`stadium.number || ''`) to its result.
- `board-scene.js`: creates the environment with `parent: table.group` next to `createTable` (:197);
  calls `environment.setLayout(next)` beside `table.setLayout(next)` (:407); adds
  `environment.update(now)` to `render()`'s `animating` (:279); disposes it with the scene. New scene
  methods `setStadiumEnvironment(spec|null)`, `playStadiumEnvironment(): number`,
  `settleStadiumEnvironment()`.
- `board3d.js` `onViewApplied` (:415): after `applyModel`, when `!readSettings(localStorage).stadiumBoardsOff`,
  `spec = environmentFor(model.stadium && { id: model.stadium.cardId, set: model.stadium.set, number: model.stadium.number })`
  with `facing` copied from `model.stadium.facing`; else `spec = null`. If
  `scene.setStadiumEnvironment(spec)` returns true, call
  `modules.queueBoardEnvironment({ play: scene.playStadiumEnvironment, settle: scene.settleStadiumEnvironment })`.
  The settings listener re-runs this when `stadiumBoardsOff` flips.
- `advisory-animations.js`:
  - `export function queueBoardEnvironment({ play, settle })` — when `shouldAnimateMirror(...)` is false
    or `fxDisabled()`: call `settle()` and return; else `fxQueue.push({ kind: 'board-environment', play, settle })`.
  - `runPlan`: `if (plan.kind === 'board-environment') return plan.play();`
  - Replace the three `fxQueue.clear()` calls (:309, :313, :390) with `clearFxQueue()`, which clears
    and then calls `settle()` of every queued-but-unrun `board-environment` plan (kept in a `Set`,
    removed when run).
  - Add `queueBoardEnvironment` to the module list `board3d.js:16-63` loads.
- Settings: `STADIUM_BOARDS_OFF_KEY = 'ptcg-stadium-boards-off'` in `fx-settings.mjs`,
  `stadiumBoardsOff: readKey(...) === '1'` in `readSettings`; setter `setStadiumBoardsOff` in
  `fx-settings.js`; checkbox "Stadium boards" in `client/index.ejs` next to the hover-preview toggle;
  wiring in `sidebox/settings.js` like `HOVER_PREVIEW_OFF_KEY`.

### Assets — `scripts/import-tcgl-board-env.py`
Reads the PNGs from `E:\tcglive_extract\pokemon_Pokemon TCG Live` (path as first argument), writes
WebP to `client/src/assets/fx/stadium-env/`: grounds at 2048×1024 q82, everything else at its source
size capped to 1024 px q85, masks as lossless greyscale. Mapping (source → target):
`board_water/T_VFX_Water_BeachSand_D` → beach-sand · `T_VFX_Water_Foam_RGB` → foam ·
`T_VFX_Water_Bubbles_Blue` → bubbles · `T_VFX_Water_Mask_Dissolve` → water-dissolve ·
`board_fire/T_Jumbotron_Fireboard_D` → fireboard · `_BurnMask` → fire-burnmask ·
`T_VFX_Fire_Mask_Dissolve` → fire-dissolve · `board_lightning/T_VFX_Lightning_Background_D` →
lightning-ground · `T_VFX_Lightning_Board_ElectricCrack_2x4` → electric-crack-2x4 ·
`T_VFX_Lightning_Mask_Dissolve` → lightning-dissolve · `board_grass/T_Grass_Base_D` → grass-base ·
`T_Grass_Cloud_Shadows` → grass-cloud-shadows · `T_VFX_Grass_Leaves_2x2` → leaves-2x2 ·
`T_VFX_Grass_Mask_Dissolve` → grass-dissolve · `board_metal/T_VFX_Metal_Hex_D` → metal-hex ·
`T_VFX_Metal_Sheen_Wipe` → metal-sheen · `T_VFX_Metal_Mask_Dissolve` → metal-dissolve ·
`board_psychic/T_VFX_Psychic_Galaxy_RGBA` → psychic-galaxy · `T_VFX_Psychic_Swirl` → psychic-swirl ·
`board_colorless/T_VFX_Colorless_Mask_Dissolve` → colorless-dissolve ·
`board_colorless/T_VFX_Colorless_Glow_Dot_Hires` → mote · `board_fire/T_VFX_Fire_Gradient_Radial_Spots_Dense` → ember ·
`board_fighting/T_VFX_Fighting_Impact_Decal_Rock_D` → fighting-decal ·
`board_stadium/T_VFX_Stadium_Mask_Dissolve` → stadium-dissolve. Prints the total size and exits 1
above 4 MB. The WebPs are committed (user-approved D203/D213 precedent).

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | No Stadium in play / `view.stadium` null | No environment; player's mat shows | [ ] |
| 2 | Stadium without a homebrew key (any real print, missing id/set) | `environmentFor` → null; no environment | [ ] |
| 3 | `card.id` absent but `set: 'customhb', number: '9'` | key `customhb-009` | [ ] |
| 4 | Homebrew Stadium replaces another homebrew Stadium | One swap: incoming reveals over outgoing in 1600 ms, outgoing dropped | [ ] |
| 5 | Homebrew Stadium replaced by a non-homebrew Stadium, or discarded | Exit dissolve 900 ms, mat returns | [ ] |
| 6 | Two Stadium changes before the first plan runs | Plan plays `shown → latest target` once; second plan's `play` returns 0 | [ ] |
| 7 | Catch-up replay / hidden tab / reconnect | No plan; `settle()` snaps to the view's Stadium | [ ] |
| 8 | FX turned off mid-transition, or `game-restarted` | `clearFxQueue` settles every pending environment plan; shown = target | [ ] |
| 9 | FX off or reduced motion when a Stadium is played | `play()` settles, returns 0; static frame, no particles, no ambient frames | [ ] |
| 10 | "Stadium boards" toggled off with one in play | Environment removed at once (spec null + settle); on again → snaps in | [ ] |
| 11 | Opponent plays the Stadium | Scene rotated 180° toward them (facing 'opp') | [ ] |
| 12 | Texture fails to load / 404 | Layer stays hidden, console warn once per URL; board keeps the mat; no throw | [ ] |
| 13 | Layout change (resize, mat change) while shown | `setLayout` re-fits planes and zone wells; transition continues | [ ] |
| 14 | Spectator view | Same as players; facing from `ownerId` vs near player | [ ] |
| 15 | Tab hidden while steady | No ambient timer frames; resumes on visible | [ ] |
| 16 | Board disposed mid-transition (leave room) | `dispose` clears ambient timer, releases textures; no frame after dispose | [ ] |
| 17 | Partial failure midway | Struck: no multi-step persistent state; the view re-derives everything | — |

## Test plan
- Unit (`node --test`): `stadium-environments.test.mjs` (keying, all 17 rows resolve, every texture
  path exists on disk, unknown → null), `stadium-environment-timeline.test.mjs` (fake clock: holds,
  easing endpoints, swap layers, settle, repeat targets), `advisory-animations` queue test for
  `queueBoardEnvironment` + `clearFxQueue` settle, `fx-settings.test.mjs` new key, `board-model` test
  for `cardId/set/number` on `stadiumOf`.
- Mesh/shader: visual — exempt from tests (CLAUDE.md). One node test that `createStadiumEnvironment`
  with the vendored three builds, updates and disposes without throwing (pattern: card-mesh-flight.test).
- Manual (user, localhost): play Surfing Beach, then Scorched Earth on top, then discard it; flip the
  toggle; check readability on two mats.

## Migration / rollout
n/a for data: client-only, no schema or netcode change. Rollout: on by default behind the "Stadium
boards" toggle. Revert: unset the toggle per user, or revert the feature commits (assets are a separate
folder).

## Work plan — slices ≤1 session, each leaving the repo green
| Slice | Files (create / modify) | Signatures & data shapes | Test cases: input → expected | Rulings used (source) | Green when |
|---|---|---|---|---|---|
| 1 Assets + data | create `scripts/import-tcgl-board-env.py`, `client/src/assets/fx/stadium-env/*.webp` (24 files), `client/src/setup/board3d/stadium-environments.mjs` + `__tests__/stadium-environments.test.mjs` | `environmentKeyFor(card): string|null`, `KITS`, `STADIUM_ENVIRONMENTS`, `environmentFor(card): spec|null` per § Data | `{id:'customhb-209'}` → kit beach; `{set:'customhb',number:'9'}` → key `customhb-009`; `{id:'sv1-1'}` → null; `null` → null; each of the 17 ids from set.json filtered on `trainerType==='Stadium'` → non-null; every kit texture file exists; total `stadium-env` size ≤ 4 MB | Stadium list: `customhb/set.json` rows 030…299 | `node --test` on the new test; script prints ≤ 4 MB |
| 2 Timeline | create `stadium-environment-timeline.mjs` + test | § Timeline | enter at t=0: `play` → 1600, `frame(800).layers[0].reveal` = 1−(0.5)^3 = 0.875; leave: `play` → 900; swap A→B: `frame(10).layers` = [A{reveal 1}, B{reveal<1}], `frame(1700).layers` = [B]; `setTarget(same)` → false, `play` → 0; `settle()` mid-intro → `frame().layers` = [target at reveal 1], animating false | — | test green |
| 3 Mesh + shader | create `stadium-environment-shader.mjs`, `stadium-environment-mesh.js` + smoke test; modify `table-mesh.js` (`Z.environment = 0.75`), `board-scene.js` (create, setLayout, render, dispose, 3 scene methods) | § Mesh, § Shader | smoke: create with vendored three + fake textures, `setLayout(flatLayout fixture)`, `setTarget(spec beach)`, `play()` → 1600, `update(100)` → true, `dispose()` no throw; `fxDisabled:()=>true` → `play()` = 0 | — | smoke + existing board-scene tests green |
| 4 Wiring + toggle | modify `board-model.mjs` (`stadiumOf`), `board3d.js`, `advisory-animations.js`, `fx-settings.mjs`, `fx-settings.js`, `client/index.ejs`, `sidebox/settings.js`; tests in `board-model`, `fx-settings`, new `__tests__/board-environment-queue.test.mjs` | § Wiring | `stadiumOf({instanceId:1,id:'customhb-209',set:'customhb',number:'209'})` has those fields; `readSettings({getItem:k=>k==='ptcg-stadium-boards-off'?'1':null}).stadiumBoardsOff` = true; queue: push while skipping → `settle` called, `play` not; push then `clearFxQueue()` → `settle` called once | — | `pnpm test:changed` green; lint clean |
| 5 Tune (fx-designer) | `stadium-environments.mjs` rows, shader constants | values only | user localhost check per Stadium | — | user signs off |

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
