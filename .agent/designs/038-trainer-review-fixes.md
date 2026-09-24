# 038: Design 035 review fixes (I138–I150)
Status: approved (user, S289: option A for all 5) — building; slice 1 done S289
Date: 2026-09-24 · Session: S288

## Problem
The S288 review of design 035 (Trainer behaviour, slices 1–12) found 13 verified defects on the
authoritative server. Two give wrong game outcomes on common cards: an attacker holding Expert
Belt / Luxurious Cape takes an extra Prize (I138), and Lucky Egg draws to 7 on any damage (I139).
Others double-apply effects (I140), leak hidden cards to the opponent and spectators (I141), or
mis-play printed text (I142–I149). The audit gate cannot see step regressions (I150). Goal: every
I138–I150 row behaves as printed, with a test that fails without the fix.

Out of scope: per-viewer event filtering in `server.js`/`room.mjs` (the architectural fix for the
leak class; recorded as a follow-up issue), legacy client (`chat-buttons.js`) parity, I136/I137
leftovers (Sky Seal Stone's Star Order activation stays in I137), UI beyond the face-down option
image in the choice picker.

## Constraints
- Server-authoritative engine (`shared/engine`) is the target; pure parsers, no DOM, RNG only via
  `activeRng` (seeded cursor), never `Math.random`.
- Events are broadcast unredacted to every socket (`server/server.js:989` `events: result.events`),
  so any card name in an event is public. PendingChoice options go only to the chooser
  (`view.mjs` redacts them for the opponent), so the chooser does see option names.
- `pnpm test` green each slice (known failure: card-inspector-model "retreat greys");
  `pnpm audit:oracle` (D108) after damage/prize changes; `pnpm audit:trainers` (D123) after parser
  changes; `--update-baseline` only for legitimate improvements.
- In-memory state only; absent fields mean "no effect" (no migration).
- One branch, one slice per commit, NEXTSTEPS ledger (CLAUDE.md high-complexity rule).

## Current state
Line numbers are on `claude/wizardly-brown-k61li3` @ eb39818.
- `rules/ability-executors.mjs:473` `parsePrizeModify(card)` → `{delta}` from `\btakes?\s+N\s+(more|fewer|less)\s+prize`.
  It does not say whose Prize count the clause changes. "that player takes / your opponent takes"
  (victim side) and the imperative "take 1 more Prize card" (holder's owner, Beast Bringer) both match.
- `rules/tool-combat.mjs:531` `toolPrizeCountAdjust` (victim side) applies every attached card's delta
  after `toolConditionMet`. `reduce.mjs:1030` (in `handleKnockout`, :947) applies every attacker
  Tool's delta the same way. It is not limited to attack KOs and ignores which side the clause is about (I138).
- `tool-combat.mjs:565` `parseToolOnDamageEffect` returns one descriptor mixing on-damage fields (`draw`,
  `damageAttacker`, `statusAttacker`, `moveEnergyOnKo from:'attacker'`) and on-KO fields
  (`drawUntil`, `searchDeckOnKo`, `discardPrizes`, `millOpponent`, `returnSelfToHand`, victim
  Energy moves). `isOnKoEffect` (:661) selects the KO set for `attachedToolOnKoEffects`. The attack
  damage site (`reduce.mjs:4190` snapshot, loop :4325/:4354) applies `drawUntil` and attacker Energy
  moves on any damage. `applyToolOnKoEffects` (:792) applies them again on a KO (I139, I140).
- `effects/trainer-steps.mjs`: `shufflePokemonIntoDeck` :1813 (Active offered, state kept: I142);
  `prizeToHand` :2047 (Peonia options carry names: I141); `lookAtFaceDownPrize` :2103 (Daisy's
  `cardsRevealed` names every Prize; Heavy/Beast Ball auto-take the first match: I141, I143);
  `opponentChoosesFromTop` :2277 (reveal event pushed again on resume: I147).
  `reduce.mjs:891` `searchDeckOnKo` emits `cardsRevealed` with names (I141).
- `effects/executor.mjs:77` `createPendingChoice` maps options to `{instanceId,name,src,type}`.
  `client/src/setup/netcode/choice-picker-request.mjs:15` renders `name`/`src` as given.
  `systemState.cardBackSrc` is the card-back image (`reveal-and-hide.js`).
- `reduce.mjs:508` `activeTargetDamage` and :619 `retaliationAttackDamage` call `computeAttackDamage`
  without `attackerTrailingPrizes`/`defenderTrailingPrizes`/`attackerPrizesRemaining` (I144). The
  main attack site (~:4120) passes all of them.
- `reduce.mjs:5880` Chaos Gym coin lives only in the `playTrainer` apply case. `attachCard` (:5247)
  attaches a Tool from hand with no coin (I145).
- `tool-combat.mjs:448` `evaluateToolKoPrevention` returns `coinFace` only when prevented.
  `reduce.mjs:4242` emits `coinFlipped` only then. `damageBenchedPokemon` (:305) passes no `flipCoin`,
  and its callers (:650 `applyAttackTargets`, ~:4549/:4568 bench spread) do not pass `activeRng` (I146).
- `rules/trainer-play-conditions.mjs:60` blanket turn-1 Supporter rule (I149). `trainer-effects.mjs:787`
  `parsePlayCondition` maps Blaine's Last Resort to `lastCardInHand` (I148).
- `scripts/lib/trainer-behaviour.mjs` `checkTrainerGate` walks the corpus only. The baseline stores
  gap tags + play condition, not steps (I150).

## Options
1. Prize-clause side (I138).
   A: `parsePrizeModify` returns `{delta, side: 'victim'|'attacker'}`: "(that player|your
   opponent) takes" → victim, imperative "take N more" → attacker. The victim loop uses `side==='victim'`,
   the attacker loop `side==='attacker'`. Tool text containing "vstar power" is excluded from the
   attacker loop until I137 adds Star Order activation.
   B: hard-code Beast Bringer by name in the attacker loop. Rejected: corpus-specific, and it leaves
   the victim loop applying Beast Bringer's +1 when the *victim* holds it at exactly 6 Prizes.
   Pick A. One parser with an explicit subject, and both loops become correct.
2. On-damage vs on-KO effects (I139, I140).
   A: each parsed Tool effect gets `phase: 'damage'|'ko'`. "is damaged by an attack … (even if …
   Knocked Out)" → damage; "is Knocked Out by damage" / "your Active Pokémon is Knocked Out" → ko.
   The damage loop runs only `phase==='damage'`; `attachedToolOnKoEffects` only `phase==='ko'`.
   B: keep the mixed descriptor and dedupe by tool id across the two loops. Rejected: hides the
   rule in bookkeeping and still draws on non-KO damage.
   Pick A.
