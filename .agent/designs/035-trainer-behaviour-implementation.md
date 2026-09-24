# 035: Trainer behaviour implementation (I131–I135)

Status: draft
Date: 2026-09-24 · Session: S279

## Problem
The S279 trainer sweep (`.agent/scratch/trainer-series-audit/report.md`) found the Trainer pipeline
mis-plays cards rather than merely missing them: KO prize counts are wrong for 11 tools (0 or 101
prizes), 10 fossil Items can never bench their own card, conditional tool modifiers over-apply
(HP/retreat/damage/prevention/prize), 28 parsed step kinds have no server executor, and 63 passive
Items/Supporters do nothing. Players see the printed text and get a wrong board, wrong prizes, or a
silent no-op. Goal: make every confirmed finding behave as printed, on the authoritative server.

Out of scope: legacy client behaviour changes (flag parity only), UI/inspector changes, ability
findings (design 034), cards absent from the corpus, and new engine architecture.

## Constraints
- Server-authoritative engine (`shared/engine`) is the target; `client/src/setup/rules/*` is a
  separate surface — mirror the fix only where the shared parser is the root cause.
- Parsers stay additive and pure; no DOM, no `Math.random` (activeRng only).
- Tool modifiers stay pure functions; condition gating must be data, not per-consumer regex copies.
- New executable steps register in `EXECUTOR_STEP_TYPES` (`effects/executor.mjs:31`) or
  `EXTRA_STEP_HANDLERS` (`effects/trainer-steps.mjs:1605`); resume tokens follow the existing
  `ask`/memo contract.
- `pnpm audit:oracle` stays green (D108); `pnpm test` green each slice; in-memory state only —
  absent fields mean "no effect" (no migration).
- One branch (`feature/trainer-behaviour`), slices ≤1 session, NEXTSTEPS ledger (CLAUDE.md).

## Current state
- `rules/ability-executors.mjs` — `parsePrizeModify` takes `t.match(/(\d+)/)`, the first number in
  the whole text (I131 root cause). `parseHpBonus` requires `+`/`more`; `parseRetreatCostModifier`
  falls through to `/(?:by|is)\s+(\d+)/` and reads conditions ("Retreat Cost … is 3 or more") as
  modifiers (I133/A4).
