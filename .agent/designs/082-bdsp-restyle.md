# 082: The Stadium boards and kit in the Brilliant Diamond / Shining Pearl style
Status: approved (self — user gave a one-line brief and is not attending; visual-only, revertable)
Date: 2026-10-31 · Session: S—
User request (2026-10-31): "Do another passthrough of the boards and redo them and the assets in the
brilliant diamond/shining pearl style".

## Problem
Design 081 put every Stadium board on one kit: a two-tone toon light, ink outlines, flat colours,
plain painted grounds. It reads as a generic toon style, not as Brilliant Diamond / Shining Pearl
(BDSP, ILCA 2021), whose overworld the user now asks for. BDSP looks like a lit tabletop miniature:
- soft, bright light with no ink lines;
- leafy clump trees and stacked scalloped pines;
- lumpy clay rocks;
- hand-painted grass, flagstones and sand;
- deep blue water with sparkles;
- a tilt-shift blur that makes the whole scene read as a diorama.
Every board and asset needs a pass, including the four that 081 left off the kit (I273).

## Constraints
- **Procedural only** (077, 081): no external textures or meshes. The style comes from studying
  BDSP; nothing of BDSP's is copied.
- **080's field rules hold:**
  - the ground round the cards stays calm: no bright or busy detail beside a card;
  - nothing covers a card on screen, in either camera preset;
  - fine patterns fade by fwidth;
  - motion is slow and quiet.
- **081's checks hold:**
  - measures are true bounds;
  - ground-follow clearance holds on the beach and Stormy Mountains (`sandCeiling`,
    `craterCeiling`);
  - `RISE_LEAN` is added to card clearance.
- **User must-keeps:** Forest of Vitality's huge tree at the top right; the Pokémon Center lobby
  interior; Stormy Mountains' circular crater; Brooklet Hill's lake under every card; Magnetic
  Storm's force field; no characters.
- **Frame cost:**
  - the plate (≤ 1.6 MP, 4× MSAA) redraws only on an ambient step (30 fps);
  - the composite runs every frame at canvas size, so it must stay a few taps;
  - kit meshes stay merged per board.
- **Platform:** WebGL2 + EXT_color_buffer_float (already required). GLSL ES 3.00 reserved words are
  not names.
- **Each board keeps its Stadium's identity:** it is restyled, not re-themed as a Sinnoh place
  (the user did not ask for that).

## Current state
- `stadium-kit.mjs`:
  - MOODS (key, shade, sky, rim, outline, shadow);
  - KIT_LIGHT: toon ramp, rim, glint, chrome mirror;
  - kitFragment;
  - KIT_OUTLINE_* (inverted hull);
  - KIT_SHADOW_* (contact ellipses);
  - createKitProps → 3 meshes.
- `stadium-env-props.mjs` createPropBuilder: tube, cylinder, ring, box, quad, triangle, sphere,
  cone, blob, lathe, facets, surface, `at` frames, `look` ({kind, sway, shade, outline, sheets}),
  shadows. aLook.w = outline weight; aHull is built for the outline.
- `stadium-kit-assets.mjs`: 32 assets (081 shapes: ball crowns, star-tier pines, facet rocks).
- **Boards:** 21 boards light their solids with the kit, each with a mood:
  - 'day', 'cave', 'indoor';
  - custom moods: ARENA_LIGHTS, MOONLIT, CITY_NIGHT, VALLEY_MOOD, FAIRY_NIGHT, GARDEN_NIGHT,
    NEUTRAL_MOOD, LOBBY_MOOD, RING_MOOD, MALL_MOOD, STORM_NIGHT, STORMY_MOOD, JUNGLE_MOOD.

  Dimension Valley lights its island mesh with KIT_LIGHT directly. Brooklet Hill, Steel Shelter,
  Scorched Earth (volcanic recipe) and Magma Basin draw their solids in their own shaders.
- Each board paints its ground in its own TERRAIN_FRAGMENT over its bake (stadium-env-surfaces.mjs
  shares SURFACE_LIGHT, BLADES, PAVING, BOX_SHADOW; stadium-environment-glsl.mjs shares NOISE,
  VORONOI, FOOTPRINTS/fieldCalm, FILTERING, STONES).