3. Hidden information (I141).
   A: emit at the source what is public. Private looks/searches → `cardsLookedAt {count, zone}`
   (existing event, names-free). Blind picks → options flagged `faceDown: true`, which
   `createPendingChoice` strips to `{instanceId, faceDown:true}`. The client picker shows
   `systemState.cardBackSrc` for such options.
   B: per-viewer event filtering in `room.mjs`. The complete fix for the whole class, but it touches
   the netcode contract and every event producer. Deferred to a new issue.
   Pick A now (closes the four known leaks), file B.
4. Turn-1 Supporter permission (I149).
   A: `parseTrainerEffect` returns `turnOnePermission: true` for "If you go first, you may
   (use|play) this card during your first turn"; `trainerPlayBlockReason` skips the blanket rule
   for it. B: a name list. Pick A (parser rule, same shape as play conditions).
5. Audit gate blind spots (I150).
   A: the baseline stores `steps` (sorted step types). The gate fails on a baseline step type the card lost,
   and fails on a baseline key missing from the corpus unless `--update-baseline`.
   B: warn only. Pick A: a ratchet that can't see removals is not a ratchet.

## Design
Contract (stable surface):
- `parsePrizeModify(card) → { delta: number, side: 'victim'|'attacker'|null }`. `side` is `null`
  when `delta` is 0. Victim: `/\b(?:that player|your opponent|the attacking player)\s+takes\s+N\s+(more|fewer|less)\s+prize/`.
  Attacker: `/(?:^|[.,]\s*)take\s+N\s+more\s+prize/` (imperative). Existing callers that only read
  `.delta` keep working. Special-energy callers read victim side.
