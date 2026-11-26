# 092: Max Move and G-Max Move animations for Pokémon VMAX
Status: approved (user, 2026-11-27: scope via three answered questions; "split into subagents to speed it up")
Date: 2026-11-27 · Builds on 063 (attack scenes), 065 (signature tier S), 075/089 (scene player, VFX pass), D260 (Gigantamax entry)

## Problem
A Pokémon VMAX attacks like any other card of its type: its Dynamax attack ("Max Miracle", "G-Max Thunder")
plays a generic 063 move or a legendary's signature. The user asked for the Sword/Shield Max Moves instead,
studied from the games, for every type, and the unique G-Max Moves for Gigantamax Pokémon.

## What the user decided (2026-11-27) — requirements
1. **Which attacks**: only a VMAX's "Max …" and "G-Max …" attacks (corpus: 126 + 79 of 307 VMAX attacks); its
   other attacks (Tail Charge, Claw Slash…) keep today's animation.
2. **Max Move pick**: by the Pokémon's own game type — design 063's rule (`vgTypesFor`: the printed TCG type's
   family narrowed by the species' types, a dual type flipping on the seeded coin). All 18 Max Moves.
3. **G-Max**: a "G-Max …" attack plays its species' own G-Max Move (all 33), not its type's Max Move. TCG names
   differ from the game's (Gengar's "G-Max Swallow Up" is G-Max Terror), so the key is the species.
4. Speed: build the 51 scenes in parallel subagents (forks), one per move family.

## Out of scope
Max Guard (a self-shield, never an attack) · Z-Moves · Eternatus's Eternamax · the in-game camera moves, text
box and whiteout (house rule: a local tinted flash replaces it) · the Dynamax cloud backdrop of the raid arena.

## References
Poképédia `<Nom>_EB.mp4` (Sword/Shield, 1280×720, 30 fps) for all 18 Max Moves and 33 G-Max Moves, French names
from PokéAPI (max-*) and Poképédia's Gigamax page (G-Max; English names from each page). Local copies (not
committed): `%TEMP%/gmax-ref/max/<max-id>.mp4`, `%TEMP%/gmax-ref/max/gmax/<g-max-id>.mp4`, contact sheets at
2.5 fps in `%TEMP%/gmax-ref/max/sheets/`. Types of the G-Max Moves: Bulbapedia's G-Max Move table.

