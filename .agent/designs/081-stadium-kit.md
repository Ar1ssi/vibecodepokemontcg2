# 081: The Stadium kit — one art style for every Stadium board, after the 3D Pokémon games
Status: shipped to branch claude/elegant-volta-r2cv6e; user localhost check pending (user request
2026-10-31: "Currently the boards are all procedurally generated. Maybe make assets that unify the
art style and make them actually look like they're from the pokemon games?")
Date: 2026-10-31 · Session: S—

## Problem
Each of the 25 Stadium boards (design 077, polished in 080) was drawn its own way: one board's
trees were noise-lumped spheres lit by Voronoi lobes, another's flat discs, another's painted into
the ground; stone, bark, roofs and water each carried their own procedural texture (grain, stains,
cracks, tufts, glints). Side by side they read as 25 shader experiments, not one game. The user asked
for assets that unify the style and look like the Pokémon games.

## Constraints
- Procedural art only: no external textures or meshes (user, 2026-10-25, design 077). "Assets" are
  modelled in code, deterministic by seed.
- Design 080's rules hold: the field round the cards stays calm; nothing covers a card on screen in
  either camera preset; slow, quiet motion; no AI tells (speckle, shimmer, noise).
- User-requested features stay: Forest of Vitality's one huge tree at the top right; Pokémon Center
  as the lobby's interior; Stormy Mountains' circular crater; Brooklet Hill's lake under every card;
  Magnetic Storm's force field; no characters (077).
- Frame cost (077 § Mesh): the plate redraws only on an ambient step (30 fps); prop meshes are
  merged per board (three draws: shadows, solids, outlines).
- WebGL2, GLSL ES 3.00 reserved words (`patch`, `flat`, ...) are not names.

## Current state
- `stadium-env-props.mjs` `createPropBuilder`: tubes, cylinders, boxes, quads into one geometry,
  each board lighting it with its own `propFragment({ light })`.
- 19 boards built props with it (each with its own light); Forest of Vitality, Perilous Jungle,
  Crystal Cave, Mystery Garden, Surfing Beach drew foliage, crystals, palms and hedges with their own
  instanced shaders; Surfing Beach's sea was refraction, caustics, Fresnel sky and lace foam.
- References (research this session; web sources on the games' art direction are thin, so the
  look is also from knowledge of the games): Let's Go, Brilliant Diamond/Shining Pearl, X/Y and Sun
  and Moon overworlds (a high camera like ours: toy shapes, clean colour, soft shadows, outlines),
  Sword/Shield gym pitches and Scarlet/Violet courts (flat themed fields), Pokémon Stadium/Battle
  Revolution colosseums, UNITE (readable top-down arenas); techniques: sphere-projected foliage
  normals, inverted-hull outlines, two-tone toon ramps, blob shadows, banded toon water with foam
  lines (Wind Waker).

## Options
**O1 · Where the assets come from**
- A: code-modelled geometry, one builder (picked). Deterministic, no binary files, no dependency,
  sizes follow the board's world unit.
- B: glTF files. Needs a modelling tool this environment lacks and a loader; breaks "procedural only".
- C: painted textures. Brings back the texture look the user called procedural.
**O2 · How the style is unified**
- A: one shared light (KIT_LIGHT) with a per-board mood (picked): every board gets the same ramp,
  shadow colour logic, rim, outline and contact shadow; moods change only colours.
- B: keep each board's light, retune colours. 25 lights would drift apart again.
**O3 · Outlines**
- A: inverted hull, pushed along a smoothed normal (aHull) by a fixed number of plate px (picked):
  one extra draw of the same geometry, works in the plate.
- B: a screen-space edge pass. Needs depth/normal targets in the plate pipeline.
**O4 · Contact shadows**
- A: soft ellipses multiplied into the plate after the ground, before the props (picked).
- B: a shadow map. Cost and acne on the displaced terrain; the toon look wants blob shadows.
**O5 · A board's own light (lanterns, pool, orbs, the pads' pink)**
- A: a `glow` GLSL hook added over the kit's light on lit parts (picked).
- B: separate materials per board. Splits the style again.

## Design
### Art bible (every board follows it)
1. Shape: chunky, rounded toy shapes. Trees are clusters of soft balls on a short trunk, lighter
   balls on the sunward top; conifers stacked star tiers; rocks a few broad facets with a flat top;
   crystals clean hexagonal shafts paling to the tip.
2. Colour: two or three flat colours a part, no texture noise. Colours are authored as they show on
   screen (`paint('#hex')` inverts sRGB and Neutral tone mapping).
