# 034: Ability behaviour implementation (I128/I129/I130)

Status: approved (user instructed slice build, S279)
Date: 2026-09-24 · Session: S278

## Problem
Two corpus sweeps (`.agent/scratch/ability-series-audit/report.md` + `report-old.md`) found that
the parse/classify layer is saturated while the behaviour layer is not: 27 + 95 activated abilities
do nothing, 45 + 113 run only part of their text, ~30 passive families have no server consumer, and
two parser bugs actively mis-play cards (I128: conditional prevention/reduction filters skipped →
over-prevention; I130: legacy "reduced by N" read as counters ×10 → full prevention). Players see
the printed text and get wrong damage, wrong board state, or a no-op ability button.

## Constraints
- Server-authoritative engine (`shared/engine`) is the target; the legacy client path
  (chat-buttons/rules-bridge) is a separate surface — flag parity, do not build there.
- `computeAttackDamage` stays pure; new behavior arrives as named options (design 031 pattern).
- Ability parsers are additive; continuous/triggered steps go to `PASSIVE_ABILITY_STEP_TYPES`
  (`ability-step-plan.mjs`), executable steps register in `EXECUTOR_STEP_TYPES`
  (`effects/executor.mjs:31`) or the `EXTRA_STEP_HANDLERS` / `ATTACK_STEP_HANDLERS` tables.
- Randomness only from `activeRng`; KO flow stays in reduce.mjs (circular import constraint);
  timed state follows the `attackMarkers` contract (D109) — no new per-effect flat fields.
- `pnpm audit:oracle` must stay green; `EXECUTED_ABILITY_FAMILIES` claims change only after the
  oracle observes the family (D108).
- In-memory state only: absent fields must behave as "no effect" (no migration).
- One branch (`feature/ability-behaviour`), increments per slice, NEXTSTEPS ledger
  (CLAUDE.md § Token / model policy).

## Current state
- `shared/engine/rules/ability-executors.mjs` — the passive parser surface; its private `textOf`
  DOES read plural `abilities[]`. `parseDamageBonus/Reduction/Prevention/HpBonus/RetreatCostModifier/
  PrizeModify/KoPrevention/Thorns/Checkup/EnergyMultiplier/...` all live here.
- `shared/engine/rules/tool-combat.mjs:35` — a second local `textOf` that does NOT read
  `abilities[]`; it gates every conditional filter in `preventionForCard` / `reductionForCard` and
  the team loop, and its `cardHasAbility` is singular-first. Root cause of I128.
- `shared/engine/rules/attack-engine.mjs:65` `computeAttackDamage` — applies tool-only bonuses,
  special energy, stadium, then tool reduction/prevention. No ability inputs; own
  `damageBonusAbility` has no consumer anywhere.
- `shared/engine/rules/stadium-effects.mjs:1550` `effectiveHp` — stadium + special energy +
  attached Tools; the holder's own `hpBonusAbility` is never read.
- `shared/engine/rules/tool-combat.mjs:473` `toolPrizeCountAdjust` — loops `attachedCards` only;
  own/team prize abilities unread.
- `shared/engine/reduce.mjs` hook sites: useAbility legality :2649 (position/turn gates only),
  attack damage callers :3340-3440 and :456-480, `handleKnockout` :330-480, `resolveCheckup`
  :1600+, evolve path (`attachCard`), on-damage thorns :3988, retreat cost :711, tool cap :2300,
  cost discount :1994.
- `shared/engine/rules/attack-markers.mjs` — `card.attackMarkers` read/clear contract (D109),
  reusable for one-turn ability prevention ("until the end of your opponent's next turn").
- `shared/engine/rules/attack-copy.mjs` + reduce `offerCopiedAttack` (design 031) — reusable for
  `attackCopyAbility` (Mew-EX Versatile, Mewtwo & Mew-GX, …).
- `shared/engine/rules/turn-damage-bonus.mjs` — `player.flags.turnDamageBonuses` already consumed
  by `computeAttackDamage`; ability turn-bonuses can push the same shape.
- Audits: `scripts/audit-oracle.mjs` (family rates), scratch `probe.mjs --rich` (per-card rows),
  `behave*.mjs` (pure-function checks). The scratch pair is the seed for a repo gate.

