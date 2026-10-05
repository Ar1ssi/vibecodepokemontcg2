# 063: Attack move animations — type × stat class × tier
Status: direction approved by the user on the Fire Blast look test (2026-10-05): "Good". This
revision turns the look test into the implementation plan. Everything in § Design is a pinned
contract a builder follows without design judgment; § Builder recipe is the step-by-step for one
move. Appendix A (per-move specs) is filled for Grass, Water, Fire, Electric (43 moves); the other
13 types are pending the same study pass and their slices start with it.
Date: 2026-10-01 (draft) · 2026-10-05 (revised after the look test) · Session: S336

## Problem
Every attack on the board plays the same beat: the attacker's ghost lunges, the defender flashes,
slashes and sparks in the attacker's type colour, the table shakes (designs 022/026). The user wants
each attack to play a *move*: 154 named moves from the main-series games, picked by the attacker's
type, by whether the species hits physically or specially (its base Attack vs Special Attack), and
by its evolution tier (Basic → Stage 1 → ex/Mega/Stage 2). The look is 3D / TCG Live, with the
Black 2 & White 2 (else Black & White) sprite animations as the reference for each move's read,
and the Scarlet/Violet video as the cue for the 3D translation.

One move, Fire Blast, has been built end to end as a look test (it is not in the user's table; it
was the reference animation the user pointed at). Three takes were judged; the user's two
corrections ("material quality is poor", "the attacker and defender cards both need more motion
and weight") are now rules in this document. The accepted take is described in § What the look
test settled, and its code is the reference implementation every other move is built from.

## Constraints
- Cosmetic only (D94). Board state is applied before any plan runs; nothing gates input. Overlays
  self-remove with a backstop timer; `body.fx-off .fx-overlay` hides them. The FX queue budget is
  **3800 ms** of committed holds per batch (`fx-queue.mjs`, raised from 2500 in this design so
  banner 1600 + tier-3 move hold ≤ 1240 + damage 180 + status 260 + knockout 900 keep their holds).
- One clock (D103, D118, D119): motion is WAAPI keyframes sampled from pure pose functions; canvas
  layers redraw from a WAAPI animation's `currentTime` via `playCanvasStage`; no free-running rAF.
- **The move plays after the name banner** (user, 2026-10-05): `HOLD_MS['attack-banner']` is
  `BANNER_MS` (1600 ms), so the banner is read on its own and the move is watched on its own.
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
- Rendering: 2D canvas and DOM only, never WebGL. A scene spawns ≤ 2 canvases, 2 ghost cards,
  ≤ 24 particles per burst (`MAX_PARTICLES`), ≤ 40 DOM nodes, and only `transform`/`opacity`
  keyframes on DOM.
- Performance: canvas `filter: blur()` is the costly call in the fire material. Rule: **one blurred
  pass per tongue, blur radius ≤ 0.12 × width, ≤ 30 tongues on screen in any frame.** The headless
  software-rendered probe (see § Recording) must report median ≤ 17 ms and p95 ≤ 140 ms for a
  tier-3 scene; a GPU browser is faster. If a scene cannot meet that, drop the blur pass (keep the
  grain) rather than cut beats.

## What the look test settled (user-approved, 2026-10-05)
The accepted Fire Blast take (commits `7fbdb05`, `2fb98f4`, and the pacing commit after them) is
the visual contract. A builder reproduces these qualities for every move:
1. **Material, not gradients.** Fire is drawn as *tongues*: tapered polygons whose edges wobble
   with time (three summed sines), filled in two passes (a blurred orange body, a crisp yellow mid)
   plus a near-white core, composited with `globalCompositeOperation = 'lighter'`, with a scrolling
   value-noise *grain pass* punched out of the whole fire layer (`destination-out`, alpha 0.28).
   Fireballs are a glow halo + a fan of tongues streaming behind the direction of travel + a hot
   sphere + six shed sparks. Flat radial-gradient discs were rejected by the user.
2. **Cards have weight.** Both cards are replaced by ghost copies for the scene (the real cards
   hide once the ghost art has decoded) and move: the attacker rears back and lifts through the
   charge with a rising rim glow, lurches forward on release and springs home with a damped
   overshoot; the defender trembles as the projectile closes, takes an impulse along the lane at
   contact with squash and wobble, springs back over ~0.5 s, and carries a heat tint that cools.
3. **Contact is one moment.** The scene announces `contactMs` to the impact queue; the existing
   damage number, hit flash, slash, sparks and table shake land exactly there. The scene adds its
   own dressing at the same instant (core flash, speed lines, the 大 flare, embers).
4. **Pacing.** Banner 1600 ms, then the move; a tier-3 move is ~1900 ms with contact at ~1000 ms;
   the move's hold is `contactMs + 40`. A local red darkening (≤ 1.6 card heights, alpha ≤ 0.45)
   around the defender replaces the sprite games' full-screen tint.
5. **Geometry fact.** On this board the two Active cards nearly touch: the lane (centre to centre)
   is about 1.2 card heights, so a "travel" beat is short by nature. Scenes must still read when
   the projectile has ~0.75 h to cross; they must also read when the lane is long (a bench target).
6. **Layers.** back canvas (vignette, rings, speed lines, the halves of orbits that pass behind the
   attacker) < attacker ghost < defender ghost < front canvas (the fire) < CSS particles.

## Current state (read this session; the look-test code is on the branch)
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
  `shakeTable`. `attackBanner(plan)`: name banner + target ring. **New:** `announceStrike(ms, ctx)`
  exports the impact queue's `strikeIn` for move scenes.
- `mat-fx/combat-pose.mjs` — `LUNGE_MS 560`, `LUNGE_IMPACT 0.36`, `HIT_FLASH_MS 420`,
  `HIT_SPARKS_MS 520`, `DAMAGE_POP_MS 1100`, `SCREEN_SHAKE_MS 360`, `TARGET_RING_MS 620`;
  `createImpactQueue({ setTimer })` holds every hit/KO queued in the same synchronous batch until
  the announced contact (`strikeIn` keeps the max delay and the context).
- `mat-fx/fx-holds.mjs` — **`attack-banner: BANNER_MS` (1600)**, `attack 240`, `damage 180`,
  `status 260`, `knockout 900`, `prize-claim 320`; unknown effects pace as 0.
  `mat-fx/fx-queue.mjs` — **`DEFAULT_MAX_QUEUE_MS 3800`**.
- `mat-fx/moves/fire-blast-pose.mjs` (pure, 360 lines) — the Fire Blast timing and geometry:
  `FIRE_BLAST_MS 1900`, `FIRE_BLAST_CONTACT_MS 1000`, `FIRE_BLAST_HOLD_MS 1040`, `PHASES` (charge
  0–620, rings 560–940, release 620–1000, vignette 820–1850, flash 1000–1180, rays 1000–1320,
  flare 1000–1750, smoke 1300–1900), `laneGeometry`, `chargeOrbs`, `chargeCore`, `fireballPose`,
  `releaseRings`, `vignettePose`, `flashPose`, `raysPose`, `flarePose`, `armTongues`, `smokePuffs`,
  `attackerCardPose`, `defenderCardPose`, `phaseProgress`. Every function is the model for the
  generic modules in § Design (they are lifted out of here, not rewritten).
- `mat-fx/moves/fire-material.js` (canvas, 245 lines) — `FIRE` palette, `wobble`, `tonguePath`,
  `drawTongue`, `drawGlow`, `drawOrb`, `drawFireball`, `getNoiseTile`, `grainPass`. This becomes
  `materials/fire.js` and the template for every other material.
- `mat-fx/moves/fire-blast.js` (DOM, 485 lines) — `playFireBlast({ attacker, defender, seed,
  impacts, attackerCard })`: host spanning both cards (padding 1.7 h), back canvas, two ghosts
  (`cardGhost` with `.fx-move__rim` and `.fx-move__heat` layers, art turned by `turn`, `ready`
  promise from `img.decode()` raced against 120 ms), front canvas with the grain pass, embers at
  contact, `strikeIn(contactMs, { direction, attackerCard, move, family: 'burst' })`,
  `hideDuring` on both real cards once the ghosts are ready, `removeWhen` backstop
  `duration + 760 + 400`. This becomes `move-player.js`.
- `client/src/css/mat-fx.css` — `.fx-move`, `.fx-move__canvas`, `.fx-move__embers`,
  `.fx-move__ghost` (`will-change: transform; transform-origin: 50% 50%`), `.fx-move__ghost-art`
  (`object-fit: contain; border-radius: 0.3rem`), `.fx-move__rim` (two orange box-shadows, opacity
  animated), `.fx-move__heat` (radial pale-yellow→orange→red, `mix-blend-mode: screen`, opacity
  animated). Plus the older `.fx-overlay` (z 2450), `.fx-particle*`, `.fx-hit*` (z 2455),
  `.fx-lunge*`, `.fx-target-ring*`.
- `.claude/skills/fx-preview/rec/rec-fire-blast.mjs` — records the scene as a real attack reads
  (fake view through `applyView`, banner, hold, scene + `damage` in one batch); writes `rects.json`
  (`from`, `to`, `bannerAt`, `moveAt`, `bannerHoldMs` in video ms) and prints the frame-time probe.
  `rec/cut-move.sh <outDir> [name]` cuts `sheet.png` (12.5 fps, 36 tiles from 150 ms before the
  move), `<name>.mp4` and `<name>-closeup.mp4` from the WebM using `rects.json`.
- `mat-fx/particles.mjs` — `burstParticles({count, distance, direction, spread, size, aspect,
  gravity, maxDelay, orient, seed})` → ≤ 24 seeded particle rows; `spawnParticles(host, rows,
  {className, color, duration, delay})` in `image-logic/mat-fx.mjs` animates them.
- `client/src/setup/image-logic/mat-fx.mjs` — `spawnOverlay({rect, className})` (fixed-position
  host in parent-viewport px), `rectForInstance`, `sampleKeyframes(poseFn, toFrame, samples)`,
  `animateFrames(el, frames, timing)`, `removeWhen(host, promises, backstopMs)`,
  `hideDuring(el, promise, backstopMs)`, `runPose`, `motionReduced`, `fxDisabled`.
- `mat-fx/canvas-stage.js` — `playCanvasStage(host, {className, cx, cy, size, duration, draw,
  before})` → promise; `draw(ctx, t, elapsedMs)` in CSS px, cleared every frame, DPR ≤ 2. The canvas
  is a square of `size` centred on (cx, cy) in the host; a host-local point (x, y) is drawn at
  (x + ox, y + oy) with `ox = (size − hostWidth) / 2`, `oy = (size − hostHeight) / 2`.
- `mat-fx/fx-colors.mjs` — `fxRgbForCard(card)` (first printed type → `TYPE_GLOW`), `brighten`,
  `rgbCss`, `FX_NEUTRAL_RGB`. `mat-fx/evolve-scene.js` — `frameTurnOf(element)`.
  `mat-fx/flow-pose.mjs` — `BANNER_MS 1600`, `bannerPose` (in 0–20 %, hold, out 80–100 %),
  `seededRandom(seed)` (mulberry32).
- `mat-fx/fx-audio.mjs` — `voicesFor(effect, plan)`; voices are frozen `tone`/`noise`/`arpeggio`
  descriptors; `attack` already has a voice set.
- `shared/engine/rules/card-classify.mjs` — `isExCard`, `isMegaCard`, `isTeraCard`, `isVCard`,
  `isVmaxCard`, `isVstarCard`, `isGxCard`, `isTagTeamCard`, `isLegendCard`, `isVUnionCard`,
  `isPrismStarCard`, `isRadiantCard`, `isRuleBoxPokemon`. `shared/engine/cards.mjs` —
  `collapseStage` and `NON_BASIC_STAGES`.
- Card objects on the client carry `name`, `types` (TCG types), `stage`, `subtypes`, `hp`,
  `evolvesFrom`. They carry **no base stats and no main-series types**.
- `client/src/setup/deck-builder/core/card-sprites.mjs` — `pokemonSpriteForName(cardName,
  {types})` → `{ slug, name }`: the one card-name → species resolver (owner prefixes, ex/V/VMAX
  suffixes, Mega, Primal, regional, named and type forms, Paldean Tauros breeds).
- Tooling: `.claude/skills/fx-preview` (e2e board, `capture-entry.mjs`, `rec/rec-*.mjs` one per
  shipped scene, `CHROMIUM=/opt/pw-browsers/chromium` in the cloud, `SIO_JS` for the socket.io
  client, `CARD_DIR` for card art when `images.pokemontcg.io` is blocked for the browser).

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
  Large `.mp4` downloads from Poképédia are cut off by the host over HTTP/2; retry with
  `curl --http1.1` (that is what fetched the Scarlet/Violet Fire Blast video).
  26 moves have no sprite-era animation anywhere (all Gen VI+ except Karate Chop and Shock Wave,
  which have no animation file at all); their entries cite the 3D video only.
- Fire Blast's own references (not in the table; used for the look test): B2W2
  `Déflagration_N2B2.gif` (146 frames, 33 fps, effect frames 42–126: five fireballs orbit the
  attacker 42–59, the screen tints red and a flame cluster crosses the ground 61–85, a yellow
  radial flash 87, the five-armed 大 flare grows 89–97, holds 98–108, breaks up 110–120, the
  screen darkens and returns 122–128) and Scarlet/Violet `Déflagration_EV.mp4` (198 frames,
  30 fps: fireball built at the mouth 33–42, orange rings orbit 45–51, the blast travels 54–63,
  engulfs the foe 66–87, white core 90, embers and a red tint fade 93–126).

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
11. **Rendering.** A: DOM overlays + CSS particles only. B: two canvas stages (back and front)
    around DOM ghost cards, CSS particles for fragments. C: WebGL. **Pick B** — proven by the look
    test; never C.
12. **How a move is described.** A: a pure data *score* played by one player with a fixed, small
    primitive vocabulary (the first draft). B: 154 bespoke scene modules like the look test's
    `fire-blast.js`. C: a `MoveSpec` object per move — data (timing, phases, card-motion presets,
    particle bursts) plus *beats* that name a drawer from a shared library and pass parameters; one
    generic player; drawers are built on per-type *materials*. **Pick C**: it is exactly what the
    look test's code becomes once the Fire Blast numbers are moved into a spec, it keeps the pure
    parts testable, and a new move is a spec file a weaker model can write by copying the recipe.
13. **Sound.** One voice set per *sound family* (`slash, punch, dash, beam, projectile, burst,
    quake, splash, wind, electric, ghost, chime, roar, charge`), chosen by the spec's `family` and
    routed by `soundPlanFor`. **Picked.**
14. **Holds.** The effect returns its own hold (`contactMs + 40`); `HOLD_MS.attack` stays as the
    lunge fallback. **Picked** (the look test returns `{ holdMs: 1040 }`).
15. **Material rendering.** A: radial-gradient discs (take 1, rejected: "material quality is
    poor"). B: tongue material with blur + grain (take 2, accepted). C: sprite textures. **Pick B**;
    C would need art assets the repo does not carry.
16. **Card motion.** A: cards stay put (take 1, rejected: "need more motion and weight"). B: ghost
    copies of both cards driven by pose presets (take 2, accepted). **Pick B**; the real cards hide
    only after the ghost art decodes (a blank frame showed otherwise).
17. **Banner → move.** A: overlap (hold 620 of a 1600 ms banner; the charge played under the
    banner). B: the move starts when the banner has left (hold = `BANNER_MS`). **Pick B** (user,
    2026-10-05); the queue budget rises to 3800 so the full chain keeps its holds.
18. **Blur cost.** A: three blurred passes per tongue. B: one blurred pass (body) + crisp mid and
    core. **Pick B**: p95 frame time in the software probe fell from 187 to ~125 ms with no visible
    loss; a GPU browser accelerates the remaining pass.

## Design
### File map (what exists → what it becomes)
```
client/src/setup/netcode/mat-fx/moves/
  move-table.mjs            the spec table, verbatim (pure)                       slice 1
  move-select.mjs           tier / stat class / VG type / move pick (pure)        slice 1
  species-stats.generated.mjs + scripts/vendor-species-stats.mjs                  slice 0
  move-spec.mjs             MoveSpec schema + validateSpec (pure)                 slice 2
  move-geometry.mjs         laneGeometry, lanePoint, unionPadded, phaseProgress   slice 2  (lifted from fire-blast-pose.mjs)
  card-motion.mjs           attacker/defender pose presets (pure)                 slice 2  (lifted from fire-blast-pose.mjs)
  move-poses.mjs            the pure beat math: orbits, projectile, rings, flare,
                            flash, rays, vignette, smoke, beam, splash, pillar …  slice 2  (lifted + extended)
  move-drawers.js           beat drawers: (ctx, lane, s, info) → draws            slice 2  (lifted from fire-blast.js)
  move-player.js            playMove({ spec, attacker, defender, … })             slice 2  (fire-blast.js generalised)
  materials/index.js        MATERIALS registry { fire, water, grass, … }          slice 2
  materials/fire.js         the look test's fire-material.js, moved               slice 2
  materials/<type>.js       one per VG type (16 more)                             slices 3–19
  specs/index.mjs           SPECS: { [moveId]: MoveSpec } merged from per type    slice 2
  specs/fire.mjs            Fire Blast ported first (the acceptance test), then the Fire table
  specs/<type>.mjs          one per VG type
  fire-blast-pose.mjs / fire-blast.js / fire-material.js   deleted at the end of slice 2 once
                            `specs/fire.mjs: fireBlast` reproduces the accepted take frame for frame
__tests__/ (pure modules only): move-table, move-select, species-stats, move-spec, move-geometry,
  card-motion, move-poses, materials (recording-context tests), specs (every spec validates)
.claude/skills/fx-preview/rec/rec-move.mjs   rec-fire-blast.mjs generalised: MOVE=<id> SIDE=self|opp
.claude/skills/fx-preview/rec/cut-move.sh    (exists)
client/src/css/mat-fx.css                    `.fx-move*` (exists; add per-material particle classes)
```
Naming rule: `.mjs` = DOM-free, tested under `node --test`; `.js` = touches `document`/canvas.

### Lane geometry and the host (`move-geometry.mjs`, pure; lifted verbatim)
```
laneGeometry(fromRect, toRect) → null | {
  ax, ay, bx, by,        attacker / defender centres (parent-viewport px)
  ux, uy, nx, ny,        unit direction attacker→defender and its left normal (nx = −uy, ny = ux)
  angleDeg,              atan2(uy, ux) in degrees (0 = right, 90 = down)
  length,                centre distance in px; null when < 1
  h,                     max(fromRect.height, toRect.height, 1) — EVERY size in a scene is a multiple of h
}
unionPadded(a, b, pad) → the smallest rect containing both, grown by pad px on every side
toLocal(rect, hostRect) → rect translated into host-local px
lanePoint(lane, f, side) → the point a fraction f along the lane from the attacker's leading edge
  (start = 0.42 h from the attacker centre) to the defender centre, offset `side` px along n
phaseProgress(ms, [start, end]) → null outside [start, end), else (ms − start) / (end − start)
```
Host: `spawnOverlay({ rect: unionPadded(from, to, spec.pad × h), className: 'fx-overlay fx-move
fx-move--<id>' })`. The local lane is the lane with `hostRect.left/top` subtracted. Both canvases
are `size = ceil(max(hostWidth, hostHeight))` squares centred in the host; every drawer receives a
context already translated by `(ox, oy)` so it draws in host-local px. Canvas work is in CSS px;
`playCanvasStage` handles DPR.

### The scene clock
One scene has one duration `spec.durationMs`; both canvases run `playCanvasStage` for that
duration (two WAAPI clocks started in the same task; they never drift visibly) and every ghost
keyframe set is sampled over the same duration (`GHOST_SAMPLES = 150`, i.e. one sample per ~13 ms
for a 1900 ms scene; keep ≥ 1 sample per 15 ms so a 60 ms impulse survives sampling). `time =
seed × 0.37 + elapsedMs / 1000` is the material's turbulence clock (seconds) so two attacks with
different seeds flicker differently.

### `MoveSpec` (`move-spec.mjs`) — exact schema
```js
/** @typedef {object} MoveSpec */
{
  id: 'fire-blast',            // kebab-case; the key in SPECS and the CSS modifier
  name: 'Fire Blast',
  vgType: 'fire',              // one of the 17 table types (+ 'fire' for the look test)
  statClass: 'special',        // 'physical' | 'special'
  tier: 3,                     // 1 | 2 | 3 — durationMs must sit in TIER_BAND[tier]
  family: 'burst',             // sound + hit family, see § Families
  material: 'fire',            // key in MATERIALS; drawers get MATERIALS[material]
  durationMs: 1900,
  contactMs: 1000,             // CONTACT_BAND: contactMs / durationMs ∈ [0.38, 0.62]; tier 1 may go to 0.70
  pad: 1.7,                    // host padding in h (default 1.7; beams and terrain use 2.2)
  attacker: { motion: 'rear-lurch', params: { rear: 0.14, lurch: 0.4, glow: 1 } },
  defender: { motion: 'knock',      params: { strength: 0.3, heat: 1 } },
  beats: [
    // layer: 'back' (behind the ghosts) | 'front' (over them) | 'top' (over the grain pass)
    { at: 0,    until: 620,  layer: 'back',  drawer: 'orbitCharge', params: { count: 5, half: 'back' } },
    { at: 0,    until: 620,  layer: 'front', drawer: 'coreCharge',  params: {} },
    { at: 0,    until: 620,  layer: 'front', drawer: 'orbitCharge', params: { count: 5, half: 'front' } },
    { at: 560,  until: 940,  layer: 'back',  drawer: 'shockRings',  params: { count: 2 } },
    { at: 620,  until: 1000, layer: 'front', drawer: 'projectile',  params: { r0: 0.34, r1: 0.56, bow: 0.2, tongues: 9 } },
    { at: 820,  until: 1850, layer: 'back',  drawer: 'vignette',    params: { target: 'defender' } },
    { at: 1000, until: 1320, layer: 'back',  drawer: 'speedRays',   params: { count: 28 } },
    { at: 1000, until: 1750, layer: 'front', drawer: 'starFlare',   params: { arms: 'dai' } },
    { at: 1000, until: 1180, layer: 'top',   drawer: 'impactFlash', params: {} },
    { at: 1300, until: 1900, layer: 'front', drawer: 'smoke',       params: { count: 6 } },
  ],
  particles: [
    { at: 1000, anchor: 'defender', count: 22, distance: 1.3, direction: -90, spread: 300,
      size: [0.05, 0.13], aspect: 0.3, gravity: 0.6, maxDelay: 0.12, durationMs: 760, kind: 'ember' },
  ],
  grain: 0.28,                 // 0 disables the grain pass; the material decides the tile
}
```
Units: every length param is in **card heights (h)**, every time in ms on the scene clock,
angles in degrees in lane space (0 = along the lane toward the defender; the drawer rotates by
`lane.angleDeg`) *except* `direction` on particles and `arms` angles, which are screen degrees
(the 大 must stand upright on screen whichever side attacks — see § Both seats).

`validateSpec(spec) → string[]` errors (empty = valid): missing/unknown fields; `id` not
kebab-case; `tier`/`statClass`/`vgType`/`family`/`material` not in their enums; `durationMs`
outside `TIER_BAND[tier]`; contact outside `CONTACT_BAND`; a beat with `until ≤ at`, `until >
durationMs`, an unknown `drawer` or `layer`, or params failing that drawer's `check(params)`;
more than 2 beats per layer per ms window is fine, but > 30 tongues estimated at any instant
(each drawer declares `tonguesAt(params)`) fails; a particle burst with `count > 24`; `pad` outside
[1.2, 2.6]. `TIER_BAND = { 1: [900, 1100], 2: [1200, 1500], 3: [1600, 2200] }`.

### Drawers (`move-drawers.js`) — the shared beat library
Signature for every drawer: `draw(ctx, lane, s, info)` where `s ∈ [0, 1)` is the beat's progress,
and `info = { elapsedMs, time, seed, material, params, spec }`. Each drawer also exports
`check(params) → string[]` and `tonguesAt(params) → number`. Pure math lives in `move-poses.mjs`
(one function per drawer, returning plain objects; this is what the unit tests cover); the drawer
only maps that object to material calls. The first ten are the look test's, lifted:

| drawer | pose fn (pure) | what it draws | params (defaults = Fire Blast) |
|---|---|---|---|
| `orbitCharge` | `chargeOrbs(s, h, count)` | `count` bodies orbit the attacker on a tilted ellipse (radius 0.85 h → 0.25 h, spin `2π(0.9s + 1.6s²)`, y squashed × 0.42, lifted 0.04 h); `half` draws only the bodies whose `depth` sign matches ('back' = sin θ < 0) so the orbit passes behind the ghost | `count 5`, `half`, `r0 0.16`, `r1 0.24`, `tongues 4` |
| `coreCharge` | `chargeCore(s, h)` | a growing body at the attacker's leading edge (0.42 h along the lane), radius 0.18 h → 0.56 h, building from 30 % of the beat | `lead 0.42`, `r0 0.18`, `r1 0.56` |
| `shockRings` | `releaseRings(s, h)` | `count` ellipses (y × 0.45) leaving the attacker, radius 0.3 h → 1.3 h, second one 30 % later, width 0.07 h, fading `(1−s)^1.5` | `count 2`, `delay 0.3` |
| `projectile` | `fireballPose(s, h)` | the material's `projectile` travelling `lanePoint(f, side)`, `f = s²` (accelerating), `side = sin(πs) × bow × h`, radius `r0 → r1`; `path: 'arc'` uses `bow`, `'straight'` sets bow 0, `'spiral'` adds `0.12 h × sin(6πs)` on n | `r0 0.34`, `r1 0.56`, `bow 0.2`, `tongues 9`, `path 'arc'` |
| `vignette` | `vignettePose(s, h)` | local darkening (`SHADE [70,6,0]`, or the material's `shade`) around `target`, ring from 0.55 h to 1.6 h, alpha 0 → 0.45 over 20 %, hold to 70 %, out; drawn `source-over` on the back canvas before the additive pass | `target 'defender'`, `maxAlpha 0.45` |
| `speedRays` | `raysPose(s, h)` | `count` thin lines from 0.3 h to 1.1 h → 1.7 h around the defender, alpha `0.5(1−s)²`, slowly rotating; the only sunburst allowed and it is local | `count 28` |
| `starFlare` | `flarePose(s, h)` + `armTongues` | arms grow out of a core (0.46 h) over the first 30 %, hold and flicker, break into 3 fragments that drift 0.4 h outward from 60 %; each arm = a main tongue (width 0.46 h) + two side tongues at ±14° (0.6 length, 0.55 width). `arms: 'dai'` = `[{-90, 1.25}, {-160, 1.0}, {-20, 1.0}, {125, 1.1}, {55, 1.1}]` (screen degrees, reach in h); `'cross'` = 4 arms at 90°; `'ring'` = 8 arms at 45°, reach 0.8; or an explicit array | `arms 'dai'`, `width 0.46` |
| `impactFlash` | `flashPose(s, h)` | white → pale → transparent disc at the defender, alpha up over 12 %, out `(1−s)²`, radius 0.6 h → 1.3 h; always `layer: 'top'` so the grain does not pit it | — |
| `smoke` | `smokePuffs(s, h, count)` | `count` grey puffs (`SMOKE [120,96,84]` or the material's `smoke`) rising 0.9 h off the defender, alternating sides, radius 0.18 → 0.5 h, alpha ≤ 0.32, drawn `source-over` | `count 6` |
| `embers` (particles) | `burstParticles` | CSS streaks from the anchor; `kind` picks `material.particle` (className, colour, aspect) | see spec |

Drawers the table needs beyond Fire Blast (each gets its pose fn and tests in slice 2; the
materials make them look right per type):

| drawer | draws | params |
|---|---|---|
| `beam` | a lane-aligned strip from the attacker's leading edge to the defender: `kind: 'solid'` (one wide tongue from A to B, width `w`), `'pulse-train'` (bodies every `gap` h travelling at `speed` lane/s), `'helix'` (two sine-offset tongues twisting around the lane, `turns`), `'segmented'` (dashes), `'widening'` (width 0.3 → 1.0 w). Grows from A over the first 25 %, holds, retracts from A over the last 20 % | `kind`, `w 0.5`, `gap 0.4`, `turns 3`, `speed 2.5` |
| `splash` | `count` tongues leaving the defender in a fan of `arc` degrees centred on `direction` (screen deg), each `0.6–1.1 h` long, launched with stagger `0.05` and falling under `gravity` (material: water sheets, mud globs, rock shards, leaves) | `count 10`, `arc 140`, `direction -90`, `gravity 0.5` |
| `pillar` | a vertical (screen) column under/over the target: width `w`, rising from 0 to `height` h over 30 %, holding, dissolving upward (fire pillar, water spout, light beam from above for Solar Beam, earth spike) | `height 1.8`, `w 0.6`, `from 'below'`/`'above'` |
| `slashArc` | an arc-shaped tongue sweeping `sweep` degrees across the defender over the beat, tip leading; two or three with `count` and `gapDeg`; the material's `tongue` with `hot` high; a thin white edge line | `sweep 120`, `radius 0.7`, `count 1`, `gapDeg 30`, `angle 45` |
| `terrain` | the table layer under both footprints: `kind: 'crack'` (branching dark lines growing from the target, material `deep` colour), `'wave'` (concentric ellipses rolling from the attacker to the defender), `'dust'` (low wide puffs), `'quake'` (the whole host jitters ±`amp` h for the beat) | `kind`, `radius 1.4`, `amp 0.03` |
| `cloud` | `count` overlapping bodies drifting `drift` h in `direction`, alpha ≤ `alpha`, for gas, mist, spore, sandstorm, dark aura | `count 8`, `radius 0.35`, `drift 0.6`, `alpha 0.5` |
| `spiral` | `turns` of tongues along an Archimedean spiral around the target, radius `r0 → r1`, rotating `rpm` (whirlpool, Fire Spin-like, Twister, vortex) | `turns 2.5`, `r0 0.2`, `r1 1.1`, `rpm 90` |
| `volley` | `count` projectiles staggered `stagger` ms along slightly different `bow` values; the last one defines contact | `count 3`, `stagger 90`, `r0 0.14`, `r1 0.2`, `bow 0.3` |
| `aura` | a pulsing glow hugging a card: radius 0.7 h → 0.9 h at `hz`, rim-coloured; zero-damage attacks play only this on the attacker | `target`, `hz 2`, `alpha 0.6` |
| `rain` | `count` bodies falling from above the defender (screen) into its footprint over the beat, each a short vertical tongue, impacting with a 0.2 h splash | `count 12`, `height 1.6`, `spread 0.9` |
| `shards` | `count` angular fragments bursting from the target along `arc`, rotating as they fly (ice, rock, gem, steel) — the material's `tongue` with `jag: 1` | `count 8`, `arc 360`, `distance 1.1` |
| `bolt` | a jagged polyline from a point to the target (`from: 'attacker'` or `'sky'` = 1.6 h above the defender on screen), `jag` h displacement at `segments` joints re-rolled every `rerollMs`, with `branches` short forks; material `electric` draws the core/glow; others may use it for cracks | `from`, `segments 9`, `jag 0.12`, `branches 2`, `rerollMs 45` |
| `ring` | expanding rings around the target (shockwave on the floor, Sonic-like for sound moves: `kind: 'floor'` y × 0.45, `'face'` circular) | `count 3`, `r0 0.3`, `r1 1.5`, `kind` |
| `glyph` | a material-specific sigil over the target for Psychic (concentric rings + a lens), Fairy (a five-point star outline), Ghost (an eye pair), drawn with the material's `sigil(ctx, x, y, r, s)` | `r 0.9` |

Every drawer: no `ctx.save/restore` leaks (balanced), sets `ctx.filter = 'none'` when done, draws
nothing when `s` is out of range, and never touches `globalCompositeOperation` (the player sets it:
`source-over` for vignette/smoke/terrain-crack, `lighter` for everything else).

### Materials (`materials/<type>.js`) — the look of each type
Interface (every material exports a frozen object; `materials/index.js` maps `vgType → material`,
and `MATERIALS.default = fire` until a type's material lands):
```js
export const fire = {
  key: 'fire',
  palette: { deep: [210,41,8], body: [235,108,6], hot: [241,175,13], core: [255,246,214], white: [255,255,255] },
  shade: [70, 6, 0],            // vignette colour
  smoke: [120, 96, 84],         // aftermath puff colour (null = no smoke)
  particle: { className: 'fx-particle--streak', color: 'rgb(241, 175, 13)', aspect: 0.3 },
  glow(ctx, x, y, r, alpha),                     // soft halo: body → deep → 0
  body(ctx, x, y, r, alpha, hot = 1),            // the round unit (drawOrb)
  tongue(ctx, spec, { alpha = 1, hot = 1, jag = 0 } = {}),   // the elongated unit (drawTongue)
  projectile(ctx, { x, y, r, headingDeg, time, seed, alpha, tongues, hot }),  // (drawFireball)
  grain(ctx, size, time, strength),              // grainPass with this material's tile; may be a no-op
};
```
`spec` for `tongue` is `{ x, y, angleDeg, length, width, time, seed }` in px / screen degrees.
Shared helpers in `materials/_shared.js` (lifted from `fire-material.js`): `wobble(s, time, seed)`,
`tonguePath(ctx, spec, scale)`, `getNoiseTile()`, `grainPass(ctx, size, time, strength)`,
`sphere(ctx, x, y, r, stops)`. A material is ~120 lines; it never reads the DOM beyond the
noise tile.

Per-type recipes (each is a contract; a builder implements the body/tongue/projectile exactly as
described, then tunes only alpha and sizes against the reference sheet). Hex palettes are the
sprite-era colours sampled from the B2W2 sheets (the per-move entries in Appendix A list the
move's own accents; a material uses its type palette unless the entry overrides it).

- **fire** (done): tongues as above; `body` = hot sphere with the highlight offset up-left 15 %;
  projectile = glow 2.4 r + 7–9 trailing tongues over ±50° + sphere + 6 sparks; grain 0.28.
- **water** — `#2E7CE6 #52B4FF #B9E8FF #FFFFFF`. `body` = a droplet: sphere with a bright
  specular dot at 30 % up-left (white, alpha 0.9, r × 0.18) and a darker rim (deep, alpha 0.5,
  2 px stroke); `tongue` = a *sheet*: the same tapered polygon but with a smooth edge (wobble
  amplitude × 0.4), filled body alpha 0.55 with a 1.5 px white edge stroke along the leading side,
  no blur, plus 3–5 small droplets (`body`, r 0.06 h) shed from the tip; `projectile` = a bulging
  sheet head (sphere r) with 5 trailing sheets and 8 droplets; grain 0.12 (soft). Splashes use
  `splash` with gravity 0.7. Smoke = mist `[190, 215, 235]` alpha ≤ 0.25. Particle: droplet
  (`.fx-particle` round, colour `#B9E8FF`, aspect 1, gravity high).
- **grass** — `#3FA34D #7ED957 #C9F27A #FFFFFF`. `body` = a seed/spore: sphere with a leaf-green
  rim; `tongue` = a *leaf*: the tapered polygon with a pointed base too (half-width 0 at s = 0 and
  s = 1, max at s = 0.45), a mid-vein line (deep, 1 px) and two side veins, filled body with a
  lighter half (hot) on the sunlit side; leaves rotate about their centre as they travel (`spin`
  360°/s); no blur; `projectile` = a tight spinning cluster of 5 leaves + a core sphere; grain 0.
  Particle: leaf fragments (`.fx-particle--shard` tinted `#7ED957`, aspect 0.5, orient true).
  Energy Ball / Solar Beam override palette to `#F2E96B #FFF8B0` (light), using fire's tongue code
  path with `hot` 1 and no grain (declare `palette.override` in the spec).
- **electric** — `#F7D21E #FFF27A #FFFFFF`, deep `#B98A00`, with a blue edge `#9FD5FF` at 0.3.
  `tongue` = a *jag*: the polygon's centre line is a polyline with `segments` joints displaced
  ±`jag` on n, re-rolled every 45 ms from `seededRandom(seed + floor(time × 22))` (so it flickers
  rather than slides); three passes: wide pale-blue glow (blur 0.1 w), yellow core 0.45 w, white
  centre 0.15 w; `body` = a crackling ball: sphere + 6 short jags radiating; `projectile` =
  body + 3 trailing jags; grain 0. `bolt` drawer uses `tongue` with `jag: 1`. Particle: spark
  (`.fx-particle--streak` white, aspect 0.2, no gravity). Smoke null.
- **ice** — `#8FD3FF #D6F3FF #FFFFFF`, deep `#3E8FD1`. `tongue` = a *crystal*: straight-edged
  polygon (no wobble), 5–6 vertices, hexagonal cross-section suggested by a lighter facet
  (hot, alpha 0.6) on one side and a 1 px white edge; `body` = a snowflake: 6 thin spokes with
  3 branches each (strokes), slowly rotating; `projectile` = a crystal head with 4 trailing
  crystals and a faint mist glow; grain 0.1. Shatters use `shards`. Particle: shard
  (`.fx-particle--shard`, `#D6F3FF`). Smoke = mist `[200, 230, 245]`.
- **fighting** — `#D9643A #F2A66B #FFE6C2`, deep `#8C3A1F`. No elongated element: `tongue` is a
  *shock streak* (short, straight, blur 0.08 w, used in fans at contact); `body` = an impact
  disc with concentric rings (3 strokes); `projectile` (Aura Sphere, Focus Blast, Vacuum Wave) =
  a blue-white sphere `#7FB7FF #E6F2FF` with a swirling inner ring. The weight is in card motion:
  physical fighting moves use `attacker.motion: 'dash'` or `'lunge'` and `defender.motion:
  'knock'` with strength 0.4–0.5. Grain 0. Particle: streak white. Smoke = dust `[150, 130, 110]`.
- **poison** — `#9B4DCA #C77DFF #F0D6FF`, deep `#4B1E6B`. `body` = a *glob*: sphere with a
  wobbling outline (the circle's radius modulated by `wobble`) and a dark highlight ring,
  drippy: a small tail body below it; `tongue` = a *stream* of 5–7 globs along the axis with
  decreasing radius; `projectile` = a big glob with 3 trailing drips; bubbles (small bodies with a
  hollow centre) rise from any poison pool; grain 0.15. Particle: glob (`.fx-particle` round,
  `#C77DFF`, gravity high). Smoke = fume `[120, 70, 150]` alpha 0.3.
- **ground** — `#B5793C #D9A066 #F0D9B5`, deep `#5C3A17`. `body` = a *clod*: an irregular
  polygon (7 vertices, radius × `0.8 + 0.4 rand`), flat-shaded with a darker bottom half;
  `tongue` = a *spike* of earth (straight polygon with a jagged top, drawn from the floor
  upward); `terrain` `'crack'` and `'dust'` are this material's signature; `projectile` = a clod
  with a dust trail (cloud bodies); grain 0.2. Particle: shard `#D9A066`. Smoke = dust.
- **rock** — `#8A8F99 #B8BEC9 #E8ECF2`, deep `#3E434C`. Like ground's clod but angular (5–6
  vertices, sharp) with two facet tones; `shards` is the signature; `projectile` = one boulder
  (r 0.5 h) with a short dust trail; cracks on the floor at contact; grain 0.1. Particle: shard
  `#B8BEC9`. Smoke = dust.
- **steel** — `#9AA7B8 #D5DEEA #FFFFFF`, deep `#4A5563`. `tongue` = a *blade*: straight, very
  thin at the tip, with a specular line (white, 1 px) running its length and a cool blue tint at
  the edges; `body` = a metal sphere with a hard highlight; `projectile` (Flash Cannon, Steel
  Beam) = a tight white-blue beam core with `beam 'solid'` and sparks; contact uses a
  `speedRays` with count 16 in white; grain 0. Particle: spark white. Smoke null.
- **flying** — `#CFE3F7 #EAF3FF #FFFFFF`, deep `#8FB3D9`. `tongue` = a *wind blade*: long,
  thin, crescent-curved (the centre line bows `0.3 w`), alpha 0.45 with a bright edge; `body` =
  a feather: a thin leaf with a vein and a soft tip; `spiral` and `cloud` (gust lines) are the
  signatures; `projectile` = a cluster of 3 wind blades; grain 0. Particle: feather
  (`.fx-particle--shard` white, aspect 0.35, gravity low). Smoke null.
- **psychic** — `#C85CDB #F0A5FF #FFE1FF`, deep `#5B1E7A`. `tongue` = a *ribbon*: smooth
  (wobble × 0.3), semi-transparent (0.45) with a brighter centre line, often two interleaved
  (`helix`); `body` = a lens: a disc with concentric rings (3 strokes, alternating hot/deep) that
  rotate; `glyph` = rings + lens; `projectile` = a lens with a ribbon tail; the screen-warp of the
  sprite games is replaced by the defender's `defender.motion: 'float'` (lifted 0.15 h, tilting);
  grain 0. Particle: mote (`.fx-particle--mote` `#F0A5FF`). Smoke null.
- **ghost** — `#6B4FA8 #9D7CF2 #D9CCFF`, deep `#1E1238`. `tongue` = a *wisp*: blurred (0.14 w),
  alpha 0.5, with a dark core line (deep) — the only material whose inner pass is darker than its
  outer; `body` = a shadow ball: a dark sphere (deep → black centre) with a violet rim glow;
  `cloud` with alpha 0.6 in deep for shadows; `glyph` = two slit eyes; `vignette` max alpha may
  rise to 0.55 for ghost; grain 0.2 (violet). Particle: mote `#9D7CF2`. Smoke = `[60, 40, 90]`.
- **dark** — `#3B3B4F #6E6E8C #B9B9D6`, deep `#101018`, accent `#FF3D6E` (crimson edge).
  `tongue` = a *shadow slash*: a thin dark blade with a crimson edge line; `body` = a dark pulse
  ring (concentric dark rings expanding, with crimson gaps); `projectile` = dark pulse rings
  travelling; physical dark moves rely on `slashArc` + `defender.motion: 'knock'`; grain 0.15.
  Particle: streak crimson. Smoke = `[40, 40, 60]`.
- **bug** — `#8CBF26 #BFE34D #F0F7B0`, deep `#4A6B10`. `tongue` = a *needle*: straight, thin,
  with a dark tip; `body` = a bug-wing disc: two translucent ovals (alpha 0.35) with vein lines,
  beating at 12 Hz; `volley` is the signature (Pin Missile, Twineedle); `beam 'pulse-train'`
  (Bug Buzz) draws rings; grain 0. Particle: shard `#BFE34D`. Smoke null.
- **dragon** — `#5A47C9 #8F7CF5 #D2C8FF`, deep `#2A1F6B`, accent `#FF9B3D` (ember edge).
  `tongue` = fire's tongue in the dragon palette with an orange core (`hot` colour override);
  `body` = a dragon orb: sphere with a swirling helix inside (two sine strokes); `projectile` =
  the orb with 5 trailing tongues; `volley` from above (Draco Meteor: `from 'sky'`, each meteor
  a body with a long tongue tail and a crack on landing); grain 0.25. Particle: ember orange.
  Smoke = `[90, 70, 120]`.
- **fairy** — `#F48FB1 #FFC2DA #FFF0F7`, deep `#B83A72`, accent `#FFE066` (gold). `body` = a
  twinkle: a 4-point star (two thin crossed tongues) with a soft sphere behind it, scale pulsing
  at 3 Hz; `tongue` = a *sparkle trail*: a smooth ribbon with twinkles along it; `glyph` = a
  five-point star outline; `projectile` (Moonblast) = a large pale sphere with a crescent
  highlight and twinkles; grain 0. Particle: star (`.fx-particle--star` `#FFC2DA`). Smoke null.

Contact dressing by **family** (what `strikeTarget` adds beyond today's flash/slash/sparks once
`ctx.family` is read — slice 2 changes `combat.js strikeTarget`): `slash` keeps the streak;
`punch`/`dash` draw a 0.9 h impact ring; `beam`/`burst`/`projectile` widen the flash to 1.2 h;
`quake` calls `shakeTable` with amplitude × 1.5; `splash`/`wind`/`electric`/`ghost`/`chime`/
`roar`/`charge` keep the default.

### Card motion (`card-motion.mjs`, pure) — presets lifted from Fire Blast
Every preset is `(ms, { contactMs, durationMs, params }) → pose`. Attacker pose =
`{ along, across, scale, tilt, glow }`; defender pose = `{ along, across, scaleAlong,
scaleAcross, wobble, heat }`. `along`/`across` are in h along u / n (positive `along` = toward the
other card). The player maps a pose to
`translate3d(x, y, 0) [rotate(lane) scale(sAlong, sAcross) rotate(−lane)] rotate(tilt|wobble) scale(scale)`
and animates `.fx-move__rim` opacity from `glow`, `.fx-move__heat` opacity from `heat`.
`springHome(p, cycles = 1.5, decay = 3) = cos(πp·cycles) · e^(−decay·p)` is the shared settle.

Attacker presets (times as fractions of `contactMs`, written c):
| preset | beats | numbers | use |
|---|---|---|---|
| `rear-lurch` (Fire Blast) | wind-up 0 → 0.56 c · thrust 0.56 c → 0.70 c · recoil 0.70 c → 1.20 c | wind-up: along −`rear`(0.14)·easeOutCubic, scale 1 → 1.05, tilt −4°, glow 0 → 0.7; thrust: along → +0.26, tilt → +3°, glow → 1 then 0.7; recoil: along 0.26·springHome(1.5, 3.5), tilt 3·spring, glow (1−p)² | special ranged, tier 2–3 |
| `brace` | wind-up 0 → 0.7 c · settle 0.7 c → 1.1 c | along −0.08, scale 1.03, tilt −2°, glow 0.6; settle by spring | special tier 1, status-like |
| `lunge` | wind 0 → 0.4 c · strike 0.4 c → 1.0 c · recoil 1.0 c → 1.5 c | wind: along −0.2, lift scale 1.06; strike: along → `reach` = min(0.9 h, length − 0.9 h) (the ghost's leading edge touches the defender at contact), scale 1.06; recoil: spring; glow 0 | physical contact, tier 1–2 |
| `dash` | wind 0 → 0.3 c · dash 0.3 c → 1.0 c · pass 1.0 c → 1.15 c · return 1.15 c → 1.7 c | like `lunge` but with 2 trail ghosts at lags 0.035/0.07 (today's `TRAILS`) and alpha 0.38/0.2 during the dash, overshoot past the defender by 0.3 h, return along an arc (across +0.4 h) | physical fast, tier 2–3 (Aqua Jet, Flame Charge, Brave Bird, Wild Charge) |
| `rise` | lift 0 → 0.6 c · hover → 1.2 c · land → 1.6 c | scale 1 → 1.12, across +0.1 h bob at 2 Hz, tilt ±3° sway, glow 0.5 | flying / wind specials |
| `stomp` | lift 0 → 0.8 c · slam 0.8 c → 1.0 c · settle → 1.4 c | scale 1 → 1.15 then 0.98 at contact (hits the table), tilt 0, no along; pairs with `terrain 'quake'` | ground physicals |
| `spin` | 0 → 1.3 c | tilt 0 → 360° × `turns` (1 or 2) with scale 1.05 at the middle | Rapid-Spin-like (Ice Spinner, Flame Wheel, Petal Dance) |
| `none` | — | identity; glow may still pulse (`glow` param) | — |

Defender presets (fractions of the time after contact, `k = (ms − contactMs) / knockMs`):
| preset | numbers | use |
|---|---|---|
| `tremble` (pre-contact, all presets) | from 0.82 c to c: across ±0.012 h · sin(0.11 ms), wobble ±1.5° · sin(0.07 ms), growing linearly | every hit |
| `knock` (Fire Blast) | knockMs 520: along `strength`(0.3) × easeOutCubic(min 1, k/0.14) × (k < 0.14 ? 1 : springHome((k−0.14)/0.86, 1.5, 3)); squash: impulse = k < 0.1 ? k/0.1 : max(0, 1 − (k−0.1)/0.3), scaleAlong 1 − 0.14·impulse, scaleAcross 1 + 0.09·impulse; wobble 8°·sin(3πk)·(1−k)²; heat (1 − t)^1.5 over 650 ms | single hit; strength 0.2 tier 1, 0.3 tier 2–3, 0.45 heavy physical |
| `stagger` | `hits` knocks of strength/`hits` spaced `gapMs`, each with the squash; the last with the spring | multi-hit (Fury Cutter, Pin Missile, Triple Kick, Arm Thrust, Rock Blast, Dual Chop, Bullet Punch, Twineedle) |
| `float` | lift across −0.15 h (screen-up is handled by the player: `across` sign flips for the opp seat), tilt ±4° at 1.5 Hz, held through the beat, drop with a 0.06 bounce | psychic, Hurricane, Gust |
| `sink` | scaleAlong 0.94 (pressed), across jitter ±0.02 h at 18 Hz for 300 ms, no travel | ground / quake |
| `freeze` | no motion; `heat` replaced by a cyan tint (`.fx-move__heat--cold` modifier) 0.8 → 0 over 900 ms | ice |

### The player (`move-player.js`) — `playMove`
```
playMove({ spec, attacker, defender, seed = 1, impacts = null, attackerCard = null })
  → { holdMs: spec.contactMs + 40, durationMs, contactMs } | null
attacker / defender = { rect, src, turn, element }   (rect in parent-viewport px; turn from frameTurnOf)
```
Order of operations (the look test's, verbatim; keep it):
1. `lane = laneGeometry(attacker.rect, defender.rect)`; null → return null (caller falls back).
2. `hostRect = unionPadded(from, to, spec.pad × lane.h)`; `host = spawnOverlay(...)`; local lane.
3. `material = MATERIALS[spec.material] ?? MATERIALS.default`; `time0 = seed × 0.37`.
4. `impacts?.strikeIn(spec.contactMs, { direction: lane.angleDeg, attackerCard, move: spec.id,
   family: spec.family })` — before any drawing, in the same task as the caller's `damage` plans.
5. Back canvas: `playCanvasStage(host, { className: 'fx-move__canvas', cx, cy, size, duration,
   draw: drawBack })`. `drawBack`: translate (ox, oy); `source-over`: beats with `layer 'back'`
   whose drawer is `vignette`/`terrain crack`; then `lighter`: the other back beats.
6. Ghosts: `cardGhost(host, toLocal(rect), src, turn, modifier)` for attacker then defender
   (defender drawn over the attacker). Each returns `{ ghost, rim, heat, ready }`.
7. Front canvas (`fx-move__canvas--front`): `source-over` beats (`smoke`); `lighter` beats
   (`front`); reset transform; `material.grain(ctx, canvas.width, time, spec.grain)`; translate
   again; `lighter` beats with `layer 'top'`; `source-over`. Particle bursts whose `at` has passed
   and are not yet spawned are spawned here (one flag per burst).
8. Ghost keyframes: `sampleKeyframes` over `durationMs` with `GHOST_SAMPLES`, three animations per
   ghost (transform, rim opacity, heat opacity).
9. `removeWhen(host, [back, front, ...ghostAnimations], durationMs + maxParticleDuration + 400)`.
10. `Promise.all([attackerGhost.ready, defenderGhost.ready]).then(() => host.isConnected &&
    hideDuring(each real element, Promise.all([back, front]), backstop))`.
11. Return the hold.

Failure handling: no `ctx` or no WAAPI → `playCanvasStage` resolves at once and the host is removed
by the backstop (the ghosts show their end frame); a missing `src` → return null; a drawer that
throws is caught per frame (`try { draw } catch {}` around each beat, once per beat logged at
debug level) so one bad spec never blanks the scene.

### Wiring (`combat.js attack(plan)`, unchanged otherwise)
```
card = registry.get(plan.attackerId)?.card
pick = moveFor(card, { instanceId: plan.attackerId, attackName: plan.attackName, species:
  speciesFor(card), damage: plan.damage, benchDealt: plan.benchDealt, specs: SPECS })
to = combatRect(plan.defenderId) ?? opponentActiveRect(plan.user) ?? null
if (pick?.spec && from && to && src) {
  const played = playMove({ spec: pick.spec, attacker: { rect: from, src, turn:
    frameTurnOf(attackerEl), element: attackerEl }, defender: {...}, seed: hashString(`${plan.
    attackerId}|${plan.attackName}|${plan.damage}`), impacts, attackerCard: card })
  if (played) return played.holdMs
}
if (pick === null && zeroDamage) return playAuraPulse(from, rgb)   // hold 240
…today's lunge…                                                      // hold HOLD_MS.attack
```
`index.js soundPlanFor`: for `effect === 'attack'`, `{ ...plan, family: pick?.family }` from the
same pure `moveFor` call; `fx-audio.mjs voicesFor('attack', plan)` → the family's voice set, else
today's `attack` voice. `fx-holds.mjs`: `attack 240` stays the lunge/aura hold.

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
moveFor(card, { instanceId, attackName, species, damage, benchDealt, specs })
  → { move, vgType, statClass, tier, family, spec } | null
  null when: damage === 0 && !(benchDealt > 0) (option 10 → aura pulse) · vgType has no table
  (normal) · cell chain empty · no spec for the move (the specs test makes this unreachable once a
  type ships; until then the lunge plays).
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

### Timing by tier (every spec fits these; the per-move numbers are in Appendix A)
| Tier | Duration | Contact | Hold returned | Read | Card motion |
|---|---|---|---|---|---|
| 1 | 900–1100 ms | 45–70 % | contact + 40 | one gesture, one hit | attacker `brace`/`lunge`, defender `knock 0.2` |
| 2 | 1200–1500 ms | ~50 % | contact + 40 | wind-up, travel, hit, settle | `rear-lurch`/`dash`, `knock 0.3` |
| 3 | 1600–2200 ms | ~55 % | contact + 40 | charge, release, sustained hit, aftermath | `rear-lurch`/`dash`/`stomp`, `knock 0.3–0.45`, smoke/aftermath beat |

Chain budget (worst case): banner 1600 + tier-3 hold 1240 + damage 180 + status 260 + knockout
900 = 4180 > 3800, so only what follows a knockout (prize-claim) collapses — acceptable and the
same as today's behaviour for that last item. Without a knockout the chain is 3280 < 3800.

### Both seats, geometry and layers
- All lane-space params are mirrored automatically by `laneGeometry` (u points at the defender
  whichever seat attacks). Params documented as *screen degrees* (`arms`, particle `direction`,
  `pillar from`, `bolt from 'sky'`, `float`'s lift) are not mirrored: a 大 stands upright and
  meteors fall from the top of the screen for both players. `across` in defender presets is in
  lane space; `float` is the one preset that converts "up" to screen space (`screenUp(lane)` =
  the lane normal whose y is negative).
- `turn = frameTurnOf(element)` rotates ghost art only (`.fx-move__ghost-art { transform:
  rotate(turn) }`), never the ghost box, so transforms compose in parent space.
- Layers (z within the host, in DOM order): back canvas < attacker ghost < defender ghost < front
  canvas < particle layers. The host is `z-index 2450`; `.fx-hit` (today's flash/slash) is 2455
  and lands on the real card's rect, which the knocked ghost has left by up to 0.3 h — accepted
  (it reads as the strike point).
- Contact: the defender's existing `strikeTarget` flash/slash/sparks still land at `contactMs`
  through the impact queue; specs add their own dressing and never a second damage number.

### CSS (`mat-fx.css`, exists; add per material)
`.fx-move` (overflow visible) · `.fx-move__canvas`, `.fx-move__embers`, `.fx-move__ghost`
(absolute) · `.fx-move__ghost { will-change: transform; transform-origin: 50% 50% }` ·
`.fx-move__ghost-art` (inset 0, object-fit contain, radius 0.3rem) · `.fx-move__rim` (opacity 0,
box-shadows `0 0 10px 2px rgba(hot, .85), 0 0 28px 8px rgba(body, .55)`) · `.fx-move__heat`
(opacity 0, radial core→hot→deep, `mix-blend-mode: screen`). Per material, a modifier sets the
custom properties the rim and heat read: `.fx-move--m-<material> { --fx-move-hot: r,g,b;
--fx-move-body: r,g,b; --fx-move-deep: r,g,b }` and the rim/heat rules switch to
`rgba(var(--fx-move-hot), …)` (slice 2 does this refactor; fire's literal colours become the
defaults). `.fx-move__heat--cold` for ice.

## Edge cases & failure modes — the completeness contract; Builder ticks every row
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | attacker or defender rect missing (card gone, collapsed, hidden tab) | `attack` falls through to today's lunge (which itself returns 0 without rects); `damage` still pops its number | [ ] |
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
| 12 | attacker KO'd by its own attack / discarded mid-scene | rects from `peekCombatOrigin`; ghost art from the snapshot; `hideDuring` on a detached element is a no-op; overlays self-remove | [ ] |
| 13 | fx turned off mid-scene | `body.fx-off .fx-overlay` hides every layer; backstops clean up; the real cards are restored by `hideDuring`'s backstop | [ ] |
| 14 | reduced motion | dispatcher plays `STATIC_FALLBACKS` (no `attack` entry) → no scene; voice still plays (sound ≠ motion) | [ ] |
| 15 | no WAAPI / no 2D context | `animateFrames` applies the end frame; `playCanvasStage` resolves; host removed by backstop | [ ] |
| 16 | opponent is the attacker (180° frame) | ghost art turned by `frameTurnOf`; lane math unchanged; screen-space params unmirrored | [ ] |
| 17 | narrow viewport (phone width, cards ~90 px) | sizes are fractions of h; particle counts unchanged; vignette clamps to the viewport; tongue blur ≥ 1 px | [ ] |
| 18 | FX queue flood (catch-up burst) | holds collapse past 3800 ms; scenes still self-remove; dropped batches play nothing (queue `clear`) | [ ] |
| 19 | spec table drift (a table move without a spec, a spec outside its band) | `specs.test.mjs` enumerates `MOVE_TABLE` × `SPECS` both ways and runs `validateSpec` on every spec | [ ] |
| 20 | data drift (new catalog slug, Showdown rename) | `vendor-species-stats` fails on an unmapped slug; `species-stats.test.mjs` pins known forms (Charizard-Mega-X 130/130 → coin; Gardevoir 65/125 → special; Machamp 130/65 → physical) | [ ] |
| 21 | `attackName` missing or empty | banner skips as today; `moveFor` seeds with `''` and still picks deterministically | [ ] |
| 22 | ghost art slow to decode (cold cache) | real cards hide only after `img.decode()` or 120 ms, whichever first; both visible briefly rather than both blank | [x] look test |
| 23 | lane shorter than 1 h (Actives nearly touching) | `lanePoint` still spans leading edge → defender centre; projectile beats read as a short hop; no division by zero (length ≥ 1 px) | [x] look test |
| 24 | lane long (bench target, 4–6 h) | projectile `f = s²` covers it in the same beat; beams stretch; `pad` keeps the host inside the viewport (clamp host to the viewport rect) | [ ] |
| 25 | a drawer throws (bad params at runtime) | caught per beat per frame; the rest of the scene plays; the ghosts and hold are unaffected | [ ] |
| 26 | a second move starts before the first ended (fast double attack) | each scene owns its host and ghosts; `hideDuring` nests (last restore wins); accepted overlap | [ ] |

## Test plan
- Unit (`node --test`, pure): `move-table.test.mjs` (table equals the spec; 154 distinct moves;
  every cell non-null after fallback), `move-select.test.mjs` (tier for every classifier and stage
  literal seen in the engine tests; stat class around the gap; family resolution per TCG type incl.
  Colorless/Tera/unknown; determinism of both seeds; zero-damage null), `species-stats.test.mjs`,
  `move-spec.test.mjs` (`validateSpec` on good and bad fixtures: every error message exercised),
  `specs.test.mjs` (every shipped spec valid; every table move of a shipped type has a spec; the
  Fire Blast spec has `contactMs 1000`, `durationMs 1900`, 10 beats, 1 particle burst),
  `move-geometry.test.mjs` (lane both orientations; `lanePoint` ends; `unionPadded`; degenerate
  rects), `card-motion.test.mjs` (every preset: identity at ms 0 and after its last beat; `knock`
  peaks at `strength` within 80 ms of contact; `tremble` is zero before 0.82 c; monotone fade of
  heat; `stagger` hit count), `move-poses.test.mjs` (every pose fn clamps t, returns finite
  numbers, obeys its stated ranges — e.g. `chargeOrbs` radius 0.85 h → 0.25 h, `flarePose` arms
  reach × grow, `smokePuffs` alpha ≤ 0.32), `materials.test.mjs` (each material's five calls on a
  recording context like `evolve-scene.test.mjs`: finite coordinates, `filter` reset to `'none'`,
  ≤ 3 fills per tongue, palette-only colours), `fx-holds.test.mjs` (banner hold = `BANNER_MS`),
  `fx-queue.test.mjs` (budget 3800 via the default).
- Existing suites must stay green: `dispatcher`, `fx-holds`, `fx-queue`, `origins`, `combat-pose`.
- Visual (the user's gate, visual-only changes are exempt from a failing test):
  `rec-move.mjs` per move on both seats, cut with `cut-move.sh`, reviewed against the six key
  frames in § Builder recipe step 7.
- Manual: one real game turn per seat with `SERVER_AUTHORITATIVE=1`: banner → move → number → KO
  reads in order and the queue never stalls.

## Recording and review procedure (exact; the look test's)
```bash
pnpm install --prefer-offline --frozen-lockfile          # once per worktree
PORT=4100 pnpm start > /tmp/server-4100.log 2>&1 &        # look for "e2e bridge: ARMED"
# card art for the fake board: the cloud browser cannot reach images.pokemontcg.io (proxy CA),
# but curl can — download once and serve by basename:
mkdir -p "$SCRATCH/cards" && curl -sS -o "$SCRATCH/cards/6_hires.png" https://images.pokemontcg.io/sv3pt5/6_hires.png \
  && curl -sS -o "$SCRATCH/cards/3_hires.png" https://images.pokemontcg.io/sv3pt5/3_hires.png
CARD_DIR="$SCRATCH/cards" CHROMIUM=/opt/pw-browsers/chromium \
SIO_JS=$(ls node_modules/.pnpm/socket.io@*/node_modules/socket.io/client-dist/socket.io.min.js | head -1) \
MOVE=fire-blast SIDE=self SEED=7 OUT=.agent/scratch/moves/fire-blast \
node .claude/skills/fx-preview/rec/rec-move.mjs             # prints played {...} and "frame ms: median p95 max"
.claude/skills/fx-preview/rec/cut-move.sh .agent/scratch/moves/fire-blast fire-blast   # sheet.png, .mp4, -closeup.mp4
```
`rec-move.mjs` (slice 2; `rec-fire-blast.mjs` generalised) pushes a fake view through
`applyView` (attacker instance 101 on `you.active`, defender 201 on `them.active`, `SIDE=opp`
swaps them), waits 900 ms and for both card images to decode, then: `attackBanner`, wait
`holdFor('attack-banner')`, then in ONE `page.evaluate`: `playMove(...)` with `impacts: {
strikeIn: announceStrike }` and `damage({ instanceId, damage: 180, dealt: 180, weakness: true })`
so the number lands on contact; it writes `rects.json` (`from`, `to`, `bannerAt`, `moveAt`,
`bannerHoldMs`) and prints the frame-time probe (140 rAF deltas from the move start). The server
dies between cloud turns; restart it before recording. `pkill -f server/server.js` also kills the
shell that runs it — stop the server by PID.

Review = read `sheet.png` (36 tiles at 12.5 fps from 150 ms before the move) and six key frames
(`ffmpeg -ss <moveAt + offset>` at offsets 0.30 (wind-up), 0.66 (thrust / release), contact − 0.05
(arrival), contact + 0.05 (impact), contact + 0.3 (knock-back / sustained hit), contact + 0.6
(aftermath)) cropped to `5.2 h × (lane + 4.4 h)` around the cards, as `cut-move.sh` does.

## Builder recipe — how to add one move (no design judgment needed)
1. Open the move's Appendix A entry. Note: tier, class, `contact at`, `total`, the Board-mapping
   lines, Palette, Flags. Open its reference sheets if they are on disk (`refs/063-move-refs.json`
   has the URLs; the fetch scripts rebuild them).
2. Copy the closest existing spec from `specs/<type>.mjs` (same type and class; Fire Blast for any
   special tier 3 burst). Rename `id`/`name`, set `vgType`, `statClass`, `tier`, `family`,
   `material`.
3. Set `durationMs` = the entry's `total` (clamped into `TIER_BAND[tier]`) and `contactMs` = the
   entry's `contact at`.
4. Translate each Board-mapping line into a beat with the vocabulary map below; keep the entry's
   times; sizes in h: "1 card" = 1.0, "½ card" = 0.5; "wide" beam = 0.6 w, "narrow" = 0.3 w.
5. Pick card motion from the Timing-by-tier table: specials `rear-lurch` (tier 1 `brace`),
   contact physicals `lunge` (tier 1) or `dash` (tier 2–3), multi-hit → defender `stagger` with
   `hits` = the entry's hit count, ground/quake → `stomp` + `sink`, psychic/wind → `float`, ice →
   `freeze`.
6. Run `node --test client/src/setup/netcode/mat-fx/moves/__tests__/specs.test.mjs` (it runs
   `validateSpec`); fix every error message literally.
7. Record on both seats (§ Recording). Check the six key frames against the entry: the right
   material, the contact beat at `contactMs`, the defender moves at contact, nothing board-wide,
   the probe's median ≤ 17 ms / p95 ≤ 140 ms. Attach `sheet.png` paths to the commit message.
8. Commit `feature: design 063 <type> - <move>` with a `flag:` line for any deviation from the
   entry, and append the deviation under § Deviations.

Vocabulary map (Appendix A Board-mapping → drawer):
| entry word | drawer / preset |
|---|---|
| `charge(attacker, …)` | `coreCharge` (+ `orbitCharge` when the entry says orbs/orbit) and attacker `rear-lurch` wind-up |
| `projectile(shape, path, …)` | `projectile` with `path`; `volley` when "×N" or "stream of N" |
| `beam(…, solid/segmented/helix/pulse-train/widening, …)` | `beam` with that `kind` |
| `burst(target, shape, N, radius, ring/up/fan)` | `shards` (angular shapes) or `splash` (soft shapes) with `count N`, `distance`/`arc` from the words; `ring` = arc 360 |
| `slash(…)` | `slashArc` (count from "×2", "cross" = 2 at 90°) |
| `impactFlash(target, colour, strength)` | `impactFlash` (`strong` → r1 1.3, `soft` → r1 0.9) on layer `top` |
| `shake(table/defender, amp)` | defender `knock` strength (`light` 0.2, `medium` 0.3, `heavy` 0.45) and `terrain 'quake'` for table |
| `aura(target, …)` | `aura` |
| `orb(…)` | `coreCharge` or `projectile` with `path 'straight'` |
| `ring(…)` | `ring` or `shockRings` (at release) |
| `pillar(…)` | `pillar` |
| `terrain(…)` | `terrain` with `kind` |
| `cloud(…)` | `cloud` |
| `vignette(…)` | `vignette` |
| `canvas(…custom…)` | the named drawer if one exists; else add a drawer to `move-drawers.js` with a pose fn + test (one per slice at most; note it under Deviations) |
| `lunge`/`dash`/`cardMotion` | attacker preset `lunge`/`dash`/`spin` |

## Migration / rollout
- No data migration, no protocol change. The generic lunge remains the fallback for every card
  whose move has no spec, so types ship one slice at a time with the rest unchanged.
- Revert = revert the slice's commit; the generated stats module and the vendor script are
  self-contained. The pacing change (banner hold, queue budget) is one commit on its own.
- Reference assets (sheets, GIFs, videos) stay out of the repo; only `refs/063-move-refs.json`
  (URLs and timings) is committed so a later session can refetch.
- Decisions to record in DECISIONS.md at landing: the vendored Showdown stats; `HOLD_MS['attack-
  banner'] = BANNER_MS`; `DEFAULT_MAX_QUEUE_MS = 3800`; "move scenes draw with the tongue material
  and ghost-card motion (design 063 look test)".

## Work plan — slices ≤1 session, each leaving the repo green
Slice 2 is the pivot: it ports the accepted Fire Blast into the generic player and deletes the
look-test files once the port matches. Slices 3–19 each ship one VG type (material + specs) via
`fx-designer` with recordings; slice 20 is the user's pass.
| Slice | Files (create / modify) | Signatures & data shapes | Test cases: input → expected | Green when |
|---|---|---|---|---|
| 0 | create `scripts/vendor-species-stats.mjs`, `mat-fx/moves/species-stats.generated.mjs`, `__tests__/species-stats.test.mjs`; modify `package.json` (`vendor:species-stats`) | `SPECIES_STATS: Record<id,[atk,spa,...types]>`, `SPECIES_ID: Record<slug,id>`, `SPECIES_FALLBACKS: string[]`; script exits 1 on an unmapped slug | every slug of both sprite catalogs ∈ `SPECIES_ID`; `charizardmegax → [130,130,'fire','dragon']`; `gardevoir → [65,125,…]`; `machamp → [130,65,…]` | script + tests green; module < 120 KB |
| 1 | create `moves/move-table.mjs`, `move-select.mjs`, tests | § Selection; `moveFor` returns `{move,vgType,statClass,tier,family,spec}` or null (`spec` from the `specs` argument) | table = spec (154 moves); 7 N/A cells resolve; tiers for 11 classifier kinds + 6 stage literals; gap 10 → coin, 11 → fixed; Colorless+Snorlax → null; Colorless+Pidgeot → flying; Darkness+Charizard → dark; same seeds → same results ×100 | tests green |
| 2 | create `move-spec.mjs`, `move-geometry.mjs`, `card-motion.mjs`, `move-poses.mjs`, `move-drawers.js`, `move-player.js`, `materials/_shared.js`, `materials/fire.js` (moved), `materials/index.js`, `specs/index.mjs`, `specs/fire.mjs` (Fire Blast only), tests for every pure module, `rec/rec-move.mjs`; modify `combat.js` (wiring + `strikeTarget` reads `ctx.family`), `index.js` (`soundPlanFor`), `fx-audio.mjs` (14 family voice sets), `mat-fx.css` (material custom properties); delete `fire-blast-pose.mjs`, `fire-blast.js`, `fire-material.js`, `rec/rec-fire-blast.mjs` | as in § Design | `validateSpec(fireBlast) → []`; `playMove` on the e2e board reproduces take 3 (sheet compared side by side; same contact, same key frames); with empty `SPECS` every attack still lunges; `moveFor` + `SPECS` → Charizard ex's attack plays Fire Blast only when `MOVE_TABLE` is temporarily pointed at it in the test; both seats recorded | full `pnpm test` green; the two sheets attached to the commit |
| 3 | `materials/fire.js` tuned per Fire entries, `specs/fire.mjs` all 11 Fire moves | Appendix A Fire rows | each spec valid; recordings per move | tests green; sheets reviewed |
| 4–19 | one VG type each in this order: water, grass, electric, fighting, psychic, dark, steel, dragon, fairy, ghost, poison, ground, rock, flying, ice, bug. Each: `materials/<type>.js` per its recipe, `specs/<type>.mjs`, new drawers only if the recipe names them, CSS modifier | § Materials recipe + Appendix A rows (types without rows first get the study pass: `refs/063-study/STUDY-BRIEF.md`, Haiku agents, `merge-notes.mjs ONLY=<type>`) | `materials.test.mjs` for the type; every spec valid; recordings on both seats | tests green; sheets reviewed against the entries |
| 20 | user pass on localhost; timing/palette corrections appended under Deviations | — | — | user sign-off per type |

## Deviations (Builder appends here during build)
- 2026-10-05 look test: Fire Blast built outside the table as the acceptance reference (three takes;
  take 3 accepted). Its numbers are now the defaults in § Design.

## Appendix A — per-move animation specs
One entry per move, in the spec's order by type, physical then special. Each entry names its
reference (sprite game, 3D game, durations), the beats seen in the reference, its palette, what the
3D version adds, the board score (beats over the first draft's primitive vocabulary — translate
with the vocabulary map in § Builder recipe — lane-relative, with the contact time), and flags
(missing references, house-rule translations, open calls). The entries are the contract for slices
3–19; a builder adjusts numbers only inside the tier bands and records any other change under
Deviations.

How the entries were made: one study agent per type family read every contact sheet (sprite era
first, then the 3D video) and wrote the entry in the schema of `refs/063-study/STUDY-BRIEF.md`;
the raw notes, including partial entries for the pending types, are in `refs/063-study/notes/`.
Caveat: entries from the Haiku pass (Grass special tier 3, Water special tiers 2–3, Fire special
tiers 2–3, Electric except Nuzzle) sometimes measure sprite beats from the GIF's first frame rather
than its first effect frame; their "effect frames" range on the Refs line is the ground truth.
Every "house-rule conflict" flag marks a full-screen tint, flash or sunburst in the reference that
the board score replaces with a local vignette or aura, per the house rules.

Worked example — Fire Blast (not in the table; the accepted look test), in the entry schema:
Refs: sprite N2B2 (4380 ms, effect frames 42–126) · modern EV (6600 ms, effect frames 33–126)
Sprite beats: 1260–1770 five fireballs orbit the attacker, growing · 1830–2550 red tint, a flame
cluster crosses the ground to the defender · 2610 yellow radial flash · 2670–2910 the 大 flare
grows · 2940–3240 holds · 3300–3600 breaks up · 3660–3840 dark, then normal.
Screen: full-screen red tint 1.8 s, black-out 0.2 s (both replaced by the local vignette).
Palette: #D22908, #EB6C06, #F1AF0D, #FFF6D6.
Modern cue: ball built at the mouth, two rings on release, white core at contact, embers after.
Board mapping (= the MoveSpec in § MoveSpec): 0 orbitCharge+coreCharge · 560 shockRings · 620
projectile(arc) · 820 vignette · 1000 impactFlash + speedRays + starFlare('dai') + embers ·
1300 smoke · attacker `rear-lurch`, defender `knock 0.3` · contact 1000 · total 1900.
Flags: house-rule conflict (tint, black-out) → vignette; blur cost → one blurred pass.

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
