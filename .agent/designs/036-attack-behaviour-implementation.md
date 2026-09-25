# 036: Attack behaviour implementation (I136/I137)

Status: complete — slices 1–15 merged to main (PR #183); slice 16 (regression gate) built on `claude/rules-engine-issues-e79707` (S300), pending merge
Date: 2026-09-24 · Session: S280

## Problem
The S280 attack sweep (`.agent/scratch/attack-full-audit/report.md`) found the attack pipeline
mis-plays cards rather than merely missing them: non-coin "does nothing" gates are ignored (109
unique attacks deal full damage), dual-branch coin attacks apply **no** status on either face (73),
"take N more Prize card(s)" never fires on the KO it is printed on (32), "it is Knocked Out"
wordings are dead (12), and 972 + 541 further attacks no-op or run half their text (move counters,
heals, next-turn markers, counter spread, hand discard, Lost Zone). `pnpm audit:oracle` also
cannot pay `{D}` costs (604 entries), so its family rates are blind to a quarter of dark attacks.
Players see the printed text and get wrong damage, no status, wrong Prizes, or a silent no-op.

Out of scope: legacy client behaviour changes (flag parity only), UI/inspector work, ability
findings (design 034), trainer findings (design 035), cards absent from the corpus, new engine
architecture.

## Constraints
- Server-authoritative engine (`shared/engine`) is the target; `client/src/setup/rules/*` is a
  separate surface — mirror only where the shared parser is the root cause.
- Parsers stay additive and pure; no DOM, no `Math.random` (activeRng only).
- New attack steps register in `ATTACK_STEP_HANDLERS` (`effects/attack-steps.mjs:1588`) or as
  executor cases; resume tokens follow the existing `ask`/memo contract (design 030/032).
- Coin-gated sentences stay with design 032 (`resolveCoinGates`, `flipAttackCoins`); the new gate
  must not double-handle them. Hand-Energy-discard legality stays with D114.
- Timed state follows `card.attackMarkers` (D109); no new flat per-effect fields.
- `pnpm audit:oracle` stays green (D108); family-claim changes only after the oracle observes them.
- In-memory state only: absent fields behave as "no effect" (no migration).
- Reuse the condition-descriptor pattern of design 035 (`toolConditionMet`); do not grow a second
  regex-per-consumer layer (I128 class).
- One branch (`feature/attack-behaviour`), slices ≤1 session, NEXTSTEPS ledger (CLAUDE.md).

## Current state
- `rules/attack-steps.mjs` — `parseAttackSteps` (:748) emits `{before, after, handlesSearch}`;
  `resolveCoinGates` (:712); `TEMPLATES` (:91); conditional-KO templates only cover
  `choose whether …` / `if … is (asleep|…)` / `is affected by a special condition` /
  `is a basic pokémon` / `has any special energy` / `both active pokémon` in the
  **`atkKnockOut`** shapes (:404-436); no "does nothing" gate, no opponent-Energy move, no
  move-counter-to-opponent, no hand-discard effect, no Lost Zone from hand/self, no per-Bench
  search-attach.
- `reduce.mjs` — attack phase `resolveAttackEffectPhase` (:3540); `planAttackSteps` (:3267);
  `runAttackSteps` (:3304); `finishAttackTail` (:4329); damage at :3763 (`parseAttackDamage`) and
  :3817 (`computeAttackDamage`); energy-discard helper :4199; next-turn locks :4252; status apply
  :4073. `resolveAttackStatusConditions` (:200) returns `[]` when **both** `if heads` and
  `if tails` status clauses exist (:213-227) — the A2 root cause. KO/prizes: `handleKnockout`
  (:745), `settlePrizeEntitlements` (:1298), `atkTakePrize` handler grants entitlement only for
  "take N Prize cards" (immediate), never for "if Knocked Out by this attack".
- `rules/attack-damage-context.mjs:107` `buildServerAttackContext` — has energy/prize/hand/bench/
  damaged/status counts and `retreatCostColorless`; lacks `stadiumInPlay`, rule-box flags,
  `movedToActiveThisTurn`, `evolvedThisTurn`, `defenderRemainingHp`, `leastHpTargets`.
- `rules/attack-markers.mjs:173` `MARKER_BODIES` — kinds `noWeakness`, `incomingReduce`,
  `incomingPrevent`, `outgoingReduce`, `nextTurnBonus`, `freeRetreat`, `deferredKnockOut`,
  `retaliate`, `attackFlipOrFail`, `surviveKnockOutCoin`; read by `computeAttackDamage`
  (`markerSum`, :53-93) and `computeEffectiveRetreatCost`. No incomingBonus, weakness override,
  attack-cost increase, retreat delta, evolve/attach lock, next-turn base damage.
- `effects/attack-steps.mjs` — `ATTACK_STEP_HANDLERS` (:1588); `atkKnockOut`/`atkKnockOutChoose`
  with `knockOutConditionMet` (condition/exactCounters/maxRemainingHp/basicOnly, :1160-1240);
  `atkAddMarker` (:1402); `atkDiscardHandEnergy` (:502) + `handEnergyForDiscard`; Lost Zone
  handlers :914-990; `atkCountersEach` (filter only "each").
- `rules/damage-parser.mjs` — `discardEnergyScaling` (~:1180) matches one typed group
  ("discard up to N / N / any amount of [basic] {X} Energy from …"); the "all basic {R} Energy
  **or** all basic {L} Energy" form falls through, so Dragon Burst neither discards nor scales
  from discarded cards (it scales by total attached).
- `rules/card-classify.mjs` — `isRuleBoxPokemon`, ex/GX/V/VMAX/VSTAR/Tera/Mega/Radiant
  predicates; `rules/evolution.mjs` `normalizeStage`; `effects/trainer-steps.mjs`
  `topPokemonCard`, `benchRootsOf`, `rootsOf`, `pickById`, `removeFromZones`.
- `scripts/lib/split-card-text.mjs:10` `TYPE_SYMBOLS.D = 'Dark'`, while
  `serverEnergyDescriptor` provides `Darkness` → `canPayAttackCost(['Dark']) === false`
  (I137). `scripts/lib/oracle-harness.mjs` `oracleCorpus` passes splitter costs straight to the
  engine.
- Audit artifacts to reuse as fixtures: `rows.json`, `behave-out.txt`, `batches.md`,
  `triage.txt`, `behave.mjs` (exact repros + expected values).

## Options
1. Where the "does nothing" gate runs (I136/A1).
   A: evaluate a pure `parseAttackCondition(text)` + `attackConditionMet(cond, ctx)` at the top of
   `resolveAttackEffectPhase`; unmet → `attackConditionFailed` event +
   `endTurnAfterFailedAttack` (attack used, 0 damage, no steps, GX/VSTAR spent).
   B: emit an `atkRequire` step into `before` and abort the plan when it skips — reuses the step
   machinery but adds an abort path through the resume token and risks partial `before` effects.
   Pick A: the printed clause gates the whole attack (damage + effects), so gating outside the
   step list is both simpler and more correct.
2. Cost-conditioned "if you can't discard N" clauses.
   A: treat as a state condition and add hand counts to the evaluator.
   B: leave them to D114's legality gate (attack refused when the hand cannot pay).
   Pick B for hand-Energy-discard costs (D114 already chose "illegal", changing it is a rules
   decision); other "can't shuffle/choose X" clauses (Vespiquen, Eternatus) are state conditions
   and go through A.
3. Coin-branch status (I136/A2).
   A: new pure `rules/attack-status.mjs` — `parseAttackStatusBranches(text,{selfName})` returns
   `[{when:'always'|'heads'|'tails'|{headsAtLeast}|{headsExactly}|{allHeads}, statuses[]}]`;
   reduce replaces `resolveAttackStatusConditions` with it and evaluates against
   `{coin, headsCount, flips}`.
   B: patch the existing guard to stop suppressing the heads branch when a tails branch exists —
   applies both branches; wrong.
   Pick A.
4. Extra Prize on KO (I136/A3).
   A: pure `parsePrizeOnKo(text)` → `{count, filter}`; `finishAttackTail` grants
   `prizeEntitlementGranted` when a `pokemonKnockedOut` event from this attack matches the filter
   (Basic / GX-EX / Mega). "During your next turn, if KO'd" → `atkAddMarker {kind:'prizeBonus'}`
   on the opponent's Active, consumed by the next turn's KO path.
   B: reuse `atkTakePrize` immediately — takes Prizes with no KO.
   Pick A; the entitlement machinery (`flags.prizesOwed`) already exists.
5. Counter-spread / multi-target wordings (I136/A9).
   A: new steps `atkCountersEachFiltered` (filter: hasAbility / damaged / type), 
   `atkDoubleCountersEach`, `atkKnockOutAll {maxRemainingHp}`, `atkDamageEachFiltered {filter}`,
   plus a repeatable `atkCountersChoices {times}` (Oil Salvo) reusing the `ask`/budget contract.
   B: extend `atkCountersEach` with optional filters — overloads one handler with five shapes.
   Pick A for the new shapes, and widen `atkCountersEach` only for the shared "each" body.
6. Marker families (I136/A7/A8).
   A: extend `MARKER_BODIES` with `incomingBonus`, `weaknessOverride`, `attackCostIncrease`,
   `retreatDelta`, `evolveLock`, `attachLock`, `statusImmunity`, `nextTurnBaseDamage`; add the
   read sites (`computeAttackDamage` for the first two, `attackCostPayable` for the third,
   `computeEffectiveRetreatCost` for the fourth, evolve/attach legality for the locks, the damage
   path for the base-damage override).
   B: new per-effect flat fields — violates D109.
   Pick A, split per marker family so each slice stays small.
7. I137 splitter alias.
   A: change `TYPE_SYMBOLS.D` to `'Darkness'` in `scripts/lib/split-card-text.mjs`, grep for
   `'Dark'` consumers, refresh the oracle baseline (legit improvement, D108).
   B: alias only inside `oracle-harness.mjs` — leaves every other splitter consumer wrong.
   Pick A.
8. Regression proof.
   A: promote the scratch probe + behave to `scripts/audit-attack-behaviour.mjs` with a committed
   per-class baseline (ratchet, D108-style) + `pnpm audit:attacks`.
   B: unit tests only — corpus gaps drift back silently.
   Pick A in the final slice; unit tests per slice meanwhile.

## Design
Schema / naming contract (stable surface all slices reuse):
- `rules/attack-conditions.mjs`:
  - `parseAttackCondition(text, {selfName})` → `null | {kind, ...}`. Kinds:
    `defenderStatus {status, negated}`, `noStadium`, `handCount {op:'eq'|'neq'|'lte'|'gte', n}`,
    `benchHasName {names[]}`, `benchMissingName {names[]}`, `benchCount {op, n}`,
    `opponentPrizes {op, n}`, `opponentHandCount {op, n}`, `attackerEnergyType {type, mode:'none'|'atLeast', n?}`,
    `attackerDamageCounters {op, n}`, `defenderDamageCounters {op:'eq'|'lte'|'gte', n}`,
    `defenderRuleBox {value:'ex'|'basic'|'tera'|'radiant'|'mega', negated}`,
    `movedToActiveThisTurn {negated}`, `evolvedThisTurn {negated}`,
    `sameHandCountAsOpponent {negated}`, `noBenchSpace`, `noCombo {names[]}` (exactly-N/missing
    conditions collapse to `benchCount`/`benchHasName`).
  - `attackConditionMet(cond, ctx)` — `ctx` is the extended `buildServerAttackContext` output; a
    `null` descriptor is always true.
- `buildServerAttackContext` additions: `stadiumInPlay`, `attackerMovedToActiveThisTurn`,
  `attackerEvolvedThisTurn`, `defenderIsBasic/ex/tera/radiant/mega`, `defenderRemainingHp`,
  `defenderHasSpecialEnergy`, `benchNames[]`, `handCount` (already), `opponentHandCount`
  (already), `attackerEnergyTypes[]`. New card metadata `movedToActiveTurn` stamped at the
  promote/switch sites (`promote`, `atkSwitchSelf`, `atkGust`, retreat).
- `rules/attack-status.mjs`: `parseAttackStatusBranches(text,{selfName})` → `[{when, statuses[]}]`;
  `statusesFromBranches(branches, {coin, headsCount, flips})` → `{defender[], attacker[]}`
  (multi-flip thresholds: highest matching clause wins for "if 1/2/all heads" chains; all
  `always` clauses apply).
- `parsePrizeOnKo(text)` → `{count, filter?:{ruleBox:'basic'|'gx-ex'|'mega'}} | null`;
  marker kind `prizeBonus {count, filter?}` (opponentActive, next-turn window).
- New marker kinds + reads: `incomingBonus {amount, filter}` (defender marker, added in
  `computeAttackDamage` before WR like `nextTurnBonus`), `weaknessOverride {type}` (defender
  weakness calc), `attackCostIncrease {count}` (marker on the defender, read by
  `attackCostPayable` when that player attacks), `retreatDelta {amount}` (marker on the target,
  read by `computeEffectiveRetreatCost`), `evolveLock`, `attachLock`, `statusImmunity`
  (legality/condition gates), `nextTurnBaseDamage {attackName, value?, doubled?}` (damage path
  overrides the printed base for the named attack).
- New step types (effects/attack-steps.mjs handlers): `atkCountersEachFiltered {count, side, filter}`,
  `atkDoubleCountersEach {side}`, `atkKnockOutAll {maxRemainingHp?}`,
  `atkDamageEachFiltered {amount, filter}`, `atkCountersChoices {times, count}`,
  `atkDiscardOwnHand {count|'all', chain?:true}`, `atkLostZoneFromHand {count|'all'}`,
  `atkLostZoneOppHandRandom {count}`, `atkLostZoneSelf {}`, `atkLostZoneInsteadOfDiscard {}`,
  `atkHealAllSelf {}`, `atkHealCounted {target, count|'all', per?}`,
  `atkLookOwnDeck {count, then:'reorder'|'discard'|'takeOne'}`,
  `atkLookAnyDeck {count}`, `atkMoveCounterToOpponent {count, from:'any'|'each'}`,
  `atkMoveOppEnergy {count, to}`, `atkUseSupporter {source:'hand'|'opponentDiscard'|'inPlay'}`.
  Existing steps reused with widened fields: `atkKnockOut {condition, ruleBox}`,
  `atkKnockOutChoose {leastHp, ruleBox, all}`.
- `discardEnergyScaling` (damage-parser) returns `groups: [{energyType, basicOnly, max}]` for
  "…or…" forms; `discardScalingCandidates` unions the groups and `discardScalingEnergy` counts
  what actually moved; the damage total is `perUnit × discarded` (already the contract).
- `TYPE_SYMBOLS.D = 'Darkness'`; grep all `'Dark'` readers before landing.

## Edge cases & failure modes — the completeness contract; Builder ticks every row
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | Empty / missing attack text or no condition | no gate; attack runs as before | [x] `attack-conditions.test.mjs` "unknown, empty and non-gating text return null" + "a null descriptor is always met" |
| 2 | Malformed / unknown wording | no gate, no step; no throw | [x] same test (unknown clause + unknown descriptor kind fails open) |
| 3 | Coin-gated "if tails, does nothing" | existing design-032 path only; gate parser skips it | [x] `attack-conditions.test.mjs` "coin-gated … design 032" + `attack-condition-gate.test.mjs` "a coin-gated … stays with design 032" |
| 4 | Condition true | damage + effect steps run normally | [x] the 12 control halves in `attack-condition-gate.test.mjs` + "a passing condition still runs the attack's steps" |
| 5 | Condition false | attack used: 0 damage, no effect steps, `attackerAttacked` set, turn ends, GX/VSTAR spent | [x] `assertFizzled` on 12 rows + "a failed GX attack spends the once-per-game GX attack" (VSTAR unchanged: `useVStarGX` path) |
| 6 | Hand-Energy-discard "if you can't" | D114 legality gate, not the new condition (written strike) | [x] `parseAttackCondition` returns null; D114 path untouched (written strike stands) |
| 7 | Attack with no defender (effect-only) | condition reads that need a defender are skipped, no throw | [x] "conditions that read the defender are skipped…" + integration "an effect-only attack with no defender is not gated" |
| 8 | Dual-branch coin status / multi-flip thresholds | only the matching branch's statuses apply; `always` clauses always apply | [x] `attack-status-branches.test.mjs` (dual-branch, always+heads, threshold chain, at-least-N, both-tails, first-flip) |
| 9 | KO'd defender | status clauses do not apply (existing rule) | [x] "reducer: a KO'd defender takes no status" |
| 10 | Extra Prize with no KO from this attack / filter mismatch | no entitlement; count floored at the prize zone size | [x] covered: `attack-prize-on-ko.test.mjs` "More Moon (D2)" / "Basic-only … not on a Stage 1" / "pays once per Knock Out, and is floored at the Prize zone" |
| 11 | Marker window expiry / card leaves play / evolves / retreats | markers clear per D109 | [x] slice 5: `attack-prize-on-ko.test.mjs` "stops counting after the next turn" + "does not pay after the marked Pokémon leaves the Active Spot"; retreat/KO clearing already covered by `attack-markers.test.mjs` |
| 12 | Gate evaluated across a pendingChoice resume | gate runs before choices; resume re-enters after it | [x] "the gate is not re-evaluated when a before-damage step resumes" |
| 13 | Repeated seeds / replay determinism | only `activeRng`; identical state for identical seeds | [x] both new modules are pure (no `Math.random`); integration tests drive `createRng` |
| 14 | Stacking markers (two reductions/bonuses) | summed like the existing `markerSum` | [ ] n/a slices 1–4 |
| 15 | `{D}` alias change | all costs still payable; only previously-unpayable ones change | [x] `split-card-text.test.mjs` "every printed {symbol} cost is payable…" + "{D} is Darkness…" |
| 16 | New steps with no legal target | `effectStepSkipped` event, no partial effect | [x] `atkDiscardStadium` skips `no_stadium`; `addChainedMarker` guard; the gate prevents the Eternatus step without a Stadium; slice 6: `attack-conditional-ko.test.mjs` "Radiant Hunt … nothing happens without one" (`effectStepSkipped`) |
| 17 | "…or…" discard group with only one type attached | discards that group; damage counts it | [x] slice 7: `attack-discard-scaling.test.mjs` "Dragon Burst with only one type attached discards that group without asking (edge 17)" + neither-type and group-cap cases |

## Test plan
Unit: `__tests__/attack-conditions.test.mjs` (one case per kind + false/true controls from the
report's 109 rows), `__tests__/attack-status-branches.test.mjs` (heads/tails/multi-flip,
`always`), `__tests__/attack-steps-additions.test.mjs` (one case per new step kind using real
card texts from `rows.json`), `__tests__/attack-markers.test.mjs` extensions (new kinds, windows,
reads), `__tests__/attack-prize-on-ko.test.mjs`, `__tests__/attack-discard-scaling.test.mjs`
(Dragon Burst "or" form).
Integration: reduce-level attack runs for the audit's repro cards (`behave.mjs` expectations):
Malamar/Fan Rotom/Medicham/Solrock/Sawk/Slowbro/Primeape/Vikavolt/Victini/Palafin/Eternatus →
0; Lilligant/Swinub → status per face; Iron Hands ex vs 100 HP → 2 Prizes; Haxorus Axe Blast →
KO; Snorlax Layabout → full heal; Dragon Burst → discard group + scaled damage.
Regression: `pnpm test` each slice; `pnpm audit:oracle` after damage/status/prize changes; final
slice adds `scripts/audit-attack-behaviour.mjs` (probe + behave promoted, corpus deduped to the
unique attacks) with a committed baseline and `pnpm audit:attacks`.

## Migration / rollout
n/a: in-memory state; one new card field (`movedToActiveTurn`) defaults to absent = "not moved
this turn". The I137 alias changes audit scripts only (no runtime card data). Revert = revert the
branch. Oracle/behaviour baselines update only for legitimate improvements (D108 policy).

## Work plan — slices ≤1 session, each leaving the repo green
| Slice | Delivers | Green when |
|---|---|---|
| 1 | I137: `TYPE_SYMBOLS.D='Darkness'` + consumer grep + oracle baseline refresh | `pnpm audit:oracle` green; dark-cost attacks now observed |
| 2 | A1 foundation: `attack-conditions.mjs` + ctx fields + `movedToActiveTurn` + reduce gate; the 12 verified cards + false controls | new unit tests; `pnpm test` |
| 3 | A1 remainder: rule-box/tera/basic, damage-counter-before, bench/hand/prize/energy condition kinds | unit tests; `pnpm test` |
| 4 | A2: `attack-status.mjs` + reduce replacement | branch-matrix tests; `pnpm test` |
| 5 | A3: `parsePrizeOnKo` + tail entitlement + next-turn `prizeBonus` marker | KO prize tests; `pnpm test` |
| 6 | A4: conditional-KO templates (basic / special energy / ≤HP / least HP / Radiant / both actives) | KO tests; `pnpm test` |
| 7 | A5: discard-scaling "or" groups (Dragon Burst) | scaling tests; oracle green |
| 8 | A6: heal wordings (remove-all / counted / per-Bench) | heal tests; `pnpm test` |
| 9 | A7/A8a: `incomingBonus` + `weaknessOverride` + `attackCostIncrease` + `retreatDelta` markers and reads | marker tests; oracle green |
| 10 | A8b: `evolveLock` / `attachLock` / `statusImmunity` / `nextTurnBaseDamage` | marker tests; oracle green |
| 11 | A9: counter-spread / multi-target wordings (filtered each, double, KO-all, damage-each, choices) | step tests incl. resume; `pnpm test` |
| 12 | A10: status suffix on conditional-damage sentences | parser + reduce tests; `pnpm test` |
| 13 | A11/A12: hand-discard + Lost Zone clauses (incl. KO-replacement marker) | step tests; `pnpm test` |
| 14 | D executors: move-counter-to-opponent, opponent Energy move, deck look/reorder, per-Bench attach, typed attach-from-discard, shuffle-cost, old switch/gust | per-template tests; `pnpm test` |
| 15 | E: supporter-effect, copy-attack Bench variants, rest-of-game damage bonus | per-card tests; oracle green |
| 16 | Regression: promote `audit-attack-behaviour.mjs` + baseline + `pnpm audit:attacks`; annotate reports; close I136/I137 | gate runs; ISSUES closed |

Slices 1–5 are the recommended first cluster (wrong outcomes, no schema risk). Slices 9–10 share
the marker surface and can merge if a session has room; slice 15 is the largest and may split per
mechanic.

## Deviations (Builder appends here during build)
- S282 slices 1–4 built on `feature/attack-behaviour` (worktree
  `C:\Users\SMG26\AppData\Local\Temp\opencode\attack-behaviour-wt`; commits 7d3e9dd4…034e4a54).
- Slice 1: `pnpm audit:oracle` is cost-blind — `oracle-harness.buildState` sets
  `rulesEnabled: false`, so `validateLegality` (and `attackCostPayable` inside it) never runs. The
  `{D}`→`Darkness` alias changed no oracle rate; the fix is proven by
  `scripts/lib/split-card-text.test.mjs` (every printed symbol is payable by its Basic Energy).
  The baseline refresh the slice asked for moved to the end of slice 4, where the gate/status
  changes do move rates.
- Slices 2–3 were built as one increment (one `rules/attack-conditions.mjs`). Descriptor
  contract: the descriptor names the state in which the attack PROCEEDS; `negated` flips the base
  check; `attackConditionMet(null, …)` is true; unknown kinds fail open. Kind names follow the
  design except these extras the A1 wordings needed: `attackerStatus`, `inPlayHasName`,
  `handCountVsOpponent`, `ownPrizes`, `discardEnergyCount`, `defenderMaxHp`,
  `defenderRemainingHpVsAttacker`, `defenderHasSpecialEnergy`. `benchMissingName`, `noBenchSpace`
  and `noCombo` were not needed — `benchHasName` covers the "have X on Bench" polarity through
  `negated`, and the no-combo wordings are one-off.
- `movedToActiveTurn` is stamped at the design's four sites plus `effects/executor.mjs`'s three
  switch cases and `effects/special-energy.mjs`'s `swapActiveBench`, so a Trainer/Energy switch
  cannot leave Palafin's gate reading a stale board.
- `dualStatus` (`attack-effects.mjs`) had a broken regex: the closing apostrophe was required
  (only quoted `'Paralyzed' and 'Poisoned'` matched) and the loose fallback was unreachable. Fixed
  in slice 4 because Lilligant's heads branch is a dual status.
- Oracle baseline refreshed twice (D108). First refresh: `attack:dual-status` appears (78 rows),
  the status-* families shrank by those same rows (rates unchanged), `conditional-damage` +32
  observed (coin-branch statuses now apply), `bench-damage` +1. Second refresh after the review
  fixes below: `conditional-damage` 159/740, `dual-status` 72/78, status-* −1…−12 — the drops are
  rows whose status was previously applied unconditionally from a condition this parser does not
  evaluate yet (the A10 conditional-suffix class, slice 12). Removing a wrong effect before the
  right one exists is the intended direction, not a regression.
- Review pass (S282) fixed five real findings, each with a test:
  (a) the status target now comes from the clause's own subject, so an A10 damage sentence
  mentioning "this Pokémon" no longer mis-targets the defender's status; (b) a leading `if` that
  matches no known gate applies NOTHING (Suicune Aurora Wave and the "if you played Candice…"
  class), with `both are heads/tails`, `only N is heads`, `you get N or more heads` gates added;
  (c) multi-status clauses apply every status (Radiant Venusaur "Burned, Confused, and Poisoned");
  (d) `firstFlip` is a one-off, not a rung on the heads-count ladder; (e) `promoteToActive`
  (Scoop Up Cyclone / Turo's Scenario) also stamps `movedToActiveTurn`. Also fixed: `has any X
  Energy` polarity, Holon dual-token matching, the name denylist, and dead code in
  `attack-conditions.mjs`.
- Still unparsed A1 wordings (deferred, not silently dropped): discard-cost "…or this attack does
  nothing" (slices 13/14), hand-discard "if you can't" (D114), opponent-board conditions
  ("opponent has no Benched / Stage 2 / Pokémon-ex in play"), "has any Supporter in discard"
  (Golurk), "no Pokémon Tool attached" (Weavile), "Flip 2 coins. If either of them is tails"
  (design-032 coin gap), copy-attack energy conditions (slice 15).
- Out-of-scope finding kept: `resolveCheckup` clears Asleep on every player's Active at every
  checkup (only Paralyzed is gated by `endingPlayerId`), so a defender can wake at the attacker's
  checkup. Pre-existing; needs its own patch.
- S284 slice 6 (A4) built on `feature/attack-behaviour`, commit aa5f2845. Templates for the Basic /
  Special Energy / ≤HP-remaining / both-Actives / least-HP / Radiant wordings live in
  `rules/attack-steps.mjs`; `atkKnockOut` gained `scope:'both'` and the `specialEnergy` /
  `maxRemainingHp` conditions (remaining HP now counts Tools/Special Energy/Stadium via
  `stadium-effects.effectiveHp`, not just printed HP); `atkKnockOutChoose` gained `leastHp`
  (every Pokémon in play except the attacker, player picks on a tie) and `ruleBox` (the
  `defenderRuleBox` vocabulary; only `radiant` is emitted today — the map is the contract). The
  A1 gate layer also reads "You can use this attack only if <clause>" (Beedrill Destiny Stinger's
  damage counters; the other 28 use-only-if clauses are unread wording and stay ungated).
- Slice 6's review pass found that a command resolving two Knock Outs for different players (the
  new both-Actives wording) evaluated win conditions per KO, so the second `setGameEnded`
  overwrote the first and the simultaneous tiebreak never ran. Fixed with `settleKnockOutWins`
  (reduce.mjs): one evaluation per Knock Out or per batch (`deferWin` from
  `resolveDamageCounterKnockouts`), counting each player's ways as "all Prizes" (owed > 0 &&
  prizes <= owed) + "opponent has no Pokémon in play". Session stopped by the user before the
  follow-up re-review of this fix; `HANDOFF.md` on the branch has the resume steps.
- S284 slice 5 (A3) built on `feature/attack-behaviour`, commit fe9cefc9. `parsePrizeOnKo` lives in
  `rules/damage-parser.mjs` next to `conditionalKoClause`; the next-turn wording is a
  `prizeBonus` marker (`attack-markers.mjs` body + a window phrase for the mid-sentence
  "…during your next turn, take N…" form). The `pokemonKnockedOut` event gained a `ruleBoxes`
  array (the victim's basic/gx-ex/mega labels) so the tail can filter after the victim is
  discarded. The grant runs in the tail before the chosen-target damage and again after it (a
  per-command `paid` set stops double payment), plus on a mid-after-steps pause and on the
  target-picker resume — a review pass found the plain after-the-block grant missed a Knock Out
  that preceded a suspension (no corpus card hits it yet; slice 6/11 would).
- Slice 5 residuals (not silently dropped): (a) Beast Game-GX's second clause "If this Pokémon has
  at least 7 extra Energy …, take 3 more Prize cards instead" is unparsed — the base "+1" applies;
  the schema has no extra-Energy count field, so the upgrade needs its own design. (b)
  `isModernMegaCard`'s name fallback labels the TAG TEAM "Mega Sableye & Tyranitar-GX" as `mega`,
  so Umbreon-EX Endgame would over-pay +2 on it; pre-existing classifier quirk, first consumer is
  this filter, fix belongs in `card-classify.mjs` (not in the slice).
- Slice 5 also hardened the entitlement machinery its floor relies on: `settlePrizeEntitlements`
  used to recurse forever when a grant exceeded the remaining Prize cards (`atkTakePrize` "Take 2
  Prize cards" with 1 Prize left reproduced a stack overflow on main), and the auto-collect path
  never ended the game when it took the last Prize. Both fixed + tested in `attack-ko.test.mjs`
  ("a grant larger than the remaining Prizes is floored, not stranded").
- S287 slice 6 re-review of `settleKnockOutWins` (fresh eyes): no blocker. The generic count is a
  superset of the old per-KO block (it also credits the victim's own pending Prizes, which the old
  block ignored) and the `owed > 0` guard only differs on synthetic zero-Prize boards. The batch
  sweep runs once per command (marker events are spliced after the first sweep); promotion stays
  held while `deferWin` is open and `settlePromotionChoices` skips a concluded game. Two
  pre-existing follow-ups, not regressions: (a) the sweep skips its batch evaluation when a direct
  Knock Out earlier in the same command already concluded the game, while direct callers re-evaluate
  the cumulative board, so a direct last-Prize KO plus a sweep KO of the attacker's last Pokémon
  would miss the tie; (b) the between-turns Stadium loop breaks after the first concluding KO, so
  both Actives falling to Stadium damage never reach the tiebreak.
- S287 slice 7 (A5) built on `feature/attack-behaviour`, commit 6f6b4e04. `discardEnergyScaling`
  returns `groups: [{energyType, basicOnly, max, all?}]` for the "… or …" form (per the Design
  contract) and `all: true` for the lone "Discard all {X} Energy attached to …" form. Beyond the
  design's Dragon Burst scope the gate also accepts "… times the number/amount of … Energy …
  discarded", so the older prints that scaled by *attached* Energy without discarding (Pikachu-EX
  Overspark, Galvantula, Raichu, Infernape, Hydreigon, Aggron, Camerupt-EX, Heliolisk,
  Eelektross) now discard and count what moved — oracle `attack:discard-cost` 411 → 423. Reducer:
  all-groups with two types attached raise a type choice (numeric sentinel options), one type
  discards without asking; counted groups keep the card picker and the resume narrows to the
  group of the first chosen card, capped at its max (`discardScaleSelection`). Unparsed on
  purpose: Salamence (branching per group, no scaling), Barbaracle/Golem "as many … as you like
  from your hand", deck mills. The legacy client (`chat-buttons.js`) still treats groups as one
  pool (legacy mode untested, D-policy).
- S287 slices 8–15 built on `feature/attack-behaviour` (user: "continue up to slice 15"); per-slice notes, design-name deviations and residuals (filed as I139–I141):
- S287 Slice 8 (A6 heal) — bf811766:
  - atkHealCounted {target self|chosen|distribute|opponentActive|bothActive, count (counters)|all, cure?, scope, targets?, pokemonType?}
  - atkHealEach widened: count, basicOnly, pokemonType, hasEnergy(+energyType), side:'both'.
  - parseAttackDamage: "remove N damage counters" = N×10 (was N). Generic self-heal stands down for HEAL_STEP_TYPES.
  - Oracle attack:heal 138→142 (+2 other rates). Tests attack-heal.test.mjs (11).
  - Residual (unread, generic self-heal still fires): conditional "If X, heal N from this Pokémon" (heals regardless of X),
    "heal N damage from it" after Rest status, attach-chained "heal all damage from that Pokémon", half-drain,
    Unown Z / Sabrina's Jynx / Butterfree Hyper Reverse / Shining Celebi one-offs, "Ancient" filter.
- S287 Slice 9 (A7/A8a markers) — 307e15b5:
  - New marker kinds: incomingBonus {amount, afterWR} (self on opp turn; opponentActive on yourNextTurn),
    weaknessOverride {type lowercase} (throughYourNextTurn; new "until the end of your next turn, X" prefix window),
    attackCostIncrease {count}, retreatDelta {amount}. Body build may return an array -> step.alsoMarkers.
  - Reads: computeAttackDamage (incomingBonus before/after W/R, only when damage > 0; weaknessOverride keeps amount),
    attackCostPayable (+Colorless, also taxes a free attack), computeEffectiveRetreatCost (+amount after Stadium).
  - Tests attack-markers-next-turn.test.mjs (7). Oracle unchanged (markers oracle-blind).
  - Residual: client inspector does not price attackCostIncrease/retreatDelta (server rejects; UI may show payable).
    "That Pokémon takes N more" wording after a gust not read.
- S287 Slice 10 (A8b markers) — ccf36716:
  - nextTurnBaseDamage {attackName, value|doubled} (37 cards): computeAttackDamage overrideBaseDamage swaps printed base
    (keeps "+" extras, scales "×", never revives 0). Name match also accepts "<name> attack" (Quick Attack).
  - attachLock {specialOnly?} / evolveLock on opponentActive: validateLegality attachCard (hand only) via attachLockReason.
    New window suffix "(.+) during their next turn" (his or her → their).
  - statusImmunity {conditions|null}: reduce attack status loop + atkChooseCondition skip. markersBlockCondition in attack-markers.
  - Fix: legacy status fallback read "can't become … Paralyzed" as Paralysis (Bayleef, Light Ledian).
  - Tests attack-markers-locks.test.mjs (8). Oracle unchanged.
  - Residual: player-wide hand locks (Noivern ex/GX, Whimsicott VSTAR, Mismagius, Giratina-EX, Umbreon&Darkrai-GX,
    Gengar&Mimikyu-GX, Azelf "any of their Pokémon") unread; Pelipper two-attack base damage; "Lt. Surge's" names split
    on "Lt." by the sentence splitter; Light Ledian "as long as Active" immunity; Lunala "can't be healed".
- S287 Slice 11 (A9 counter spread) — baac3e90:
  - rules/each-filter.mjs parseEachFilter/eachFilterMatches ({damaged, hasEnergy, hasTool, hasAbility, ruleBox[]}).
  - atkCountersEachFiltered {count, side opponent|both, scope all|bench|active, filter}; unowned "each [benched] pokémon"
    = both (every corpus card prints "(both yours and your opponent's)", stripped as reminder text).
  - atkDoubleCountersEach, atkKnockOutAll {maxRemainingHp}.
  - Deviation: design's atkDamageEachFiltered step is instead eachPokemonDamage (damage-parser) + reduce block via
    applyAttackTargets — steps cannot run W/R; resume context is serialized, so no damage hook. It also suppresses
    resolveAttackTargetClause (the loose parsed.bench fallback asked for 1 Benched target on "each of your opponent's Pokémon").
  - Fix: placeCounters on own Pokémon credited the KO Prize to the attacker; now the opponent.
  - Tests attack-counter-spread.test.mjs (9). Oracle bench-damage 584→591, multi-target 83→84 (baseline committed).
  - Residual: Oil Salvo atkCountersChoices not built (it is damage, not counters: needs defender effects/W-R via reduce);
    "choose 2 … quadruple" Spiritomb, Maushold per-Maushold, Bronzong retreat-cost counters, Spiritomb Color Tag type pick,
    both-sides damage-each ("each Pokémon that has an Ability (both…)" Weavile/Raichu/Oricorio), coin-gated damage-each
    (Gyarados), Dark Espeon per-Energy each.
- S287 Slice 12 (A10 conditional status) — e064973c:
  - parseConditionClause (attack-conditions) exposes the clause reader as a "holds when true" descriptor.
  - parseAttackStatusBranches: "if <clause>, … <status>" → branch when:{condition}; "it/that pokémon is now X" = defender
    inside such sentences; "both active pokémon are now X" = both. Unread conditions still apply nothing.
  - statusesFromBranches conditionMet callback; reduce evaluates conditions BEFORE damage (statusConditionResults) and
    carries statusConditionsMet on the resume token ("already has damage counters" must not see this attack's damage).
  - New coin gates: either coin/of the coins is heads, exactly N are heads, all N are heads, at least N heads, N is heads.
  - Tests attack-status-conditional.test.mjs (7). Oracle unchanged.
  - Residual: ~160 conditional status sentences whose condition is unread (supporter played, energy discarded, prize
    counts, etc.) still apply nothing.
- S287 Slice 13 (A11/A12 hand discard + Lost Zone) — c39bd4e7:
  - atkDiscardOwnHand {count n|'any'|'all'} (optional-wrapped); bare "discard N {X} energy card from your hand" →
    atkDiscardHandEnergy (now optional-wrapped). Events carry handCost (+ forDamage when counted).
  - "If you do, …" after a hand cost → requiresHandCost; executor sets context.handCostPaid from handCost events.
  - Required cost ("if you can't/don't …, this attack does nothing") moves before damage; legality gate
    handCardsCostReason (reduce) refuses without the cards. Counted discards ("if you do / if you discarded … in this way,
    this attack does") move before damage with countsForDamage; reduce passes handDiscarded; damage-parser evalCondition.
  - Fix: conditional-bonus amount regex read "N damage plus M more" as 0.
  - Lost Zone: atkLostZoneFromHand {count, what?}, atkLostZoneOppHandRandom, atkLostZoneOppDiscard, atkLostZoneSelf,
    atkLostZoneOppActive, atkLostZoneEnergy {all}. KO replacement: draft.__attackLostZoneKnockouts (set in
    resolveAttackEffectPhase from LOST_ZONE_KNOCKOUT, cleared at command tail) read by handleKnockout — deviation from the
    design's atkLostZoneInsteadOfDiscard step (KOs resolve before after-steps, so a step would be too late).
  - Tests attack-hand-lostzone.test.mjs (12). Oracle conditional-damage 159→171, lost-zone 8→9, next-turn-lock 456→459,
    status-asleep/confused +1 (slice 12's). Baseline committed.
  - Residual: Darkrai & Cresselia "choose 2 Energy attached … put them in the Lost Zone"; Gengar/Slowking look-at-hand
    Lost Zone; Mew See Off search-to-Lost-Zone; Kingdra/Swampert "if you do … does 20 damage to 1 benched" bench part
    not gated; "you may discard 2" asks exact count after Yes (no partial).
- S287 Slice 14 (D executors) — a720f848:
  - atkMoveCounterToOpponent {count n|'all', from self|each|one|bench, to active|any} (placed after atkMoveAllCounters,
    which keeps the bench→Active wording). atkMoveEnergy from opponentAny / opponentBench.
  - atkLookDeckReorder {count, side self|opponent|either}; atkAttachEachBench {source deck|discard, max?};
    atkAttach pokemonType target; atkShuffleFromDiscard {count, upTo?, what}; atkShuffleOppActive; atkShuffleOwnBench;
    atkOppShuffleHandDraw; atkSwitchSelf benchType/benchName.
  - Design names differ: atkLookOwnDeck/atkLookAnyDeck → one atkLookDeckReorder with side; atkMoveOppEnergy → atkMoveEnergy
    from opponent*; atkMoveCounterToOpponent from:'any'|'each' → 'one'|'bench'|'each'|'self'.
  - Tests attack-d-executors.test.mjs (14). Oracle conditional-damage 171→176, discard-cost 423→424,
    move-damage-counter 0→1, next-turn-lock 459→470. Baseline committed.
  - Residual: Tentacruel "if you do, put 3 counters on the Pokémon you moved the Energy to" (move runs, counters don't);
    Espurr bench→another; Espeon "up to 4 … in any way you like"; Rocket's Wobbuffet / Flutter Mane named Bench sources;
    Blaziken VMAX Rapid Strike filter; Reuniclus per-Bench evolve; Dialga/Flabébé "in any combination"; Palkia-GX all
    opponent Energy to deck; Spidops both Actives; Golisopod discard-then-switch chain; Cleffa own hand shuffle-draw.
- S287 Slice 15 (E: supporter-effect, copy variants, rest of game) — bbf1b5d1:
  - atkUseSupporter {source hand|deck|deckTop|discard|oppHand|oppDiscard, discard?, optional?} (BLOCKS, multi-sentence).
    Runs the Supporter's parseTrainerEffect steps as this attack's next steps through a new executor ctx.insertSteps hook
    (the executor already dispatches EXTRA_STEP_HANDLERS, so trainer step types run unchanged).
  - atkRestOfGame {effect: damageBonus {amount} | damageReduce {amount, pokemonType} | gxLock} → player.restOfGame.
    reduce activeAttackMarkers appends restOfGameMarkers (bonus = nextTurnBonus, reduce = incomingReduce afterWR when the
    Active has the type); validateLegality refuses GX attacks while the opponent holds gxLock.
  - Copy: "Flip a coin. If heads, <copy wording>" prefix → coinGate on any template; new wordings ownBench (no group,
    Liepard), Defending Pokémon (Zoroark), "an attack from 1 of your opponent's pokémon in play" (Hypno), Ditto needsEnergy,
    Marshadow excludeGx (copyAttackCandidates skips isGxAttack).
  - Tests attack-supporter-rest-of-game.test.mjs (11). Suite 3489/3490 (known). Oracle PASSED, baseline unchanged.
  - Residual: conditional copies (Thievul empty hand, Nihilego 2 Prizes, Team Rocket's Mimikyu Tera-only), previous-
    Evolution copies (Incineroar, Charizard), last-turn copies (Mimikyu Copycat, Sudowoodo Watch and Learn), Slowking
    deck-top copy, old "copies that attack" prints (Clefable/Clefairy Metronome, Smeargle, Mew, Mew Star, Togetic Delta /
    Super Metronome, Dark Hypno, Shiftry ex, Alakazam Star, Misty's Psyduck). Supporter effects whose trainer steps need a
     played-card context (e.g. "you can't play this card if…" play conditions) are not checked when used by an attack.
     Stacking restOfGame + nextTurnBonus is summed by the existing marker sum but untested (edge row 14 stays open).
- S300 slice 16 (regression gate) built on `claude/rules-engine-issues-e79707`: `pnpm audit:attacks`
  (`scripts/audit-attack-behaviour.mjs` + `scripts/lib/attack-behaviour.mjs` +
  `scripts/lib/attack-harness.mjs`, promoted from the S279 scratch probe/rich harness) with the
  committed `scripts/attack-behaviour-baseline.json`; 12 unit tests in
  `scripts/lib/attack-behaviour.test.mjs`. Deviations: (a) the gate covers
  `out/pkmn-pokemon-cards.json` (the committed corpus the other gates use, 3,528 unique effect
  attacks); the 10,966-attack full `type:pokemon` sweep stays scratch-only (§F), so this is a
  ratchet over that corpus, not the S279 numbers; (b) the baseline is per unique attack (name+text
  hash → `{name, attack, family, verdict}`), not per-family shares like the ability gate — new
  attacks report as warnings, a vanished key is a corpus/text-edit warning, and each regression
  names its card (what I166–I168 need); (c) the probe's unused `parseAttackDamage` field was
  dropped (it threw on every row: `ATTACK_CTX` was read before its declaration). First baseline:
  3,247 ok / 152 partial / 129 ran-no-effect / 0 engine-error. I136 closed; I137 was already
  closed by slice 1. The gate's partial/no-effect rows are the I166–I168 ratchet.

---
Self-approval checklist (only when the user is unreachable):
- [ ] Every constraint traceable into the Design section
- [ ] Every edge-case row has an expected behavior (or a written strike reason)
- [ ] Interfaces fully named and typed — no hand-waving
- [ ] Slices each ≤1 session and independently green
- [ ] No section reads "TBD"