- `rules/tool-combat.mjs:35` local `textOf`; `preventionForCard` :134, `reductionForCard` :160,
  `bonusForTool` :215 (Hop's check reads `defender.name`), `combinedToolHpBonus`, 
  `combinedToolRetreatCost`, `evaluateToolKoPrevention`, `toolPrizeCountAdjust`,
  `parseToolOnDamageEffect` (recognizes only draw / counters / search-on-KO / move counters).
  `reduce.mjs` consumes `attachedToolOnDamageEffects` at the damage site and `toolPrizeCountAdjust`
  in `handleKnockout`.
- `rules/stadium-effects.mjs` `effectiveHp` adds tool HP itself via `parseHpBonus` + `applyHpBonus`
  (a second consumer of the HP parser, not `combinedToolHpBonus`).
- `rules/trainer-effects.mjs` look-at-top/bottom branches hardcode
  `pick = 'Darkness Pokémon (bench)'` for every "onto your Bench" card (I132); `parsePlayCondition`
  knows only `opponentPrizes<=N` / `morePrizesThanOpponent` / `notFirstTurn`.
- `effects/trainer-steps.mjs` `lookAtDeckEnd` / `lookPickMatches` (Basic Darkness branch) /
  `variableDraw`; `EXTRA_STEP_HANDLERS` table. `effects/executor.mjs` `drawUntil` case ignores
  `bonusTarget` and defaults `target` to 5; `default:` emits `effectStepSkipped`.
- `effects/trainer.mjs` `executeTrainer` :97 (tool attach, Stadium early-return, `parseTurnDamageBonus`
  :261); `effects/stadium.mjs` `executeStadium` :70.
- `reduce.mjs` playTrainer legality :2607 (`trainerPlayBlockReason`), apply :5404, KO prize path
  (`toolPrizeCountAdjust`), attack damage site (reactive tools).
- `rules/turn-damage-bonus.mjs` `TURN_BONUS_RE` only matches "attacks **used by** your …".
- `rules/attack-markers.mjs` (D109) is the timed-marker contract reusable for `attachAttackTool` /
  `clearAttackEffects`.
- `scripts/audit-all-trainers.mjs` `EXECUTED_STEP_TYPES` mirrors the legacy client, so it reports 0
  gaps while the server lacks 28 step kinds. `out/pkmn-trainer-cards.json` is 268 rows stale.
- Audit artifacts to reuse as fixtures: `rows.json` (per-card oracle rows), `behave-out.json`,
  `spot2/spot4/spot5.mjs` (exact repros), `triage.txt`, `batches.md`.

## Options
1. Prize-clause parsing (I131).
   A: tighten `parsePrizeModify` to the clause (`takes? N (more|fewer) prize`) — small, no new API.
   B: structured clause descriptor `{delta, source}` — more future-proof but no second consumer.
   Pick A; the consumer (`toolPrizeCountAdjust`) already takes a delta.
2. Look-at pick vocabulary (I132).
   A: parser emits `'<Name> (bench)'` / `'<Type> Pokémon (bench)'` / `'Pokémon (bench)'`;
   `lookPickMatches` grows name + generic-basic branches; legacy keeps working (unknown pick → all
   candidates).
   B: hardcode per fossil name in the handler — rejects the parser's additive rule.
   Pick A.
3. Tool condition gating (I133).
   A: new pure `rules/tool-conditions.mjs` — `parseToolCondition(card)` returns a descriptor and
   `toolConditionMet(cond, ctx)` evaluates it; every modifier consumer (tool-combat + `effectiveHp`)
   consults it.
   B: inline condition checks per consumer — repeats the I128 class in six places.
   Pick A.
4. Where HP/retreat modifiers are read.
   A: keep `parseHpBonus`/`parseRetreatCostModifier` as the only readers and gate them.
   B: duplicate reads inside `effectiveHp`.
   Pick A, but route `effectiveHp` through the same gated helper (`toolHpBonusFor`) so there is one
   path.
5. Missing step kinds (I134).
   A: extend `EXTRA_STEP_HANDLERS` in `effects/trainer-steps.mjs`, one handler per step, reusing
   `ask`/memo/`pickById`/`removeFromZones`/`discardCardToPlayerZone`.
   B: a new `effects/trainer-steps-missing.mjs` module — splits the contract across files for no
   benefit.
   Pick A; add small shared helpers (`revealFromDeck`, `benchBasicFromDiscard`) in the same file.
6. `drawUntil` semantics (I135).
   A: normalize the target in the parser to a descriptor (`{kind:'fixed', n}` /
   `{kind:'opponentHandPlus', n:1}` / `{kind:'opponentHand'}`) plus `bonusWhen`, and resolve in the
   executor.
   B: a new step type per wording — proliferation.
   Pick A.
7. Triggered Stadiums (I135).
   A: new pure `rules/stadium-triggers.mjs` + explicit hooks at the existing reduce sites
   (attachCard, evolve, bench placement, switch/retreat, resolveCheckup, computeAttackDamage for
   weakness/resistance), mirroring the special-energy trigger wiring (I69).
   B: only extend `classifyStadiumEffect` (announcement) — no behavior; keeps the 28 dead.
   Pick A, split per trigger family so each slice is small.
8. Regression proof.
   A: promote the scratch probe/behave pair to `scripts/audit-trainer-behaviour.mjs` with a
   committed per-class baseline (ratchet, D108-style) + `pnpm audit:trainers`.
   B: unit tests only — the corpus gaps drift back silently.
   Pick A in the final slice; unit tests per slice meanwhile.

## Design
Schema / naming contract (stable surface all slices reuse):
- `parsePrizeModify(card)` → `{delta}` read only from the "takes N more/fewer Prize card" clause.
- `parseToolCondition(card)` → `{holderName?, holderType?, holderStage?, holderSubtypes?[],
  holderNoAbility?, holderRuleBox?, holderRetreatAtLeast?, holderFullHp?, attackerType?,
  attackerSubtypes?[], attackerAbility?, attackerHpAtMost?, defenderType?, defenderSubtypes?[],
  trailingPrizes?, exactlyPrizes?, noEnergyAttached?}` (all optional).
  `toolConditionMet(cond, ctx)` — `ctx = {holder, attacker, defender, flags, zoneCards}`; a null
  descriptor is always true. One implementation; `tool-combat.mjs` and `stadium-effects.effectiveHp`
  import it.
- `toolHpBonusFor(tool, ctx)` / `toolRetreatDeltaFor(tool, ctx)` — gated wrappers used by
  `combinedToolHpBonus`, `combinedToolRetreatCost` and `effectiveHp`.
- Look-at pick vocabulary: `'any' | 'discard' | 'Supporter' | 'Basic Energy (attach)' |
  'Pokémon or Evolution' | '<Name> (bench)' | '<Type> Pokémon (bench)' | 'Pokémon (bench)'`;
  `lookPickMatches` resolves the `(bench)` forms (name equality / type+Basic / any Basic).
- `drawUntil` step: `{type:'drawUntil', target:{kind:'fixed'|'opponentHand'|'opponentHandPlus', n?},
  bonusTarget?:{...}, bonusWhen?:'firstTurn'|'noEnergyAttached'|'koedLastTurn'}`; the executor
  resolves `target`, applies `bonusTarget` when `bonusWhen` holds, and keeps the old numeric
  `target` as a back-compat read.
- New tool triggers: `attachedToolOnKoEffects(defender, zoneCards, ctx)` alongside the existing
  `attachedToolOnDamageEffects`; `parseToolOnDamageEffect` grows `moveEnergyOnKo`, `discardPrizes`,
  `statusAttacker`, `millOpponent`, `returnSelfToHand`, `prizeDeltaOnKo`, `fullHpSurvive`.
- New Stadium triggers: `rules/stadium-triggers.mjs` exports
  `stadiumOnAttachTriggers(card, ctx)`, `stadiumOnEvolveTriggers`, `stadiumOnBenchTriggers`,
  `stadiumOnSwitchTriggers`, `stadiumCheckupCoinModifiers`, `stadiumWeaknessOverrides`,
  `stadiumResistanceOverrides`; hooks call them at the existing reduce sites and apply the returned
  counter/heal/override effects with `events`.
- Play conditions: `parsePlayCondition` grows `lostZone>=N`, `stadiumInPlay`, `opponentActiveBasic`,
  `koedLastTurn`, `lastCardInHand`, `handCount<N`, `opponentPrizes==N`;
  `trainerPlayBlockReason` evaluates them from new optional params
  (`lostZoneCount`, `stadiumInPlay`, `opponentActiveIsBasic`, `koedLastOppTurn`, `isLastCardInHand`)
  that `reduce.mjs`'s playTrainer case already has the state for.

## Edge cases & failure modes — the completeness contract; Builder ticks every row
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | Empty/missing card text or no numbers | parsers return neutral (0/null); no throw | [x] S1/S3 (`parsePrizeModify`/`parseHpBonus`/`parseToolCondition` neutral) |
| 2 | Malformed/unknown wording | no delta, no condition, no effect | [x] S1/S3 (`toolConditionMet` true only for parsed descriptors; no-match picks stay unplaced S2) |
| 3 | Prize delta would drive count below 0 or above the prize zone | floor at 0; award only cards that exist | [x] S1 tests + `collectPrizeEntitlement` min(owed, prizes) |
| 4 | Tool condition descriptor is null | modifier applies (unconditional) | [x] S3 `toolConditionMet(null, …)` test |
| 5 | Tool blocked by a Stadium ("Tools have no effect") | gating short-circuits before conditions | [x] S3 `effectiveHp` + `combinedTool*` blockTools tests |
| 6 | Fossil target absent from the looked-at window | no placement, rest shuffled back, card discarded | [x] S2 targetless-window test (shuffle-back); "card discarded" n/a for look-at (item already in play) |
| 7 | Bench full when a look-at/revive step resolves | `bench_full` block before play, or skip with event | [x] S2 full-Bench look-at skip; revive steps S6 |
| 8 | Step choice resumes after a disconnect (stale selection) | re-resolve against live state; skip if gone | [x] S6/S7 (every handler re-resolves ids from live state and skips `target_not_found`; memo phases carry progress) |
| 9 | New step with no legal target (empty discard, no Energy) | `effectStepSkipped` event, no partial effect | [x] S5–S7 (each handler returns `skip(...)` with a reason; tests assert the events) |
| 10 | Repeated/new step kinds run twice in a turn | idempotent where printed ("you may" once), no double counters | [x] S5–S7 (handlers re-read live state; no cached flags; one selection per step) |
| 11 | `drawUntil` with a full hand / empty deck | draws 0; no negative | [x] S8 (executor clamps `needed = max(0, target - hand)` and `min(needed, deck)`; tests cover both) |
| 12 | Stadium trigger fires while its own Stadium was replaced | trigger reads the Stadium in play at event time | [x] S10a (every hook reads `draft.stadium` when the event fires) |
| 13 | Condition text changes value mid-effect (counters moved) | conditions are re-read at consumer time, not cached | [x] S3/S4 (descriptors re-parsed and flags read per consumer call) |
| 14 | Prize/HP modifier with negative values | applyHpBonus floors at 1 HP; prize floor 0 | [x] S1/S3 tests |

## Test plan
Unit: `__tests__/trainer-tool-modifiers.test.mjs` (prize clauses, conditions matrix per family,
HP/retreat parse), `__tests__/trainer-steps-missing.test.mjs` (one case per new step kind using real
card texts from `rows.json`), `__tests__/trainer-play-conditions.test.mjs`,
`__tests__/trainer-stadium-triggers.test.mjs`, `__tests__/turn-damage-bonus.test.mjs` extension.
Integration: reduce-level `playTrainer`/`stadium-effect` runs for the audit's repro cards
(spot2/spot4/spot5 expectations), KO prize tests through `handleKnockout`.
Regression: `pnpm test` each slice; `pnpm audit:oracle` after any damage/HP/prize change; final slice
adds `scripts/audit-trainer-behaviour.mjs` (probe + behave promoted) with a committed baseline and
`pnpm audit:trainers`.

## Migration / rollout
n/a: in-memory state; no schema/flag. `out/pkmn-trainer-cards.json` is refreshed by re-running
`scripts/scrape-pkmncards-trainers.mjs`. Revert = revert the branch. Oracle/trainer baselines update
only for legitimate improvements (D108 policy).

## Work plan — slices ≤1 session, each leaving the repo green
| Slice | Delivers | Green when |
|---|---|---|
| 1 | ✅ I131: prize-clause parser + the 16-card table (11 wrong → right, 5 stay right) | new unit tests; `pnpm test` |
| 2 | ✅ I132: look-at pick vocabulary + `lookPickMatches`; Grimsley unchanged, fossils bench own card | spot4-style tests; `pnpm test` |
| 3 | ✅ I133a: `tool-conditions.mjs` + gated HP/retreat (`combinedToolHpBonus`, `combinedToolRetreatCost`, `effectiveHp`); `-100 HP` parsed; Heavy Boots condition not a modifier | spot5 expectations as tests; oracle green |
| 4 | ✅ I133b: gated bonus/prevention/prize + Hop's attacker check + Full Face Guard holder check + trailing/exactly-prize conditions | spot2/spot5 tests; oracle green |
| 5 | ✅ I134a: auto/simple steps — clearStatus, healEachActive, discardStadium, shuffleDiscardIntoDeck, energyToHand, eachPlayerDraw, healPerHeads, rearrangeTop, shufflePokemonIntoDeck, clearAttackEffects, revealPrizes | per-step tests; audit step list shrinks |
| 6 | ✅ I134b: choice-driven steps — reviveFromDiscard, moveDamageCounters, prizeToHand, lookAtFaceDownPrize, opponentHandToBenchBasic, opponentActiveEnergyToDeck, discardOwnBenchPokemon, lostZoneCost, opponentChoosesFromTop, lookAtOpponentHand, opponentHandShuffleDeck, discardAnyThenDraw, shuffleHandCardsThenDraw, revealUntilCard, revealTopEnergy, toolOrStadiumToLostZone | per-step tests incl. resume; `pnpm test` |
| 7 | ✅ I134c: stateful — attachAttackTool (attack grant via `attackViewFor`), revealPrizes view flag, Lost Zone routing | per-step tests; oracle green |
| 8 | ✅ I135a: `TURN_BONUS_RE` "…'s attacks do" (+ styles, per-Prize) + `drawUntil` target/bonus descriptors | parser + executor tests; `pnpm test` |
| 9 | ✅ I135b: tool on-damage/on-KO sub-effects + `attachedToolOnKoEffects` hook (incl. Beast Bringer's attacker-side clause, Focus Band F6) | KO/damage tests; oracle green |
| 10 | ✅ I135c: `stadium-triggers.mjs` + hooks — 10a (counters/heal on attach/evolve/bench/retreat + W/R overrides, 21 stadiums); 10b (S285: Minefield coin counters, Wela/Slumbering checkup coins, Mirage retreat coin, Chaos Gym Trainer coin, Vermilion attack coin, switch hook shared via `effects/stadium-trigger-apply.mjs` at executor/special-energy/Erika sites) | 18 trigger tests; suite 3432/3433; oracle PASSED |
| 11 | I135d: play conditions (`lostZone>=N`, stadium, basic Active, KO'd last turn, last card, hand gate, exactly-N prizes) | gate tests per condition; `pnpm test` |
| 12 | Tooling: refresh corpus, `audit-all-trainers` server-coverage column, optional `audit-trainer-behaviour.mjs` gate, close I131–I135 | gate runs; ISSUES closed; reports annotated |

Slices 1–4 are the recommended first cluster (wrong outcomes, no schema risk). Slices 5–7 are the
largest and can be split further per step group if a session runs long.

## Deviations (Builder appends here during build)

- Slice 1 (S280): `parsePrizeModify` now matches only `\btakes?\s+(\d+)\s+(more|fewer|less)\s+prize`.
  Deviation from the audit table: Solid Rage was listed as "parses correctly", but its +1 was the
  old first-number read (`to 1 of your Evolved Pokémon`); the printed card has no prize clause, so
  it is now 0 (correct per printed text). All other 15 rows behave as the table says.
  New tests: `shared/engine/rules/__tests__/trainer-tool-modifiers.test.mjs` (10 cases, incl. KO
  integration through `handleKnockout`). Full suite: 3328/3329 pass; the 1 failure is the
  pre-existing `card-inspector-model` retreat-greys test (STATE watch-out).
- Slice 2 (S280): `benchLookPick` in `rules/trainer-effects.mjs` emits `'<Name> (bench)'` (name
  title-cased for prompts, matched case-insensitively), `'<Type> Pokémon (bench)'` or
  `'Pokémon (bench)'`; `benchPickMatches` in `effects/trainer-steps.mjs` resolves them
  (name equality / type+Basic / any Basic). Grimsley's Move stays `Darkness Pokémon (bench)`
  (Basic + type) per the design. The bottom-look branch now checks `onto your bench` before the
  generic `pokémon` pick — no corpus card changes (only fossils/Grimsley have the wording), but it
  keeps a future "put a Pokémon you find there onto your Bench" from being parsed as hand. The
  generic and typed forms have no corpus cards; covered by parser tests with the design's wording.
  New tests: 4 in `rules/__tests__/trainer-effects.test.mjs`, 5 in `__tests__/trainer-steps.test.mjs`
  (incl. targetless window and full Bench). Full suite: 3340/3341 pass, same single pre-existing
  failure.
- Slice 3 (S280): new `rules/tool-conditions.mjs` — `parseToolCondition` / `toolConditionMet` /
  `holderView` / `toolHpBonusFor` / `toolRetreatDeltaFor`. Descriptor deviations from the design:
  `holderNames: string[]` (any-of; Cynthia's, Zamazenta V, Leafeon/Glaceon), `holderRetreatExactly`
  (Buff Padding), `holderExcludeSubtypes` (Cape of Toughness), `holderType` (word/symbol type
  phrases). `effectiveHp` now routes tool HP through `toolHpBonusFor`; `combinedToolHpBonus` and
  `combinedToolRetreatCost` derive the in-play holder with `topPokemonCard` so an evolved holder
  gates on the top card's stage/type/name. `parseHpBonus` parses `gets -N HP`; `applyHpBonus`
  still floors at 1. `parseRetreatCostModifier` no longer reads "is N or more" as a modifier (A4)
  and no longer misreads a trailing digit (Rescue Board's "30 or less"); Rescue Board now returns
  `{delta:-1}` normally and the existing remaining-HP clause zeroes it at ≤30 HP — a fix beyond
  the audit's A4 (the audit had not flagged Rescue Board).
- Slice 4 (S280): `bonusForTool`, `preventionForCard`, `reductionForCard` and
  `toolPrizeCountAdjust` all gate on `parseToolCondition` + `toolConditionMet`. Descriptor grows
  `holderPoisoned`, `attackerTypes: string[]` (any-of, replaces the single `attackerType` — Thick
  Scale lists four), `attackerAbility` ("that have Abilities"), `attackerSubtypes` (union across
  "opponent's {L} Pokémon-GX and {L} Pokémon-EX"), `defenderSubtypes` (GX/EX/VSTAR/VMAX any-of).
  Hop's Choice Band now checks the holder's name (A3) with apostrophe normalisation; Hunting Gloves
  gates on the defender type and Active spot; Maximum Belt on Active ex; Panic Mask on the
  attacker's remaining HP; Full Face Guard on the holder having no Abilities; Defiance Band/Vest on
  trailing prizes; prize tools on their holder conditions. `attack-engine.mjs` accepts
  `defenderTrailingPrizes` / `attackerPrizesRemaining` / `defenderPrizesRemaining`; `reduce.mjs`
  passes them plus the victim's holder view. Not covered here (unchanged, out of the audit's A5):
  Counter Gain / Karate Belt's attack-cost discount is still ungated on trailing prizes; Beast
  Bringer's clause is attacker-side and waits for the slice 9 on-KO hook. New tests: 10 slice-4
  cases in `trainer-tool-modifiers.test.mjs` (29 in the file). Full suite: 3359/3360 pass, same
  pre-existing failure; `pnpm audit:oracle` PASSED (0 failures, 11 pre-existing warnings).
- Slice 5 (S283): the 11 I134a step kinds registered in `EXTRA_STEP_HANDLERS`
  (`effects/trainer-steps.mjs`), no executor changes needed (`isExecutableStepType` reads the
  table). Deviations/additions beyond the handoff's per-step notes:
  - `shuffleDiscardIntoDeck` grew a parser `what: 'Pokémon'|'all'` field: Karen shuffles only
    Pokémon, Lysandre's Trump Card every card; the old parse could not tell them apart (the
    handler would have moved everything for both).
  - `appendTrailingDraw` (`rules/trainer-effects.mjs`) now reads "draw a card/an/one" as count 1 —
    Paint Roller's printed trailing draw was silently dropped (only numeric draws matched).
  - `healEachActive` / `healPerHeads` honour Dyna Tree Hill via `stadiumBlocksHealing`, matching
    the executor's `heal`/`healAmount` cases, and skip with `no_damaged_pokemon` / `no_healing`
    when nothing can be healed (edge case 9).
  - `healPerHeads` memoizes the coin faces in `memo.heads` so a resumed target choice never
    re-flips; it flips with `activeRng` and emits one `coinFlipped` per coin.
  - `clearAttackEffects` deletes `card.attackMarkers` on in-play roots of the scope (no event, like
    every other marker-clear site).
  - `revealPrizes` sets `player.flags.prizesFaceUp` and emits `cardsRevealed` with the prize cards;
    the view redaction is slice 7.
  New tests: `shared/engine/__tests__/trainer-steps-missing.test.mjs` (15 cases). Full suite:
  3374/3375 pass; the 1 failure is the pre-existing `card-inspector-model` retreat-greys test.
- Slice 6 (S283): the 16 I134b choice-driven step kinds registered. Deviations/additions:
  - `lookAtFaceDownPrize` parser grew `take` (`/put it into your hand/`): Daisy's Help only looks
    at the Prizes; the Ball cards take a matching card. Without it the handler would have stolen a
    Basic for Daisy's Help. `replace` still moves the source item from the board into the Prizes.
  - `revealTopEnergy` parser grew `restTo: 'hand'|'top'` (Ether returns the non-matching card to
    the top; Gutsy Pickaxe puts it into hand) and the handler matches typed specs (`{f}`) through
    `matchesSearch` instead of accepting any Energy.
  - `reviveFromDiscard` chooses from the named side's discard with the initiator choosing (printed
    text), skipping `bench_full` / `empty_discard`.
  - `moveDamageCounters` auto-resolves a single donor/receiver, memo `target` phase resumes the
    receiver pick; `damageCountersPlaced` is stamped from the donor side.
  - `opponentHandShuffleDeck` chooser is the initiator (Morty et al.); `optionalOpponentDraw`
    draws 1 only when cards actually moved.
  - `toolOrStadiumToLostZone` sends the Stadium to its owner's Lost Zone (not discard).
  - `prizeToHand`'s replace phase offers the hand after the taken Prizes joined it (Peonia's
    printed loop).
  - Known gaps left (recorded for slice 12/ISSUES): Gladion's "shuffle this Gladion into your
    remaining Prize cards" (the parser's `replace` is false for its wording), Rival's "shuffle your
    deck afterward", Peeking Red Card's draw-that-many, Team Rocket's Evil Deeds' "up to 2 cards"
    (the handler draws 1), and Daisy's Help's dropped "Draw 2 cards" (pre-existing parser
    early-return on the look branch).
  New tests: 16 slice-6 cases (31 in `trainer-steps-missing.test.mjs`). Full suite: 3390/3391 pass,
  same pre-existing failure.
- Slice 7 (S283): stateful steps done.
  - New pure `rules/tool-attacks.mjs` — `parseGrantedAttacks(card)`: uses `card.attacks[]` when the
    card data carries them, else parses the printed "→" line(s) out of the text (TM/Cube Items do
    not send `attacks[]`; verified against all 17 corpus printings). Damage stays the printed
    string ("10×", "30+") so `parseAttackDamage` sees the same shape the client sends; cost symbols
    map with {D} → `Darkness` (the engine's spelling). `reduce.mjs`'s `toolGrantedAttacksFor` reads
    the tool off the holder's zone stack and `attackViewFor` merges it beside the Stadium extras, so
    every attack-index resolution path sees granted attacks.
  - `attachAttackTool` attaches the Item from the board to the chosen own Pokémon and sets
    `discardAtEndOfTurn`; `discardEndOfTurnTools` in `resolveCheckup` sweeps the ending player's
    flagged attached Tools after Checkup.
  - `view.mjs` grew `prizeCards(player)`: all Prize faces are sanitized for every viewer once
    `player.flags.prizesFaceUp` is set (individually `revealed` cards keep working).
  - Lost Zone routing verified: the handlers push to `player.zones.lostZone` (array created when
    absent) and the view already exposes it publicly; the test asserts the opponent sees the cards.
  - Known gap left: the parser's `attachAttackTool` target is the generic '1 of your Pokémon', so
    the printed qualifiers (Evolved, {D}, Team Aqua/Magma in name, ex/owner exclusions) are not
    filtered yet. Client attack-list parity for granted attacks is out of scope (design: UI).
  New tests: `attachAttackTool` integration (attach → granted attack resolves for 10 damage → the
  turn-ending sweep discards the tool), the Prize-face view, and the Lost Zone view assertion
  (33 cases in `trainer-steps-missing.test.mjs`). Full suite: 3391/3393 — the pre-existing
  `card-inspector-model` failure plus a flaky `coin-flip-ceremony` timing test that passes in
  isolation. `pnpm audit:oracle` PASSED (0 failures, 11 warnings).
- Slice 8 (S283): I135a done.
  - `turn-damage-bonus.mjs` now has two patterns: `USED_BY_RE` (unchanged wording) and
    `POSSESSIVE_RE` for "your {L} Pokémon's attacks do N more damage", "each of your Active
    Pokémon's attacks does N more", and "to the Active Pokémon" (PlusPower, Iris). The possessive
    descriptor adds `attackerStyle` ('fusion strike'/'single strike'/'rapid strike', matched on
    subtype or name prefix) and `perPrizeTaken` (Iris, Karen's Conviction).
    `turnDamageBonusTotal` grew `defenderPrizesRemaining` (taken = 6 − remaining) and scales
    per-Prize amounts; `attack-engine.mjs` forwards the option and `reduce.mjs`'s clause damage
    site now passes it too.
  - `drawUntil` parser emits target descriptors `{kind:'fixed'|'opponentHand'|'opponentHandPlus',
    n}` plus `bonusTarget` (descriptor) and `bonusWhen` — the design's three kinds plus a fourth,
    `teamRocketInPlay`, for Team Rocket's Ariana ("all of your Pokémon in play are Team Rocket's").
    `appendTrailingDraw` emits the fixed descriptor as well. The executor resolves descriptors,
    keeps the numeric back-compat read and the `targetType` override, and evaluates the bonus
    (first turn = turn.number ≤ 2; KO window = `flags.koedLastOppTurn`). `describeStep` describes
    descriptors.
  - Known gap left: "Your turn ends." clauses (Professor Oak's Hint, Rotom Bike) are still
    dropped; Lucky Egg's on-KO drawUntil belongs to the slice 9 on-KO hook.
  New tests: parser (4 cases in `trainer-effects.test.mjs`, numeric-target assertions updated to
  descriptors) + executor (4 cases in `trainer-steps.test.mjs`) + turn-bonus (4 cases in
  `turn-damage-bonus.test.mjs`). Full suite: 3402/3403 pass, same pre-existing failure.
- Slice 9 (S283): I135b done.
  - `parseToolOnDamageEffect` grew `drawUntil`, `searchDeckOnKo` ("a card" / "up to N"),
    `moveEnergyOnKo` (`{count:'all'|n, from:'victim'|'attacker', to:'hand'|'holder'|'bench'|
    'opponentHand'|'opponentBench', basicOnly}`), `discardPrizes`, `statusAttacker`,
    `millOpponent` (`{deck, handRandom}`), `returnSelfToHand`, and `trigger: 'selfKo'|'activeKo'`
    (Exp. Share / Wishful Baton sit on a Benched Pokémon and trigger on the Active's KO).
  - New `attachedToolOnKoEffects(victimPlayer, victim, {blockTools, stadium, isActive})` scans the
    victim side's in-play Tools and returns the applicable on-KO effects.
  - `handleKnockout` gained `byAttack`/`activeRng` and applies the on-KO effects before the discard
    sweep (Energy moves, Rescue Scarf's return to hand); Billowing Smoke zeroes the Prize
    entitlement; the attacker-side clause (Beast Bringer) reads the attacker's Tools through
    `parseToolCondition` + `parsePrizeModify`. The damage-site consumer applies `statusAttacker`
    (Team Rocket's Hypnotizer), `drawUntil` (Lucky Egg) and the attacker-Energy moves (Handheld Fan,
    Rugged Helmet); the reactive Tool list is snapshotted before the KO so "even if Knocked Out"
    wordings still resolve.
  - Focus Band (F6): `parseKoPrevention` reads "HP become(s) N" and tags `coinFlip`;
    `evaluateToolKoPrevention` takes a `flipCoin` callback (called only for a coin candidate) and
    returns `coinFace`; the attack site flips through `activeRng` and emits `coinFlipped`.
  - Deviations/heuristics: `searchDeckOnKo` takes the top N (a search should be a player choice);
    `bench`/`opponentBench` Energy moves pick the first Benched Pokémon (no target choice at the KO
    site); Cursed Duster's random discard needs `activeRng` (available on the attack path, skipped
    elsewhere). Still open (recorded): Spell Tag's spread counters, Spirit Mask, Heavy Baton's "in
    any way you like", Sky Seal Stone's Star Order activation, the Berries' "discard this card".
  New tests: `shared/engine/__tests__/tool-on-ko.test.mjs` (12 cases). Full suite: 3414/3415 pass,
  same pre-existing failure; `pnpm audit:oracle` PASSED (0 failures, 11 warnings).
- Slice 10a (S283): new pure `rules/stadium-triggers.mjs` — `stadiumOnAttachTriggers`,
  `stadiumOnEvolveTriggers`, `stadiumOnBenchTriggers`, `stadiumOnSwitchTriggers`,
  `stadiumWeaknessOverrides`, `stadiumResistanceOverrides`. Hooks: Energy attach from hand in
  `attachCard`, evolution in the evolve case, `moveCard` hand→bench, `applyRetreatSwap` (Spikemuth),
  and `computeAttackDamage` consults the W/R overrides beside the existing Stadium helpers. Covers
  21 of the 28 trigger Stadiums (counters/heal: Calamitous Snowy Mountain, Frozen City, Old
  Cemetery, Dawn Stadium, Island Cave, Po Town, Galactic HQ, Wyndon Stadium, Battle Tower, Viridian
  City Gym, Gapejaw Bog, Miasma Valley, Team Magma's Secret Base, Team Magma Hideout, Spikemuth;
  overrides: Ancient Tomb, Cinnabar City Gym, Magnetic Storm, Ruins of Alph, Resistance Gym, Pewter
  City Gym). `damageCountersPlaced` from a Stadium trigger feeds the reducer's post-command KO sweep.
  Remaining for 10b: coin/condition overrides (Wela Volcano Park, Slumbering Forest, Mirage
  Stadium, Chaos Gym, Vermilion City Gym), Rocket's Minefield Gym's coin counters, Dust Island
  (needs the Trainer-switch hook; `viaTrainer` is already in the signature), and Spikemuth on
  switch effects (only the retreat path is hooked).
  New tests: `shared/engine/__tests__/stadium-triggers.test.mjs` (9 cases). Full suite: 3423/3424
  pass, same pre-existing failure; `pnpm audit:oracle` PASSED (0 failures, 11 warnings).
- Slice 10b (S285): coin/condition overrides + switch-effect hooks done.
  - `rules/stadium-triggers.mjs` grows `stadiumCheckupCoinModifiers` (as designed),
    `stadiumRetreatCoin`, `stadiumTrainerPlayCoin`, `stadiumAttackCoinModifier` (the last three are
    descriptor-returning functions the design contract did not name).
  - `stadiumOnSwitchTriggers` grew `duringOwnersTurn` (Spikemuth's "during their turn" does not fire
    when the opponent forces the switch) and Dust Island now requires the switched-out Active to
    actually be Poisoned (`hasCondition`) — the 10a test fixture was corrected to match the printed
    text. Descriptors carry `condition: 'Poisoned'`.
  - New `effects/stadium-trigger-apply.mjs` holds the moved `applyStadiumTriggerEffect` plus
    `applyStadiumSwitchTriggers`, so the executor's `switchOwn`/`switch`/`switchAbility` (own and
    opponent branch), `switchOpponent`/`switchOpponentOut`, special-energy `swapActiveBench`, and
    Erika's Invitation's `switchBenchToActive` all fire the same on-switch triggers. All call before
    `clearConditions` so Dust Island sees the Poisoned state; opponent-forced switches pass
    `duringOwnersTurn: false`.
  - Hooks: Minefield coin at the `moveCard` hand→bench site (tails only); Wela/Slumbering in
    `resolveCheckup`; Mirage at the top of the retreat apply case (tails sets
    `cannotRetreatUntilTurn`, emits `retreatBlocked`); Chaos Gym at the top of the playTrainer apply
    case (legality cannot flip RNG, so the coin lives in apply; tails discards the card and emits
    `trainerPlayBlocked`); Vermilion after W/R in the attack damage site (heads +10 only when the
    attack does damage; tails joins the recoil block).
  - Heuristic/gaps: Vermilion's printed "may flip" is auto-flipped (no optional-coin protocol);
    Chaos Gym's "the player's opponent may use that card instead" is not implemented.
    Opponent-forced switches pass `duringOwnersTurn: false`, so Spikemuth stays quiet but Dust
    Island still copies when a Trainer effect switches a Poisoned Active.
  - Minefield count: the corpus text omits it; errata + later prints say 2 damage counters (20).
  New tests: `stadium-triggers.test.mjs` (18 cases, +9). Full suite: 3432/3433 pass, same
  pre-existing failure; `pnpm audit:oracle` PASSED (0 failures, 11 warnings).

---
Self-approval checklist (only when the user is unreachable):
- [ ] Every constraint traceable into the Design section
- [ ] Every edge-case row has an expected behavior (or a written strike reason)
- [ ] Interfaces fully named and typed — no hand-waving
- [ ] Slices each ≤1 session and independently green
- [ ] No section reads "TBD"