## Design
- **Catalogue** `moves/max/max-moves.mjs`: `MAX_MOVE_BY_TYPE` (18), `GMAX_MOVE_BY_SPECIES` (33, keyed by the
  sprite slug without `-gmax`; Urshifu's two forms are `urshifu` and `urshifu-rapid-strike`), `MAX_MOVES`
  (id → name, vgType).
- **Selection** `moves/max/max-select.mjs` (pure): `maxMoveFor(card, { attackName, slug, species, seed })` →
  `{ move, kind: 'max' | 'gmax' } | null`. VMAX by `isVmaxCard` or a `VMAX` stage; "G-Max …" → the species'
  G-Max Move (exact species: Galarian Meowth has none), else the typed Max Move; "Max …" → the typed Max Move.
  `withMaxSpec(pick, MAX_SPECS)` → the pick with its spec, or null while that spec has not shipped.
- **Wiring** `combat.js`: `pickSpecial` = `pickMax` ?? `pickSignature`, used by the attack scene, its sound
  (`attackSoundFor`) and the banner's impact preload. Seed for the type coin: `attackerId|attackName|type`
  (063's). A Max Move plays before the zero-damage check, as a signature does.
- **Specs** reuse tier S (`TIER_BAND.S` 1800–2600 ms, contact 900–1200, ratio 0.38–0.62): no new tier, so the
  queue budget (contact + 40 ≤ 1240), the sampled-hit sound tier and the family rule are unchanged. The in-game
  build-up (5–9 s) compresses to the ~1.1 s before contact; the eruption dissipates after it.
  `moves/max/specs/index.mjs` merges seven group files through `variedSpecs` (089 reactions).
- **Tools**: `rec/seven-frames.mjs` `MAX=<id>` plays a Max spec, `GPU=1` uses the machine's GPU.

### Options
1. Tier. A: a new tier M (longer). B: tier S. Pick B: S already sized for the queue budget and the sound bank;
   a longer contact would collapse the knockout chain's holds (fx-queue.mjs budget 3800).
2. Precedence. A: signature first. B: Max first. Pick B: the user asked Max attacks to play Max Moves; Rayquaza
   VMAX's "Max Burst" would otherwise play the legendary's signature (strongest-attack rule).
3. Build. A: one session, inline. B: seven forks in parallel worktrees, one family each, merged here. Pick B
   (user). Each group owns its spec file; shared tables take additive, group-tagged blocks only.

## Edge cases & failure modes
| # | Case | Expected | Covered by |
|---|---|---|---|
| 1 | Max attack, spec not shipped | plays as before (signature / 063 / lunge) | [x] withMaxSpec test |
| 2 | VMAX's non-Max attack (Tail Charge) | no Max Move | [x] max-select test |
| 3 | "Max …" attack on a non-VMAX | no Max Move | [x] max-select test |
| 4 | G-Max attack, species without a G-Max form | typed Max Move | [x] max-select test |
| 5 | Dual type | either type's Max Move, same on both clients | [x] max-select test |
| 6 | VMAX known only by stage | still a VMAX | [x] max-select test |
| 7 | Zero-damage Max attack | still plays (before the zero-damage check) | [x] combat order (as 065) |
| 8 | Multi-target Max attack | travel beats replay per lane (design 069) | as every spec |
| 9 | Reduced motion / FX off | dispatcher's rules, unchanged | as every spec |

## Work plan
| Slice | Owner | Files | Done when |
|---|---|---|---|
| 1 foundation | main | max-moves, max-select, specs/index + 7 empty group files, combat.js, tests, seven-frames | 14 tests green |
| 2 fire-normal | fork | specs/fire-normal.mjs (+ new pieces) | 8 specs, rubric ≥ 4 each |
| 3 water-ice | fork | specs/water-ice.mjs | 8 specs |
| 4 electric-poison-fighting | fork | specs/electric-poison-fighting.mjs | 8 specs |
| 5 grass-bug-flying | fork | specs/grass-bug-flying.mjs | 9 specs |
| 6 ground-rock-steel | fork | specs/ground-rock-steel.mjs | 7 specs |
| 7 psychic-fairy | fork | specs/psychic-fairy.mjs | 5 specs |
| 8 ghost-dark-dragon | fork | specs/ghost-dark-dragon.mjs | 6 specs |
| 9 integration | main | merges, completeness test (all 51 shipped), docs, review | full test + gates |

Per move (vfx-design skill): reference brief from its clip (beats, sampled hexes) → spec → seven frames (`MAX=<id>
GPU=1 CARD_IMG=…`) → rubric, every axis ≥ 4, ≤ 3 rounds; far seat once. House rules bind: no whiteouts, no
sunburst/god-ray fans, no floor rings round the attacker (rings only under the defender), flares local, one
palette start to payoff, nothing stacked, the struck card reacts along the attack.
Shared files (move-spec.mjs, move-drawers.js, materials/*, particle-shapes, card-motion): additive only, never a
change to an existing drawer's behaviour or defaults; each addition in one block tagged `// design 092 <group>`
at the end of its table; new names specific to the move (coin, apple, monolith…), never generic.

## Appendix M — reference notes (2.5 fps sheets; each fork writes its moves' full briefs under § Deviations)
- Max Strike: prismatic spark streaks gather round the attacker; ground cracks at the target, violet-cyan spikes
  erupt from the cracks; a white-gold diagonal blast. G-Max Cuddle, G-Max Replenish (+ berries falling): same frame.
- Max Flare: fire core and sparks at the attacker's chest, a fire stream, a fire sphere over the target, a lava-
  blob eruption engulfing it. G-Max Wildfire: flame wings, a phoenix-shaped flame over the target, eruption,
  burning ground. G-Max Centiferno: a golden fire coil, fireball, eruption, spiral flame rings burnt into the
  ground. G-Max Fireball: a huge fireball kicked down the lane, explosion with a gold ring.
- Max Geyser: bubble-ringed water sphere, beam, a giant geyser at the target, a lingering pool. G-Max Foam Burst:
  same with bubbles. G-Max Stonesurge: same beam carrying rocks; pool ringed with stone shards. G-Max Cannonade:
  a hexagonal array of cannons, many cyan jets converge, huge splash, pool. G-Max Hydrosnipe: a sniper water
  shot (thin lance) and a cyan burst. G-Max Rapid Flow: blue chi fist, flurry of cyan slash arcs.
- Max Lightning: storm cloud over the target, a sky bolt, an electric pillar, ring. G-Max Volt Crash: cloud and
  ring, sky bolt into a yellow dome, giant zigzag bolts burst out. G-Max Stun Shock: magenta lightning, cloud,
  magenta electric column, toxic electrified ground.
- Max Overgrowth: green energy fired; giant plant shapes burst up round the target; leaf swirl. G-Max Tartness /
  Sweetness: giant red apples rise round the target; acid-green burst / pink nectar splash. G-Max Vine Lash: two
  vines with glowing pink tips whip down, petal explosion, pink ripple. G-Max Drum Solo: drumming, giant roots
  burst up under the target.
- Max Hailstorm: a storm cloud gathers, falling ice freezes the target in a frosted block. G-Max Resonance: music
  staff lines, icy boulders, an aurora ring of light pillars.
- Max Knuckle: the attacker sends a glowing fist into the sky; a giant fiery fist slams down, golden crater.
  G-Max Chi Strike: golden rainbow charge, giant dark fist from the sky, golden crater. G-Max One Blow: a red fist
  punch flash, a crimson dome over the target.
- Max Ooze: violet pool under the attacker, violet crystal geysers round the target, violet ring. G-Max Malodor:
  garbage gas, yellow-green crystal geysers.
- Max Quake: a dust wave runs along the ground, a magenta shock dome with rocks round the target. Max Rockfall:
  a sky vortex drops a giant stone monolith, rubble explosion. G-Max Volcalith: monolith, then a ring of burning
  ember rocks. G-Max Sandblast: a sand tornado at the target, sand whirlpool.
- Max Airstream: a silver vortex fired as a horizontal tornado tube, wind ring. G-Max Wind Rage: same, red streaks.
- Max Mindstorm: magenta psychic rings spiral down onto the target, an iridescent column. G-Max Gravitas:
  cyan-magenta rings descend, iridescent column, a cyan gravity dome.
- Max Flutterby: green butterflies, a green orb, a green scaled dome. G-Max Befuddle: butterflies and stars, a
  green orb into a scaled dome, cyan powder spiral.
- Max Phantasm: haunted furniture floating in magenta light, a violet dome bursts into dark streaks. G-Max Terror:
  haunted objects fly at the target, violet dome, a red shadow world with glowing eyes.
- Max Darkness: spiked dark orbs, a dark crimson dome with blue arcs, dark shards. G-Max Snooze: the same frame.
- Max Wyrmwind: violet ribbons, cyan shards, a red-violet dragon tornado. G-Max Depletion: the same in crimson.
- Max Steelspike: chrome spikes erupt in a line toward the target, a cluster round it. G-Max Steelsurge: jade-teal
  spikes. G-Max Meltdown: silver spikes round a molten pink-orange core.
- Max Starfall: stars rise into a night sky, pink light pillars rain down, neon star outlines. G-Max Finale:
  sparkle rings, cream-white light pillars with stars, pastel rainbow rings, pink burst. G-Max Smite: stars, cyan
  light columns, rainbow burst.
- G-Max Gold Rush: glowing cracks spread under the target, a golden burst throws giant coins.

## Deviations
(each group appends its moves' briefs and departures here at integration)
