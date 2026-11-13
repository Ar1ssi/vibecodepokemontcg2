# 089: VFX pass — sequencing, layering, missing animations, new shuffle, varied moves, reworked shaders
Status: approved (self — one-shot)
Date: 2026-11-13 · Session: one-shot (worktree `.claude/worktrees/088-vfx-pass`, branch `feature/089-vfx-pass`)

## Problem
The user's request, verbatim (2026-11-13):

> Do a passthrough for all existing vfx and animations and update them. Currently there is some homogeny with moves and I think many of the visual shaders could be reworked and improved. Dont ask me any questions. Also make a new shuffle animation, fill in the gaps for missing animations (such as prize cards), fix layering errors / cards going invisible, and fix sequencing of moves and attacks (ie: a pokemon thats move lets it switch out will end up attacking from bench instead of attacking then switching).

## Acceptance
| # | Criterion (the brief's words) | Evidence |
|---|---|---|
| A1 | "fix sequencing of moves and attacks (ie: a pokemon thats move lets it switch out will end up attacking from bench instead of attacking then switching)" | |
| A2 | "fix layering errors / cards going invisible" | |
| A3 | "fill in the gaps for missing animations (such as prize cards)" | |
| A4 | "make a new shuffle animation" | |
| A5 | "Currently there is some homogeny with moves" (moves must stop looking alike) | |
| A6 | "many of the visual shaders could be reworked and improved" | |
| A7 | "Do a passthrough for all existing vfx and animations and update them" | |

## Assumptions
| # | Gap | Decided (assumed) | Why |
|---|---|---|---|
| S1 | Landing not stated | `Land: branch` (assumed); "push to main" lands it | oneshot-feature default; the engine/netcode diff needs its independent review first |
| S2 | Which "sequencing" beyond the named example | Every case with the same cause: an attack whose effect suspends on a choice plays its scene with the first hits, not after the choice; switches caused by attacks and Trainers slide after the scene; a prompt (prize pick, promote, any picker) opens after the scene that led to it (assumed) | all come from one ordering model; fixing only the example would leave the same bug elsewhere |
| S3 | Which animations are "missing" | The rows of `out/animation-audit.md` §3 that still have no visual on the 3D board, plus what this session found: `cardSwitched`, Prize deal at setup, Special Condition updates, prevented damage / KO, failed attacks, heals, cards moving to or from a pile without a flight (deck, Lost Zone, discard recovery), plain Pokémon entering play, GX / VSTAR use (assumed) | the audit is the repo's own gap list; the user named Prize cards as one example |
| S4 | What "homogeny" is | Measured (`.agent/scratch/089-move-homogeneity.tmp.mjs`): 143/144 move specs and 80/81 signature specs end in the same `impactFlash`; 121 use `shards`, 120 `vignette`; 109/144 defenders play `knock`; 54/144 attackers `rear-lurch`; every signature contacts at 1000 ms. The fix targets those shared beats (assumed) | the sameness is the contact dressing and the card motion, not the travel beat |
| S5 | Which "shaders" | The ten element kinds of `board3d/fx/elements/`, the FX composite, and the card effects (KO burn, attacker rim) (assumed) | they draw every attack; STATE lists their known faults |
| S6 | The new shuffle's look | A riffle shuffle of real card meshes on the deck spot in the three.js scene (cut, riffle, bridge, square), replacing the flat sleeve ring that orbits over the tilted board (assumed) | the old one is a DOM overlay with no perspective; a riffle is what a shuffle is |
| S7 | Unreleased/unmerged prior work | `patch/choice-after-fx` (prompt waits for effects) is ported; `feature/tcgl-missing-fx` (pre-3D-board, 127 files) is not rebased: its gap list is used, its code is not (assumed) | the first applies cleanly in spirit; the second predates the board it would draw on |

## Constraints
- CLAUDE.md: board animations play one after another through the FX queue; each plan returns a hold. Engine, rules,
  netcode and state-logic changes ship with a test that fails without them; visual-only work is exempt.
