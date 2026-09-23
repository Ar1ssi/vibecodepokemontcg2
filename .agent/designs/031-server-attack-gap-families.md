# 031: Server execution of the remaining client-only attack families (I118)
Status: approved (user)
Date: 2026-09-23 · Session: S269

## Problem
In rules / server-authoritative mode the attack reducer ignores ten effect families that only the
legacy client chat-buttons path honors: immunity (243 printings), damage-prevention (174),
reveal-hand (44), next-turn-bonus (36), copy-attack (34), hp-cap-damage (9), deferred-damage (3),
retaliate (2), and part of shuffle-cost (24 of 46). Players see the text but the effect never
happens, so damage and board state are wrong. redirect-damage and look-opponent-deck have 0
printings in the oracle corpus.

## Constraints
- Design 030 step pipeline is the only place attack side effects run (`rules/attack-steps.mjs`
  anchored templates -> `effects/attack-steps.mjs` handlers -> resumable `executeSteps`).
- KOs raised inside effect modules go through marker events; `handleKnockout` stays in reduce.mjs
  (circular import constraint). Randomness only from `activeRng`.
- Timed effects follow the existing turn-number style (`cannotAttackUntilTurn >= turn.number`)
  and are cleared wherever `cannotAttackUntilTurn` is cleared today (retreat ~1343, move ~4291).
- `computeAttackDamage` stays pure; new behavior arrives as named options.
- Legacy client path and the I113 oracle damage-amount gate are out of scope.
- Every family moved to server execution is added to `EXECUTED_ATTACK_FAMILIES` in
  `attack-false-positive-audit.mjs` only after the oracle confirms it.

## Current state
- `rules/attack-effects.mjs` classifies these families (immunity ~599, hp-cap ~560) and
  `parseNextTurnLock` (848) is the only timed-effect parser the server uses (locks at reduce ~3777).
- `rules/attack-engine.mjs` `computeAttackDamage` order: base + bonuses - penalty -> Weakness ->
  Resistance -> stadium reduction -> special-energy reduction -> tool reduction -> tool prevention.
  No immunity inputs, no pending-effect inputs.
- `rules/attack-pending-effects.mjs` parses opponent-turn prevention/reduction for the client
  only. `rules/damage-parser.mjs` helpers (immunityClause, revealHandClause, copyAttackScope,
  retaliateCount, deferredDamageCount, nextTurnBonusClause, hpCapRemaining) are used only by
  `client/src/actions/chat-buttons/chat-buttons.js` — they are the reference semantics.
- reduce.mjs main damage ~3340-3440 and chosen-target damage ~456-480 both call
  `computeAttackDamage`; the design-030 `tail` carries `effectiveAttack` into the steps.
- Existing handlers reusable: `atkOppHandRandomToDeck`, `atkDiscardOppHand`, `atkShuffleSelf`,
  `atkKnockOutChoose` (choice prompt), stadium `revealHand` step, `cardsRevealed` events.

## Options
1. Timed-marker storage.
   A: one flat field per effect (`damageReduceUntilTurn`, `noWeaknessUntilTurn`, ...) — matches
   today, but ~8 new fields, each needing its own clear site.
   B: one array `card.attackMarkers = [{ kind, untilTurn, sourceAttack, ...params }]` plus
   `player.attackMarkers` for "each of your Pokémon" effects — one expiry rule, one clear site.
   Pick B. The existing lock fields stay as they are (no migration of working code).
2. Where prevention/reduction applies.
   A: new `computeAttackDamage` options `incomingMarkers` / `outgoingMarkers`, applied in the
   printed-rule order (before-WR reductions with the penalty, after-WR after tools).
   B: post-process the total in reduce.mjs. Loses the before/after Weakness order.
   Pick A.
3. Immunity scope ("isn't affected by any effects on your opponent's Active Pokémon").
   Ignore the defender's attack markers, Tools, and special-energy reductions; keep Stadium and
   the defender's Abilities (rulings treat Abilities as the Pokémon's own, not "effects on" it).
   Weakness/Resistance variants map to `ignoreWeakness` / `ignoreResistance` options.
4. Copy-attack execution.
   A: swap `effectiveAttack` for the chosen attack before damage, keeping the copier as attacker,
   then run the normal damage + steps path. B: separate mini-pipeline. Pick A — `effectiveAttack`
   already flows through damage and the tail.

## Design
Marker model (`shared/engine/rules/attack-markers.mjs`, new, pure):
- `activeMarkers(card, turnNumber)` -> markers with `untilTurn >= turnNumber`.
- `addMarker(card, marker)`; `clearMarkers(card)` called beside every existing
  `delete card.cannotAttackUntilTurn` site; markers also die with the card leaving play.
