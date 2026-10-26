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
| volcanic | 299 Scorched Earth, 289 Magma Basin | Lava river along the seam / a rock island in a moat of molten gold, cliffs pouring lavafalls |
| coast | 209 Surfing Beach, 212 Brooklet Hill | Sand and surf rolling in from one end / grassy banks and a brook along the seam with stepping stones |
| forest | 030 Forest of Vitality, 197 Mystery Garden, 253 Perilous Jungle | Mossy floor, roots and flowers / garden paths and hedges / a jungle clearing ringed by trees, poison bogs in two corners |
| highland | 051 Stormy Mountains, 240 Mountain Ring, 239 Fighting Stadium | A crater high in a storm / a paved ring of roped menhirs among rock spires / a wrestling ring in a laser-lit arena |
| crystal | 052 Crystal Cave | Cave floor with glowing crystal clusters where no card lies |
| metal | 162 Steel Shelter, 163 Full Metal Lab | A white hall on a mirror-bright hex floor / a steel dais among tanks and pipes |
| spirit | 198 Old Cemetery, 199 Dimension Valley, 254 Dark City | Misty graveyard ground / floating rock over a purple void / a night rooftop among lit towers |
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
- Stormy Mountains (built in the prototype, `stadium-env-highland.mjs`): a round mountain centred on
  the table with the crater in its middle (`craterBowl`: the floor is the smallest circle round the
  table's centre holding every Active and Bench card + 14 px, the wall climbs 90 px to the rim, the
  outer slope falls 170 px to the foot). The Bench rows sit ~42 px from the near and far edges, so
  the circle runs past them: this board's scene covers the table widened by `SCENE_MARGINS`
  (0.17 of the width each side, 0.2 / 0.34 of the depth near / far, what both camera presets see
  at 1366-2560 px windows) and the whole rim closes round the arena. Rock cut into ~92 px flat faces
  with rounded gullies, a cragged crest, the lesser peak on the left rim and the summit on the
  right (`mountainPeaks`, clear of every card footprint), snow on the summits, a cyan glow round
  silhouettes seen edge-on; a low sea of cyan cloud domes round the slopes; the Poke Ball emblem
  glows on the floor (`craterEmblem`); lightning falls on the summits from over the crater or arcs
  between clouds in a table corner, lighting rock and cloud. The card's far peak is left out: past
  the far edge it leans off the top of the screen.