- `stadium-environment-mesh.js`:
  - the plate is a HalfFloat 4× MSAA target, no mipmaps;
  - PLATE_FRAGMENT lays it (and a swap's under plate) on the canvas with Neutral tone mapping;
  - three resolves MSAA, then builds mipmaps when a target asks for them
    (`updateMultisampleRenderTarget`, then `updateRenderTargetMipmap`, vendored r185).
- References, from the official BDSP site's screenshots (diamondpearl.pokemon.com, 91 stills read
  this session):
  - routes 201–212: pines, flower patches, ledges, Pokémon Center;
  - Jubilife: asphalt, ornate paving, lamps, planters;
  - Valor Lakefront beach and Route 213: sand, boulders, sea;
  - Grand Underground: flagstones, cobbles, crystals;
  - Mt. Coronet: snow, strata cliffs.

## Options
**O1 · Foliage leaves**
- A (picked): a shader. Overlapping egg-shaped leaves splatted from 3D cells round each foliage
  fragment, each lying down its slope (on a flat top, out from the asset's foot), the uphill leaf
  on top, light at its tip, dark at its foot. Constant cost per pixel; no extra geometry; the
  leaf-size tests showed it reads as BDSP's shingled leaf clumps at both close and game zoom.
- B: geometry leaf cards. True scalloped silhouettes, but ~200k vertices on a forest board and
  slow builds.
- C: a runtime-drawn leaf texture. Seams on the balls and UV work on every shape.

**O2 · Light**
- A (picked): a soft wrapped key (smooth terminator), a hemisphere fill (sky above, bounce below),
  a broad sheen and a tighter gloss. BDSP lights its overworld this way, with no bands.
- B: 081's toon ramp, widened. It still reads as banded toon.

**O3 · Outlines**
- A (picked): none. BDSP's overworld has none. Removing them drops a draw and the aHull attribute.
- B: keep them thin. That keeps the 081 toon read.

**O4 · Diorama focus (tilt-shift)**
- A (picked): a screen-height blur in the plate composite. The plate's mip chain, 8 taps at a
  level that follows the blur radius; the cards stay sharp because they are drawn over the plate.
- B: depth-based depth of field. Needs a depth target, and blurs tall props nearest the camera.
- C: none. Loses the miniature read that is BDSP's most recognisable trait.

**O5 · Creases between lumps (canopies, bushes, rocks)**
- A (picked): per-vertex darkening from the neighbouring lumps at build (`lumps`).
- B: screen-space AO. Needs depth and normal targets in the plate.

**O6 · Grounds**
- A (picked): one shared GLSL ground kit (`stadium-env-ground.mjs`) every board paints with:
  - grass with painted clover marks and a fringe over paths;
  - flagstones and cobbles;
  - sand ripples and a wet band;
  - BDSP water;
  - rock strata.
- B: retune each board's own painting. 25 grounds would drift apart again.

**O7 · The four boards off the kit (I273)**
- A (picked): move them onto the kit in this pass. The user asked for every board.
- B: leave them on their own shaders.

## Design
### Art bible (every board follows it)
1. **Miniature.** The view reads as a tabletop diorama: depth of field softens the top and bottom
   of the screen, and a sharp band runs through the cards.
2. **Light.** Bright and soft:
   - a warm key from the board's sun, wrapping round forms with no hard terminator;
   - a sky fill from above and the ground's bounce from below;
   - a soft sheen on smooth parts and a tighter gloss on glossy ones (balls, planter shrubs, roofs,
     glass, crystals);
   - lit foliage goes warmer and yellower.
3. **No ink outlines.** Forms separate by light, creases and shadow.
4. **Toy shapes.** Rounded, chunky, a little squat:
   - broadleaf trees: a stout flared trunk under a crown of leafy lumps, deep in the creases;
   - pines: stacked scalloped tiers with a shade band under each hem and a lime tip;
   - bushes: leafy domes;
   - rocks: lumpy clusters, lighter on top;
   - built things: rounded-edged boxes.
5. **Leaves.** Every foliage part is covered in shingled leaves about a sixth of its crown's
   radius, light at the tip and dark under the leaf above. Where leaves fall under ~3 px on
   screen they fade to their mean.
6. **Colour.** Saturated, warm and high-key:
   - grass #79bf55;
   - leaves #4caa3c / #6fc244;
   - pines #2f8a45 / #57b247 / tip #9de04e;
   - sand #e8c58a;
   - cliffs #b9774d;
   - water #3f86e8 / shallows #6cc6f0;
   - roofs #f27a2c.

   A board shifts these toward its Stadium's own palette.
7. **Ground.** Hand-painted, not noisy:
   - broad soft value patches, plus one low-contrast pattern per material:
     - grass: clover marks;
     - sand: ripples;
     - paving: slabs or flagstones with grout;
     - caves: rounded cobbles;
     - cliffs: strata;
   - soft-edged borders, with grass fringing over paths.

   Patterns fade by fwidth and calm near cards (fieldCalm).
8. **Water.** Saturated blue, lighter and greener in the shallows, a wet band and a soft white edge
   at the shore, slow light streaks and a few slow sparkles. No glitter.
9. **Shadows.** A soft cool contact blob under every prop, slid away from the sun; trees cast big
   soft ones.

### Modules
- **`stadium-kit.mjs`**
  - MOODS (day, dusk, night, indoor, cave): `{ key, sky, bounce, sheen: [broad, gloss], shadow: [r, g, b, strength] }`.
  - KIT_UNIFORMS: uKitKey, uKitSky, uKitBounce, uKitSheen (vec2), uKitShadow, uKitGround.
  - Shaders:
    - KIT_LEAVES: `kitHash33`, `kitLeaves(p, n, outward, size)`;
    - KIT_LIGHT: `kitLight(albedo, n, world, look, metal)`;
    - kitFragment(reveal, glow): leaves on foliage with `leaf > 0`, the foot darkening;
    - KIT_SHADOW_*.
  - `paint` keeps its contract: KEY_GAIN is the new light's gain on an up-facing part in full sun.
  - `createKitProps` returns `{ objects: [shadows, props], materials: [solid, shade], uniforms, set }`.
- **`stadium-env-props.mjs`**
  - DEFAULT_LOOK `{ kind, sway, shade, leaf }`.
  - aLook.w = `leaf` × the frame's scale (px in the table frame).
  - `lumps(list, { crease })`.
  - `roundBox({ x, y, z0, z1, hw, hh, r, yaw, color, topColor })`: a box with its edges rounded at
    radius r, built as an inner box swept by a sphere.
  - No aHull or outline.
- **`stadium-kit-assets.mjs`**
  - Every asset remodelled to the art bible.
  - New:
    - `flowerBed`: a patch of BDSP flowers;
    - `ledgeRock`: a stacked slab outcrop, for caves and shores;
    - `bollard`: a rounded post;
    - `lantern`: the BDSP street lamp, glass head on an iron post (lamp `style: 'bdsp'`).
- **`stadium-env-ground.mjs`** (new, after NOISE, VORONOI, FILTERING): GLSL
  - `cloverGrass(p, base, calm)`;
  - `grassFringe(d, p)`;
  - `flagstones(p, size, gap)`;
  - `cobbles(p, size)`;
  - `sandRipples(p)`;
  - `bdspWater(p, depth, t)` → colour;
  - `strata(z, p)`.
- **`stadium-environment-mesh.js`**
  - The plate target takes mipmaps (LinearMipmapLinear).
  - PLATE_FRAGMENT runs `tiltShift(tex, uv)` over the plate and the under plate: 8 taps on a disc
    at mip level log2(radius), with radius `TILT_SHIFT.edge × s²`, where s runs from 0 inside the
    sharp band (centre `TILT_SHIFT.centre`, half `TILT_SHIFT.band` of the screen's height) to 1 at
    the screen's edge.
  - TILT_SHIFT is exported for tests and tuning.

### Per board
| Board | BDSP pass |
|---|---|
| Forest of Vitality | clover meadow; the huge tree's crown pads as leafy lumps; BDSP bushes, tall grass, flower beds, toadstools; glow pools kept |
| Grand Tree | forest-floor grass; the tree's crown leafy; kit broadleaf + pines; ferns |
| Perilous Jungle | leafy jungle crowns (teal/violet kept); mud and moss ground |
| Fairy Garden | night garden: clover grass, flower beds, leafy trees; orbs kept |
| Mystery Garden | night garden: leafy hedges, BDSP pool water, lanterns |
| Old Cemetery | moonlit route: clover grass, flagstone path, BDSP pines, rounded headstones |
| Surfing Beach | rippled sand with a wet band; sea in BDSP blue with shallows, slow streaks and sparkles; palms; lumpy shore rocks |
| Brooklet Hill | on the kit: lake water in the BDSP style, sandy shores, strata ledges, kit boulders and bushes on its land |
| Stormy Mountains | snowfield crater, strata on the crater wall, snowy pines, lumpy boulders |
| Mountain Ring | flagstone court, menhirs as rounded strata stones |
| Crystal Cave | Grand Underground cave: rounded cobbles, sand drifts, ledge rocks, glowing crystals |
| Dimension Valley | floating islands: clover-grass tops, strata sides |
| Magnetic Storm | wet storm grass, BDSP puddles, lumpy rocks, reeds; force field kept |
| Scorched Earth | on the kit: volcanic stone in strata, lumpy rocks, lava cracks |
| Magma Basin | on the kit: crimson strata walls, lava moat, lumpy island rock |
| Lumiose City | plaza paving with ornate slabs, kit trees in planters, BDSP lamps |
| Community Center | clover grass, flagstone paths, picket fences, kit trees |
| Levincia | yellow plaza paving, BDSP water, towers rounded |
| Dark City | night roofs; props rounded; window shader kept |
| Pokémon Center | bright lobby floor, rounded furniture, potted plants |
| Shopping Center | glossy mall floor, rounded fixtures |
| Full Metal Lab | panelled floor, rounded chrome |
| Fighting Stadium | rounded ring and posts |
| Neutralization Zone | rounded walls and screens |
| Steel Shelter | on the kit: its walls rounded, kit-lit |

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | no layout / no spots | `kit.set(null)`: both meshes hide | [ ] stadium-kit.test: createKitProps set(null) |
| 2 | bad colour | `paint` throws on anything but #rrggbb | [ ] stadium-kit.test: paint |
| 3 | an asset's parts past its stated reach | every asset's vertices inside measureAsset's reach and height | [ ] stadium-kit-assets.test: option-grid sweep (new assets included) |
| 4 | a prop over a card on screen | every built vertex above the cloth off every card's projected outline, both presets, every board with props (ground-follow boards along the ground's whole rise) | [ ] each board's screen test (`geometryOnCard`) |
| 5 | leaves under ~3 px on screen (far camera, small asset) | the pattern fades to its mean by fwidth: no shimmer | [ ] by construction (kitFragment fade); stills at game zoom |
| 6 | a flat top's middle (outward undefined) | `outward` falls back to its epsilon; leaves still form | [ ] by construction (kitLeaves normalize + 1e-4) |
| 7 | a foliage part with no `leaf` | soft foliage light, no leaves | [ ] stadium-env-props.test: look leaf 0 → aLook.w 0 |
| 8 | lumps that do not touch | no crease darkening | [ ] stadium-env-props.test: lumps apart keep their colour |
| 9 | tilt-shift on a 2×2 plate / the under plate in a swap | radius in plate px clamps to the mip chain; both plates blurred alike | [ ] stadium-environment-mesh.test: TILT_SHIFT, PLATE_FRAGMENT taps both |
| 10 | reveal and exit | kit solids and shadows rise/discard with terrainGrowth/revealBurned/exitKeep as before | [ ] manual: localhost reveal |
| 11 | reduced motion | sway reads uTime, frozen by the mesh | [ ] by construction |
| 12 | GL compile | every board's programs compile on SwiftShader with no shader error | [ ] captures of all 25 boards |
| 13 | a board on its own shaders moved to the kit (I273) | its old solids' shader paths go; screen tests cover its new props | [ ] that board's test |

## Test plan
- **Unit (pure):**
  - stadium-env-props.test: look.leaf → aLook.w × scale, lumps creases, roundBox bounds and normals,
    no aHull;
  - stadium-kit.test: moods/uniforms, createKitProps two meshes, every kit shader a full program;
  - stadium-kit-assets.test: the measure sweep over every asset (new ones too), determinism;
  - stadium-environment-mesh.test: TILT_SHIFT shape, plate target mipmapped, the composite's taps;
  - each board's screen test unchanged in contract.
- **Visual:**
  - the kit gallery (`rec-stadium-kit.mjs`) for asset and light lookdev;
  - stills of all 25 boards in both presets (`rec-stadium-boards.mjs`), before/after sheets.
- **Manual (user, localhost):** each board via `?stadiumEnv=<key>` for ~10 s in both cameras; the
  reveal.

## Migration / rollout
n/a: visual only, no data. Revert: revert the commit; the boards fall back to 081.

## Work plan — slices ≤1 session, each leaving the repo green
| Slice | Files (create / modify) | Signatures & data shapes | Test cases: input → expected | Rulings used (source) | Green when |
|---|---|---|---|---|---|
| 1 Kit core | stadium-kit.mjs, stadium-env-props.mjs, their tests, kit-gallery | as § Modules | look {leaf: 4} at scale 2 → aLook.w 8; lumps two apart → colours unchanged, overlapping → crease < 1; createKitProps → 2 objects; KIT_LEAVES/KIT_LIGHT compile in a full program | art bible 1–5 | board3d tests green |
| 2 Assets | stadium-kit-assets.mjs + test | every asset's dims true bounds | OPTION_GRID sweep incl. flowerBed, ledgeRock, bollard → every vertex within reach/height | art bible 4–6 | sweep green; gallery reviewed |
| 3 Tilt-shift | stadium-environment-mesh.js + test | TILT_SHIFT { centre, band, edge } | plate target minFilter LinearMipmapLinear, generateMipmaps; PLATE_FRAGMENT has tiltShift on uPlate and uUnder | art bible 1 | mesh tests green; stills |
| 4 Ground kit | stadium-env-ground.mjs + test | GLSL chunks as § Modules | each chunk compiles in a full program with NOISE/VORONOI/FILTERING | art bible 7–8 | test green |
| 5 Nature boards | vitality, grandtree, forest (jungle), fairy, garden, cemetery, beach, brooklet (+layout) | per § Per board | each board's existing tests; brooklet's new screen test | per board row | board tests green; stills reviewed |
| 6 Rock boards | highland (stormy), ring, crystal, dimension, storm, volcanic (scorched), magma | per § Per board | existing tests; scorched/magma screen tests | per board row | green; stills |
| 7 Built boards | lumiose, community, levincia, city, pokecenter, shopping, lab, arena, neutral, shelter | per § Per board | existing tests; shelter screen test | per board row | green; stills |
| 8 Close | harness, captures, review | — | full board3d suite, lint, gates | — | Done checklist |

## Deviations (Builder appends here during build)
- Leaves are splats from the 3D cells round each fragment (27 cells), the uphill leaf on top, each an
  egg with a pointed tip; a first try lit Voronoi cells and read as honeycomb.
- Brooklet Hill: one of the map's thirteen boulders drops out on the default board. The kit's boulder
  with its reach and its lean on screen stands too near a card there (layout test pins twelve).
- Scorched Earth and Magma Basin have no solids apart from their ground: their stones and walls are
  the baked terrain. They take BDSP's look in their own shaders (a smooth ramp in place of hard tone
  steps, warm basalt, strata on Magma Basin's walls), with no kit props. Props on Scorched Earth's
  terraces, up to ~60 px high, would need a bound on that ground for the screen test; the look does
  not need them.
- Steel Shelter's walls stay their own geometry and paint, lit by KIT_LIGHT under the hall's own mood
  (SHELTER_MOOD); the bare hall gets no props, as the art has none.
- Grand Tree's floor and Dimension Valley's island have no bare-earth patches: fringed with grass,
  they read as stains from above.
- Perilous Jungle's own instanced leaves keep their cel bands and dark edges. They are that board's
  identity, not the kit's solids.
- Added BLOOM to the plate composite: four taps on the plate's level-4 mip, past a linear threshold
  of 0.9 at 0.22 strength. This is BDSP's soft glow round lamps, crystals, lava and sunlit snow, and
  it applies to both plates of a swap.
- New assets in use: Forest of Vitality's flowers are `flowerBed`s, since a clump of five read as
  specks among the bushes; Crystal Cave's rubble is a `ledgeRock` of two slabs, as the Grand
  Underground stacks them. `bollard` is placed by no board yet: it stays in the gallery.

---
Self-approval checklist (only when the user is unreachable):
- [x] Every constraint traceable into the Design section
- [x] Every edge-case row has an expected behavior (or a written strike reason)
- [x] Interfaces fully named and typed — no hand-waving
- [x] Slices each ≤1 session and independently green
- [x] Every slice row is pinned (visual tuning values are lookdev, not design choices)
- [x] No section reads "TBD"
