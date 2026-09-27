# 049: Copy attacks and attack borrowing — every printed wording, end to end
Status: approved (user, S327: "implement a plan for EVERY copy attack, not just Mew")
Date: 2026-09-28 · Session: S327

## Problem
Pokémon use attacks they do not print in two ways. Copy attacks choose an attack at attack time
(Mew ex Genome Hacking, 151). Borrowing effects add attacks to a Pokémon's list (Mew ex Memory
Helix, 30th Celebration; Memory Capsule; Relicanth Memory Dive). An inventory of the full 17,774-
printing corpus found 45 distinct wordings (scan below). The engine reads 38 of them. The gaps:
1. Legality: a copied or borrowed GX / VSTAR Power attack ignores the once-per-game limits. VSTAR
   Power attacks are never gated or spent through `attack`. Copy candidates ignore "You can use this
   attack only if …" gates (Mimed Games ruling).
2. UI: the client attack list shows printed + Stadium attacks only. Tool-granted, Ability-borrowed
   and granted attacks never reach the panel, so a human cannot pick them.
3. 15 wordings do nothing (7 Abilities/Pokémon Powers, 3 Trainers, 8 attacks; table below), 5 of
   them deferred earlier as I181.
4. Deck import cannot resolve set code `30C` (30th Celebration Mew ex).

## Inventory (scan: `.agent/scratch/copy-scan.mjs` over `.agent/scratch/attack-full-audit/pokemon-all.json`, plus `out/pkmn-trainer-cards.json`)
Already parsed, execution kept (copy attacks, `parseCopyAttack`): Genome Hacking, Foul Play, Max
Transform, Nine-Tailed Shapeshifter, Metronome, Copy (×5 prints), Copy Anything, Imittack, Mimicry,
Mini-Metronome, Try to Imitate, Assist, Trace, Rainbow Moves, Phantom Gate, Trickster-GX, Pendulum
Influence, Super Metronome, Shadow Imitation, Gemstone Mimicry, Cross Fusion Strike, Night Joker,
Apex Dragon, Haughty Order, Re-creation, Recall (attack), Secret Attack, Seek Inspiration, Dark Link,
Nightcap, Skill Thief, Copycat, Watch and Learn.
Already parsed (borrow Abilities, `parseAttackBorrowAbility`): Memory Helix, Versatile (×2),
Evolution Memories, Fellowship, Lost Link, Memories of Dawn, Metamorphosis Gene, Omniscient,
Perfection, Shadow Hunt, Sudden Transformation, Ditto DNA. Stadium / Energy grants already in
`stadiumExtraAttacks`: Shrine of Memories, Meteor Falls, Memory Energy, Holon Lake, Rocket's Tricky Gym.

Not read today (this design adds all 15):
| # | Wording | Card (corpus row) | Kind |
|---|---|---|---|
| G1 | Memory Dive | Relicanth (Temporal Forces 084/173) | Ability grants own evolved Pokémon their previous Evolutions' attacks |
| G2 | Time Recall | Celebi-EX (Boundaries Crossed 9/141), Shining Celebi (SM79) | same wording as G1 |
| G3 | Prehistoric Memory | Aerodactyl (Neo Revelation 15) | Pokémon Power, every Evolved Pokémon (both players) |
| G4 | Dark Genes | Honchkrow (Mysterious Treasures 10) | Poké-Body, own Murkrow use Honchkrow's attack without Energy |
| G5 | Memory Capsule | Tool (Vivid Voltage 155/202) | host uses previous Evolutions' attacks |
| G6 | Memory Berry | Tool (Aquapolis 128, Crystal Guardians 80, Platinum 110) | host uses Basic / Stage 1 attacks; AQ/CG discard after attacking |
| G7 | Recall | Trainer (Gym Heroes 116) | Active uses Basic / Evolution card attacks this turn |
| B1 | LINK | Unown L (Great Encounters 91) | self borrows any Unown's attacks (both players) |
| B2 | Dragon DNA | Gyarados (Mysterious Treasures 26) | self uses its Basic's attacks, +30 damage |
| B3 | Mimic | Sudowoodo (Neo Revelation 26) | Pokémon Power, Active copies the Defending's attacks incl. costs |
| B4 | Psymimic | Alakazam (Expedition 1/33, Box Topper 1) | Pokémon Power, copy an opponent attack incl. costs |
| C1 | Genetic Memory | Kingdra (Neo Revelation 19), Kingdra ex | copy attack from own Basic / Evolution card, cost-free |
| C2 | Delta Copy | Togetic δ (Dragon Frontiers 11; TCGdex ex15-11) | copy from opponent Pokémon with δ |
| C3 | Sketch | Smeargle (Neo Discovery 11/30) | copy the Defending's last attack if Smeargle was in play |
| C4 | Mimed Games | Mime Jr. (Paldean Fates 031/157) | the opponent chooses an attack from their in-play Pokémon |
| C5 | Skill Hack | Shiftry ex (Power Keepers 97) | copy from a Pokémon card in the opponent's hand |
| C6 | Hypnotic Reign | Malamar (Unbroken Bonds 119) | opponent reveals hand; discard a Pokémon, use its non-GX attack |
| C7 | Skill Copy | Alakazam Star (Crystal Guardians 99) | discard a Pokémon card from own hand, copy its attack |
| C8 | ESP | Misty's Psyduck (Gym Challenge 90) | 3 coins; all heads copies |
Out of scope: Ditto Transform (Fossil 3/18) and Brock's Ninetales Shapeshift (Gym Challenge 3) turn
the Pokémon into another card (type, HP, Weakness, attacks). That is an identity model, not an attack
copy; one ISSUES line. False positives in the scan (Amnesia, Disable, Hidden Power, Memory Out,
Devour Light, stat-boost Abilities) copy nothing.