## Options
1. Reading ability text (I128/I130 foundation).
   A: patch `tool-combat.mjs`'s local `textOf` to fall back to `abilities[0].text` — one-line, but
   leaves three copies of the same logic.
   B: export the existing plural-aware `textOf` from `ability-executors.mjs` as `cardAbilityText`
   and import it in `tool-combat.mjs`, `attack-window.mjs`, `collect-usable-abilities.mjs`, and the
   new modules — one source of truth.
   Pick B. Same blast radius as A in practice (tool-combat already imports from the module), and it
   kills the class of bug rather than the instance.
2. Where continuous passive combat modifiers are computed.
   A: new pure `rules/ability-combat.mjs` returning numbers/filters; `computeAttackDamage` gains
   `abilityBonus`/`abilityReduction`/`abilityPrevention`/`weaknessOverride` options built by the
   reduce callers from both sides' in-play cards.
   B: precompute `card.abilityModifiers` at cardStats time — cheaper at damage time but stale as
   soon as the board changes (team scope, conditions), and needs invalidation everywhere.
   Pick A: the reads are cheap and always fresh.
3. Ability suppression ("each Pokémon … has no Abilities").
   A: one predicate `abilitySuppressed(card, { inPlayCards, sideCards, isAncientTrait })` consulted
   at every entry point (useAbility gate, passive combat reads, trigger hooks). Ancient Trait steps
   (`trait`) are exempt (D72).
   B: strip `abilities` into a derived per-view copy — would have to be rebuilt on every mutation
   and would leak into the client view/hash.
   Pick A.
4. Trigger hooks (checkup / end-of-turn / on-opponent-evolve / on-damage / on-promotion / on-KO).
   A: explicit hook calls at the exact reduce sites (resolveCheckup, evolve, damage apply, KO,
   move-to-Active), each reading a new pure `rules/ability-triggers.mjs` planner.
   B: a generic event bus — new architecture, ordering ambiguity, harder to test.
   Pick A (matches how special-energy triggers were wired in I69).
5. Activated abilities whose parser already emits a step type with no executor (I129 batch A/B).
   A: add executor cases for the missing step types, widening the existing templates
   (`parseAbilityEffectSteps` preamble + `ABILITY_PREAMBLE`) for wording variants.
   B: new one-off regex branches in `parseAbility` — would fight the parser's additive rule and
   duplicate families.
   Pick A, with new step types only where no existing shape fits (transform, win-game, self-attach).
6. Regression proof for the whole effort.
   A: promote the scratch probe + behave scripts into `scripts/audit-ability-behaviour.mjs` with a
   committed per-class baseline (ratchet, like the oracle gate, D108) and `pnpm audit:abilities`.
   B: rely on per-slice unit tests only — the corpus gaps drift back in silently.
   Pick A; run it in the final slice and after each later slice where classes close.

## Design
Schema / naming contract (stable surface other slices reuse):
- `cardAbilityText(card)` — the single text accessor (plural-aware), exported from
  `ability-executors.mjs`; every passive consumer imports it.
- `rules/ability-combat.mjs` (new, pure): per-family readers returning plain structs —
  `abilityDamageBonus(attacker, defender, ctx)`, `abilityDamageReduction(defender, attacker, ctx)`,
  `abilityDamagePrevention(defender, attacker, ctx)`, `abilityWeaknessOverride(defender, ctx)`,
  `abilityHpBonus(pokemon, ctx)`, `abilityPrizeModify(victim, ctx)`,
  `abilityRetreatCost(target, ctx)`, `abilityAttackCostDiscount(attacker, ctx)`,
  `abilityIgnoresDefenderEffects(attacker)`, `abilityExtraTypes(card)`,
  `abilityEnergyMultiplier(cards)`, `abilityRetreatLock(active, ctx)`,
  `abilityEvolveLock(card, ctx)`, `abilityCounterMoveLock(ctx)`, `abilityExtraAttack(card)`,
  `abilitySummonRestricted(card)`, `abilityStatusImmune(card, condition)`,
  `abilityFirstTurnAttack(card, ctx)`, `abilityEvolvePermission(card, ctx)`,
  `isAbilitySuppressed(card, ctx)`, `abilityPlayLocks(card)`.
  `ctx` = `{ sideCards, opponentSideCards, inPlayCards, stadium, zone, turnNumber, isActive }`.
