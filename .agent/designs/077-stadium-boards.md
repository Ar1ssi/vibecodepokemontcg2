# 077: Stadium boards — the table becomes the Stadium's place while it is in play
Status: draft, revision 2 (procedural art; Scorched Earth prototype on localhost)
Date: 2026-10-25 · Session: S—

## Problem
TCG Live has full-board "Jumbotron" environments (Water → a beach, Fire → a lava field, ...). The
user wants the same idea keyed to Stadium cards: while a Homebrew (`customhb`) Stadium is in play,
the 3D table becomes that Stadium's place (Scorched Earth → a lava river through dark rock, Surfing
Beach → a beach). Today a Stadium only gets the generic `trainer-play` card presentation; the table
never changes.

## Constraints
- three.js is the only board, WebGL2 required (D220). The environment lives in the 3D scene. GLSL
  ES 3.00 reserved words (`flat`, `half`, `smooth`, ...) cannot be identifiers.
- Procedural art only: no TCG Live textures or meshes (user, 2026-10-25). TCG Live's `board_fire`
  is the style reference: sculpted, painted, stylised, cartoon-like as Pokémon should be. Not
  photoreal (user feedback on prototype v1).
- Board animations play one after another through the FX queue (`netcode/advisory-animations.js`);
  an animation's plan returns a hold that lasts until its scene ends (CLAUDE.md § Code standard).
- Board state is already applied when plans run; FX are cosmetic and never gate input
  (advisory-animations.js:291). The environment must converge to the real Stadium even when its plan
  is dropped (catch-up replay, hidden tab, FX off, restart).
- Reduced motion is opt-in only (`ptcg-reduce-motion`, D105); never read the OS flag (user memory).
- FX style: no whiteouts, no spinning sunburst rays, one palette through the payoff (user memory).
- The render loop is on demand (`board-scene.js:273-294`); a persistent animated layer must not
  keep the GPU at 60 fps for the whole match.
- Card readability beats spectacle: every place the board draws a card keeps flat ground below the
  cloth plane (z = 0), and no rock or liquid ever covers a card.
- The board pass has no bloom (bloom exists only in `fx/fx-layer.js` for attack FX), so every glow
  is painted in the shaders.

## Current state
Facts read this session.
- **TCG Live reference** (`E:\tcglive_extract`): `MatchBoardFXController` + `BoardFXSettings` drive
  one shared center board: a new layer renders over the old one, which despawns after 1 s; the reveal
  is a growing mask (3 s); exit is a 3 s dissolve. Type boards exist for 11 types but no live code
  feeds them a type; Stadiums get only a 5 s one-shot (`board_stadium`). Their fire board is one
  painted 2048×1024 texture with a normal map: rounded slate stones, thin light crack lines,
  saturated red lava glowing in the gaps. Contact sheet: `.agent/scratch/stadium-env/tcgl-boards.png`.
- **Homebrew Stadiums** — `client/src/assets/custom-sets/customhb/set.json`, `trainerType === 'Stadium'`,
  17 cards: 030 Forest of Vitality, 051 Stormy Mountains, 052 Crystal Cave, 162 Steel Shelter,
  163 Full Metal Lab, 197 Mystery Garden, 198 Old Cemetery, 199 Dimension Valley, 209 Surfing Beach,
  212 Brooklet Hill, 239 Fighting Stadium, 240 Mountain Ring, 253 Perilous Jungle, 254 Dark City,
  278 Levincia, 289 Magma Basin, 299 Scorched Earth. Each card's art is
  `client/src/assets/custom-sets/customhb/<nnn>/high.webp`.
- **Stadium state**: one `state.stadium` card or null (`shared/engine/state.mjs:112`), sent as
  `view.stadium` (`shared/engine/view.mjs:203`). Engine cards carry `id`, `set`, `number`, `name`,
  `ownerId` (`shared/engine/cards.mjs:34-44`). Not every Stadium entry emits `cardMoved`
  (board/choice path `effects/trainer.mjs:160-169`), so events are not a reliable trigger; the view is.
- **3D board**: `board3d.js:415` `onViewApplied` builds the model with `board-model.mjs`
  `boardModelFrom`; `stadiumOf` (`board-model.mjs:378`) → `{instanceId, src, name, facing}`; the model
  diff exposes `stadiumChanged` (:565). `onViewApplied` runs after apply-view has handed every
  advisory event to the FX queue (`apply-view.js:2501` then `board-view-applied` at :2513), so a plan
  pushed there lands after the Stadium's `trainer-play`.
