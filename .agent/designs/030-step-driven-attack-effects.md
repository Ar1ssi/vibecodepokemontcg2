# 030: Step-driven attack effects
Status: approved (user — S267 "Do all the remaining issues", answering "draft design 030?")
Date: 2026-09-23 · Session: S267

## Problem
The server attack phase (`reduce.mjs` `resolveAttackEffectPhase`) runs a fixed set of text helpers.
Every other printed clause is silently dropped: switch/gust (I102), move Energy (I103), discard from
the opponent (I104), attach from discard/hand (I105), draw-until (I106), deck/discard → Bench (I107),
search-and-attach landing in hand (I108), plain mill (I109), shuffle-self (I110), and a tail of
misc clauses (I111: discard→hand, counters on each, move counters, devolve, take Prize, KO, heal all,
discard hand). ~900 printings are affected; there is no mid-attack choice mechanism beyond bespoke
resume effectTypes.

## Constraints
- Server-authoritative only (memory: legacy mode untested; D-policy). Legacy client path untouched.
- Existing helpers keep working unchanged; a clause must never execute twice (old helper + new step).
- Replays deterministic: all randomness from `activeRng`.
- Resume tokens are plain JSON (they cross the socket / persist in state).
- `handleKnockout` lives in reduce.mjs; effect modules cannot import it (circular) — KOs from
  effect steps go through marker events swept by reduce.

## Current state
- `reduce.mjs` `resolveAttackEffectPhase(draft, ctx)`: pre-damage choices (mill, discard-scale,
  return-energy) → `parseAttackDamage` → damage/KO/thorns → recoil → self-heal → statuses → spread →
  own spread → `drawCount` → `parseAttackEnergyDiscard` → locks → `parseAttackSearchClause` →
  chosen-target → `attackExecuted` → GX flag → Raikou milled attach → Aura Jab → Tuck Tail → end turn.
- `effects/executor.mjs` `executeSteps`: generic resumable step runner (switch cases +
  `EXTRA_STEP_HANDLERS` from `effects/trainer-steps.mjs`, `ctx.ask/memo/selection/skip`). Resume token:
  `{effectType, sourceInstanceId, initiatorPlayerId, stepIndex, steps, context, budgetCount}`.
- `resolveDamageCounterKnockouts` sweeps `damageCountersPlaced` markers in the command tail.

## Options
1. Where attack clauses become steps.
   A. Reuse `parseTrainerEffect` per sentence — cheap, but misreads attack wording ("this Pokémon",
      "the Defending Pokémon", Trick Portal → "Darkness Pokémon", Trainer card → any card).
   B. New `rules/attack-steps.mjs` `parseAttackSteps(text, {selfName})`: anchored per-sentence
      templates emitting explicit steps. More code, but no false positives and each template is testable.
   Pick B. Wrong effects are worse than missing ones.
