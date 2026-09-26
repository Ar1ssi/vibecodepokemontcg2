# 048: GX backlog II — I184–I189 engine features

Status: approved (self — one-shot)
Date: 2026-09-26 · Session: S318

## Problem

The design 047 GX oracle audit (out/gx-oracle-audit.txt, triaged in out/gx-no-effect-triage.md)
left six P3 engine-gap issues in `.agent/ISSUES.md`, all missing engine features rather than
regressions: I184 opponent play/attack locks + extra turns, I185 KO/conditional-KO/prize
manipulation, I186 bounce + bench setup, I187 scaling residuals + the Kaleidostorm anomaly, I188
Backfire + Trickster-GX verification, I189 ability gaps (Disk Reload / Crushing Charge / Power
Recharge). Prompt (verbatim): "The six P3 issues I filed in the landing commit … try and one shot
these changes."

## Constraints

- `shared/engine/rules/*` and `effects/*` are pure/DOM-free; every behavior change ships with a
  `node --test` test that fails without it (CLAUDE.md code standard).
- Oracle gate ratchets per-family rates (`scripts/oracle-baseline.json`,
  `scripts/gx-oracle-baseline.json`); a deliberate re-ratchet is its own commit with a reason.
- Unknown/unreadable clauses stay honest no-ops, never guessed (damage-parser convention).
- Lock state must survive `cloneGameState` (shallow player spread): replace arrays, never mutate.
- `advanceTurn` rebuilds `player.flags` wholesale; anything that must outlive a turn is a
  player-object field (`restOfGame` pattern) or is consumed in the same command.
- No new dependency. No netcode/UI.

## Current state (read this session)

- Attack text → steps: `rules/attack-steps.mjs` (`parseAttackSteps`, TEMPLATES/BLOCKS) →
  `effects/attack-steps.mjs` (`ATTACK_STEP_HANDLERS`) via `effects/executor.mjs::executeSteps`
  (resume tokens carry `steps`/`stepIndex`/`context`; `memo` per step; `optional()` wrapper).
- Damage scaling: `rules/damage-parser.mjs::parseAttackDamage`; the legacy fallback at
  `:368` (`/number of energy|× the number/` → `base * energyCount`) fires on Kaleidostorm's
  "Move any number of Energy…" (probe: 150 → 300 on the fixture, KOing the defender — the I187
  "anomaly" is this fabrication, not a move-energy bug).
- Locks today: card-level `cannotAttackUntilTurn`/`cannotRetreatUntilTurn`/`cannotAttackAttackName`
  written by `reduce.mjs:6287-6308` (`parseNextTurnLock`) and read in `validateLegality`
  attack/retreat. No player-level play/attack locks; no extra-turn path (`advanceTurn` always
  alternates; only extra-*attack* exists at `reduce.mjs:6600`).
- Prize machinery: `prizesOwed` → `settlePrizeEntitlements`/`resolvePrizeChoice`; `view.mjs`
  `prizeCards` already exposes a prize when `player.flags.prizesFaceUp` or `card.revealed`.
  Clear Vision's `atkRestOfGame {kind:'gxLock'}` is already parsed and enforced
  (`reduce.mjs:3985`) — I184's Clear Vision item is already shipped; add a regression test.
- Trickster-GX already parses (`parseCopyAttack` → `{source:'oppInPlay'}`) and the copy flow
  exists (design 031/039); the oracle row is empty because the fixture defender has no attacks —
  verify with a board test.
- Disk Reload parses to `drawAbility until:5` and executes; the oracle fixture's p1 hand is
  exactly 5 cards, so it draws 0 — verify with a small-hand test.
- Extra-energy conditions ("at least N extra {T} Energy attached (in addition to this attack's
  cost)") have no shared reader; five GX texts need one (Dark Moon, Supreme Puff, Dark Union,
  Acme, Chaotic Order).

## Options

- A — per-card one-off regexes/special cases: fastest per card, but duplicates the GX wordings
  and leaves the next audit with the same misses. Rejected.
- B — shared step types + a shared extra-energy reader on the existing parser/executor rails:
  one mechanism per wording family, fixtures prove each. Chosen.