- Perilous Jungle (built in the prototype, `stadium-env-forest.mjs`; landmarks in
  `stadium-env-forest-layout.mjs`): after the card art (TEF 156). The cards lie in a clearing of
  violet earth, teal moss and grass tufts (the footprints merged and grown by 96 px, the edge
  wandering up to 30 px further, cut off 4 px past the table's near and far edges); undergrowth
  rises round it in bushes under instanced cel-shaded leaves (one bent strip each, a lit and a
  shaded half, a dark outline); a core box (the cards' bounding box shrunk by 96 px) keeps the
  gaps between cards clearing. Tall trees (violet trunks, cel-shaded teal or violet crowns, beaded
  vines) stand outside the cards' columns either side. Two pink poison bogs, each a soft union of up
  to three lobes with a grassy island in its middle, lie in opposite corners away from the seam (far
  end left of the cards, near end right; each player gets one at the front right), so the layout
  shares nothing with Scorched Earth's volcano-and-river. Drooping bell flowers arch over the
  water, pink flower spikes stand on the islands and banks; marbled currents, shore lines, ripple
  rings, bubbles and spores move on the poison. Same scene margins as Stormy Mountains.
- Six more, built on branch `feature/077-six-stadiums`, each in its own module with the Stormy
  Mountains scene margins, each after its card art (set.json row, print named), its palette
  checked against pixel samples of the art:
  - Magma Basin (`stadium-env-magma.mjs`, BRS 144): every card on an island of charcoal basalt, a
    pebbly grain of small faceted lumps over broad swells, ember glints and no cracks (the art has
    none), its shore wandering out in broad bulges so it reads as a blob, its lip catching an orange
    rim of the lava's light; it runs on 140 px past the near cards (`NEAR_REACH_PX`), so the hand
    row lies over rock, not lava. A moat of molten lava (pale gold down its middle, orange to its
    banks, a thin red-orange lip and a dark crust at the shores, its width swelling and pinching)
    rings it; the art's chunky angular cliffs rise round it (big flat faces cut apart by dark seams,
    maroon-brown faces, red-lit tops, glowing orange at their feet), the art's four thin lavafalls (a
    pale gold core in an orange halo, one forked) pouring down the far wall only (falls on the side
    walls, tried three times, run across the screen in both presets and read as rays); the Poke
    Ball set in the island as a relief of two domed brick-red cushions inside a crisp deep carved
    outline, its band cut deep and its button ring wide enough to show either side of the Actives;
    sparks off the moat and the splashes. Two-pass bake. Every colour is the art's sample inverted
    through Neutral tone mapping (its toe strips the smallest channel from dark colours, which
    over-saturated them).
  - Steel Shelter (`stadium-env-shelter.mjs`, PHF 105): a white hall; the art's near-white floor in
    big hex tiles parted by crisp dark hairline seams, a per-pixel mirror of the walls and the
    ceiling's big hex lights (hairline pale frames) strongest toward the walls, the walls'
    reflections streaking the floor's margins as in the art's low view (the mirror shows the walls
    but not their cyan strips), short black hatched strips across the hall's four corners (the
    slanted sides of a great hexagon), the Poke Ball hologram as the art's glowing doubled cyan
    outline, band and button rings, a near-white core in a soft blue bloom; walls of white blocks
    with a louvred band across their middle and hatches low, a dark baseboard, shimmering cyan
    strips near the top, leaning out round the hall, the building's pale panelled roof past them,
    long skylights in it glowing with the hall's light; in the middle of each side wall (the far
    wall's middle lies under the opponent's hand) the art's gate: a chunky white frame round a
    trapezoid opening, each corner flaring into an arm ribbed with dark slats, a grey two-leaf door
    with vent slits and hexagon clusters.
  - Full Metal Lab (`stadium-env-lab.mjs`, TEF 148): a two-tone dais (a deep glossy navy disc lit
    blue toward its middle under the lens, a darker band of reflection across it, a soft radial
    glow behind the Poke Ball's crisp white lines, the lens's scan pulse; a band of pale steel
    plates) holds the Actives, Benches, Stadium and Trainer rows; docking pads of pale steel plate
    (so the cards' blue backs keep their edges) hold the Prize cards and piles, the joins wide enough
    that the railing runs round them smoothly, the margins wide enough that it stands clear of the
    cards; thick safety-yellow railings, a blue-teal stair with steel nosings at the near right,
    black cables on the band; on the pale ice-blue deck below, the art's row of three pale grey
    cabinets (two desks with screens in pale bezels on their sloped tops, a taller upright one with
    a big screen on its face to the dais; the row steps out past any docking pad), its big bulbous
    tanks with collared necks and hanging cables between them; every big pipe chrome (dark navy
    below a sharp horizon in its reflection, a hard white stripe along its crown, thin white clamp
    rings): pipe runs round the dais along its tangent, ring pipes, and the art's cage, fifteen
    thick (radius 40) elbow pipes on every side that start clear of the dais's rim, rise at the
    deck's edge and turn out level high over it (pipe arches read as horseshoes from above, pipes
    rising out of view as barrels, the gooseneck lamp as a hook, dark collars as ribbed ducts, thin
    upright pipe clusters as rolling pins).
  - Dark City (`stadium-env-city.mjs`, UNM 193): a moonlit concrete rooftop in broad faint slabs with
    a parapet, its left low wall washed in the art's red-magenta and a dull red glow on the roof
    beside it, the art's stairwell hut at the near right (low and pale; on its face to the cards,
    the face both presets see, a maroon door under a bright lamp, two dark windows, a red light at
    its far end; the lamp's cold light spread on the roof before it); slate towers with big
    windows, most of them dark (one in five lit, pale yellow-green, a few switching on and off), each
    roof plain tar with a parapet, tank and red-lit mast; the art's two ads, each twice (on the
    tower's face to the roof, its width up the face so the tilted preset reads it upright, and as an
    upright sign on the tower's roof for the top-down preset): big white and grey checks with black
    print under Team Skull's red angry face, and dark navy-violet with a pale sky band, a white
    crescent logo and big lettering under a pink X; the far tower's band of glowing yellow-green
    slanted panels; the art's round tower (one column of floors with pale ledges and lit window
    bands, a lantern of white-lit glass under a dark dome) beside the roof's left side halfway
    back; between the buildings the art's near-black blue-violet night under a drifting
    purple-grey haze; six searchlights on tower roofs, never across the cards: an X over each side
    band from the tallest towers and a fan over the far skyline (the tilted preset sees almost no
    sky, the towers' tops leaning out of its view, so they show in the top-down preset).
  - Mountain Ring (`stadium-env-ring.mjs`, FFI 97): worn grey-brown cobbles in straight staggered rows
    right up to the emblem, corners rounded, lengths and tones varied, thin joints, broad grime
    pools, the edge wandering and fraying into the sand (no drawn circle); the art's emblem, a pale
    stone disc in a dark groove with a dark ring round its centre and a shallower band carved
    across; the art's pale grey menhirs round it (189,182,170, dark streaks down some faces), rough
    chiselled columns tapering to blunt rounded tops (`stoneGirth`), squat in the side bands and tall
    off the ends, a band of four rope coils above and two below, thick dark brown strands sagging
    between; the art's massive rusty chain hanging off a stone on the left and lying along the
    paving's edge toward the far end, every link clear of every card; past them rough sandy ground
    with low pale boulders, tall dark crags on the sides and past the far edge, everything sinking
    into sepia haze with distance; cloud shadows and mist drift.
  - Fighting Stadium (`stadium-env-arena.mjs`, FFI 90): a wrestling ring (canvas the art's pale
    cyan-white, a navy band at its edge, a deep blue skirt showing from above; blue corner posts,
    three white ropes a side) on a broad square glowing white stage edged in big round lamps; the lighting rig, a pale steel truss round over the ropes (its height
    carries it out past them in both presets) with round bulbs in small halos; the art's glowing
    strip of tall LED ad boards round the floor, every panel one bold logo (the big red and white
    Poke Ball on white, a chunky wordmark on blue, orange-red or teal-green); dark teal tiers of a quiet crowd broken by
    aisles, the back rows fading into the dark, washed by the art's big yellow and pink spotlights;
    over each side stand the art's lattice of white light, two X's of straight white shafts with a
    flare at each crossing;
    lights flaring into starbursts high in the four corners, 16 long thin lasers in the art's
    yellow-green, magenta, cyan, green and white criss-crossing from them over the side and far
    stands, never over the ring. (The art's entrance ramp is left out: from above it read as a plank.)

### Mesh — `stadium-environment-mesh.js`
`createStadiumEnvironment({ three, renderer, parent, clock, motionReduced, fxDisabled, onNeedsRender })`
→ `{ setLayout(layout), setTarget(spec|null), play(): number, settle(), update(now): boolean,
maskUniforms, dispose() }`.
- One `three.Group` `board3d-stadium-env` in `parent` (the table group).
- Per layer (two during a swap): field target (HalfFloat, linear filter), light target (RGBA8,
  mipmapped), shade target (RGBA8 linear, mipmapped), all `round(min(4096, bounds.w * 1.6))` wide.
  Baked on `setLayout`/`setTarget` when the key of `[bounds, zones, recipe key]` changes; a resize
  rebakes after 150 ms without further resizes.
- Terrain: `PlaneGeometry` over `sceneBounds(layout, key)` (the table, or the table widened by
  the key's `SCENE_MARGINS`) with `round(w / 2.5)` × `round(h / 2.5)` segments; liquid sheet and
  particles when the recipe has them. Bakes hold at most `BAKE_MAX_TEXEL_AREA` (5 M) texels, fewer
  than 1.6 per px on a wide scene; a recipe may bake a first pass (`bakePre`, read as `uPre`) so
  its field shader stays small enough to compile quickly.
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
  the scene's rect). `customProgramCacheKey` → `'stadium-env-cutout'`.
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
- Prototype (Stormy Mountains): a board's scene may run past the table (`sceneBounds`); the
  environment then covers the table's dark floor there too. Why: a round crater holding both
  Bench rows can't close inside the table, and the user asked for a circular mountain.
- Prototype: shader compile, not the bake's GPU time, is the cost of first showing a board under
  ANGLE D3D11 (measured: Scorched Earth ~2.2 s stall, Stormy Mountains ~1.4 s after splitting its
  bake in two, 5.2 s before). Built on `feature/077-six-stadiums`: the board's meshes are built,
  then `compileAsync` compiles its bake passes (a render target bound) and meshes (camera on the
  env layer, canvas bound, so the cache keys match the draw: three keys programs by light count,
  render target and geometry attributes); the mat shows until they're ready, at most
  `PREPARE_TIMEOUT_MS` (8 s; a lost context never reports a link, so it skips compileAsync and dispose
  stops waiting after that long). The table carries the
  cutout from the start (`uCutoutOn` gates it) so a board never recompiles the table. Worst frame
  on first show: 42-135 ms on every board (was 0.5-2.5 s); load compiles the table ~0.25 s longer.
- Prototype: the mesh builds each board from its own builder (`BOARDS[key](kit)` → `{ objects,
  materials, bakePre?, bakeField, bakeLight?, spots(layout), apply(spots, bounds), tick?(seconds) }`),
  not the § Recipes object: Stormy Mountains needs a cloud sheet, lightning meshes and a two-pass
  bake that object has no slots for. Revise § Recipes and slice 1 to this shape before approval.
- Prototype (six more boards): boards made of shapes (railings, tanks, menhirs, ropes, towers, the
  ring) build them with `stadium-env-props.mjs` (`createPropBuilder`: tubes, cylinders, boxes,
  quads into one geometry, one draw call; `propFragment` lights them with the board's own light),
  and the kit hands every builder `terrainGrid`, `replaceGeometry` and `bakeOptions`. `POKE_BALL` and `FLOW_STREAKS` moved into the shared GLSL;
  `arenaRects` (every Active and Bench card) into the layout module.
- Prototype (six more boards): a board's colours are the card art's pixel samples (median and
  percentiles of a region) inverted through three's Neutral tone mapping before they go in a shader:
  its toe subtracts nearly all of the smallest channel from a dark colour, so a sampled dark written
  straight in renders far more saturated than the print (Magma Basin's crimson walls came out
  orange-red). The inverse is a per-channel fixed-point search on the forward curve.
- Prototype (six more boards): every prop must also read from straight above (the top-down preset):
  shapes that only read side-on were replaced after critique rounds (pipe arches read as horseshoes,
  a gooseneck lamp as a hook, starburst rays beside the cards as glitter, faceted boulders as shards,
  rooftop window grids as scattered windows). Critique rounds were checked against the card art
  before acting: where a critic asked for something the art doesn't have, the art won.

---
Self-approval checklist (only when the user is unreachable):
- [ ] Every constraint traceable into the Design section
- [ ] Every edge-case row has an expected behavior (or a written strike reason)
- [ ] Interfaces fully named and typed — no hand-waving
- [ ] Slices each ≤1 session and independently green
- [ ] Every slice row is pinned: files, signatures, test cases with expected values, card rulings
      cited (corpus row / TCGdex id) — no banned words; a builder would make zero choices
- [ ] No section reads "TBD"
