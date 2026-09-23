# 033: The last unparsed printings of the design-031 families (I119)
Status: approved (self — user unreachable, background session)
Date: 2026-09-23 · Session: S271

## Problem
Design 031 left 10 printings with no server effect, plus look-opponent-deck (0 printings in the
local corpus, 3 in live TCGdex). In rules mode their text shows but nothing happens, or the
damage is wrong (Mud Flood and Rocket Splash deal their bare printed number).

| Printing | Text (short) | Today |
|---|---|---|
| Mime Jr. Encore | choose 1 of the Defending Pokémon's attacks; it can use only that one next turn | nothing |
| Vespiquen Mach Wind | during your next turn, Vespiquen's Retreat Cost is 0 | nothing |
| Metang Extra Comet Punch | during your next turn, Extra Comet Punch does 30 damage plus 30 more | nothing |
| Iron Treads ex Iron-Clad Roll | you may discard all Future Booster Energy Capsules from this Pokémon; if you do, takes 150 less (after W/R) | nothing |
| Flygon Desert Geyser | discard the opponent's Stadium; if you did, prevent all damage/effects next turn | nothing |
| Deoxys Defense Forme Psychic Defense | prevent effects, damage to Deoxys reduced by 20 (after W/R) | nothing ("Deoxys" is not the card name) |
| Raichu LV.X Voltage Shoot | discard 2 {L} Energy cards from hand; 80 to 1 of opponent's Pokémon | nothing |
| Blastoise-GX Rocket Splash | shuffle any amount of {W} Energy from your Pokémon into deck; 60 each | 60 flat |
| Swampert-EX Mud Flood | reveal top 4 of your deck; +40 per {W} Energy; shuffle back | 40 flat |
| Unown T Hidden Power | take 1 card you choose from opp hand into their deck; opp picks 1 from yours into your deck | nothing |
| Inkay / Gothorita (look-opponent-deck) | look at opp top 1 (may shuffle) / top 5 (put back in any order) | nothing |

## Constraints
- Design 030/031 pipeline: anchored sentence templates (`rules/attack-steps.mjs`, markers in
  `rules/attack-markers.mjs`) -> handlers (`effects/attack-steps.mjs`). A sentence no template
  reads stays unparsed (no partial effects). Randomness only from `activeRng`.
- Timed effects are `card.attackMarkers` (D108), read only while the card is Active.
- `computeAttackDamage` stays pure. Legacy client path out of scope.

## Current state
- `parseAttackSteps` gates: if heads/tails/for each heads/before doing damage/after your
  attack/then + "you may". "If you do" chains exist only after attach steps (`requiresAttach`).
- `MARKER_BODIES` (attack-markers.mjs): noWeakness, incomingReduce/Prevent, outgoingReduce,
  nextTurnBonus ("this pokémon's X attack does N more damage"), deferredKnockOut, retaliate.
- `normalizeAttackText` swaps the attacker's exact printed name for "this pokémon".
- Attack legality (`reduce.mjs` case 'attack'): `cannotAttackUntilTurn` / `cannotAttackAttackName`,
  then `attackCostPayable`. Retreat cost: `computeEffectiveRetreatCost` (reduce.mjs ~662).
- Damage scaling: `parseAttackDamage` (damage-parser.mjs) with ctx counts the reducer fills.
  `discardEnergyScaling` + `discardScalingCandidates` + `attackDiscardScale` resume discard
  chosen Energy for "N damage for each card you discarded". `deckMillScaling` mills before damage.
- Chosen-target damage: `attackTargetClause` reads "does N damage to 1 of your opponent's …".

## Options
1. "If you do" after a non-attach step (Iron-Clad Roll, Desert Geyser).
   A: generalize `requiresAttach` to a per-step "previous step did something" flag in the
   executor. Touches the shared executor for two printings. B: a two-sentence BLOCK that emits
   one step carrying `then: <marker step>`; the handler runs the marker only when its own
   discard happened. Pick B — local to the attack modules, no executor change.
2. Encore / "can't use that attack" (Unown Amnesia shares the handler).
   A: flat fields like `cannotAttackAttackName`. B: an `attackLock` marker
   `{ mode: 'only'|'except', attackName }` on the opponent's Active, checked in the attack
   legality gate. Pick B (D108: one marker list, evolve/retreat/KO expiry for free).
3. Voltage Shoot's discard when the hand lacks 2 {L} Energy cards.
   A: attack still does 80. B: attack not usable (legality gate), like an unpayable cost.
   Pick B — the discard is part of paying for the attack; letting it through gives free damage.
4. Rocket Splash: reuse discard-to-scale with a `destination: 'deck'` (shuffle instead of
   discard) rather than a new step. Same prompt, same resume token.
5. Gothorita ordering prompt: one pick per position ("choose the card to put on top"), N-1
   prompts, last card automatic. Reuses the existing card-choice UI; no new client code.

## Design
Parser (`rules/attack-steps.mjs`):
- `normalizeAttackText`: also swap the name without a trailing "Forme" word pair
  ("Deoxys Defense Forme" -> "Deoxys") so "damage done to Deoxys" reads as this Pokémon.
