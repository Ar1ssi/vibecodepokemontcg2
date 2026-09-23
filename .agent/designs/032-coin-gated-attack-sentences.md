# 032: Coin-gated attack sentences that run no server effect (I120)
Status: approved (user) — building
Date: 2026-09-23 · Session: S271

## Problem
`node .agent/scratch/i118/gateprobe.mjs` lists 47 kinds (75 sentences) of "If heads / If tails /
For each heads, …" attack sentences that the server attack phase never runs. Two are false
positives (Duskull Astonish parses as a two-sentence block; Lt. Surge's Magneton Mega Shock is
recoil). Reading the reducer turned up three live bugs on the same attacks:
- `parseAttackEnergyDiscard` matches "discard all Energy from this Pokémon" before it checks
  the coin gate, so Pikachu ex Dynamic Bolt discards every Energy on heads too.
- Deck searches in `finishAttackTail` ignore the gate: Manaphy Chase Up and Pichu Find a
  Friend search on tails. Kakuna Dangerous Evolution puts the evolution card into the hand.
- `flipAttackCoins` flips once for "Flip a coin until you get tails", so "for each heads"
  never counts past 1 (Hyper Whirlpool, Remove Lost, and every until-tails damage attack).

## Constraints
- Design 030 pipeline: anchored sentence templates (`rules/attack-steps.mjs`) → handlers
  (`effects/attack-steps.mjs`) → resumable `executeSteps`. Helpers stand down for a clause the
  steps own (D107). KOs from handlers go out as `knockOutMarked` events.
- Timed effects are `card.attackMarkers` (D108). Copy attacks pick their attack before the
  coins (D109).
- Randomness only through `activeRng`. Legacy client path out of scope (policy).
- A missing effect is safer than a wrong one: a sentence with an unsure reading stays unparsed.

## Current state
- `rules/attack-steps.mjs`: `stripGates` lifts the gate. `TEMPLATES` hold one-sentence
  forms. `BLOCKS` hold multi-sentence forms, gated at the sentence start by `gatedBlock`.
  `resolveCoinGates` drops or scales gated steps.
- `reduce.mjs`: `flipAttackCoins` (~154). `planAttackSteps` (~3176). Self Energy discard
  `parseAttackEnergyDiscard` (~4083). Tail deck search `finishAttackTail` (~4212). Attack
  declaration checks `cannotAttackUntilTurn`. Damage KO goes to `handleKnockout`.
- `effects/trainer-steps.mjs` `searchEvolve`: Salvatore search-and-evolve, any root.

## Options
1. Self Energy discard behind a gate. A: a new `atkDiscardSelfEnergy` step for every self
   discard; the legacy helper retires. This changes timing and choice for ~hundreds of ungated
   printings. B: a step only for gated sentences; the legacy helper skips gated sentences.
   **Pick B**: it fixes the gap without touching ungated behavior. Ungated name forms
   ("attached to Charizard") become a follow-up issue.
2. Until-tails flips. A: add a new coin mode only for the steps. B: `flipAttackCoins` flips
   until tails (cap 20) and returns `coin: null, headsCount`. **Pick B**: damage "for each
   heads" and step scaling both read `headsCount`, so one fix covers both.
3. Opponent-coin markers (Smokescreen Shot, G-Max Cuddle, Strong-Willed). A: new flags on
   the card. B: new marker kinds in `attackMarkers` (D108). **Pick B**.
4. Gated copy (Togetic Mini-Metronome). A: flip in the attack command before the copy
   choice; on tails the attack is used and does nothing. B: skip. **Pick A**. The flip is the
   attack's own flip (D109 order holds: the copy is still picked before its coins).

## Design
New and extended step kinds (all take the usual `gate` / `perHeads` / `optional` flags):
- `atkDiscardSelfEnergy { count | all, energyType? }`: gated sentences only. The player
  chooses when more Energy match than the count; fewer → discard what there is.
- `atkDiscardOppEnergy` gains `chooser: 'opponent'` (Hyper Whirlpool) and
  `toOwnerDeck: true` (Psykiss: shuffle into their deck). The template accepts ", if any".
- `atkLostZoneEnergy` template: "remove an energy card attached to your opponent's active
  pokémon and put it in the lost zone".
- `atkMill` template: "your opponent discards the top card from their deck".
- `atkBounceOppActive`: the opponent's Active and attached cards go to their hand; the
  opponent promotes (`settleVacatedActive` for the opponent). The Hidden Power form
  ("does nothing" without Bench) sets `needsBench`.
