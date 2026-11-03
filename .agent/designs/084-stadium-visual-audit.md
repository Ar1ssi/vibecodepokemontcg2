# 084: Stadium boards — visual audit against the card art and general design principles
Date: 2026-11-02 · Build: main @ 1d7bb60 (designs 077–083 merged) · Read-only; nothing changed.
Status: building (one-shot, self-approved) — 2026-11-03, branch `feature/084-stadium-visual-fixes`.
User request (2026-11-03, verbatim): "@.agent/designs/084-stadium-visual-audit.md Implementing all fixes."
The audit below is the spec; the build sections (Acceptance, Assumptions, Design, Work plan) follow it.

## What was looked at
- All 25 boards rendered as a game shows them (every zone filled, both camera presets, 1920×1080,
  the chat panel open) with `rec-stadium-boards.mjs`. Side-by-side stills: `.agent/scratch/stadium-visual-audit/boards/<board>.png`
  (left: tilt12, right: tcgl); contact sheets `.agent/scratch/stadium-visual-audit/boards/sheet-*.png` (not committed; regenerate with `rec-stadium-boards.mjs`).
- The card each board is modelled on (the header of each `stadium-env-*.mjs` names the print):
  `.agent/scratch/stadium-visual-audit/card-art/` (not committed). 17 are the Homebrew re-makes in the repo;
  Lumiose City, Magnetic Storm, Shopping Center, Community Center, Pokémon Center, Grand Tree,
  Neutralization Zone and Fairy Garden are not in the repo's set.json (it ends at 299), so their
  source prints came from TCGdex (me03-077, xy2-91, swsh7-157, sv06-146, bw4-90, sv07-136,
  sv06.5-060, xy10-100).
- Two stills (mystery-garden tilt12, fairy-garden tilt12) were shot before card faces loaded
  (face-down opponent cards, a grey Stadium slot). That is a capture artefact, not a board defect.

## The yardsticks (general design principles, not the repo's own docs)
1. **Identity in three reads.** A place is recognised by its two or three strongest cues (the
   lightning, the big tree, the glowing pool). If those survive, the board "is" the card; if only
   the palette survives, it is a generic lawn/cave/hall.
2. **Value structure first.** Squint-test: the eye must land on the Actives; the landmark is the
   second read; the rest is fill. Mid-value everywhere = no hierarchy. Match the card's key
   (low-key night vs high-key day) before matching its hues.
3. **Colour discipline.** Few hues per scene, saturation reserved for the focal element, a warm/cool
   split for depth. Full-saturation fills read as placeholders.
4. **Light must have a source and sources must light.** Emissive things (crystals, pools, lamps,
   lava) tint and brighten what is near them; shadows agree on one sun.
5. **Shape language.** One family of forms per game (here: rounded, chunky, toy-like). Odd ones
   (low-poly prisms, tubes, thin lines) break the set.
6. **Repetition is the loudest procedural tell.** Same silhouette stamped at the same size and
   spacing reads as generated art; vary size, rotation, species, and cluster by rule of thirds.
7. **Detail budget.** ~70 % of the area at rest; patterns under cards low-contrast or absent.
8. **Compose for the real frame.** Roughly the right 24 % of the viewport is the chat panel; the
   visible board is the left three quarters.
9. **Scale honesty.** Props and cards share one scale; a tree smaller than a card is a bush.
10. **Material read.** Water looks wet, glass glossy, metal reflective, stone matte — from above too.

## Cross-cutting findings (ranked by how many boards they cost)
| # | Finding | Boards | Principle |
|---|---|---|---|
| 1 | **The card's key (dark/light) is often inverted or flattened.** Low-key night/storm cards became mid- or high-key boards: Stormy Mountains (storm → bright snow day), Dark City (navy night → light-grey roof), Old Cemetery (moonlit contrast → uniform murk), Magnetic Storm (aurora night → mottled brown). Brightness std-dev of the boards (0.14–0.26) is below the art's (0.18–0.31) on 21 of 25 — every board is flatter than its card. | 21 | 2 |
| 2 | **Hero cues are missing or demoted.** Lightning (Stormy), golden vitality light (Vitality), glowing rainbow pool (Mystery Garden), light shaft + translucent crystals (Crystal Cave), surf bands (Beach), lava falls (Magma Basin), aurora (Magnetic Storm), bright ring under spotlights (Fighting Stadium), the glowing trunk (Grand Tree), green orbs (Fairy Garden). The palette is right; the thing you would name is not there. | 14 | 1 |
| 3 | **Light sources that light nothing.** Crystals, pool, lamps, blue strips, lava, the pink force field: none brightens or tints the ground around it. Reads as stickers on a flat ground. | 12 | 4 |
| 4 | **Stamped scatter.** Identical ball-cluster trees (every nature board), headstones (Cemetery, ~40 same capsules), snow pines (Stormy), window grids (Dark City), flower specks (Fairy Garden), balloons (Mall), reeds (Storm). Same size, same orientation, even spacing. | 11 | 6 |
| 5 | **Landmarks cut away over the table.** Vitality's and Grand Tree's crowns are clipped to a trunk-top disc plus a huge soft shadow blob on the field; the shadow reads as a stain. Fix the rule, not the tree: let the crown overhang the table outside the card footprints and keep the shadow soft-edged and lighter, or move the tree off the table edge entirely. | 2 (the two hero trees) | 2, 9 |
| 6 | **Composition ignores the chat panel.** Symmetric layouts lose their right quarter; Vitality's hero tree stands under the panel; Beach's palms and Lumiose's trees cluster against it. Treat the visible rect as the canvas: landmarks top-left/left, props biased left. | all | 8 |
| 7 | **Flat full-saturation fills.** Dimension Valley's void and island, Brooklet's royal-blue lake, Vitality/Grand Tree's single green, Magma Basin's moat. No value patches, no warm/cool shift, hard-edged fills meeting = colouring-book look. | 6 | 3 |
| 8 | **Bright or busy pattern under/beside the hero cards.** Scorched Earth's lava river runs under the Actives and Stadium card; Magma Basin's rust bullseye and the moat beside piles; Levincia's yellow swirl under the Actives and yellow ring under both Benches; Mall's checker under everything; Pokémon Center's orange disc under the Actives. | 5 | 7 |
| 9 | **Props that break the shape family.** Mountain Ring's rope/chain (fat brown tubes, links the size of a card); Neutralization Zone's light pillars (opaque grey cones with a bright head: comets); Full Metal Lab's yellow railing (a thin wandering stroke); Dimension Valley's hex-prism islands; Fighting Stadium's beam lines and 4-point flares; Magnetic Storm's zig-zag bolts; Levincia's play-button billboards. | 7 | 5 |
| 10 | **Scale.** Kit props are a third of a card tall; balloons and chain links are card-sized; the giant trunk next to card-sized pines. Within one scene the scale should agree, and the cards should read as "cards on a diorama", not as buildings. | most nature boards | 9 |
| 11 | **Water never looks wet.** Beach, Brooklet, Levincia, Mystery Garden, Full Metal Lab's dais: flat blue fills with specks. No depth gradient, no highlights/reflection, no shore translucency. | 5 | 10 |
| 12 | **Scorched Earth is the only board with no scene past the table**; the table floats on black in both presets, while every other board runs into margins. It is also the only board in the TCG Live "sculpted facets" style rather than the BDSP clay style of the other 24. | 1 | 5 |
| 13 | **Two Grass boards are near-duplicates.** Forest of Vitality and Grand Tree are both "flat green lawn + one clipped tree + ball bushes". The cards differ sharply (airy sunlit grove vs. dense jungle round a golden trunk). | 2 | 1 |

## Per-board scorecard
Art = how much of the card's identity survives · Value = key/contrast vs the card · Read = card readability on the board · Craft = procedural/AI tells (A none → D many).

