# 063: Attack move animations — type × stat class × tier
Status: draft — awaiting user approval (document only; the user deferred implementation).
Appendix A filled for Grass, Water, Fire, Electric (the user's test run of the study method,
43 moves); the other 13 types are pending the same pass.
Date: 2026-10-01 · Session: S336

## Problem
Every attack on the board plays the same beat: the attacker's ghost lunges, the defender flashes,
slashes and sparks in the attacker's type colour, the table shakes (designs 022/026). The user wants
each attack to play a *move*: 154 named moves from the main-series games, picked by the attacker's
type, by whether the species hits physically or specially (its base Attack vs Special Attack), and
by its evolution tier (Basic → Stage 1 → ex/Mega/Stage 2). The look is 3D / TCG Live, with the
Black 2 & White 2 (else Black & White) sprite animations as the reference for each move's read,
and the Scarlet/Violet video as the cue for the 3D translation.

This document is the plan for the *animations*: selection rules, the data they need, the shared
primitive library, timing, tests, slices, and one per-move spec (Appendix A). Implementation comes
later; nothing here changes code.

## Constraints
- Cosmetic only (D94). Board state is applied before any plan runs; nothing gates input. Overlays
  self-remove with a backstop timer; `body.fx-off .fx-overlay` hides them. The FX queue budget is
  2500 ms of committed holds per batch (`fx-queue.mjs`), so a whole attack (banner → move → damage
  → status → KO) must fit.
- One clock (D103, D118, D119): motion is WAAPI keyframes sampled from pure pose functions; canvas
  layers redraw from a WAAPI animation's `currentTime` via `playCanvasStage`; no free-running rAF.
- Sound before sight (design 024): the dispatcher sounds a plan before the effect runs; a hold
  needs a voice; voices are synthesized (no audio assets).
- Both seats: the opponent's board iframe is turned 180°; card art in an overlay turns with it
  (`frameTurnOf`); the attacker may be on either side, so every scene is written in *lane* terms
  (attacker → defender), never in screen "up/down".
- House FX rules (fx-designer agent, each a past user correction): one palette start to payoff; no
  whiteouts, board-wide blooms, sunburst fans or mid-effect backdrop colour change; flares local to
  a card; colour from data (`fxRgbForCard`); 3D cards never get opacity (fade the host).
- Reduced motion (D105): `motionReduced()` reads only `localStorage['ptcg-reduce-motion']`; the
  dispatcher plays `STATIC_FALLBACKS` then — transient attack scenes are skipped, as today.
- No build step, native ESM in the browser (PROJECT.md): data ships as a generated `.mjs` module
  (the sprite catalog precedent, D97), never a runtime network fetch and never a bare `.json` import.
- No engine or protocol change (D104 precedent for entries): everything is derived on the client
  from the view and the `attackExecuted` event both clients already receive.
- New dependency or vendored data ⇒ a DECISIONS.md line (CLAUDE.md hard rule).
- Pure modules test under `node --test` with no jsdom; DOM drivers are the thin `.js` twins.
- Performance: a scene spawns ≤ 40 DOM nodes, ≤ 24 particles per burst (`MAX_PARTICLES`), ≤ 2
  canvases, and only `transform`/`opacity` keyframes; the lunge today is 3 `<img>` + 1 host.

## Current state (read this session)
- `client/src/setup/netcode/advisory-animations.mjs` — `EVENT_FX.attackExecuted = 'attack'` and
  `MULTI_FX.attackExecuted = ['attack-banner', 'attack']`: one event, two plans, each
  `{ kind:'fx', effect, user, attackerId, defenderId, attackName, damage, benchDealt }`.
- `shared/engine/reduce.mjs:7954` emits `attackExecuted { attackerId, defenderId, attackName,
  damage: dmgDealt, benchDealt, playerId }`; the chosen-target resume path (`:9665`) emits it with
  `attackName`, `damage`, `benchDealt` and no `defenderId`.
- `mat-fx/dispatcher.mjs` — guards (fx off, reduced motion → `STATIC_FALLBACKS`), sounds first
  (`playSound(plan)`), runs the effect in try/catch, and returns the plan's hold — **an effect
  that returns a finite number overrides its `HOLD_MS` entry** (used by coin.js already).
- `mat-fx/index.js` — `EFFECTS` registry; `soundPlanFor(plan)` enriches a plan before
  `playFxSound` (design 041/043 precedent for choosing a voice from the card).
- `mat-fx/combat.js` — `attack(plan)`: rects from the registry or the pre-diff snapshot
  (`peekCombatOrigin`), attacker art `src`, `lungePoseFor(from, to)`, then
  `impacts.strikeIn(LUNGE_MS * LUNGE_IMPACT, { direction, attackerCard })`, a ghost `<img>` with two
  lagged trails, `hideDuring` on the real card. `damage(plan)`: `classifyHitOnce`, then
  `impacts.add` → damage number, `strikeTarget` (flash, slash, type-coloured streak sparks),
  `shakeTable`. `attackBanner(plan)`: name banner + target ring.
- `mat-fx/combat-pose.mjs` — `LUNGE_MS 560`, `LUNGE_IMPACT 0.36` (contact at 202 ms),
  `HIT_FLASH_MS 420`, `HIT_SPARKS_MS 520`, `DAMAGE_POP_MS 1100`, `SCREEN_SHAKE_MS 360`,
  `TARGET_RING_MS 620`; `createImpactQueue({ setTimer })` holds every hit/KO queued in the same
  synchronous batch until the announced contact (`strikeIn` keeps the max delay and the context).
- `mat-fx/fx-holds.mjs` — `attack-banner 620`, `attack 240`, `damage 180`, `status 260`,
  `knockout 900`, `prize-claim 320`; unknown effects pace as 0.
- `mat-fx/particles.mjs` — `burstParticles({count, distance, direction, spread, size, aspect,
  gravity, maxDelay, orient, seed})` → ≤ 24 seeded particle rows; `spawnParticles(host, rows,
  {className, color, duration, delay})` in `image-logic/mat-fx.mjs` animates them.
- `client/src/setup/image-logic/mat-fx.mjs` — `spawnOverlay({rect, className})` (fixed-position
  host in parent-viewport px), `rectForInstance`, `sampleKeyframes(poseFn, toFrame, samples)`,
  `animateFrames(el, frames, timing)`, `removeWhen(host, promises, backstopMs)`,
  `hideDuring(el, promise, backstopMs)`, `runPose`, `motionReduced`, `fxDisabled`.
- `mat-fx/canvas-stage.js` — `playCanvasStage(host, {className, cx, cy, size, duration, draw,
  before})` → promise; `draw(ctx, t, elapsedMs)` in CSS px, cleared every frame, DPR ≤ 2.
- `mat-fx/fx-colors.mjs` — `fxRgbForCard(card)` (first printed type → `TYPE_GLOW`), `brighten`,
  `rgbCss`, `FX_NEUTRAL_RGB`. `mat-fx/evolve-scene.js` — `frameTurnOf(element)`.
- `mat-fx/fx-audio.mjs` — `voicesFor(effect, plan)`; voices are frozen `tone`/`noise`/`arpeggio`
  descriptors; `attack` already has a voice set.
- `mat-fx/status.js` + `status-fx.mjs` — Special Condition apply/clear rings and motes (unchanged
  by this design; a status attack still gets its status effect from `statusApplied`).
- `shared/engine/rules/card-classify.mjs` — `isExCard`, `isMegaCard`, `isTeraCard`, `isVCard`,
  `isVmaxCard`, `isVstarCard`, `isGxCard`, `isTagTeamCard`, `isLegendCard`, `isVUnionCard`,
  `isPrismStarCard`, `isRadiantCard`, `isRuleBoxPokemon`. `shared/engine/cards.mjs` —
  `collapseStage` ("Stage 1" / "Stage1" / "stage-1" agree) and `NON_BASIC_STAGES`.
- Card objects on the client carry `name`, `types` (TCG types), `stage`, `subtypes`, `hp`,
  `evolvesFrom`. They carry **no base stats and no main-series types**.
- `client/src/setup/deck-builder/core/card-sprites.mjs` — `pokemonSpriteForName(cardName,
  {types})` → `{ slug, name }`: strips owner prefixes, "ex"/"V"/"VMAX" suffixes, decorations;
  resolves Mega (`-mega`, `-mega-x`), Primal, regional, named and type forms, Paldean Tauros
  breeds, against `pokemon-sprite-catalog.generated.mjs` (pokesprite slugs, D97) and the hand-kept
  gen-9 catalog (D100/D101). It is pure and already the one card-name → species resolver.
- `client/src/css/mat-fx.css` — `.fx-overlay` (z 2450), `.fx-particle` + `--streak/--shard/
  --mote/--star/--z`, `.fx-hit*`, `.fx-lunge*`, `.fx-target-ring*`, `.fx-dim`.
- Tooling: `.claude/skills/fx-preview` (e2e board, `capture-entry.mjs`, `rec/rec-*.mjs` one
  per shipped scene, stepped WAAPI clock, `CHROMIUM=/opt/pw-browsers/chromium` in the cloud).

## References — how they were gathered (so a later session can refetch)
- The user's pointer (Bulbapedia `File:<Move>_B2W2.png`, else `_BW`) is behind a Cloudflare
  challenge for this container: `curl`, a browser user agent, the API endpoint and the WebFetch tool
  all get 403 "Just a moment…"; archive.org resets the connection. Not circumvented.
- Poképédia (`pokepedia.fr`) hosts the same files under the French move name:
  `/images/<h>/<hh>/<Nom>_N2B2.gif` (Black 2/White 2), `_NB.gif` (Black/White), and the 3D
  games as video (`_EV.mp4` = Scarlet/Violet, `_LPA`, `_EB`, `_USUL`, `_SL`, `_ROSA`, `_XY`).
  PokéAPI (`/api/v2/move/<slug>`) gives the French name. Where Poképédia lacks the Gen V file,
  Pokémon Central (`wiki.pokemoncentral.it`, Italian name from PokéAPI) hosts it as an APNG
  `<Nome>5.png` (tagged `IT5` in the refs). Pipeline (committed under `refs/063-study/`):
  `fetch-moves.mjs` → `moves/manifest.json` + contact sheets per move (30 tiles each, frame
  index on every tile); `fetch-italian.mjs` fills the gaps; `trim-manifest.mjs` writes the
  trimmed manifest (slug, names, page, file URLs, frame counts, durations) committed as
  `.agent/designs/refs/063-move-refs.json`; `merge-notes.mjs` splices the study notes in here.
  26 moves have no sprite-era animation anywhere (all Gen VI+ except Karate Chop and Shock Wave,
  which have no animation file at all); their entries cite the 3D video only.
- Moves newer than Black/White (Gen VI+: Fell Stinger, Infestation, Nuzzle, Phantom Force,
  Throat Chop, Liquidation, Wave Crash, Ice Hammer, Ice Spinner, Stomping Tantrum, High
  Horsepower, Smart Strike, Meteor Assault, Spirit Break, Play Rough, Mystical Fire, Electro Shot,
  Steel Beam, all Fairy specials) have no sprite animation; their entries cite the 3D video only.

## Move table — the user's spec, verbatim (1 = Basic unless ex · 2 = Stage 1 unless ex · 3 = ex / Mega / Stage 2)
| VG type | Physical 1 | Physical 2 | Physical 3 | Special 1 | Special 2 | Special 3 |
|---|---|---|---|---|---|---|
| Grass | vine whip | razor leaf | leaf blade | absorb | magical leaf | leaf storm, solar beam, seed flare, petal dance, energy ball |
| Water | aqua jet | waterfall / liquidation | wave crash / aqua tail | water gun, bubble, whirlpool | octazooka, scald | water pledge, hydro cannon, hydro pump, surf |
| Fire | flame charge | flame wheel | fire punch | ember | incinerate, mystical fire, lava plume, flame burst | blast burn, overheat, flamethrower |
| Ghost | lick / astonish | shadow punch | shadow claw / phantom force | night shade | hex, ominous wind | shadow ball |
| Dark | pursuit | feint attack / bite | night slash / throat chop | N/A | snarl | dark pulse |
| Electric | nuzzle | thunder fang | wild charge | thundershock | shock wave | electro shot, thunder, zap cannon |
| Ice | ice shard | avalanche | ice hammer / ice spinner | powder snow | aurora beam, icy wind | ice beam, blizzard |
| Fighting | arm thrust | karate chop, low sweep, triple kick | close combat, meteor assault, superpower | vacuum wave | aura sphere | focus blast |
| Poison | poison sting | poison tail | poison jab / cross poison | acid | sludge, venoshock | sludge bomb, sludge wave |
| Ground | sand tomb, mud slap | bulldoze, stomping tantrum | earthquake, high horsepower | mud slap | mud shot, mud bomb | earth power |
| Flying | peck | aerial ace / wing attack | brave bird | gust | air cutter | hurricane, aeroblast |
| Psychic | N/A | zen headbutt, psycho cut | N/A | confusion | psybeam | psychic, future sight |
| Bug | fell stinger, fury cutter, pin missile, twineedle | x-scissor, lunge | megahorn | infestation | struggle bug, silver wind, signal beam | bug buzz |
| Rock | smack down, rock throw, rock blast | rock slide, rock tomb | head smash, stone edge, rock wrecker | N/A | ancient power | power gem |
| Dragon | N/A | dual chop, dragon claw | outrage | twister | dragon breath | dragon pulse, draco meteor |
| Steel | bullet punch, metal claw | smart strike, steel wing | iron tail, iron head | N/A | flash cannon | steel beam |
| Fairy | N/A | spirit break | play rough | disarming voice, fairy wind | draining kiss, dazzling gleam | moonblast |

154 distinct moves (mud slap sits in two cells). "Mysical fire" is read as Mystical Fire,
"thundershock" as Thunder Shock.

## Options
1. **Base stats source.** A: PokéAPI at runtime per attack — online dependency, latency on the
   first attack, CORS fine. B: vendored snapshot of Smogon/Showdown `pokedex.json` (MIT; 1518
   entries incl. Mega, regional, Paldean, Hisuian forms; `baseStats.atk/spa`, `types`,
   `baseSpecies`) trimmed to what the resolver needs, generated into an `.mjs` like the sprite
   catalog (D97). C: a hand-typed table for species on cards — incomplete and drifts. **Pick B**:
   offline, deterministic, one script to refresh, ~90 KB.
2. **Card name → species.** A: reuse `pokemonSpriteForName` and map its pokesprite slug to the
   Showdown id in the vendor script (strip hyphens, plus an override table the script asserts).
   B: a second parser. **Pick A** — one resolver for sprites and stats; the vendor script fails
   loudly on any catalog slug it cannot map, so a new form shows up at generation time, not in play.
3. **Where the choice is made.** A: client, pure function of `(card, instanceId, attackName,
   species)`; the only randomness is seeded from `instanceId` (server-minted, identical on both
   clients) so both players see the same move. B: server picks and sends `move` in
   `attackExecuted` — a protocol change for no behavioural gain. **Pick A** (D104 precedent).
4. **Main-series type of the move.** A: the card's printed TCG type names a *family* of VG types
   (Grass → grass/bug/poison, Water → water/ice, Psychic → psychic/ghost/fairy/poison, Fighting →
   fighting/rock/ground, Colorless → dragon/flying/normal, others 1:1); pick the first family type
   the species actually has, else the family's default. B: TCG type only with fixed defaults —
   loses Ghost, Poison, Bug, Rock, Ground, Ice, Flying, Steel entirely. **Pick A**. A Tera card
   printed off-type (Charizard ex, Darkness) gets the printed type's default (dark), which matches
   what the player sees on the card.
5. **Tier rule.** The spec names Basic / Stage 1 / ex-Mega-Stage 2. A: extend to the other rule
   boxes the same way the user treats ex (V, VMAX, VSTAR, GX, TAG TEAM, LEGEND, V-UNION, Prism Star,
   Radiant, BREAK → 3; Restored and Baby → 1). B: strictly by stage, so a Basic V or GX plays
   tier-1 moves. **Pick A**; flagged for the user.
6. **"Close enough" stats.** A: `|atk − spa| ≤ 10` → seeded coin; else the higher stat. B: within
   10 % of the larger — same outcome for almost every species, less obvious to read. **Pick A**;
   the constant is one named export.
7. **Seed scope for the coin.** A: per Pokémon *instance* (one card is physical or special for the
   whole game — reads as character). B: per attack use (varies turn to turn). **Pick A**; the
   candidate within a multi-move cell is seeded per `(instanceId, attackName)` so two printed
   attacks on one card can show two moves, stably.
8. **N/A cells.** Order of fallbacks: same tier other class → tier −1 same class → tier −1 other
   class → tier −2 … → tier +1 same class → … ; else the generic lunge. Every N/A in the table
   resolves at its own tier through the other class (Psychic physical 1 → Confusion, Dark special 1
   → Pursuit, …). Flagged for the user.
9. **Normal-type species on Colorless cards** have no column in the spec. A: keep today's lunge
   for them. B: invent a Normal column. **Pick A**; raised as an open question (Tackle / Body Slam
   / Giga Impact and Swift / Hyper Beam / Tri Attack would fill it).
10. **Zero-damage attacks** (status, search, draw attacks; `damage === 0` and no `benchDealt`).
    A: play the move anyway — a Hydro Pump that visibly does nothing. B: banner + a short
    type-coloured aura pulse on the attacker, no contact. **Pick B**; flagged.