- **Table**: `board-scene.js:193-198` puts `table.group` in `tableFrame` (the table frame of
  `board-layout.mjs`, tilted by the camera). `table-mesh.js` draws a floor at z −2 and per half
  `backing`/`ambient`/`art`/`overlay` at `Z = { backing: 0, ambient: 0.25, art: 0.5, overlay: 1 }`
  (:15), all `MeshStandardMaterial`/`MeshBasicMaterial`, lit by one shadow-casting directional light
  from the far left. Cards rest at z ≥ 0 (`card-poses.mjs:219`); zone pick planes at z 0.3
  (`board-scene.js:44`).
- **Render loop**: `board-scene.js:273` `render()` re-arms itself only while `pool`/`piles`/`overlays`
  `update(now)` or the FX layer report motion. Renders straight to the canvas (Neutral tone mapping,
  sRGB out); no scene target.
- **FX queue**: `advisory-animations.js:297` `createFxQueue({run: runPlan, ...})`; `runPlan` (:272)
  switches on `plan.kind`; skip rule `shouldAnimateMirror` (:378-392) clears the queue; other clears
  at :309 (FX off) and :313 (`game-restarted`). `fx-queue.mjs:106` `push`, :113 `clear`.
- **Settings**: `fx-settings.mjs` keys + `readSettings` (:45); `fx-settings.js` setters +
  `onFxSettingsChanged`; checkbox in `client/index.ejs` (~:474) wired in
  `initialization/document-event-listeners/sidebox/settings.js:107-113`; `mat-fx.mjs` accessors
  `motionReduced` (:22), `fxDisabled`.