| Board | Art | Value | Read | Craft | What the card shows that the board does not | One fix with the best return |
|---|---|---|---|---|---|---|
| Forest of Vitality | C | C | A | C | one dominant broadleaf, golden light pooling under it, warm/cool depth | let the crown overhang (clip only card footprints); a warm yellow-green light pool under it; vary the bush trees |
| Grand Tree | C | C | A | C | lush jungle density, roots over everything, golden veins glowing | darken the clearing's edges with undergrowth, make the gold veins emissive and let them tint the roots and grass |
| Perilous Jungle | B | B | A | B | tall violet trunks with crowns; pink-fringed vines | give trees a trunk + crown read instead of grape clusters; drop the dark stain near the Bench |
| Fairy Garden | B | C | A | C | a continuous lavender flower carpet with a soft glow; green orbs | replace the white-speck scatter with a soft pale carpet (texture, not sprites); make the orbs visible and let them glow |
| Mystery Garden | B | C | A | B | the glowing cyan pool with rainbow rings — the hero | emissive pool: cyan core, rainbow rings, a glow that tints the inner paving |
| Old Cemetery | C | D | A | D | moonlight: pale lit tufts vs dark; headstones with flat faces; the moon | halve the headstones, give them a flat face and a base, one moon direction with pale rim light on the grass |
| Surfing Beach | B | B | A | B | turquoise shallows, parallel foam bands, translucent water | shallows gradient (teal → deep), 2–3 breaker bands, wet-sand reflection |
| Brooklet Hill | B | B | C | B | teal-cyan sparkling lake; cliffs with waterfalls | shift the lake to teal/cyan with depth and sparkle (blue card backs currently sink into it); soften the fill borders |
| Stormy Mountains | D | D | A | B | storm, lightning, dark rock, the glowing gold emblem | low-key: dark slate rock and cloud, the emblem emissive (the one bright thing), occasional lightning flash in the drift |
| Mountain Ring | C | C | A | D | rough tall menhirs with thick rope; sky and distance | redraw the rope at prop scale (thin, sagging), menhirs as rough slabs, a real Poké Ball in the centre stone |
| Crystal Cave | B | C | A | B | a shaft of skylight; translucent glowing crystals | emissive crystals that light the floor; a light pool centre with darker periphery (vignette) |
| Dimension Valley | D | D | B | D | irregular earth slabs, a soft rainbow void, white sparkle streams | desaturate the void by half with soft colour bands; irregular rounded slabs; remove the pink ring + cross or make it stone |
| Magnetic Storm | D | D | A | D | green–violet aurora sheets, reeds, bare trees, wet mud | aurora as soft moving colour bands over a dark ground (not noise blobs); bolts as glow, not zig-zag lines |
| Scorched Earth | B | B | B | B | lava river flowing across dark slope | add scene margins like every other board; route the river off the Actives/Stadium card; adopt the BDSP clay shading |
| Magma Basin | B | B | B | B | lava falls down crimson cliffs; subtle embossed emblem | lava falls on the walls; narrow and darken the moat; replace the rust bullseye with an embossed low-contrast emblem |
| Lumiose City | C | B | A | B | warm cream stone, mansard roofs, Prism Tower, blue sky | warm the paving/buildings to cream; a readable Prism Tower silhouette (tall, tapered, lit) top-left; one sun with long tree shadows |
| Community Center | D | C | A | B | white hall with red roof band and green banner; blue sky; mountains | show the hall's red band and green banner from above; warm the slabs; keep the pond/cliff |
| Levincia | B | B | B | C | glass towers, LED billboards, plank walkway | pull the yellow swirl out from under the Actives (or fade it to 20 %); billboards as upright boards with abstract LED patterns, not play icons |
| Dark City | C | D | A | C | navy night, warm windows, round tower's lit crown, searchlights | darken the roof to night values; warm sparse windows (not every cell lit); the round tower's lit crown as the landmark |
| Pokémon Center | B | B | B | B | (interior by request) the lobby's orange/cream | lighten the orange disc under the Actives to a tile inlay; furniture as rounded solids |
| Shopping Center | B | B | B | B | pastel balloons (yellow/pink/blue), clothes racks, mannequins | shrink the checker or fade it near cards; balloons to the art's pastels; racks as rounded tables with cloth |
| Full Metal Lab | B | B | A | B | overhead lens lighting the dais; chrome | light the dais from the centre (bright core, dark rim); railing as a solid rail with posts; chrome gloss on tanks |
| Fighting Stadium | B | C | A | C | brilliant white canvas under spotlights, dark arena | brighten the canvas to white with a soft light pool; beams as soft volumetric wedges; crowd as soft colour noise, not a dot grid |
| Neutralization Zone | B | B | A | C | vertical columns of light; glossy platform; green screens | pillars as bright discs with halos and a fading vertical glow, not grey cones; a gloss highlight band on the platform |
| Steel Shelter | B | C | A | B | high-key white, mirror floor | lift to white/pale grey with a soft floor reflection of the hex ceiling; blue strips that light the floor edge |

## Per-board detail
Each entry: the card's identity cues · what the board does now (both presets) · what works · what
fails (yardstick in brackets) · suggestions in order of return. Colour values are starting points
for lookdev, not specs. "Contact glow" means an emissive object brightening and tinting the ground
within about one card-width of it.

### Forest of Vitality — MEG 117, Ayumi Odashima · `stadium-env-vitality.mjs`
**Card.** A sunlit grove: a few huge broadleafs with wide, flat, umbrella crowns on stout trunks;
a yellow-green glow of vitality pooling on the ground beneath them like mist; warm gold foreground
against a cool blue-green distance and a blue sky with soft clouds.
**Board now.** One saturated green across the whole table. The hero tree stands at the top right,
under the chat panel in tcgl; over the table its crown is clipped away, leaving a brown trunk-top
disc and a huge soft dark blob on the field. Fifteen-odd identical ball-cluster trees line the left
edge. Flower beds, red toadstools and faint clover marks dot the grass.
**Works.** The field is calm; cards read perfectly. The flower beds are a good scale and colour.
**Fails.** The clipped crown and its shadow read as a stump and a stain [2, 9]. One hue, one value:
no warm/cool depth, no golden light, so the "vitality" is gone [1, 3]. The bush trees are one
silhouette stamped at one size [6]. The landmark sits under the panel [8]. Toadstools are not on
the card and pull the eye.
**Suggestions.**
1. Move the hero tree to the top-left margin and let its crown overhang the table, clipping only
   card footprints and the opponent's hand; cast a lighter, soft-edged, dappled shadow (two tones)
   rather than one dark blob.
