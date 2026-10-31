# 080: Stadium board polish — the field stays calm, the world tells you where you are
Status: shipped to branch claude/elegant-volta-r2cv6e; user localhost check pending (user request
2026-10-31: "higher quality, more appealing, less overwhelming (playability > looks), remove all AI
artifacting"). Visual-only: no review gate; stills before/after of all 25 boards in both presets
(.agent/scratch/stadium-pass/, not committed; regenerate with rec-stadium-boards.mjs).
Date: 2026-10-31 · Session: S—

## Problem
Design 077 built 25 procedural Stadium boards, each after its card art. Seen as a game shows them
(every zone filled, both camera presets), many fight the cards: bright or busy ground runs under the
Actives, Bench and piles, ambient motion sits next to cards, and procedural tells (noise smudges,
speckle, sparkle dust, rim glow on everything, props that are only colour blocks) read as generated
art. The user asked for a pass over every board: playability first, then appeal, no AI artifacts.

## Research — what the references teach
Sources read this session (web) plus the games themselves; the rules below are the distillation.

**Readability (game art practice).** Most readability failures are value failures: background
detail in the same value range as the gameplay layer swallows it; detail is a budget, and a scene
where everything is detailed has no hierarchy (bugnet.io "readable game art"). Plan the value
structure per scene; desaturate a screenshot to audit it; ground can carry detail only when its
light–dark range is small (DOTA 2's terrain), and "if everything is drawing attention, nothing
will" (Game Developer, "How to reduce visual confusion in your game"). Blur/squint test: the eye
must land where play happens; hero ≈ 90–100 % contrast, secondary 50–70 %, fill 20–40 % (heuristic).
Composition: big–medium–small shapes read in that order, each clearly apart in size; ~70 % of the
area low-detail, ~30 % carrying detail; negative space is functional, not empty.

**Card-game boards.** Hearthstone's boards keep the play surface a calm, low-contrast slab and put
the detail and the clickable toys in the four corners round it; its art team settled what must
read (numbers, title, art) before anything decorative (Blizzard GDC 2014, Ben Thompson; interviews
with Jomaro Kindred). Marvel Snap's locations carry their identity in a strip of art beside the
cards, never under them. TCG Live's Jumbotron boards are one painted texture whose middle is quiet.

**The 3D Pokémon games — every battle place is "a field in a world".**
- *Pokémon Stadium 1/2 (N64)*: a flat, evenly lit arena floor with a big Poké Ball marking; the
  theme lives in the stands, walls and sky. *Colosseum / XD (GameCube)*: the same, a raised flat
  stage in a themed hall. *Battle Revolution (Wii)*: eleven themed colosseums — Crystal (crystals
  pulsing in the walls), Magma (built on a volcano), Lagoon, Waterfall, Neon, Sunny Park, Courtyard,
  Stargazer (a view running into the distance), Sunset, Main Street, Gateway (stands in four leaves
  with waterfalls between them). In every one the battle floor stays a clean, flat, well-lit
  platform with a Poké Ball emblem; the theme is the surroundings and the light's colour. These are
  the closest analogues to our boards.
- *X/Y → Sun/Moon → Let's Go → BDSP*: soft, toy-like, rounded shapes; flat albedo with gentle
  gradients; little texture noise; lighting does the mood. *Sword/Shield*: Gym stadiums are a plain
  pitch with white line markings, the crowd and architecture around it, light rigs above.
  *Scarlet/Violet*: battle courts are simple marked slabs set into the town. *Legends: Arceus*:
  painterly, watercolour-soft ground, detail in silhouettes rather than texture. *Legends: Z-A*:
  softer light, saturated but simple surfaces, the city's identity in its buildings.
- *Pokkén Tournament*: themed stages, the fighting plane always clear. *Pokémon UNITE*: lanes are
  low-contrast ground, walls and trees are strong rounded silhouettes at the edges.
- Pokémon's shape language: round, chunky, toy-like; few hues per place; materials are simple.

**AI / procedural tells (what to remove).** Uniform detail everywhere with no rest areas; detail
that doesn't belong to anything (smudges, blobs, floating bits); noise used as texture rather than
describing a material; over-rendering — rim light and glow on everything, HDR saturation; fake
text and pseudo-logos; light without a source, shadows without a caster; warped or melted shapes;
repeated stamps; scattered sparkles and motes with no cause (DeepArt benchmark, arXiv 2312.10407;
"Organic or Diffused", arXiv 2402.03214; Mimikama). Shader-specific: aliasing shimmer and moiré on
fine patterns under a tilted camera (fade every pattern finer than ~2 px on screen, Quilez's
filtering approach with `fwidth`), visible Voronoi or fbm structure, banding.

## Rules — every board passes these (supersede where 077's checklist is looser)
1. **Field and world.** Each board names its field (the place the cards lie: plaza, arena floor,
   clearing, deck) and its world (everything round it). The field is one material in one value band
   (aim: local contrast round a card footprint within ~12 % of the field's luminance): no line, crack,
   edge, pattern or glow sharper than the field's own grain inside a footprint grown by 24 px.
2. **Detail falls off toward the cards.** Small-scale detail (tufts, pebbles, sparkles, grain) is
   densest at the scene's edges and fades to nothing at the field. Landmarks stand in the side bands
   and off the far end, never under or over a card in either preset (077 checklist).
3. **One value plan.** Cards are the brightest, most saturated things in the play area. The field
   sits a step below the card frames' white/yellow (not at it) and well above black; the world may be
   darker or richer. Squint test on every still: the eye lands on the cards.
4. **One light story.** One key light; a glow needs a source you can point at; at most one accent
   hue besides the board's palette; no rim light on everything, no bloom painted round everything.
5. **Motion budget.** Ambient motion only in the world, slow (periods ≥ 3 s) and low-contrast;
   nothing flashes, flickers or sweeps over the field. Particles only where something emits them,
   at most a handful on screen near the cards.
6. **No procedural tells.** No visible noise smudges, speckle, Voronoi cells or banding; every
   pattern finer than ~2 screen px fades out (fwidth); props are things you can name (a bench, a
   lamp), not colour blocks; no fake text.
7. **Pokémon look.** Round, chunky, toy-like shapes; few hues; flat albedo with soft gradients;
   light carries the mood.

## Current state
Facts read this session. Design 077 boards: one module per board (`client/src/setup/board3d/stadium-env-*.mjs`,
Scorched Earth and Perilous Jungle partly in `stadium-environment-mesh.js`), shared GLSL in
`stadium-environment-glsl.mjs`, every material built by the mesh's `kit.material`, which spreads the shared
`uniforms` object into it. No shader knew where the cards lie: footprints were only used in JS to keep props
clear of them. Stills of every board, both presets, full two-player layout: `.claude/skills/fx-preview/rec/
rec-stadium-boards.mjs` (new; ~2-4 min a board on SwiftShader, almost all of it shader compile).

## Options
**O1 · Calming the field.** A: one screen-space post pass on the plate (blur / contrast-compress round the
cards). B: give every shader the card footprints and let each board fade its own detail. **Pick B.** A blur
round a card reads as a smudge (a depth of field nothing on a flat table explains) and drags bright colour
into dark ground; B keeps each board's art intact and makes the calm diegetic (worn earth, a short lawn,
shallow joints, quiet water).
**O2 · Fine-pattern aliasing.** A: delete every fine pattern. B: Quilez frequency clamping, fading a pattern
to its mean where it would draw finer than ~2 screen px. **Pick B**, computed once at the top of `main`
(derivatives are undefined in divergent branches; ANGLE's HLSL rejects them there).
**O3 · Per-pixel hash grain** (`hash12(floor(p * k))`, quartz glints): no filtered form exists; removed.

## Design
- `stadium-environment-glsl.mjs`: `MAX_FOOTPRINTS` (24), `FOOTPRINTS` (`uFootprints[24]`, `uFootprintCount`,
  `footprintDistance(p)`, `fieldCalm(p, reach)`), `FILTERING` (after NOISE: global `filterPixel`,
  `pixelSize(p)`, `patternFade(pixel, period)`, `grain(p, scale)`).
- `stadium-environment-mesh.js`: shared uniforms `uFootprints`/`uFootprintCount`/`uFootprintBox`, filled by `setFootprints`
  from `environmentFootprints(layout)` whenever the layout signature (now including the footprints) changes,
  before the bake, so bakes may use `fieldCalm` too.
- Boards use `fieldCalm` to fade: fine detail (pebbles, tufts, blades, grain, crack lines, tesserae),
  local contrast (checker, joints, per-stone tone), glow pools and particles (none spawn within ~50-140 px of
  a card), and motion (pulses, sweeps, strobes) round the cards.

## Per-board critique and changes
What fought the cards or read as generated (seen in the baseline stills), and what changed. "Calm" means
`fieldCalm` round the cards; numbers are the shader's own.
- **Scorched Earth** — the river was the brightest, most saturated band on the board, running between the
  Actives; black crust blobs and swelling bubbles in it; glowing cracks under every card; embers rising
  beside cards; flicker. Now: a deep crimson river whose heat lives in thin threads (orange flow lines, a
  hot core line on the river's own centre line) with dark crust streaks drifting along the flow; narrower
  (half-width 56); cracks round the cards run dry; crack lines on stone tops only out in the world; a slow
  breath instead of flicker; half the embers, none beside a card. (Rejected tries: a flat orange band;
  Voronoi crust plates, which read as a net; a core keyed to bank distance, which the banks' wobble spread
  over half the river.)
- **Stormy Mountains** — dark pebbles dotted over the crater floor among the cards; rim rock like crumpled
  foil (small facets, noisy snow, cyan strokes on every bevel); emblem pulsing and flaring under the
  Actives. Now: scree only at the wall's foot and clear of cards; facets 124 px; broad snow fields; quieter
  bevel and edge glow; a steady emblem; strikes lighting the floor only faintly, and about half as often.
- **Crystal Cave** — dense pebble polka-dots and 4-px grit under the cards; a white-blue bloom between the
  Actives; seven crystal hues; tall side crystals leaning into the tilted view; sparkle dust over the
  cards. Now: worn smooth earth round the cards, pebbles out by the walls; a soft heart; four hues (the
  art's pink, sky blue, lavender, teal); shorter clusters; less over-rendered crystals (edges, rims, veins);
  70 sparkles among the crystals only, twinkling slowly.
- **Steel Shelter** — near-white floor: white and silver card borders lost their edges; black hazard
  stripes aimed at the cards; a shimmer running round the hologram. Now: a cool mid-light grey floor (walls
  stay white), quieter mirror, grey-on-grey corner strips, a steady hologram.
- **Forest of Vitality** — a carpet of small bumpy bushes (two leaf scales, speckle) all round; yellow glow
  pools like light leaks; the crown's shadow and flecks deep across the field. Now: fewer, bigger bushes in
  broad lobes; crown lobes broader; glow halved; meadow blades fade round the cards; shade over the field
  lighter with faint flecks; motes off the cards.
- **Full Metal Lab** — a bright radial glow and a sweeping scan ring under the Actives; fifteen huge chrome
  elbow pipes reading as hoses; black cables looping on the dais band beside the far Bench and snaking to a
  console, and hanging between the risers (black "hooks" from above). Now: a faint lens glow, steady emblem,
  no scan; seven pipes; no loose cables; the deck's tread plate fades where it would shimmer.
- **Levincia** — a loud saturated yellow mosaic swirl under the Actives (9-px tesserae = speckle); billboards
  of random colour blocks. Now: a pale quiet swirl inlay, tesserae only where the screen can draw them and
  not round the cards; floor a step darker; billboards with one icon each (Poke Ball, lightning bolt, play
  button); calmer glints and foam.
- **Mystery Garden** — the pool under both Actives was a bright cyan disc with rainbow rings and flickering
  white threads; busy flagstone rings (tone swings, dark joints, 2.6-px grain); speckled hedges; fireflies
  over the plaza; lanterns flickering fast. Now: deep teal water lit from its heart, slow faint rings, faint
  threads; paving close to one lavender round the cards with shallow joints; broader hedge clumps; 45
  fireflies out in the garden; lanterns breathing.
- **Old Cemetery** — headstones standing between the card rows; tuft speckle over the whole field. Now: no
  grave inside the cards' box; short grass round the cards; tufts faded where too fine.
- **Dimension Valley** — the full-saturation rainbow void glared round the island; bright glowing discs a few
  px off the cards; very saturated grass. Now: the art's rainbow kept rich but at about half its light,
  leaning to violet (taking its saturation out turned the yellow and green to mud); fewer discs, 30 px off
  every card, softer glow; calmer grass; 150 slow sparkles, none past the cards.
- **Surfing Beach** — already one of the calmest; a per-pixel hash grain and random quartz glints speckled the
  sand, wind ripples ran under every card, shells and starfish washed up beside cards, the sun glitter
  re-rolled 4 times a second in 5-px cells. Now: smooth sand round the cards, ripples out on the open beach and
  faded where too fine, no pixel grain, finds kept 50 px off cards, glitter in 9-px cells at 1.2 Hz.
- **Brooklet Hill** — every card lies on the lake (the user's 3DS-map layout), and its surface was a net of
  white ripple threads with twinkle stars, crest strokes, a fish rising and dark sunken rocks between the
  cards; the far bank's 2-px grass strokes aliased into speckle. Now: round the cards the water is a quiet
  teal with a gentle swell (no fish, strokes, sparkles or sunken rocks there); the lively water stays by the
  falls, boulders and shores; grass strokes fade where too fine; sand grain filtered.
- **Fighting Stadium** — near-white canvas under every card; the LED band round the ring printed pill-shaped
  pseudo-words; 16 sweeping lasers, starburst flares, twinkling phones. Now: a cool spotlit canvas a step under
  card white; LED panels each show one icon (Poke Ball, star, lightning bolt) a step dimmer; 8 lasers, slower
  and dimmer; short faint lamp rays; steady phone lights.
- **Mountain Ring** — cobbles with strong per-stone tone swings and dark joints under every card; cloud shadows
  sweeping over the cards. Now: one tone band and shallow joints round the cards; cloud shadows faint there.
- **Perilous Jungle** — pink and white flower dots and grass tufts across the clearing; 150 spores including
  beside cards; fluorescent poison. Now: short bare moss round the cards; 90 spores out over the bogs and
  undergrowth; the poison a few steps deeper (still the art's pink, in the corners).
- **Dark City** — both billboards printed blocks of pseudo-text; facades seen edge-on aliased their window
  grids into speckle; the searchlights' X was the brightest thing in the top-down view. Now: the checks with
  Team Skull's sprayed face, and the navy board with a big crescent moon and the pink X; windows fade to the
  facade's mean where too small to draw; searchlights about half as bright; roof grain filtered.
- **Magma Basin** — 320 embers, some floating over the island's cards; lit rims on every lump of the island's
  grain; flickering lava light; a pale-gold moat ring hugging the field; frequent bubbles; fast ripple rings
  at the falls; painted glowing sparks dotted over the island's rock. Now: 160 embers kept to the moat and
  falls; the island's grain worn low round the cards and its painted sparks only out by the moat; a slow
  breath of lava light; the moat a step cooler (gold down its middle, orange to the shores); fewer, slower
  bubbles and ripples.
- **Lumiose City** — pale plaza stone at card white; fine 2-5 px grain on every surface; setts band
  shimmering; cloud shadows over the cards. Now: the plaza a step darker; grain filtered, setts joints fade
  where too fine, slab joints shallower round the cards, cloud shadows faint over the field.
- **Magnetic Storm** — about one lightning strike a second across six arcs, each with a 30 Hz strobe; the
  emblem and pad pools pulsing under the cards; the iron-dust dash pattern and its travelling pulse under
  every card. Now: strikes about half as often, one soft flash each, gentler ground light; a steady, softer
  emblem; pads breathe faintly; the dust faint round the cards (the field shows out toward the pylons).
- **Shopping Center** — a hard high-contrast pink/white checkerboard under every card, the pale tile at card
  white; display tables and racks stocked in random colours (rainbow quilts of colour blocks). Now: round the
  cards the two pinks draw together (a blush floor with a faint checker), pale tile a step under card white;
  the gold ring less blown out; stock sorted by colour (two neighbouring colours a table, racks fading from
  one colour into the next).
- **Community Center** — a pale square at card white; 3-px stone grain; cloud shadows over the square's cards.
  Now: the square a step darker; grain filtered; cloud shadows faint over the field.
- **Pokemon Center** — the floor's big Poke Ball put full orange and card-white under both Actives; the
  cream/peach checker and its joints ran under every card; fine rug/floor grain. Now: the ball a soft coral
  over cream a step under card white, the cream tile deeper; checker and joints soften round the cards; grain
  filtered.
- **Grand Tree** — 6-px leaf litter, 7.5-px clover and 11-px tufts speckled the whole floor; a fine dapple
  drifting under the cards. Now: litter, clover and tufts thin out round the cards and fade where too fine;
  broader, slower dapple, faint over the field; 60 motes off the cards; the broad leaves, strewn singly at
  random like litter, now grow as five fern clumps of four or five fronds.
- **Neutralization Zone** — a bright pale platform (ring bloom and sheen) with white ring cores under every
  card; a pulse washing across it every 4 s; beam shimmer; screens of anonymous pale blocks. Now: thin cyan
  rings with little bloom, half the sheen; a slow faint pulse on the rings only; slower shimmer; screens show
  the Poke Ball in pale lines.
- **Fairy Garden** — one carpet of the same small blossom everywhere (speckle), under every card too; 190
  fast-blinking sparkles; the ring's bloom pulsing. Now: blossoms in broad drifts with bare moss between, none
  round the cards; 90 slow sparkles kept off the cards; a steady ring.

## Test plan
- Unit: `setFootprints` (every footprint as (x0, y0, x1, y1), unused slots far off, the box round them, none
  without a layout) in `stadium-environment-mesh.test.mjs`; every board's existing layout/projection tests
  (props clear of cards in both presets) still pass with the changed counts and placements; Brooklet's
  uniform-array sizes include `uFootprints`.
- Visual (exempt from tests, CLAUDE.md): stills of all 25 boards, both presets, every zone filled, before and
  after (`rec-stadium-boards.mjs`); every shader compiled on SwiftShader without a GL error in those runs.
- Manual (user, localhost): each board via `?stadiumEnv=<key>` with a full board; watch ~10 s of ambient
  motion near the cards (nothing should pull the eye off them).

## Migration / rollout
n/a: client shaders only, no data, no schema or netcode change. Revert: revert the commit.

## Deviations
- `FILTERING` reads derivatives once at the top of `main` into a global (`filterPixel`): ANGLE's HLSL
  backend rejects derivatives inside branches that neighbouring pixels may take differently, and most
  boards paint their surfaces inside such branches.
- The layout signature that triggers a board's re-apply and re-bake now includes the footprints, so the
  calm zones can never lag the cards (a bake may read `fieldCalm` too: Stormy Mountains' scree, Magma
  Basin's island grain, Scorched Earth's dry cracks).
- `fieldCalm` returns early outside the box round every card (`uFootprintBox`): most world pixels skip the
  24-rect loop.
