# 049: Mew ex copy attacks — Genome Hacking and Memory Helix, end to end
Status: draft
Date: 2026-09-28 · Session: S327

## Problem
Two Mew ex cards copy attacks. Mew ex (151 / PAF / SVP, sv03.5-151) has the attack Genome Hacking.
Mew ex (30th Celebration, TCGdex 30th-066/152/158) has the Ability Memory Helix. The engine already
parses and runs both (designs 031/039 for copy attacks; design 034 slice 6 for attack-borrowing
Abilities). An audit this session found four gaps:
1. A human player cannot pick a Memory Helix attack: the client attack panel never lists it.
2. Genome Hacking offers a GX attack after the player's GX attack is spent (two GX attacks in a game).
3. VSTAR Power attacks are neither gated nor spent through the `attack` command. So Genome Hacking and
   Memory Helix can use a VSTAR Power attack after the player's VSTAR Power is spent.
4. Deck import cannot resolve the set code `30C`, so 30th Celebration Mew ex is hard to get into a deck.

## Constraints
- D110: a copy attack picks the copied attack in the attack command, before coins. Resume tokens
  carry `copiedAttack`. Keep this flow.
- D150: copy-attack sources live in `rules/attack-copy.mjs`; unknown prefixes fail closed.
- D151: `player.lastAttack` records the resolved attack (the copied attack wins). Do not change it.
- D11/D13: under server authority the client renders only from server views.
- App. 9/19 (rulebook): one VSTAR Power and one GX attack per player per game. Single source of
  truth is `player.oncePerGame` (`reduce.mjs:3135`), projected to `flags` by `view.mjs`.
- Only server-authoritative mode is verified (memory: legacy mode untested). Legacy
  `chat-buttons.js` copy paths are out of scope.

## Rulings (looked up this session)
- R1 Genome Hacking ignores the copied attack's Energy cost. Mandatory effects and "does nothing"
  clauses of the copied attack still apply. (Pokémon Rulings Compendium, Genome Hacking, 2023-09-28)
- R2 Genome Hacking can copy an opponent's VSTAR Power attack even if the opponent spent theirs. If
  you spent your own VSTAR Power, you cannot pick a VSTAR Power attack; pick a valid attack.
  (Compendium, 2023-12-14)
- R3 Through Genome Hacking, "the attack" used is Genome Hacking. Name restrictions such as Angelite's
  "If 1 of your Pokémon used Angelite during your last turn, this attack can't be used" do not see
  the copied name. (Compendium, 2025-01-09 Angelite; 2023-09-28 Yoga Loop)
- R4 Memory Helix: the Energy must be on Mew ex, matching type and count. (PokeGym 30th Celebration
  FAQ, 2026-09-15)
- R5 Memory Helix is not affected by the source's own Ability: Mew ex can use Slaking ex Great Swing
  while the opponent has no Pokémon ex or V. (same FAQ)
- R6 Memory Helix keeps the attack's own name: after Mega Brave, "this Pokémon can't use Mega
  Brave" stops Mew ex next turn. (same FAQ)
- GX analog of R2 comes from App. 19, not from a ruling: a spent GX attack blocks a copied GX attack.

Card text (corpus `out/pkmn-pokemon-cards.json`, TCGdex):
- Genome Hacking {C}{C}{C}: "Choose 1 of your opponent's Active Pokémon's attacks and use it as this
  attack." (corpus Mew ex 151 #151; TCGdex sv03.5-151)
- Memory Helix: "This Pokémon can use the attacks of any of your Benched Pokémon. (You still need the
  necessary Energy to use each attack.)" Teleportation Burst {P} 30. (corpus 30th Celebration 066; TCGdex 30th-066)
- Slaking ex Born to Slack / Great Swing {C}{C} 280 "Discard an Energy from this Pokémon." (corpus Surging Sparks 227)
- Mega Lucario ex Mega Brave {F}{F} 270 "During your next turn, this Pokémon can't use Mega Brave." (corpus MEP 033)
- VSTAR Power attack marker: corpus "(You can't use more than 1 VSTAR Power in a game.)" (95/95 VSTAR
  rows); TCGdex "(Can't use more than 1 VSTAR Power per game.)" (swsh11-131 Star Requiem).

## Current state
- `shared/engine/rules/attack-copy.mjs` — `parseCopyAttack` (Genome Hacking → `{ source: 'oppActive' }`),
  `copiedAttackFor`, `parseAttackBorrowAbility` (Memory Helix → `scopes: ['ownBench']`).
