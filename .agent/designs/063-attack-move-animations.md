# 063: Attack move animations — type × stat class × tier
Status: draft — awaiting user approval (document only; the user deferred implementation)
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
  PokéAPI (`/api/v2/move/<slug>`) gives the French name. Pipeline:
  `scratchpad/ref/fetch-moves.mjs` → `moves/manifest.json` + contact sheets per move
  (30 tiles each, frame index on every tile). The trimmed manifest (slug, names, page, file URLs,
  frame counts, durations) is committed as `.agent/designs/refs/063-move-refs.json`.
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

<!-- APPENDIX-A -->

---
Self-approval checklist (only when the user is unreachable):
- [ ] Every constraint traceable into the Design section
- [ ] Every edge-case row has an expected behavior (or a written strike reason)
- [ ] Interfaces fully named and typed — no hand-waving
- [ ] Slices each ≤1 session and independently green
- [ ] Every slice row is pinned: files, signatures, test cases with expected values, card rulings
      cited (corpus row / TCGdex id) — no banned words; a builder would make zero choices
- [ ] No section reads "TBD"
