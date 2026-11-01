# 083: Lively Stadium boards — motion, depth and varied layouts
Status: shipped to branch (user approved scope, "never over cards" and one pass, 2026-11-01)
Date: 2026-11-01 · Session: lively pass after 082

## Problem
The user, after 082: "do another passthrough on layout and designs, make them more lively less flat
less repetitive." Surveys of all 25 boards (2026-11-01) found:
- Props are scattered on jittered grids with hash-accept (uniform density, never clusters) or put on
  equal-angle rings and fixed share lists.
- One colour set per prop kind per board.
- Solids never move: only grass, fern, palm and flower heads sway.
- Capped near→far scans starve the far margin (Storm reeds, Cemetery pines and graves, Crystal
  clusters, Dimension discs).
- Most outdoor grounds are within ±2.5 px of flat.
- Pokémon Center, Shopping Center and Full Metal Lab have no motion at all.

## Constraints
- D232: the ground under and round the cards stays calm. The user picked "never over cards": no
  particle, moving shadow or dapple shows over a card or its margin on screen.
- D234 look (kit light, leaf splats, ground kit, tilt-shift); no characters or Pokémon (birds and
  butterflies included); each board keeps its Stadium identity.
- motionReduced (D105) freezes uTime: everything new is a function of uTime or static, so it freezes too.
- Perf: every board already redraws the plate at AMBIENT_FPS 30 (stadium-environment-mesh.js:1267);
  new motion is vertex/fragment work in that redraw, no new render passes. I274 (leaf cost) stands:
  sway moves vertices, it adds no fragment cost.
- Clearance: props pass each board's screen test (`geometryOnCard`, both presets). Where props now
  stand on baked relief, the test bounds the ground by the board's ceiling constant.
- Procedural only; no new dependency.

## Current state
- Board registry and build: `BOARDS` stadium-environment-mesh.js:744; `boardOf` :934 builds a board
  and adds `board.objects` to its holder. `kit.seeded(count)` :842 makes Points geometry with `aSeed`.
- Shared uniforms (mesh :802): uMin/uSize (scene bounds), uTime, uFocal, uEye (camera in the table
  frame), uFootprints (fieldCalm), uReveal/uExit.
- Kit: stadium-kit.mjs `kitPosition` :133 (sway = look.y px, per-vertex phase `dot(p.xy, …)`),
  `kitFragment` (emissive when aColor.w ≥ 1.5). stadium-env-props.mjs builder (looks, frames, aFoot).
  stadium-kit-assets.mjs `placeAsset` :1121 (seeded shape; colours from PALETTE + options.colors).
- Placement helpers: stadium-env-spots.mjs (`boardContext`, `hash`, `distanceToRect`, RISE_LEAN).
- Existing particles: Vitality motes, Grand Tree motes, Jungle spores, Fairy orbs + sparkles, Garden
  fireflies + halos, Brooklet mist, Community mist, Crystal sparkles, Dimension sparkles, Scorched
  embers + smoke, Magma embers.
- Existing cloud shadows: Community :319, Lumiose :440, Ring :585 (each its own copy).
- Kit ground-follow (`createKitProps({ ground: true })`): Beach, Brooklet, Stormy Mountains only.

## Options
1. **Ambient particles.** (A) Each board adds its own Points (copies of the mote pattern). (B) One
   module `stadium-env-drift.mjs` with a table of drift specs per board key, built in `boardOf`.
   → **B**: one shader, one integration point, every board gets motion with a table row.
2. **Particle card avoidance.** (A) fieldCalm at the particle's xy. (B) fieldCalm at the ground point
   the particle covers on screen: the eye ray through it, met with z = 0 (uEye). → **B**: a raised
   particle shows over a different ground point than its foot, as RISE_LEAN models for props.
3. **Uniform scatters.** (A) Rewrite each board's placement as clumps. (B) Keep each board's scatter
   and clearance, but modulate acceptance and size by a shared low-frequency patch field, and
   shuffle candidates before a cap. → **B** for grid scatters, plus (A) by hand where a board
   places a few pieces by list (rings, rows): cheaper, keeps every board's clearance logic.
4. **Colour sameness.** (A) More palettes per board. (B) placeAsset tints each instance by its seed
   (value ±7%, warmth ±4%), emissive colours untouched. → **B** for every board, plus a second
   palette where a board needs range.
5. **Solids swaying.** (A) Per-vertex phase, as now (a big crown wobbles like jelly). (B) Phase from
   the asset's foot (aFoot.xy) plus a small per-vertex term. → **B**: a crown sways as one piece.
6. **Blinking lights.** (A) A uniform per board. (B) `LOOK.blink` in the kit: an emissive part
   blinks at aLook.w Hz from phase aLook.z. → **B**: any board's emissive part can blink.
