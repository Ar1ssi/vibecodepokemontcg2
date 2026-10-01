# 062: WotC card audit — tranche 1 fixes (I224, I225, I226, I228 part, I229 part)
Status: building (approved by the user's request to implement with slice builders; gate self-approved)
Date: 2026-10-01 · Session: S336

## Problem
`.agent/designs/refs/062-wotc-card-audit-2026-10-01.md` (F1–F8) found WotC Gen 1/2 cards whose printed
effect the engine drops. Tranche 1 fixes the families whose fix maps onto existing engine behavior
or printed markers; the rest are filed as I224–I230 residue (see § Out of scope).

## Constraints
- Card text from corpus: `out/pkmn-wotc-cards.json` (pkmncards scrape, 1198 rows, this session) and
  TCGdex (`out/tcgdex-wotc-trainers.json`: 176 WotC Trainers, `{id,name,trainerType,effect}`,
  fetched 2026-10-01). The engine sees TCGdex `effect` text for Trainers.
- No new step types where an existing one has the exact shape. No changed behavior for any
  non-WotC wording (all rewrites are anchored on WotC-only phrasing).
- Engine/rules changes ship with tests that fail without them; full `pnpm test` + audits green.

## Current state (read this session)
- `shared/engine/rules/rules-state.mjs:405` `ensureCardData` → `trainerType: detail.trainerType || null`
  (TCGdex gives 162/176 WotC Trainers no trainerType). `reduce.mjs:10289` `cardStats` copies the
  client's `trainerType`. `isStadiumCard/isToolCard` (`effects/trainer-steps.mjs:64-72`) and ~25
  other readers key off `trainerType`.
- `rules/trainer-effects.mjs:127` `appendDiscardCost` regex misses "discard 2 of the other cards";
  costs before "in order to" are dropped for Item Finder / Super Potion / Max Revive / Misty's Tears /
  Imposter Oak's Revenge / Super Energy Removal. Super Potion parses `healAmount amount: 4`, and
  `healAmount` amounts are HP (executor.mjs:1561) → it heals 4 HP, not 40.
- `discardEnergyFromOpponent` (trainer-steps.mjs:1115) ignores `count` (always 1).
- `opponentShuffleHandDraw` (trainer-steps.mjs:524) puts the hand on the bottom unshuffled and
  draws only if `moved > 0`; parse branch trainer-effects.mjs:1663 maps "shuffles … hand into …
  deck … draws N" to it.
- `executor.mjs:386-393`: a step with `cost: true` that emits `effectStepSkipped` stops the effect.
- `rules/abilities.mjs:619` `parseAbility(text)`; Rain Dance has no "from your hand" so
  `parseHandAttach` returns null; "take … attached to … and attach it to …" has no "move" word.
- `rules/attack-steps.mjs:1699` `parseAttackSteps`: normalized text (self name → "this pokémon",
  Defending → "your opponent's active pokémon", W/R → `<wr:…>` token, reminders stripped) then
  ALL_BLOCKS/TEMPLATES. Modern wordings of Withdraw/Minimize/Harden/Screech/Headache/Lure/Psyscan/
  Mischief parse; the WotC wordings parse to [].

## Options
1. Untyped WotC Stadium/Tool — (a) widen `isStadiumCard/isToolCard`: misses the ~25 other
   readers; (b) derive `trainerType` once where card data enters: client `ensureCardData` and
   server `cardStats`. Pick (b): every reader sees one field.
2. Old-wording attacks/powers — (a) new marker bodies per wording: duplicates logic; (b) rewrite
   WotC phrasing into the modern phrasing the parser already reads. Pick (b), pinned by
   equivalence tests (old parse deep-equals modern parse).
3. Trainer costs — (a) patch each branch; (b) one leading-cost pass in `parseTrainerEffect`
   anchored on `^discard … in order to`. Pick (b).

## Design
### A · `shared/engine/rules/legacy-trainer-type.mjs` (new, leaf module, no imports)
```
export function legacyTrainerType(card)   // → 'Stadium' | 'Tool' | null
```
- Returns null unless `card.trainerType` is empty AND (`card.category` or `card.type` or
  `card.supertype`, lowercased) is 'trainer'.
- text = `card.effect || card.text || ''`, whitespace-collapsed, curly quotes → straight.
- `/^This card stays in play (?:when you play it|after being played)\. Discard this card if another Stadium card comes into play\./i` → 'Stadium'.
- `/^Attach [^.]+? to 1 of your Pokémon that doesn't have a Pokémon Tool attached to it\./i` → 'Tool'.
- Else null.
Wiring: `rules-state.mjs` ensureCardData detail mapping:
`trainerType: detail.trainerType || legacyTrainerType(detail) || null`.
`reduce.mjs` `cardStats` loop, after the existing trainerType/text/subtypes copies:
`if (!card.trainerType) { const derived = legacyTrainerType(card); if (derived) card.trainerType = derived; }`.

### B · Trainer costs + Imposter Oak shuffle (`rules/trainer-effects.mjs`, `effects/trainer-steps.mjs`, `effects/executor.mjs`)
B1 `leadingTrainerCost(lower)` in trainer-effects.mjs, applied in `parseTrainerEffect` after
`parseTrainerSteps` when `result.recognizable` and no step already has type `discardCost`:
| lower text starts with | prepend |
|---|---|
| `discard (\d+) (?:of the )?other cards (?:from\|in) your hand in order to` | `{ type: 'discardCost', count: N }` |
| `discard (\d+) energy cards from your hand in order to` | `{ type: 'discardCost', count: N, energyOnly: true }` |
| `discard a card from your hand in order to` | `{ type: 'discardCost', count: 1 }` |
| `discard 1 energy card attached to (?:1 of )?your (?:own )?pokémon in order to` | `{ type: 'discardOwnAttachedEnergy', cost: true }` |
B2 Super Potion branch (trainer-effects.mjs:2250): amount = counters × 10, target `'costHost'`:
`{ type: 'healAmount', amount: 40, target: 'costHost' }` (40 from "remove up to 4 damage counters").
B3 `discardOwnAttachedEnergy` (trainer-steps.mjs:1198): when `step.cost && !step.selfOnly`, the
prompt is `` `${sourceName(ctx, 'Trainer')}: Choose an Energy attached to 1 of your Pokémon to discard` ``
and, after discarding, it pushes `{ type: 'ownEnergyCostPaid', playerId, hostInstanceId }`.
executor.mjs: in the step loop next to the `cardAttached` memo (≈line 409), remember
`context.costHostId` from the last `ownEnergyCostPaid` event; `healAmount` target `'costHost'`
filters `c.instanceId === context.costHostId` (same place as `'attached Pokémon'`).
B4 Super Energy Removal: the branch at trainer-effects.mjs:2794 adds `upTo: true`.
`discardEnergyFromOpponent` with `step.count > 1 && step.scope === '1 Pokémon'`: first ask for the
host (options = opponent roots with ≥1 matching Energy, min 1, max 1, memo `{ stage: 'host' }`),
then ask for Energy on that host (min 1, max `min(count, n)`), discard every selected card.
B5 Imposter Oak: the "shuffles … hand into … deck" branch (trainer-effects.mjs:1663) adds
`shuffle: true`. `opponentShuffleHandDraw` with `step.shuffle`: move the whole hand into the deck,
push `{ type: 'cardsShuffledIntoDeck', count, playerId }` when count > 0, `shuffleDeck(opponent, ctx)`,
then `drawCards(opponent, step.count, …)` even when the hand was empty. Without `shuffle` the
Special Red Card bottom path is unchanged.

### C · Legacy Power wording (`rules/abilities.mjs`)
`export function rewriteLegacyPowerWording(lower)` applied first thing in `parseAbility` (after
`normalizeText`):
- P1 when `lower` contains `this doesn't use up your 1 energy card attachment for the turn`:
  `/\byou may attach (\d+ (?:\{[a-z]\} )?energy cards?) to /` → `you may attach $1 from your hand to `.
- P2 `/you may take ((?:up to )?\d+) ((?:\{[a-z]\} )?energy) cards? attached to (1 of your pokémon|1 of your other pokémon|your other pokémon|1 of your [^.]+?) and attach (?:it|them) to ([^.]+?)\./`
  → `you may move $1 $2 from $3 to <T>.` where T = `another of your pokémon` when $4 is
  `a different one`; `1 of your <rest>` when $4 is `a different 1 of your <rest>`; else `this pokémon`.

### D · Legacy attack wording (`rules/legacy-attack-wording.mjs` new, `rules/attack-steps.mjs`)
`export const LEGACY_ATTACK_REWRITES` + `export function rewriteLegacyAttackWording(normalized)`
(reduce over the list with `String.replace`), called in `parseAttackSteps` right after the
reminder strip (`.replace(/\s*\([^)]*\)/g, '')`, attack-steps.mjs:1709) as
`normalized = rewriteLegacyAttackWording(normalized);`. The list, verbatim (prototype verified):
```
[/prevent all damage done to this pokémon during your opponent's next turn/g, "during your opponent's next turn, prevent all damage done to this pokémon by attacks"],
[/all damage done (?:by attacks )?to this pokémon during your opponent's next turn is reduced by (\d+)/g, "during your opponent's next turn, any damage done to this pokémon by attacks is reduced by $1"],
[/during your opponent's next turn, whenever (\d+) or less damage is done to this pokémon(?: <wr:after>)?, prevent that damage/g, "during your opponent's next turn, if this pokémon would be damaged by an attack, prevent that attack's damage done to this pokémon if that damage is $1 or less"],
[/if an attack damages your opponent's active pokémon( <wr:(?:before|after)>)?, that attack does (\d+) more damage to your opponent's active pokémon/g, "if an attack does damage to your opponent's active pokémon$1, that attack does $2 more damage to that pokémon"],
[/(^|\. )your opponent can't play trainer cards during their next turn/g, "$1your opponent can't play any trainer cards from their hand during their next turn"],
[/(^|\. )if your opponent has any benched pokémon, choose 1 of them and switch it with their active pokémon/g, "$1switch in 1 of your opponent's benched pokémon to the active spot"],
[/(^|\. )look at your opponent's hand(?=\.|$)/g, "$1your opponent reveals their hand"],
[/(^|\. )shuffle your opponent's deck(?=\.|$)/g, "$1have your opponent shuffle their deck"],
```

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | empty / none: `legacyTrainerType({})`, `rewrite…('')`, Imposter Oak vs empty hand | null / '' / opponent still draws 7 | [ ] |
| 2 | invalid: Pokémon card with "stays in play" text; typed TCGdex Stadium | null (not a Trainer / already typed) | [ ] |
| 3 | boundaries: Super Energy Removal host with 1 Energy; Computer Search with 2 other cards | max 1 pick; cost payable | [ ] |
| 4 | repeated: Rain Dance used twice in a turn | both attach (unlimited, as modern Deluge) | [ ] |
| 5 | cost unpayable: Computer Search with 1 other card; Super Energy Removal with no own Energy | effect stops after the skipped cost (executor.mjs:390) | [ ] |
| 6 | partial: Super Potion cost paid on an undamaged Pokémon | Energy discarded, heal skipped `no_damaged_pokemon` | [ ] |
| 7 | modern wording unchanged: Red Card, Special Red Card, modern Withdraw-likes, Deluge | parse output byte-identical to before | [ ] |

## Test plan
Unit (parse equivalence + derivation) and reducer-level (Trainer play / ability use) per slice;
`pnpm test`; audits `audit:attacks`, `audit:abilities`, `audit:trainers`, `audit:oracle`.

## Migration / rollout
n/a: pure parse/derivation; revert = revert the commits.

## Work plan
| Slice | Files | Signatures & data | Test cases: input → expected | Rulings (source) | Green when |
|---|---|---|---|---|---|
| A | new `shared/engine/rules/legacy-trainer-type.mjs`; `shared/engine/rules/rules-state.mjs`; `shared/engine/reduce.mjs`; new `shared/engine/rules/__tests__/legacy-trainer-type.test.mjs` | Design § A | `{category:'Trainer', effect:<neo1-84 Ecogym>}`→'Stadium'; `<gym2-102 Chaos Gym "after being played">` untyped →'Stadium'; `<neo1-86 Focus Band>`→'Tool'; `<neo4-93 EXP.ALL>`→'Tool'; `<base1-84 PlusPower>`→null; `<base1-80 Defender>`→null; `{category:'Trainer', trainerType:'Stadium', …}`→null; `{category:'Pokemon', effect:'This card stays in play…'}`→null; `{}`→null. Reducer: `cardStats` entry for an untyped Trainer with Ecogym text sets `card.trainerType === 'Stadium'`; then `isStadiumCard(card)` true. | TCGdex neo1-84, gym2-102, neo1-86, neo4-93, base1-84, base1-80 (`out/tcgdex-wotc-trainers.json`) | `node --test` file + `pnpm test:changed` green |
| B | `shared/engine/rules/trainer-effects.mjs`; `shared/engine/effects/trainer-steps.mjs`; `shared/engine/effects/executor.mjs`; new `shared/engine/__tests__/wotc-trainer-costs.test.mjs`; update existing tests asserting the old Imposter Oak/Red Card bottom placement or Super Potion amount 4 | Design § B1–B5 | parse base1-71 Computer Search → steps[0] `{type:'discardCost',count:2}` then searchDeck; base1-74 Item Finder → discardCost 2 first; gym2-117 Max Revive → `{discardCost,count:2,energyOnly:true}` first; gym2-118 Misty's Tears → discardCost 1 first; base5-76 Imposter Oak's Revenge → discardCost 1 then opponentShuffleHandDraw `{count:4, shuffle:true}`; base1-79 Super Energy Removal → `[{discardOwnAttachedEnergy,cost:true},{discardEnergyFromOpponent,count:2,upTo:true,…}]`; base1-90 Super Potion → `[{discardOwnAttachedEnergy,cost:true},{healAmount,amount:40,target:'costHost'}]`; base1-73 Impostor Professor Oak → `{opponentShuffleHandDraw,count:7,shuffle:true}`; Special Red Card text unchanged (no `shuffle`). Runtime: Super Potion with own Pokémon at 50 damage + 1 Energy → Energy in discard, damage 10; Super Energy Removal vs host with 3 Energy → 2 picked are discarded; Imposter Oak vs opponent hand of 0 → opponent hand 7, deck −7; vs hand of 3 → `cardsShuffledIntoDeck` count 3 and `deckShuffled` events, hand 7; Computer Search with 1 other card in hand → no search happens. | TCGdex base1-71, base1-73, base1-74, base1-79, base1-90, base5-76, gym2-117, gym2-118 | same + `pnpm audit:trainers` no new unrecognized rows |
| C | `shared/engine/rules/abilities.mjs`; new `shared/engine/__tests__/legacy-power-wording.test.mjs` | Design § C | strip `guidance` then deep-equal (each modern reference below gets the old row's own trailing "This power can't be used if …" sentence appended, so only the rewritten clause differs): Blastoise Rain Dance [Base Set 2] ≡ parse("As often as you like during your turn (before your attack), you may attach 1 {W} Energy card from your hand to 1 of your {W} Pokémon. (This doesn't use up your 1 Energy card attachment for the turn.)"); Venusaur Energy Trans [Base Set 15] ≡ parse("As often as you like during your turn, you may move 1 {G} Energy from 1 of your Pokémon to another of your Pokémon."); Charmander Gather Fire [Team Rocket 50] ≡ parse("Once during your turn (before your attack), you may move 1 {R} Energy from 1 of your other Pokémon to this Pokémon."); Erika's Bellsprout Soak Up [Gym Challenge 38] ≡ parse("Once during your turn (before your attack), you may move up to 2 {G} Energy from your other Pokémon to this Pokémon."); Lt. Surge's Magneton Energy Charge [Gym Heroes 8] → moveEnergyAbility target 'self' unlimited energyType 'lightning'; Magneton Electromagnetic Power [Neo Revelation 10] → moveEnergyAbility target 'between' targetTag 'magnemites, magnetons, and dark magnetons'. Runtime (ability-execution style): Blastoise Rain Dance with a Water Energy in hand and a {W} Pokémon in play → Energy attached, hand −1. Deluge/modern Energy Trans unchanged. | `out/pkmn-wotc-cards.json` rows named | same + `pnpm audit:abilities` |
| D | new `shared/engine/rules/legacy-attack-wording.mjs`; `shared/engine/rules/attack-steps.mjs`; new `shared/engine/rules/__tests__/legacy-attack-wording.test.mjs` | Design § D | for each rewrite one corpus row, `parseAttackSteps(old,{selfName})` deep-equals the listed result: Kakuna Stiffen [Base Set 33] → `[{type:'atkAddMarker',target:'self',window:'opponentNextTurn',marker:{kind:'incomingPrevent',filter:null},gate:'heads'}]`; Clefable Minimize [Jungle 1] and Brock's Dugtrio Lie Low [Gym Challenge 22] → `incomingReduce amount 20 afterWR true filter null`, window opponentNextTurn; Onix Harden [Base Set 56] → `incomingPrevent maxDamage 30`; Croconaw Screech [Neo Genesis 31] → target opponentActive window throughYourNextTurn `incomingBonus amount 20 afterWR true`; Psyduck Headache [Fossil 53] → `[{type:'atkOppPlayLock',kinds:['trainer']}]`; Ninetales Lure [Base Set 12] → `[{type:'atkGust',chooser:'self'}]`; Sentret Scout [Neo Discovery 63] → `[{type:'atkRevealOppHand'}]`; Mankey Mischief [Team Rocket 61] → `[{type:'atkShuffleOppDeck'}]`; plus a sweep: every attack in `out/pkmn-wotc-cards.json` whose text matches a rewrite's left side parses to ≥1 step. Runtime: Kakuna Stiffen heads then a 40-damage attack → 0 damage. | `out/pkmn-wotc-cards.json` rows named | same + `pnpm audit:attacks` and `pnpm audit:oracle` no new regressions |

## Out of scope (filed as I224–I230 residue)
Non-Tool attach Trainers (PlusPower, Defender, Charity, Magnifier, Sabrina's ESP, Brock's Protection,
Koga's Ninja Trick: need an attached-non-Tool lifecycle) · 7 announce-only Gyms · F4 unrecognized /
passive-only Trainers, Tickling Machine executor, Sabrina [Gym Challenge] name filter · F5 locks
(Leer/Tail Wag/Mean Look/Spider Web/Scary Face/Intimidate/Terrorize: target- or presence-scoped
locks), Snivel/Growl (attacker-filtered reduce), Deflector/Shadow Images/Slime, counters (Mirror
Move…), Focus Energy family, Fidget/Vanish/Super Fang and the rest of Appendix A–B · F6
when-played Powers · F7 90 passive Powers · F8 Baby Rule (wording must be sourced).

## Deviations (Builder appends here during build)
- Slice A: Tool regex uses `.+?` instead of `[^.]+?` before " to 1 of your Pokémon" — neo4-93 "EXP.ALL" has a dot in its name (row A expects 'Tool').
- Slice B: modern Red Card ("shuffles their hand into their deck and draws 4") now also gets `shuffle: true` — correct per its printed text; edge row 7 "byte-identical" holds only for Special Red Card.
- Slice B: an unpayable hand cost is refused by the existing play gate (trainer-play-conditions.mjs) before the executor; the own-Energy cost got the same gate (`ownAttachedEnergyCount`, passed by reduce.mjs) — added inline after review.
- Slice C: `audit:abilities` flagged Energy Trans/Gather Fire/Soak Up/Energy Charge as "new clause:attach-from-deck" — the audit heuristic (`scripts/lib/attack-behaviour.mjs` MECH) read "take … attached to … and attach it to" as a deck attach; it now skips that form (audit PASSED, Poliwrath Plunge improved).
- Slice D: one extra rewrite entry first in the list collapses ".." left by a stripped reminder (Metapod [Neo Discovery 42] Harden prints its period after the parenthesis).