## Constraints
- D110: a copy attack picks the copied attack in the attack command, before coins; resume tokens
  carry `copiedAttack`. D150: copy sources live in `rules/attack-copy.mjs`; unknown wordings fail
  closed. D151: `player.lastAttack` records the resolved attack (copied attack wins); unchanged.
- D11/D13: under server authority the client renders only from server views.
- App. 9/19: one VSTAR Power and one GX attack per player per game; single source of truth
  `player.oncePerGame` (`reduce.mjs:3135`).
- Only server-authoritative mode is verified (memory: legacy mode untested). Legacy
  `chat-buttons.js` copy paths are out of scope.
- `attackIndex` order must match between server `attackViewFor` and the client panel.

## Rulings (looked up this session)
- R1 Genome Hacking ignores the copied attack's Energy cost; mandatory effects and "does nothing"
  clauses still apply. (Compendium, Genome Hacking, 2023-09-28)
- R2 A spent VSTAR Power bars picking a VSTAR Power attack; the opponent's spent one does not.
  (Compendium, Genome Hacking 2023-12-14; Mimed Games 2024-02-01)
- R3 Through a copy attack, "the attack" used is the copy attack; name checks see "Genome Hacking" /
  "Mimed Games". (Compendium, Angelite 2025-01-09; Yoga Loop 2023-09-28; Mimed Games Follow-Up
  Kerzap 2024-02-01)
- R4 Memory Helix: the Energy must be on Mew ex. R5 Memory Helix ignores the source's own Ability
  (Slaking ex Born to Slack). R6 Memory Helix keeps the attack's name (Mega Brave lock applies).
  (PokeGym 30th Celebration FAQ, 2026-09-15)
- R7 Mimed Games: an attack whose "You can use this attack only if …" condition fails cannot be
  chosen (Lost Mine); Mimed Games cannot choose Mimed Games; with no other attack it does nothing.
  (Compendium, Mimed Games, 2024-02-01)
- R8 Hypnotic Reign does not need the Energy, but does the attack's other requirements such as
  discarding Energy. (Compendium, Unbroken Bonds FAQ 2019-04-19)
- R9 Memory Dive attacks get the holder's cost reductions (Decidueye ex Sniper's Eye). (Compendium,
  Perfect Order FAQ 2026-03-26)