- `shared/engine/reduce.mjs`
  - `abilityBorrowedAttacks` (:1027) and `attackViewFor` (:1061): printed + Stadium + Tool + borrowed,
    merged by `mergeAttacks` (dedupe by name, first wins).
  - attack legality (:4081) resolves `payload.attackIndex` against `attackViewFor(...).attacks`;
    GX gate at :4097 only; no VSTAR gate.
  - `copyAttackCandidates` (:5254), `lastTurnAttackCandidates`, `offerCopiedAttack` (:5298),
    `resumeCopiedAttack` — pendingChoice `source: 'attack'`, `resumeToken.effectType: 'attackCopy'`.
  - `spendGxAttack` (:801), called at :5521 (condition failed) and :6720 (resolving path).
    `vstarUsed` is set only by the manual `useVStarGX` command (:7846).
  - next-turn name lock: `cannotAttackAttackName` set from `effectiveAttack` (:6468), checked
    against the declared attack name at :4118.
- `shared/engine/view.mjs` — `viewFor(state, playerId)` (:152); cards go out via `cloneCard`
  (printed `attacks` only). Callers: `server/game/room.mjs:275/311/319/342/353`.
- `client/src/setup/rules/card-inspector.mjs:603` `resolveLiveContext` builds `extraAttacks` from
  Stadiums only (`stadiumExtraAttacksFromZone`); `card-inspector-model.mjs:444` renders
  `mergeAttacks(card.attacks, ctx.extraAttacks)` and its index is the `attackIndex` sent.
  Result: Tool-granted and Ability-borrowed attacks never reach the panel.
- `client/src/setup/netcode/apply-view.js:1508` — generic pendingChoice modal; the Genome Hacking
  prompt renders there as text options "`<source>: <attack>`". Works today.
- `shared/engine/rules/legacy-set-ids.mjs:128` `MODERN_SET_CODE_TO_TCGDEX_ID` — no `30C` row.

Already correct, pinned by tests in slice 4 only: R1 (Genome Hacking has no `needsEnergy`), R3 (the
lock gate reads the declared name "Genome Hacking"), R4, R5 (Born to Slack sits on Slaking, not on
Mew), R6 (borrowed attacks keep their name).

## Options
O1 — How the client learns the attack list.
- A: server projects the extra attacks (Stadium + Tool + borrowed) per in-play Pokémon in the view.
  One source of truth; index matches the server by construction. Touches the view schema.
- B: client recomputes borrowed attacks with `parseAttackBorrowAbility` and a client gatherer.
  No view change, but a second copy of `abilityBorrowedAttacks`, plus Tool grants; drift risk.
- Pick A. D11 says the client renders from server views; B duplicates engine logic.

O2 — Where the projection is computed.
- A: `view.mjs` imports `reduce.mjs`. Pulls the whole reducer into the view module.
- B: `viewFor(state, playerId, { attackExtrasFor })` takes an injected function; `room.mjs` passes
  one exported from `reduce.mjs`. View module stays lean; tests can inject a stub.
- C: move `attackViewFor` and helpers to a new module. Large refactor (helpers are spread in reduce.mjs).
- Pick B.

O3 — Shape of the projected data.
- A: overwrite `card.attacks` with the merged list. Breaks the printed-text inspector and art labels.
- B: per-player top-level map `attackExtras: { [instanceId]: Attack[] }` for the viewer's own Active
  and Bench roots. Cards stay unchanged, so `sync-check.mjs` zone hashes are unaffected.
- Pick B. Only the owner needs it (only the owner attacks); the opponent view omits it.

O4 — Identifying a VSTAR Power attack.
- A: attack sits on a VSTAR card (`isVstarCard`). Wrong for copies: the copier is not a VSTAR card.
- B: attack text matches `/more than 1 VSTAR Power/i`. Travels with the attack object through
  `copiedAttackFor`; covers both corpus and TCGdex wordings.
- Pick B.

O5 — Whether to change `lastAttack` for R3 "used X during your last turn" wordings.
- The engine does not implement that wording (Angelite / Yoga Loop locks; grep finds no parser).
  No behavior to fix now. File one ISSUES line: when implemented, compare against the declared
  attack name (Genome Hacking), not `lastAttack.attack.name`. Out of scope here.

## Design
Engine (slice 1)
- `damage-parser.mjs`: `export function isVstarPowerAttack(attack)` → `true` when
  `String(attack?.text ?? attack?.effect ?? '')` matches `/more than 1 VSTAR Power/i`.
- `reduce.mjs` legality (next to :4097): `if (isVstarPowerAttack(attack) && oncePerGameUsed(player, 'vstar'))`
  → `{ allowed: false, reason: 'VSTAR Power already used this game.' }`.
- `reduce.mjs`: `function spendVstarAttack(draft, { playerId, attacker, attack, events })` mirrors
  `spendGxAttack`: sets `oncePerGame.vstarUsed = true`, pushes
  `{ type: 'vstarUsed', playerId, instanceId: attacker?.instanceId, kind: 'vstar', attackName }`.
  Call it at both `spendGxAttack` call sites, with the same `attack` argument.