- C — leave I184 locks/turns unimplemented (oracle-invisible in the current harness) and only
  land the observed winners. Rejected: the issues are the user's list, and correctness does not
  depend on the harness's tag vocabulary.

## Design

### Shared pieces

- **Extra-energy reader** (`rules/attack-steps.mjs` + `effects/attack-steps.mjs`):
  - Sentence loop strips `^if this pokémon has at least (\d+) extra(?: \{([a-z])\})? energy
    attached to it(?: \(in addition to this attack's cost\))?, (?:and )?` → flags
    `requiresExtraEnergy: [{count, energyType}]` (compound "and N extra {T} Energy" appends).
  - `effects/attack-steps.mjs::extraEnergySatisfied(ctx, requirement)`: attached Energy on the
    attacker minus the attack's printed cost (`ctx.sourceCard.attacks` matched by
    `ctx.step.attackName`; typed requirements subtract that type's cost symbols) ≥ count;
    a missing attack/cost resolves 0 (fail closed).
  - Handlers that read the flag: `atkKnockOut`, `atkShuffleOppAllBench`, `atkAddMarker`,
    `atkTakePrize`, `atkBenchFromDiscard` (`thenAttachPerPlaced`).
- **Player-level locks** (survive flags rebuild; arrays copied, never pushed):
  - `opponent.attackLockUntilTurn = turn+1` (Iron Rule) — read in `validateLegality` attack case.
  - `opponent.playLocks = [...existing, { untilTurn: turn+1, kinds }]`, kinds ⊆
    `['item','trainer','specialEnergy','any']` (Distort/Sonic Volume/Heavy Rock/Horror House/
    Dark Moon). Read in `validateLegality` playTrainer (subtype match), attachCard (Special
    Energy / `any`), moveCard hand→bench|active (`any`). A lock counts while
    `untilTurn >= state.turn.number`.