- `atkShuffleOppBench` gains `toTop: true` (Strong Breeze puts it on top, then the next
  sentence shuffles; the result is the same, so a shuffle is kept).
- `atkDevolve` gains `scope: 'chooseAny'` (either player's evolved Pokémon, top card to its
  owner's hand).
- `atkRecover` gains `what: null` (any card) and `to: 'deckTop'`.
- `atkAttach`: blocks "if there are any {X} energy cards in your discard pile, flip a coin.
  if heads, attach 1 of them to this pokémon." and target `benchEx` (Energy Hunt).
- `atkShuffleSelf` template also reads "… all cards attached to it back into your deck".
- `atkMoveEnergy` / `atkDiscardOppEnergy` blocks for "if your opponent's active pokémon has
  any energy cards attached to it, flip a coin. if heads, choose 1 of those (energy) cards
  and (discard it | move it to 1 of your opponent's benched pokémon)."
- `atkKnockOut` gains `condition: 'basic'`; `atkKnockOutChoose` gains `scope: 'bench',
  basicOnly`.
- `atkChooseCondition { options: string[] }`: a one-of-N choice, then the condition lands on
  the opponent's Active (Miracle Powder/Blow: all five; Delta Beam: three).
- `searchEvolve` gains `ontoSource: true` (Dangerous Evolution); `handlesSearch` stands the
  tail search down.
- Tail deck search: a search whose sentence is gated runs only on the matching face.
- Markers: `attackFlipOrFail` (opponent Active; when it declares an attack, its owner
  flips; tails → the attack does nothing, turn ends) and `surviveKnockOutCoin` (self; when
  attack damage would KO it, flip; heads → damage set so 10 HP remain).
- Copy: `parseCopyAttack` reads "flip a coin. if heads, choose 1 of the defending pokémon's
  attacks. … copies that attack except for its energy cost." as `{ source: 'oppActive',
  coinGate: 'heads' }`. The command flips first; tails emits the flip and ends the attack.

Out of scope (filed as issues): Roserade Bowed Whip ("that Pokémon" = the chosen snipe
target, resolved after the steps); Charizard Blast Burn "(If you can't, this attack does
nothing)" cost check; ungated self-discard name forms; Raikou Lightning Sphere (discard
counted for damage).

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | Gate face misses | Step dropped, no event | [ ] |
| 2 | Nothing to act on (no Energy, empty discard, no bench) | skip, attack continues | [ ] |
| 3 | Until tails: 0 heads / cap 20 | perHeads steps dropped / at most 20 | [ ] |
| 4 | Fewer matching Energy than count | discard what there is | [ ] |
| 5 | Bounce with no opponent Bench | Spin Storm: opponent loses (no Pokémon in play); Hidden Power: skip | [ ] |
| 6 | Opponent chooses (Hyper Whirlpool) | choice goes to the opponent | [ ] |
| 7 | Dynamic Bolt heads | no Energy discarded | [ ] |
| 8 | Chase Up tails | no search | [ ] |
| 9 | Smokescreen tails | attack does nothing, turn passes; heads → normal | [ ] |
| 10 | Strong-Willed heads on lethal damage | 10 HP left, no KO; tails → KO | [ ] |
| 11 | Mini-Metronome tails | no copy choice, no damage | [ ] |
| 12 | Evolve-from-deck with no match | deck shuffled, nothing evolves | [ ] |
| 13 | Concurrent / partial failure | n/a — single-writer reducer; each step resumes from its token | n/a |

## Test plan
Unit tests for every template in `attack-steps.test.mjs`; handler tests through
`applyCommand` in the existing attack-step test files; gateprobe re-run shows only the
issues filed as out of scope.

## Migration / rollout
n/a: rules code only, no stored data. Revert = revert the slice commits.

## Work plan
| Slice | Delivers | Green when |
|---|---|---|
| 1 | Self discard steps, Dynamic Bolt fix, until-tails flips, tail search gate | tests + suite |
| 2 | Opponent board: Rapids, Hyper Whirlpool, Remove Lost, Crushing Blow, Aqua Trick, Psykiss, Mix-Up, bounce, Strong Breeze, devolve-choose | tests + suite |
| 3 | Own side: Warp Hole, Reverse Edge, Hidden Power top, attach-1-of-them, Energy Hunt, Strike and Fade, Dangerous Evolution | tests + suite |
| 4 | Swinging Sphene, choose condition | tests + suite |
| 5 | attackFlipOrFail, surviveKnockOutCoin, gated copy | tests + suite |

## Deviations (Builder appends here during build)