- D103/D118 one clock (pure pose `.mjs`, DOM/GL twin `.js`); D105 `motionReduced()` reads only the app setting;
  FX are cosmetic (never gate input) except the choice gate, which is bounded by a backstop.
- User taste (memory): no whiteouts, no board-wide blooms, no spinning sunburst rays, one palette per effect;
  the user's Windows reports reduced motion: never gate on the OS flag.
- Hidden info: face-down and redacted cards animate as sleeves; a new engine event carries no hidden data.
- three.js is vendored; node tests need no WebGL (pure maths in `.mjs`). GLSL3: `out vec4`, no `gl_FragColor`.
  `pnpm fx:check-elements` must stay green. Client `import()` paths stay literal (D247).
- The server always runs the rules (design 087); events are advisory: a client that drops them stays correct.

## Current state (read this session)
- `shared/engine/reduce/attack.mjs` `flipAndResolveAttack` → `attack-effect.mjs` `resolveAttackEffectPhase` emits
  `damageUpdated`/`pokemonKnockedOut`/… then effect steps, then `attackExecuted` LAST. A step that asks a choice
  (`atkSwitchSelf` with ≥2 Benched, `atkGust`) suspends: batch 1 = hits only, batch 2 = `cardSwitched` +
  `attackExecuted` (probe: `.agent/scratch/089-switch-events.tmp.mjs (gitignored)`).