7. **Moving light.** (A) Per-board copies of cloud noise. (B) Shared `LIGHT_MOTION` chunk (cloudShade,
   dapple) in stadium-env-ground.mjs. → **B**: one look, used by every outdoor board.
8. **Relief on flat outdoor boards.** (A) Shading only. (B) Baked height outside the cards' reach plus
   `ground: true`, screen tests bounded by a ceiling constant. → **B** where props stand in the relief.

## Design
### Shared modules
- **stadium-env-drift.mjs** (new)
  - `DRIFT_KINDS`: `{ leaf, petal, snow, mote, firefly, ember, glint, confetti, fluff, ash, steam }`.
    Each kind is `{ shape, blend, size: [px, px], life: [s, s], z: [px, px], fall, sway, spin, wander,
    twinkle }`.
    - `shape`: leaf | petal | dot | glow | fleck.
    - `blend`: 'normal' | 'additive'.
    - `fall`: px/s, positive falls and negative rises.
  - `BOARD_DRIFT`: board key → array of `{ kind, count, colours: ['#hex', …≤4], emitters?: 'name' }`.
  - `createDrift(kit, specs)` → `{ objects: Points[], materials: ShaderMaterial[], setEmitters(list) }`.
  - `DRIFT_VERTEX` and `DRIFT_FRAGMENT`, with one material per spec. Uniforms:
    - kind parameters as vec4s;
    - `uDriftColours[4]`;
    - `uEmitters[MAX_EMITTERS = 12]` (x, y, radius, z), `uEmitterCount`;
    - `uWind` (vec2 px/s).
  - Life: a particle spawns at a hashed point, re-hashed each life cycle. The point is in the scene
    (uMin..uMin+uSize), or on a disc of a hashed emitter when the board gives emitters.
    - It moves by fall/wind/sway/wander over its life and spins.
    - Its opacity is `reveal × exit × lifeFade × (1 − smoothstep(0.02, 0.3, fieldCalm(G, 110)))`.
      G is the eye ray through the particle met with z = 0, so it hides before it covers a card.
    - Point size is perspective: `size × uFocal / −mv.z`.
  - `boardOf` (mesh) appends `createDrift(kit, BOARD_DRIFT[key] ?? [])` objects and materials. A
    board's `apply(spots)` can call `board.drift.setEmitters(spots.emitters ?? [])`; the mesh calls
    it with `spots.driftEmitters` after `board.apply`.
- **stadium-env-props.mjs**
  - `tint(factor, draw)`: vertex colours × factor (rgb), nested multiplicatively; emissive (w ≥ 1.5)
    is untouched.
  - LOOK gains `blink: 7`. A look `{ kind: LOOK.blink, rate, phase }` writes aLook = (7, 0, phase,
    rate), unscaled.
- **stadium-kit-assets.mjs**
  - `placeAsset` tints each instance: `vary` (default 1).
    - `seededRandom(seed * 3.7 + 11)` gives v ∈ ±0.07·vary and w ∈ ±0.04·vary.
    - factor = [1+v+w, 1+v, 1+v−w].
  - Crowns gain sway: treeRound and bush crowns 0.6 px, pine tiers 0.5 px, hedge and topiary 0.4 px.
- **stadium-kit.mjs**
  - `kitPosition` sway phase = `dot(aFoot.xy, (0.043, 0.029)) + dot(p.xy, (0.006, 0.004))`.
  - In `kitFragment` an emissive part whose look is blink is multiplied by
    `mix(0.18, 1.0, smoothstep(-0.2, 0.2, sin(6.2832·(uTime·rate + phase))))`.
- **stadium-env-spots.mjs**
  - `patch(x, y, scale, salt)`: 0..1 smooth value noise (bilinear hashed lattice, smoothstep).
  - `patchy(x, y, { scale = 260, contrast = 1, salt = 0 })`: acceptance weight 0..~1.8.
  - `shuffled(list, salt)`: deterministic Fisher–Yates by hash, used before a cap.
  - `clumpAround({ x, y }, { count, reach: [min, max], salt })`: satellite offsets for hand clumps.
- **stadium-env-ground.mjs**
  - `LIGHT_MOTION`, after NOISE and FILTERING:
    - `cloudShade(p, t, scale)` 0..1 (drifting soft cloud shadow);
    - `dapple(p, t, size)` −1..1 (canopy light flecks).
  - Callers multiply both by `(1 − fieldCalm(p, 130))`.

