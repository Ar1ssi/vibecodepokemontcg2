# Element library — index and the neighbour test

One file per element. Each holds: the physical truth the look comes from, shape language, value
structure (light or matter), a palette with sampled hexes from the Scarlet/Violet move videos,
motion signature with timing ranges, what sells it, card motion and sound notes, the "not its
neighbour" discriminators, a few reference cues, and the failure signatures already seen in this
project with their fixes. Read the one you work on; they are independent.

| Element | File | Light or matter | One-line identity |
|---|---|---|---|
| Fire | `fire.md` | light (+ soot matter) | licking tapers on a temperature ramp, rising, blackening |
| Water | `water.md` | matter | heavy translucent blue under gravity; foam only where it tears |
| Ice | `ice.md` | matter (+ light glints) | hard facets and needles that grow in jumps and shatter |
| Electric | `electric.md` | light | angular bolts with a hot filament; instant on, snap off |
| Grass | `grass.md` | matter (leaves, vines) + light (energy) | leaves with mass on wind; vines that grow; green-yellow energy |
| Psychic | `psychic.md` | light + lens | violet/magenta lenses, rings and ribbons that swell and implode |
| Ghost & Dark | `ghost-dark.md` | subtractive | smoke, voids and cold light (ghost); crimson slashes and fangs on black (dark) |
| Fighting | `fighting.md` | light (stamps) | translucent limb stamps, starbursts, speed lines; gold-orange |
| Rock & Ground | `rock-ground.md` | matter | faceted stones with gravity and dust; sand, mud, cracks with magma glow |
| Steel | `steel.md` | matter (metal) + light (sparks) | cool silver with hard specular; orange sparks on contact |
| Dragon | `dragon.md` | light | fire's structure in violet-magenta with cyan; helixes and roars |
| Fairy | `fairy.md` | light | pink-white, soft, glittering; stars, hearts, moon; lilac shadows |
| Poison | `poison.md` | matter (liquid) + gas | glossy violet globs that drip and bubble; sickly gas; acid is amber |
| Bug | `bug.md` | matter (needles, wings) + light (buzz) | many small hard things; chitin green; buzz rings |
| Flying | `flying.md` | light (air) | thin translucent ribbons and crescents that sweep and unwind |
| Normal | `normal.md` | light | colourless force: white-gold stamps, rings, speed lines; the one place white is a body |

## The neighbour test

Cover the colours with your thumb. The shape and the motion alone must say the element. The pairs
below are the ones that have actually been confused in this project; the discriminator is the one
thing to check first.

| Pair | This one… | …not that one | First discriminator |
|---|---|---|---|
| Water vs Ice | round, continuous, under gravity, soft foam | faceted, jumps, hard glints, static shards | **edges**: soft and flowing vs hard and crystalline |
| Electric vs plain light / Fairy | angular branching with a hot filament, instant | soft glow, sparkles | **structure**: a bolt has corners |
| Psychic vs Fairy | violet/magenta, lens distortion, rings, slow swell | pink-white, stars and glitter | **distortion**: psychic bends what is behind it |
| Fire vs Dragon | red-orange-yellow ramp, soot, embers rise | violet-magenta with cyan, helixes, cleaner | **hue + structure**: dragon is fire's shape in a cool palette |
| Fire vs a lamp | tapers with a ramp along them, eroded tips, smoke | even yellow fill | **ramp and soot** |
| Ghost vs Dark | violet smoke, cold cyan-green light, voids | crimson/magenta slashes, fangs, hard edges | **edge**: ghost seeps, dark cuts |
| Ghost vs Poison | smoke without weight, cold | glossy liquid with weight, drips, warm-sick gas | **gloss and gravity** |
| Rock vs Ground | hard grey-brown facets, bounces | sand, mud, cracks, dust clouds, magma glow | **form**: chunks vs granules/flows |
| Grass vs Bug | leaves and vines, flowing | needles, shells, buzz rings, jittery | **motion**: flow vs jitter |
| Steel vs Ice | warm-grey silver, anisotropic highlight, orange sparks | blue-white, refractive, cold glints | **highlight colour**: steel's is white-warm, ice's is blue-cold |
| Steel vs a black ball | lit metal sphere needs environment reflections to read | a dark sphere on a dark board reads as a hole | prefer light spheres for steel *energy*; metal only for solid props |
| Fighting vs Normal | gold-orange stamps and shards, warm | white-gold, colourless, rings | **hue**: fighting is orange |
| Flying vs Ice (wind vs frost) | white-cyan ribbons that sweep | flakes and frost that settle | **motion**: sweep vs settle |
| Fairy vs Normal | pink-lilac, glitter, hearts/stars | white-gold, no sparkle | **hue** |
| Water (Scald) vs Fire | hot water keeps the water palette and adds **steam** | flame | steam is white-grey rising mist, not orange |

## Cross-cutting notes

- Palettes are *sampled from the effect itself* in the reference frames, never from the
  background or the creature. The hexes listed are starting points; re-sample when a move's
  reference differs (Blue Flare is fire in blue, Acid is poison in amber).
- Every element's **hot** stop is where gain is allowed. Gaining the body is how every element
  drifts toward white and reads as ice, light or "generic magic".
- Light elements need a dark to read against (soot, smoke, a deep rim, the scene's own shadow);
  matter elements need a highlight and a shadow side.
- Tier scales count, reach and dissipation length, not palette.