- `toolPrizeCountAdjust`: skip cards whose `side !== 'victim'`.
- `handleKnockout` attacker loop (reduce.mjs:1030): runs only when `byAttack`, skips `side !== 'attacker'`
  and texts matching `/vstar power/`. `defender` in its ctx = victim top view (unchanged).
- `parseToolOnDamageEffect(tool) → {…existing, phase: 'damage'|'ko'}`. Damage phase when the text has
  "damaged by an attack". Otherwise ko ("knocked out by damage", "your active pokémon is knocked
  out"). `isOnKoEffect(parsed)` becomes `parsed.phase === 'ko'`. `attachedToolOnDamageEffects`
  returns only `phase==='damage'`. The `reactiveToolEffects` snapshot and loop are unchanged otherwise.
  The KO path no longer sees Handheld Fan / Rugged Helmet / Hypnotizer (damage phase), and the
  damage loop no longer sees Lucky Egg / Amulet of Hope / Exp. Share (ko phase).
- `createPendingChoice` option mapping: `opt.faceDown ? { instanceId, faceDown: true } : {…current}`.
  Handlers pass `options.map((c) => ({ ...c, faceDown: true }))` for blind picks.
  `buildChoicePickerRequest`: `faceDown` → `name: 'Face-down card'`, `image.src: cardBackSrc`
  (injected param with `systemState.cardBackSrc` default, so the module stays testable).
- Private-look events: `{ type: 'cardsLookedAt', playerId, count, zone: 'prizes'|'deck' }`.
  `server-battle-log.mjs` already renders `cardsLookedAt` by count.
- `lookAtFaceDownPrize` (Heavy/Beast Ball): matches.length 0 → skip (the Item discards as today).
  Otherwise ask the player: `options = matches` (they are looking, so names are fine for the chooser), `min 0, max 1`.
  Resume: take the selected match, re-validated against the live Prizes. An empty selection counts as
  declining, and the Item goes to the discard pile. Emit `cardsLookedAt` on look and `cardsRevealed`
  only for the card taken (printed "reveal").
- `shufflePokemonIntoDeck`: parser adds `benchOnly: true` for "pokémon on your bench"
  (Mr. Fuji). Options = bench roots when `benchOnly`. New helper `resetLeftPlay(card)` in
  trainer-steps: `damage=0`, `clearConditions`, `clearAttackMarkers`, delete
  `cannotAttackUntilTurn`/`cannotAttackAttackName`/`cannotRetreatUntilTurn`/`discardAtEndOfTurn`,
  `attachedTo=null`. Applied to every card of the stack.
- Prize-flag helper in reduce: `prizeFlags(draft, attackerPlayerId, defenderPlayerId) →
  {attackerTrailingPrizes, defenderTrailingPrizes, attackerPrizesRemaining, defenderPrizesRemaining}`.
  Used by the main attack site, `activeTargetDamage`, `retaliationAttackDamage` (striker = attacker).
- Chaos Gym: extract `chaosGymBlocks(draft, { card, playerId, events, fromZone }) → boolean`
  (flip, event, discard on tails). Called by `playTrainer` apply and by `attachCard` apply when the card
  is a Pokémon Tool coming from hand. Returning true stops the command's apply (`break`).
- Focus Band: `evaluateToolKoPrevention` returns `coinFace` on every exit where a flip happened.
  Both sites emit `coinFlipped` whenever `coinFace` is set. `damageBenchedPokemon` takes an
  optional `activeRng` and passes `flipCoin` when present. Callers in the attack phase pass their
  `activeRng`. Without an RNG there is still no flip and no prevention (unchanged).
- `opponentChoosesFromTop`: move the `cardsRevealed` push after the `ctx.selection` branch
  (first call only).
- Blaine's Last Resort: new condition `onlyCopiesInHand` from "can't play this card if you have
  any cards in your hand other than <this name>". `trainerPlayBlockReason` gets optional
  `handNames: string[]|null`. Blocks when any hand card's name differs from the Trainer's. `null`
  skips the gate. The server passes the hand names; e2e-options passes its hand.
- `parseTrainerEffect(...).turnOnePermission` (boolean). `trainerPlayBlockReason` line 60:
  `if (isSupporterTrainer(card) && turnNumber === 1 && !parsed.turnOnePermission)` (parse moves above).
- Gate: `baselineOf` adds `steps` (sorted unique types). `checkTrainerGate` adds
  `failures.push('<key>: lost step <t>')` and a `removed` list (baseline keys absent from the corpus)
  that fails the run. The printed hint names `--update-baseline`. The baseline is regenerated once in
  slice 5.

## Edge cases & failure modes — the completeness contract; Builder ticks every row
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | Tool with no prize clause / empty text | `{delta:0, side:null}`; no loop applies it | [x] covered: shared/engine/rules/__tests__/trainer-tool-modifiers.test.mjs "parsePrizeModify: neutral on empty/malformed text (… design 038 row 1)" + side table |
| 2 | Victim holds Beast Bringer at exactly 6 Prizes | victim loop ignores it (attacker side); KO gives base Prizes | [x] covered: shared/engine/__tests__/tool-on-ko.test.mjs "the victim holding Beast Bringer at exactly 6 Prizes …" |
| 3 | Attacker holds Sky Seal Stone (VSTAR Power) | attacker loop skips it until I137 | [x] covered: shared/engine/__tests__/tool-on-ko.test.mjs "an attacker holding Sky Seal Stone takes the base Prizes …" |
| 4 | KO not caused by an attack (Poison, damage counters) | attacker-side clauses do not apply | [x] covered: shared/engine/__tests__/tool-on-ko.test.mjs "attacker-side Prize clauses need a Knock Out by the holder’s attack" (Confusion self-KO) |
| 5 | Lucky Egg holder damaged but survives | no draw | [x] covered: shared/engine/__tests__/tool-on-ko.test.mjs "Lucky Egg does nothing when its holder is damaged but survives" |
| 6 | Handheld Fan holder KO'd; attacker has 0 / 1 / 2 Energy | 0 / 1 / 1 moved, exactly once | [x] covered: shared/engine/__tests__/tool-on-ko.test.mjs "Handheld Fan on a Knocked Out holder moves at most one Energy, once" |
| 7 | Tool text with both damage and KO clauses | phase from the governing trigger sentence; test the corpus rows that match both | [x] covered: shared/engine/__tests__/tool-on-ko.test.mjs "parseToolOnDamageEffect: phase follows the governing trigger" (Time Shard, Rocky Helmet, Hypnotizer …) |
| 8 | Blind Prize pick resumes after a disconnect | ids re-validated against live Prizes; names never in options | [ ] |
| 9 | Heavy Ball: 0 / 1 / 2 matching Basics; player declines | skip + discard / choice / choice; decline → discard, Prizes unchanged | [ ] |
| 10 | Mr. Fuji with an empty Bench | `no_pokemon` skip (Active never offered) | [ ] |
| 11 | Card shuffled into deck, later drawn and benched | enters with 0 damage, no conditions, no markers | [ ] |
| 12 | Chaos Gym + Tool via attachCard, tails | Tool discarded, not attached, `trainerPlayBlocked` event | [ ] |
| 13 | Chaos Gym + Stadium / Energy attach | no flip | [ ] |
| 14 | Focus Band tails / bench snipe with and without RNG | `coinFlipped` emitted on tails; bench path flips when RNG present | [ ] |
| 15 | Replay / undo of a command with a new flip | deterministic: flips consume `activeRng` in the same order on replay | [ ] |
| 16 | Blaine's Last Resort with 2 copies / with 1 other card / unknown hand | allowed / blocked / skipped | [ ] |
| 17 | Carmine on turn 1 (going first) / on turn 2 | allowed / allowed; plain Supporter on turn 1 still blocked | [ ] |
| 18 | Gate: corpus card text edited (new key) | old key reported as removed → fail until `--update-baseline` | [ ] |

## Test plan
- Unit: `trainer-tool-modifiers.test.mjs` (side parse for the 16-row table + Beast Bringer/Sky Seal
  Stone), `tool-on-ko.test.mjs` (phase per corpus Tool; Lucky Egg non-KO; Fan KO single move;
  attacker Expert Belt/Luxurious Cape/Life Dew KO → base Prizes; Beast Bringer still +1; Poison KO),
  `trainer-steps-missing.test.mjs` (Mr. Fuji options + reset, Daisy event has no names, Peonia options
  faceDown, Heavy Ball choice/decline, Riley single reveal), `stadium-triggers.test.mjs` (Chaos Gym
  via attachCard), `trainer-play-conditions.test.mjs` (Blaine, Carmine), a new `choice-picker-request`
  case (faceDown → card back), `scripts/lib/trainer-behaviour.test.mjs` (lost step, removed key).
- Integration through `applyCommand` for every reduce-level change (the review's probes become tests).
- Regression: `pnpm test`, `pnpm audit:oracle` (slices 1, 3, 4), `pnpm audit:trainers` (slices 3, 5).
- Manual: one live SERVER_AUTHORITATIVE game with Peonia to see card backs in the picker.

## Migration / rollout
n/a: in-memory state, no schema. `scripts/trainer-behaviour-baseline.json` gains `steps` (regenerated in
slice 5; the old format is read as "no steps recorded" so slice order does not matter).
Revert = revert the slice commit.

## Work plan — slices ≤1 session, each leaving the repo green
| Slice | Delivers | Green when |
|---|---|---|
| 1 | I138 prize-clause side + byAttack gate; I139/I140 `phase` split (P1 first) | new KO/prize tests; `pnpm test`; oracle PASSED |
| 2 | I141 + I143: faceDown options (engine + picker), count-only look events, Heavy/Beast Ball choice | step tests + picker unit test; `pnpm test`; manual Peonia check |
| 3 | I142 Mr. Fuji bench-only + `resetLeftPlay`; I147 single reveal; I146 Focus Band coin events + bench RNG | step + KO tests; `pnpm test`; oracle PASSED; audit:trainers PASSED |
| 4 | I144 `prizeFlags` at all damage sites; I145 `chaosGymBlocks` shared gate | damage + Chaos Gym tests; `pnpm test`; oracle PASSED |
| 5 | I148 `onlyCopiesInHand`; I149 `turnOnePermission`; I150 gate steps/removed + baseline regen; file the per-viewer event-filter follow-up; close I138–I150 | condition + gate tests; `pnpm test`; audit:trainers PASSED |

Each slice closes its issues in ISSUES.md. After slice 1, re-check I135's closure note (its on-KO scope was wrong).

## Deviations (Builder appends here during build)
Slice 1 (S289):
- Attacker loop gate is `byAttack && wasActive && turn player === attackerPlayerId`, not `byAttack` alone:
  thorns/recoil/Confusion KOs pass `byAttack` or credit the non-attacking player, and every attacker
  clause prints "your opponent's Active … Knocked Out by damage from an attack of <holder>". Row 4 is
  tested with a Confusion self-KO (the reachable non-attack KO through `applyCommand`).
- `parsePrizeModify` returns neutral for a clause naming neither subject ("each player takes 1 more").
- KO-phase counter Tools (Vengeful Punch, Box of Disaster, Curse Powder) had the I139 bug too (counters on
  any damage). `applyToolOnKoEffects` has no attacker-counter path, so the attack damage site snapshots them
  with `attachedToolOnDamageEffects(…, {phase:'ko'})` and applies them only when that hit Knocks Out.
- `attachedToolOnDamageEffects` takes `phase` (default 'damage'); legacy `chat-buttons.js` KO search passes
  `phase:'ko'` so its Amulet of Hope path keeps working (one line, not a parity change).
- Pre-existing crash fixed in passing: the damage-site Rugged Helmet path read `attacker.zones.hand` on the
  attacking card (TypeError on every hit); it now uses the attacking player's hand.

---
Self-approval checklist (only when the user is unreachable):
- [ ] Every constraint traceable into the Design section
- [ ] Every edge-case row has an expected behavior (or a written strike reason)
- [ ] Interfaces fully named and typed — no hand-waving
- [ ] Slices each ≤1 session and independently green
- [ ] No section reads "TBD"