- **Prototype** (branch `feature/077-stadium-boards`), drawn under the real board at
  `/?stadiumEnv=scorched-earth` (the preview page is gone):
  - `stadium-environment-shader.mjs` — Scorched Earth GLSL: two bakes (ground field, light), a
    displaced terrain grid that paints the lava of its cracks and side streams, a lava sheet for the
    river, embers, crater smoke, the mat cutout.
  - `stadium-environment-mesh.js` (`createStadiumEnvironment`), wired in `board-scene.js` and
    `board3d.js`; `table-mesh.js` cuts the mat, zone outlines and labels where it shows.
  - `stadium-environment-layout.mjs` + test — `environmentKeyFor`, `environmentOverride`,
    `environmentFootprints` (from the board's own card poses), `volcanoSpot`.
  - Measured on an RX 7900 XTX at 1920×1080: 60 fps through the intro. The first bake takes ~0.6 s on
    the CPU side, mostly shader compilation.

## Options
**O1 · What triggers the environment**
- A: advisory events (`trainerPlayed {stadium:true}`, `cardMoved from stadium`). Matches other FX, but
  misses the board/choice entry path and reconnects.
- B: the applied view (`model.stadium` change in `onViewApplied`), animation queued from there.
  Covers every entry/exit path, reconnect and spectators by construction.
- **Pick B.** The view is truth; the queue only decides *when* the transition plays.

**O2 · Persistent or one-shot**
- A: one-shot takeover like TCG Live's Stadium (5 s, then back to the mat). Cheap, but not what was asked.
- B: persistent while the Stadium is in play, like TCG Live's type boards.
- **Pick B.** Intro reveal, steady ambient loop, exit dissolve; replacement cross-reveals.

**O3 · Where the art comes from**
- A: the Stadium card's illustration stretched over the table. Blurs at board size, fights the cards.
- B: procedural three.js scenes per Stadium. No assets, resolution-free, real 3D.
- C: TCG Live's board textures. Ruled out by the user.
- **Pick B** (user's choice). Each Stadium's place follows its own card art, drawn in TCG Live's
  painted style.

**O4 · Relief**
- A: one flat plane with a painted, normal-mapped look (TCG Live's own approach).
- B: real relief: a baked height field displaces a dense grid; liquids are sheets below the cloth.
- **Pick B.** The user asked for height where no cards lie ("this is a three.js board, you can do so
  much better"). Consequence: rivers and gaps sit below the cloth, so the mat must be cut out
  wherever the environment shows (O6).

**O5 · Card places**
- A: zone wells (darken the ground inside each zone).
- B: every card place stands on a flat plate (slot outline glowing in the place's accent colour);
  Trainer-board rows stand on a shelf without outline, styled by the place (Scorched Earth: basalt
  flagstones with glowing joints).
- **Pick B.** Cards never sit on rock or liquid, and empty zones stay readable.

**O6 · Hiding the mat where the environment shows**
- A: hide the table group once revealed and draw a copy of the mat during transitions. Duplicates
  table-mesh's mat fit (one/two-player, flip, scale, overlays).
- B: the table's materials discard their fragments by the environment's own reveal/exit mask
  (`onBeforeCompile` injection, shared uniforms).
- C: a depth-punch pass and render-order juggling between table, environment and cards.
- **Pick B.** One mask function on both sides; table fit logic untouched.

**O7 · Frame cost**
- A: shade everything per frame (prototype). Two Voronoi lookups per terrain fragment: too heavy for
  integrated GPUs at 30 fps.
- B: bake all static shading (ramp light, rims, cracks, plates, occlusion) into a colour target once
  per layout; per frame the terrain reads one texture and adds the animated lava light. Ambient
  frames capped at 30 fps; none when FX are off, reduced motion is on, or the tab is hidden.
- **Pick B.**

**O8 · Keeping the environment truthful when its plan is dropped**
- A: snap after a timeout. Fragile while long attack scenes are queued.
- B: the controller keeps `target` (from the view) apart from `shown`; a queued plan animates
  `shown → target` when it runs; every queue clear and every skipped push calls `settle()`, which
  snaps `shown = target`.
- **Pick B.**

**O9 · How Stadiums share code**
- A: one uber-shader with per-Stadium parameters.
- B: a shared engine (bake, terrain, liquid sheet, particles, mask, timeline) plus one recipe module
  per family of places; a family covers several Stadiums by parameters.
- **Pick B.** The places differ in kind (lava river, surf, forest floor, metal deck), not in numbers.

**O10 · Which cards qualify** — A: Homebrew ids only, as asked. B: by name (real prints too).
**Pick A**; B is a later one-line change in `environmentKeyFor`.

**O11 · Audio** — no new audio; the Stadium's `trainer-play` sound covers the moment. Ambience is an
ISSUES line, not this design.

## Design
### Registry — `stadium-environment-layout.mjs` (pure, exists)
- `environmentKeyFor(card)`: the environment key for `card.id`, else for `customhb-` + `card.number`
  padded to 3 digits when `card.set === 'customhb'`; else `null`. One map, `ENVIRONMENT_BY_CARD`,
  card id → key; each recipe slice adds its rows.
- `environmentOverride(storage, search)`: `?stadiumEnv=<key>` or `localStorage['ptcg-stadium-env']`
  forces an environment on (dev check on the real board); unknown keys → null.
- `environmentFootprints(layout)` → `{ slabs, flats }`: a plate under the Active, each Bench slot, the
  Prize block, deck, discard, Lost Zone and Stadium of both sides; a shelf under each Trainer-board row.

### Engine — `stadium-environment-glsl.mjs` (pure strings and constants)
Shared GLSL chunks the recipes compose: `NOISE` (hash, gradient noise, fbm, Voronoi), `FOOTPRINTS`
(`uZones[24]`, `slotDistance`, `rowDistance`, `footprintDistance`), `REVEAL` (`revealReach`,
`revealBurned`, `exitKeep`; origin = the Stadium zone centre), `ENVIRONMENT_MASK` (`environmentShown(p)`
= `revealBurned(p) * exitKeep(p)`), `FULLSCREEN_VERTEX`, `BAKE_LIGHT_FRAGMENT` (normals, occlusion,
soft sun shadow), `TERRAIN_VERTEX` (displacement, rise during the reveal), `OUTPUT` (three's tone
mapping + colour space chunks). Constants: `MAX_ZONES = 24`, `BAKE_TEXELS_PER_PX = 1.6`,
`BAKE_MAX_TEXELS = 4096`, `TERRAIN_SPACING_PX = 2.5`.

### Recipes — `stadium-env-<family>.mjs`
Each exports one object per environment key:
`{ key, bakeField, bakeShade, terrainFragment, liquid: { level, fragment } | null,
particles: { count, vertex, fragment } | null, accent: [r, g, b] }`.
- `bakeField` writes R height px, G signed px from the place's main feature (river bank, shoreline),
  B the liquid table (the level its cracks and side channels fill to), A stone id, −1 off stones,
  2 on a landmark (the volcano).
- `bakeShade` writes the static colour (linear, pre-tone-mapping) from the field and light bakes.
- `terrainFragment` reads the shade bake and adds the animated light (lava glow, caustics, ...).
- Families and their Stadiums (each place follows its card art):

| Family | Stadiums | Place |
|---|---|---|
| volcanic | 299 Scorched Earth, 289 Magma Basin | Lava river along the seam / a lava basin in the middle; sculpted slate stones; basalt shelves |
| coast | 209 Surfing Beach, 212 Brooklet Hill | Sand and surf rolling in from one end / grassy banks and a brook along the seam with stepping stones |
| forest | 030 Forest of Vitality, 197 Mystery Garden, 253 Perilous Jungle | Mossy floor, roots and flowers / garden paths and hedges / dark jungle floor with poison pools |
| highland | 051 Stormy Mountains, 240 Mountain Ring, 239 Fighting Stadium | Wet crags with rain / a rocky ring on a peak / an arena floor |
| crystal | 052 Crystal Cave | Cave floor with glowing crystal clusters where no card lies |
| metal | 162 Steel Shelter, 163 Full Metal Lab | Riveted steel plates / lab deck panels with light strips |
| spirit | 198 Old Cemetery, 199 Dimension Valley, 254 Dark City | Misty graveyard ground / floating rock over a purple void / a night street with neon puddles |
| electric | 278 Levincia | A city plaza with glowing power lines |

- Scorched Earth (built in the prototype): the land has its own plateaus, ridges and hollows; stones
  in three sizes (96–150 / 60 / 27 px cells: a flat top and five broad facets on a rounded shoulder)
  stand up to ~34 px proud of it, no card places marked; every gap between the big and mid stones holds
  lava a little above bare ground, so the cracks glow at the surface. A volcano by the river's head
  (gullied cone, crater pool, smoke) sends three straight streams down its flanks: the middle one
  into the river, the others on to the near and far edges, run level so they stay straight under the
  tilted camera. The river winds along the seam, half-width 70 ± 11 px, a lava sheet at z −10 with
  banded colour, flow lines, crust rafts and bubbles; 220 embers. Slate palette sits ~0.04 above the
  target greys because Neutral tone mapping removes that much from dark colours.

### Mesh — `stadium-environment-mesh.js`
`createStadiumEnvironment({ three, renderer, parent, clock, motionReduced, fxDisabled, onNeedsRender })`
→ `{ setLayout(layout), setTarget(spec|null), play(): number, settle(), update(now): boolean,
maskUniforms, dispose() }`.
- One `three.Group` `board3d-stadium-env` in `parent` (the table group).
- Per layer (two during a swap): field target (HalfFloat, linear filter), light target (RGBA8,
  mipmapped), shade target (RGBA8 linear, mipmapped), all `round(min(4096, bounds.w * 1.6))` wide.
  Baked on `setLayout`/`setTarget` when the key of `[bounds, zones, recipe key]` changes; a resize
  rebakes after 150 ms without further resizes.
- Terrain: `PlaneGeometry` over `tableBounds(layout)` with `round(w / 2.5)` × `round(h / 2.5)`
  segments; liquid sheet and particles when the recipe has them.
- Programs compile with `renderer.compileAsync` when a recipe is first targeted; the reveal starts
  once they are ready (the plan's hold stays `INTRO_MS`; a late reveal only runs past it).
- `update(now)`: copies `timeline.frame(now)` into uniforms; returns `true` while a transition runs.
  While steady, requests one frame every `1000 / AMBIENT_FPS` ms via `setTimeout(onNeedsRender)` —
  not when `fxDisabled()` or `motionReduced()` (static frame, time frozen) or `document.hidden`.
- `play()`: `fxDisabled()` or `motionReduced()` → `settle()` and return `0`; else `timeline.play(now)`
  and `onNeedsRender()`.
- WebGL context restored → rebake.

### Mat cutout — `table-mesh.js`
`table.setCutout(cutout | null)`; `cutout = { uniforms, mask }` from the environment
(`maskUniforms`, `ENVIRONMENT_MASK`).
- Floor, backing, ambient, art and overlay materials get an `onBeforeCompile` that adds
  `uniform mat4 uTableFromWorld`, the mask uniforms and `varying vec2 vTablePos`
  (`(uTableFromWorld * modelMatrix * vec4(transformed, 1.0)).xy`), and starts the fragment `main`
  with `if (uCutoutOn > 0.5 && environmentShown(vTablePos) >= 0.5) discard;` (the floor only inside
  the table bounds). `customProgramCacheKey` → `'stadium-env-cutout'`.
- `board-scene.js` sets `uTableFromWorld` to the inverse of `table.group.matrixWorld` before each
  render; `uCutoutOn` is 1 while any environment layer exists.

### Timeline — `stadium-environment-timeline.mjs` (pure)
Constants: `INTRO_MS = 1600`, `EXIT_MS = 900`, `AMBIENT_FPS = 30`.
`createEnvironmentTimeline()` returns a state object with methods (all take `now` ms):
- `setTarget(spec | null)` — records the target; returns `true` when it differs from `target` by `key`.
- `play(now)` — starts the transition `shown → target` and returns its hold: `INTRO_MS` when entering
  or swapping, `EXIT_MS` when leaving, `0` when `shown` already equals `target`. A swap keeps the
  outgoing layer under the incoming reveal and drops it at the end (TCG Live's overlap).
- `settle()` — ends any transition and sets `shown = target`.
- `frame(now)` → `{ layers: [{ spec, reveal: 0..1, exit: 0..1 }], animating: boolean }`. `reveal` uses
  ease-out-cubic over `INTRO_MS`; `exit` uses ease-in-quad over `EXIT_MS`; after a transition ends,
  `layers` holds only the shown spec at `reveal 1, exit 0`.
- `current()` → `{ shown, target }` keys, for tests and the debug log.

### Wiring
- `board-model.mjs` `stadiumOf` adds `cardId` (`stadium.id || ''`), `set` (`stadium.set || ''`) and
  `number` (`stadium.number || ''`) to its result.
- `board-scene.js`: creates the environment with `parent: table.group` after `createTable` (:197);
  calls `environment.setLayout(next)` beside `table.setLayout(next)` (:407); adds
  `environment.update(now)` to `render()`'s `animating` (:280); `table.setCutout(...)`; disposes it
  with the scene. New scene methods `setStadiumEnvironment(spec|null)`, `playStadiumEnvironment(): number`,
  `settleStadiumEnvironment()`.
- `board3d.js` `onViewApplied` (:415): after `applyModel`, unless `readSettings(localStorage).stadiumBoardsOff`,
  `key = environmentOverride(localStorage, location.search) ?? environmentKeyFor({ id: stadium.cardId,
  set: stadium.set, number: stadium.number })`; `spec = key && { key }`, else null. If `scene.setStadiumEnvironment(spec)` returns true, call
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
- `?stadiumEnv=scorched-earth` (or `localStorage['ptcg-stadium-env']`) forces an environment for
  review; the preview page it replaced is already deleted.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | No Stadium in play / `view.stadium` null | No environment; the player's mat shows | [ ] |
| 2 | Stadium without a homebrew key (real print, missing id/set) | No environment | [x] layout test |
| 3 | `card.id` absent but `set: 'customhb', number: '299'` | key `scorched-earth` | [x] layout test |
| 4 | Homebrew Stadium replaces another homebrew Stadium | One swap: incoming reveals over outgoing in 1600 ms, outgoing dropped | [ ] |
| 5 | Homebrew Stadium replaced by a non-homebrew Stadium, or discarded | Exit dissolve 900 ms, mat returns | [ ] |
| 6 | Two Stadium changes before the first plan runs | Plan plays `shown → latest target` once; second plan's `play` returns 0 | [ ] |
| 7 | Catch-up replay / hidden tab / reconnect | No plan; `settle()` snaps to the view's Stadium | [ ] |
| 8 | FX turned off mid-transition, or `game-restarted` | `clearFxQueue` settles every pending environment plan; shown = target | [ ] |
| 9 | FX off or reduced motion when a Stadium is played | `play()` settles, returns 0; static frame, no particles, no ambient frames | [ ] |
| 10 | "Stadium boards" toggled off with one in play | Environment removed at once (spec null + settle), cutout off; on again → snaps in | [ ] |
| 11 | Opponent plays the Stadium | Reveal starts from the Stadium zone; the place is laid out for the camera (tall rock along the far edge), not turned toward the owner | [ ] |
| 12 | Shader compile fails | Console warn once per recipe; no environment; cutout off; mat shows; no throw | [ ] |
| 13 | Layout change (resize, mat change) while shown | Rebake after 150 ms idle; transition continues on the old bake meanwhile | [ ] |
| 14 | Spectator view | Same as players | [ ] |
| 15 | Tab hidden while steady | No ambient timer frames; resumes on visible | [ ] |
| 16 | Board disposed mid-transition (leave room) | `dispose` clears the ambient timer and render targets; no frame after dispose | [ ] |
| 17 | WebGL context lost and restored | Targets rebaked on restore; until then the mat shows | [ ] |
| 18 | More than 24 footprints (a future Bench of 8) | Footprints past 24 are dropped with one warn; those cards still lie at z 0 above the ground's base | [ ] |
| 19 | Partial failure midway | Struck: no multi-step persistent state; the view re-derives everything | — |

## Test plan
- Unit (`node --test`): layout registry (exists), `stadium-environment-timeline.test.mjs` (fake clock:
  holds, easing endpoints, swap layers, settle, repeat targets), `advisory-animations` queue test for
  `queueBoardEnvironment` + `clearFxQueue` settle, `fx-settings.test.mjs` new key, `board-model` test
  for `cardId/set/number` on `stadiumOf`, a GLSL test that no shader string declares a GLSL ES 3.00
  reserved word as an identifier.
- Mesh/shader/table cutout: visual, exempt from tests (CLAUDE.md). One node test that
  `createStadiumEnvironment` with the vendored three and a stub renderer builds, updates and disposes
  without throwing (pattern: card-mesh-flight.test).
- Manual (user, localhost): each recipe on the real board via `?stadiumEnv=<key>`, then by playing the
  card; swap two Stadiums; discard; flip the toggle; check readability with every zone filled.

## Migration / rollout
n/a for data: client-only, no schema or netcode change. Rollout: on by default behind the "Stadium
boards" toggle. Revert: unset the toggle per user, or revert the feature commits.

## Work plan — slices ≤1 session, each leaving the repo green
| Slice | Files (create / modify) | Signatures & data shapes | Test cases: input → expected | Rulings used (source) | Green when |
|---|---|---|---|---|---|
| 1 Engine split | create `stadium-environment-glsl.mjs`, `stadium-env-volcanic.mjs` (from the prototype shader, plus `bakeShade`), test `__tests__/stadium-environment-glsl.test.mjs`; delete `stadium-environment-shader.mjs` | § Engine, § Recipes | every exported shader string contains `void main`; no identifier in `flat half smooth noperspective sample patch` declared; `volcanic['scorched-earth'].liquid.level` = −10 | — | test green; real board renders as before (user check) |
| 2 Timeline | create `stadium-environment-timeline.mjs` + test | § Timeline | enter at t=0: `play` → 1600, `frame(800).layers[0].reveal` = 1−(0.5)^3 = 0.875; leave: `play` → 900; swap A→B: `frame(10).layers` = [A{reveal 1}, B{reveal<1}], `frame(1700).layers` = [B]; `setTarget(same)` → false, `play` → 0; `settle()` mid-intro → `frame().layers` = [target at reveal 1], animating false | — | test green |
| 3 Mesh + cutout | create `stadium-environment-mesh.js` + smoke test; modify `table-mesh.js` (`setCutout`), `board-scene.js` (create, setLayout, render, cutout matrix, dispose, 3 scene methods) | § Mesh, § Mat cutout | smoke: create with vendored three + stub renderer, `setLayout(flatLayout fixture)`, `setTarget({key:'scorched-earth'})`, `play()` → 1600, `update(100)` → true, `dispose()` no throw; `fxDisabled:()=>true` → `play()` = 0 | — | smoke + existing board-scene and table-mesh tests green |
| 4 Wiring + toggle | modify `board-model.mjs` (`stadiumOf`), `board3d.js`, `advisory-animations.js`, `fx-settings.mjs`, `fx-settings.js`, `client/index.ejs`, `sidebox/settings.js`; tests in `board-model`, `fx-settings`, new `__tests__/board-environment-queue.test.mjs` | § Wiring | `stadiumOf({instanceId:1,id:'customhb-299',set:'customhb',number:'299'})` has those fields; `readSettings({getItem:k=>k==='ptcg-stadium-boards-off'?'1':null}).stadiumBoardsOff` = true; queue: push while skipping → `settle` called, `play` not; push then `clearFxQueue()` → `settle` called once | — | `pnpm test:changed` green; lint clean; Scorched Earth on the real board (user check) |
| 5a–5h Recipes (fx-designer) | one `stadium-env-<family>.mjs` per family + its `ENVIRONMENT_BY_CARD` rows | § Recipes | registry test: each new id → its key | — | user signs off each place on localhost |

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