- `rules/ability-triggers.mjs` (new, pure): `parseCheckupAbilities`, `parseBetweenTurnsAbilities`,
  `parseEndOfTurnAbilities`, `parseOnOpponentEvolveAbilities`, `parseOnDamageAbilities`,
  `parseOnPromotionAbilities`, `parseOnKoAbilities`, `parsePlayLocks`; each returns steps the
  executor or the KO/checkup path can run. `parseThorns` grows the legacy
  "on that Pokémon / the Attacking Pokémon" wording and a `zone: 'active'|'any'` flag.
- `computeAttackDamage` new options (all default no-op): `abilityBonusBeforeWR`,
  `abilityReductionAfterWR`, `abilityPrevention`, `weaknessOverride`; built in reduce at both call
  sites from `ability-combat.mjs`. `abilityPrevention` uses HP units (fixes I130: the legacy
  "reduced by N" wording returns `reduceHp` and never reaches the counter path).
- `effectiveHp` gains `sideCards` and reads `abilityHpBonus` for the card itself + team scope.
- `toolPrizeCountAdjust` gains `victimSideCards` and reads `abilityPrizeModify`; `handleKnockout`
  also consults `parseOnKoAbilities` for prize-block / energy-on-KO.
- `player.flags` additions (all optional): `turnDamageBonuses` (reuse), `coinControl`,
  `extraSupporter`, `turnNotEnd`, and per-card `movedToActiveTurn` for on-promotion windows.
- useAbility legality (`reduce.mjs:2649`) calls a new
  `abilityActivationBlockReason(card, state, playerId)` covering: suppression, on-promotion window
  (`movedToActiveTurn === turn`), setup/prize window, energy/prize/hand/played-this-turn
  conditions, and the existing position/turn gates. `collect-usable-abilities.mjs` mirrors it for
  the picker so the button greys out for the same reasons.
- New step types (executor handlers in `effects/ability-steps.mjs`, a new table registered in
  `isExecutableStepType`): `moveDamageBetweenAbility`, `recoverStatusAbility`,
  `selfBenchPlacementAbility`, `selfDamageAbility`, `turnDamageBonusAbility`, `transformAbility`,
  `winGameAbility`, `returnSelfToHandAbility`, `selfAttachEnergyAbility`, `stadiumManipAbility`,
  `energySwapAbility`, `discardBenchAbility`, `deckPlaceAbility`, `drawVariableAbility`,
  `discardForDrawAbility`, `coinFlipControlAbility`, `playExtraSupporterAbility`,
  `turnNotEndAbility`, `setupAbility`, `onPromotionAbility`, `energyOnKoAbility`.
  Passive reads (no executor): `prizeModifyAbility`, `checkupAbility`, `endOfTurnAbility`,
  `onOpponentEvolveAbility`, `retreatLockAbility`, `evolveLockAbility`,
  `damageCounterLockAbility`, `summonRestrictionAbility`, `firstTurnAttackAbility`,
  `evolvePermissionAbility`, `extraAttackAbility`, `ignoreDefenderEffectsAbility`,
  `statusImmunityAbility`, `typeChangeAbility`, `energyMultiplierAbility`, `attackCostAbility`,
  `playLockAbility`, `attackCopyAbility` (reuses attack-copy at attack time).

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | Ability text empty / card not enriched | all readers return neutral (0/false); no throw | [x] covered: `cardAbilityText: reads plural abilities[] and is neutral when empty`; `parseDamagePrevention / applyDamagePrevention` |
| 2 | Unknown wording / malformed number | parser returns null, no partial effect | [x] covered: `parseThorns: legacy "on that Pokémon" wording and Active-Spot zone` (attach-cost clause → `{count: 0}`) |
| 3 | Team scope with 0 in-play cards / holder is the target | team loop skips self-double-count; 0 contributors → 0 | [ ] |
| 4 | Two abilities stack (same or different source) | bonuses add, reductions add, preventions OR; "doesn't stack" wording applies once | [ ] |
| 5 | Suppression + Ancient Trait | suppression never blocks `trait` steps (D72) | [ ] |
| 6 | Suppressed holder used via useAbility | rejected with reason; picker greys it | [ ] |
| 7 | Conditional ability with unmet condition | no effect, no marker, ability still usable if activation legal | [ ] |
| 8 | Legacy "reduced by N" (HP) vs counter-based reduce | HP reduction never multiplied by 10; counter reduce stays counters | [x] covered: `computeAttackDamage: legacy "reduced by 20" subtracts 20 HP` |
| 9 | Coin-gated prevention/reduction | flip via activeRng; tails = no effect; flip recorded as an event | [ ] |
| 10 | on-promotion window missed (card moved before turn) | `movedToActiveTurn` stamped at move; stale window rejected | [ ] |
| 11 | on-KO prize-block + tiebreak/KO order | prize count floors at 0; block skips taking, KO still resolves | [ ] |
| 12 | transform/self-attach target gone (stale prompt) | choice re-resolves against live state; no effect if invalid | [ ] |
| 13 | win-game ability while game already concluded | ignored | [ ] |
| 14 | Crash mid-prompt | resume token in state, same as design 030/031 | [ ] |