- `client/src/setup/netcode/advisory-animations.mjs` plans FX per event; `attackLeads` moves an attack before its
  first hit in the same batch. `cardSwitched` (8 engine sites: Switch, Boss's Orders, gusts, attack switches) has
  no plan and no slide pin: the 3D board glides the cards in 180 ms at view-apply, before any queued scene.
- `advisory-animations.js` `handleBeforeApply` pins slide/knockout meshes, then `fxQueue.whenIdle().then(
  releaseSlidePins)`: with the queue idle and no settle hold (a batch with no card-move event: every attack KO
  that ends in a prize or promote choice) the promise is already resolved, so the pins drop in the same tick.
- `board3d/board-scene.js` `syncCards` releases the mesh of any card with no pose (buried in a pile, in a deck):
  a knocked-out stack loses every mesh but the new discard top at view-apply, seconds before its scene.
- A pin is a 9 s `tween` (a flight): a flying card cannot be driven (`card-mesh.js drive`), so a pinned attacker
  or defender takes no motion from a move scene.
- `mat-fx/ko-scene.js`, `card-flight.js playDiscardFlights`: cards without a mesh fly as HTML clones in the top
  document: drawn over every mesh, flat (no table perspective).
- `apply-view.js` opens a pendingChoice picker during the diff, before the batch's effects are even queued.
- `image-logic/shuffle-flight.js`: 6–12 DOM sleeves orbit a ring over the deck (design 009).
- `prizesSet` is sound-only; Prize cards appear in their slots.
- Moves: `mat-fx/moves/` (144 specs + 81 signature specs, 22 drawers, 7 attacker and 5 defender motions);
  element kits in `moves/elements/`, shared contact beats in `_shared-beats.js`; GL kinds in `board3d/fx/elements/`.

## Options
1. **How the client learns an attack began before it ends.** A: infer from the view (pendingChoice source) — no
   attacker or name for the opponent. B: emit `attackExecuted` early — changes what every consumer of it means.
   C: a new additive event `attackStarted` at the one entry every attack passes (`flipAndResolveAttack`).
   **Pick C**: one line in the engine, no consumer changes meaning, clients that ignore it behave as today.
2. **Where an attack's scene plays in its batch.** A: always first. B: before its first hit; with no hit, before
   its first other consequence after `attackStarted`. **Pick B**: a "before doing damage" gust or Koga's Ninja
   Trick switch still plays first; a no-damage switch attack plays attack → switch.
3. **A suspended attack.** A: hold its hits until `attackExecuted` arrives (damage counters already show; the
   player picks a Benched Pokémon with nothing having played). B: play the scene with the first batch that has a
   consequence, remember it, and plan nothing for the late `attackExecuted`. **Pick B**.
4. **Pins.** A: keep tween pins, fix only their release. B: pose pins inside the card pool (the card rests at its
   old pose; `setPose`/faces/hidden wait) plus a retain count that keeps a mesh the model dropped. **Pick B**:
   pinned cards can be driven and keep their overlays; a KO'd stack stays whole until its scene.
5. **Cards with no mesh in a flight.** A: keep HTML clones. B: ghost meshes from the same pool (negative ids).
   **Pick B**: one renderer, one depth order, table perspective.
6. **New shuffle.** A: restyle the DOM ring. B: a three.js rig on the deck spot. **Pick B** (S6).
7. **De-homogenising moves.** A: re-author 225 specs by hand. B: change what the shared beats and motions
   resolve to per element (contact dressing, defender reaction, attacker motion pools), then re-assign specs by
   rule with per-spec overrides where the move's identity needs it. **Pick B**: variety comes from the element.

## Design
### D1 Engine: `attackStarted` (slice 1)
`flipAndResolveAttack` pushes `{ type: 'attackStarted', playerId, attackerId, defenderId, attackName }` once,
after `withSelfNamedAttack`, before any coin. No state change.

### D2 Attack ordering (slice 2) — `advisory-animations.mjs`
- `EVENT_FX.cardSwitched = 'retreat'`; `lifecycle-pose.mjs moveIdsForEvent` reads `{activeId, benchId}`;
  `slideIdsForEvent` and `board-rects.js CARD_MOVE_EVENTS` include `cardSwitched`.
- `attackSegments(events, carried)` → per segment `{ started, executed, hits, lead, early }`; a segment ends at
  `attackExecuted` or `turnStarted`. `lead` = first hit (damage / KO / status on a card other than the attacker)
  after `attackStarted` (or segment start); with no hit and a known start (`attackStarted` in the segment, or
  `carried` = an attack started in an earlier batch and not yet played) = first consequence event.
  Consequences: every event with a visible plan except coin events.
- Suspended segment (started, no `attackExecuted`, ≥1 consequence): `early` = a synthetic strike
  `{ type: 'attackExecuted', early: true, attackerId, defenderId, attackName, playerId, damage, benchDealt }`
  (damage = dealt to `defenderId`, benchDealt = dealt to others, from the segment's hits) queued before `lead`.
- `advisory-animations.js` keeps `openAttack = { key, played }` across batches (key = playerId|attackerId|
  attackName): set by `attackStarted`, `played` set when a strike (early or real) is queued, cleared by
  `attackExecuted`/`turnStarted`/game restart. A real `attackExecuted` whose attack was already played plans
  nothing (its later hits pop on the impact queue).

### D3 Pose pins, retained and ghost meshes (slice 3)
- `card-mesh.js`: `pinPose(id)` freezes the card: `setPose`, `setFaces`, `setHidden` store into `card.pin.next`;
  `unpinPose(id, { ms = 0 })` applies them. `tablePoseOf`, `cornersOf`, drives and `cardFx` work on a pinned card
  as on any resting one. `heldTablePose` goes (its two scene methods stay as thin aliases for pin state).
- `board-scene.js`: `retainCard(id)` / `releaseCard(id)` (counted). `syncCards` keeps a retained card the model
  no longer poses and skips its overlay sync; the last release frees it if the model still has no pose.
  `pinCard(id)` = pin + retain; `unpinCard(id)` = unpin + release. `spawnGhostCard({ src, backSrc, face,
  widthPx, rect, turn })` → a negative id drawn by the pool at a flight pose; `removeGhostCard(id)`.
- `slide-pins.mjs`: `createSlidePins({ pin, unpin, setTimer, clearTimer })`; `pin(id)`, `take(id)`, `claim(id)`
  (a queued scene owns it: `releaseAll` skips it), `releaseAll()`, backstop `SLIDE_PIN_MAX_MS`.
- `card-flight.js playMeshTrack` retains the card for its flight. Call order at every site: start the flight,
  then `take` the pin. `playDiscardFlights` and the KO scene fly ghost meshes for cards with no mesh.
- `advisory-animations.js`: pins are released when the queue next goes idle AFTER the batch's plans are queued
  (`queueMicrotask`), and a `knockout` plan claims its pins when it runs.

### D4 Choice gate + dropped plans (slice 4)
- Port `patch/choice-after-fx`: `netcode/choice-gate.mjs` (`createChoiceGate`, `createKnockoutScenes`,
  `CHOICE_BACKSTOP_MS = 9000`), `apply-view.js reconcileChoiceAfterEffects`, option `whenChoiceMayOpen`.
- `fx-queue.mjs createFxQueue({ onDrop })`: `clear()` calls `onDrop(plan)` for every pending plan;
  `advisory-animations.js` settles them (drawn/revealed cards shown at once, prize handoffs released, KO ghosts
  dropped), so a cleared queue never leaves a card hidden until the 9 s backstop.

### D5 Missing animations — planner + effects (slice 5)
| Event(s) | Plan | Effect |
|---|---|---|
| `specialConditionUpdated` | `status` per added condition, `status-clear` per removed (diff against the card's conditions before the batch) | existing pops |
| `damagePrevented`, `koPrevented` | `fx` `block` `{ instanceId }` | hex shield flash on the card + "No damage" / "Survived" tag |
| `attackPrevented`, `attackConditionFailed`, `attackConfusedFizzle`, `attackBenchFizzled`, `attackCopyNothing` | `fx` `attack-fail` `{ attackerId, attackName }` | banner (attack name, struck through) + fizzle puff on the attacker |
| `retreatBlocked` | keeps its sound; adds `fx` visual `block` on the Active | same shield, amber |
| `damageUpdated` classified heal | (in `damage`) heal motes + soft green pulse | |
| `prizesSet` | `fx` `prizes-deal` `{ user, count }`, `blocking` | each Prize mesh flies from the deck top to its slot, staggered |
| `prizesRevealed`, `prizeSwapped`, `prizesReset`, `prizesRedrawn`, `prizeHandSwapped`, `prizesShuffledToDeckBottom` | `fx` `prize-pulse` `{ user }` | glow sweep over the Prize grid (the model already flips / re-seats the meshes) |
| `cardMoved` not planned today, by route | `transit` `{ user, instanceId, from, to }` | to `deck`: fly (sleeve when the card is hidden to the viewer) from its pre-diff spot to the deck; to `lostZone`: fly to the Lost Zone pile with a violet catch; from `deck`/`discard`/`lostZone` to `hand` (no draw/reveal plan), `active`, `bench`: fly out of the pile to where it now is |
| `cardsLostZoned`, `cardsPutInDeck`, `cardsMovedToDeck*`, `zoneMovedToDeckBottom` | `transit` per named card, or a pile pulse when only a count is named | |
| `cardMoved` entering play (plain Pokémon) | `enter` (exists; today silent unless Mega/Tera) | landing ring + dust on the slot |
| `gxAttackUsed`, `vstarUsed` | keep the cheer; add `fx` `power-flare` `{ user, kind }` | marker flare on the user's side of the mat (local, no whiteout) |
All new effects register in `mat-fx/index.js` and `fx-holds.mjs`; sound cues in `sfx-cues.mjs` reuse existing
samples. Hidden info: a transit of a card the viewer cannot see uses the owner's sleeve.

### D6 Element shaders (slice 6) — files `board3d/fx/**`, `moves/elements/**`, `scripts/fx/check-element-shaders.mjs`
Per kind, rebuild the look as a lit volume (vfx-design skill; `references/elements/*.md`):
`fireball` (self-shadowed volume, motion-stretched tail, shed embers), `flameJet` (two flow layers with alpha
erosion, hot core to sooty tip, board heat haze), `bolt` (tapered trunk, timed forks, afterimage of the previous
path, coloured outer glow, contact glow on the cloth), `plasma` (fresnel shell, cell crackle, orbiting arcs),
`waterBeam` + `waterDrop` (deep blue body that refracts the board; foam only at edges and impact — fixes "water
spray reads icy"), `lens` (smaller field with chromatic ripple — fixes "psychic rings large"), `smoke` (lit from
the noise gradient, soft depth, curl), `debris` (dust trails, contact shadows), `sprite` (soft-particle depth
fade). FX composite (`fx-layer.js`): soft-knee highlight roll-off so impact centres never clip to white (fixes
"impact centres can blow out"). Known faults to close in the kits: Pin Missile needle size, leaf orientation.
New kinds are allowed where a kind above cannot carry a look (each = `<kind>.js` + pure `<kind>.mjs` + test +
one line in `elements/index.js` + the shader check).

### D7 Moves (slice 7) — files `mat-fx/moves/**` (not `combat.js`)
- Contact dressing per element: `_shared-beats.js` impact flash stops being one look. Each element kit supplies
  its own contact beat (fire: bloom + rising embers + soot; water: crown splash + falling drops; electric: arc
  burst + arcs crawling the card edge; ice: frost star + shatter shards; grass: leaf burst; rock/ground: debris
  + dust skirt; psychic: lens ripple; ghost/dark: smoke implosion; steel: spark shower + ring; fairy: star
  motes; dragon: plasma flame; fighting: shock ring + streaks; poison: splat + bubbles; flying: gust rings;
  bug: needle scatter; normal: clean ring).
- Defender reactions per element in `move-poses.mjs`/`card-motion.mjs` (new motions; each a pure pose with a
  test): `jolt` (electric), `scorch` (fire), `chill` (ice), `drench` (water), `crush` (rock/ground), `whirl`
  (flying), `wither` (grass/poison/bug), `warp` (psychic/fairy), `dread` (ghost/dark), `clang` (steel),
  `pummel` (fighting). Specs whose defender is `knock` take their element's reaction unless they name another.
- Attacker motions: add `hop`, `coil`, `slam`, `sweep`, `channel`; re-assign so no motion exceeds 25% of specs.
- Hit-stop: 60–90 ms hold at contact for tier 3, inside the move player's clock (hold unchanged).
- Signature specs: contact times spread over 850–1250 ms by family; `starFlare` kept only where it is the
  move's own shape.
- Validator and the 063/065 tests stay green; a spec pinned by a test keeps its pinned fields.

### D8 Shuffle and Prizes (slice 8) — files `board3d/shuffle-rig.js`, `board3d/shuffle-rig-math.mjs`, `image-logic/shuffle-flight.js`, `shuffle-pose.mjs`, `mat-fx/prize*.{js,mjs}`, CSS
- `shuffle-rig-math.mjs` (pure): `shufflePlan({ cards, seed })` → per card `poseAt(t)` in table px for the
  beats cut (0–0.18), riffle (0.18–0.62: the two packets' cards fall alternately, each on a short arc),
  bridge (0.62–0.84: the pile arches and springs flat), square (0.84–1: a tap; the pile settles 2 px and back).
  `SHUFFLE_MS = 1500`; 14–20 cards by deck size; under 2 cards nothing plays.
- `shuffle-rig.js`: card meshes with the side's sleeve in the table frame at the pile's pose; the real pile
  hides for the run; `scene.playShuffle(side, zone, { count })` → ms. `playShuffleFlight` calls it and returns
  its hold; no scene → 0. Reduced motion: the pile taps once (square beat only).
- Prize deal (`prizes-deal`) and claim (`prize-claim`) restyled in the same visual language: sleeves leave the
  deck top, arc, land with a soft contact shadow pop; the claim is a gold edge sweep over the taken slot.

### D9 Non-attack effects pass (slice 9) — files `mat-fx/{lifecycle,flow,banner,status,entry,prize,coin}*.{js,mjs}`, `combat.js` overlays only, `css/mat-fx.css`
Every effect in `mat-fx/index.js` EFFECTS plus the slice-5 ones, reviewed against the house rules and updated:
energy attach, Tool attach, retreat/switch/promote slide dressing, Trainer/Stadium presentation, discard puff
and catch, damage/heal numbers, target ring, banners (turn, ability, attack, attack-fail), status pops, block
shield, enter ring, transit trails, prize pulse, power flare, game over. One table in § Deviations: effect ·
verdict (kept / tuned / rebuilt) · what changed.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | attack with no events but `attackStarted` (suspended before any consequence) | nothing plays yet; `openAttack` carried; the batch with the first consequence plays the strike | [ ] |
| 2 | `attackStarted` twice for one attack (copy/re-flip paths) | second is ignored (same key, already open) | [ ] |
| 3 | self-switch after damage, auto (1 Benched) | banner → scene from the Active → damage → slide | [ ] |
| 4 | self-switch after damage, choice (≥2 Benched) | batch 1: banner → scene → damage; batch 2: slide only | [ ] |
| 5 | no-damage switch attack | banner → aura on the Active → slide | [ ] |
| 6 | Koga's Ninja Trick (defender switches before `attackStarted`) | slide first, then the attack against the new Active | [ ] |
| 7 | before-damage gust (switch after `attackStarted`, hits follow) | slide, then banner → scene on the new Active | [ ] |
| 8 | attack KO whose batch has no card-move event | KO'd stack stays whole in its slot through banner and scene, then burns/flies | [ ] |
| 9 | pin never taken (plan dropped, tab hidden) | released when the queue goes idle or after `SLIDE_PIN_MAX_MS`; retained mesh freed | [ ] |
| 10 | pinned card released by a room reset / view without it | pin and retain dropped, mesh freed, no throw | [ ] |
| 11 | ghost mesh whose flight is cancelled | removed by its own backstop | [ ] |
| 12 | FX off / reduced motion | no pins (as today); effects skip or use their static form; choice gate opens at once with FX off | [ ] |
| 13 | queue cleared with held draws | cards show at once | [ ] |
| 14 | choice arrives, effects never drain | picker opens at `CHOICE_BACKSTOP_MS` | [ ] |
| 15 | hidden info: opponent's hand card to deck | flies as their sleeve | [ ] |
| 16 | reconnect / catch-up replay | plans dropped (mirror guard), `openAttack` cleared, no pins left | [ ] |
| 17 | both seats | each client derives the same order from the same events; far seat effects turn 180° | [ ] |
| 18 | spectator | same plans; no picker (banner only) | [ ] |
| 19 | shuffle with 0–1 cards / no scene / reduced motion | nothing / 0 hold / tap only | [ ] |
| 20 | Prize count 4 (Build & Battle) | four flights | [ ] |
| 21 | shader fails to compile | `pnpm fx:check-elements` fails before landing | [ ] |
| 22 | element capacity reached | instances dropped that frame (079 rule) | [ ] |

## Test plan
- Engine: `attack-started-event.test.mjs` (once per attack, before hits; suspended and resumed paths).
- Planner: `advisory-animations.test.mjs` additions for every edge row 1–7, D5 rows, hidden-info transit.
- Board: `card-mesh` pin/unpin, `board-scene` retain/ghost (existing fake-three harness), `slide-pins.test.mjs`.
- Queue/gate: `fx-queue.test.mjs` onDrop; `choice-gate.test.mjs`; `apply-view.test.mjs` held choice.
- Pure pose/packer tests for every new `.mjs` (shuffle plan, new motions, new element packers).
- Browser: `pnpm fx:check-elements`; `scripts/e2e/fx-sequence-test.mjs` (solo room: attack with self-switch and
  an attack KO; asserts no in-play card is unseen while a scene plays, and plan order).
- Visual: fx-preview captures per slice (agents); the user's localhost list at the close.

## Migration / rollout
No data. Revert path: `git revert` the slice commits; `attackStarted` is additive (an old client ignores it, a
new client without it orders as before).

## Work plan — slices ≤1 session, each leaving the repo green
| Slice | Files (create / modify) | Signatures & data shapes | Test cases: input → expected | Rulings used (source) | Green when |
|---|---|---|---|---|---|
| 1 engine event (lead) | `shared/engine/reduce/attack.mjs`; test `shared/engine/__tests__/attack-started-event.test.mjs` | § D1 | attack → events start with `attackStarted` (after any Confusion coin), exactly one; self-switch choice: batch 1 has it, batch 2 does not | n/a (no card text) | engine tests green |
| 2 ordering (lead) | `advisory-animations.{mjs,js}`, `mat-fx/lifecycle-pose.mjs`, `board3d/board-rects.js`, tests | § D2 | edge rows 1–7 | n/a | `node --test client/src/setup/netcode` |
| 3 pins / retain / ghosts (lead) | `board3d/card-mesh.js`, `board-scene.js`, `mat-fx/slide-pins.mjs`, `lifecycle.js`, `ko-scene.js`, `card-flight.js`, `advisory-animations.js`, tests | § D3 | edge rows 8–11 | n/a | board3d + mat-fx tests |
| 4 choice gate / onDrop (lead) | `netcode/choice-gate.mjs`, `apply-view.js`, `advisory-animations.js`, `mat-fx/fx-queue.mjs`, `socket-event-listeners.js`, `e2e-api.js`, tests | § D4 | edge rows 13–14 | n/a | netcode tests |
| 5 missing animations (lead) | `advisory-animations.{mjs,js}`, `mat-fx/{index.js,fx-holds.mjs,sfx-cues.mjs}`, new `mat-fx/{response.js,response-pose.mjs,transit.js,transit.mjs,prize-deal.js}`, `combat.js` (heal), `entry.js`, `css/mat-fx.css`, tests | § D5 | D5 rows; edge 15, 20 | n/a | netcode tests |
| 6 shaders (lead) | § D6 | § D6 | packer tests; `fx:check-elements` | vfx-design element refs | captures + checks |
| 7 moves (lead) | § D7 | § D7 | pose tests; validator | 063 refs | captures + tests |
| 8 shuffle / prizes (lead) | § D8 | § D8 | plan tests; edge 19, 20 | n/a | captures + tests |
| 9 non-attack pass (lead) | § D9 | § D9 | touched pose tests | house rules | captures + tests |
| 10 verify + review (lead) | `scripts/e2e/fx-sequence-test.mjs`, harness docs | — | e2e asserts | — | full `pnpm test`, gates, review findings fixed |
Every slice is built inline by the lead: the user stopped the fx-designer agent on 2026-11-13 ("do it yourself so
itll be higher quality"). Visual slices use the fx-preview captures for the render-and-critique loop.

## Deviations (Builder appends here during build)

---
Self-approval checklist:
- [x] Every constraint traceable into the Design section
- [x] Every edge-case row has an expected behavior
- [x] Interfaces named and typed (D1–D5); D6–D9 pin scope and looks, their visual tuning is logged under Deviations
- [x] Slices each ≤1 session and independently green
- [x] Lead slices pinned; no card rulings involved
- [x] No section reads "TBD"
- Found, not fixed (unrelated to this request; an ISSUES line at landing): `stadium-environment-layout.test`
  "environmentKeyFor gives every Homebrew Stadium … a board" fails on `origin/main` (6f5011bec). The Homebrew set
  was renumbered (ec59f36e3), so `ENVIRONMENT_BY_CARD` ids name other cards (customhb-351 is now Shopping Center,
  Scorched Earth is 293), and seven new Stadiums have no board. Boards should key on the card name.
- Slice 1: two client tests that replay real engine events list `attackStarted` first.