- `copyAttackCandidates` and `lastTurnAttackCandidates`: skip an attack when
  `isGxAttack(attack) && oncePerGameUsed(draft.players[playerId], 'gx')`, or
  `isVstarPowerAttack(attack) && oncePerGameUsed(draft.players[playerId], 'vstar')`.
  `lastTurnAttackCandidates` gains a `playerId` parameter for this.
- Suspended-attack GX spend at :8308 gets the VSTAR twin for `token.effectiveAttack`.

View projection (slice 2)
- `reduce.mjs`: `export function attackExtrasFor(state, card)` → `attackViewFor(state, card).attacks`
  minus the first `inPlayView(state, card).attacks.length` entries (the merge keeps printed first).
  Bench roots use `{ isActive: false }`.
- `view.mjs`: `viewFor(state, playerId, { attackExtrasFor } = {})`. For the owner only, when
  `attackExtrasFor` is given: `self.attackExtras = { [instanceId]: Attack[] }` for each root in
  `active` and `bench` with a non-empty list. Omitted otherwise (spectator, opponent, no function).
- `room.mjs`: pass `{ attackExtrasFor }` at the five `viewFor` calls.

Client (slice 3)
- `apply-view.js`: store `view.self.attackExtras` in the last-applied-view cache (D13), with a
  getter `getAuthoritativeAttackExtras(instanceId)` → `Attack[] | null`.
- `card-inspector.mjs` `resolveLiveContext`: under server authority, when
  `getAuthoritativeAttackExtras(card.instanceId)` returns an array, use it as `extraAttacks` and skip
  `stadiumExtraAttacksFromZone`. The model already renders `mergeAttacks(card.attacks, extraAttacks)`
  and sends its index, which now equals the server index.
- Borrowed entries carry `copiedFrom` (from `copiedAttackFor`). The panel shows a subtitle
  "from <copiedFrom>" under the attack name when `copiedFrom` is set.

Deck import (slice 3)
- `legacy-set-ids.mjs`: add `'30C': '30th'` to `MODERN_SET_CODE_TO_TCGDEX_ID`. TCGdex pads 30th
  numbers to three digits (30th-066), so `buildPreferredCardId`'s pad test becomes `/^(me|sv|30th)/`.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | Memory Helix, empty Bench | only Teleportation Burst listed; `attackExtras` omitted | [ ] |
| 2 | stale / out-of-range `attackIndex` | existing "Unknown attack." rejection | [ ] existing |
| 3 | bench attack shares a name with a printed attack | printed wins (`mergeAttacks`); index still aligned | [ ] |
| 4 | Mew ex with Memory Helix on the Bench | no extras for the Bench Mew (source excludes self; Bench cannot attack) | [ ] |
| 5 | two Mew ex, one Active, one Benched | Active lists Bench Mew's printed Teleportation Burst once, not its borrowed attacks | [ ] |
| 6 | Mew ex Ability suppressed (Rule Box lock) | extras empty; panel shows printed only | [ ] |
| 7 | Genome Hacking, own GX spent, opponent Active has a GX attack | GX attack not offered | [ ] |
| 8 | Genome Hacking, own VSTAR spent, opponent has VSTAR Power attack | not offered (R2) | [ ] |
| 9 | Genome Hacking copies a VSTAR Power attack, VSTAR unspent | resolves; `vstarUsed` becomes true | [ ] |
| 10 | Genome Hacking, every candidate filtered out | `attackCopyNothing`; turn ends (existing path) | [ ] |
| 11 | Memory Helix borrows a VSTAR Power attack after VSTAR spent | attack rejected "VSTAR Power already used this game." | [ ] |
| 12 | a VSTAR card attacks with its own VSTAR Power attack | now spends `vstarUsed`; a second VSTAR attack is rejected | [ ] |
| 13 | Genome Hacking copies Mega Brave | next turn Genome Hacking is allowed (R3) | [ ] |
| 14 | Memory Helix uses Mega Brave | next turn Mega Brave via Memory Helix rejected (R6) | [ ] |
| 15 | Memory Helix + Slaking ex Great Swing, opponent has no ex/V | allowed (R5); discards an Energy from Mew ex | [ ] |
| 16 | Genome Hacking copies an attack with Energy cost Mew cannot pay | still offered and resolves (R1) | [ ] |
| 17 | view for spectator / opponent | no `attackExtras` key | [ ] |
| 18 | server view without `attackExtras` (older room, legacy mode) | client falls back to Stadium-only extras | [ ] |
| 19 | deck code `Mew ex 30C 66` | resolves to `30th-066` | [ ] |
| 20 | concurrent / repeated invocation | n/a: reducer is single-threaded per room; pendingChoice guards resume | struck |
| 21 | dependency timeout | n/a: no I/O in these paths | struck |