11. **Rendering.** A: DOM overlays + CSS particles (today's stack) for melee, bursts, slashes,
    simple projectiles. B: `playCanvasStage` for beams, helices, vortices, waves, terrain and any
    multi-shape volume. C: WebGL (three.js is vendored for the Build & Battle packs only). **Pick
    A + B per beat, never C** — 154 moves on WebGL is a scope explosion with no reader benefit on a
    card board.
12. **Data-driven scores vs. one function per move.** A: each move is a *score* — a validated data
    table of timed beats over a fixed primitive vocabulary — played by one DOM player. B: 154
    bespoke drivers. **Pick A**: one player and ~18 primitives to test; a new move is a table row;
    a schema test enumerates every move against the spec.
13. **Sound.** A: one voice per move. B: one voice set per *sound family* (`slash, punch, dash,
    beam, projectile, burst, quake, splash, wind, electric, ghost, chime, roar, charge`), chosen by
    the score and routed by `soundPlanFor`. **Pick B**.
14. **Holds.** A: a per-tier entry in `fx-holds`. B: the effect returns its own hold
    (`contactMs + 40`, mirroring today's 202 ms contact / 240 ms hold), the dispatcher's existing
    override; `HOLD_MS.attack` stays as the lunge fallback. **Pick B**.

## Design
### Selection — `mat-fx/moves/move-select.mjs` (pure)
```
MOVE_TABLE[vgType][statClass][tierIndex] : string[] | null        // move-table.mjs, the spec verbatim
TCG_FAMILY  = { grass:['grass','bug','poison'], fire:['fire'], water:['water','ice'],
                lightning:['electric'], psychic:['psychic','ghost','fairy','poison'],
                fighting:['fighting','rock','ground'], darkness:['dark'], metal:['steel'],
                dragon:['dragon'], fairy:['fairy'], colorless:['dragon','flying','normal'] }
TCG_DEFAULT = { …each family's first entry…, colorless:'normal' }
CLOSE_STAT_GAP = 10

tierFor(card) → 1|2|3
  rule box (isMegaCard|isExCard|isVCard|isVmaxCard|isVstarCard|isGxCard|isTagTeamCard|isLegendCard
            |isVUnionCard|isPrismStarCard|isRadiantCard) → 3
  stage = collapseStage(card.stage || card.subtypes?.[0] || 'Basic')
  'stage2'|'break' → 3 · 'stage1' → 2 · else ('basic','restored','baby', unknown) → 1
statClassFor(stats|null, coin) → 'physical'|'special'
  null stats → coin · |atk−spa| ≤ CLOSE_STAT_GAP → coin · atk > spa → physical · else special
  coin = seededRandom(hashString(instanceId))() < 0.5 ? 'physical' : 'special'
vgTypeFor(card, species|null) → string
  family = TCG_FAMILY[normalizeEnergyType(card.types?.[0])] ?? ['normal']
  first t in family with species?.types.includes(t), else TCG_DEFAULT[tcgType] ?? 'normal'
cellLookup(vgType, statClass, tier) → string[]|null, walking the option-8 order
moveFor(card, { instanceId, attackName, species, damage, benchDealt })
  → { move, vgType, statClass, tier, family, score } | null
  null when: damage === 0 && !(benchDealt > 0) (option 10 → aura pulse) · vgType has no table
  (normal) · cell chain empty · no score for the move (schema test makes this unreachable).
  move = candidates[hashString(`${instanceId}|${attackName}`) % candidates.length]
hashString(s) → uint32 (FNV-1a) · seededRandom is flow-pose.mjs's.
```
Species lookup: `speciesFor(card)` = `SPECIES_STATS[SPECIES_ID[pokemonSpriteForName(card.name,
{types: card.types})?.slug]]` → `{ atk, spa, types }` or null.

### Data — `scripts/vendor-species-stats.mjs` → `mat-fx/moves/species-stats.generated.mjs`
- Fetches `https://play.pokemonshowdown.com/data/pokedex.json` once (dev time, like
  `generate-pokemon-sprites.mjs`), writes `export const SPECIES_STATS = { <showdownId>: [atk, spa,
  'type1', 'type2'?] }` for every entry with `num > 0`, and `export const SPECIES_ID = { <pokesprite
  slug>: <showdownId> }` for every slug in both sprite catalogs.
- Slug → id: `slug.replace(/-/g, '')`, then the script's `SLUG_OVERRIDES` table for the known
  mismatches (e.g. `calyrex-ice-rider → calyrexice`, `calyrex-shadow-rider → calyrexshadow`,
  `urshifu-rapid-strike-gmax → urshifurapidstrikegmax`); a gen-9 fan slug whose form Showdown lacks
  (`<species>-mega[-x|-y|-z]` from Legends Z-A) falls back to the base species id and is listed in
  `export const SPECIES_FALLBACKS` so the test and a reader can see it. Any slug that resolves to
  nothing fails the script.
- Licence line in the file header (Showdown data, MIT) and a DECISIONS.md line at close.

### Scores — `mat-fx/moves/scores/<vgType>.mjs` (17 files, pure data) + `score-schema.mjs`
```
score = { move, family, tier, durationMs, contactMs, beats: Beat[] }
Beat  = { at, dur, primitive, target: 'attacker'|'defender'|'lane'|'table', params }
TIER_BAND = { 1: [900, 1100], 2: [1200, 1500], 3: [1600, 2200] }      // durationMs bounds
CONTACT_BAND = [0.38, 0.62]                                            // contactMs / durationMs
PRIMITIVES = lunge · dash · cardMotion · projectile · beam · burst · slash · impactFlash · shake
             · aura · charge · orb · ring · pillar · terrain · cloud · vignette · canvas
SHAPES = leaf petal seed vine droplet bubble wave icicle snowflake flame ember spark bolt star orb
         ring shard rock boulder mud-glob sand feather wind-blade gust-line skull ghost-wisp
         shadow-claw fist foot note heart crescent gem metal-slash meteor dragon-fang sludge-glob
         needle pin bug-wing eye fang horn hoof fairy-light
validateScore(score) → string[] errors: unknown primitive/shape/target; beats unsorted; a beat
  past durationMs; duration outside its tier band; contact outside CONTACT_BAND; particle count
  > MAX_PARTICLES; > 2 canvas beats; > 40 nodes estimated; multi-hit without a final contact.
```
Multi-hit moves (Fury Cutter, Pin Missile, Twineedle, Triple Kick, Arm Thrust, Rock Blast, Dual
Chop, Bullet Punch…) list each hit as an `impactFlash` beat; `contactMs` is the *last* hit, where
the damage number pops (one number per `damageUpdated`, as today).

### Primitives — `moves/move-primitives.mjs` (pure poses) + `moves/move-player.js` (DOM)
- `laneGeometry(fromRect, toRect)` → `{ ax, ay, bx, by, angleDeg, length, unit }` in parent px
  (the attacker/defender rect centres; `attackAngleDeg` already exists for the direction).
- One pose function per primitive, `t ∈ [0,1]` → `{x, y, scale, rotate, opacity, …}` with the
  same clamping conventions as `combat-pose.mjs` (`clamp01`, out-of-range t equals the end frame).
  `dashPose` and `cardMotionPose` drive a ghost `<img>` of the attacker (today's lunge host);
  `projectilePose` positions a shape node along the lane (`straight | arc | homing | spiral |
  scatter | volley`), `beamPose` scales a lane-aligned strip from the attacker to the defender
  (`solid | segmented | helix | pulse-train | widening`), `auraPose`/`chargePose`/`ringPose`/
  `orbPose`/`pillarPose`/`cloudPose`/`vignettePose` size and fade one host over a card,
  `terrainPose` the table layer under it.
- `moves/move-shapes.mjs` — `drawShape(ctx, shape, { size, rgb, t, seed })`, DOM-free, tested
  on a recording ctx like `evolve-scene.test.mjs`. Simple shapes (droplet, leaf, spark, shard,
  streak) are CSS `.fx-move__shape--<shape>` nodes; anything with a silhouette (skull, fist,
  feather, meteor, crescent, bolt, wave) is drawn on a canvas beat.
- `playMoveScore({ score, from, to, src, turn, rgb, seed, impacts })`:
  one `fx-overlay fx-move` host sized to the union of both rects (so lane beats are one
  coordinate space), child layers per beat, every animation `removeWhen` + backstop
  `durationMs + 400`; the attacker's real card is hidden only while a `dash`/`cardMotion`/`lunge`
  beat runs its ghost. Calls `impacts.strikeIn(score.contactMs, { direction, attackerCard, move,
  family })` — `strikeTarget` reads `ctx.family` to shape the hit (`slash` keeps the streak; `punch`
  a ring; `beam` a wider flash; `quake` extra `shakeTable`). Returns `holdMs = contactMs + 40`.
- Palette: `rgb = brighten(fxRgbForCard(attackerCard), 0.3)` as today, plus per-score accents
  from the reference (Appendix A) exposed as CSS custom properties on the host
  (`--fx-move-rgb`, `--fx-move-accent`).

### Wiring
- `combat.js attack(plan)`: resolve rects/src as today; `card = registry.get(attackerId)?.card`;
  `pick = moveFor(card, {...})`; `pick` → `playMoveScore` (return its hold); `pick === null` and
  zero damage → `playAuraPulse(from, rgb)` (hold 240); otherwise today's lunge, unchanged.
  Missing `defenderId` (resume path, bench-only attacks): `to` = the opponent's Active rect when
  one exists, else aura pulse.
- `index.js soundPlanFor`: for `effect === 'attack'`, `{ ...plan, family }` from `moveFor` (the
  same pure call; cheap, deterministic). `fx-audio.mjs voicesFor('attack', plan)` → the family's
  voice set, default today's `attack` voice.
- `fx-holds.mjs`: unchanged (`attack 240` remains the lunge/aura hold; scores return theirs).
- CSS: `.fx-move`, `.fx-move__ghost`, `.fx-move__lane`, `.fx-move__shape--*`, `.fx-move__aura--*`,
  `.fx-move__terrain--*`, `.fx-move__vignette` in `mat-fx.css`; colours only via custom properties.
- Budget check (worst case, tier 3): banner 620 + score hold 1240 + damage 180 + status 260 =
  2300 < 2500; a KO after that collapses holds past the budget exactly as today.

### Timing by tier (every score fits these; the per-move numbers are in Appendix A)
| Tier | Duration | Contact | Hold returned | Read |
|---|---|---|---|---|
| 1 | 900–1100 ms | ~45 % | contact + 40 | one gesture, one hit |
| 2 | 1200–1500 ms | ~50 % | contact + 40 | wind-up, travel, hit, settle |
| 3 | 1600–2200 ms | ~55 % | contact + 40 | charge, release, sustained hit, aftermath |

### Both seats, geometry and layers
- All beats are lane-relative; `turn = frameTurnOf(attackerElement)` rotates ghost art only.
- Layers (z within the host): `terrain` (under both cards' footprints) < `lane` < `attacker`
  ghost < `defender` overlays < `vignette` (local darkening around one card, ≤ 1.6 card
  heights, max alpha 0.45) — the only allowed descendant of the sprite games' full-screen tints.
- Contact: the defender's existing `strikeTarget` flash/slash/sparks still land at `contactMs`
  through the impact queue; scores add their own impact dressing (rings, shards, pillars) and
  never duplicate the damage number.

## Edge cases & failure modes — the completeness contract; Builder ticks every row
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | attacker or defender rect missing (card gone, collapsed, hidden tab) | `attack` returns 0 (no scene, no strikeIn), `damage` still pops its number as today | [ ] |
| 2 | `defenderId` absent (resume path) or bench-only attack | target = opponent's Active rect if any, else aura pulse; bench hits land at contact as today | [ ] |
| 3 | zero-damage attack (`damage === 0`, no `benchDealt`) | aura pulse on the attacker, hold 240, no contact flash | [ ] |
| 4 | species unresolved (`pokemonSpriteForName` null, unknown slug, fan-art Mega without stats) | stats null → seeded coin; a Z-A Mega uses its base species' stats (listed in `SPECIES_FALLBACKS`) | [ ] |
| 5 | `atk === spa` or within `CLOSE_STAT_GAP` | seeded coin from `instanceId`; identical on both clients; stable all game | [ ] |
| 6 | N/A cell (7 cells) | resolves through the option-8 chain; unit test asserts every table cell resolves to a non-empty list | [ ] |
| 7 | Normal-type species on a Colorless card | `moveFor` null → today's lunge | [ ] |
| 8 | Tera / off-type printing (species has no type in the printed family) | printed type's default VG type | [ ] |
| 9 | card with no `stage`, GX with `evolvesFrom`, `subtypes` carrying the stage | rule-box check first, then `collapseStage` of `stage || subtypes[0]`; GX/V/ex → 3 regardless | [ ] |
| 10 | multi-move cell | candidate seeded by `(instanceId, attackName)`; same attack → same move all game | [ ] |
| 11 | two attacks in one batch (copy attacks, "attack twice") | FX queue serialises the plans; the impact queue keeps the max contact per macrotask batch, as today | [ ] |
| 12 | attacker KO'd by its own attack / discarded mid-scene | rects from `peekCombatOrigin`; ghost art from the snapshot; overlays self-remove | [ ] |
| 13 | fx turned off mid-scene | `body.fx-off .fx-overlay` hides every layer; backstops clean up | [ ] |
| 14 | reduced motion | dispatcher plays `STATIC_FALLBACKS` (no `attack` entry) → no scene; voice still plays (sound ≠ motion) | [ ] |
| 15 | no WAAPI / no 2D context | `animateFrames` applies the end frame; `playCanvasStage` resolves; host removed by backstop | [ ] |
| 16 | opponent is the attacker (180° frame) | ghost art turned by `frameTurnOf`; lane math unchanged | [ ] |
| 17 | narrow viewport (phone width, cards ~90 px) | sizes are fractions of the card rect; particle counts unchanged; vignette clamps to the viewport | [ ] |
| 18 | FX queue flood (catch-up burst) | holds collapse past 2500 ms; scenes still self-remove; dropped batches play nothing (queue `clear`) | [ ] |
| 19 | score table drift (a spec move without a score, a score outside its band) | `score-schema.test.mjs` enumerates `MOVE_TABLE` × `scores` both ways and runs `validateScore` on every score | [ ] |
| 20 | data drift (new catalog slug, Showdown rename) | `vendor-species-stats` fails on an unmapped slug; `species-stats.test.mjs` pins known forms (Charizard-Mega-X 130/130 → coin; Gardevoir 65/125 → special; Machamp 130/65 → physical) | [ ] |
| 21 | `attackName` missing or empty | banner skips as today; `moveFor` seeds with `''` and still picks deterministically | [ ] |
| 22 | hidden-information card as attacker (never: an Active is always face up) | struck — the Active Spot is always revealed; no sleeve case exists | [x] struck |

## Test plan
- Unit (`node --test`, pure): `move-table.test.mjs` (table equals the spec; 154 distinct moves;
  every cell non-null after fallback), `move-select.test.mjs` (tier for every classifier and stage
  literal seen in the engine tests — 'Basic', 'Stage 1', 'Stage1', 'Stage 2', 'break', 'Stage 2
  ex'; stat class around the gap; family resolution per TCG type incl. Colorless/Tera/unknown;
  determinism of both seeds; zero-damage null), `species-stats.test.mjs`, `score-schema.test.mjs`
  (every score valid; every spec move scored; durations and contacts in band), `move-primitives.
  test.mjs` (pose ranges, clamping, lane geometry on both orientations), `move-shapes.test.mjs`
  (every shape draws ≤ N calls, uses only the palette, no throw on bad input), `fx-audio.test.mjs`
  (every family has voices; gains clamped), `combat-pose.test.mjs` (impact ctx carries `family`).
- Existing suites must stay green: `dispatcher`, `fx-holds`, `fx-queue`, `origins`.
- Visual: `.claude/skills/fx-preview/rec/rec-attack.mjs MOVE=<slug> SIDE=self|opp TIER=<n>` records
  one score on the e2e board (fake rects, real `playMoveScore`), writes frames + a WebM to
  `.agent/scratch/attack/<slug>/`; a frozen-time strip at wind-up / contact / settle. Each type slice
  ships its strips; the user judges on localhost (visual-only changes are exempt from a failing test).
- Manual: one real game turn per seat with `SERVER_AUTHORITATIVE=1`: banner → move → number → KO
  reads in order and the queue never stalls.

## Migration / rollout
- No data migration, no protocol change. The generic lunge remains the fallback for every card
  whose move is not yet scored, so types ship one slice at a time with the rest unchanged.
- Revert = revert the slice's commit; the generated stats module and the vendor script are
  self-contained.
- Reference assets (sheets, GIFs, videos) stay out of the repo; only `refs/063-move-refs.json`
  (URLs and timings) is committed so a later session can refetch.

## Work plan — slices ≤1 session, each leaving the repo green
Slices 0–2 are infrastructure and ship no new look (every attack still lunges). Slices 3–19 each
score one VG type's moves from Appendix A via `fx-designer` with `rec-attack` strips; slice 20 is
the user's pass. Every row below is a pinned contract once Appendix A is approved.
| Slice | Files (create / modify) | Signatures & data shapes | Test cases: input → expected | Rulings used (source) | Green when |
|---|---|---|---|---|---|
| 0 | create `scripts/vendor-species-stats.mjs`, `client/src/setup/netcode/mat-fx/moves/species-stats.generated.mjs`, `mat-fx/__tests__/species-stats.test.mjs`; modify `package.json` (`vendor:species-stats`), `.agent/DECISIONS.md` (at landing) | `SPECIES_STATS: Record<id,[atk,spa,...types]>`, `SPECIES_ID: Record<slug,id>`, `SPECIES_FALLBACKS: string[]`; script exits 1 on an unmapped slug | every slug of both sprite catalogs ∈ `SPECIES_ID`; `charizardmegax → [130,130,'fire','dragon']`; `gardevoir → [65,125,…]`; `machamp → [130,65,…]`; `SPECIES_FALLBACKS` lists only `-mega` fan slugs | n/a (no card text) | script + tests green; module < 120 KB |
| 1 | create `mat-fx/moves/move-table.mjs`, `move-select.mjs`, `__tests__/move-table.test.mjs`, `__tests__/move-select.test.mjs` | as in § Selection; `moveFor` returns `{move,vgType,statClass,tier,family,score}` or null (score may be undefined until slice 2 — `moveFor` takes `scores` as a parameter) | table = spec (154 moves); 7 N/A cells resolve; tiers for 11 classifier kinds + 6 stage literals; gap 10 → coin, 11 → fixed; Colorless+Snorlax → null; Colorless+Pidgeot → flying; Darkness+Charizard → dark; same seeds → same results ×100 | n/a | tests green; lint green |
| 2 | create `mat-fx/moves/score-schema.mjs`, `move-primitives.mjs`, `move-shapes.mjs`, `move-player.js`, `scores/index.mjs` (empty maps per type), `__tests__/score-schema.test.mjs`, `__tests__/move-primitives.test.mjs`, `__tests__/move-shapes.test.mjs`, `.claude/skills/fx-preview/rec/rec-attack.mjs`; modify `combat.js`, `combat-pose.mjs` (impact ctx), `index.js` (`soundPlanFor`), `fx-audio.mjs` (14 family voice sets), `fx-audio.test.mjs`, `css/mat-fx.css` | `validateScore(score) → string[]`; `playMoveScore(opts) → {holdMs}`; `laneGeometry`; one pose fn per primitive; `drawShape(ctx, shape, opts)`; `voicesFor('attack', {family})` | empty scores → every attack still lunges (snapshot of today's behaviour); a fixture score of each primitive validates and plays in jsdom-free unit tests of the pure parts; `rec-attack` renders the fixture on both seats | n/a | full `pnpm test` green; strips of the fixture score attached to the slice commit |
| 3–19 | one VG type each (order: fire, water, grass, electric, fighting, psychic, dark, steel, dragon, fairy, ghost, poison, ground, rock, flying, ice, bug): create `scores/<type>.mjs`; add shapes/canvas drawers the type needs to `move-shapes.mjs`; CSS variants | scores per Appendix A rows for that type | `validateScore` passes for each; spec ↔ scores cross-check for the type; shapes test; strips (wind-up / contact / settle, self + opp) per move | n/a | tests green; strips reviewed by the Reviewer agent against Appendix A |
| 20 | user pass on localhost; timing/palette corrections appended under Deviations | — | — | — | user sign-off per type |

## Deviations (Builder appends here during build)
—

## Appendix A — per-move animation specs
One entry per move, in the spec's order by type, physical then special. Each entry names its
reference (sprite game, 3D game, durations), the beats seen in the reference, its palette, what the
3D version adds, the board score (beats over the primitive vocabulary, lane-relative, with the
contact time), and flags (missing references, house-rule translations, open calls). The scores
here are the contract for slices 3–19; a builder adjusts numbers only inside the tier bands.

How the entries were made: one study agent per type family read every contact sheet (sprite era
first, then the 3D video) and wrote the entry in the schema of `refs/063-study/STUDY-BRIEF.md`;
the raw notes, including partial entries for the pending types, are in `refs/063-study/notes/`.
Caveat: entries from the Haiku pass (Grass special tier 3, Water special tiers 2–3, Fire special
tiers 2–3, Electric except Nuzzle) sometimes measure sprite beats from the GIF's first frame rather
than its first effect frame; their "effect frames" range on the Refs line is the ground truth.
Every "house-rule conflict" flag marks a full-screen tint, flash or sunburst in the reference that
the board score replaces with a local vignette or aura, per the house rules.

<!-- APPENDIX-A -->

_This pass covers Fire, Water, Grass, Electric (the user's test run of the study method). The other types are listed with their reference sources only; their entries follow the same schema in a later pass._

### Grass

#### Vine Whip — Grass · Physical · tier 1
Sources: sprite N2B2 (2670 ms) <https://www.pokepedia.fr/images/0/0f/Fouet_Lianes_N2B2.gif> · 3D EV (3433 ms) <https://www.pokepedia.fr/images/7/7b/Fouet_Lianes_EV.mp4>
Refs: sprite N2B2 (2670 ms, effect frames 52–85) · modern EV (3433 ms)
Sprite beats:
- 0–60 ms: one thin green vine (crescent-shaped whip stroke) swings in from the upper-left and cracks down across the defender's top-left; small pale-yellow star spark at the contact point.
- 90–120 ms: a second vine lashes diagonally from lower-left to upper-right, crossing the first (an X read over two frames); yellow-white spark plus a grey-green dust puff on the defender's centre.
- 150–210 ms: the vine recoils upward along the defender's right side as one curved stroke and vanishes.
- 120–1000 ms: ~10 small green comma/crescent flecks (leaf bits) scatter above the defender, drift slowly upward and fade out.
Screen: camera zooms/pans onto the defender before the effect (−480–0 ms) and pans back to the wide shot at 420–660 ms; no flash, no tint, no shake.
Palette: #39AD39, #00BD00, #89BC18, #EFEFCE
Modern cue: fixed side camera. A thin bright-green vine grows from the attacker's back, coils in a loop beside it (~0.9–1.5 s), then the body rears and lunges as the vine whips forward onto the target. Impact is a small yellow-white starburst with green sparks at the target (~1.7–1.8 s), green flecks linger ~0.3 s; no camera move, no shake.
Board mapping:
- 0: cardMotion(attacker, tilt) wind-up
- 180: slash(defender, blade, 1, −35°) as a green vine-arc stroke; small impactFlash(defender, #EFEFCE, low)
- 300: slash(defender, blade, 1, +40°) crossing lash; impactFlash(defender, #EFEFCE, medium); shake(card, small, 150)
- 300: burst(defender, leaf, 8, small, up) — flecks drift up and fade by 950
- contact at 300 (second lash carries the damage pop); total 1000
Flags: none

#### Razor Leaf — Grass · Physical · tier 2
Sources: sprite N2B2 (3900 ms) <https://www.pokepedia.fr/images/1/1b/Tranch%27Herbe_N2B2.gif> · 3D EV (3233 ms) <https://www.pokepedia.fr/images/f/fa/Tranch%27Herbe_EV.mp4>
Refs: sprite N2B2 (3900 ms, effect frames 48–114) · modern EV (3233 ms)
Sprite beats:
- 0–1140 ms: 12–15 almond-shaped green leaves rise and whirl in a loose column around the attacker, wrapped in a soft pale-green glow; they orbit faster and denser toward the end.
- 1140–1320 ms: the leaves peel off the attacker in a stream toward the defender, each leaf trailing small white puffs.
- 1320–1560 ms: the leaf stream passes straight through the defender on a diagonal and exits off the upper-right, white puff trail fading behind it.
- 1470–1920 ms: 6–8 thin yellow crescent slash marks cut across the defender in quick succession (criss-crossing, white-edged), then fade by 1980 ms.
Screen: camera pans onto the attacker (−240–0 ms), pans to the defender following the leaves (1200–1380 ms), pans back to the wide shot (1980–2400 ms); no flash, no tint, no shake.
Palette: #53B523, #8ED86A, #F7F731, #E8DD03
Modern cue: fixed camera. A glowing green wind ring spins horizontally around the attacker with leaves caught in it and dust puffs kicked up from the ground (~0.6–1.1 s); the leaves then scatter forward toward the target. The hit is a run of small green-yellow star sparks and thin green cut lines on the defender (~1.7–2.5 s), no single big flash.
Board mapping:
- 0: aura(attacker, wind, #53B523, 450) with leaves whirling around the card
- 400: projectile(leaf, 8, volley, fast, white puff trail, spin)
- 650: slash(defender, blade, 4, criss-cross) yellow crescents, staggered 60 ms
- 650: impactFlash(defender, #F7F731, medium); shake(card, small, 200)
- contact at 650; total 1300
Flags: none

#### Leaf Blade — Grass · Physical · tier 3
Sources: sprite IT5 (7275 ms) <https://media.pokemoncentral.it/wiki/6/68/Fendifoglia5.png> · 3D EV (4000 ms) <https://www.pokepedia.fr/images/e/e1/Lame_Feuille_EV.mp4>
Refs: sprite IT5 (7275 ms, effect frames 128–258) · modern EV (4000 ms)
Sprite beats:
- 0–350 ms: one bright-green leaf-shaped sword appears above the defender's upper-left and sweeps diagonally down-right across it, leaving 4–5 fading afterimage copies (a fan of ghost blades); it ends lying flat at the defender's feet and fades.
- 400–750 ms: a second sword drops in vertical at the upper-right and sweeps down-left across the defender, same afterimage fan, fades low-left.
- 850–1050 ms: a third sword enters horizontally from the left and sweeps right through the defender's middle with a bright green speed streak; a straight horizontal green cut line flashes across the body at ~1050 ms.
- 1100–2600 ms: ~12 small glowing green leaves pop out around the defender in a loose ring and sway in place.
- 2600–3250 ms: the leaves fade out in place.
Screen: camera pans/zooms onto the defender before the effect (−900–−175 ms) and pans back after (3350–4050 ms); no flash, no tint, no shake.
Palette: #63F763, #31F729, #317B31, #52B521
Modern cue: the attacker rears and leaps off-screen, then a hard cut to a close-up of the defender. Three huge cyan-green blade streaks cross the target (diagonal, opposite diagonal, horizontal ~1.9–2.6 s), each with a burst of white-green star sparks, radial speed lines, flying leaf chevrons and motion blur; the last horizontal cut is the biggest, with a zoom-blur camera shake. Leaves drift down as the camera cuts back.
Board mapping:
- 0: lunge(attacker→defender, long reach, windup 200)
- 350: slash(defender, blade, 1, −45°) green sword with afterimage trail
- 650: slash(defender, blade, 1, +45°) same, mirrored
- 950: slash(defender, blade, 1, 0°) horizontal; impactFlash(defender, #63F763, strong); shake(card, medium, 250)
- 950: burst(defender, leaf, 12, medium, ring) — leaves hover and fade by 1900
- contact at 950 (third cut carries the damage pop); total 2000
Flags: none

#### Absorb — Grass · Special · tier 1
Sources: sprite IT5 (12080 ms) <https://media.pokemoncentral.it/wiki/4/42/Assorbimento5.png> · 3D EV (7500 ms) <https://www.pokepedia.fr/images/2/2e/Vole-Vie_EV.mp4>
Refs: sprite IT5 (12080 ms, effect frames 48–115) · modern EV (7500 ms)
Sprite beats:
- 0–240 ms: the whole background dims to a near-black dark green and stays dim.
- 400–1200 ms: 8–10 small glowing yellow motes (white core, gold halo) appear around the defender and drift on loose wandering paths across to the attacker, gathering at its base.
- 1200–2100 ms: the attacker sprite flushes to a pale white-green silhouette while 4–6 cyan four-point sparkle stars (with a thin ring, like a crosshair) twinkle around it.
- 2100–2700 ms: the attacker's colour returns and the background brightens back to normal.
- after the effect (≈3080–3240 ms) the defender blinks (the engine's damage blink); much later (≈6640–7760 ms) the engine's HP-restore effect plays: green bubbles rise around the attacker with cyan sparkles.
Screen: full-background dim to near-black green 0–2700 ms; no flash, no shake, no camera move.
Palette: #F7F7EF, #BDA500, #E7EFCE, #31EFEF
Modern cue: fixed camera. A green glowing ring forms on the defender and contracts into a single bright-green orb (~1.1–1.7 s), which glides along the ground back to the attacker (~1.7–2.5 s); the attacker glows green with motes floating round it, then a thin cyan-green bubble ring expands around it shedding small leaves (~3.4–3.7 s). The generic heal dome (green hemisphere, cyan sparkles) follows at ~4.4–5.3 s.
Board mapping:
- 0: ring(defender, target, 1) green, contracting; vignette(defender, #1C2410, low, 500)
- 150: impactFlash(defender, #E7EFCE, low)
- 200: projectile(orb, 6 small motes, homing defender→attacker, medium, soft glow trail)
- 650: aura(attacker, light, #E7EFCE, 300); burst(attacker, fairy-light, 5, small, random) cyan
- contact at 150 (damage pops as the drain starts); total 1000
Flags: house-rule conflict — the sprite dims the whole background for ~2.7 s; replaced by a light local vignette. Uncertainty — the sprite shows the defender's damage blink only after the effect (≈3.1 s); contact placed at the drain start. The projectile runs defender→attacker (reverse lane). The generic HP-restore effect (heal bubbles/dome) is not mapped.

#### Magical Leaf — Grass · Special · tier 2
Sources: sprite IT5 (6925 ms) <https://media.pokemoncentral.it/wiki/d/df/Fogliamagica5.png> · 3D EV (3500 ms) <https://www.pokepedia.fr/images/e/e1/Feuille_Magik_EV.mp4>
Refs: sprite IT5 (6925 ms, effect frames 129–246) · modern EV (3500 ms)
Sprite beats:
- 0–1900 ms: dark-green leaves (15–20, almond-shaped) flutter down from above and swirl round the attacker in a growing loose cloud; each leaf carries a soft glow halo that cycles magenta / pink / blue / violet.
- 1925–2125 ms: the leaf cloud streams off toward the defender (camera follows).
- 2125–2625 ms: the leaves home in on the defender from several directions (curving paths), converging on it and vanishing.
- 2225–2925 ms: small pink-magenta and pale-blue four-point star sparkles pop on and around the defender one after another, then fade.
Screen: camera pans/zooms onto the attacker before the effect (−900–−100 ms), to the defender at 1925–2125 ms, back to the wide shot at 3225–3625 ms; no flash, no tint, no shake.
Palette: #086308, #E040C8, #397BE7, #F870D0
Modern cue: fixed camera. A burst of pale-green leaves plus pink and blue glowing motes erupts around the attacker (~0.6–1.1 s); the attacker flings them and the leaves fly at the target in curving paths with white four-point sparkles. Hits land as a magenta sparkle cluster on the target (~2.2–2.3 s) and finish with a yellow star burst (~2.5–2.6 s).
Board mapping:
- 0: burst(attacker, leaf, 10, medium, ring) with magenta/blue glow halos; aura(attacker, light, #E040C8, 400)
- 400: projectile(leaf, 8, homing, medium, magenta-blue glow trail, spin)
- 850: burst(defender, star, 6, small, random) pink and blue sparkles; impactFlash(defender, #F870D0, medium)
- contact at 850; total 1350
Flags: none

#### Leaf Storm — Grass · Special · tier 3
Sources: sprite IT5 (15550 ms) <https://media.pokemoncentral.it/wiki/6/64/Verdebufera5.png> · 3D EV (4567 ms) <https://www.pokepedia.fr/images/0/0f/Temp%C3%AAte_Verte_EV.mp4>
Refs: sprite IT5 (15550 ms, effect frames 126–271) · modern EV (4567 ms)
Sprite beats:
- 0–525 ms: the background fades from blue-teal to near-black; the attacker stays lit, nothing else on screen.
- 525–1225 ms: the background comes back as a bright yellow-green field with scrolling darker-green horizontal stripes (the move's own backdrop); still no effect on the sprites.
- 1225–1575 ms: a pale-green spiral swirl (two or three thin concentric rings) appears at the attacker's feet and tightens into a bright-green vortex around its body.
- 1575–1925 ms: the vortex widens into spinning ring bands with small white-cyan sparkles; 15–20 almond-shaped green leaves burst out of it and stream toward the defender in a loose fan (camera follows).
- 1925–2750 ms: the leaves whirl around the defender from all directions, some large and close, while a spiky green star-shaped burst with a white ring pulses on the defender's centre 3–4 times (~2225, 2400, 2575, 2750 ms), each pulse smaller and paler.
- 2750–3100 ms: burst and leaves fade out; the defender is left alone on the green field.
- 3100–3625 ms: the background darkens back through olive to near-black and then returns to the normal battle backdrop (≈3800 ms).
- after the effect (≈4150 ms) the defender flashes white (the engine's damage blink); much later (≈6400–7700 ms) the engine's stat-fall effect plays on the attacker (blue bubbles rising; "Special Attack harshly fell!").
Screen: camera pans/zooms onto the attacker (−700–−175 ms), to the defender at 1750–1925 ms, back to the wide shot at ≈3800 ms; full-background change to near-black then yellow-green 0–3625 ms; no flash, no shake.
Palette: #52D63A, #2E9A2E, #A8F078, #EFF7E0
Modern cue: fixed camera, then a hard cut. A green-cyan glowing disc spins at the attacker's feet with thin green wind streaks orbiting it (~1.2–2.0 s); the attacker flings an arm and giant glowing crescent leaf-swooshes whirl off toward the target (~2.0–2.4 s). Cut to a close-up of the defender inside a huge green vortex with leaves (~2.5 s), then a yellow-white starburst with orange ground glow, speed lines and flying yellow leaf bits (~2.6–3.2 s, including a brief near-white bloom at ~3.1 s); green streaks and leaves fade by ~3.7 s and the camera cuts back to the wide shot (~4.3 s).
Board mapping:
- 0: charge(attacker, leaf, 10, 450); vignette(attacker, #0F2A10, low, 600)
- 300: aura(attacker, wind, #52D63A, 450); ring(attacker, halo, 2) green, expanding from the card base
- 600: projectile(leaf, 14, spiral, fast, green glow trail, spin) fanning from the attacker to the defender
- 1000: impactFlash(defender, #A8F078, strong); shake(card, medium, 250)
- 1000: burst(defender, leaf, 14, medium, ring) whirling and fading by 1700; burst(defender, star, 6, medium, ring) spiky green-yellow
- 1150–1450: two smaller pulses burst(defender, star, 4, small, ring), no extra flash
- contact at 1000; total 1900
Flags: house-rule conflict — the sprite turns the whole background near-black then bright yellow-green for ~3.6 s, and the 3D video has a near-white bloom at ~3.1 s; both replaced by a light local vignette on the attacker and a green (not white) impactFlash on the defender. Not mapped: the engine's damage blink and the stat-fall bubbles on the attacker (the Special Attack drop is a game effect). Sprite frame 292 white silhouette is the engine blink, not part of the move.

#### Solar Beam — Grass · Special · tier 3
Sources: sprite N2B2 (10350 ms) <https://www.pokepedia.fr/images/0/06/Lance-Soleil_N2B2.gif> · 3D EV (11766 ms) <https://www.pokepedia.fr/images/c/c0/Lance-Soleil_EV.mp4>
Refs: sprite N2B2 (10350 ms, effect frames 52–335) · modern EV (11766 ms)
Sprite beats:
- 0–1560 ms: cyan-turquoise aura glows and swells around the attacker; small bright cyan sparkles orbit.
- 1560–2400 ms: aura brightens and intensifies, cyan to yellow-green gradient.
- 2400–5250 ms: bright yellow glow surrounds the attacker with small yellow-white motes drifting upward; the background fades to a pale yellow-green.
- 5250–5700 ms: white flash across the screen; background turns bright yellow-green.
- 5700–7200 ms: a stark white and yellow beam fires from the attacker across the lane toward the defender; bright cyan-green speed streaks trail behind it.
- 7200–8100 ms: the beam impacts the defender with a large bright yellow starburst; white core with green-yellow radiating tendrils; small white-yellow sparkles scatter.
- 8100–9600 ms: the starburst and sparkles fade away; background returns to normal.
Screen: full-background pale yellow-green tint 2400–5700 ms, then bright yellow-green 5700–7500 ms; white flash at 5250–5400 ms; no shake, no camera move.
Palette: #31E7B8, #52E7CE, #FFFF00, #F7F731, #EFEFEF
Modern cue: fixed camera with slow zoom to the attacker. A cyan-green aura orbits the attacker with small motes (~0.5–2.5 s); then a bright yellow-white beam charges and fires at the target (~3.0–3.7 s) with radial speed lines and a near-white bloom at the impact point (~3.8–4.2 s); green streaks and sparkles linger and fade (~4.2–5.0 s).
Board mapping:
- 0: charge(attacker, leaf, 8, 600); aura(attacker, light, #52E7CE, 600)
- 300: ring(attacker, halo, 1) cyan, expanding from the card base
- 900: impactFlash(attacker, #FFFF00, low)
- 1500: beam(orb, medium, solid, 1800, low) yellow-green firing from attacker toward defender
- 2700: impactFlash(defender, #F7F731, strong); shake(card, medium, 300)
- 2700: burst(defender, orb, 8, large, ring) yellow-white starburst with green streaks
- contact at 2700; total 3200
Flags: house-rule conflict — the sprite dims the whole background to pale yellow-green then bright yellow-green for ~3.3 s; replaced by a light local vignette. The sprite shows a full-screen white flash at ~5.3 s; replaced by impactFlash on the defender.

#### Seed Flare — Grass · Special · tier 3
Sources: sprite N2B2 (3960 ms) <https://www.pokepedia.fr/images/4/46/Fulmigraine_N2B2.gif> · 3D EV (4267 ms) <https://www.pokepedia.fr/images/1/19/Fulmigraine_EV.mp4>
Refs: sprite N2B2 (3960 ms, effect frames 38–128) · modern EV (4267 ms)
Sprite beats:
- 0–240 ms: a green seed pod with a pink-magenta stigma (star-shaped flower centre) erupts from below the defender; positioned at the defender's base.
- 240–600 ms: white sparkles and small cyan-green energy arcs orbit the seed, building outward.
- 600–900 ms: cyan-turquoise sparkles explode outward in a widening ring around the seed; the seed glows brighter.
- 900–1200 ms: the burst peaks — bright pink-magenta and cyan-turquoise petals and sparks fly radially in a star pattern; a white-cyan cross beam of energy flashes through the centre.
- 1200–1500 ms: the burst fades; scattered sparkles linger and fade.
Screen: no background change, no flash, no shake, no camera move.
Palette: #52D600, #B829F8, #31E7E7, #F7EFFF
Modern cue: a green glowing ring forms on the ground at the target (~0.5–1.0 s); a pink-magenta seed pod or bud appears in the centre (~1.0–1.3 s); then a bright burst of cyan-green and pink-magenta petals and sparks erupts outward with white energy streaks (~1.5–2.2 s); the effect fades quickly (~2.2–2.5 s).
Board mapping:
- 0: ring(defender, target, 1) green, contracting into a seed shape
- 150: orb(defender, medium, #52D600, grow-release)
- 300: burst(defender, star, 10, large, ring) pink-magenta and cyan petals; impactFlash(defender, #F7EFFF, strong); shake(card, small, 150)
- contact at 300; total 900
Flags: none

#### Petal Dance — Grass · Special · tier 3
Sources: sprite IT5 (7050 ms) <https://media.pokemoncentral.it/wiki/7/7f/Petalodanza5.png> · 3D EV (4999 ms) <https://www.pokepedia.fr/images/f/f5/Danse_Fleurs_EV.mp4>
Refs: sprite IT5 (7050 ms, effect frames 40–282) · modern EV (4999 ms)
Sprite beats:
- 0–600 ms: pink and yellow petals coalesce below the attacker into a loose flower shape; small petals surround a yellow centre.
- 600–1200 ms: the flower petals burst outward and upward in a loose spray, scattering around the attacker.
- 1200–2100 ms: petals swirl in a widening spiral around the attacker, drifting upward and spreading across to the defender; pale pink and magenta tones.
- 2100–3600 ms: petals envelope the defender in a soft cloud, swirling and slowly settling around it; the petals fade in place as the dance concludes.
- 3600–4200 ms: scattered petals continue to drift downward and fade away.
Screen: no background change, no flash, no shake; camera pans/zooms onto the attacker (−500–0 ms), follows the petals to the defender (1200–1800 ms), then pans back (3600–4200 ms).
Palette: #F770D0, #FF52C8, #E7B8F7, #F7D000
Modern cue: a burst of pink-magenta petals erupts around the attacker with white trailing sparkles (~0.8–1.5 s); the petals flow and curve toward the target in a continuous stream (~1.5–2.5 s); hit as a soft magenta-white sparkle shower on the target (~2.5–3.0 s); petals drift down and fade (~3.0–3.5 s).
Board mapping:
- 0: burst(attacker, petal, 12, medium, ring) pink-magenta with yellow centre
- 200: projectile(petal, 10, homing, medium-fast, soft pink glow trail, spin)
- 700: burst(defender, petal, 12, medium, ring) swirling and fading by 2200; impactFlash(defender, #FF52C8, medium); shake(card, small, 200)
- contact at 700; total 2200
Flags: none

#### Energy Ball — Grass · Special · tier 3
Sources: sprite N2B2 (4080 ms) <https://www.pokepedia.fr/images/2/2d/%C3%89co-Sph%C3%A8re_N2B2.gif> · 3D EV (5500 ms) <https://www.pokepedia.fr/images/e/eb/%C3%89co-Sph%C3%A8re_EV.mp4>
Refs: sprite N2B2 (4080 ms, effect frames 42–134) · modern EV (5500 ms)
Sprite beats:
- 0–450 ms: a pale yellow-green aura appears and expands around the defender; the glow intensifies from cyan to yellow-green.
- 450–900 ms: the aura reaches peak brightness; small yellow sparkles orbit within the glow.
- 900–1350 ms: the aura contracts and solidifies into a distinct bright green sphere (orb) at the defender's centre; yellow-white sparkles swirl around it.
- 1350–1800 ms: the green orb hovers, spinning slowly, with bright yellow motes trailing around it.
- 1800–2100 ms: the orb flashes and bursts; small green particles and yellow sparks scatter outward then fade.
- 2100–2700 ms: scattered sparkles and particles continue to fade away.
Screen: no background change, no flash, no shake, no camera move.
Palette: #31E731, #F7F731, #B8E731, #EFEFEF
Modern cue: a cyan-green ring forms on the ground at the target (~0.3–0.8 s); a bright yellow-green glowing sphere grows and stabilizes (~0.8–2.0 s) with yellow sparkles orbiting; then the orb contracts briefly and releases with a sharp green-yellow starburst (~2.5–3.0 s); the effect fades (~3.0–3.5 s).
Board mapping:
- 0: ring(defender, target, 1) green, expanding into a glow
- 150: orb(defender, medium, #31E731, hover) with yellow sparkles orbiting; aura(defender, light, #B8E731, 600)
- 600: impactFlash(defender, #F7F731, medium); shake(card, small, 150)
- 600: burst(defender, orb, 6, small, ring) green-yellow sparkles fading by 1200
- contact at 600; total 1600
Flags: none

### Water

#### Aqua Jet — Water · Physical · tier 1
Sources: sprite N2B2 (4020 ms) <https://www.pokepedia.fr/images/2/25/Aqua-Jet_N2B2.gif> · 3D EV (3501 ms) <https://www.pokepedia.fr/images/6/64/Aqua-Jet_EV.mp4>
Refs: sprite N2B2 (4020 ms, effect frames 30–120) · modern EV (3501 ms)
Sprite beats:
- 0–420 ms: no effect shapes; camera drops low behind the attacker and pushes in on it.
- 450–630 ms: attacker sprite tilts forward and shrinks as it leaps into the distance toward the defender; gone at 630.
- 690–1050 ms: pale-cyan water spouts (flame-shaped vertical jets, ~1/3 screen tall) burst up where the attacker stood, with flat white speed streaks skimming the ground; a new jet appears each few frames as the camera tracks along the lane.
- 1110–1710 ms: camera reaches the defender; 3–4 tall blue water columns stream past and through the defender left→right, white ground streaks under them.
- 1770–2280 ms: one tall blue column stands on the defender (contact ≈1770); ~15 cyan droplets fly out in a ring and fall; white sparkle specks around the base.
- 2340–2700 ms: column gone; a white/grey sparkle mist hangs over the defender, drifts up and fades.
Screen: camera push-in 0–420, camera track attacker→defender 690–1110, camera return ≈2880–3000; no tint, flash or shake.
Palette: #A8D8E8, #88C8F8, #3898C8, #F0F8F8
Modern cue: camera cuts low behind the attacker, which is wrapped in a swirling translucent water shell crossed by thin white speed lines; the water mass rushes the camera (motion blur). Cut to the defender: white splash puff on contact (≈1.97 s) and 3–4 thin white arcs expanding over the defender, a few droplets hang and fade.
Board mapping:
- 0: aura(attacker, water, #88C8F8, 250)
- 200: dash(attacker→defender, stop, trails: gust-line white streaks + droplet spray)
- 450: impactFlash(defender, #A8D8E8, medium) + burst(defender, droplet, 12, 0.6 card, ring)
- 450–750: pillar(defender, water, 0.8 card) + ring(defender, halo, 2)
- contact at 450; total 1000
Flags: none

#### Waterfall — Water · Physical · tier 2
Sources: sprite N2B2 (3600 ms) <https://www.pokepedia.fr/images/9/99/Cascade_N2B2.gif> · 3D EV (4333 ms) <https://www.pokepedia.fr/images/9/94/Cascade_EV.mp4>
Refs: sprite N2B2 (3600 ms, effect frames 30–108) · modern EV (4333 ms)
Sprite beats:
- 0–240 ms: no effect shapes; camera pushes in on the attacker.
- 300–420 ms: background darkens to black around both Pokémon.
- 480–600 ms: background fades into a full-screen scrolling waterfall: blue and lilac zigzag bands falling downward (stays until 2100).
- 600–1080 ms: 6–8 small clear bubbles (white rim, transparent) rise and cling around the attacker.
- 1080–1200 ms: camera rushes past the attacker toward the defender (attacker swells in the foreground, then leaves frame) — the charge.
- 1200–1740 ms: contact ≈1200; defender sprite blanched grey-white; periwinkle and deep-blue paint-splat blobs (4–6, irregular star-edged) burst out of the defender's top and bob upward, small blue dots scatter; thin white vertical water streaks pour down over the defender; 1–2 white star hit sparks at its base.
- 1800–2100 ms: splats gone, defender colour returns; waterfall background still scrolling.
- 2160–2340 ms: background fades to black, then back to normal at 2400.
Screen: camera push-in 0–240; black fade 300–420; full-screen waterfall background 480–2100; black fade 2160–2340; camera rush toward defender 1080–1200. No shake.
Palette: #4888C8, #C8B8D8, #7888F8, #1818F0
Modern cue: a frothy white-blue geyser erupts from the ground at the attacker (≈1.0–2.0 s) while it rears; the attacker lunges and a churning water column bursts up under the defender (≈2.2–3.5 s), spray fanning sideways, with 5–6 repeated yellow-white star flashes as the water pummels it; foam fades by 3.7 s. Camera low and close on the defender for the hit.
Board mapping:
- 0: pillar(attacker, water, 0.6 card) + cardMotion(attacker, crouch)
- 250: vignette(defender, #4888C8, 0.35, 900)
- 300: lunge(attacker→defender, reach 1.0, windup 150)
- 550: impactFlash(defender, #C8D8F8, strong) + pillar(defender, water, 1.2 card) + burst(defender, droplet, 12, 0.8 card, up)
- 650–1100: burst(defender, droplet, 8, 0.5 card, down) for the falling white streaks
- contact at 550; total 1300
Flags: house-rule conflicts — sprite blacks out the background twice and swaps the whole background for a scrolling waterfall pattern (480–2100); translated to a defender vignette.

#### Liquidation — Water · Physical · tier 2
Sources: 3D EV (4533 ms) <https://www.pokepedia.fr/images/6/6c/Aqua-Br%C3%A8che_EV.mp4>
Refs: sprite none · modern EV (4533 ms, effect frames 22–112)
Sprite beats:
- none (Gen VII move, no sprite animation). Beats below are read from the EV video, t = 0 at frame 22.
- 0–1040 ms: whole scene tints lilac/indigo; attacker wrapped in a translucent blue water aura — flame-like water tongues licking over its body, small bubbles rising, ripple rings on the ground beneath it, a white-blue glint pulsing on its back.
- 1110–1180 ms: attacker surges forward toward the defender, water streaming off it.
- 1240–2280 ms: cut to the defender; flurry of ~10 cartoon impact pops around it: 4-point yellow and coral-red stars and cyan water puffs/curls, each living 100–200 ms, scattered left and right of the defender.
- 2280–2350 ms: one big yellow-white flash star with orange spikes on the defender — the final hit (contact).
- 2420–2620 ms: an expanding cyan bubble-sphere shockwave around the defender with white radial spike lines and a few floating bubbles.
- 2690–3020 ms: blue water ribbons and droplets fall away and fade; the tint lifts.
Screen: whole-scene lilac tint 0–3020; camera cut attacker→defender at 1240; no shake.
Palette: #3898E8, #48E0F0, #F0E890, #E87060
Modern cue: water aura reads as a living skin of blue flame-like water on the attacker plus ground ripple rings; the hit is a comic brawl of yellow/coral stars and cyan puffs ending in a big white-yellow star, then a cyan spherical shockwave with radial white spikes and bubbles; ribbons of water drip off.
Board mapping:
- 0: aura(attacker, water, #3898E8, 400) + ring(attacker, ripple, 2)
- 350: lunge(attacker→defender, reach 1.0, windup 200)
- 600, 720: burst(defender, star, 2, 0.4 card, random) — pre-hit pops, no damage
- 850: impactFlash(defender, #F8F0C0, strong) + ring(defender, shockwave, 1) + burst(defender, bubble, 10, 0.8 card, ring)
- 950–1250: burst(defender, droplet, 8, 0.6 card, down)
- contact at 850 (last pop carries the damage); total 1350
Flags: missing refs — no sprite-era animation (Pokémon Central has no Gen 3–5 animation either), modern only; house-rule conflict — the video tints the whole scene lilac for the whole move (dropped).

#### Wave Crash — Water · Physical · tier 3
Sources: 3D EV (6501 ms) <https://www.pokepedia.fr/images/c/c8/Aquatacle_EV.mp4>
Refs: sprite none · modern EV (6501 ms, effect frames 48–122)
Sprite beats:
- none (Gen VIII move, no sprite animation). Beats below are read from the EV video, t = 0 at frame 48.
- 0–100 ms: the attacker turns into a translucent blue water shell.
- 200–1070 ms: a swirling water vortex spins flat on the ground around the attacker: white foam ring churning, blue bubbles rising off it, thin white light streaks radiating outward, deep-blue glow at its core.
- 1170–1470 ms: the vortex collapses into a dense white froth cloud around the attacker, which then scatters into foam flecks.
- 1570–1870 ms: the attacker rides forward on a curling cyan-white wave toward the defender, white streak arcs trailing.
- 1970–2270 ms: crash: a huge cyan-white radial splash bursts out of the defender, filling most of the frame, motion blur (contact ≈1970).
- 2370–2570 ms: sheets of blue water and spray streaks settle and fade.
- (≈3400 ms on: the attacker is shown again for the recoil text; no visible recoil effect.)
Screen: camera cuts to a low side view of the attacker (frame 33), whip-pans with the charge (≈1570), close on the defender for the crash; motion blur 1970–2270; no tint.
Palette: #5898F8, #98E8F8, #E8F8F8, #2850E0
Modern cue: a ground vortex of churning foam and bubbles winds up around the attacker like a whirlpool, then the attacker surfs a curling wave and the impact is a radial cyan-white splash explosion with blur that briefly fills the frame; water sheets drip down after.
Board mapping:
- 0: aura(attacker, water, #5898F8, 1100) + terrain(attacker, wave) spinning foam ring
- 900: cloud(attacker, mist, 0.9 card, up) white froth puff
- 1050: dash(attacker→defender, stop, trails: wave crest + foam flecks)
- 1350: impactFlash(defender, #E8F8F8, strong) + burst(defender, droplet, 20, 1.2 card, ring) + ring(defender, shockwave, 1) + shake(card, medium, 300)
- 1450–1900: cloud(defender, mist, 1.0 card, down) settling spray; cardMotion(attacker, recoil) on the ghost's return
- contact at 1350; total 2000
Flags: missing refs — no sprite-era animation (Pokémon Central has none either), modern only; house-rule conflict — the video's crash splash fills most of the frame (kept local to the defender).

#### Aqua Tail — Water · Physical · tier 3
Sources: sprite IT5 (6681 ms) <https://media.pokemoncentral.it/wiki/8/86/Idrondata5.png> · 3D EV (3500 ms) <https://www.pokepedia.fr/images/8/84/Hydro-Queue_EV.mp4>
Refs: sprite IT5 (6681 ms, effect frames 44–128) · modern EV (3500 ms)
Sprite beats:
- 0–260 ms: no effect shapes; camera pushes in on the attacker.
- 310–1450 ms: wind-up, body only: the attacker sprite sways, flattens to the left, rears up tall, then settles back (tail-swing pose).
- 1530–1980 ms: 12–15 large clear bubbles (white rims, pale-cyan fill) spray sideways out of the attacker in two clusters, drift outward and shrink; 3–4 concentric white ripple rings spread on the floor under the attacker, the floor patch tints blue.
- 2240–2810 ms: camera pans to the defender; the blue floor tint fades.
- 2900 ms: a white-pink motion-blur crescent swipes across the top of the defender — the tail strike (contact).
- 2990–3250 ms: a thick white foam band wraps the defender's base and spreads sideways; white sparkle specks spray up above the defender.
- 3340–3690 ms: the foam turns lilac, sinks and fades; sparkles drift and fade.
Screen: camera push-in 0–260, pan to defender 2240–2810; no tint, flash or shake.
Palette: #F8F8F8, #A8D8E8, #4898D8, #D8C8E8
Modern cue: the attacker leaps and corkscrews out of a crown of white-cyan splash, water spiralling around it; cut to the defender as a thick translucent cyan tail-arc (a curved water tube) sweeps in from below, contact is a white star flash with a horizontal cyan water streak (≈2.3 s), then a white-blue spray burst and glittering droplets.
Board mapping:
- 0: cardMotion(attacker, spin) + ring(attacker, ripple, 3)
- 300: burst(attacker, bubble, 12, 0.8 card, ring)
- 650: lunge(attacker→defender, reach 1.0, windup 250)
- 1000: slash(defender, blade, 1, 30°) drawn as a thick cyan water crescent; impactFlash(defender, #F8F8F8, medium) + burst(defender, droplet, 14, 0.9 card, cone)
- 1100–1750: cloud(defender, mist, 1.0 card, sideways) white foam band fading lilac + cloud(defender, sparkle, 0.6 card, up)
- contact at 1000; total 1800
Flags: none

#### Water Gun — Water · Special · tier 1
Sources: sprite N2B2 (2970 ms) <https://www.pokepedia.fr/images/2/21/Pistolet_%C3%A0_O_N2B2.gif> · 3D EV (3501 ms) <https://www.pokepedia.fr/images/a/a6/Pistolet_%C3%A0_O_EV.mp4>
Refs: sprite N2B2 (2970 ms, effect frames 41–86) · modern EV (3501 ms)
Sprite beats:
- 0–120 ms: no effect shapes; camera pushes in on the attacker.
- 180 ms: a small white puff appears at the attacker's mouth.
- 240–480 ms: a chain of soft glowing cyan-white blobs (round, evenly spaced, 6–8 visible at once) streams in a straight line from the attacker to the defender's upper-left; the head reaches the defender at ≈480 (contact).
- 480–720 ms: camera pans and zooms onto the defender while the stream keeps flowing.
- 540–1170 ms: continuous stream hammers the defender; blobs bunch up and compress at the impact point, puffs of white-grey mist burst there.
- 1230–1350 ms: stream ends; leftover white mist fades on the defender.
Screen: camera push-in 0–120, pan/zoom onto defender 480–720; no tint, flash or shake.
Palette: #D8F8F8, #68F8F8, #48D8D8, #F8F8F8
Modern cue: small and quick: the attacker rears back, a white-cyan glow flares at its mouth and a short spray of water streaks shoots out; on the defender a white-cyan splash sphere bursts (≈2.2 s), water clings and drips off it. No camera change.
Board mapping:
- 0: cardMotion(attacker, tilt)
- 150: beam(droplet, 0.12 card, pulse-train, 500, low)
- 450: impactFlash(defender, #D8F8F8, light) + burst(defender, droplet, 8, 0.5 card, cone)
- 450–850: cloud(defender, mist, 0.5 card, up)
- contact at 450; total 950
Flags: none

#### Bubble — Water · Special · tier 1
Sources: sprite N2B2 (5010 ms) <https://www.pokepedia.fr/images/8/88/%C3%89cume_N2B2.gif> · 3D LPA (3001 ms) <https://www.pokepedia.fr/images/5/5c/%C3%89cume_LPA.mp4>
Refs: sprite N2B2 (5010 ms, effect frames 28–152) · modern LPA (3001 ms)
Sprite beats:
- 0–300 ms: no effect shapes; camera pushes in behind the attacker.
- 360–780 ms: one, then two small clear bubbles form at the attacker's mouth and wobble.
- 720–1140 ms: a stream of ~10 bubbles (clear, white rim, dark-teal lower crescent; mixed sizes) puffs out of the attacker in a wavy line toward the defender; camera pans to the defender 900–1200.
- 1200–1680 ms: bubbles drift slowly across in a loose wobbling cluster, swelling as they near the camera; the first reach the defender ≈1680 (contact).
- 1680–2520 ms: 8–12 bubbles crowd over the defender's body and pop one by one (simply vanish, no splash).
- 2880–3720 ms: a second, smaller wave: 10–15 small bubbles rise off the defender's body, growing as they float upward, then pop.
Screen: camera push-in 0–300, pan to defender 900–1200; no tint, flash or shake.
Palette: #E8E8E8, #387888, #A8D8E0, #285868
Modern cue: fixed wide camera; a glowing cluster of white-cyan bubbles with faint pink/lilac iridescent rims blooms at the attacker, drifts across in two clumps, envelops the defender (≈2.2 s) and pops into cyan sparkles. Soft bloom on the bubble rims, no impact flash.
Board mapping:
- 0: burst(attacker, bubble, 3, 0.3 card, cone)
- 150: projectile(bubble, 10, volley, slow, wobble, none)
- 600: impactFlash(defender, #E8F8F8, light) + burst(defender, bubble, 8, 0.6 card, random) popping
- 750–1000: burst(defender, bubble, 6, 0.5 card, up) small rising bubbles
- contact at 600; total 1000
Flags: none

#### Whirlpool — Water · Special · tier 1
Sources: sprite N2B2 (4140 ms) <https://www.pokepedia.fr/images/9/97/Siphon_N2B2.gif> · 3D EV (3999 ms) <https://www.pokepedia.fr/images/2/22/Siphon_EV.mp4>
Refs: sprite N2B2 (4140 ms, effect frames 46–126) · modern EV (3999 ms)
Sprite beats:
- 0–360 ms: (t = 0 at frame 46) the background gradually darkens toward black; the attacker does not move (camera already pushed in before this).
- 360–420 ms: background fully black, only the two sprites visible.
- 480–600 ms: a deep-blue/teal underwater backdrop with faint clear bubble outlines and vertical wavy light bands fades in over the whole screen (brightest light-blue band 840–1100).
- 660–1260 ms: contact ≈660; 8–15 glossy blue bubbles (varied sizes) pour out above the defender and stream up and to the right off the top of the frame; the defender sprite goes translucent purple-blue and sinks/bobs a few px as if submerged.
- 1260–1320 ms: backdrop fades back to black.
- 1320–1680 ms: the last dark-blue bubbles rise off the defender and fade out against black; the defender returns to normal colour.
- 2040–2400 ms: black fades back to the normal battle background.
Screen: background darken 0–420, full-screen underwater backdrop 480–1260, black 1260–2040, restore 2040–2400; no shake, no flash, no camera move.
Palette: #3890E8, #68B8F8, #1840A0, #A0D8F8
Modern cue: fixed wide side camera. The attacker flicks its tail and is wrapped in a ring of thin white-cyan water streaks that flattens into a ground vortex with small white flecks; cyan ribbon streaks shoot across to the far defender and coil into a tall, translucent cylinder of spinning cyan-white water lines around it (≈0.7–1.5 s). It ends in a yellow-white spiked star flash inside the cylinder (≈1.87 s, contact) with orange sparks, then cyan droplets scatter and fade.
Board mapping:
- 0: ring(attacker, ripple, 2) + cardMotion(attacker, tilt)
- 150: projectile(wave, 3, spiral, fast, droplet trail, spin) along the lane
- 300: vignette(defender, #1840A0, 0.35, 700)
- 350: canvas(tall translucent cylinder of spinning cyan-white streak lines over the defender, tightening, 400 ms) + cardMotion(defender, spin) on its ghost
- 650: impactFlash(defender, #E8F8F8, light) + burst(defender, bubble, 10, 0.6 card, up)
- 650–950: burst(defender, droplet, 6, 0.5 card, down)
- contact at 650; total 1050
Flags: house-rule conflicts — sprite blacks out the whole background and swaps in a full-screen underwater backdrop (translated to a defender vignette); the modern hit is a spiked yellow-white star flash (replaced by a pale impactFlash).

#### Octazooka — Water · Special · tier 2
Sources: sprite N2B2 (2550 ms) <https://www.pokepedia.fr/images/4/48/Octazooka_N2B2.gif> · 3D LPA (3100 ms) <https://www.pokepedia.fr/images/2/2e/Octazooka_LPA.mp4>
Refs: sprite N2B2 (2550 ms, effect frames 29–84) · modern LPA (3100 ms)
Sprite beats:
- 0–180 ms: no effect shapes; attacker sprite winds up and tenses, moving left.
- 180–360 ms: dark brown/grey muddy bursts (3–5, roughly round, irregular edges) erupt from the ground where the attacker was, with tan dust clouds rising; they darken and deepen.
- 360–1050 ms: the muddy bursts spread and compress into a thick, dark-brown pool on the mat; white-grey dust motes drift upward and fade.
- 1050–1500 ms: the pool darkens to near-black with a glossy rim, then fades to grey and disappears; contact ≈1050.
Screen: no camera move, tint, flash or shake.
Palette: #6B5D4F, #8B7B6F, #C8B8A8, #E8D8C8
Modern cue: red-orange mist coalesces around the attacker; black glob-like projectiles (8–12 dark spheres with slight variance in size and speed) stream across toward the defender, then impact as a white splash burst on the defender with yellow-white sparks lingering.
Board mapping:
- 0: aura(attacker, water, #6B5D4F, 400)
- 150: dash(attacker→defender, stop, trails: water droplet spray)
- 350: projectile(mud-glob, 10, volley, fast, none, none)
- 700: impactFlash(defender, #E8D8C8, medium) + burst(defender, mud-splash, 12, 0.7 card, ring)
- 800–1200: cloud(defender, mist, 0.6 card, up)
- contact at 700; total 1200
Flags: none

#### Scald — Water · Special · tier 2
Sources: sprite N2B2 (4260 ms) <https://www.pokepedia.fr/images/2/2c/%C3%89bullition_N2B2.gif> · 3D EV (8567 ms) <https://www.pokepedia.fr/images/c/c2/%C3%89bullition_EV.mp4>
Refs: sprite N2B2 (4260 ms, effect frames 40–130) · modern EV (8567 ms)
Sprite beats:
- 0–240 ms: no effect shapes; attacker sprite winds up, leaning back and raising arms.
- 240–600 ms: a thin cyan-to-blue beam (straight line, ~1/6 screen wide) forms at the attacker's hands and extends toward the defender.
- 600–1080 ms: the beam widens and brightens; contact ≈600; pale-cyan light spreads along its path.
- 1080–1500 ms: the beam fades; white-grey mist clouds coalesce around the defender's hit location.
- 1500–2100 ms: red-pink star shapes (4–6, angular, small) appear mixed in the white mist over the defender; mist continues to drift and fade.
- 2100–2400 ms: mist and stars dissipate; background returns to normal.
Screen: no camera move; background slightly desaturates 600–1500; no flash or shake.
Palette: #A8C8F8, #68B8F8, #E8C0F8, #F8E8D8
Modern cue: attacker rears back, mouth glowing cyan-white; a massive geyser of hot water bursts outward (≈2.0–2.5 s), white-cyan steam and spray fanning out in an arc; the hit lands as a white flash on the defender with repeated yellow-white sparks (≈2.5–3.5 s); foam and spray settle.
Board mapping:
- 0: cardMotion(attacker, crouch)
- 120: beam(droplet, 0.2 card, pulse-train, 700, low)
- 450: impactFlash(defender, #F8E8D8, medium) + burst(defender, spark, 8, 0.6 card, cone)
- 600–1200: cloud(defender, mist, 0.8 card, up)
- 800, 950, 1100: burst(defender, spark, 3, 0.3 card, random) for lingering sparks
- contact at 450; total 1400
Flags: none

#### Water Pledge — Water · Special · tier 3
Sources: sprite N2B2 (3420 ms) <https://www.pokepedia.fr/images/1/19/Aire_d%27Eau_N2B2.gif> · 3D EV (3500 ms) <https://www.pokepedia.fr/images/0/03/Aire_d%27Eau_EV.mp4>
Refs: sprite N2B2 (3420 ms, effect frames 38–75) · modern EV (3500 ms)
Sprite beats:
- 0–240 ms: no effect shapes; attacker sprite winds up, leaning back.
- 240–480 ms: the attacker moves left and downward; 3–4 small cyan droplets begin forming near the mat.
- 480–900 ms: cyan droplets (4–6, small spheres) streak across the lane toward the defender, some leaving faint trails.
- 900–1200 ms: contact ≈900; a tall pale-cyan pillar (vertical column, ~1.2 card tall, translucent) rises from the defender's location; its edges shimmer with lighter cyan.
- 1200–1500 ms: the pillar widens and brightens; white/pale-cyan ribbons swirl inside it; white sparkle specks drift upward from the top.
- 1500–2100 ms: the pillar fades from the bottom up; white mist settles and dissipates.
- 2100–2280 ms: final settling of residual mist.
Screen: camera nudges slightly toward the defender ≈900–1200; no tint, flash or shake.
Palette: #88D8F8, #48B8E8, #C8E8F8, #F8F8F8
Modern cue: the attacker kneels and raises both hands as water swirls up around it in a bright cyan aura; a stream of water-droplet projectiles launches across and a tall, translucent cyan pillar erupts on the defender (≈2.0–2.8 s) with white foam at its crown and white-blue radial streaks spiralling outward; the pillar collapses into falling water droplets.
Board mapping:
- 0: cardMotion(attacker, crouch)
- 150: projectile(droplet, 6, volley, medium, wobble, none)
- 400: pillar(defender, water, 1.0 card) + impactFlash(defender, #C8E8F8, light)
- 500–1200: ring(defender, halo, 3) white spiral streaks + burst(defender, spark, 8, 0.7 card, up)
- 1200–1700: cloud(defender, mist, 0.8 card, down)
- contact at 400; total 1600
Flags: none

#### Hydro Cannon — Water · Special · tier 3
Sources: sprite N2B2 (4530 ms) <https://www.pokepedia.fr/images/a/a3/Hydroblast_N2B2.gif> · 3D EV (4000 ms) <https://www.pokepedia.fr/images/b/bb/Hydroblast_EV.mp4>
Refs: sprite N2B2 (4530 ms, effect frames 36–100) · modern EV (4000 ms)
Sprite beats:
- 0–360 ms: no effect shapes; attacker sprite winds up intensely, tensing and leaning back.
- 360–900 ms: a pale-cyan orb (round, ~0.4 card diameter, glowing) forms and grows at the attacker's hands, reaching peak brightness at ≈600 ms.
- 900–1350 ms: the orb releases; a broad pale-cyan to deep-blue water column forms and travels across the lane; the attacker recoils.
- 1350–2100 ms: scene transitions to an underwater view (dark teal background with faint bubbles and light bands); the water column is now massive and brilliant, filling most of the view.
- 2100–2700 ms: contact ≈2100; white foam and light-blue splash rings ripple outward from the defender's location; small bright droplets scatter.
- 2700–3300 ms: foam settles and fades; the underwater scene gradually lightens.
- 3300–3900 ms: transition back to normal battlefield; residual mist clears.
Screen: background transition to underwater teal 1350–2100, then back to normal 3300–3900; no shake or direct flash.
Palette: #A8D8F8, #5898E8, #1860D8, #E8F8F8
Modern cue: the attacker unleashes a massive cylindrical water beam from its mouth, bright cyan-white with concentric rings of water texture; it travels across and impacts the defender as a explosive white-blue sphere burst (≈2.0–2.5 s) with radial streaks and heavy spray; water sheets cascade downward and droplets linger.
Board mapping:
- 0: aura(attacker, water, #5898E8, 600) + charge(attacker, orb, 1, 500)
- 450: lunge(attacker→defender, reach 1.1, windup 300)
- 900: impactFlash(defender, #E8F8F8, strong) + ring(defender, shockwave, 1) + burst(defender, droplet, 16, 1.0 card, ring)
- 1000–1600: cloud(defender, mist, 0.9 card, down)
- 1100, 1250: burst(defender, spark, 6, 0.4 card, up)
- contact at 900; total 1700
Flags: house-rule conflict — sprite transitions to underwater view; kept as unified land-based animation in board mapping.

#### Hydro Pump — Water · Special · tier 3
Sources: sprite N2B2 (3600 ms) <https://www.pokepedia.fr/images/c/ca/Hydrocanon_N2B2.gif> · 3D EV (4500 ms) <https://www.pokepedia.fr/images/f/f1/Hydrocanon_EV.mp4>
Refs: sprite N2B2 (3600 ms, effect frames 36–78) · modern EV (4500 ms)
Sprite beats:
- 0–180 ms: no effect shapes; attacker sprite winds up, leaning back and tensing.
- 180–540 ms: a medium-sized pale-cyan orb (glowing, ~0.3 card diameter) forms at the attacker's hands; it pulses slightly.
- 540–900 ms: the orb releases as a continuous bright cyan-white beam (slightly conical, wide at the base) that extends toward the defender.
- 900–1380 ms: contact ≈900; the beam hits; white-cyan splash puffs erupt from the defender's location; 5–8 white star-shaped sparks scatter outward at high speed.
- 1380–1800 ms: lingering white-grey mist clouds hang over the defender and drift upward; cyan ripple rings expand on the mat.
- 1800–2100 ms: all effects fade to baseline.
Screen: no camera move; slight desaturation of the background during the beam 540–1380; no flash or shake.
Palette: #88D8F8, #48A8E8, #1878D0, #F0F8F8
Modern cue: the attacker opens its mouth and a bright cyan-to-white continuous water beam erupts (≈1.0–2.5 s), thick and powerful; it strikes the defender as a white-blue radial splash burst (≈2.5–3.5 s) with multiple yellow-white spark flashes interleaved, then large droplets hang and fall away.
Board mapping:
- 0: cardMotion(attacker, tilt)
- 150: charge(attacker, orb, 1, 300)
- 350: beam(droplet, 0.25 card, pulse-train, 800, medium)
- 650: impactFlash(defender, #F0F8F8, strong) + burst(defender, spark, 10, 0.8 card, cone)
- 750–1200: ring(defender, ripple, 2) + cloud(defender, mist, 0.7 card, up)
- 850, 950: burst(defender, spark, 4, 0.35 card, random)
- contact at 650; total 1500
Flags: none

#### Surf — Water · Special · tier 3
Sources: sprite N2B2 (4020 ms) <https://www.pokepedia.fr/images/5/5e/Surf_N2B2.gif> · 3D EV (4000 ms) <https://www.pokepedia.fr/images/e/ec/Surf_EV.mp4>
Refs: sprite N2B2 (4020 ms, effect frames 45–89) · modern EV (4000 ms)
Sprite beats:
- 0–300 ms: no effect shapes; the background gradually transitions to a light-tan sandy beach view with bright blue ocean on the far side; attacker sprite moves and poses.
- 300–900 ms: a tall, translucent bright-cyan wave crest (curved, ~1.5 card tall) builds on the defender's side of the screen, with white foam at its peak and fine white spray lines radiating outward.
- 900–1350 ms: contact ≈900; the wave crashes down explosively in a wide arc of white foam and blue water sheets; motion blur streaks emphasize the impact.
- 1350–1800 ms: white spray and foam particles scatter outward and fall; cyan ripple rings spread on the mat beneath the defender.
- 1800–2400 ms: foam fades to pale white mist; water sheets dissipate and settle; residual spray drifts up and vanishes.
- 2400–3000 ms: the background transitions back to the normal battlefield view.
Screen: background shift to beach/ocean 300–2400; no camera pan; no tint or direct flash; subtle motion blur 900–1050.
Palette: #48B8E8, #88D8F8, #1878D0, #F8F8F8
Modern cue: camera pulls back for a wide view; the attacker leaps onto a curling cyan-white wave crest; the wave surges forward with white foam churning at its peak; it crashes spectacularly on the defender (≈2.0–3.0 s) as a massive radial white-blue splash, spray fanning in all directions with motion blur, then water cascades off in sheets.
Board mapping:
- 0: terrain(table, wave) growing wave crest on the defender side
- 300: ring(defender, ripple, 1) pre-impact water rings
- 500: lunge(attacker→defender, reach 1.2, windup 400) attacker rides the wave
- 800: impactFlash(defender, #F8F8F8, strong) + burst(defender, droplet, 18, 1.2 card, ring) + ring(defender, shockwave, 1)
- 900–1300: cloud(defender, mist, 1.0 card, down) falling spray
- 1000, 1150: burst(defender, droplet, 8, 0.6 card, random)
- contact at 800; total 1800
Flags: house-rule conflict — sprite background shifts to beach/ocean scene; kept as table-only terrain effect in board mapping.

### Fire

#### Flame Charge — Fire · Physical · tier 1
Sources: sprite N2B2 (4710 ms) <https://www.pokepedia.fr/images/8/86/Nitrocharge_N2B2.gif> · 3D EV (5500 ms) <https://www.pokepedia.fr/images/4/48/Nitrocharge_EV.mp4>
Refs: sprite N2B2 (4710 ms, effect frames 36–142) · modern EV (5500 ms)
Sprite beats:
- 0–60 ms: camera pushes in on the attacker (no effect shapes yet).
- 60–810 ms: ~10 fat flame puffs (yellow core, red rim) spawn at the attacker's feet and climb its side in a vertical loop that encircles the body; the attacker sprite is re-tinted red-orange for the whole charge.
- 870–1950 ms: the puffs swirl down and clump around the lower body, pulsing; the attacker squashes into a crouch (1770–1950 ms).
- 1950–2400 ms: the attacker springs forward-right out of frame; no projectile, the camera follows it toward the defender.
- 2640–2760 ms: white 4-point star with a red/orange fire rim flashes on the defender's centre — contact.
- 2820–3180 ms: ~12 small flame puffs form a ring round the defender, rise and spread upward, then fade to translucent smoke.
Screen: camera push-in on attacker 0–60 ms; camera tracks the charge and pans/zooms to the defender 1950–2580 ms; pans back 3240–3600 ms. No background tint, no full-screen flash, no shake.
Palette: #EF0601, #F16E02, #F2B201, #F4ED01
Modern cue: red-orange flame ribbons spiral round the attacker as a hollow swirl shell (~0–470 ms after first effect), it hops, curls up and is wrapped in a glowing yellow-orange fire sphere crackling with streaks, then rams off-screen; impact is a local white-gold spiky starburst on the foe (~1430 ms) with sparks drifting off. A separate Speed-up swirl (white/pink wind rings round the attacker) follows the hit — stat effect, not part of the attack.
Board mapping:
- 0: aura(attacker, flame, #F16E02, 400) + cardMotion(attacker, crouch)
- 380: dash(attacker→defender, stop, trails: ember)
- 600: impactFlash(defender, #FFF4E0, medium) + burst(defender, flame, 8, small, ring)
- 650–950: burst(defender, ember, 10, 0.6 card, up) fading out
- contact at 600; total 1000
Flags: none

#### Flame Wheel — Fire · Physical · tier 2
Sources: sprite N2B2 (3720 ms) <https://www.pokepedia.fr/images/b/b3/Roue_de_Feu_N2B2.gif> · 3D EV (3500 ms) <https://www.pokepedia.fr/images/c/c2/Roue_de_Feu_EV.mp4>
Refs: sprite N2B2 (3720 ms, effect frames 44–110) · modern EV (3500 ms)
Sprite beats:
- 0–540 ms: camera slowly pushes in on the attacker (no effect shapes yet).
- 540–1080 ms: a chain of ~8 small flame balls (yellow core, red rim) appears behind the attacker and orbits it in one vertical wheel — down the back, under the feet, up the front, over the top — the balls growing as they go.
- 1080–1260 ms: the attacker lunges forward-right out of frame; no projectile, the camera pans to the defender.
- 1320–1500 ms: white 4-point star flashes on the defender's centre while ~12 small flame flecks spray out from it in a ring — contact at ~1380 ms.
- 1560–1980 ms: ~8 larger flame puffs scattered round the defender float up and outward, shrink and fade.
Screen: camera push-in on attacker 0–540 ms; pan/zoom to the defender 1080–1320 ms; pan back 2040–2340 ms. No tint, no full-screen flash, no shake.
Palette: #D02A0B, #F0700C, #F3CB11, #FFFFFF
Modern cue: attacker's back flames flare and drip sparks, it drops to all fours and is swallowed by a tall column of yellow fire that tightens into a spinning upright fire hoop (a 3D ring volume, dark scorch streaks in it); the camera follows the hoop as it rolls at the foe with speed streaks. Impact is a white-hot core inside the wrapping ring plus a spray of embers (~1730 ms after first effect); the foe recoils.
Board mapping:
- 0: aura(attacker, flame, #F0700C, 500) + canvas(ring of 8 ember balls orbiting the attacker card once, growing)
- 450: cardMotion(attacker, spin) + dash(attacker→defender, stop, trails: flame)
- 750: impactFlash(defender, #FFF4E0, medium) + burst(defender, ember, 12, 0.6 card, ring)
- 800–1300: burst(defender, flame, 8, 1 card, up) drifting out and fading
- contact at 750; total 1350
Flags: none

#### Fire Punch — Fire · Physical · tier 3
Sources: sprite IT5 (6200 ms) <https://media.pokemoncentral.it/wiki/0/0e/Fuocopugno5.png> · 3D EV (3501 ms) <https://www.pokepedia.fr/images/9/9e/Poing_Feu_EV.mp4>
Refs: sprite IT5 (6200 ms, effect frames 92–241) · modern EV (3501 ms)
Sprite beats:
- 0–300 ms: camera swings off the attacker and zooms onto the defender.
- 300–1050 ms: the whole background ramps from blue/teal to deep crimson; then the defender sprite itself turns pink-red (1125–1200 ms).
- 1275–1425 ms: one big translucent dark-red fist appears over the defender and shrinks fast onto it (comes "out of the screen"), ending as a small solid red fist pressed on the defender's head.
- 1425–1650 ms: fist holds on the defender.
- 1725–2000 ms: the fist bursts into a dense clump of yellow-orange fire over the defender — contact at ~1725 ms.
- 2000–2475 ms: the clump breaks into ~15 flame flecks that scatter out and up, drift and fade; the fist fades out by ~2525 ms.
- 2475–3725 ms: defender stays red-tinted; red background fades back to blue as the camera pans back (2800–3725 ms).
Screen: camera pan/zoom to the defender 0–300 ms and back 2800–3725 ms; full-screen crimson background tint (~#8A1A1A) 300–3725 ms. No white flash, no shake.
Palette: #D1070F, #EB7000, #F1AB00, #EDD500
Modern cue: the attacker only winds up (no fire on it); cut to the foe, where a giant stylised yellow fist with an orange flame outline slams in from the side, yellow spiky impact lines radiate, the fist squashes flat against the foe, then dissolves into orange flame wisps and rising embers. Contact ~130 ms after the fist appears; no screen tint.
Board mapping:
- 0: vignette(defender, #8A1418, 0.45, 1700) fading in over 500 ms
- 300: lunge(attacker→defender, reach 0.85, windup 300)
- 650: canvas(large red-orange flaming fist over the defender, scaling 1.6→1.0 onto the card in 250 ms)
- 900: impactFlash(defender, #FFD24A, strong) + burst(defender, flame, 10, 0.8 card, ring) + shake(card, small, 250)
- 950–1600: burst(defender, ember, 12, 1 card, up) fading; aura(defender, flame, #EB7000, 500)
- contact at 900; total 1800
Flags: house-rule conflict — sprite tints the whole background crimson for ~3.4 s; replaced by a vignette around the defender.

#### Ember — Fire · Special · tier 1
Sources: sprite N2B2 (2670 ms) <https://www.pokepedia.fr/images/e/ec/Flamm%C3%A8che_N2B2.gif> · 3D EV (3000 ms) <https://www.pokepedia.fr/images/7/7e/Flamm%C3%A8che_EV.mp4>
Refs: sprite N2B2 (2670 ms, effect frames 32–84) · modern EV (3000 ms)
Sprite beats:
- 0–480 ms: camera pans from the attacker to the defender and zooms in; no projectile is drawn crossing.
- 480–720 ms: a single yellow teardrop flame (~¼ of the defender's height) appears on the defender's body — contact at ~480 ms — and flickers up into a taller orange/red flame tongue licking the body.
- 690–1050 ms: the defender sprite turns solid red (burn tint); the flame shrinks to small flickers at its head and goes out.
- 1050–1560 ms: defender stays red-tinted, then returns to normal as the camera pans back.
Screen: camera pan/zoom to the defender 0–480 ms, back 1200–1560 ms. No tint, no flash, no shake.
Palette: #F5D632, #F1AF0D, #EB6C06, #D22908
Modern cue: attacker rears back, a small white flash at its mouth blooms into a puff of yellow fire (≈150 ms), then a low stream of embers skims along the ground to the foe, leaving a glowing red-orange line on the floor; contact ~530 ms after first effect with a small bright spark, then embers crackle and flicker round the foe and die out over ~500 ms.
Board mapping:
- 0: cardMotion(attacker, tilt)
- 150: projectile(ember, 3, straight, fast, trail: spark, spin: none)
- 500: impactFlash(defender, #FFD866, light) + aura(defender, flame, #EB6C06, 400)
- 550–900: burst(defender, ember, 6, 0.5 card, up) fading
- contact at 500; total 950
Flags: uncertainty — the sprite draws no projectile at all (flame just appears on the defender); the lane projectile is taken from the modern ember stream.

#### Incinerate — Fire · Special · tier 2
Sources: sprite N2B2 (5070 ms) <https://www.pokepedia.fr/images/7/7c/Calcination_N2B2.gif> · 3D EV (4000 ms) <https://www.pokepedia.fr/images/0/0c/Calcination_EV.mp4>
Refs: sprite N2B2 (5070 ms, effect frames 52–146) · modern EV (4000 ms)
Sprite beats:
- 0–150 ms: a small yellow spark at the attacker's mouth swells into a fireball.
- 150–330 ms: a chain of fat fire puffs (yellow core, red rim, dark smoky tail) streams diagonally from the attacker to the defender while the camera swings to follow; head of the stream reaches the defender at ~330 ms — contact.
- 330–870 ms: the stream keeps pouring as 6–8 puffs along the lane into the defender's body, with an orange-brown smoke haze where it hits.
- 870–1050 ms: stream cuts off; its tail puff lands and splits into 2–3 separate flame columns (stacked puffs) standing on the defender.
- 1050–2280 ms: the columns burn and wander over the defender's body; the defender sprite turns solid red.
- 2160–2640 ms: flames die; the defender's head goes black with dark smoke puffs rising off it (scorched), then clears.
Screen: camera swings from attacker to defender 150–330 ms, pans back 2820–3480 ms. No tint, no flash, no shake.
Palette: #F10B00, #F36C01, #F4B001, #F3EC00
Modern cue: the attacker glows white-hot from within, then 2–3 golden-orange flame ribbons spin round it horizontally like gyroscope rings, flinging embers (~0–550 ms); one fire arc whips to the foe — a small white arc slash, then a white-yellow bloom (~870 ms) that becomes a crackling fire engulfing the foe, sparks drifting up for ~1 s before dying out.
Board mapping:
- 0: aura(attacker, flame, #F36C01, 350) + ring(attacker, halo, 2)
- 250: beam(flame, medium, pulse-train, 450, low)
- 450: impactFlash(defender, #FFE070, medium) + aura(defender, flame, #F36C01, 600)
- 500–1000: burst(defender, flame, 3, 0.5 card, up)
- 1000–1350: cloud(defender, smoke, small, up) fading
- contact at 450; total 1400
Flags: none

#### Mystical Fire — Fire · Special · tier 2
Sources: 3D EV (3500 ms) <https://www.pokepedia.fr/images/5/59/Feu_Ensorcel%C3%A9_EV.mp4>
Refs: sprite none · modern EV (3500 ms, effect frames 24–84)
Sprite beats:
- (no sprite-era animation; beats read from the EV video, t = 0 at its frame 24)
- 0–270 ms: a flame ignites at the attacker's wand/hand and is swung through the air, leaving a looping fire trail that curls over and down in front of it.
- 270–700 ms: the trail closes into an upright fire circle in front of the attacker, rimmed by a thin violet/magenta magic-circle line, with a red glow behind it.
- 700–830 ms: the circle fills with yellow fire; thin white light streaks flick out of it.
- 830–1170 ms: a huge billowing mass of yellow-orange fire laced with magenta sparkles and white streaks blasts out of the circle and rolls across to the foe (camera rides along).
- 1170–1300 ms: the fire mass reaches the foe; a white 4-point twinkle marks contact at ~1300 ms.
- 1370–1700 ms: spiky yellow impact burst with pink flame tongues; the foe is engulfed in yellow fire with magenta wisps.
- 1730–1930 ms: the fire recedes into licks at the foe's feet and dies out; the foe recoils.
Screen: camera close behind the attacker, tracks the fire mass to the foe 830–1300 ms, cuts back 1930–2130 ms. No tint, no flash, no shake.
Palette: #F9920B, #FCCF31, #FDEF53, #FB92F9
Modern cue: the defining read is the hand-drawn fire circle (a flat glowing ring volume with a magenta rim) that then vents a soft volumetric fireball cloud; magenta sparkle particles ride inside the yellow fire; the hit is a spiky yellow starburst plus an engulfing yellow-pink flame cloud on the foe.
Board mapping:
- 0: aura(attacker, flame, #FCCF31, 400) + canvas(fire trail drawn as one upright loop over the attacker card, magenta rim)
- 400: ring(attacker, halo, 1) in #FB92F9
- 550: beam(flame, wide, widening, 350, medium) with magenta sparkle flecks
- 900: impactFlash(defender, #FFF3B0, strong) + burst(defender, spark, 10, 0.8 card, random) in #FDEF53/#FB92F9
- 950–1350: aura(defender, flame, #F9920B, 400) fading
- contact at 900; total 1350
Flags: missing refs — no sprite-era animation (manifest sprite: null; Pokémon Central has no Gen 3–5 file); modern video only.

#### Lava Plume — Fire · Special · tier 2
Sources: sprite N2B2 (3390 ms) <https://www.pokepedia.fr/images/3/34/%C3%89bullilave_N2B2.gif> · 3D EV (4500 ms) <https://www.pokepedia.fr/images/2/23/%C3%89bullilave_EV.mp4>
Refs: sprite N2B2 (3390 ms, effect frames 38–112) · modern EV (4500 ms, effect frames 0–89)
Sprite beats:
- 0–360 ms: large red-orange explosion bursts spawn at the attacker's feet, expanding outward and upward; the attacker shakes but stays in place.
- 360–1050 ms: ~8–10 large red-orange lava sphere effects (bubble-like, darker red core, orange rim) scatter across the playfield from attacker toward defender, rising and falling; a brownish smoky haze trails behind them.
- 1050–1500 ms: lava spheres contract and fall back down; the attacker's sprite returns to normal position; effects fade to translucent smoke.
- 1650–2100 ms: a few final embers and smoke wisps drift up and vanish.
Screen: no camera motion, no background tint (green/tan battlefield visible throughout), no white flash, minor vibration during the explosion (0–360 ms).
Palette: #D1070F, #EB7000, #F1AB00, #9B6B47
Modern cue: attacker plants its feet firmly; a blue-purple ground energy glow (shockwave ripples) spreads outward from beneath the foe (~400 ms); then a massive orange-yellow lava eruption bursts upward in multiple tall geysers / plume columns engulfing the foe; magma spray and embers cascade; contact is a white-hot core flash within the plumes (~1470 ms); the foe recoils as the eruption settles into licking flames.
Board mapping:
- 0: charge(attacker, flame, 1, 600)
- 300: terrain(defender, fissure) + aura(defender, flame, #EB7000, 800)
- 450: burst(table, flame, 8, 1.5 card, scatter) with lava sphere shapes
- 900: impactFlash(defender, #FFD866, strong) + burst(defender, flame, 12, 1.2 card, ring)
- 950–1500: cloud(defender, smoke, large, up) fading; aura(defender, flame, #EB7000, 600)
- contact at 900; total 1600
Flags: none

#### Flame Burst — Fire · Special · tier 2
Sources: sprite N2B2 (2550 ms) <https://www.pokepedia.fr/images/d/d4/Rebondifeu_N2B2.gif> · 3D USUL (4040 ms) <https://www.pokepedia.fr/images/5/5a/Rebondifeu_USUL.mp4>
Refs: sprite N2B2 (2550 ms, effect frames 29–57) · modern USUL (4040 ms, effect frames 20–65)
Sprite beats:
- 0–270 ms: camera and sprites are still; no effect drawn yet (text typing).
- 270–750 ms: a cluster of light blue energy waves/ripples emanates from the attacker and spreads toward the defender, growing in size.
- 750–1200 ms: the blue wave reaches the defender; yellow-orange flame colours mix in; a burst of orange-yellow flame erupts at the defender's position — contact at ~900 ms.
- 1200–1500 ms: the flame/orange aura around the defender grows and then fades; blue glow subsides.
Screen: no camera motion, no background tint, no white flash, minor ripple shimmer during the wave (270–900 ms).
Palette: #3366CC, #FF9900, #FFCC00, #FF6600
Modern cue: a large orb of yellow-white flame with orange-red edges bursts into existence roughly midway between attacker and foe (~800 ms); it then bounces/rolls toward the foe in a smooth arc, shrinking slightly and leaving an orange smoke trail; at the foe, a secondary sparkle/impact burst (white-yellow) flashes; lingering flame wisps dissipate. Contact ~800 ms.
Board mapping:
- 0: charge(attacker, flame, 1, 400)
- 250: projectile(flame, 1, arc, medium, trail: ember, spin: none) homing toward defender
- 650: impactFlash(defender, #FFF9E6, strong) + burst(defender, flame, 6, 0.8 card, ring)
- 700–1200: aura(defender, flame, #FF9900, 500) fading; burst(defender, ember, 4, 1.2 card, up)
- contact at 650; total 1200
Flags: none

#### Blast Burn — Fire · Special · tier 3
Sources: sprite N2B2 (6540 ms) <https://www.pokepedia.fr/images/e/e0/Rafale_Feu_N2B2.gif> · 3D EV (5000 ms) <https://www.pokepedia.fr/images/d/db/Rafale_Feu_EV.mp4>
Refs: sprite N2B2 (6540 ms, effect frames 27–145) · modern EV (5000 ms, effect frames 32–98)
Sprite beats:
- 0–810 ms: static setup; text typing; background begins to tint red.
- 810–1350 ms: background is now deep red (#8A1418); large red-orange vertical fire pillar shapes emerge at the attacker's position, growing taller.
- 1350–2460 ms: pillars peak at maximum height, yellow flames mix in at the tops, creating a dense cluster; defender sprite is tinted red-orange.
- 2460–3000 ms: yellow flame pillars erupt on the defender side, reaching tall above it; the yellow flames are at peak intensity — contact at ~2460 ms.
- 3000–4050 ms: the pillars shrink and fade; the red background tint gradually fades back to normal.
Screen: full-screen red background tint (#8A1418) starting ~810 ms and fading out ~3600 ms. No white flash, no shake.
Palette: #D1070F, #EB7000, #FFD700, #FFFF00
Modern cue: attacker rears back and channels energy into a large purple-pink-core fire orb with yellow edges (~1050 ms); the orb explodes down and across toward the foe in a blast of purple and gold fire; a golden ring forms on the ground where the foe stands (~1650 ms); towering yellow-orange flame pillars erupt in a circle around the foe with golden ring arcs, engulfing the target (contact ~2450 ms); the pillars burn and gradually settle as the battlefield clears.
Board mapping:
- 0: charge(attacker, flame, 1, 800) + vignette(attacker, #8A1418, 0.4, 2700) fading in
- 400: orb(lane, large, #FFD700, grow-release)
- 1000: terrain(defender, fissure)
- 1200: pillar(defender, fire, tall) ×3 spread in an arc
- 1400: impactFlash(defender, #FFF9E6, strong) + ring(defender, shockwave, 2)
- 1450–2200: burst(defender, flame, 15, 1.5 card, ring) fading; aura(defender, flame, #EB7000, 800)
- contact at 1400; total 2100
Flags: house-rule conflict — sprite tints the entire screen red for ~2.8 s; replaced by a vignette around the defender fading in.

#### Overheat — Fire · Special · tier 3
Sources: sprite N2B2 (5130 ms) <https://www.pokepedia.fr/images/5/54/Surchauffe_N2B2.gif> · 3D EV (5499 ms) <https://www.pokepedia.fr/images/0/0b/Surchauffe_EV.mp4>
Refs: sprite N2B2 (5130 ms, effect frames 36–113) · modern EV (5499 ms, effect frames 24–109)
Sprite beats:
- 0–1080 ms: attacker (Ho-Oh) wings glow faintly with red-orange light; text typing phase.
- 1080–1440 ms: wings brighten, a large red-orange sunburst-like circular effect emerges behind the attacker's wings.
- 1440–2100 ms: the sunburst expands; yellow colours mix in at the core, making it brighter and larger; defender appears in foreground.
- 2100–2430 ms: the effect is at peak intensity with bright yellow-orange-red colors; the entire area around the defender glows.
- 2430–3300 ms: the intense glow fades slowly; the effect shrinks and cools from yellow toward red.
- 3300–3900 ms: the red glow fades back to normal; background returns to regular colors — contact at ~2430 ms.
Screen: gradual darkening/reddening of the entire screen as the glow builds (1080–2430 ms), then gradual lightening as it fades. No white flash, no shake.
Palette: #D1070F, #EB7000, #FFD700, #FFFF00
Modern cue: attacker rears up with flames licking around it; ground beneath the foe begins to glow orange; a massive burst of yellow-orange-white flame erupts upward and outward engulfing the foe; the flames are dense and billowing, with embers cascading; contact is a white-hot core flash at the foe's position (~2700 ms); the foe is surrounded by tall, intense flames that gradually cool and settle.
Board mapping:
- 0: charge(attacker, flame, 1, 1000)
- 400: terrain(defender, quake-cracks) + vignette(defender, #8A1418, 0.3, 1700) fading in
- 700: burst(table, flame, 10, 2 card, ring) rising
- 1000: impactFlash(defender, #FFF9E6, very-strong) + ring(defender, shockwave, 3)
- 1050–2000: aura(defender, flame, #EB7000, 1000) fading; burst(defender, ember, 20, 2 card, ring) fading
- contact at 1000; total 2000
Flags: none

#### Flamethrower — Fire · Special · tier 3
Sources: sprite IT5 (6600 ms) <https://media.pokemoncentral.it/wiki/1/1e/Lanciafiamme5.png> · 3D EV (4533 ms) <https://www.pokepedia.fr/images/4/4c/Lance-Flammes_EV.mp4>
Refs: sprite IT5 (6600 ms, effect frames 88–175) · modern EV (4533 ms, effect frames 44–89)
Sprite beats:
- 0–2200 ms: static field with attacker and defender in position; text typing; background is normal green.
- 2200–2650 ms: background tints red-brown; attacker's mouth begins to glow/brighten in red-orange.
- 2650–3100 ms: a continuous stream of fat red-orange flame puffs shoots from the attacker's mouth across the lane toward the defender; the puffs are large, blocky, and move swiftly — contact at ~3100 ms.
- 3100–3600 ms: the stream continues to hit the defender; large orange-yellow flame puffs accumulate around the defender's body.
- 3600–4375 ms: the stream fades out; the red background tint fades back to green.
Screen: full-screen red-brown background tint starting at ~2200 ms and fading out ~3600 ms. No white flash, no shake.
Palette: #D22908, #EB6C06, #F1AF0D, #F5D632
Modern cue: attacker (Charizard) rears back with flame building in its mouth; a white core flash (~1480 ms) then a large burst of purple-magenta-tinged yellow-orange flame erupts and travels diagonally across to the foe; thick ribbons and streaks of fire cross the lane with embers trailing; contact is a bright yellow-white core with orange flares (~1900 ms); the foe is engulfed in intense orange-yellow flame for several frames before it subsides.
Board mapping:
- 0: charge(attacker, flame, 1, 800)
- 400: beam(flame, wide, pulse-train, 650, medium)
- 700: impactFlash(defender, #FFF9E6, strong) + burst(defender, flame, 8, 1 card, ring)
- 750–1300: aura(defender, flame, #EB6C06, 600) fading; burst(defender, ember, 10, 1.2 card, up) fading
- contact at 700; total 1450
Flags: house-rule conflict — sprite tints the entire screen red-brown for ~1.4 s; replaced by localized flame aura on the defender.

### Ghost
Pending (sources in refs/063-move-refs.json): Lick, Astonish, Shadow Punch, Shadow Claw, Phantom Force, Night Shade, Hex, Ominous Wind, Shadow Ball.

### Dark
Pending (sources in refs/063-move-refs.json): Pursuit, Feint Attack, Bite, Night Slash, Throat Chop, Snarl, Dark Pulse.

### Electric

#### Nuzzle — Electric · Physical · tier 1
Sources: 3D EV (7000 ms) <https://www.pokepedia.fr/images/d/d6/Frotte-Frimousse_EV.mp4>
Refs: sprite none · modern EV (7000 ms, effect frames 33–73; later 133–170 is the paralysis status effect, not the attack)
Sprite beats:
- (no sprite-era animation; beats read from the EV video at 100 ms sheet resolution, t = 0 at its frame 33)
- 0–200 ms: the attacker hops up off the water and the camera stays wide on the beach; no effect shapes yet.
- 200–500 ms: the attacker darts toward the foe (it turns side-on and shrinks into the distance); a thin translucent white-blue ring appears round the foe's body and tightens on it.
- 500–600 ms: the attacker is back at its spot; a yellow-white spark flash blooms on the foe's body — contact at ~600 ms.
- 600–900 ms: the flash grows into a bright yellow-white crackling burst with small jagged bolts, wrapped in the white ring, then dims.
- 900–1330 ms: a few thin yellow bolt flecks and single white arc lines drift upward off the foe's head and out of frame, then nothing.
Screen: none (camera stays on the wide shot; no tint, no flash beyond the local burst, no shake).
Palette: #F6E04A, #FFF7B0, #FFFFFF, #B8E8F2
Modern cue: this is the whole reference. Camera never leaves the over-the-shoulder wide shot; the hit reads as a tiny, quick yellow spark burst plus a soft white ring on the foe, then small yellow bolt flecks rising away. Very low-key — affectionate rub, not a strike. The long blue-white spark crackle at 4400–5700 ms is paralysis.
Board mapping:
- 0: cardMotion(attacker, hop)
- 150: dash(attacker→defender, stop, trails: spark)
- 400: impactFlash(defender, #FFF7B0, light) + ring(defender, halo, 1)
- 450–800: burst(defender, spark, 6, 0.5 card, up) fading + aura(defender, spark, #F6E04A, 350)
- contact at 400; total 950
Flags: missing refs — no sprite-era animation (manifest sprite: null; Pokémon Central has no Gen 3–5 file); modern video only. Uncertainty — sheet step is 100 ms, so beat edges are ±100 ms; the white ring on the foe before contact is read from 3 tiles.

#### Thunder Fang — Electric · Physical · tier 2
Sources: sprite N2B2 (2520 ms) <https://www.pokepedia.fr/images/0/05/Crocs_%C3%89clair_N2B2.gif> · 3D EV (3500 ms) <https://www.pokepedia.fr/images/d/da/Crocs_%C3%89clair_EV.mp4>
Refs: sprite N2B2 (2520 ms, effect frames 34–83) · modern EV (3500 ms, effect frames 35–70)
Sprite beats:
- 0–180 ms: yellow glowing sphere/aura builds around the attacker's mouth, brightens.
- 180–330 ms: sphere at full bright yellow; white spark tendrils start to flicker around it.
- 330–480 ms: sparks intensify; attacker lunges toward defender (sprite moves off-frame).
- 480–600 ms: large yellow-white sparking ball appears and hovers over the defender's body.
- 600–840 ms: ball pulses and engulfs the defender; bright white core with blue jagged spiky edges — contact at ~750 ms.
- 840–1080 ms: spark ball dims and disperses into small blue-white flicker-shapes rising off the defender.
Screen: camera follows the lunge 330–480 ms, pans back to the defender 600–900 ms. No tint, no full-screen flash, minor shimmer during contact.
Palette: #FFEB42, #FFD700, #B0E0E6, #87CEEB
Modern cue: attacker's eyes and fangs glow bright yellow-white; it rears back (wind-up), then a large stylised yellow fanged bite shape (like a crescendo or curved lightning bolt) swings from the attacker's mouth toward the foe — contact ~1166 ms after the glow starts (within the EV video at frame 53); a bright white-yellow spiky starburst and sparks explode on the foe; blue-white sparkles drift upward.
Board mapping:
- 0: aura(attacker, spark, #FFD700, 350)
- 150: cardMotion(attacker, tilt)
- 300: dash(attacker→defender, stop, trails: bolt)
- 450: projectile(bolt, 1, straight, fast, trail: spark, spin: none)
- 600: impactFlash(defender, #FFFACD, strong) + burst(defender, spark, 8, 0.6 card, ring)
- 700–1000: burst(defender, bolt, 6, 0.8 card, up) fading + aura(defender, spark, #87CEEB, 400)
- contact at 600; total 1100
Flags: none

#### Wild Charge — Electric · Physical · tier 3
Sources: sprite N2B2 (4200 ms) <https://www.pokepedia.fr/images/9/94/%C3%89clair_Fou_N2B2.gif> · 3D EV (5501 ms) <https://www.pokepedia.fr/images/1/1a/%C3%89clair_Fou_EV.mp4>
Refs: sprite N2B2 (3990 ms, effect frames 24–80) · modern EV (4000 ms, effect frames 18–54)
Sprite beats:
- 0–180 ms: attacker body shakes; blue electrical aura begins to glow around the whole body, growing brighter.
- 180–480 ms: attacker crouches low; bright blue-cyan electricity pulses around it; yellow-white spark flashes flicker intermittently; charge builds.
- 480–720 ms: attacker lunges forward toward the defender; a trail of white-yellow spark streaks follows behind; the body re-tints yellow.
- 720–900 ms: large white-yellow spark cloud hovers over the defender's body; bright glow pulses.
- 900–1200 ms: spark cloud engulfs the defender in white-yellow electricity with small bolt shapes; blue edge flashes — contact at ~1050 ms.
- 1200–1500 ms: electricity dissipates into smaller rising spark flickers and fades; attacker returns to normal.
Screen: camera stays on the wide shot; no pan, no background tint, no full-screen flash, minor shimmer during charge (180–480 ms) and contact (900–1200 ms).
Palette: #00CED1, #FFE135, #FFFF00, #87CEEB
Modern cue: attacker (four-legged forme) glows bright yellow-green with an electric aura; it charges and sprints at the foe with a white-yellow electrical trail streaking behind it; impact at the foe is a bright white-yellow spiky starburst with concentric circular spark rings and blue edge flares; sparks cascade and arc upward; contact ~1400 ms after first glow effect.
Board mapping:
- 0: aura(attacker, spark, #00CED1, 500) pulsing
- 150: cardMotion(attacker, crouch)
- 300: charge(attacker, bolt, 3, 400)
- 450: dash(attacker→defender, stop, trails: bolt)
- 750: impactFlash(defender, #FFFFE0, strong) + burst(defender, spark, 12, 1 card, ring)
- 850–1400: burst(defender, bolt, 8, 1.2 card, up) fading + aura(defender, spark, #87CEEB, 600)
- contact at 750; total 1600
Flags: none

#### Thunder Shock — Electric · Special · tier 1
Sources: sprite N2B2 (2850 ms) <https://www.pokepedia.fr/images/6/67/%C3%89clair_N2B2.gif> · 3D EV (4000 ms) <https://www.pokepedia.fr/images/8/8c/%C3%89clair_EV.mp4>
Refs: sprite N2B2 (1980 ms, effect frames 6–30) · modern EV (3500 ms, effect frames 18–38; bonus frames 40–75 for paralysis status effect)
Sprite beats:
- 0–180 ms: yellow-white spark bolts flutter and crackle around the attacker's body; crackling sound implied.
- 180–360 ms: sparks grow brighter and more numerous around the attacker.
- 360–540 ms: small bright yellow-white spark bolt shoots from the attacker toward the defender (fast arc).
- 540–720 ms: the spark reaches the defender and flashes white-yellow on contact; small blue spark flecks scatter outward.
- 720–900 ms: spark afterglow fades; attacker returns to normal.
Screen: no camera motion, no background tint, no full-screen flash, no shake.
Palette: #FFE135, #FFEB3B, #FFF44F, #E0E6FF
Modern cue: attacker (Pikachu on a beach) winds up with cheek sparks glowing bright yellow-white; a single bright white-yellow spark bolt streaks from its mouth to the opponent on the far side (human trainer in modern form); the bolt hits as a sharp white-yellow flash with a small spark burst; the opponent flinches.
Board mapping:
- 0: aura(attacker, spark, #FFE135, 300)
- 150: projectile(bolt, 1, straight, fast, trail: spark, spin: none)
- 450: impactFlash(defender, #FFFFE0, light) + burst(defender, spark, 4, 0.3 card, up)
- 550–800: burst(defender, spark, 2, 0.4 card, up) fading
- contact at 450; total 900
Flags: none

#### Shock Wave — Electric · Special · tier 2
Sources: no animation file found (Poképédia, Pokémon Central)
Refs: sprite none · modern none (no animation files available)
Sprite beats:
- (no sprite-era animation and no modern video reference available; entry written from memory of the move's behaviour in modern games)
- 0–200 ms: attacker glows bright blue-white around the body; a faint rippling shimmer spreads outward from the attacker's location.
- 200–400 ms: the shimmer grows into a visible wave or series of expanding concentric rings of blue-white electricity; the first wave reaches the defender.
- 400–700 ms: multiple rings hit the defender in sequence; bright white-yellow flash on the defender's body — contact at ~400 ms.
- 700–1100 ms: the rings dissipate and fade to transparent blue static; small spark motes drift upward.
Screen: (from memory) no camera motion, no background tint, no full-screen flash, minor shimmer/ripple visual effect during the wave propagation.
Palette: #00D4FF, #87CEEB, #E0E6FF, #FFFFFF
Modern cue: (from memory, unverified) a sonic-wave-like energy ripple emanates from the attacker, forming expanding rings of blue-white electricity; the defender is engulfed in multiple concentric electric-ring impacts; the wave is purely kinetic (no projectile object), making it appear inevitable and unavoidable — matching the modern-game mechanic where Shock Wave never misses.
Board mapping:
- 0: aura(attacker, spark, #00D4FF, 300)
- 150: ring(table, shockwave, 3) expanding outward, then hitting defender
- 350: impactFlash(defender, #FFFFE0, medium) + ring(defender, target, 2)
- 450–800: burst(defender, spark, 6, 0.6 card, ring) fading + aura(defender, spark, #87CEEB, 400)
- contact at 350; total 1100
Flags: missing refs — no sprite-era animation and no modern video files (manifest sprite: null, modern video not fetched); entry written from memory of the move's behaviour in Pokémon Scarlet/Violet and is unverified against any visual reference. The "never misses" mechanic was read into the wave nature but has no visual source.

#### Electro Shot — Electric · Special · tier 3
Sources: 3D EV (14467 ms) <https://www.pokepedia.fr/images/9/90/Fulgurayon_EV.mp4>
Refs: sprite none · modern EV (7500 ms, effect frames 15–430)
Sprite beats:
- (no sprite-era animation; beats read from the EV video, t = 0 at frame 15 where the glow starts)
- 0–300 ms: the attacker (Raichu-Alola) glows bright blue-white; white streaks and sparkles flicker around the body as energy builds.
- 300–900 ms: a geometric lattice structure of blue-white lightning forms and surrounds the attacker, growing more defined and luminous; the lattice glows brighter with white-gold interior streaks.
- 900–1100 ms: the lattice structure compresses tightly around the attacker; the glow intensifies to near-white.
- 1100–1400 ms: the compressed lattice decompresses and shoots as a solid white-yellow beam toward the defender; the beam has thin blue-white edges and internal segmented lightning structure.
- 1400–1600 ms: the beam hits the defender with a massive bright white-gold starburst and spiky ray explosion; the attacker appears to discharge a secondary arc backward — contact at ~1400 ms.
- 1600–2100 ms: the explosion settles into lingering white-gold sparks and blue arcs around the defender; the sparks fade upward and out.
- 2100–2500 ms: a pinkish-purple glow appears around the attacker (stat boost effect, not part of the attack itself) and slowly fades as the animation winds down.
Screen: camera stays wide on both attacker and defender throughout; no pan, no background tint or full-screen flash, no shake; the lattice and beam provide all dramatic visual.
Palette: #00BFFF, #87CEEB, #FFD700, #FFFFFF
Modern cue: the attacker charges a complex geometric structure of blue-white lightning into a tight lattice, building intensity over ~1 s; the lattice releases as a segmented white-gold beam with blue edges that strikes the foe with an extremely bright and sharp spiky explosion; secondary arcs and trailing sparks persist long after impact, creating a "lingering discharge" effect.
Board mapping:
- 0: aura(attacker, spark, #00BFFF, 700) pulsing bright
- 200: canvas(geometric blue-white lightning lattice structure forming and tightening around the attacker card over ~800 ms)
- 600: ring(attacker, halo, 2) bright blue-white
- 900: beam(bolt, wide, segmented, 300, medium) with white-gold colour
- 1200: impactFlash(defender, #FFFFE0, very strong) + burst(defender, spark, 15, 1.2 card, random)
- 1300–1800: burst(defender, bolt, 10, 1 card, up) fading + aura(defender, spark, #87CEEB, 700)
- contact at 1200; total 2100
Flags: missing refs — no sprite-era animation (manifest sprite: null; Electro Shot is a Gen 8 move with no sprite precedent). Modern video exists but was only analysed at the 100 ms sheet resolution; beat edges are ±100 ms uncertain.

#### Thunder — Electric · Special · tier 3
Sources: sprite N2B2 (4380 ms) <https://www.pokepedia.fr/images/c/cb/Fatal-Foudre_N2B2.gif> · 3D EV (5000 ms) <https://www.pokepedia.fr/images/7/71/Fatal-Foudre_EV.mp4>
Refs: sprite N2B2 (3840 ms, effect frames 12–48) · modern EV (6600 ms, effect frames 20–98)
Sprite beats:
- 0–120 ms: the whole background (sky) gradually shifts from blue to yellow-orange; the game environment becomes tinted.
- 120–360 ms: the sky tint deepens; a dense dark-yellow cloud forms overhead; the attacker stands still.
- 360–720 ms: the cloud darkens; electrical yellow-white energy crackles inside the cloud; attacker glows faintly with yellow electricity as it channels.
- 720–900 ms: multiple massive bright yellow-white lightning bolts streak down from the cloud toward the defender; white flash on contact with the defender — contact at ~840 ms.
- 900–1200 ms: lightning bolts fade; the background colour shift reverses, sky returns to blue; faint blue-white afterglow remains.
Screen: full-screen background colour tint (yellow-orange #FF9900 → #FFFF99) from 120–1200 ms. No camera motion, no full-screen white flash beyond the impact glow, minor electrical shimmer during the discharge (720–900 ms).
Palette: #FFD700, #FFFF00, #FFD966, #FFFFFF
Modern cue: dramatic weather shift — attacker (Raichu) on a beach; dark storm clouds gather overhead (~200–600 ms); the attacker tilts/raises its ears as if channelling; a massive bright yellow-white lightning bolt descends from the clouds in one steep diagonal strike; at impact (~1000 ms), a huge white-gold explosion engulfs the defender; concentric electric rings and multiple arcing bolts radiate outward; the explosion compresses then bursts again with lingering arcs that dissipate upward over ~2 s.
Board mapping:
- 0: vignette(table, #FFD700, 0.6, 1200) fading in over 300 ms
- 150: cardMotion(attacker, tilt)
- 400: charge(attacker, bolt, 2, 500)
- 600: projectile(bolt, 3, straight, very fast, trail: spark, spin: none) descending onto defender
- 900: impactFlash(defender, #FFFACD, very strong) + burst(defender, spark, 15, 1.3 card, random)
- 1000–1800: burst(defender, bolt, 10, 1.2 card, up) fading + ring(defender, shockwave, 2) + aura(defender, spark, #FFD700, 800)
- contact at 900; total 2000
Flags: house-rule conflict — sprite tints the entire background yellow-orange for ~1 s; replaced by a vignette around the defender. Modern features weather-shift camera effects and full-screen cloud imagery; simplified to local card effects.

#### Zap Cannon — Electric · Special · tier 3
Sources: sprite N2B2 (4110 ms) <https://www.pokepedia.fr/images/3/35/%C3%89lecanon_N2B2.gif> · 3D EV (3601 ms) <https://www.pokepedia.fr/images/3/37/%C3%89lecanon_EV.mp4>
Refs: sprite N2B2 (5940 ms, effect frames 24–90) · modern EV (4500 ms, effect frames 18–34)
Sprite beats:
- 0–200 ms: attacker stands neutral; yellow-white electrical glow begins to build around the body.
- 200–480 ms: the glow intensifies to bright yellow-white; crackling and sparking sounds implied; attacker tilts slightly as it channels.
- 480–600 ms: a large dark-blue sphere of pure electrical energy materialises on the table to the left of the attacker; it glows with bright inner light.
- 600–900 ms: the sphere swells and pulses, its glow intensifying; bright yellow-white spark flickers escape from it.
- 900–1050 ms: a burst of bright yellow electric sparks and bolts shoots from the sphere toward the defender; white-yellow flash on contact — contact at ~1020 ms.
- 1050–1200 ms: a full-screen radial sunburst pattern fills the view: dense radiating blue and yellow-black electrical lines emanate from the defender (the "cannon" discharge effect).
- 1200–1500 ms: the sunburst pattern fades; attacker returns to normal stance.
Screen: full-screen radial sunburst pattern (rays of blue and yellow-black) from 1050–1200 ms (house-rule conflict: sunburst fan is not permitted; replaced by local effects). No camera motion, no background tint, no partial screen flash.
Palette: #0099FF, #00BFFF, #FFD700, #FFFF00
Modern cue: attacker (Magnezone) glows bright blue-cyan with visible electrical arcs; it charges a massive sphere of bright blue-cyan energy in front of itself; the sphere launches toward the foe in one powerful shot; impact is a brilliant cyan-white explosion with a concentrated core of white-gold light and radiating blue electrical waves.
Board mapping:
- 0: aura(attacker, spark, #0099FF, 600) pulsing
- 150: cardMotion(attacker, tilt)
- 300: charge(attacker, bolt, 4, 700)
- 550: orb(lane, large, #0099FF, hover) moving toward defender
- 800: impactFlash(defender, #FFFFE0, very strong) + burst(defender, spark, 16, 1.3 card, random)
- 900–1500: burst(defender, bolt, 12, 1.2 card, up) fading + ring(defender, shockwave, 3) + aura(defender, spark, #00BFFF, 800)
- contact at 800; total 1800
Flags: house-rule conflict — sprite includes a full-screen radial sunburst pattern (blue/yellow-black rays); this violates the "no sunburst fans" rule and is replaced by local card effects (ring + burst + aura).

### Ice
Pending (sources in refs/063-move-refs.json): Ice Shard, Avalanche, Ice Hammer, Ice Spinner, Powder Snow, Aurora Beam, Icy Wind, Ice Beam, Blizzard.

### Fighting
Pending (sources in refs/063-move-refs.json): Arm Thrust, Karate Chop, Low Sweep, Triple Kick, Close Combat, Meteor Assault, Superpower, Vacuum Wave, Aura Sphere, Focus Blast.

### Poison
Pending (sources in refs/063-move-refs.json): Poison Sting, Poison Tail, Poison Jab, Cross Poison, Acid, Sludge, Venoshock, Sludge Bomb, Sludge Wave.

### Ground
Pending (sources in refs/063-move-refs.json): Sand Tomb, Mud Slap, Bulldoze, Stomping Tantrum, Earthquake, High Horsepower, Mud Slap, Mud Shot, Mud Bomb, Earth Power.

### Flying
Pending (sources in refs/063-move-refs.json): Peck, Aerial Ace, Wing Attack, Brave Bird, Gust, Air Cutter, Hurricane, Aeroblast.

### Psychic
Pending (sources in refs/063-move-refs.json): Zen Headbutt, Psycho Cut, Confusion, Psybeam, Psychic, Future Sight.

### Bug
Pending (sources in refs/063-move-refs.json): Fell Stinger, Fury Cutter, Pin Missile, Twineedle, X Scissor, Lunge, Megahorn, Infestation, Struggle Bug, Silver Wind, Signal Beam, Bug Buzz.

### Rock
Pending (sources in refs/063-move-refs.json): Smack Down, Rock Throw, Rock Blast, Rock Slide, Rock Tomb, Head Smash, Stone Edge, Rock Wrecker, Ancient Power, Power Gem.

### Dragon
Pending (sources in refs/063-move-refs.json): Dual Chop, Dragon Claw, Outrage, Twister, Dragon Breath, Dragon Pulse, Draco Meteor.

### Steel
Pending (sources in refs/063-move-refs.json): Bullet Punch, Metal Claw, Smart Strike, Steel Wing, Iron Tail, Iron Head, Flash Cannon, Steel Beam.

### Fairy
Pending (sources in refs/063-move-refs.json): Spirit Break, Play Rough, Disarming Voice, Fairy Wind, Draining Kiss, Dazzling Gleam, Moonblast.

---
Self-approval checklist (only when the user is unreachable):
- [ ] Every constraint traceable into the Design section
- [ ] Every edge-case row has an expected behavior (or a written strike reason)
- [ ] Interfaces fully named and typed — no hand-waving
- [ ] Slices each ≤1 session and independently green
- [ ] Every slice row is pinned: files, signatures, test cases with expected values, card rulings
      cited (corpus row / TCGdex id) — no banned words; a builder would make zero choices
- [ ] No section reads "TBD"