- New gate `after doing damage, ` (no flag; steps already run after damage).
- BLOCKS:
  - `(you may )?discard all <tool name>s? from this pokémon. if you do, <marker sentence>.`
    -> `{ type: 'atkDiscardSelfTool', toolName, optional, then: <atkAddMarker step> }`.
  - `if your opponent has a stadium in play, discard it. if you discarded a stadium in this
    way, <marker sentence>.` -> `{ type: 'atkDiscardStadium', owner: 'opponent', then }`.
  - `choose 1 of your opponent's active pokémon's attacks. that pokémon can (use only|'t use)
    that attack during your opponent's next turn.` -> `{ type: 'atkLockAttack', mode }`.
  - `look at the top card of your opponent's deck. you may have your opponent shuffle their
    deck.` -> `{ type: 'atkLookOppDeck', count: 1, offerShuffle: true }`;
    `look at the top N cards of your opponent's deck and put them back in any order.` ->
    `{ type: 'atkLookOppDeck', count: N, reorder: true }`.
  - Unown T: `look at your opponent's hand and choose 1 card, then have your opponent shuffle
    that card into their deck. then, show your opponent your hand and they choose 1 card.
    shuffle that card into your deck.` -> two steps `atkOppHandPickToDeck` (attacker picks)
    and `atkOwnHandOpponentPicksToDeck` (opponent picks).
- TEMPLATE: `discard (N|a) {x} energy cards? from your hand(?: and choose 1 of your
  opponent's pokémon)?` -> before step `{ type: 'atkDiscardHandEnergy', count, energyType }`.
- Markers: `this pokémon's retreat cost is 0` (yourNextTurn) -> `{ kind: 'freeRetreat' }`
  whose window starts at the attacking turn + 2; `(.+) does (\d+) damage plus (\d+) more
  damage` (yourNextTurn) -> nextTurnBonus `{ amount: plus, attackName }`.
Damage (`rules/damage-parser.mjs`):
- `discardEnergyScaling` also reads "shuffle … into your deck … for each card you shuffled
  into your deck in this way" -> `{ …, destination: 'deck' }`; `parseAttackDamage` counts it
  like a discard. Reducer's `discardScalingEnergy` shuffles to deck when destination is deck.
- `deckRevealScaling(text)` -> `{ count, perUnit, filter }` for "reveal the top N cards of
  your deck. this attack does X more damage for each <kind> you find there. shuffle the
  revealed cards back into your deck." The reducer reveals (event `cardsRevealed`), counts,
  shuffles, and passes `ctx.revealedMatches`.
- `attackTargetClause` also reads "choose 1 of your opponent's (benched )?pokémon. this attack
  does N( damage)? to that pokémon".
Engine (`reduce.mjs`): legality gate reads `attackLock` markers and the hand requirement of
`atkDiscardHandEnergy`; `computeEffectiveRetreatCost` returns 0 under `freeRetreat`.
Handlers (`effects/attack-steps.mjs`): atkDiscardSelfTool (optional wrapper), atkDiscardStadium,
atkLockAttack (prompt when the defender has 2+ attacks), atkLookOppDeck, atkOppHandPickToDeck,
atkOwnHandOpponentPicksToDeck, atkDiscardHandEnergy.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | Iron-Clad Roll with no Capsule attached / declined | No discard, no marker | [ ] |
| 2 | Desert Geyser with no Stadium / attacker's own Stadium | No discard, no marker | [ ] |
| 3 | Encore vs defender with 0 / 1 / 2 attacks | 0: skip; 1: auto; 2: prompt | [ ] |
| 4 | Encore'd Pokémon evolves or retreats | Lock ends (marker expiry) | [ ] |
| 5 | Mach Wind retreat cost this turn vs next turn | Only next turn is free | [ ] |
| 6 | Voltage Shoot with 1 {L} in hand | Attack refused with a reason | [ ] |
| 7 | Rocket Splash choosing 0 Energy | 0 damage, nothing shuffled | [ ] |
| 8 | Mud Flood with a deck of < 4 cards / 0 cards | Reveals what exists; bonus from those | [ ] |
| 9 | Unown T with an empty hand on either side | That half skips; the other still runs | [ ] |
| 10 | Gothorita with < 5 cards in opp deck / 0 | Orders what exists; 0 skips | [ ] |
| 11 | Inkay declines the shuffle | Deck order unchanged | [ ] |
| 12 | Resume mid-prompt (ordering, opponent pick) | Memo in resume token (design 030) | [ ] |

## Test plan
Parser unit cases with the printed texts; reduce-level tests per printing (new file
`attack-unparsed-printings.test.mjs`); `family-signal.mjs` re-run; audit header list updated.

## Migration / rollout
n/a: code only; states without the new marker kinds behave as before. Revert = revert commits.

## Work plan
| Slice | Delivers | Green when |
|---|---|---|
| 1 | Mud Flood, Rocket Splash, Voltage Shoot (damage path) | unit + reduce tests, suite green |
| 2 | Mach Wind, Metang, Psychic Defense, Iron-Clad Roll, Desert Geyser (markers) | same |
| 3 | Encore/Amnesia, Unown T, Inkay/Gothorita | same + family-signal, audit header |

## Deviations
