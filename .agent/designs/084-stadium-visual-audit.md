# 084: Stadium boards — visual audit against the card art and general design principles
Date: 2026-11-02 · Build: main @ 1d7bb60 (designs 077–083 merged) · Read-only; nothing changed.

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