- **Extra turn** (Dialga Timeless-GX, Supreme Puff-GX): `atkTakeAnotherTurn` sets
  `player.flags.extraTurn = true`; `finishAttackTail`'s turn-end block consumes it and calls
  `advanceTurn({ nextPlayerId: playerId })` without `resolveCheckup` ("skip the between-turns
  step"), otherwise the existing checkup+advance path. Missing flag → unchanged behavior.
- **Prize helpers** (new steps, `effects/attack-steps.mjs`): all move cards between
  `zones.prizes`/`deck`/`discard` with `cardMoved` events; prizes stay face down unless
  `atkPrizesFaceUp` sets `card.revealed = true` (view already honors it).

### New step types (parser → handler)

| Step | Text (normalized) | Handler semantics |
|---|---|---|
| `atkCountersEach` `perOpponentHand` | "for each card in your opponent's hand, put 1 damage counter on their active pokémon" | count = opponent hand size; `placeCounters` |
| `atkDiscardOwnHand` `what`/`upTo` | "discard any number of supporter cards from your hand" / "discard up to 2 cards from your hand" | candidate filter by `what` (`matchesSearch`), min 0 for `upTo`; `countsForDamage` |
| `atkMoveSelfEnergyToHand` | "put 2 {r} energy attached to this pokémon into your hand" | move up to N matching attached cards to hand |
| `atkTakeAnotherTurn` | "take another turn after this one" | sets `flags.extraTurn` |
| `atkOppPlayLock` | "your opponent can't play any item/special energy/trainer/any cards from their hand during their next turn" | appends a `playLocks` entry |
| `atkOppAttackLock` | "during your opponent's next turn, their pokémon can't attack" | sets `attackLockUntilTurn` |
| `atkShuffleOppAllBench` | "your opponent shuffles all of their benched pokémon and all cards attached to them into their deck" | shuffle each bench stack into deck |
| `atkBothDrawUntil` | "each player draws cards until they have 7 cards in their hand" | draw-to-7 for both |
| `atkBenchFromDiscard` × filters | "put 3 in any combination of {r} pokémon-gx or pokémon-ex … onto your bench", "…any number of pokémon that evolve from unidentified fossil…" | `ruleBoxes`, `evolvesFrom`, `anyNumber`, optional `thenAttachPerPlaced` |
| `atkBounceOppBench` | "put 2 of your opponent's benched pokémon and all cards attached to them into your opponent's hand" | bench stacks → opponent hand |
| `atkBounceOwnInPlay` | "put any number of your pokémon in play and all cards attached to them into your hand" | chosen own stacks → hand; vacated Active settles |
| `atkDiscardOppPokemon` | "discard 1 of your opponent's pokémon and all cards attached to it" / "discard your opponent's active pokémon…" | stack → discard, no KO, no prizes |
| `atkKnockOut` `ultraBeast` / `atkKnockOutChoose` `notGx` | "if your opponent's active pokémon is an ultra beast, it is knocked out" / "knock out 1 of your opponent's basic pokémon that isn't a pokémon-gx" | condition readers |
| `atkOppDeckToPrizes` / `atkOppDiscardToPrizes` / `atkShufflePrizesAndRedraw` / `atkPrizesFaceUp` / `atkDiscardPrize` / `atkPrizeDiscovery` | Symbiont-GX / Injection-GX / Stinger-GX / Blaster-GX / Burst-GX / Discovery-GX | move cards; face-up via `card.revealed`; Discovery no-ops when deck < prizes |
| `atkMillAttachIfEnergy` | "discard the top card of your deck. if it's a basic energy card, attach it to 1 of your pokémon" | mill top to discard; basic Energy → attach (ask target) |
| `atkRecover` `all`+name | "put all electropower cards from your discard pile into your hand" | all matching-name discard cards → hand |
| `atkShuffleOppBench` `scope:'any'` | "choose 1 of your opponent's pokémon. your opponent shuffles that pokémon and all cards attached to it into their deck" | any root (active or bench) |
| `atkBenchFromDeckTop` "you may" optional | Massive Catch-GX wording | existing handler, wider regex |

### Scaling fixes (I187)

- `damage-parser.mjs:368` fallback only when a sentence of the text pairs "damage" with the
  "number of energy" phrase (`/number of energy|× the number|* the number/` + `/\bdamage\b/`);
  a pure move/attach sentence no longer multiplies (Kaleidostorm 150 stays 150).
- `handDiscarded` scaling: `parseAttackSteps` marks hand discards `countsForDamage` when the
  text has "this attack does N damage for each card you discarded in this way";
  `parseAttackDamage` reads `ctx.handDiscarded` for that clause (Ditch and Splash, Chuck Away).
- `opponentGxExCount` ctx (built in `rules/attack-damage-context.mjs`) for Jumping Balloon's
  "for each of your opponent's Pokémon-GX and Pokémon-EX in play" (0 on the fixture → base).

## Edge cases & failure modes

| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | extra-energy clause unmet / attacker out of play | gate fails closed; the gated step (KO/marker/attach/prize) is skipped | [x] Dark Moon/Supreme Puff/Chaotic tests |
| 2 | extra-energy clause on a card whose attack cost is unknown | the requirement is measured against cost 0; real steps always carry the attack being used | [x] handler invariant (step.attackName is the resolving attack) |
| 3 | play lock expires (current turn > untilTurn) | no block on later turns; array replaced not mutated | [x] Distort/Iron Rule expiry assertions |
| 4 | "can't play any cards" vs Basic Energy attach, Basic play, Trainer play | all three blocked while locked; non-hand actions unaffected | [x] Heavy Rock test |
| 5 | extra turn when the attack ended the game | no extra `turnStarted`; game end wins | [x] Timeless KO test |
| 6 | extra turn skips between-turns (no Poison/Burn tick, no deferred KO) | checkup not called; turn number +1, same player, draw 1 | [x] Timeless poison test |
| 7 | bounce of the last opponent's Pokémon / own Active | opponent promotes; own Active settles via `settleVacatedActive` (game end if no bench) | [x] Big Throw wipe test + existing settle path |
| 8 | discard-vs-KO (GG End/Big Throw) | cards to discard, no `pokemonKnockedOut`, no prizes | [x] GG End / Big Throw tests |
| 9 | Stinger/Discovery with fewer deck cards than Prizes | Discovery does nothing (printed); Stinger takes what exists | [x] Discovery short-deck test |
| 10 | face-up Prizes survive turns | `card.revealed` is a card field, view exposes it; cleared when the card leaves the Prize zone | [x] Blaster test + take-clears in reduce/handlers |
| 11 | mill-attach on a non-Energy top card | card discarded, no attach | [x] Crushing Charge non-Energy test |
| 12 | Breakdown/School Storm counts on an empty opponent hand | 0 counters, no NaN/negative | [x] Breakdown empty-hand test |
| 13 | Kaleidostorm on a full board | 150 damage (no fabricated ×Energy), move-energy still runs | [x] probe + board test |
| 14 | name recovery ("Electropower") case-insensitively matches | all matching cards to hand; no other card taken | [x] Power Recharge test |

## Test plan

- New `shared/engine/__tests__/gx-backlog-ii.test.mjs` (board-level, `applyCommand`): one test
  per card/wording, asserting zone moves/damage/events; negative cases for unmet conditions.
- Parser unit cases in the same file (`parseAttackSteps` shapes) and
  `shared/engine/rules/__tests__/rules-extended.test.mjs` for the damage-parser fixes.
- Gates: `node --test` on touched files, `pnpm test:changed`, full `pnpm test`;
  `pnpm audit:oracle`, `node scripts/audit-gx-oracle.mjs`, `pnpm audit:abilities`,
  `pnpm audit:attacks`. Any baseline move is its own commit with the reason.
- No manual/UI check.

## Migration / rollout

- n/a: pure step/steps additions and parser tightening; no state schema change beyond
  optional player/card fields (`playLocks`, `attackLockUntilTurn`, `revealed`), all
  absent-tolerant. Revert = `git revert` the slice commits plus baseline restore if re-ratcheted.

## Work plan — slices ≤1 session, each leaving the repo green

| Slice | Files (modify) | Signatures & data shapes | Test cases: input → expected | Rulings used (source) | Green when |
|---|---|---|---|---|---|
| 1 (I187) | rules/damage-parser.mjs, rules/attack-steps.mjs, rules/attack-damage-context.mjs, effects/attack-steps.mjs | `parseAttackDamage` handDiscarded branch; `atkCountersEach.perOpponentHand`; `atkDiscardOwnHand{what,upTo}`; ctx `opponentGxExCount` | Kaleidostorm text+ctx energyCount 2 → total 150; Ditch/Chuck discard 2 → 80; Breakdown opp hand 4 → 40 counters; Jumping Balloon 2 GX/EX → 180 | GX corpus rows (out/pkmn-gx-cards.json) | tests + gx oracle per-energy not down |
| 2 (I186) | rules/attack-steps.mjs, effects/attack-steps.mjs | `atkBounceOppBench`, `atkBounceOwnInPlay`, `atkShuffleOppBench{scope}`, `atkBenchFromDiscard{ruleBoxes,evolvesFrom,anyNumber,thenAttachPerPlaced}`, `atkBenchFromDeckTop` regex | Plea 2 bench → opponent hand; Den of Iniquity choose 1 → deck; Eternal Flame 3 → bench; Stone Age any Fossil-evo → bench; Breeze Away 1 → hand; Massive Catch top-12 → bench | corpus rows | tests green |
| 3 (I185) | rules/attack-steps.mjs, effects/attack-steps.mjs, rules/card-classify.mjs (ultra beast use only) | `atkDiscardOppPokemon`, `atkKnockOut{condition}`, `atkKnockOutChoose{notGx}`, 6 prize steps | GG End → 2 discarded, 0 prizes; Big Throw active → discard; Silver Knight UB → KO; Lunar Fall non-GX Basic → KO; Stinger → decks reshuffled into 3 prizes; Discovery deck<prizes → nothing | corpus rows | tests green |
| 4 (I184) | rules/attack-steps.mjs, effects/attack-steps.mjs, reduce.mjs (validateLegality + tail) | `atkOppPlayLock`, `atkOppAttackLock`, `atkTakeAnotherTurn`, `atkShuffleOppAllBench`, `atkBothDrawUntil`; player fields `playLocks`, `attackLockUntilTurn`, flags.extraTurn | lock blocks Item play next turn then expires; Iron Rule blocks p2 attack on N+1 only; Timeless → p2 never starts, p1 turn N+1 (no checkup); Horror House lock + draw 7 | corpus rows | tests green |
| 5 (I188) | rules/attack-steps.mjs, effects/attack-steps.mjs | `atkMoveSelfEnergyToHand` | Backfire moves 2 {R} to hand; Trickster copies a real defender attack; Disk Reload draws to 5 from 3 | corpus rows | tests green |
| 6 (I189) | rules/attack-steps.mjs, rules/abilities.mjs, effects/ability.mjs, effects/attack-steps.mjs | `atkMillAttachIfEnergy`; `atkRecover{all,what}`; attachAbility-without-fromDiscard falls back to templates | Crushing Charge mill basic Energy → attach, non-Energy → only discard; Power Recharge → all Electropower to hand; Disk Reload regression | corpus rows | tests green |
| 7 | harness only | — | run full `pnpm test`, all four audits, fix baseline diffs in their own commit | — | all gates green; acceptance table answered |

## Deviations (Builder appends here during build)

- Kaleidostorm anomaly root cause: `damage-parser.mjs`'s legacy `/number of energy/` fallback
  multiplied the printed 150 by the attached count because the move clause says "any number of
  Energy". Fixed by requiring a sentence that pairs damage with the energy phrase; the oracle
  row is now dealt 150. The move itself was always executing (the oracle's 12-choice cap and
  the auto-picker bouncing Energy back made the net snapshot look unchanged — harness artifact,
  not engine).
- Clear Vision-GX (`gxLock`) and Pale Moon-GX (`deferredKnockOut`) were already parsed,
  enforced and unit-covered; I184/I185's audit rows were fixture-limited, so they got
  regression tests instead of engine changes.
- Trickster-GX / Disk Reload likewise already worked; their GX rows are empty because the audit
  fixture's defender has no attacks and its hand is exactly 5. Verified on real boards.
- Extra-energy prefix: written as a generic sentence gate (one or two typed requirements),
  consumed by `atkKnockOut`, `atkKnockOutChoose`-adjacent paths, `atkTakePrize`,
  `atkAddMarker`, `atkBothDrawUntil`, `atkShuffleOppAllBench`, `atkBenchFromDiscard`.
- `energyMatches` gained an element-word fallback: the shared display map deliberately omits
  `{N}`/`{Y}`, so any typed step naming Dragon/Fairy matched nothing before (latent bug found
  while wiring Horror House). The boost is now shared by every typed step.
- Hostile review (fresh-context agent, review.md) fixed before landing:
  the ability fallback was narrowed from "any source-less attach" to an `abilities.mjs` branch
  for Crushing Charge's exact mill-then-attach wording (Teal Dance/Energy Rain/etc. regressed
  under the broad condition); `atkDiscardPrize` no longer removes the Prize before asking for
  the attach target (card loss); `energyTypeMatches` reads TCGdex `types`/`Normal` shape;
  "discard up to N cards from hand" is suppressed unless the attack's damage counts it (Unown ?
  partial effect); Breeze Away can choose zero; play locks prune expired entries; face-up
  Prizes clear `revealed` when they leave the Prize zone. Added Burst-GX, Dark Moon, empty-hand
  Breakdown, extra-turn-game-end, zero-choice and TCGdex-shape tests. `settleWipedSides` may end
  the game while an attack step still holds a pending choice — left as-is: a wiped side ends the
  game by rule, and no step refills a board (noted, not a defect).
- Oracle numbers after review fixes (8 seeds): full `pnpm audit:oracle` PASSED; GX scope
  executed 1175/1723, GX attacks 485/604 (was 390/604 at design start), 0 engine errors.
  All four audits (`oracle`, `abilities`, `attack`, `trainer`) PASS; full `pnpm test`
  4391 pass / 0 fail / 3 skipped.