- R10 Time Recall attacks get the holder's cost reductions (Drifting Balloon, 2014-05-08).
- GX analog of R2 comes from App. 19: a spent GX attack (or a gxLock) bars a copied GX attack.
Card text: corpus rows in the inventory; VSTAR marker corpus "(You can't use more than 1 VSTAR Power
in a game.)" (95/95 rows), TCGdex "(Can't use more than 1 VSTAR Power per game.)" (swsh11-131).
Togetic δ Delta Copy: TCGdex ex15-11; δ Pokémon carry " δ" in the TCGdex name (ex15-1 … ex15-40).

## Current state
- `shared/engine/rules/attack-copy.mjs` — `normalize`, `TEMPLATES`, `peelCopyPrefix` (multi-coin
  fails closed), `parseCopyAttack`, `copiedAttackFor`, `parseAttackBorrowAbility` (gate: "you still
  need the necessary energy"; phrase "can use the attacks of …").
- `shared/engine/reduce.mjs`
  - `spendGxAttack` (:801); calls at :5521 (condition failed) and :6720 (resolving); suspended-attack
    twin at :8308. `vstarUsed` set only by `useVStarGX` (:7857). `oncePerGameUsed` (:4495).
  - `stadiumExtraAttacksFor`, `toolGrantedAttacksFor`, `borrowSourceMatches`, `abilityBorrowedAttacks`
    (:1027), `attackViewFor` (:1061) = printed + merge(Stadium, Tool, borrowed).
  - `attackCostPayable` (:3450) reads the holder's energy from `zones.active` only.
  - legality `attack` (:4018): index → `attackViewFor`; gxLock + GX gate (:4097); name lock (:4118).
  - `flipAndResolveAttack` (:5132) writes `lastAttack`, flips via `flipAttackCoins`, offers the
    Glimwood / Victory Star re-flip. `copySourceCards` (:5205), `RAW_ATTACK_SOURCES`,
    `copyAttackCandidates` (:5254), `lastTurnAttackCandidates`, `offerCopiedAttack` (:5298),
    `resumeCopiedAttack` (pendingChoice `source: 'attack'`, `resumeToken.effectType: 'attackCopy'`).
  - apply `attack` (:7510): Confusion, markers, flip gate, copy `coinGate` single flip (:7600),
    `offerCopiedAttack`, `flipAndResolveAttack`. Damage call (:5841) passes
    `abilityBonusBeforeWR` into `computeAttackDamage`.
  - `discardEndOfTurnTools` (:2024) discards attached cards flagged `discardAtEndOfTurn`.
  - end-of-turn flag reset (:2983) clears `turnDamageBonuses`, `ignoreDefenderEffectsTurn`.
  - `resolveChoice` gate (:6848): only `pendingChoice.player` may answer (opponent-side choices
    already exist: Cyrus Prism Star, `trainer-steps.mjs:4357`).
- `shared/engine/rules/attack-conditions.mjs` — `USE_ONLY_IF`, `DOES_NOTHING`, `parseAttackCondition`
  (either gate), `attackConditionMet`. `rules/attack-damage-context.mjs` `buildServerAttackContext`.
- `shared/engine/rules/ability-executors.mjs:56` `powerConditionRestriction` — matches only "power
  can't be used if …".
- `shared/engine/rules/trainer-effects.mjs` parses Trainer text to steps; `effects/trainer-steps.mjs`
  runs them (pattern: `ignoreDefenderEffectsTurn` :4298).
- `shared/engine/effects/executor.mjs:1513` `cardsRevealed` event with `hand: true`.
- `shared/engine/view.mjs` `viewFor(state, playerId)` (:152); cards via `cloneCard` (printed attacks
  only). Callers `server/game/room.mjs:275/311/319/342/353`.
- Client: `card-inspector.mjs:603` `resolveLiveContext` builds `extraAttacks` from Stadiums only;
  `card-inspector-model.mjs:444` renders `mergeAttacks(card.attacks, ctx.extraAttacks)` and sends that
  index. `apply-view.js:1508` generic pendingChoice modal (works for copy prompts today).
- `shared/engine/rules/legacy-set-ids.mjs:128` `MODERN_SET_CODE_TO_TCGDEX_ID` — no `30C` row.

## Options
O1 — How the client learns the attack list. A: server projects the extras per in-play Pokémon in
the view (one source of truth; index equal by construction). B: client recomputes borrowing and
grants (second copy of five engine gatherers; drift). Pick A (D11).

O2 — Where the projection runs. A: `view.mjs` imports `reduce.mjs` (pulls the reducer into the view
module). B: `viewFor(state, playerId, { attackExtrasFor })` with an injected function exported from
`reduce.mjs`. C: move `attackViewFor` helpers out (large refactor). Pick B.

O3 — Projected shape. A: overwrite `card.attacks` (breaks printed text, changes sync hashes). B:
`self.attackExtras: { [instanceId]: Attack[] }` for the viewer's own roots. Pick B.

O4 — VSTAR Power attack detection. A: holder is a VSTAR card (wrong for copies). B: attack text
matches `/more than 1 VSTAR Power/i` (travels with the attack object). Pick B.

O5 — Once-per-game gate placement. A: separate checks in legality and each candidate filter. B: one
`onceAttackBlockReason(state, playerId, attack)` used by legality and by every candidate path. Pick B:
the gxLock / GX / VSTAR rules stay in one place.

O6 — "Only if" gates on copy candidates (R7). A: filter every copy source by the candidate's
`USE_ONLY_IF` gate, read for the copier. B: Mimed Games only. Pick A: the ruling's reason (the copied
attack's conditions must hold) is not Mime Jr.-specific. "Does nothing" gates stay unfiltered (R1).

O7 — Previous-Evolution grants (G1–G7). A: one parser `parseAttackGrant(text)` for Ability, Tool and
Trainer wordings plus one gatherer `grantedAttacksFor(state, card)` added to `attackViewFor`. B: a
gatherer per card kind. Pick A: all seven share "recipient + source cards" and differ only in scope.

O8 — Opponent-hand and own-hand copy sources (C5–C7). A: one pendingChoice listing
"<card>: <attack>" for every attack on every qualifying hand card. B: two prompts (card, then attack).
Pick A: picking a (card, attack) pair is the same decision; it reuses `offerCopiedAttack` unchanged.

O9 — Who chooses in Mimed Games. A: `copy.chooser: 'opponent'` sets `pendingChoice.player = oppId`,
resume keeps `initiatorPlayerId`. B: server picks. Pick A (the card says the opponent chooses).

O10 — ESP multi-coin gate (C8). A: `coinGateFlips: 3`; the attack case flips 3 coins; all heads →
copy offer; otherwise run the own text with those coins (`presetCoinResult`), no re-flip. B: keep
deferral. Pick A: the own-text branches (1 heads draw, 2 heads 20 damage) already run from a coin
result; passing the gate's coins keeps one flip set.

O11 — Sketch "was in play during that attack". A: `lastAttack.opponentInPlayIds` snapshot of the
defending side's in-play roots when the attack is declared. B: a per-turn in-play history. Pick A
(one field; Sketch reads the last turn only).

O12 — "used X during your last turn" locks (R3) are unparsed engine-wide (no Angelite / Yoga Loop /
Follow-Up Kerzap gate). No behavior to fix; one ISSUES line: compare against the declared attack name.

## Design
### Engine: once-per-game and candidate legality (slice 1)
- `damage-parser.mjs`: `export function isVstarPowerAttack(attack)` → `/more than 1 VSTAR Power/i`
  on `String(attack?.text ?? attack?.effect ?? '')`.
- `reduce.mjs`: `function onceAttackBlockReason(state, playerId, attack)` → string | null:
  gxLock → "Your opponent's attack stops you using GX attacks for the rest of the game."; GX spent →
  "Only one GX attack can be used per game."; VSTAR spent → "VSTAR Power already used this game.".
  Legality (:4097 block) calls it in place of the two GX checks.
- `spendVstarAttack(draft, { playerId, attacker, attack, events })` mirrors `spendGxAttack`: sets
  `oncePerGame.vstarUsed = true`, pushes `{ type: 'vstarUsed', playerId, instanceId, kind: 'vstar',
  attackName }`. Called next to both `spendGxAttack` calls; the :8308 twin gains the VSTAR twin.
- `attack-conditions.mjs`: `export function parseAttackUseGate(text, { selfName })` → the
  `USE_ONLY_IF` descriptor only (null otherwise).
- `copyAttackCandidates` and `lastTurnAttackCandidates` (gains `playerId`) skip a candidate when
  `onceAttackBlockReason(draft, playerId, attack)` is non-null, or when `parseAttackUseGate` returns a
  gate that `attackConditionMet` fails for a context built by `buildServerAttackContext` with the
  copier as attacker (`attackerView: attackViewFor(draft, attacker)`).

### View projection and client (slice 2)
- `reduce.mjs`: `export function attackExtrasFor(state, card)` → `attackViewFor(state, card, {
  isActive })` attacks minus the first `inPlayView(state, card).attacks.length` entries; `isActive`
  is `zoneId === 'active'` from `findCard`.
- `view.mjs`: `viewFor(state, playerId, { attackExtrasFor } = {})`. Owner only, function given:
  `self.attackExtras = { [instanceId]: Attack[] }` for each root in `active` and `bench` with a
  non-empty list; key omitted otherwise. `room.mjs` passes `{ attackExtrasFor }` at all five calls.
- `apply-view.js`: cache `view.self.attackExtras`; `export function getAuthoritativeAttackExtras(
  instanceId)` → `Attack[] | null` (null when the last view had no `attackExtras` key).
- `card-inspector.mjs` `resolveLiveContext`: when `getAuthoritativeAttackExtras(card.instanceId)`
  returns an array, use it as `extraAttacks` and skip `stadiumExtraAttacksFromZone`.
- `card-inspector-model.mjs`: an attack with `copiedFrom` renders a subtitle "from <copiedFrom>";
  one with `grantedBy` renders "from <grantedBy>".
- `legacy-set-ids.mjs`: `'30C': '30th'`; `buildPreferredCardId` pad test `/^(me|sv|30th)/`.

### Borrow Ability residuals (slice 3)
`parseAttackBorrowAbility` changes (all in `attack-copy.mjs`):
- Energy gate: accept `/you still need the necessary energy|you still have to pay for that attack's
  energy cost|still has to pay for that attack's energy cost|including (?:its|their) energy costs?/`.
- Phrase: `can use (?:the attacks of|any attack from) (.+?)(?: as its own)?\s*\.`.
- B1 LINK: phrase "any unown in play" → scopes `['ownInPlay','oppInPlay']`, new field
  `namePrefix: 'unown'` from `/^any (\w+) in play$/` when the word is not "pokemon".
  `borrowSourceMatches` checks `name.startsWith(namePrefix)`.
- B2 Dragon DNA: phrase "its basic pokemon" → scopes `['selfBasic']`; new field `bonusBeforeWR: 30`
  from `/that attack does (\d+) more damage to the defending pokemon/`. Gatherer `selfBasic`:
  `priorEvolutionCards(zone, card)` filtered to Basic stage. Each borrowed attack carries
  `bonusBeforeWR`. Damage call (:5866) adds `Number(effectiveAttack?.bonusBeforeWR) || 0` to
  `abilityBonusBeforeWR` when `parseInt(effectiveAttack?.damage, 10) > 0`.
- B3 Mimic: `/as long as [^.]+ is your active pokemon, it copies all of the defending pokemon's
  attacks, including their costs/` → scopes `['oppActive']`, `requiresActive: true`.
- B4 Psymimic: `/instead of [^.]+'s normal attack, you may choose 1 of your opponent's pokemon's
  attacks\. [^.]+ copies that attack including its energy costs/` → scopes `['oppInPlay']`.
- New field `powerStatus: 'rotation' | 'any' | null` from `powerConditionRestriction`.
  `abilityBorrowedAttacks` returns [] when the holder has a blocking condition (rotation: Asleep /
  Confused / Paralyzed; any: any Special Condition, via `listConditions`).
- `ability-executors.mjs` `powerConditionRestriction`: regex becomes
  `/power (?:can't be used if|stops working while) [\s\S]*?(asleep, confused, or paralyzed|affected by a special condition)/`.

### Attack grants from other cards (slice 4)
`attack-copy.mjs` `export function parseAttackGrant(text)` → null or
`{ recipients: 'ownEvolved'|'allEvolved'|'host'|'active'|'ownNamed', recipientName?: string,
from: 'priorEvolutions'|'holderAttacks', costFree?: boolean, holderMustPay?: boolean,
discardAfterAttack?: boolean }`:
- G1/G2 `/each of your evolved pokemon can use any attack from its previous evolutions/` →
  `ownEvolved`, `priorEvolutions`.
- G3 `/whenever an evolved pokemon attacks, it can use any attack from its basic pokemon card or any
  evolution card attached to it/` → `allEvolved`, `priorEvolutions`.
- G4 `/as long as (\S+) has the energy necessary to use its attack, each of your (\S+) can use \1's
  attack as its own without the energy necessary/` → `ownNamed`, `recipientName` = group 2,
  `holderAttacks`, `costFree`, `holderMustPay`.
- G5/G6 `/the pokemon this card is attached to can use any attack from its (?:previous evolutions|
  basic pokemon(?: card)? or (?:its stage 1 evolution card|any evolution card from which the pokemon
  evolved))/` → `host`, `priorEvolutions`; `discardAfterAttack` when the text matches
  `/if that pokemon attacks, discard this card at the end of the turn|discard this card at the end of
  any turn the pokemon attacks/`.
- G7 (Trainer) `/for your attack this turn, your active pokemon can use any attack from its basic
  pokemon card or any evolution card attached to it/` → `active`, `priorEvolutions`.
`reduce.mjs` `function grantedAttacksFor(state, card)`:
- Ability holders: every in-play root on both sides (`inPlayView`), abilities not suppressed
  (`isAbilitySuppressed`) and not status-blocked (`powerConditionRestriction`), parsed by
  `parseAttackGrant`. `ownEvolved` applies when holder and card share an owner; `allEvolved` always;
  `ownNamed` when same owner and `inPlayView(card).name` lowercased equals `recipientName`.
  A holder also grants to itself (Celebi-EX is Basic, so it has no previous Evolutions; harmless).
- Tools: `attachedTools(card, zone)` parsed by `parseAttackGrant` with recipients `host`; skipped
  when `isStadiumToolNegation`.
- Trainer turn flag: `player.flags.evolutionAttacksTurn === true` and the card is the owner's Active
  → recipients `active`.
- `priorEvolutions` attacks = `priorEvolutionCards(zone, card).flatMap(attacks)`;
  `holderAttacks` = holder's attacks with `attackCostPayable(state, owner, holder, attack)` true,
  mapped to `cost: []` when `costFree`. Every returned attack carries `grantedBy: <holder or card
  name>`.
- `attackViewFor` extras become merge(Stadium, Tool, borrowed, granted).
- `attackCostPayable` reads the holder's own zone (`findCard`) instead of `zones.active`, so a
  Benched holder (Honchkrow) prices its own Energy.
- Recall: `trainer-effects.mjs` pushes `{ type: 'evolutionAttacksTurn' }` for the G7 text;
  `trainer-steps.mjs` `evolutionAttacksTurn(ctx)` sets `player.flags.evolutionAttacksTurn = true`;
  the end-of-turn reset (:2986) deletes it.
- Memory Berry discard: apply `attack`, after the attacker is found, sets `discardAtEndOfTurn = true`
  on each attached Tool whose `parseAttackGrant` result has `discardAfterAttack`;
  `discardEndOfTurnTools` discards it.

### Copy attack residuals (slice 5)
New TEMPLATES in `attack-copy.mjs`:
- C1 `/^use any attack from [^.]+'s basic pokemon card or (?:stage 1 )?evolution card\.$/` →
  `{ source: 'ownEvolutionStack' }`.
- C2 `/^choose an attack on 1 of your opponent's pokemon in play that has δ on its card\. [^.]+
  copies that attack except for its energy cost\./` + PERFORMS → `{ source: 'oppInPlay', delta: true }`;
  `copyAttackCandidates` skips a source whose name lacks `δ`.
- C3 `/^if the defending pokemon attacked last turn, and [^,]+ was in play during that attack, [^.]+
  copies that attack except for its energy costs and anything else required in order to use that
  attack\.$/` → `{ source: 'oppLastAttack', auto: true, fromDefending: true, requiresInPlayDuring: true }`.
  `flipAndResolveAttack` adds `opponentInPlayIds` (instanceIds of the defending player's active and
  bench roots) to `lastAttack`. `lastTurnAttackCandidates` returns [] when `fromDefending` and
  `last.attackerInstanceId` is not the current Defending root, or `requiresInPlayDuring` and
  `last.opponentInPlayIds` lacks the copier's instanceId.
- C4 `/^your opponent chooses an attack from 1 of their pokemon in play\. use the chosen attack as
  this attack\.$/` → `{ source: 'oppInPlay', chooser: 'opponent' }`. `offerCopiedAttack` sets
  `pendingChoice.player = oppId` and prompt "Choose the attack your opponent's <copier> uses."; the
  token keeps `initiatorPlayerId: playerId`. Copy attacks stay excluded (R7 self-copy).

### Hand sources (slice 6)
- C5 `/^look at your opponent's hand and choose a basic pokemon or evolution card you find there\.
  choose 1 of that pokemon's attacks\. [^.]+ copies that attack except for its energy cost\./` +
  PERFORMS → `{ source: 'oppHand' }`.
- C6 `/^your opponent reveals their hand\. you may discard a pokemon you find there and use one of
  that pokemon's non-gx attacks as this attack\.$/` → `{ source: 'oppHand', excludeGx: true,
  optional: true, discardSource: true }`.
- C7 `/^discard a basic pokemon or evolution card from your hand\. choose 1 of that card's attacks\.
  [^.]+ copies that attack\. this attack does nothing if [^.]+ doesn't have the energy necessary to
  use that attack\./` + PERFORMS → `{ source: 'ownHand', needsEnergy: true, discardSource: true }`.
- `copySourceCards`: `oppHand` → opponent hand cards with `isPokemon`; `ownHand` → own hand
  Pokémon cards. Both join `RAW_ATTACK_SOURCES`.
- `offerCopiedAttack`: for `oppHand`, push `{ type: 'cardsRevealed', playerId: oppId, hand: true,
  cards }` before candidates. The token carries `discardSource` and `sourceZoneOwner`
  (`oppId` for oppHand, `playerId` for ownHand).
- `resumeCopiedAttack`: when a candidate is picked and `discardSource`, move that card from the owner's
  hand to their discard (`discardCardToPlayerZone`) and push `cardsDiscarded` before resolving.

### ESP multi-coin gate (slice 7)
- `peelCopyPrefix`: a whole-text template runs first for
  `/^flip 3 coins\. if exactly 1 is heads, [^.]+\. if exactly 2 are heads, [^.]+\. if all 3 are heads,
  choose 1 of the defending pokemon's attacks\. [^.]+ copies that attack except for its energy
  costs?\.$/` → `{ source: 'oppActive', coinGate: 'heads', coinGateFlips: 3, ownTextOnMiss: true }`.
  The general multi-coin prefix still fails closed.
- apply `attack`: when `copy.coinGateFlips > 1`, flip that many coins (`flipCoin`), push one
  `attackCoinFlipped` with `flips` and `headsCount`. All faces equal `coinGate` → `offerCopiedAttack`.
  Otherwise, when `ownTextOnMiss`, call `flipAndResolveAttack` with `presetCoinResult: { coin,
  headsCount, flips }`; else end the turn as today.
- `flipAndResolveAttack`: `ctx.presetCoinResult` replaces `flipAttackCoins`; no second
  `attackCoinFlipped`, no Glimwood / Victory Star offer for a preset result.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | Memory Helix, empty Bench | only Teleportation Burst; `attackExtras` key absent | [ ] |
| 2 | stale / out-of-range `attackIndex` | existing "Unknown attack." rejection | [ ] existing |
| 3 | borrowed attack shares a printed name | printed wins (`mergeAttacks`); index aligned | [ ] |
| 4 | Memory Helix Mew on the Bench | Bench Mew lists its borrowed attacks inert; Active Mew lists Bench Mew's printed attack once | [ ] |
| 5 | holder's Ability suppressed | borrowed/granted extras empty | [ ] |
| 6 | copy candidate is GX, own GX spent (or gxLock) | not offered | [ ] |
| 7 | copy candidate is VSTAR Power, own VSTAR spent | not offered (R2) | [ ] |
| 8 | copy picks VSTAR Power, VSTAR unspent | resolves; `vstarUsed` true | [ ] |
| 9 | every candidate filtered | `attackCopyNothing`; turn ends | [ ] |
| 10 | borrowed VSTAR attack after VSTAR spent | legality "VSTAR Power already used this game." | [ ] |
| 11 | VSTAR card uses own VSTAR attack twice across turns | second rejected | [ ] |
| 12 | candidate has failing "only if" gate (Lost Mine, <10 Lost Zone) | not offered (R7) | [ ] |
| 13 | candidate has failing "does nothing" gate | offered (R1) | [ ] |
| 14 | Genome Hacking copies Mega Brave | next turn Genome Hacking allowed (R3) | [ ] |
| 15 | Memory Helix Mega Brave | next turn Mega Brave via Memory Helix rejected (R6) | [ ] |
| 16 | Memory Helix + Great Swing, opp has no ex/V | allowed (R5) | [ ] |
| 17 | Genome Hacking copies {R}{R}{R} with {C}{C}{C} | offered and resolves (R1) | [ ] |
| 18 | view for opponent / spectator | no `attackExtras` key | [ ] |
| 19 | view without `attackExtras` (legacy / older room) | client uses Stadium-only extras | [ ] |
| 20 | deck code `Mew ex 30C 66` | `30th-066` | [ ] |
| 21 | LINK with Unown on both sides | lists own and opponent Unown attacks, not Unown L's own | [ ] |
| 22 | Mimic / Psymimic holder Asleep (Mimic) or Poisoned (Psymimic) | extras empty | [ ] |
| 23 | Mimic Sudowoodo on the Bench | extras empty (requiresActive) | [ ] |
| 24 | Dragon DNA borrowed 20-damage attack vs Defending | 50 before W/R | [ ] |
| 25 | Dragon DNA borrowed 0-damage attack | no bonus | [ ] |
| 26 | Memory Dive, evolved Pokémon (Stage 2) | lists Basic + Stage 1 attacks, pays own cost | [ ] |
| 27 | Memory Dive, unevolved Basic | nothing added | [ ] |
| 28 | Memory Dive on the opponent's side | own evolved Pokémon get nothing | [ ] |
| 29 | Prehistoric Memory in play, opponent's evolved Pokémon | opponent's Pokémon also list prior attacks | [ ] |
| 30 | Prehistoric Memory holder Confused | grants stop | [ ] |
| 31 | Dark Genes, Honchkrow on Bench can pay | Murkrow lists Honchkrow's attack at cost [] | [ ] |
| 32 | Dark Genes, Honchkrow cannot pay | nothing granted | [ ] |
| 33 | Memory Capsule on a Basic | nothing added | [ ] |
| 34 | Memory Berry (AQ) host attacks | Berry discarded at end of that turn | [ ] |
| 35 | Memory Berry (Platinum) host attacks | Berry stays | [ ] |
| 36 | Tool negation Stadium in play | Tool grants skipped | [ ] |
| 37 | Recall played, then next turn | this turn Active lists prior attacks; next turn not | [ ] |
| 38 | Genetic Memory with unpayable Basic attack | offered (cost-free) | [ ] |
| 39 | Delta Copy, no δ Pokémon | `attackCopyNothing` | [ ] |
| 40 | Sketch, Defending did not attack last turn | nothing copied | [ ] |
| 41 | Sketch, Smeargle came into play after that attack | nothing copied | [ ] |
| 42 | Sketch, attacker was a different Pokémon than the Defending | nothing copied | [ ] |
| 43 | Mimed Games | pendingChoice player = opponent; attacker cannot answer (`not_your_choice`) | [ ] |
| 44 | Mimed Games vs opponent whose only Pokémon is Mime Jr. | nothing (R7) | [ ] |
| 45 | Skill Hack, opp hand has no Pokémon | hand revealed; `attackCopyNothing` | [ ] |
| 46 | Hypnotic Reign, decline | hand revealed; no discard; own text only | [ ] |
| 47 | Hypnotic Reign picks an attack | that hand card moves to opponent's discard; attack resolves without Energy (R8) | [ ] |
| 48 | Skill Copy, no payable hand candidate | no discard; `attackCopyNothing` | [ ] |
| 49 | Skill Copy picks | own hand card discarded; attack resolves | [ ] |
| 50 | ESP 3 heads | copy offered | [ ] |
| 51 | ESP 1 heads / 2 heads | own text with the same coins: draw / 20 damage; one coin event | [ ] |
| 52 | ESP with Glimwood Tangle | no re-flip offer on the gate coins | [ ] |
| 53 | concurrent / repeated invocation | n/a: reducer single-threaded per room; pendingChoice guard | struck |
| 54 | dependency timeout | n/a: no I/O in these paths | struck |

## Test plan
- Unit (engine): `attack-copy.test.mjs` (parsers, candidates, rows 6–9, 12–14, 17, 38–52),
  `ability-one-offs.test.mjs` (rows 1, 3–5, 10, 15, 16, 21–25), new `vstar-attack.test.mjs`
  (rows 8, 11), new `attack-grants.test.mjs` (rows 26–37), `view.test.mjs` (row 18),
  `legacy-set-ids.test.mjs` (row 20), `card-inspector-model` test (rows 3, 19).
- Gates: `pnpm test`, `pnpm audit:oracle`, `pnpm audit:attacks`, `pnpm audit:abilities`,
  `node scripts/audit-gx-oracle.mjs`.
- Manual (user, localhost): Memory Helix lists Bench attacks with "from …"; Memory Capsule lists
  prior attacks.

## Migration / rollout
No data migration. `attackExtras` is additive; an older client ignores it. `lastAttack` gains an
additive field. Revert = revert the slice commits. Risk: slice 1 makes VSTAR Power attacks spend the
allowance; a player who pressed the legacy `useVStarGX` first is then blocked. I23 says those
buttons have no DOM element; slice 1 greps to confirm.

## Work plan
| Slice | Files | Signatures & data | Test cases: input → expected | Rulings | Green when |
|---|---|---|---|---|---|
| 1 once-per-game + gates | `rules/damage-parser.mjs`, `rules/attack-conditions.mjs`, `reduce.mjs`; tests `vstar-attack.test.mjs` (new), `attack-copy.test.mjs` | `isVstarPowerAttack(attack)`; `parseAttackUseGate(text,{selfName})`; `onceAttackBlockReason(state,playerId,attack)`; `spendVstarAttack(draft,{playerId,attacker,attack,events})`; `lastTurnAttackCandidates(draft,{copy,oppId,playerId})` | gxUsed + opp `Tackle-GX`,`Slam` → options `[Slam]`; vstarUsed + opp Star Requiem, Lost Impact → `[Lost Impact]`; pick Star Requiem → `vstarUsed === true`; VSTAR attack twice → 2nd error `VSTAR Power already used this game.`; opp attack "You can use this attack only if you have 10 or more cards in your Lost Zone." with 0 Lost Zone → not offered; "If …, this attack does nothing." → offered; all filtered → `attackCopyNothing` | R1, R2, R7, App. 19 | `pnpm test`, `audit:attacks`, gx oracle green |
| 2 view + client + import | `reduce.mjs`, `view.mjs`, `server/game/room.mjs`, `client/src/setup/netcode/apply-view.js`, `client/src/setup/rules/card-inspector.mjs`, `card-inspector-model.mjs`, `rules/legacy-set-ids.mjs`; tests beside each | `attackExtrasFor(state,card)`; `viewFor(state,playerId,{attackExtrasFor})`; `view.self.attackExtras: Record<number,Attack[]>`; `getAuthoritativeAttackExtras(instanceId)` | Mew ex Active + Slaking ex Bench → `attackExtras[mew]` = `[Great Swing]`, `copiedFrom 'Slaking ex'`; empty Bench → key absent; opponent view → key absent; model extras `[Great Swing]` → rendered `[Teleportation Burst, Great Swing]`, index 1 Great Swing, subtitle "from Slaking ex"; no key → Stadium path; `buildPreferredCardId('30C','66') === '30th-066'` | R4 | `pnpm test` green |
| 3 borrow residuals | `rules/attack-copy.mjs`, `rules/ability-executors.mjs`, `reduce.mjs`; tests `attack-copy.test.mjs`, `ability-one-offs.test.mjs` | `parseAttackBorrowAbility` adds `namePrefix`, `bonusBeforeWR`, `powerStatus`, scope `selfBasic` | parse LINK → scopes `[ownInPlay,oppInPlay]`, `namePrefix 'unown'`; Dragon DNA → `[selfBasic]`, bonus 30; Mimic → `[oppActive]`, requiresActive, powerStatus `rotation`; Psymimic → `[oppInPlay]`, `any`; Prehistoric text → `powerConditionRestriction === 'rotation'`; rows 21–25 on boards | corpus rows B1–B4 | `pnpm test`, `audit:abilities` green |
| 4 grants | `rules/attack-copy.mjs`, `reduce.mjs`, `rules/trainer-effects.mjs`, `effects/trainer-steps.mjs`; test `attack-grants.test.mjs` (new) | `parseAttackGrant(text)`; `grantedAttacksFor(state,card)`; step `evolutionAttacksTurn`; flag `player.flags.evolutionAttacksTurn` | parse G1–G7 texts → shapes in Design; rows 26–37; Memory Dive Stage 2 using Basic attack pays its cost and deals its damage | R9, R10, corpus rows G1–G7 | `pnpm test`, `audit:trainers`, `audit:abilities` green |
| 5 copy residuals | `rules/attack-copy.mjs`, `reduce.mjs`; test `attack-copy.test.mjs` | copy fields `delta`, `fromDefending`, `requiresInPlayDuring`, `chooser`; `lastAttack.opponentInPlayIds: number[]` | parse C1–C4 → shapes in Design; rows 38–44; Mimed Games answered by opponent → attacker resolves chosen attack | R3, R7, TCGdex ex15-11 | `pnpm test`, `audit:attacks` green |
| 6 hand sources | `rules/attack-copy.mjs`, `reduce.mjs`; test `attack-copy.test.mjs` | sources `oppHand`, `ownHand`; copy field `discardSource`; token `discardSource`, `sourceZoneOwner` | parse C5–C7; rows 45–49 (hand sizes and discard counts asserted) | R8 | `pnpm test` green |
| 7 ESP | `rules/attack-copy.mjs`, `reduce.mjs`; test `attack-copy.test.mjs` | copy fields `coinGateFlips`, `ownTextOnMiss`; ctx `presetCoinResult` | seeded rng 3 heads → copy prompt; 1 heads → hand +1 and one `attackCoinFlipped`; 2 heads → 20 damage; row 52 | corpus Misty's Psyduck (Gym Challenge 90) | `pnpm test`, `audit:attacks` green |
| 8 ruling pins | `attack-copy.test.mjs`, `ability-one-offs.test.mjs` | none | rows 14–17 | R1, R3, R5, R6 | `pnpm test` green |
Tests-only slice 8: a failing pin moves to Deviations with a fix pinned before building.

After the slices: ISSUES lines for O12 (last-turn name locks) and Transform/Shapeshift; close I181;
DECISIONS lines for O1–O11.

## Deviations (Builder appends here during build)
- Slice 2 (cosmetic): the owner block of a view is `you`, not `self`; the map ships as
  `view.you.attackExtras`. `getAuthoritativeAttackExtras` returns null for a card outside your
  Active/Bench, so an inspected opponent card keeps its Stadium-only list.
- Slice 3 (cosmetic): the Pokémon Power status read lives in `attack-copy.mjs` `powerStatusOf`
  (it matches "stops working while" too); `powerConditionRestriction` is unchanged because it only
  gates activated Abilities. Dragon DNA's bonus needs no base-damage check at the call site:
  `computeAttackDamage` already drops every bonus when the attack does no damage (row 25).
- Slice 4 (bug found, fixed in place): `toolGrantedAttacksFor` read every card attached to the
  root, so evolution cards (attached to their Basic in the authoritative model) handed an
  evolved Pokémon its Stage 1 attacks for free. It now skips attached Pokémon and Energy.
  Test: "an evolved Pokémon with no grant cannot use its previous Evolutions".
- Slice 4 (cosmetic): Memory Berry is flagged for discard when its Pokémon declares an attack
  (before the Confusion flip), the same point the attack is chosen.
- Slice 7 (structural, fixed in slice): design 039's "ESP already runs its 1/2-head branches"
  was wrong — the draw ran on every result and the 20 damage never. Added an exact-heads gate:
  `attack-steps.mjs` `stripGates` reads "If exactly N is/are heads, …" as `headsExactly`
  (`resolveCoinGates` keeps the step only on N heads) and `damage-parser.mjs` adds "If exactly N
  are heads, this attack does X damage" on N heads. Rows 50–52 plus a 0-heads test cover it.