2. A warm light pool: yellow-green (#d9e86a at ~35 % over the grass) under and around the tree,
   fading out over about two card-widths, with a slow breathing drift of pale motes inside it.
3. Grade the ground warm → cool from the tree outward (grass #86c45a near it, #5fa36a at the far
   edge); the depth the card has.
4. Two or three tree silhouettes: the card's flat-topped broadleaf (wide crown, visible trunk) at
   two sizes plus a low bush; cluster them in threes and fives, not a row.
5. Remove the toadstools; keep the flower beds and pull them to the light pool's rim.

### Grand Tree — SCR 136, Ayumi Odashima · `stadium-env-grandtree.mjs`
**Card.** One vast tree whose trunk is a knot of twisting strands veined with glowing gold, roots
crawling over the ground, a broad green crown, dense jungle foliage closing round a bright
clearing, sun rays through the canopy.
**Board now.** A flat lawn (a touch darker than Vitality's) with the tree at the top left: a crown
of leafy balls, brown roots radiating across the grass, a few gold dots, star-shaped fern sprites,
small bushes, falling leaf specks. In tcgl the crown is a large cluster that stops at the table.
**Works.** The roots across the ground are the best single landmark idea on the nature boards.
**Fails.** It is Vitality again: lawn plus one clipped tree plus ball bushes [1]. The jungle is
missing; the clearing has no edge, so it is a field, not a clearing [1, 7]. The gold veins, the
card's identity, are dots that emit nothing [4]. Flat single-value green [2].
**Suggestions.**
1. Jungle density at the margins: a band of big-leaf plants, ferns and bushes round the table edge,
   two or three sizes, so the open middle reads as a clearing.
2. Make the gold veins emissive (warm #ffcf5a with bloom) along the roots and up the trunk, with
   contact glow on the grass beside each root.
3. The trunk as a bundle of twisted tubes (four to six strands) so it reads as the card's knot.
4. Overhang the crown as for Vitality; one warm sun from the top-left with long soft root shadows.
5. Separate it from Vitality by hue and ground: warmer, more contrasty yellow-green, a mossy
   soil-and-grass ground rather than a lawn.

### Perilous Jungle — TEF 156, Ayumi Odashima · `stadium-env-forest.mjs`
**Card.** A violet-magenta jungle: tall violet trunks carrying deep teal crowns, hanging vines,
pink-fringed leaves, bogs of glowing pink poison, mist, deep saturation.
**Board now.** A teal clearing with two large pink poison pools (glow, rings, bubbles), violet
lumpy "grape cluster" trees, teal lumpy bushes, cel-shaded star-leaf sprites around the edges, a
dark vignette, a soft dark stain beside the Bench.
**Works.** The best mood and palette match of the 25. The pools read as toxic and glow. The
star-leaf sprites are a real identity touch.
**Fails.** Trees have no trunk-and-crown read; they are bubble piles [5]. The clearing is one flat
teal with a smudge near the Bench [2, 7]. No vines [1]. The pools do not tint the ground around
them [4].
**Suggestions.**
1. Trees: a tall violet trunk with the crown held high, two-tone (deep teal body, pink-tipped
   fringe); three heights. Vines as sagging curves from crown to ground at the edges.
2. Contact glow from the pools: pink (#ff5fd0) over the teal within a card-width, fading.
3. Ground: mossy teal with darker wet patches toward the pools, lighter toward the middle; remove
   or lighten the stain near the Bench.
4. A thin pink mist drift at the margins (never over the cards).

### Fairy Garden — FCO 100, Ryo Ueda · `stadium-env-fairy.mjs`
**Card.** A night clearing: one continuous carpet of small pale lavender flowers with a bluish
glow, a ring of pale light round a patch of green grass at the centre, dark trees closing in, green
orbs of light floating in the dark.
**Board now.** A dark teal ground with a white ring of light around the Actives, white-pink flower
sprites strewn everywhere, dark ball trees, star-leaf sprites, faint green orbs.
**Works.** The ring of light is the card's centre and reads. Dark ground makes every card pop.
**Fails.** The flowers are a confetti scatter of white specks, not a carpet [6, 7]. The orbs are
too faint to count [1, 4]. The ground is murky with no gradient [2]. Ball trees again [6].
**Suggestions.**
1. Flowers as a ground shader, not sprites: a dense low-contrast lavender carpet (#b9a6e0 over
   #3b4a63) with a faint glow and a few brighter blossoms; fade it to grass inside the ring.
2. Five to eight green orbs (#8df28a) as soft emissive spheres with halos, drifting slowly, each
   with contact glow on the carpet beneath.
3. Value gradient: lighter inside the ring, darker to the edges; trees as near-black silhouettes
   with a thin cool rim.
4. The inner grass patch a clear lighter green so the ring encloses something.

### Mystery Garden — MEG 122, Ayumi Odashima · `stadium-env-garden.mjs`
**Card.** A formal night garden: a round plaza of lavender flagstone rings round a pool that glows
cyan and swirls in rainbow rings, crackling with light; two steps up; stone urns on pedestals;
pink-purple lanterns; dark trees. The pool is the picture.
**Board now.** Concentric brick rings in lavender fill the table; a flat teal pool disc under the
Actives; dark teal ball trees with pink blossom specks outside; lanterns as tiny grey posts.
**Works.** The plan is right: rings, pool, garden round it. The night palette is right.
**Fails.** The pool is a dull disc: no glow, no rainbow, no crackle [1, 4]. Everything is one
mid-value purple-grey; no hierarchy [2]. Bricks run under every card at a constant contrast [7].
Lanterns and urns are too small to count [9].
**Suggestions.**
1. The pool emissive: cyan core (#5ff0ff), slow rainbow rings rotating outward, occasional soft
   light streaks (not bolts); contact glow that tints the inner two paving rings.
2. Vignette: bright centre, dark rim; drop the brick contrast under the Bench rows by half.
3. Lanterns at prop scale with warm pink glow pools; urns on pedestals at the four axes; the two
   steps as two lighter stone rings.
4. Trees as taller dark silhouettes; blossoms as a few soft pink clumps, not specks.

### Old Cemetery — CRE 147, Oswaldo Kato · `stadium-env-cemetery.mjs`
**Card.** Moonlit: a crescent moon low in the sky; dark teal grass with tufts lit pale
yellow-green; a worn earth path; pale teal headstones with rounded tops and flat faces, leaning;
a stone cross; dark pines; a boulder.
**Board now.** Dark teal ground under a milky haze; a brown earth path (good); some forty pale
capsule-shaped headstones in an even scatter, each with a long soft shadow; tiny bushes; a boulder;
a cross; no moon, no visible light direction.
**Works.** The path. The dark field for the cards.
**Fails.** Headstones read as pills lying about: no face, no base, same shape forty times [5, 6].
No moonlight: the card's contrast between lit tufts and dark grass is replaced by a flat murk with
a blur-like haze [2, 4]. Density far past the card's.
**Suggestions.**
1. Headstones as slabs: a flat front face, a rounded top, a base, random lean and yaw; ten to
   fifteen in three or four family groups along the path.
2. One cool moon key from the top-left: pale rim light on headstone tops and grass tufts
   (#c8e6a0), shadows all one way.
3. Replace the global haze with low ground-fog bands near the margins only.
4. Pines as dark silhouettes at the far edge; the boulder and cross kept.

### Surfing Beach — MEG 129, Ayumi Odashima · `stadium-env-beach.mjs`
**Card.** A sunny bay from above: the sea at the far-left corner rolling in, parallel foam
breakers, turquoise shallows into deep blue, golden sand, rocks at the waterline, palms.
**Board now.** A diagonal shoreline (sea top-left), a flat saturated royal-blue sea with one foam
line, flat peach sand with faint ripples, toy palms (clustered against the panel in tilt12),
parasols, pebbles, tufts, small shore rocks.
**Works.** The diagonal composition; palm shapes; a calm sand field. One of the better boards.
**Fails.** The surf, the card's whole subject, is missing: no shallows, no breaker bands, no
translucency [1, 10]. Sand is one flat tone [2]. Palms crowd the panel edge [8].
**Suggestions.**
1. Water in three zones: a wet-sand reflective band, turquoise shallows (#6cd3e8), deep blue
   (#2a6fd6); two or three foam bands parallel to the shore moving slowly shoreward; sparkle only
   in the deep zone.
2. Sand: lighter dry sand, darker wet sand, a soft tide line.
3. Shore rocks as larger lumpy clusters where the card has them; palms three or four, two sizes,
   biased top-left; at most one parasol.

### Brooklet Hill — GRI 120, 5ban Graphics · `stadium-env-brooklet.mjs`
**Card.** A teal-cyan lake sparkling in sun, cliffs behind with waterfalls, trees above, a wooden
pier at the right.
**Board now.** A royal-blue lake under every card, stone-ring pools with waterfalls on the left,
a pier on the right, sandy shores, a dirt path, flat green grass, ball trees.
**Works.** The pools, waterfalls and pier are the right landmarks. The lake-under-every-card idea
holds.
**Fails.** The lake's hue: the blue card backs (deck, prizes, opponent's hand) sink into it; the
only board where the ground hurts a card class [2, 10]. Three flat fills (blue, tan, green)
meeting at hard edges: a map, not a place [3]. The pools are identical stacked rings [6].
**Suggestions.**
1. Lake to teal-cyan (#3fb9d6) lighter at the shores (shallows), darker in the middle, with sun
   sparkle concentrated top-left: card backs separate at once.
2. Soft shore transitions: a wet-sand band and faint foam; grass fringe over the sand.
3. Pools of two or three sizes with rock rims and strata cliff faces rather than equal rings.
4. Vary the trees; add the card's cliffs along the far margin.

### Stormy Mountains — EVS 161, Toyste Beach · `stadium-env-highland.mjs`
**Card.** Low-key: a dark blue-grey mountain in a storm, lightning forking down, the crater floor
holding a glowing gold Poké Ball emblem that is the one bright thing, cloud below, asymmetric
peaks.
**Board now.** High-key: a pale blue cottony cloud sea, a snow-capped grey-blue crater rim of even
width, a warm flat grey floor, a thin yellow emblem line, tiny repeated snow pines and boulders.
**Works.** The circular crater and clean floor make it the most readable board.
**Fails.** The key is inverted: a serene snow day for a storm card [2]. No lightning, no glow: the
two identity cues are gone [1, 4]. The even ring reads as a donut; the pines are one stamp [5, 6].
**Suggestions.**
1. Re-key: slate rock (#3a4756), a darker blue-grey cloud sea with lighter tops, a dark floor.
2. The emblem as the single emissive: gold glow with a soft halo on the floor between the Actives
   and the Benches.
3. Lightning as a rare event (one flash per 10–20 s, off under reduced motion): a brief cool
   sky-light pulse over the whole plate plus a branching bright line near the rim, never over the
   cards.
4. Asymmetry: a taller right summit with its ridge; a painted far peak on the cloud sea beyond the
   far edge; snow only as rim caps.

### Mountain Ring — FFI 97, Ryo Ueda · `stadium-env-ring.mjs`
**Card.** A round highland arena: rows of grey-brown bricks round a pale stone Poké Ball; tall
rough standing stones ringing it, thick ropes slung between them; overcast mountains behind.
**Board now.** A grey brick court, menhirs as faceted white eggs, the rope drawn as fat dark-brown
tubes with giant chain links (card-sized), dark rock outcrops, a flat grey emblem disc.
**Works.** The plan: court, stones, centre mark. The muted palette.
**Fails.** The rope/chain is the worst single prop on any board: wrong scale, wrong material,
loops like a lasso [5, 9]. Menhirs lack the card's rough slab shape [5]. The emblem is a blank
disc [1]. No focal value: the dreariest board [2].
**Suggestions.**
1. Ropes as thin sagging catenaries (about a twentieth of a card's width) with one knot per post;
   or the chain at link scale under a tenth of a card.
2. Menhirs as tall irregular slabs (five to seven sides, strata, lighter tops), leaning slightly.
3. A real Poké Ball inlay in two stone tones at the centre.
4. A warmer centre and cooler edges; low mountain silhouettes on the far margin; brick contrast
   reduced under the cards.

### Crystal Cave — EVS 144, Toyste Beach · `stadium-env-crystal.mjs`
**Card.** A warm brown cave under one shaft of pale skylight; a glowing gold circle on the floor;
tall hexagonal crystal clusters in pink, sky blue, mint and peach, translucent and glowing; a dark
periphery.
**Board now.** Rounded cobbles across the whole floor, opaque pastel faceted crystal clusters at
the margins (good silhouettes, right hues), no light shaft, an even brown value, a thin gold
emblem ring.
**Works.** Crystal shapes, clustering and colours. Readability.
**Fails.** Crystals neither glow nor let light through, and they light nothing [4, 10]. No shaft,
so no focal point; cobbles everywhere at one value [2, 7].
**Suggestions.**
1. Crystals: a brighter tint toward the tip, darker base, an emissive core with bloom; each
   cluster tints the floor around it with its colour.
2. The skylight shaft as a soft ellipse of light on the floor around the Actives; a vignette to
   near-dark at the edges; cobbles fading to smooth dark floor away from the centre.
3. The emblem as a glowing gold inlay with a pale-blue heart, as on the card.
4. Fewer, larger clusters; sparkle motes only inside the shaft.

### Dimension Valley — PHF 93, Ryo Ueda · `stadium-env-dimension.mjs`
**Card.** Irregular grass-topped earth slabs with layered sides floating in a void that grades
softly from red and orange on the left through green to violet on the right; streams of white
sparkle; scattered pastel flowers and orbs.
**Board now.** A hard-edged flat green island with a thick pink ring and cross, a raw
full-saturation rainbow smear for the void, small low-poly hexagonal prism islands, flowers as flat
coloured discs.
**Works.** The island-in-a-void idea is the right reading of the card.
**Fails.** Everything is at maximum saturation with no neutral rest; the yellow hand cards fight
the yellow void [3]. The pink ring and cross are not on the card and are the loudest thing [1].
Hex prisms break the rounded shape family and the card's slabs [5]. The flattest craft of the 25.
**Suggestions.**
1. The void at about half its saturation, soft nebula bands with a dark base; keep the left-warm,
   right-cool order.
2. Slabs as irregular rounded polygons with strata sides (the kit's strata), three tiers of size;
   the main island with an irregular grass-fringed edge and a visible earth side.
3. Replace the pink ring/cross with a subtle lighter-grass ring.
4. Flowers as small pastel clumps (the kit's flower bed), not discs; sparkle streams as slow soft
   drift bands across the void, never over the cards.

### Magnetic Storm — FLF 91, Ryo Ueda · `stadium-env-storm.mjs`
**Card.** A marsh at night under sheets of green and violet aurora; dry olive reeds, wet black
mud, bare gnarled trees against dark hills; a Poké Ball glowing pink and white on the ground with
pink lightning round it.
**Board now.** A mottled brown-purple-grey ground (noise blobs), a neon pink ring (the force field)
round the Actives, bare black trees, white zig-zag bolts rising from grey coil towers, pink nodes,
tan reed tufts in an even scatter, cyan and pink speckles.
**Works.** The bare black trees. The pink ring is a defensible reading of the force field.
**Fails.** The ground is the weakest texture on any board: noise used as material [6, 7]. The
aurora, the card's identity, is absent [1]. Bolts are clip-art zig-zags; coils read as grey
cylinders [5, 9]. No hierarchy of value [2].
**Suggestions.**
1. Ground: near-black wet mud (#1c1a24) with puddles; put the colour in the puddles as aurora
   reflections.
2. Aurora as slow, soft green/violet light bands cast over the ground (a low-frequency animated
   tint), not drawn as sky.
3. Force field: keep the ring, add a ground glow and a faint dome edge; bolts as soft branching
   glows with a bright core, brief and rare.
4. Reeds in clumps at the margins in dry olive; coil towers with a pink top light.

### Scorched Earth — PRC 138, Ryo Ueda · `stadium-env-volcanic.mjs`
**Card.** A dark basalt slope with a wide bright lava river flowing diagonally across it, glow on
the surrounding rock, a dark sky.
**Board now.** Chunky faceted grey-brown stones with a web of lava cracks, a wide lava river along
the seam between the players running under the Stadium card and beside the Actives, a small
volcano at the left. No scene past the table: the board floats on black in both presets.
**Works.** The palette; the stone sculpting is confident; the river is a strong shape.
**Fails.** The brightest element sits under the hero cards [7]. The missing margins make it the
only board whose world ends at the table edge [8]. The faceted TCG Live style sits apart from the
other 24 boards' soft clay shading [5]. Cracks everywhere: no rest area [7].
**Suggestions.**
1. Add scene margins like every other board.
2. Route the open river through the free band left of the Stadium and out to the margins; under
   the cards, cooled dark crust with a few dim cracks.
3. Light the stones with the kit's soft wrapped key and lump creases so it joins the set.
4. Keep the volcano as the top-left landmark; concentrate cracks near the river and fade them
   toward the Benches.

### Magma Basin — BRS 144, ORBITALLINK · `stadium-env-magma.mjs`
**Card.** Crimson volcanic cliffs with lava pouring down their faces in falls into a golden moat
that rings an island of dark rock; a subtle dark emblem set in the island; strong dark-vs-bright
contrast.
**Board now.** A brown cobbled island, a large rust-orange bullseye under the Actives, a wide
near-flat bright-orange moat on both sides with faint streaks, crimson walls at the top.
**Works.** The palette and the moat-ringing-an-island plan; good contrast between island and lava.
**Fails.** The lava falls, the identity, are missing [1]. The moat is the brightest thing on
screen, wide and flat, right beside the Benches and piles [2, 7]. The emblem reads as a washer or
a vinyl record under the hero cards [7]. Cobbles are uniform [7].
**Suggestions.**
1. Lava falls as bright vertical streaks on the wall band with bloom, feeding the moat.
2. Moat narrower, with a dark crust at its edges and a bright slow channel in the middle; contact
   glow on the island's rim.
3. The emblem as a low-contrast embossed ring in two near values with a faint heat glow.
4. The island as dark basalt lumps, the cobble pattern faded under the cards.

### Lumiose City — POR 77, Marina Chikazawa · `stadium-env-lumiose.mjs`
**Card.** A Parisian boulevard on a bright day: cream stone buildings with mansard roofs and
balconies, the white lattice Prism Tower at the vanishing point, trees in a central reservation,
street lamps, a café awning, a Pokémon Center sign, blue sky.
**Board now.** A cool grey plaza with a faint compass inlay, green planters with flowers, lamps
with three globes, ball trees along the right, two café parasols, buildings round the edges with
faceted roofs; the Prism Tower lattice appears top-left in tilt12 and lies across the left of the
plaza in tcgl.
**Works.** Lamps and planters are the right scale and the right props. The plaza is calm.
**Fails.** The warmth is gone: cream stone and blue sky became grey on grey [3]. The tower is
unreadable from above and in tcgl looks like a fallen pylon [1, 9]. No sun: tiny shadows [4].
Roofs as grey pyramids do not say Lumiose [1].
**Suggestions.**
1. Warm the stone (cream #e8dcc3) and the paving (warm light grey with a darker sett band); the
   compass inlay at 15–20 % contrast so it reads.
2. The Prism Tower as a tall white tapered silhouette standing at the top-left margin, lit, its
   long shadow across the plaza; never laid flat in the square.
3. One sun from the top-left with long soft tree and lamp shadows.
4. Mansard roofs in blue-grey with dormers; the café awning stripes at one corner; the Pokémon
   Center's red roof and blade sign as a second landmark.

### Community Center — TWM 146, Marina Chikazawa · `stadium-env-community.mjs`
**Card.** A sunny white two-storey hall with a red-brown roof band and rail, a tall green banner
down its face, a green flag, a red-awninged door, a white pop-up tent, trees, mountains, blue sky.
**Board now.** A large light-grey slab plaza holding every card; the hall as a dark grey roof block
with skylights; a small flag; a white tent with red and green stripes; flat green grass; ball
trees; a pond, waterfall and rocky cliff at the top-left (tcgl).
**Works.** The tent. The pond and cliff corner.
**Fails.** From above the hall is a warehouse roof; its identity (white walls, red band, green
banner) is invisible [1]. Grey slabs and flat green: no warmth, no sun [2, 3]. Reads as a car park.
**Suggestions.**
1. Paint the roof terracotta/red-brown with a white parapet; hang the green banner down the near
   face so it shows from above; the red awning at the door.
2. Warmer, smaller paving slabs; clover grass with flower beds; crisp soft shadows from one sun.
3. The tent larger with the stripes facing up; mountains along the far margin.

### Levincia — JTG 150, Marina Chikazawa · `stadium-env-levincia.mjs`
**Card.** A bright city on the water at noon: a round stage of pale-blue panels ringed by a yellow
mosaic band with a yellow swirl at its middle, curved white-and-blue glass towers, LED billboards
in yellow and pink, a plank walkway, light-blue water.
**Board now.** Concentric pale-blue rings, the yellow ring and swirl, light-blue water, flat pink
and white billboards with play-button icons scattered on the rim (lying in the water in tcgl), pale
tower blobs at the top.
**Works.** Palette and plan are close to the card; it is sunny and clean.
**Fails.** The saturated yellow swirl runs under the Actives and the Stadium card, and the yellow
ring under both Benches [7]. Billboards read as media-player chips [9]. Towers unreadable; water
flat [10].
**Suggestions.**
1. Fade the swirl to about a quarter of its contrast under the cards, or recentre it so its bright
   arm misses the Actives' footprint.
2. Billboards as upright boards along the rim with abstract LED gradients (yellow, pink, cyan)
   scrolling slowly.
3. Towers as tall pale glass prisms at the top margin with one bright vertical highlight each;
   water with tower reflections as streaks and sparkle.

### Dark City — UNM 193, Ryo Ueda · `stadium-env-city.mjs`
**Card.** Night from a rooftop: office towers with warm lit window grids, a round tower with a lit
crown, Team Skull's sprayed marks, searchlights, navy and black with purple-pink accents.
**Board now.** A light-grey roof with a red parapet line, AC boxes in tidy rows, towers around with
uniform lime-green window checkerboards, a round tower top-left, a purple X and red scrawl as
graffiti, thin grey beams.
**Works.** The tilt12 composition: towers ringing the roof, the round tower as a landmark.
**Fails.** The key is wrong: a light-grey roof for a night card [2]. Every window cell lit in lime
reads sickly and stamped [3, 6]. Graffiti crude; beams are lines [9]. AC units in parade rows [6].
**Suggestions.**
1. Re-key: roof #2a3040, towers near-black, windows warm yellow at about 30 % lit density with
   dark floors.
2. The round tower's crown as a warm emissive ring (contact glow on its roof), the board's
   landmark.
3. Searchlights as soft volumetric wedges sweeping slowly; a faint purple horizon glow.
4. Graffiti as the card's pink/purple skull marks, cleaner, on two walls; AC units in irregular
   groups.

### Pokémon Center — interior by request (card NXD 90 shows the exterior) · `stadium-env-pokecenter.mjs`
**Reference.** The games' lobby: cream and peach tiles, orange trim, the nurse's counter, PCs, a
healing machine, sofas, potted plants.
**Board now.** A cream/peach checker floor, an orange border, a large orange disc with a Poké Ball
under the Actives, a pink-red counter at the left, blue PCs, a red-framed sofa area, plants, shelves.
**Works.** Coherent, warm, and readable; the plan is a lobby.
**Fails.** The orange disc is a heavy saturated shape under the hero cards [7]. Furniture is flat
coloured rectangles [5]. The checker runs under everything [7].
**Suggestions.**
1. The central Poké Ball as a two-tone cream/peach tile inlay with orange only as a thin ring.
2. Halve the checker contrast near cards.
3. Furniture as rounded solids with soft shadows: sofas, a table with a plant, the healing machine
   behind the counter, a doormat at the entrance.
4. A warm interior key with soft falloff toward the walls.

### Shopping Center — EVS 157, Oswaldo Kato · `stadium-env-shopping.mjs`
**Card.** A pink-and-white mall hall: a glossy pink checker floor with a gold ring, tables of
folded clothes and racks, mannequins in yellow and pink, balloons in yellow, pink, blue and white,
pastel light.
**Board now.** A bold pink checker across the table, a thick gold ring under the Actives, pastel
grid boxes as racks, balloon bunches in purple, green, orange and yellow, tiny pink mannequins,
pink walls.
**Works.** Palette and plan: it is a pink mall at a glance. Toy scale suits the goal.
**Fails.** The checker is the busiest ground of the 25 and runs under every card; tilted, it is a
moiré risk [7]. Balloon hues are not the card's [3]. Racks read as plastic bricks [5].
**Suggestions.**
1. Checker at about 40 % of its contrast with larger squares; a soft gloss highlight band across
   the floor (the card's shine).
2. Balloons in yellow, pink, blue and white, in bunches at the corners, strings visible.
3. Racks as rounded tables with stacks of folded cloth in two or three pastels; taller mannequins
   in yellow and pink dresses.
4. The gold ring as a slightly textured mosaic at lower saturation.

### Full Metal Lab — TEF 148, Ayumi Odashima · `stadium-env-lab.mjs`
**Card.** A round steel lab: a raised navy dais with a cyan circle lit by a lens overhead, chrome
pipes and tanks, yellow railings, a blue-green tint.
**Board now.** A navy disc with a white circle, pale panelled floor, grey cylinder tanks, pipes, a
thin wandering yellow railing stroke, a stair piece.
**Works.** The plan; stairs and pipes; readability.
**Fails.** The dais is flat: the overhead light that defines the card is missing [1, 4]. The
railing is a scribble [9]. Tanks have no chrome [10].
**Suggestions.**
1. Light the dais from its centre: a bright cyan core under the Actives fading to dark navy at the
   rim; the white circle emissive with a faint caustic ring.
2. The railing as a solid double rail with evenly spaced posts in muted yellow (#d8b43c), on the
   dais edge only.
3. Tanks with one bright vertical specular stripe and dark seams; a cool teal fill light.

### Fighting Stadium — FFI 90, Ryo Ueda · `stadium-env-arena.mjs`
**Card.** A wrestling ring in a dark arena at night: the canvas brilliant white-cyan under
spotlights, the one bright object; red, white and blue ropes; crowd lights; teal dark.
**Board now.** A dull grey-blue canvas with a circle, blue ropes and posts, an apron of orange,
blue and white panels, dark teal surround, thin crossing white beam lines, four-point lens flares,
a crowd as a dot grid.
**Works.** The ring's size and square; apron and posts; readability.
**Fails.** The focal point lost its light: the canvas is mid-grey [2]. Beams are scratches,
flares are the sunburst cliché, the crowd is a visible grid [6, 9].
**Suggestions.**
1. Canvas near-white with a soft spotlight pool brightest at the centre; ropes in the card's
   red, white and blue.
2. Spotlights as three or four soft volumetric wedges from the corners, low opacity, slow sweep,
   a halo at each source, no star flares.
3. Crowd as a soft dark texture with sparse warm pinpoints in irregular density; the floor beyond
   the ring dark.

### Neutralization Zone — SFA 60, imoniii · `stadium-env-neutral.mjs`
**Card.** A round hall of pale-blue panels; a glossy blue platform; rings of white-cyan light in
the floor; tall columns of blue light standing round it; green-lit floating screens; high-key cyan.
**Board now.** Concentric pale-blue rings, a navy tiled surround, light columns drawn as diagonal
grey cones with a bright head (comets), a yellow outer ring, no screens, no gloss.
**Works.** Calm two-tone blue; the ring plan; readability.
**Fails.** The columns are the wrong shape for a top-down view [5, 9]. Nothing is emissive or
glossy on a card that is all light and gloss [4, 10]. Screens, a key cue, are missing [1].
**Suggestions.**
1. Columns as a bright white-cyan disc with a halo at the base plus a tall translucent additive
   cylinder fading upward; six to eight round the rim.
2. Floor rings as emissive lines with bloom; a broad soft specular streak across the platform.
3. A few small green emissive screens floating above the rim.
4. Walls pale blue as on the card, the navy kept only for the far floor.

### Steel Shelter — PHF 105, Ryo Ueda · `stadium-env-shelter.mjs`
**Card.** A high-key white hall: hexagonal ceiling light panels mirrored in a glossy pale floor, a
blue emblem glow at the centre, near-monochrome white and pale grey with cyan.
**Board now.** A mid-grey matte floor with faint hex lines, large hexagonal door panels left and
right, thin blue strips along the walls, blue emblem rings, a few tiny props.
**Works.** The plan is faithful: doors, strips, emblem. Calm and readable.
**Fails.** Mid-grey matte for a white mirror hall: it reads as a concrete bunker [2, 10]. The blue
strips light nothing [4].
**Suggestions.**
1. Floor to pale (#dfe3e8) with a low-contrast reflection of the hex ceiling (pale hexes with
   bright centres).
2. The emblem's blue as a soft glow pool; the strips with contact glow on the floor edge.
3. Walls lighter than the floor's reflections; door frames lighter with a darker inset.

## What already works (keep)
- Readability: on 22 of 25 boards the cards win the squint test; the calm-field rule is doing its job.
- Compositional ideas that read: Beach's diagonal shore, Brooklet's pools and pier, Lab's stairs and
  pipes, Lumiose's lamps and planters, Jungle's pink pools, Fairy Garden's ring of light, Mystery
  Garden's ring plan, Pokémon Center's lobby plan, Dark City's tower ring (tilt12).
- Palette fidelity: Jungle, Levincia, Mall, Pokémon Center, Magma Basin and Scorched Earth are
  recognisably their card's hues.

## Measurements (HSB over the visible board, cards included; art over the illustration window)
Saturation / brightness / brightness std-dev. Boards are consistently flatter (lower std-dev) than
their cards; the night boards are brighter than their cards.

| Board | board S/B/σ | art S/B/σ |
|---|---|---|
| brooklet-hill | 0.63 / 0.68 / 0.17 | 0.52 / 0.70 / 0.21 |
| community-center | 0.32 / 0.66 / 0.17 | 0.23 / 0.79 / 0.18 |
| crystal-cave | 0.47 / 0.51 / 0.20 | 0.33 / 0.58 / 0.25 |
| dark-city | 0.32 / 0.46 / 0.22 | 0.30 / 0.38 / 0.24 |
| dimension-valley | 0.68 / 0.54 / 0.19 | 0.44 / 0.52 / 0.21 |
| fairy-garden | 0.59 / 0.41 / 0.24 | 0.29 / 0.62 / 0.31 |
| fighting-stadium | 0.40 / 0.67 / 0.22 | 0.65 / 0.52 / 0.28 |
| forest-of-vitality | 0.57 / 0.61 / 0.18 | 0.54 / 0.69 / 0.19 |
| full-metal-lab | 0.37 / 0.66 / 0.16 | 0.30 / 0.61 / 0.27 |
| grand-tree | 0.56 / 0.62 / 0.14 | 0.64 / 0.68 / 0.25 |
| levincia | 0.28 / 0.81 / 0.15 | 0.39 / 0.83 / 0.15 |
| lumiose-city | 0.22 / 0.64 / 0.16 | 0.25 / 0.73 / 0.23 |
| magma-basin | 0.54 / 0.62 / 0.26 | 0.56 / 0.49 / 0.30 |
| magnetic-storm | 0.26 / 0.38 / 0.24 | 0.28 / 0.58 / 0.31 |
| mountain-ring | 0.22 / 0.56 / 0.17 | 0.16 / 0.53 / 0.18 |
| mystery-garden | 0.43 / 0.64 / 0.17 | 0.52 / 0.63 / 0.23 |
| neutralization-zone | 0.42 / 0.66 / 0.19 | 0.50 / 0.80 / 0.19 |
| old-cemetery | 0.50 / 0.44 / 0.20 | 0.48 / 0.49 / 0.23 |
| perilous-jungle | 0.59 / 0.48 / 0.21 | 0.50 / 0.52 / 0.23 |
| pokemon-center | 0.30 / 0.82 / 0.15 | 0.28 / 0.68 / 0.27 |
| scorched-earth | 0.37 / 0.42 / 0.26 | 0.43 / 0.56 / 0.29 |
| shopping-center | 0.29 / 0.85 / 0.16 | 0.23 / 0.92 / 0.11 |
| steel-shelter | 0.19 / 0.59 / 0.19 | 0.05 / 0.72 / 0.22 |
| stormy-mountains | 0.29 / 0.59 / 0.23 | 0.22 / 0.62 / 0.23 |
| surfing-beach | 0.47 / 0.83 / 0.15 | 0.35 / 0.80 / 0.16 |

(The art's brightness includes the pale frame edge inside the crop on the yellow-border cards, so
Stormy Mountains and Magnetic Storm read brighter here than their paintings are.)

## Suggested order of work (value per hour)
1. A **"hero light" pass**: make the one emissive cue per board actually emit (emblem on Stormy,
   pool on Mystery Garden, crystals, gold veins, lava, force field, lamps). One shader hook in the
   kit ground (`uGlowSpots` or similar) would serve most boards.
2. **Re-key the night boards** (Stormy Mountains, Dark City, Old Cemetery, Magnetic Storm): darker
   ground values, warm/cool split, the hero cue as the only bright thing.
3. **Tree crowns overhang, don't clip** (Vitality, Grand Tree); cast a lighter, soft-edged shadow.
4. **Replace the four off-family props**: Mountain Ring rope, Neutralization pillars, Lab railing,
   Dimension Valley islands/void.
5. **Water material** shared by Beach, Brooklet, Levincia, Mystery Garden: depth gradient, highlight
   band, shore translucency; shift Brooklet to teal so card backs separate.
6. **Scatter variety**: per-kind scale/rotation jitter and species mix in `stadium-env-clumps.mjs`;
   cap density (Cemetery, Fairy Garden).
7. **Frame-aware layout**: bias landmarks and props to the visible three quarters.
8. Scorched Earth: margins + BDSP shading; move the river off the hero cards.

---
# Build (one-shot, 2026-11-03)

## Acceptance
Every row is the audit's own words: the eight cross-cutting items of "Suggested order of work" and,
per board, its numbered suggestions in § Per-board detail (and its scorecard "one fix").
| # | Criterion (the brief's words) | Evidence |
|---|---|---|
| X1 | Hero light pass: the one emissive cue per board actually emits; one shader hook (`uGlowSpots` or similar) serves most boards | Shared hook: `GLOW` (`uGlows`, `glowLight`, `glowOn`) + `setGlows` + kit `glow` (32daabed; stadium-environment-mesh.test `setGlows` rows). Boards lit through it: Vitality, Mystery Garden, Crystal Cave, Fairy Garden, Perilous Jungle, Stormy Mountains, Magnetic Storm, Dark City (crown), Neutralization Zone (columns); own emissives fixed on Magma (falls), Lab (dais core), Arena (canvas), Shelter (emblem pool, strips) |
| X2 | Re-key the night boards (Stormy Mountains, Dark City, Old Cemetery, Magnetic Storm): darker ground values, warm/cool split, the hero cue as the only bright thing | Stormy 626eb114, Old Cemetery 41516243, Magnetic Storm d33bf5f8 (#1c1a24 mud), Dark City c3061f95 (#2a3040 roof); stills `.agent/scratch/084/final/` |
| X3 | Tree crowns overhang, don't clip (Vitality, Grand Tree); a lighter, soft-edged shadow | Vitality 81ce61ea (crown cut per card, umbrella crowns), Grand Tree e511ef64; `treeRound` true-bound measure (asset sweep test) |
| X4 | Replace the four off-family props: Mountain Ring rope, Neutralization pillars, Lab railing, Dimension Valley islands/void | Mountain Ring rope/chain a7c8dbe3; Neutralization columns 05f9a481; Lab railing b9e78594 (`railRuns`/`evenPosts` tests); Dimension Valley slabs/void a9fb363d |
| X5 | Water material shared by Beach, Brooklet, Levincia, Mystery Garden: depth gradient, highlight band, shore translucency; Brooklet to teal so card backs separate | `waterBody`/`foamBands` (stadium-env-ground) used by Beach 1b4ae96a, Brooklet d8036630 (teal), Mystery Garden a2dd83b1, Levincia (close slice) |
| X6 | Scatter variety: per-kind scale/rotation jitter and species mix in `stadium-env-clumps.mjs`; cap density (Cemetery, Fairy Garden) | `clumpPieces` lean/spread/weight (32daabed; stadium-env-clumps.test); density caps Cemetery 41516243, Fairy Garden 579cd88a |
| X7 | Frame-aware layout: bias landmarks and props to the visible three quarters | `PANEL_SHARE`/`frameWeight` (32daabed; stadium-env-spots.test) used by Beach, Fairy Garden, Mystery Garden, Grand Tree, Vitality; landmarks moved left/top-left (Vitality tree, Scorched volcano, Lumiose tower) |
| X8 | Scorched Earth: margins + BDSP shading; move the river off the hero cards | 99d50781: margins (`sceneBounds` test), river crusted under the cards, wrapped-key stones; volcano tests in stadium-environment-layout.test |
| B1 | Forest of Vitality suggestions 1–5 | 81ce61ea |
| B2 | Grand Tree suggestions 1–5 | e511ef64 |
| B3 | Perilous Jungle suggestions 1–4 | b022dee6 |
| B4 | Fairy Garden suggestions 1–4 | 579cd88a |
| B5 | Mystery Garden suggestions 1–4 | a2dd83b1 |
| B6 | Old Cemetery suggestions 1–4 | 41516243 |
| B7 | Surfing Beach suggestions 1–3 | 1b4ae96a |
| B8 | Brooklet Hill suggestions 1–4 | d8036630 |
| B9 | Stormy Mountains suggestions 1–4 | 626eb114 |
| B10 | Mountain Ring suggestions 1–4 | a7c8dbe3 |
| B11 | Crystal Cave suggestions 1–4 | 253e94fa |
| B12 | Dimension Valley suggestions 1–4 | a9fb363d |
| B13 | Magnetic Storm suggestions 1–4 | d33bf5f8 |
| B14 | Scorched Earth suggestions 1–4 | 99d50781 |
| B15 | Magma Basin suggestions 1–4 | 16534a6a (falls show in tilt12; tcgl's frame shows only their feet — ISSUES line) |
| B16 | Lumiose City suggestions 1–4 | 7d5b8516 |
| B17 | Community Center suggestions 1–3 | 26671d5a (far mountains barely in frame — ISSUES line) |
| B18 | Levincia suggestions 1–3 | c80fb5a1 + close slice (shared water) |
| B19 | Dark City suggestions 1–4 | c3061f95 |
| B20 | Pokémon Center suggestions 1–4 | aac56579 |
| B21 | Shopping Center suggestions 1–4 | bf442472 |
| B22 | Full Metal Lab suggestions 1–3 | b9e78594 |
| B23 | Fighting Stadium suggestions 1–3 | d9f77d84 |
| B24 | Neutralization Zone suggestions 1–4 | 05f9a481 |
| B25 | Steel Shelter suggestions 1–3 | c632f0e2 |

## Assumptions
- (assumed) Forest of Vitality's tree moves to the top-left margin as suggestion 1 says, although
  077 records the user's 2026-10-28 ask for "one huge tree at the top right". The newer request
  ("implementing all fixes") names this fix; the side is one constant (`HERO_SIDE`) so it flips back.
- (assumed) The audit's colour values are lookdev starting points (its own words), checked against
  pixel samples of the card art; where a sample disagrees, the art wins.
- (assumed) "Off under reduced motion" (Stormy Mountains' lightning) is the repo's own rule: the app's
  reduce-motion setting freezes uTime and stops the ambient clock (D105); the OS flag is not read.
- (assumed) Shopping Center's mannequins stay as faceless dress forms on stands (fixtures, not
  characters: 077's no-characters rule holds).
- (assumed) The chat panel covers about the right 24 % of the viewport (the audit's measure at
  1920×1080); boards bias toward the left of the table, never place anything only the panel would show.
- (assumed) Board-wide light pools under the cards (Crystal Cave's shaft, the Lab's dais core, the
  arena's canvas, Steel Shelter's floor) are broad soft value changes, not detail: D232's calm field
  limits detail, glints and motion round cards, not a low-frequency light gradient.
- (assumed) Lightning and the aurora are slow, local and dim enough to keep D232 (never over a card);
  no board-wide white flash (the user's FX taste: no whiteouts).

## Design (build)
### Shared modules
- **Contact glow (X1).** `stadium-env-ground.mjs` gains `MAX_GLOWS = 16` and the GLSL chunk `GLOW`
  (after TERRAIN_UNIFORMS): uniforms `uGlows[16]` (x, y, radius px, strength), `uGlowTints[16]`
  (linear r, g, b, breath rate Hz), `uGlowCount`; `vec3 glowLight(vec2 p)` = Σ tint × strength ×
  (1 − d/r)²₊ × (1 + 0.12 sin(2π rate t + i)); `vec3 glowOn(vec3 col, vec2 p)` = col + (col × 1.6 +
  0.03) × glowLight(p) — light tints and brightens what it falls on. The mesh's shared uniforms hold
  them; `setGlows(uniforms, glows)` (exported, pure on the uniform objects) fills them from a
  board's `spots.glows` (`[{ x, y, r, colour: '#hex', strength = 1, breath = 0 }]`) in applyLayout:
  non-finite or r ≤ 0 entries skipped, past MAX_GLOWS dropped with one warning, colours through
  `paint(hex, 2)` (a light's own colour). `kitFragment` adds `albedo × glowLight(world.xy) × (0.55 +
  0.45 n.z)` to every lit kit part, so props beside a lamp or a crystal pick its light up.
- **Water (X5).** `stadium-env-ground.mjs` `WATER` gains `waterBody(deep, shallow, bed, depth, p, t)`
  (depth 0 at the shore .. 1 deep: the bed shows through the shallows, shallow → deep by depth, a
  broad soft highlight band of sky drifting across, sparkles only past depth 0.55) and
  `foamBands(shore, t, count, spacing)` (parallel bands moving shoreward, 0..1).
- **Scatter (X6).** `clumpPieces` gains per-kind `lean` (rad, max) and `spread` (size spread, default
  0): each piece leans by a hashed amount up to `lean` toward a hashed heading, and its size takes a
  hashed factor in [1 − spread, 1 + spread]; the clearance passed to `fits` grows by height ×
  sin(lean). `placeAsset` takes `lean` ([about x, about y], frameOf's). New asset variant:
  `treeRound` `crown: 'umbrella'` (the card's flat-topped broadleaf: a wide flat crown on a tall
  visible trunk); its measure is a true bound (asset sweep).
- **Frame (X7).** `stadium-env-spots.mjs` `PANEL_SHARE = 0.24`, `frameWeight(x, table)` 1 left of
  the table's 0.6 mark easing to 0.4 at its right edge; clumpPieces takes `weight(x, y)` multiplying
  its patchy acceptance. Landmarks named by a board's suggestions go top-left/left.

### Per board
Each board takes its numbered suggestions in § Per-board detail, in that order, plus the
cross-cutting rows that name it. Colour values are lookdev starting points checked against the art.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | no glows / spots null | uGlowCount 0: glowLight is 0, no loop work | [x] stadium-environment-mesh.test: setGlows none |
| 2 | bad glow entry (NaN, r ≤ 0, bad colour) | skipped; a bad colour throws in paint as every kit colour does | [x] setGlows test |
| 3 | more glows than MAX_GLOWS | the first 16 kept, one warning | [x] setGlows test |
| 4 | reduced motion | uTime frozen: glows steady, lightning and aurora still | [x] by construction (functions of uTime / tick(null)) |
| 5 | glow, lightning, aurora near a card | glows are broad light, no detail; lightning and particles keep off cards on screen | [x] stills; bolt-path tests |
| 6 | leaned clump piece near a card | clearance grows by height × sin(lean) | [x] stadium-env-clumps.test |
| 7 | new/changed props | every built vertex off every card on screen, both presets | [x] each board's screen test |
| 8 | GLSL | every changed program declares every name it uses | [x] stadium-glsl-idents.test |
| 9 | reveal / exit | new meshes gated by revealBurned/exitKeep like the rest | [x] by construction; stills after reveal |
| 10 | no table / no cards | boards' spots null: kit set(null), glows cleared | [x] each board's null-layout test |

## Test plan
- Unit: setGlows (none, invalid, cap, colours); GLOW/WATER chunks compile in full programs
  (stadium-glsl-idents); clumps lean/spread/weight determinism and clearance; asset sweep with the
  umbrella crown; each board's tests (screen tests for every new prop) stay green, new tests where a
  board's pure layout logic changes (tree side, headstone groups, river route, rope radius...).
- Visual: before/after stills of all 25 boards in both presets (`rec-stadium-boards.mjs`, scratch).
- Manual (user, localhost): each board via `?stadiumEnv=<key>`, both cameras, ~10 s.

## Migration / rollout
n/a: client visuals only, no data. Revert: revert the branch's commits; boards fall back to 083.

## Work plan — slices, each green on its own
| Slice | Files | Contract | Tests | Green when |
|---|---|---|---|---|
| 1 Shared kit | stadium-env-ground.mjs, stadium-environment-mesh.js, stadium-kit.mjs, stadium-env-clumps.mjs, stadium-env-spots.mjs, stadium-kit-assets.mjs + tests | § Shared modules | edge rows 1–3, 6, 8 | board3d stadium tests green |
| 2–26 One board each, in § Per-board detail order | stadium-env-<board>.mjs (+ layout module, mesh for Scorched/Stormy/Jungle, stadium-environment-layout.mjs for Scorched's margins) + its test | its suggestions + named cross-cutting rows | its tests; edge rows 4, 5, 7, 9, 10 | its tests green; stills reviewed |
| 27 Close | design, harness, captures | — | full `pnpm test`, lint, gates | Done checklist |

## Deviations (Builder appends here during build)
- Magma Basin's falls moved from the far wall's straight run (hidden behind the opponent's hand
  row) to its two corners, each pouring straight up the screen; tcgl still shows only their feet.
- Magma Basin bug found and fixed in passing: the falls' "no fall" distance (100000) overflowed the
  half-float bake to Inf/NaN, lighting every wall pale orange (the audit read it as "a wide moat").
  Other boards' sentinels are an ISSUES line (not audited here).
- Scorched Earth's volcano keeps its crater in view (`craterInView`, VOLCANO_RISE): the tilted
  cameras push a tall cone's crater toward the far edge, off screen at the table's corner.
- Lumiose's Prism Tower stands at the far end of the left strip (both cameras draw it upright),
  not out in the margin (the margin is built up with blocks).
- Levincia's billboards' scrolling LED needed a new kit look (`LOOK.pulse`: a soft swell, never off).
- Fighting Stadium: the white lattice of shafts was removed with the star flares (both read as
  scratches/sunbursts); four wedges replace eight lasers.
- Full Metal Lab: the railing runs on the round dais's edge only, so it breaks at the docking pads
  (a rail round the pads crossed their cards' edges or wandered); short arcs left and right remain.
- Community Center's mountains sit in the ~80 px of scene past the opponent's hand row, so they
  barely show (ISSUES line).

## Landing edits (for the commit that lands this branch on main)
- ISSUES: `[board3d]` half-float bake sentinels (100000/1e5) audit across boards (Magma fixed).
- ISSUES: `[board3d]` Magma Basin falls show only their feet in tcgl (its frame stops below the far wall).
- ISSUES: `[board3d]` Community Center far mountains barely in frame (past the opponent's hand row).
- ISSUES: close I276 (this audit) as shipped by 084.
- DECISIONS: `[board3d]` shared contact glow (`GLOW`, `setGlows`, MAX_GLOWS 16) is the one emissive
  hook boards light their surroundings with; `LOOK.pulse` joins `LOOK.blink` for glowing parts.
- DECISIONS (assumed): Vitality's tree moved top-left per the audit (077 had top right; `HERO_SIDE` flips it).
- STATE: Focus/Next after 084; design Status: shipped; ledger to the archive.