3. Light: one toon ramp, crisp on hard surfaces, soft on foliage and cloud; the shade cool and
   saturated (the mood's `shade`); a little sky from above; a rim on the lit side of a silhouette; a
   hard glint on glossy parts; toon chrome (floor dark under a bright horizon line) on metal;
   crystals keep their colour in shade; thin dry stalks (`LOOK.matte`) take no rim or glint, since
   seen from above they are all edge and a rim would whiten them.
4. Outline: a thin dark shade of the part's own colour, ~1.1 plate px, on solids only (loose quads
   opt in with `sheets: true`).
5. Contact shadow: a soft ellipse under every solid, slid away from the board's sun.
6. Ground: painted, not textured: broad soft patches (≥ ~100 px), crisp borders between materials;
   no Voronoi tufts, grain, pebble speckle or stains (small things are 3D kit props instead).
7. Water: flat bands of colour by depth, crisp white foam lines; no refraction, caustics or glitter.

### Modules
- `stadium-env-props.mjs` (builder): placement frames (`at({ x, y, z, yaw, lean, scale, ground })`,
  `frameOf`, `composeFrames`); a per-part look (`look({ kind, sway, shade, outline, sheets })` →
  aLook); `blob` (ellipsoid, tessellation grows with size), `lathe`, `facets` (flat-shaded),
  `surface` (a smooth grid); `shadow()` / `withoutShadows()` / `buildShadows()`; at build, aHull
  (normals averaged over outlined vertices at a place) and aFoot (the asset's foot; z: stands on the
  board's baked ground). Existing primitives unchanged.
- `stadium-kit.mjs`: `MOODS` (day, dusk, night, indoor, cave), `paint` / `glslColour` /
  `neutralInverse`, the shaders (KIT_VERTEX with sway and ground-follow, `kitFragment(reveal, glow)`,
  KIT_OUTLINE_*, KIT_SHADOW_*), `KIT_LIGHT` + `KIT_UNIFORMS` for a board's own mesh (Dimension
  Valley's bobbing islands), `kitUniforms(three, mood, { ground })`, `createKitProps({ three,
  material, own, mood, reveal, ground, glow })` → `{ objects, materials, uniforms, set(builder|null) }`.
- `stadium-kit-assets.mjs`: `ASSET_NAMES` (treeRound, pine, palm, bush, hedge, fern, tallGrass,
  flowers, boulder, pebbles, spire, crystals, mushroom, stump, deadTree, cloud, pokeBall, beachBall,
  starfish, shell, towel, surfboard, lamp, bench, parasol, planter, topiary, fence, signpost,
  gravestone, reeds, lilyPad), `measureAsset(name, options)` → { reach, height } (for clearance),
  `placeAsset(props, name, options)` (`sun` lays shadows; `shadows: false`; `ground: false`).

### Per board
| Board | Kit work |
|---|---|
| Forest of Vitality | trunk (surface), boughs, crown pads as foliage balls, kit bushes, tall grass on the meadow edge, flowers, toadstools; meadow painted |
| Grand Tree | strands/roots/limbs outlined, crown balls with sunward tops, kit small tree, fern clumps, toadstools; floor painted |
| Surfing Beach | kit palms (fitted clear of cards, allowing for the sand's rise: `sandCeiling`), boulders (sea rocks at sea level), starfish, shells, parasol + towel sets, beach ball, surfboard, dune grass; sea in flat bands + crisp foam; clean sand; palm shadow target removed |
| Lumiose City | kit trees, benches, café parasols, flower clumps on the beds; buildings/lamps/tower kit-lit, outlined; paving without grain/stains |
| Community Center | kit trees (terrain shades under them), boulders, bushes, flowers; hall/tent/kiosks outlined; grass and paving painted |
| Pokémon Center | lobby mood; furniture outlined; kit topiary plants; tile grain gone |
| Shopping Center | mall mood; balloons gloss; fixtures outlined |
| Levincia | towers/billboards outlined; mosaic one even yellow; water flat with a crisp foam line |
| Old Cemetery | moonlit mood; headstones outlined; kit pines; kit tall grass tufts; grass and path painted |
| Mystery Garden | garden night mood + pool/lantern glow; hedges of kit bushes, kit ferns, urn flowers |
| Fairy Garden | night mood + orb glow; kit trees, ferns |
| Mountain Ring | stones, spires, ropes, chain outlined; paving speckle gone |
| Magnetic Storm | storm mood + pad/strike glow; kit boulders; pylons/trees outlined; ground painted (no painted reed tufts, grain or rippling puddles: the reeds are its clumps) |
| Full Metal Lab | everything toon chrome, outlined |
| Fighting Stadium | arena lights mood; ring toon chrome, outlined; the rig runs RIG_OUT_PX outside the ropes so it never leans over a card |
| Neutralization Zone | zone mood; walls/screens toon chrome, outlined |
| Dark City | rooftop props kit-lit with the hut's lamp glow; towers keep their window shader |
| Crystal Cave | crystals as kit facets (crystal kind, outlined), rubble at each cluster; floor without pebble speckle |
| Dimension Valley | island rock in KIT_LIGHT, earth in clean strata bands; grass painted |
| Stormy Mountains | kit boulders on the crater wall's foot, snow pines on the outer slopes (ground-follow; clear of the cards by their top's height on `craterCeiling`) |
| Perilous Jungle | trees (violet trunks, teal/violet foliage-ball crowns, beaded vines) as kit solids in a jungle mood; its cel-shaded leaves, bells and spikes kept |
| Mountain Ring | (also) a hazy mountain mood so the menhirs stay grey |
| Brooklet Hill, Steel Shelter, Scorched Earth, Magma Basin | unchanged here: their solids are baked terrain or bespoke shaders (Brooklet copies Sun and Moon's own 3DS map; Scorched Earth's slate is sculpted stones); see Deviations |

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | no layout / no spots | `kit.set(null)`: the three meshes hide | [x] stadium-kit.test: createKitProps set(null) |
| 2 | bad colour | `paint` throws on anything but #rrggbb | [x] stadium-kit.test: paint |
| 3 | an asset's parts past its stated reach | every asset's vertices inside measureAsset's reach and height | [x] stadium-kit-assets.test: every kit asset … |
| 4 | a prop over a card on screen | every built vertex above the cloth off every card's projected outline, both presets, 7 views, every board with props; on a ground-follow board along the ground's whole possible rise (`sandCeiling`, `craterCeiling`); clearances add RISE_LEAN of a prop's top height | [x] each board's "covers a card on screen" test (`geometryOnCard`) |
| 5 | a loose sheet with an outline | its hull would show as a slab: sheets never outline unless `sheets: true` | [x] stadium-env-props.test: loose quad |
| 6 | a degenerate face (a frond's tip) | the face normal falls back to +z, never 0 | [x] stadium-env-props.test (degenerate triangle) |
| 7 | reveal and exit | kit solids, outlines and shadows rise/discard with terrainGrowth/revealBurned/exitKeep like the terrain | [ ] manual: localhost reveal |
| 8 | reduced motion | sway reads uTime, which the mesh freezes when motion is reduced | [x] by construction (stadium-environment-mesh.js update) |
| 9 | a board whose ground already shades under a prop | `shadows: false` (no double shadow) | [x] stadium-kit-assets.test: placeAsset shadows: false |
| 10 | GL compile | every board's programs compile on SwiftShader with no shader error | [x] captures of all 25 boards (rec-stadium-boards.mjs) |

## Test plan
- Unit (pure): `__tests__/stadium-env-props.test.mjs` (frames, looks, sheets, hull normals, shadows,
  feet, degenerate faces), `stadium-kit.test.mjs` (paint/neutral inverse, kitUniforms, createKitProps:
  pass settings, geometry released; every kit shader a full program), `stadium-kit-assets.test.mjs`
  (every asset inside its measure over an option grid and the boards' seeds, determinism, palette);
  each board's test checks every built vertex above the cloth against the cards' projected outlines
  (`stadium-screen.mjs` `geometryOnCard`, with the ground's rise on the beach and Stormy Mountains,
  whose bounds are pinned to their bake shaders' text).
- Visual: stills of all 25 boards in both presets (`rec-stadium-boards.mjs`), no GL errors.
- Manual (user, localhost): each board via `?stadiumEnv=<key>` for ~10 s, both cameras.

## Migration / rollout
n/a: visual only, no data. Revert: revert the commit; boards fall back to their 080 look.

## Deviations
- Shopping Center's escalator treads no longer slide (the kit light has no tread animation).
- Mountain Ring's props lose their distance haze (the kit glow is additive; the ground keeps it).
- Dark City's towers keep their own window shader (their lit windows are the board at night).
- Brooklet Hill, Steel Shelter, Scorched Earth and Magma Basin were not moved onto the kit in this
  pass: their solids are baked into the terrain (Brooklet's boulders and bushes stand on a land model
  that lives only in GLSL; its layout follows the Sun and Moon map, design 077) or are architecture
  with their own shaders. Next (I273): port Brooklet's land distance to JS and stand kit boulders
  and bushes on it.
- Perilous Jungle's limb, crown and vine shaders (stadium-env-forest.mjs) went with the kit trees.
- The board hooks `beforeRender` and `dispose` went with their only user (the beach's palm shadow
  target).
- 14 of the 32 assets are placed by no board yet (hedge, spire, crystals, stump, deadTree, cloud,
  pokeBall, lamp, planter, fence, signpost, gravestone, reeds, lilyPad): the boards that have these
  things keep their own shapes, drawn in the kit's light and outline. They stay as the kit's library,
  measured, tested and in the gallery, for I273's boards and the next ones.