### Per board (P = the board's own change; D = its BOARD_DRIFT row)
| Board | Layout and variety | Depth and detail | Motion (D, plus the board's own) |
|---|---|---|---|
| Forest of Vitality | bushes patchy, 3 palettes, treeRound heroes, flowers in drifts | kit ground:true on the existing swells | D leaf from crown emitters; crown and bush sway; dapple near the tree |
| Grand Tree | fern/bush/rock/mushroom clumps across the bare clover | swells outside the cards; fallen-leaf flecks | D leaf from the crown; crown sway; dapple under the crown |
| Perilous Jungle | plants patchy (clearings and thickets) | — | crowns sway; D firefly |
| Fairy Garden | trees patchy, bushes and flower beds mixed | low swells, ground:true | D petal; tree sway |
| Mystery Garden | hedges patchy, 2 palettes, topiary heroes | beds raised past the steps, ground:true | D petal |
| Old Cemetery | pines and graves balanced across margins (shuffle), stones tinted | gentle undulation | D firefly (wisps), D leaf (dry); pine sway |
| Surfing Beach | more beach clusters (shells, rocks, grass), palms varied | — | D (none); palms sway as now |
| Brooklet Hill | bank clumps (bush, treeRound, flowers, reeds) | — | D leaf; bush sway |
| Dimension Valley | discs patchy; slab bob rhythms varied | island swells off the cards | D glint |
| Stormy Mountains | boulder/pine clumps on the rim, varied sizes | snow drifts at the wall foot | D snow; pine sway |
| Mountain Ring | stone spacing and height irregular, rubble clumps | — | D mote (dust, wind) |
| Crystal Cave | clusters shuffled (far zone filled), 6 hues, sizes varied | — | D glint (crystal dust) |
| Magnetic Storm | reeds patchy and balanced, reeds sway | marsh undulation with puddles | D mote (static sparks) |
| Scorched Earth | — | two stone tones | D ash |
| Magma Basin | basalt boulder clumps on the island rim | — | (embers as now) |
| Lumiose City | lamp pitch and tree spacing irregular, trees in clumps | — | D leaf; banner sway; billboard blink |
| Community Center | trees/bushes/flowers patchy, mixed kinds | lawn swells, ground:true | D fluff; tree sway; flag sway |
| Levincia | billboards varied in size and height | — | D confetti; screens blink |
| Dark City | rooftop clutter (vents, units, crates) | roof slab tones | mast lights blink; D steam from vents |
| Pokémon Center | furniture spacing irregular, more plants | — | D mote (warm dust); screens blink; plant sway |
| Shopping Center | tables/mannequins offset and varied, bags and plants | — | D confetti (sparse); balloons sway; signs blink |
| Full Metal Lab | pipes varied, crate/canister clusters | — | D steam from pipe valves; console lights blink |
| Fighting Stadium | — | — | D confetti; rig lamps blink |
| Neutralization Zone | column heights and colours varied | — | D mote (holo, rising); screens blink |
| Steel Shelter | crates, barrels and warning lamps along the walls (kit) | floor hazard markings | D mote (dust); warning lamps blink |

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | board with no drift row | createDrift returns no objects | [x] stadium-env-drift.test: createDrift none without specs |
| 2 | unknown kind / bad colour | createDrift throws (kind) / paint throws (colour) | [x] stadium-env-drift.test: unknown kind or bad colour throws |
| 3 | emitters empty | particles spawn over the visible area (driftArea) | [x] stadium-env-drift.test: setEmitters none → 0; driftArea/setArea |
| 4 | more emitters than MAX_EMITTERS | setEmitters keeps the first MAX_EMITTERS | [x] stadium-env-drift.test: setEmitters cap |
| 5 | particle over a card, the field between the rows, or the opponent's hand, on screen | hidden by the eye-ray ground test (blockGap from uFootprintBox, avoidGap) | [x] stadium-env-drift.test: shader hides by covered point; setAvoid; stills |
| 6 | reduced motion | uTime frozen: particles, sway, blink and clouds still | [x] by construction: every new term is a function of uTime and attributes only |
| 7 | reveal / exit | particles gated by revealBurned/exitKeep | [x] stadium-env-drift.test: revealBurned(pos) * exitKeep(pos) |
| 8 | tint on emissive | glow colours unchanged | [x] stadium-env-props.test: tint() glow keeps its colour |
| 9 | blink look | aLook = (7, 0, phase, rate), not scaled by the frame | [x] stadium-env-props.test: blink look |
| 10 | patchy determinism | same inputs → same weight; range within [0, 1.8] | [x] stadium-env-spots.test: patch, patchy |
| 11 | shuffled | same salt → same order; a permutation | [x] stadium-env-spots.test: shuffled |
| 12 | props on new relief | screen tests pass with the board's ground ceiling | [x] vitality/grandtree/fairy screen tests with their ceilings; stadium-glsl-noise.test: fbm3 inside 0..1 |
| 13 | GLSL | every board program declares every name | [x] stadium-glsl-idents.test |
| 14 | cap starvation | capped props spread across near, side and far margins | [x] crystal.test: clusters reach the far end; storm.test: reed beds spread |

## Test plan
- New unit tests: stadium-env-drift.test (specs, throws, emitters cap, materials per spec);
  stadium-env-spots.test (patch, patchy, shuffled); props test (tint, blink look); kit test
  (blink in kitFragment, foot phase in kitPosition).
- Board tests stay green; screen tests include new props; ceilings where ground:true is new.
- GLSL identifier test covers drift and every changed board shader.
- Captures of all 25 boards, both presets; before/after sheets against 082's finals.

## Migration / rollout
n/a: client visuals only; revert = revert the commit.

## Work plan
| Slice | Files | Contract | Tests | Green when |
|---|---|---|---|---|
| 1 Kit | stadium-env-props.mjs, stadium-kit.mjs, stadium-kit-assets.mjs, stadium-env-spots.mjs, stadium-env-ground.mjs + tests | as § Shared modules (tint, blink, foot-phase sway, crown sway, patch/patchy/shuffled/clumpAround, LIGHT_MOTION) | rows 8–11 | board3d tests green |
| 2 Drift | stadium-env-drift.mjs (new), stadium-environment-mesh.js + test | as § Shared modules; BOARD_DRIFT rows per the table | rows 1–4, 13 | green; drift compiles on every board |
| 3 Nature boards | vitality, grandtree, forest, fairy, garden, cemetery, beach, brooklet, dimension | per § Per board | each board's tests | green; stills |
| 4 Rock boards | highland, ring, crystal, storm, volcanic, magma | per § Per board | each board's tests | green; stills |
| 5 Built boards | lumiose, community, levincia, city, pokecenter, shopping, lab, arena, neutral, shelter | per § Per board | each board's tests | green; stills |
| 6 Close | harness, captures, review | — | full board3d suite, lint, gates | Done checklist |

## Deviations (Builder appends here during build)
- Drift is born over the part of the scene the camera sees (visibleArea: the table grown 12%), not
  the whole scene: over the scene most particles were off screen. It fades before the whole block of
  cards (uFootprintBox: per-card fieldCalm let leaves show in the field between the rows) and before
  the opponent's fanned hand (setAvoid), which is not a card footprint. The sun flecks and the cloud
  shadows fade the same way.
- A shared clump placer (stadium-env-clumps.mjs: clumpPieces, scaledKinds) does the boards' new
  clumps; it was not in § Shared modules.
- Rows built only in part, or not at all, each board keeping its own look where the row asked for
  more (none of these is a regression; each is a candidate for a later pass):
  - Community Center: groves, mixed lawn clumps and the flag; no lawn swells (its props stay off
    the baked ground).
  - Mystery Garden: hedge thickets in three teals with blossom; no raised beds or topiary heroes.
  - Old Cemetery: graves and pines shuffled, stones tinted; no undulation. In narrow layouts the far
    end still holds no pines: their clearance (tall pines lean far) leaves no room there.
  - Dimension Valley: disc drifts and each island on its own beat; no island swells.
  - Stormy Mountains: boulder heaps and pine groves, snow; no snow drifts at the wall's foot.
  - Magnetic Storm: reed beds, swaying reeds, motes; no marsh undulation or new puddles.
  - Magma Basin: no rim boulder clumps (the island keeps ~28 px past the cards, no room); the walls
    take stretches of tone and breathing lava veins instead.
  - Lumiose City: trees and lamps off the grid, banners, falling leaves; no billboard blink.
  - Dark City: rooftop clutter, steam and blinking aircraft lights; no roof slab tones.
  - Pokémon Center: more plants of more sizes, pulsing counter lamps; furniture spacing and screens
    kept.
  - Shopping Center: tables and mannequins offset, tables turned, balloons swaying; no bags or
    plants, no sign blink.
  - Full Metal Lab: blinking status lights and steam from the tanks; pipes and cabinets kept, no
    crate clusters.
  - Steel Shelter: supplies along the walls with blinking warning lamps; no floor hazard markings.
  - Surfing Beach: shell drifts, tussock grass, pebble scatters, cloud shadows; palms vary only by
    the kit's per-instance tint.
  - LIGHT_MOTION: dapple under the crowns (Vitality, Grand Tree) and cloudShade over the sand and
    the banks (Surfing Beach, Brooklet Hill); Community, Lumiose and Mountain Ring keep their own
    cloud shadows; the night and indoor boards take none.
- The arena's rig lamps flash in a chase that runs once round all of them every 9 s (aChase, 0..1
  per lamp), on top of their steady breath.
- placeAsset tints only seeded instances: an asset placed without a seed keeps its palette.