## Test plan
- Unit: `shared/engine/__tests__/attack-copy.test.mjs` (rows 7–10, 13, 16),
  `ability-one-offs.test.mjs` (rows 1, 4–6, 11, 14, 15), a new
  `shared/engine/__tests__/vstar-attack.test.mjs` (rows 9, 12), `shared/engine/__tests__/view.test.mjs` for row 17, `card-inspector-model` test for rows 3, 18,
  `shared/engine/rules/__tests__/legacy-set-ids.test.mjs` for row 19.
- Gates: `pnpm test`, `pnpm audit:oracle`, `pnpm audit:attacks`, `node scripts/audit-gx-oracle.mjs`.
- Manual: user checks the panel on localhost (Memory Helix lists Bench attacks, "from …" subtitle).

## Migration / rollout
n/a for data. `attackExtras` is additive; an older client ignores it. Revert = revert the slice commits.
Risk: slice 1 makes VSTAR Power attacks spend the allowance. A player who pressed the legacy VSTAR
button first (`useVStarGX`) is then blocked from the attack. I23 says those buttons have no DOM
element, so no live flow sends it; slice 1 greps to confirm before landing.

## Work plan
| Slice | Files | Signatures & data | Test cases: input → expected | Rulings | Green when |
|---|---|---|---|---|---|
| 1 engine | modify `shared/engine/rules/damage-parser.mjs`, `shared/engine/reduce.mjs`; create `shared/engine/__tests__/vstar-attack.test.mjs`; modify `attack-copy.test.mjs`, `ability-one-offs.test.mjs` | `isVstarPowerAttack(attack): boolean`; `spendVstarAttack(draft, {playerId, attacker, attack, events})`; `lastTurnAttackCandidates(draft, {copy, oppId, playerId})` | row 7: gxUsed + opp `Tackle-GX` + `Slam` → options `[Slam]`; row 8: vstarUsed + opp Star Requiem + Lost Impact → options `[Lost Impact]`; row 9: pick Star Requiem → `oncePerGame.vstarUsed === true`; row 11: vstarUsed, borrowed Star Requiem → error `VSTAR Power already used this game.`; row 12: VSTAR attack twice across turns → second rejected; row 10: all filtered → `attackCopyNothing` event | R2, App. 9/19, TCGdex swsh11-131 | `pnpm test` + `audit:attacks` + gx oracle green |
| 2 view | modify `shared/engine/reduce.mjs` (export `attackExtrasFor`), `shared/engine/view.mjs`, `server/game/room.mjs`; `shared/engine/__tests__/view.test.mjs` | `attackExtrasFor(state, card): Attack[]`; `viewFor(state, playerId, { attackExtrasFor })`; `view.self.attackExtras: Record<number, Attack[]>` | Mew ex Active + Slaking ex Bench → `attackExtras[mewId]` = `[Great Swing]` with `copiedFrom: 'Slaking ex'`; row 1 → key absent; row 17 → key absent for opponent and spectator | R4 | `pnpm test` green |
| 3 client + import | modify `client/src/setup/netcode/apply-view.js`, `client/src/setup/rules/card-inspector.mjs`, `card-inspector-model.mjs` (subtitle), `shared/engine/rules/legacy-set-ids.mjs`; tests beside each | `getAuthoritativeAttackExtras(instanceId): Attack[] \| null` | model with extras `[Great Swing]` → rendered `[Teleportation Burst, Great Swing]`, index 1 = Great Swing; row 18 → Stadium path used; row 19 → `buildPreferredCardId('30C','66') === '30th-066'` | Limitless set code 30C | `pnpm test:changed` then `pnpm test` green |
| 4 ruling pins | modify `attack-copy.test.mjs`, `ability-one-offs.test.mjs` | none | row 13: Genome Hacking → Mega Brave, next turn Genome Hacking allowed; row 14: Memory Helix Mega Brave, next turn index of Mega Brave → error `This Pokémon can't use Mega Brave during this turn.`; row 15: Born to Slack source, no opp ex → Great Swing deals 280, Mew loses 1 Energy; row 16: Genome Hacking copies {R}{R}{R} attack with only {C}{C}{C} → resolves; rows 3–6 | R1, R3, R5, R6 | `pnpm test` green |
Slice 4 adds tests only. If a test fails, the gap moves to Deviations and a fix is pinned there before building.

After the slices: ISSUES line for O5 ("used X during your last turn" locks — Angelite, Yoga Loop — are
unparsed; when built, compare against the declared attack name per R3). DECISIONS lines for O1–O4.

## Deviations (Builder appends here during build)