- `parseAttackMarkers(text, { selfName })` -> marker specs from anchored templates:
  `noWeakness` (self), `incomingReduce {amount, afterWR}`, `incomingPrevent {filter, effectsToo}`,
  `outgoingReduce {amount}` (placed on the Defending Pokémon), `nextTurnBonus {amount, attackName}`,
  `deferredKnockOut` (on the Defending Pokémon, fires at end of opponent's next turn),
  `retaliate {mode: 'counters'|'attack10'}`. Filter kinds: all, basic, basicNonColorless, ex, gx,
  vmax, tagTeam, evolution, stage1, stage2, ability, types[], maxDamage.
  Conditions ("if heads", "if you have ...") reuse design-030 gates.
- Windows: opponent-next-turn markers `untilTurn = turn + 1`; self-next-turn (`nextTurnBonus`)
  `untilTurn = turn + 2`; "until this Pokémon leaves the Active Spot" -> `untilTurn = Infinity`,
  cleared on leave.

Damage (`computeAttackDamage` new options): `ignoreWeakness`, `ignoreResistance`,
`ignoreDefenderEffects`, `attackerMarkers`, `defenderMarkers`, `defenderSideMarkers`,
`attackName`. Prevention returns `prevented: true` and a `preventedBy` reason; reduce emits the
existing `damagePrevented` event. Both call sites (~3376, ~470) pass the same options.

Steps (new handlers in `effects/attack-steps.mjs`, templates in `rules/attack-steps.mjs`):
- `atkAddMarker` — applies a parsed marker to self / Defending / side.
- `atkHpCap {target: 'opponentActive'|'opponentAny', hp}` — counters = floor(max(0, remaining -
  hp) / 10); `opponentAny` uses the `atkKnockOutChoose` prompt shape.
- `atkRevealOppHand {then}` — emits `cardsRevealed` to the attacker; `then` covers discard
  (count, filter), put on bottom, add to Prizes face down. "N more damage for each X you find
  there" joins base-damage scaling (server holds the hand, no prompt needed).
- Shuffle-cost: widen the `atkShuffleSelf` template ("all cards attached to it"); widen
  `atkOppHandRandomToDeck` counts; remaining one-off printings each get a template or a written
  strike in the audit.
- Copy: `before` step `atkCopyAttack {source}` with sources opponentActive, opponentBench(name),
  benchFusion, oppDeckTop(10), discard(type), anyOpponent, benchIgnoringCost; prompts for the
  attack, checks energy where the text requires, then sets `effectiveAttack` and re-parses its
  steps with the copier as self. Copying a copy-attack is not offered.
- Deferred KO: `resolveCheckup` end-of-turn pass knocks out a card whose `deferredKnockOut` marker
  matches the ending turn, via the existing KO path.
- Retaliate: after main damage lands on a card with an active `retaliate` marker, put counters
  (or deal 10 with W/R) on the attacker; runs even if the damaged card was knocked out.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | Text matches no template | Family stays client-only, audit still flags it; no partial effect | [ ] |
| 2 | Malformed numbers / unknown filter | Parser returns null, no marker | [ ] |
| 3 | Reduction bigger than damage | Damage floors at 0, no negative | [ ] |
| 4 | Two markers of same kind stack | Reductions add; preventions OR | [ ] |
| 5 | Marked card retreats / switches / evolves | Retreat, switch, and evolve clear markers (evolving ends attack effects) | [ ] |
| 6 | Marked card KO'd before expiry | Markers leave with the card; retaliate still fires | [ ] |
| 7 | Deferred KO target left Active / play | Nothing happens | [ ] |
| 8 | Immunity attacker vs Tool prevention | Tool ignored; Stadium still applies | [ ] |
| 9 | HP-cap target already at or below cap | 0 counters, no error | [ ] |
| 10 | Reveal on empty hand | Reveal event with 0 cards; scaling adds 0; discard skips | [ ] |
| 11 | Copy with no legal source attack | Attack does nothing beyond its own text; no stuck prompt | [ ] |
| 12 | Copied attack has a prompt / coin | Resumable token carries the copied attack | [ ] |
| 13 | Crash/reload mid-prompt | Resume token in state, same as design 030 | [ ] |
| 14 | Side marker "each of your Pokémon until leaves Active" | Expires when the source leaves Active | [ ] |

## Test plan
Unit: marker parser + expiry, `computeAttackDamage` option matrix, each new handler.
Integration: reduce-level tests per family using real card texts from the oracle list
(`.agent/scratch/i118/family-texts.txt`). Oracle run at the end, then audit list update.

## Migration / rollout
n/a: code only. Saved game states without `attackMarkers` behave as "no markers". Revert = revert
the branch commits.

## Work plan
| Slice | Delivers | Green when |
|---|---|---|
| 1 | attack-markers.mjs, clear sites, immunity + noWeakness | unit + reduce tests, full suite green |
| 2 | incoming prevent/reduce, outgoing reduce, next-turn bonus | same |
| 3 | deferred KO, retaliate, hp-cap | same |
| 4 | reveal-hand, shuffle-cost remainder, strike redirect/look-opp-deck | same |
| 5 | copy-attack | same + oracle run, audit list updated |

## Deviations