2. How the steps run.
   A. Bespoke effectType per mechanic (today's pattern) — N resume branches, no reuse.
   B. `executeSteps` with a new `attackSteps` effectType and attack-specific handlers
      (`effects/attack-steps.mjs`, merged into the executor's handler lookup); the executor's
      memo/ask/resume machinery comes for free.
   Pick B.
3. Continuation after a suspended step.
   A. Run new steps last, only when nothing else suspended — silently drops them on combos.
   B. Extract the attack tail (search clause → chosen target → attackExecuted → … → end turn) into
      `finishAttackTail`; new post-damage steps run first and, when they suspend, the resume calls
      `finishAttackTail` once the steps complete.
   Pick B.

## Design
Parser `shared/engine/rules/attack-steps.mjs`:
- `parseAttackSteps(text, { selfName }) → { before: Step[], after: Step[] }`. Replaces the
  attacker's own name with "this Pokémon"; splits sentences; strips one leading gate:
  `If heads, ` → `gate:'heads'`, `If tails, ` → `gate:'tails'`, `For each heads, ` → `perHeads:true`,
  `Before doing damage, ` → before list, `Then, ` → nothing, `You may ` → `optional:true`.
  Sentences with any other leading condition (`If …`, `If you do`) are ignored.
- Templates (anchored, full sentence) → step types:
  `atkSwitchSelf`, `atkGust {chooser}`, `atkMoveEnergy {from,to,count,all,spread,energyType,basic}`,
  `atkDiscardOppEnergy {count,all,special,scope}`, `atkDiscardOppTools {all,upTo,scope}`,
  `atkDiscardOppHand {random|count}`, `atkMill {side,count}`, `atkAttach {source,count,upTo,
  anyNumber,energyType,basic,target,spread}`, `drawUntil {target}` (existing),
  `atkBenchFromDeckTop {look}`, `atkBenchFromDiscard {count,energyType}`, `searchAbility`
  (existing, via parseAbility, for search-and-attach), `atkShuffleSelf`, `atkRecover {count,what}`,
  `atkCountersEach {count,scope}`, `atkMoveAllCounters`, `atkDevolveEach {to}`, `atkTakePrize {count}`,
  `atkKnockOut {condition}`, `atkHealEach {amount|all,bench}`, `discardHandThenDraw` (existing).
- Overlap guard: templates exclude text already run by helpers (Aura Jab spread, mill scaling,
  discard scaling, `drawCount` draws, `parseAttackEnergyDiscard` self-discard). `drawCount` stops
  counting "discard your hand and draw N"; `parsed.heal` must not read "each of your Pokémon".

Runtime (reduce.mjs):
- Gate resolution before execution: `gate` vs attack coin (`coin`/`headsCount`), `perHeads` scales
  `count` by `headsCount` (0 → step dropped).
- Before-damage steps run after the pre-damage choices and before `parseAttackDamage`; completion
  re-derives the defender (opponent's current Active when the original target left the Active Spot).
  Suspension → token effectType `attackSteps`, `context.attack = {phase:'before', ...resume fields}`;
  resume re-enters `resolveAttackEffectPhase` with `preStepsDone`.
- After-damage steps run right after the lock clause, before the search clause. Suspension →
  `attackSteps` with `context.attack = {phase:'after', tail}`; resume completes the steps, then
  `finishAttackTail`.
- After each `executeSteps` return, `resolveDamageCounterKnockouts` runs so counters/KO markers
  knock out before the turn ends. New marker `knockOutMarked` KOs regardless of HP.
- Handlers read the attacker from `ctx.sourceCard` (found anywhere in play); a missing attacker
  skips "this Pokémon" steps.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | No bench / no energy / empty deck / empty discard | step skipped (`effectStepSkipped`), turn still ends | [ ] |
| 2 | Unrecognized sentence | ignored (no step) — never a partial guess | [ ] |
| 3 | Defender KO'd before "discard from opponent's Active" | no Active → skipped | [ ] |
| 4 | Attacker KO'd by Thorns before "switch this Pokémon" | attacker not Active → skipped | [ ] |
| 5 | Optional ("You may") | decline option; decline → no effect | [ ] |
| 6 | Coin gate tails / 0 heads | step dropped | [ ] |
| 7 | Step suspends, then search clause also present | steps finish, then search clause runs | [ ] |
| 8 | Shuffle-self leaves no Pokémon in play | attacker's player loses (same as Tuck Tail) | [ ] |
| 9 | Before-damage gust | damage hits the new Active | [ ] |
| 10 | Counters/KO step KOs a Pokémon | Prize entitlement to attacker before turn end | [ ] |
| 11 | Bench full for bench placement | extra Pokémon not offered | [ ] |
| 12 | Clause already run by an old helper | not emitted (no double effect) | [ ] |

## Test plan
Unit: `parseAttackSteps` templates (positive + negative per template). Integration through
`applyCommand` for each family (new `attack-steps.test.mjs`), including resume across a choice and
the tail continuation. Oracle re-run (`.agent/scratch/cov/oracle.mjs`) before/after for family rates.

## Migration / rollout
n/a — pure engine logic; revert = revert the commits.

## Work plan
| Slice | Delivers | Green when |
|---|---|---|
| 1 | parser + runtime plumbing + switch/gust/move-energy (I102, I103) | tests + suite green |
| 2 | discard-opponent, mill, attach, draw-until (I104, I105, I106, I109) | same |
| 3 | bench placement, search-attach, shuffle-self (I107, I108, I110) | same |
| 4 | misc tail (I111) | same |

## Deviations