## Test plan
Unit: one `__tests__/ability-combat.test.mjs` (option matrix per family, stack/floor/conditions),
`ability-triggers.test.mjs` (parse + hook behavior), executor tests per new step type
(`ability-execution.test.mjs` extension). Integration: reduce-level tests using the real card texts
from the audit rows (`rows-rich2.json` / `rows-old.json`), plus targeted attack/KO/checkup tests.
Regression: `scripts/audit-ability-behaviour.mjs` per-class counts ratcheted against a committed
baseline; `pnpm audit:oracle` unchanged-or-better; `pnpm test` green each slice.

## Migration / rollout
n/a: in-memory state; absent fields mean "no effect". Oracle/behaviour baselines are updated only
for legitimate improvements (same policy as D108). Revert = revert the branch commits.

## Work plan — slices ≤1 session, each leaving the repo green
| Slice | Delivers | Green when |
|---|---|---|
| 1 | `cardAbilityText` single accessor; tool-combat + attack-window + collect-usable use it; legacy "reduced by N" → HP reduction (I130); `parseThorns` old wording; `matchesBasicPokemonType`/HP-cap matcher fixes | behave probes give expected numbers; unit tests; `pnpm test` + oracle green |
| 2 | `ability-combat.mjs` + computeAttackDamage options + effectiveHp + prize/retreat/cost/ignore-defender/type/energy reads | ability-combat matrix tests; behave/attack tests; oracle green |
| 3 | Suppression predicate + activation block reasons + picker parity; play locks; status immunity; evolve permission/lock; retreat/counter locks; summon/first-turn/extra-attack gates | legality tests per gate; picker parity test; `pnpm test` green |
| 4 | `ability-triggers.mjs` + hooks: checkup/between-turns/end-of-turn/on-opponent-evolve/on-damage (incl. position gating)/on-promotion/on-KO (prize-block, energy-on-KO) | trigger tests incl. ordering with special-energy triggers; oracle green |
| 5 | Executor batch A: move-energy generic, move-damage-between, recover-status, self-bench placement, self-damage + turn-bonus, return-self wordings, when-played "must"/Bench templates, opponent-disrupt reveal wordings, tool-return parse fix | per-step executor tests; rows move from dead/partial to runs |
| 6 | Executor batch B (one-offs): transform, win-game, self-attach-as-energy, stadium-manip, energy-swap, discard-bench, deck-place, draw-variable, discard-for-draw, coin-control, play-extra-supporter, turn-not-end, attack-copy ability, setup/prize placement | per-step tests; oracle/behaviour deltas |
| 7 | Promote the scratch probe + behave scripts to `scripts/audit-ability-behaviour.mjs` + baseline; `pnpm audit:abilities`; update EXECUTED_ABILITY_FAMILIES; close I128/I129/I130 | gate runs, baseline committed, ISSUES closed, reports annotated |

## Deviations (Builder appends here during build)

- Slice 1 also added the `parseThorns` `zone` flag (design placed it in slice 4) — the parser change
  was already open and the flag is inert until the reduce.mjs hook gates on it in slice 4.
- Slice 1 fixed the `matchesSearch` or-split that swallowed "N HP or less" (part of the A11 HP-cap
  class the slice's work-plan row names).

---
Self-approval checklist (only when the user is unreachable):
- [ ] Every constraint traceable into the Design section
- [ ] Every edge-case row has an expected behavior (or a written strike reason)
- [ ] Interfaces fully named and typed — no hand-waving
- [ ] Slices each ≤1 session and independently green
- [ ] No section reads "TBD"
