# 075: Rules Compendium conformance fixes
Status: draft
Date: 2026-10-18 · Session: compendium audit follow-up (branch claude/admiring-newton-c0au64)

## Problem
A read-only audit of the engine against compendium.pokegym.net (`docs/rules-compendium-audit-2026-10-18.md`) checked
697 of 2,622 rulings and found 347 that the engine gets wrong. They come from 18 root causes. Six give wrong results in
ordinary games:
- VMAX, VSTAR, BREAK and LV.X evolution is refused.
- Optional timed Abilities act as permanent passives.
- Name-limited Abilities ("only 1 X Ability each turn") are unenforced.
- Benched Tera Pokémon block damage counters.
- Attack costs are paid before damage instead of after.
- Poison always places 1 counter.

This design fixes every finding in that report, in dependency order, with one pinned slice per root cause.

## Constraints
- Engine stays pure and DOM-free; reduce/ domain split stands (D218). Effects modules never import reduce (cycle rule) —
  cross-domain reactions go through events swept at the `applyCommand` tail (pattern: `resolveDamageCounterKnockouts`).
- Ability passive reads live in `rules/ability-combat.mjs`; `abilityActivationBlockReason` is the one activation gate (D125, D126).
- Condition writes go through `rules/special-conditions.mjs` (D45). Timed attack effects are `card.attackMarkers` (D107).
- GX/VSTAR stay per-game `player.oncePerGame` (D61). Prize entitlement settles by pendingChoice (D46). KO win-ways (D71).
- "Choose 1"/yes-no prompts reuse label-option pendingChoices, never new choice types (D199) → **no netcode change**.
- WotC wordings are rewritten at data entry to the modern wording (D202); errata follows the same seam.
- One classification contract `card-classify.mjs` (D76). Ancient Traits are not Abilities (D87).
- Every engine change ships with a test that fails without it (CLAUDE.md). Card text and rulings are looked up: each test
  names the corpus row (`out/pkmn-*-cards.json`) or the TCGdex id, and the compendium ruling id
  (`https://compendium.pokegym.net/ruling/<id>/`; category→id map in `.agent/designs/refs/075-compendium-ruling-ids.tsv`).
- Gates after engine slices: `pnpm audit:oracle`, `audit:abilities`, `audit:trainers`, `audit:attacks` (ratchets may
  only improve; a legit improvement reruns with `--update-baseline`). Full `pnpm test` when `pnpm gates` says REQUIRED.
- A test that encodes a refuted behavior is updated with the ruling id in its name — never deleted to get green.

## Current state (verified in source this session)
- **Stage strings.** `rules/evolution.mjs:327 normalizeStage` returns Basic / Stage 1 / Stage 2 / BREAK, and maps MEGA→Stage 1.
  It returns null for TCGdex's `VMAX`, `VSTAR` and `LEVEL-UP`. About 40 callers write `normalizeStage(x) || 'Basic'`, so a
  VMAX/VSTAR/LV.X card reads as **Basic** everywhere (search filters, `attack.mjs:433`, `ability-combat.mjs:1721`, `trainer-steps.mjs:111`).
  `reduce/legality.mjs:1037-1061` checks a ladder [Basic, Stage 1, Stage 2] where the evolution must sit one step above the base. VMAX/VSTAR fail with
  "not an Evolution Pokémon"; BREAK sits at index −1, so it is always refused. The client forwards the raw stage
  (`client/src/setup/netcode/card-stats.js:81`). `cards.mjs:183 NON_BASIC_STAGES` lacks LEVEL-UP.
- **Ability effects.** `abilityDamagePrevention/Reduction/Bonus` (`ability-combat.mjs:500-580`) read printed text as passives.
  Only `abilityDamageBonus` skips texts starting "once during your turn". `isActivatedAbility` (`ability-executors.mjs:378`)
  already classifies activated wordings. `card.attackMarkers` hold only while the Pokémon is Active and are cleared on retreat
  (`attack-markers.mjs:1-60`); rulings say an Ability's effect survives Bench moves, later locks and leaving play
  (ids 1507, 1506, 1651, 1801). Per-player effect stores already exist: `playLocks`, `benchTraps`, `benchAttackShieldUntilTurn`,
  and `flags.turnDamageBonuses` (cleared each turn at `turn.mjs:509`, carries `attackerBasic`).
- **Ability use bookkeeping.** `effects/ability.mjs:84-96` sets `card.abilityUsed` and `player.flags.abilitiesUsed[instanceId]`.
  Neither is cleared when a card leaves play. `turn.mjs:520-527` resets `abilityUsed` only on in-play cards.
- **Turn end.** `resolveCheckup` (`turn.mjs:334`) does these in order: deferred KOs, Checkup, Checkup abilities,
  Stadium damage, end-of-turn Special Energy, Tool discards, mandatory end-of-turn abilities. So end-of-turn effects run
  after Checkup, against the rules. Nine call sites pair `resolveCheckup` with `advanceTurn`: turn.mjs:563,597;
  attack-effect.mjs:1898-1906; choice.mjs:207,376,400,572,674; attach.mjs:360; attack.mjs:331.
  Prizes and promotion settle at the command tail (`reduce.mjs:442-444`) after the turn has already advanced, and promotion
  runs before Prizes. `stampActivePromotions` then stamps the promoted Pokémon with the new turn (Gale Thrust bug).
- **Attack costs.** `reduce/choice.mjs:216-300` and `attack-effect.mjs:347` move Energy (discard, to hand, shuffle) as soon as it
  is chosen, before `resolveAttackEffectPhase` places damage.
- **Poison/Burn.** `turn.mjs:389-392` places a fixed 10 and 20.
- **Bench counters.** `attack-damage.mjs:70-131`: the Tera, self-shield, Special Energy and team bench shields return
  before checking `countersPlaced`. Only the Transparent Walls shield checks it.
- **Stadiums.** About 12 helpers in `rules/stadium-effects.mjs` read the client singleton (`rulesState.enabled`/`getStadium()`):
  `stadiumBlocksHealing:114`, `getEffectiveBenchLimit:1254`, `getStadiumHpBonus:1615`, `getStadiumEvolutionSpeed:1755`,
  `getStadiumRetreatCost:1798`, `getStadiumAttackDamageBonus:1835`, `stadiumBlocksStatusApplication:1897`,
  `getStadiumDamageReduction:1914`, `stadiumBlocksToolEffects:1927`, `stadiumAbilityBlocked:1956`,
  `getStadiumCheckupPoisonBonus:1987`, `getStadiumAttackCostIncrease:2070`. The reducer hard-codes `BENCH_LIMIT = 5`
  (trainer-steps.mjs:63, special-energy.mjs:34, legality.mjs:760, executor/attack-steps uses).
  `parseStadiumRetreatModifier:1779` reads "{C}{C} less" as −1 and ignores "{C}{C} more".
- **Play legality.** `trainerPlayBlockReason` (`trainer-play-conditions.mjs:58-156`) checks a few cases: bench full,
  nothing to switch, discard cost, some printed conditions. The auditor's probe found 39 of 47 no-effect plays allowed.
- **Attach triggers.** `applyEnergyAttachTriggers` (`reduce/attach.mjs:106`) runs only on the manual `attachCard`.
  Effect attaches emit a `cardAttached` event without the source zone: executor.mjs:314 `attachToRoot`,
  trainer-steps.mjs:279 `attachTo`, reduce/ability.mjs:123, knockout.mjs:1089.
- **Leaving play.** `knockout.mjs:433-466`: Lost City and return-to-hand move only `c.instanceId === victim.instanceId`,
  so the Evolution cards are discarded.
- **Setup.** `setup.mjs:111-160` deals Prizes before the mulligans and caps mulligans at 10. The engine has no
  Active/Bench placement phase: placement happens after `setupGame` already set turn 1.
- **Audit artefacts.** No script generates `out/trainer-simulator-audit.json` or `out/attack-simulator-audit.{json,md}`. They
  are orphaned and wrong (they say "works" for broken cards).

## Options
**O1 Stage vocabulary.**
- A: extend `normalizeStage` with `VMAX`, `VSTAR` and `LV.X`, and add one stage-step check. Every `|| 'Basic'` caller is then correct for free.
- B: keep `normalizeStage` and add a separate `evolutionKind()`. This leaves VMAX-as-Basic in about 40 readers.
- **Pick A.** It fixes the hidden misreads, not just the refusal.

**O2 Where an activated Ability's lasting effect lives.**
- A: `attackMarkers` with a `fromAbility` flag. Markers are Active-only, cleared on retreat and per card, but Shield Star is
  side-wide and survives its Pokémon leaving play.
- B: a per-player `player.abilityEffects` list, read by the damage readers with no Ability-lock check, since rulings say
  locks placed later don't cancel the effect (ids 1569, 1801).
- C: a game-wide `state.lastingEffects`.
- **Pick B.** It matches the existing per-player stores (`playLocks`, `benchTraps`) and the view whitelist, which never ships
  it to clients.

**O3 Turn-end ordering.**
- A: reorder lines inside `resolveCheckup`. This can't pause for the Prize, promotion or end-of-turn Ability choices
  in the middle of the function.
- B: a resumable turn-end sequence, `draft.turnEnd = { step }`, advanced by `continueTurnEnd` at every command tail
  until a pendingChoice blocks or the turn advances.
- **Pick B.** It is the only shape that gets Prizes→promotion→end-of-turn→Checkup→next turn right while choices are
  pending, and it fixes the Gale Thrust stamp as a side effect (promotion happens before `advanceTurn`).

**O4 Attack costs after damage.**
- A: record the chosen cards in the resume context and move them right after damage placement.
- B: compute damage against a simulated pre-payment board. Two damage paths would drift apart.
- **Pick A.**

**O5 Poison/Burn counter counts.**
- A: a counter-count field written by `special-conditions.mjs`.
- B: new condition names. These would break every condition reader.
- **Pick A.**

**O6 Ability-lock precedence ("whichever comes into effect first", ids 1674, 1824).**
- A: stamp `lockSince` order on each lock source at the command tail, then evaluate locks in that order.
- B: only check whether the lock holder is itself locked. This handles the Path to the Peak + Empoleon V case but not mutual locks.
- **Pick A.**

**O7 No-effect plays (Meta 906, T 924/925/939/1757).**
- A: a per-step "can this step change state?" predicate over the parsed steps, plus a gating rule for first steps that put a card
  onto the Bench, and for steps the parser marks as depending on the previous one.
- B: keep adding per-card conditions (the status quo; 39 holes today).
- **Pick A.**

**O8 Stadium effects on the server.**
- A: a pure twin `fooFor(stadium, …)` for each singleton helper. The reducer calls the twin; the client wrapper delegates to it.
- B: have the reducer set the client singleton. That is impure and breaks with several rooms.
- **Pick A.**

**O9 Effect-driven attach triggers.**
- A: tag every `cardAttached` event with its source zone and run the triggers from a sweep at the command tail.
- B: call the trigger hook from every attach site. That breaks the cycle rule.
- **Pick A.**

**O10 "Prize cards taken".**
- A: a `player.prizesTaken` counter, incremented where Prizes are collected.
- B: derive it from the remaining count (today's behavior; wrong after Injection GX, id 1522).
- **Pick A.**

**O11 Rule Box (Ab213 → id 1508, BREAK is a Rule Box and pre-BW ex/LEGEND are not) vs D76/D73.**
**USER DECISION** — see Approval questions. Default if unanswered: follow the ruling.

**O12 Mulligan bonus draws after placement; Snorlax Doll at setup.**
- Both need an engine placement phase, which is the same face-down card gap as I235.
- **Out of scope**: filed as one ISSUES line (slice 25).

## Design
Shared shapes introduced (none reach the client view; `view.mjs` whitelists flags and zones):
- `player.abilityEffects: Array<{ kind: 'preventDamage'|'preventDamageAndEffects'|'reduceDamage', scope: 'pokemon'|'side',
  instanceId?: number, amount?: number, afterWR?: boolean, fromTurn: number, untilTurn: number, source: string }>`
- `player.flags.abilityNamesUsed: Record<string, true>` (rebuilt each turn with the other flags).
- `draft.turnEnd: { endingPlayerId: string, nextPlayerId: string, step: 'kos'|'endOfTurn'|'endOfTurnKos'|'checkup'|'checkupKos'|'advance', wasTiebreak: boolean, eotOffered?: number[] }`.
- `draft.extraTurnFor: string|null` (Yoga Loop), consumed by the `advance` step.
- Card fields: `poisonCounters`, `burnCounters` (via special-conditions.mjs only), `asleepFlips` (Thumping Snore), `lockSince`.
  `state.stadium.lockSince` and `draft.lockSeq` hold the lock order.
- `player.prizesTaken: number`.
- `cardAttached` events gain `from: 'hand'|'deck'|'discard'|'lostZone'|'prizes'` and `triggersApplied?: true`.

The turn-end flow after slice 7. Each `*Kos` step settles in this order: Prizes, next-turn player first; then promotions,
next-turn player first; then the on-promotion window.

`attack`/`pass` → `beginTurnEnd` → [kos] → [endOfTurn: optional end-of-turn Abilities choice (slice 8); mandatory end-of-turn
abilities; end-of-turn Special Energy; TM/Tool discards; attached-Trainer timers; then deferred "at end of turn" KOs]
→ [endOfTurnKos] → [checkup: Special Energy status immunity; conditions; Checkup abilities; between-turns Stadium damage]
→ [checkupKos] → [advance: extra turn or next player; `advanceTurn`].

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | empty: no Pokémon on Bench when the Active is KO'd | game-over check (D71) before any promotion choice; sequence ends | [ ] s7 test "no bench → loss" |
| 2 | invalid: card with unknown stage string ('Restored', '') | `normalizeStage` null → non-Basic only if NON_BASIC_STAGES lists it; evolution refused with reason | [ ] s1 |
| 3 | boundary: Poison counters 1 vs 16, Virbank stacking | 10·n (+20 Virbank) per Checkup | [ ] s6 |
| 4 | repeated: two name-limited Abilities in one turn, card replayed | second refused all turn, even after leave-play | [ ] s4 |
| 5 | dependency fail: TCGdex stage missing on an Evolution (Pokémon-GX) | inferred stage path at legality.mjs:1040 kept | [ ] s1 regression |
| 6 | partial: pendingChoice raised mid turn-end (Prizes), then the player disconnects | `draft.turnEnd` persists; the reconnect/answer resumes the same step (state, not socket) | [ ] s7 resume test |
| 7 | both Actives KO'd by recoil | next-turn player takes Prizes, then the other; next-turn player promotes first (ids 815, 818) | [ ] s7 |
| 8 | KO during Checkup on the player about to start their turn | Prizes + promotion before `advanceTurn` draw | [ ] s7 |
| 9 | Ability effect holder leaves play | `pokemon`-scope entry dropped; `side` entry (Shield Star) kept (id 1801) | [ ] s3 |
| 10 | Ability effect, then lock played later | effect stays (id 1569) | [ ] s3 |
| 11 | mutual locks enter in one command (setup, both Actives) | current-turn player's lock first (id 1825) | [ ] s16 |
| 12 | Stadium leaves play and Bench exceeds new limit | each player discards down; Stadium owner first (Sky Field/Collapsed text) | [ ] s12 |
| 13 | deferred cost cards gone before payment (KO'd attacker) | payment skips missing ids, no throw | [ ] s5 |
| 14 | extra-turn attack KO + Checkup KO | extra turn still granted after prizes/promotion | [ ] s20 |
| 15 | undo replay across a turn-end choice | commandLog replay reaches the same `turnEnd` step (deterministic, no wall clock) | [ ] s7 undo test |
| 16 | deck with zero Basic Pokémon at setup | `setup` returns error `no_basic_pokemon`; no infinite loop | [ ] s23 |
| 17 | Rainbow/Luminous off-board in typed search | not a type off-board (ids 668, 685) | [ ] s17 |

## Test plan
- One new test file per slice under `shared/engine/__tests__/` (names in each row), using the `createGameState` +
  `createCard` + `applyCommand` pattern and the `pickPrizes` helper from `attack-ko.test.mjs`.
- Every test cites its card source (corpus row or TCGdex id) and compendium ruling id in the test name or a comment.
- Existing tests that assert refuted behavior (promotion before Prizes, fixed Poison 10, bench counter immunity, …) are
  updated in the same slice with the ruling id; the slice's "Green when" lists them by grep.
- Gates per slice as listed; one manual localhost pass after slices 7–8 (turn end with a Prize + promotion + end-of-turn Ability).

## Migration / rollout
- No persisted data: game state lives in memory and in-progress games may be lost on restart (PROJECT.md). New fields are
  optional and default-safe (`?? 1`, `?? []`).
- No flag: each slice lands on `main` on its own; revert = `git revert <slice commit>`.
  The slices that change shared ordering (7, 9) are each a single commit, so a revert restores the old order whole.
- No netcode change: new prompts reuse the generic pendingChoice options/min/max shape (D199).

## Work plan — slices ≤1 session, each leaving the repo green
Row format: **Files** · **Signatures & data** · **Tests (input → expected)** · **Rulings** (compendium ids) · **Green when**.
Line numbers are as of 8b9fe9f; the builder re-locates by symbol if they drifted.

### Slice 1 — Stage vocabulary (S1)
- Files:
  - modify `shared/engine/rules/evolution.mjs` (`normalizeStage`, new `STAGE_RANK`, new `evolutionStepBlockReason`).
  - modify `shared/engine/reduce/legality.mjs:1037-1070`.
  - modify `evolution.mjs:233` (`canEvolve` uses the new check).
  - modify `cards.mjs:183` (add `levelup`, `lvx` to NON_BASIC_STAGES).
  - modify `evolved-pokemon.mjs:26`, `stadium-effects.mjs:322` and `client/src/setup/image-logic/carousel-order.mjs:18` to import `STAGE_RANK`.
  - create `__tests__/compendium-stage-vocabulary.test.mjs`.
- Signatures:
  - `normalizeStage(stage) → 'Basic'|'Stage 1'|'Stage 2'|'BREAK'|'VMAX'|'VSTAR'|'LV.X'|null`. It maps collapsed `vmax`, `vstar`, `levelup`|`lvx` and keeps `mega`→'Stage 1'.
  - `export const STAGE_RANK = { Basic:0, 'Stage 1':1, VMAX:1, VSTAR:1, 'Stage 2':2, BREAK:3, 'LV.X':3 }`.
  - `export function evolutionStepBlockReason(base, evo) → string|null`, with these rules:
    - Stage 1 needs a Basic base.
    - Stage 2 needs a Stage 1 base.
    - VMAX/VSTAR need a Basic base that is a Pokémon V (`isVCard`, card-classify.mjs). Otherwise: "<name> evolves only from a Pokémon V."
    - BREAK needs a Basic/Stage 1/Stage 2 base.
    - LV.X needs a non-LV.X base whose `cleanPokemonName` equals the LV.X name without "LV.X".
  - legality.mjs replaces its ladder check with this call and keeps its `evolvesFrom` name check.
- Tests:
  - Charizard V (Basic, subtypes V) + Charizard VMAX {stage:'VMAX', evolvesFrom:'Charizard V'} (TCGdex swsh3-20) → allowed, and `evolvedView` top is the VMAX.
  - Arceus V → Arceus VSTAR (TCGdex swsh9-123) → allowed.
  - Greninja (Stage2) → Greninja BREAK (corpus BREAKpoint 41) → allowed.
  - Electivire (Stage 1) → Electivire {stage:'LEVEL-UP'} → allowed. LV.X hand→Bench → refused, and `isBasicPokemon` is false.
  - `matchesSearch(CharizardVMAX,'basic pokémon')` → false.
  - Neo Unown V (WotC, not a Pokémon V) → Unown VSTAR refused (GP 1798).
  - Charmander → Charmeleon stays allowed.
- Rulings: 798, 795, 1168, 773, 1798.
- Green when: new file passes; `node --test shared/engine/__tests__/evolved-pokemon.test.mjs shared/engine/__tests__/cards.test.mjs`; `pnpm test` (engine); `pnpm audit:oracle`.

### Slice 2 — Damage counters are not damage on the Bench (S1)
- Files: modify `shared/engine/reduce/attack-damage.mjs:62-140`; create `__tests__/compendium-bench-counters.test.mjs`.
- Signatures: no new exports. These shields run only when `!countersPlaced`:
  - the Tera check (line 71);
  - SELF_BENCH_SHIELD;
  - `blocksSpecialEnergyBenchDamage`;
  - `benchProtected`, which also skips holders where `isAbilitySuppressed(holderView, abilitySideContext(draft, victimPlayerId))` is true;
  - `sideMarkerPrevents`/`benchMarkerPrevents` for markers that prevent damage only.

  `counterEffectShielded` (effects) stays.
- Tests:
  - Dragapult ex (corpus Twilight Masquerade 130) Phantom Dive, 6 counters onto a benched Pokémon with subtypes ['Tera','ex'] → damage 60.
  - Same with Manaphy (corpus Brilliant Stars 041, Wave Veil) on the victim's Bench → 60.
  - A 30-damage Bench snipe on the Tera Pokémon → still prevented (MATCH ids from A#164 stay).
- Rulings: 1816, 320, 901.
- Green when: new file plus `node --test shared/engine/__tests__/attack-bench-spread.test.mjs shared/engine/__tests__/attack-counter-spread.test.mjs` pass; `pnpm audit:attacks`.

### Slice 3 — Activated Abilities' timed effects (S1)
- Files:
  - create `shared/engine/rules/ability-effects.mjs`.
  - modify `ability-combat.mjs` (`abilityDamageBonus/Reduction/Prevention` skip holders where `isActivatedAbility(holder)` is true; read `ctx.abilityEffects`).
  - modify the `abilitySideContext` builder (it adds `abilityEffects` and `turnNumber`).
  - modify `effects/ability.mjs` (run the timed effect on use).
  - modify `rules/turn-damage-bonus.mjs` (POSSESSIVE_RE accepts "basic pokémon's" → `attackerBasic:true`).
  - modify `reduce/turn.mjs advanceTurn` (prune).
  - modify the `reduce.mjs` tail (drop pokemon-scope entries whose `instanceId` is not in play).
  - modify every caller of `markersPreventEffects` (grep) to also honor `preventEffects`.
  - create `__tests__/compendium-ability-timed-effects.test.mjs`.
- Signatures in `ability-effects.mjs`:
  - `parseTimedAbilityEffect(text) → {kind, scope, amount?, afterWR?}|null`. It reads three wordings:
    - "you may prevent all damage done to this … by attacks from your opponent's pokémon until the end of your opponent's next turn" → preventDamage, pokemon scope.
    - "prevent all damage from and effects of attacks from your opponent's pokémon done to this pokémon until the end of your opponent's next turn" → preventDamageAndEffects, pokemon scope.
    - "during your opponent's next turn, all of your pokémon take (\d+) less damage from attacks from your opponent's pokémon (after applying weakness and resistance)" → reduceDamage, side scope, afterWR.
  - `addAbilityEffect(player, effect, { turnNumber, holderId, source })` sets fromTurn = turn and untilTurn = turn+1.
  - `abilityEffectPrevention(effects, defenderId, turnNumber) → { preventAll, preventEffects }`.
  - `abilityEffectReduction(effects, turnNumber) → { beforeWR, afterWR }`.
  - `pruneAbilityEffects(player, turnNumber)`.
  - `dropLeftPlayEffects(player, inPlayIds:Set)`.

  Defender readers ignore these under `ignoreDefenderEffects` (Hard Bashing gets through, id 1913 family).
- Tests:
  - Espathra (corpus Paradox Rift 197), evolved last turn without using Stance → takes 50 from a 50 attack.
  - Espathra used Stance → 0 on the opponent's next turn, 50 the turn after. Moved to the Bench by Boss's Orders, then hit by a 30 Bench snipe → 0 (1913, 256).
  - Mimikyu V (corpus Brilliant Stars TG16) Dummy Doll used, then Path to the Peak (corpus CRE 148) played → still 0 (1569).
  - Zamazenta VSTAR (corpus CRZ 099) never used → takes 150.
  - Shield Star used → 150 becomes 50 on the opponent's next turn, even after Zamazenta was discarded from play (1801).
  - Ludicolo (corpus EVS 034) evolved without using the Ability → a Basic attacker deals 30.
  - Ludicolo used → 130, and a Basic benched after the use also gets +100 (1586).
  - Garchomp (corpus BRS 109) Sonic Slip unused → takes damage.
- Rulings: 1569, 1507, 1506, 1651, 1913, 256, 1801, 1586.
- Green when: new file passes; `node --test shared/engine/__tests__/combat-passives.test.mjs shared/engine/__tests__/ability-gates.test.mjs`; `pnpm audit:abilities`; `pnpm audit:oracle`.

### Slice 4 — Name-limited Abilities and leave-play reset (S1/S2)
- Files:
  - modify `rules/ability-combat.mjs abilityActivationBlockReason` (new ctx field `namesUsedThisTurn`).
  - modify `reduce/legality.mjs:1495-1510` (pass `Object.keys(player.flags.abilityNamesUsed||{})`).
  - modify `effects/ability.mjs` `markUsed`/`spendAbility` (record `abilityNamesUsed[abilityName.toLowerCase()] = true`).
  - modify `shared/engine/state.mjs` (new `clearOffBoardAbilityUse(state)`) and the `reduce.mjs` tail (call it after `clearDetachedCardMarkers`).
  - create `__tests__/compendium-ability-use-limits.test.mjs`.
- Signatures:
  - The gate regex `/you can[’']t use more than 1 (.+?) abilit(?:y|ies) each turn/`. When the captured name is in `namesUsedThisTurn`, it returns `"You can't use more than 1 <Name> Ability each turn."`.
  - `clearOffBoardAbilityUse(state)` handles cards outside active/bench: it does `delete card.abilityUsed` and `delete player.flags.abilitiesUsed[card.instanceId]`.
- Tests:
  - Two Pidgeot ex (corpus PAF 221): Quick Search on the first → the second is refused with that reason.
  - Pidgeot used, moved to hand, replayed → still refused (72, 1509).
  - Radiant Greninja (corpus ASR 046) Concealed Cards used, moved to hand, replayed the same turn → allowed (1707).
  - A Bench↔Active round trip does not reset (MATCH ids stay).
- Rulings: 72, 1687, 1509, 1707, 119, 1703.
- Green when: new file plus `node --test shared/engine/__tests__/ability-execution.test.mjs` pass; `pnpm audit:abilities`.

### Slice 5 — Attack costs paid after damage (S1)
- Files:
  - modify `reduce/choice.mjs:216-300` (attackDiscardScale, attackReturnEnergyBonus, attackOptionalCostBonus record instead of moving).
  - modify `reduce/attack-effect.mjs:335-365` (the auto "discard all" branch records) and `resolveAttackEffectPhase` (call `payDeferredAttackCosts` right after damage placement, before after-damage effect steps).
  - modify `reduce/attack-steps.mjs` (new `payDeferredAttackCosts`; the self "Discard N Energy from this Pokémon" effect step records instead of moving).
  - create `__tests__/compendium-attack-cost-order.test.mjs`.
- Signatures:
  - Resume ctx gains `deferredCostMoves: Array<{ ids:number[], destination:'discard'|'deck'|'hand', reason:string }>` and `stadiumDiscardDeferred:boolean`.
  - `payDeferredAttackCosts(draft, { playerId, ctx, activeRng, events }) → void`. It reuses `discardScalingEnergy`/`moveAttachedEnergyToHand`/the Stadium discard, and skips ids no longer attached.
  - The damage count reads `energyDiscarded = recorded ids.length`.
- Tests:
  - Raging Bolt ex (corpus TEF 123) with 3 Energy, choose all 3, vs Bastiodon (corpus PBL 062, Ancient Bulwark) → 210 (2423).
  - Mega Greninja ex Ninja Spinner (TCGdex me04-022) with 3 Energy vs Bastiodon → 200, then the {W} goes to hand (2385).
  - Greninja ex Mirage Barrage (TCGdex sv06-106) discarding Double Turbo Energy (corpus BRS 151) + 1 → 100 and 100 (2002).
  - The attacker is KO'd by Rocky Helmet before payment → no throw; cards go to the discard with the KO.
- Rulings: 2423, 2385, 2002.
- Green when: new file plus `node --test shared/engine/__tests__/attack-discard-scaling.test.mjs shared/engine/__tests__/attack-energy-discard.test.mjs shared/engine/__tests__/attack-optional-cost-bonus.test.mjs` (update asserts that expected pre-damage discard events, citing 2423); `pnpm audit:attacks`; `pnpm audit:oracle`.

### Slice 6 — Poison/Burn counter counts (S1)
- Files:
  - modify `rules/special-conditions.mjs` (`addCondition` takes `{ counters }`; new `conditionCounters`; `removeCondition` clears the field).
  - modify `rules/attack-status.mjs` (branch `counters`) and `reduce/attack-effect.mjs` (pass counters when applying statuses).
  - modify `effects/executor.mjs`/`trainer-steps.mjs` status steps (pass counters from the shared parser).
  - modify `reduce/turn.mjs:389-392`.
  - modify `rules/stadium-effects.mjs` (pure `stadiumCheckupPoisonExtraFor(stadiumCard) → number`).
  - create `__tests__/compendium-poison-counters.test.mjs`.
- Signatures:
  - `addCondition(card, condition, opts?: { counters?: number })`. Re-poisoning replaces the count (GP 850).
  - `conditionCounters(card, 'Poisoned'|'Burned') → number` (default 1 or 2).
  - `parseConditionCounters(text) → { condition, counters }|null` for "place|put (\d+) damage counters instead of 1 on (?:that|this) pokémon during pokémon checkup".
  - Checkup places `10*(poisonCounters + stadiumExtra)` and `10*burnCounters`.
- Tests:
  - Mega Dragalge ex Pernicious Poison (TCGdex me04-065) → Checkup 160, next Checkup 160 more (2373).
  - Severe Poison, then plain Poison → 10 (850).
  - Virbank City Gym (corpus PLS 126) + plain Poison → 30 (1192, 1044).
  - Burn unchanged at 20.
- Rulings: 2373, 580, 850, 1192, 1044.
- Green when: new file plus `node --test shared/engine/__tests__/stacked-conditions.test.mjs shared/engine/__tests__/attack-status-branches.test.mjs`; `pnpm audit:attacks`.

### Slice 7 — Resumable turn-end sequence (S2; prerequisite for 8, 20, 21)
- Files:
  - modify `reduce/turn.mjs`:
    - new `beginTurnEnd`, `continueTurnEnd` and `settleKnockoutQueue`;
    - `resolveCheckup` is split into `runEndOfTurnEffects` and `runPokemonCheckup` (the body keeps today's code);
    - `takeTurnCommand` and `endTurnFromEffect` use `beginTurnEnd`.
  - modify the 9 call sites listed in Current state.
  - modify `reduce/knockout.mjs`: `settlePrizeEntitlements` and `settlePromotionChoices` take `{ order: string[] }` and iterate next-turn player first.
  - modify the `reduce.mjs` tail. New order: `resolveDamageCounterKnockouts` → `settleKoEnergyMoves` → `settlePrizeEntitlements(order)` → `settlePromotionChoices(order)` → `continueTurnEnd`.
  - create `__tests__/compendium-turn-end-order.test.mjs`.
- Signatures:
  - `beginTurnEnd(draft, { endingPlayerId, events })` sets `draft.turnEnd` with step 'kos'.
  - `continueTurnEnd(draft, { rng, events })` loops through the steps in Design until `draft.pendingChoice` or the turn advances. The 'advance' step keeps takeTurnCommand's tiebreak rule via `wasTiebreak`.
  - `turnOrderFrom(draft) → [nextPlayerId, endingPlayerId]`.
- Tests:
  - p1 KOs p2's Active, p2 has 2 Bench: `prizeChoiceRequested`(p1) comes before `promotionChoiceRequested`(p2), and `turn.number` is unchanged until the promotion resolves (817, 244, 2239).
  - Hoopa (TCGdex swsh12.5-083) promoted after p1's KO: on p2's turn Assault Gate does nothing (343).
  - Mega Lopunny ex (corpus PFL 084) Gale Thrust after a KO promotion → 60, no bonus (2265).
  - Recoil KOs both Actives: p2 takes Prizes first, then p1; p2 promotes first (815, 818).
  - Hisuian Zoroark Doom Curse (TCGdex swsh11-076) on Great Tusk ex (corpus PAF 053): at the end of p2's turn Quaking Demolition's discard event precedes the KO (1944).
  - A Poison KO at Checkup → Prizes and promotion come before the next player's draw event.
  - An undo replay over a Prize choice reaches the same state hash.
- Rulings: 815, 817, 818, 2239, 244, 343, 2265, 1944.
- Green when: new file passes; update tests asserting promotion-before-prize (`grep -rln "promotionChoiceRequested" shared/engine/__tests__`), citing 817; full `pnpm test`; `pnpm audit:oracle`; `node scripts/e2e/two-player-sync-test.mjs`.

### Slice 8 — End-of-turn optional Abilities (S1)
- Files:
  - modify `rules/ability-combat.mjs abilityActivationBlockReason` (refuse end-of-turn wordings unless `ctx.endOfTurnWindow`).
  - modify `rules/ability-triggers.mjs` (new `listEndOfTurnAbilityHolders(entries, ctx)`).
  - modify the `reduce/turn.mjs` 'endOfTurn' step (offer the choice).
  - modify `reduce/choice.mjs` (new `effectType:'endOfTurnAbility'` branch: run `useAbility` with `endOfTurnWindow:true`, then re-offer the rest; an empty selection closes the window).
  - create `__tests__/compendium-end-of-turn-abilities.test.mjs`.
- Signatures:
  - End-of-turn wording: `/^once at the end of your turn|at the end of your turn \(after your attack\), you may/`.
  - Choice: `{source:'End of turn', prompt:'End of turn: use an Ability?', options: holders as {instanceId, name:'<Pokémon> — <Ability>'}, min:0, max:1, resumeToken:{effectType:'endOfTurnAbility', initiatorPlayerId}}`.
  - `draft.turnEnd.eotOffered` lists the holders already used or declined.
- Tests:
  - Togekiss (corpus OBF 085) Precious Gift in the main phase → refused "This Ability is used at the end of your turn."
  - Pass with 3 cards in hand → choice offered before Checkup; select it → hand is 8.
  - An attack KO, then the end of turn: the Prize is taken before the offer (1869).
  - The offer still comes without an attack (2135 family).
  - Radiant Venusaur (corpus PGO 004) Sunny Bloom behaves the same way (1738).
- Rulings: 2135, 1869, 1738.
- Green when: new file plus `node --test shared/engine/__tests__/ability-triggers.test.mjs shared/engine/__tests__/turn-loop.test.mjs`; `pnpm audit:abilities`.

### Slice 9 — KO check after all attack effects; defender triggers after the attack's own effects (S2)
- Files:
  - modify `reduce/attack-damage.mjs:469` (while `draft.__attackEffectPhase`, push to `draft.__pendingAttackKos` instead of `handleKnockout`).
  - modify `reduce/attack-effect.mjs`: resolve the queue at the end of `resolveAttackEffectPhase`/`finishAttackTail`; move the defender-trigger block (913-1060: Rocky Helmet, Handheld Fan, Shell Trap marker) after the attack's own effect steps.
  - create `__tests__/compendium-attack-ko-timing.test.mjs`.
- Signatures: `draft.__pendingAttackKos: Array<{victimPlayerId, victimId}>`, cleared at the tail with the other `__attack*` fields. Each entry is re-checked for lethality before `handleKnockout`.
- Tests:
  - Golurk V (corpus EVS 070) Rewind Beam KOs an evolved defender → the top Evolution card goes to hand first, then the KO and Prize (1925).
  - Oil Salvo-style picks made before damage are not redirected after a KO (2160).
  - Aqua Return (Lumineon V, TCGdex lookup by name+attack) vs Handheld Fan → the attacker is shuffled away and the Energy is not moved (2091).
  - Tapu Wilderness GX heal resolves before Shell Trap counters (587).
- Rulings: 1925, 2160, 2091, 587.
- Green when: new file plus `node --test shared/engine/__tests__/attack-ko.test.mjs shared/engine/__tests__/tool-on-ko.test.mjs`; full `pnpm test`; `pnpm audit:oracle`.

### Slice 10 — Evolution gaps (S2)
- Files:
  - modify `rules/attack-steps.mjs:1440-1447` (one evolve template family).
  - modify `effects/trainer-steps.mjs:1890 searchEvolve` (targets, chained Stage 2, bypasses the turn gates).
  - modify `rules/evolved-pokemon.mjs` (new `resetOnEvolve(host, { stadium })`), called from `reduce/attach.mjs:283` and from `searchEvolve`.
  - create `__tests__/compendium-evolution-gaps.test.mjs`.
- Signatures:
  - Step `{ type:'searchEvolve', target:'self'|'chooseOne'|'eachBenched'|'chooseUpTo', count?:number, typeFilter?:string, chainStage2?:boolean }`.
  - `resetOnEvolve` clears conditions (unless the stadium persists them) plus `cannotAttackUntilTurn`, `cannotAttackAttackName` and `cannotRetreatUntilTurn`.
- Tests:
  - These 18 TCGdex attacks each put the evolution onto the target, not into hand: sm11-1, sv08-001, sv08-007, swsh4-9, sv10-011, sm4-17, swsh7-40, swsh3-87, sm3-94, sv10-095, sv10-115, sv10.5b-038, swsh9-054, bw2-7, hgss2-32, sv03-060, sm5-13, dp5-12.
  - Super Growth chains to Stage 2.
  - An attacker locked by "can't attack during your next turn" evolves → can attack (317).
- Rulings: 1212, 342, 2054, 317.
- Green when: new file plus `node --test shared/engine/__tests__/attack-steps.test.mjs`; `pnpm audit:attacks` (update baseline: the evolve family improves).

### Slice 11 — Leaving play and Prize accounting (S2)
- Files:
  - modify `reduce/knockout.mjs:330-466` (Lost City and return-to-hand move every Pokémon card in the stack; attacker-side extra Prizes only when the base Prize count > 0).
  - modify `rules/fossil.mjs:65-87` (`noPrizeOnKo` from "can't take any Prize cards for it").
  - modify `rules/card-classify.mjs prizesForKO` (honor `noPrizeOnKo`).
  - modify `formats.mjs:88` (`prizesTakenBy(player)`; `prizesTakenFor` stays a fallback) and its 9 callers.
  - modify `knockout.mjs collectPrizeEntitlement` and `takePrizes*` (increment `player.prizesTaken`).
  - create `__tests__/compendium-leave-play-prizes.test.mjs`.
- Signatures:
  - `prizesTakenBy(player) → number`, which is `player.prizesTaken ?? prizesTakenFor(player.zones.prizes.length, player.deckFormat)`.
  - The stack predicate is `isPokemon(c)` for a victim stack member.
- Tests:
  - Lost City (corpus LOR 161) + an evolved Stage 1 KO'd → both Pokémon cards in the Lost Zone, attachments discarded (1777).
  - Rescue Scarf (corpus DRX 115) → both into hand (1151). Rescue Energy (corpus TRM 90) → both into hand (694).
  - Lillie's Poké Doll (corpus CEC 197) KO'd → 0 Prizes. KO'd by an attack that takes 1 more Prize → still 0 (336).
  - Dubwool V (corpus RCL 153) Revenge Blast after the opponent took 1 Prize and Injection-GX (corpus UNM 160) returned one → still +30 (1522).
- Rulings: 1777, 1151, 694, 336, 1522.
- Green when: new file plus `node --test shared/engine/__tests__/attack-prize-on-ko.test.mjs shared/engine/__tests__/prize-choice.test.mjs`; `pnpm audit:oracle`.

### Slice 12 — Stadium effects run on the server (S2)
- Files:
  - modify `rules/stadium-effects.mjs`: a pure twin for each of the 12 singleton helpers listed in Current state, `<name>For(stadium, …same args)`. Each impure helper keeps its signature and delegates.
  - create `rules/bench-limit.mjs` (`benchLimitFor(state, playerId)`).
  - replace each `BENCH_LIMIT` read in `effects/trainer-steps.mjs`, `effects/attack-steps.mjs`, `effects/special-energy.mjs`, `effects/executor.mjs` and `reduce/legality.mjs:760` with `benchLimitFor`.
  - fix `parseStadiumRetreatModifier` ({C} token count, "more").
  - wire the twins:
    - `cardEffectiveHp` (Training Center);
    - the attack cost path (Wondrous Labyrinth, Pokémon League HQ);
    - `computeAttackDamage` prevention (Neutralization Zone);
    - the bench counter/effect paths (Battle Cage, Sky Pillar);
    - the stadium bench trigger (Risky Ruins);
    - the `addCondition` gate and a tail recovery sweep (Festival Grounds);
    - the knockout prize count (Black Market Prism Star).
  - add a tail `settleBenchOverflow(draft)` (pendingChoice "Discard Benched Pokémon down to N", Stadium owner first).
  - add the Gravity Gemstone holder-Active delta through `rules/tool-conditions.mjs toolRetreatDeltaFor`.
  - create `__tests__/compendium-stadiums-server.test.mjs`.
- Signatures: `benchLimitFor(state, playerId) → number`:
  - default 5;
  - Sky Field 8;
  - Area Zero Underdepths 8 only while that player has a Tera Pokémon in play;
  - Collapsed Stadium 4;
  - the smallest limit wins.
- Tests:
  - Sky Field (corpus ROS 89) → Bench Pokémon 6–8 allowed (2305).
  - Collapsed Stadium (corpus BRS 137) → a 5th Bench refused; played onto 5 Benched → discard choice (2132).
  - Area Zero (corpus SCR 131) with/without Tera → 8/5 (2039).
  - Galar Mine (corpus RCL 160) → Active Retreat 1 becomes 3 (122).
  - Tower of Waters (corpus BST 138) → Rapid Strike Retreat 3 becomes 1.
  - Gravity Gemstone (corpus SCR 137) holder Active → both +1 (2082).
  - Training Center (corpus FFI 102) → Stage 1 HP +30.
  - Battle Cage (corpus PFL 085) → Phantom Dive Bench counters prevented (2412).
  - Risky Ruins (corpus MEG 127) → a benched non-{D} Basic gets 20.
  - Festival Grounds (corpus TWM 149) → a Pokémon with Energy can't be Poisoned.
  - Sky Pillar (corpus CES 144) → Bench snipe prevented.
  - Neutralization Zone (corpus SFA 060) → an ex attacker vs a non-Rule-Box defender → 0.
  - Roaring Moon ex Calamity Storm (TCGdex svp-067) discarding Neutralization Zone → 0 damage, then the Stadium is discarded (2041; needs slice 5).
  - Black Market Prism Star (corpus TEU 134) → 1 fewer Prize.
  - Wondrous Labyrinth (corpus TEU 158) → a non-{Y} attack costs +{C}.
- Rulings: 892, 2305, 2132, 2039, 122, 2082, 2412, 2041; others per the TSV (T# rows in the audit's A table).
- Green when: new file passes; `node --test shared/engine/__tests__/stadium-execution.test.mjs shared/engine/__tests__/bench-limit-search.test.mjs client/src/setup/rules/__tests__/*.test.mjs`; `pnpm audit:trainers --update-baseline` only if every moved row improves; full `pnpm test`.

### Slice 13 — Tool triggers that never fire (S2/S3)
- Files:
  - modify `reduce/turn.mjs`: the 'checkup' step adds between-turns Tool effects (Lum Berry) and the 'endOfTurn' step adds Leftovers and the Bursting Balloon discard timer; `discardEndOfTurnTools:149` skips TM discards when `stadiumBlocksToolEffectsFor(stadium)` or Tool Jammer applies.
  - modify `reduce/attack-effect.mjs` (on-damaged Tool triggers in the slice 9 defender-trigger block: Sitrus Berry, Bursting Balloon 6 counters).
  - modify `rules/tool-combat.mjs` (Eviolite also reduces the holder's self-damage).
  - create `__tests__/compendium-tool-triggers.test.mjs`.
- Signatures: `toolBetweenTurnsEffects(holder, zoneCards) → Array<{kind:'cureAll'|'heal', amount?}>` and `toolOnDamagedEffects(holder, zoneCards, attacker) → Array<{kind:'heal'|'counters', amount}>`, both in `rules/tool-combat.mjs`.
- Tests:
  - Lum Berry (corpus RS 84) on a Poisoned Active → cured between turns, then discarded (738).
  - Leftovers (corpus GE 99) → 10 healed at the end of your turn (2175).
  - Bursting Balloon (corpus BKP 97) → 60 to the attacker; discarded at the end of the opponent's turn (136).
  - Sitrus Berry (corpus UF 91) → per its printed text (1170).
  - A TM under Jamming Tower (corpus TWM 153) → not discarded at the end of turn (2006).
  - Eviolite (corpus NVI 91) → recoil reduced by 20 (995).
- Rulings: 738, 2175, 136, 1170, 2006, 995.
- Green when: new file plus `node --test shared/engine/__tests__/tool-on-ko.test.mjs shared/engine/__tests__/manual-tools.test.mjs`; `pnpm audit:trainers`.

### Slice 14 — No-effect plays are illegal (S2; S1 for the draw-5 Supporters)
- Files:
  - create `shared/engine/rules/play-effect.mjs`.
  - modify `rules/trainer-play-conditions.mjs trainerPlayBlockReason` (new param `boardFacts`; returns `'This card would have no effect.'`).
  - modify `reduce/legality.mjs` (playTrainer builds `boardFacts`) and the bot's `client/src/setup/general/e2e-options.mjs` (pass `boardFacts`).
  - modify `rules/ability-combat.mjs abilityActivationBlockReason` (same predicate over ability steps).
  - modify `rules/trainer-effects.mjs` (mark `requiresPrevious:true` on steps introduced by "if you do"/"in this way").
  - create `__tests__/compendium-no-effect-plays.test.mjs`.
- Signatures:
  - `stepCanChangeState(step, facts) → boolean`. It is defined for every step type documented in the trainer-effects.mjs header; unknown types → true.
  - `cardHasEffect(steps, facts) → boolean`, playable iff:
    - (a) some non-cost step can change state, and
    - (b) a first effect step that puts a card onto the Bench, or a step with `requiresPrevious`, can itself change state.
  - `facts = { deckCount, handCount, discardKinds:{pokemon,trainer,energy,basicEnergyByType}, benchSpace, opponentBenchCount, damagedOwn, conditionedOwn, evolvableTargets, toolTargets, publicCopiesByName }`.
- Tests:
  - Single Strike Style Mustard (corpus BST 134) with a full Bench → refused (1757).
  - Archie's Ace in the Hole (TCGdex lookup "Archie's Ace in the Hole", Primal Clash) with no {W} Pokémon in the discard → refused (939).
  - Professor Juniper (corpus BLW 101) with an empty deck → refused (924); with an empty hand and a deck → allowed.
  - Life Herb (corpus HL 90) with nothing to heal → refused (925).
  - Ultra Ball (corpus DEX 102) with an empty deck → refused.
  - Evosoda (corpus XY 116) with no evolvable target → refused (1000).
  - Repeat Ball (corpus PRC 136) when all 4 copies are public → refused (1677, 1699).
  - Pidgeot ex Quick Search with an empty deck → refused (170).
  - A "discard, then draw" Ability with an empty deck → still allowed (MATCH stays).
- Rulings: 906, 922, 924, 925, 939, 1757, 1000, 1677, 1699, 170, 2109.
- Green when: new file plus `node --test shared/engine/__tests__/trainer-execution.test.mjs scripts/lib/trainer-behaviour.test.mjs`; `pnpm audit:trainers`; `pnpm audit:abilities`.

### Slice 15 — Effect-driven attach triggers (S2)
- Files:
  - modify `effects/executor.mjs:314 attachToRoot`, `effects/trainer-steps.mjs:279 attachTo`, `reduce/attach.mjs:376`, `reduce/ability.mjs:123` and `reduce/knockout.mjs:1089` (event `from`).
  - modify `reduce/attach.mjs` (export `settleHandAttachTriggers`; manual attach marks `triggersApplied`).
  - modify the `reduce.mjs` tail (call it).
  - modify `rules/ability-triggers.mjs parseOnEnergyAttachAbilities` (opponent-side punishers).
  - modify the Stadium bench/attach trigger hooks to also fire for effect-driven hand→Bench moves and attaches.
  - create `__tests__/compendium-attach-triggers.test.mjs`.
- Signatures: `settleHandAttachTriggers(draft, events) → void`, which processes each `cardAttached` event with `from==='hand'` and no `triggersApplied` where the card is an Energy.
- Tests:
  - Miltank (corpus CIN 78) Moomoo Malt + Welder (corpus UNB 189) attaching 2 {R} → healed twice (177).
  - Gengar ex (corpus TEF 104) Gnawing Curse: the opponent attaches from hand via Welder → counters per Energy (57, 91).
  - Old Cemetery (corpus CRE 147) + Welder → 2 counters each (1644).
  - Gapejaw Bog (corpus ASR 142) + Erika's Invitation (corpus 151 160) → 2 counters (1919).
- Rulings: 92, 499, 177, 57, 91, 1644, 1919.
- Green when: new file plus `node --test shared/engine/__tests__/stadium-triggers.test.mjs shared/engine/__tests__/ability-triggers.test.mjs`; `pnpm audit:abilities`.

### Slice 16 — Ability-lock precedence, hand Abilities, Powers vs Ability locks (S2)
- Files:
  - modify `rules/ability-combat.mjs isAbilitySuppressed:1313` (ordered evaluation; Stadium lock included; "no Abilities" never targets abilities typed Poké-Power/Poké-Body/Pokémon Power).
  - modify the `reduce.mjs` tail (new `settleLockOrder(draft)` in `reduce/ability.mjs`).
  - modify `reduce/legality.mjs:1515-1530` (skip in-play/Stadium locks when `cardRef.zoneId==='hand'`; drop the separate `stadiumAbilityBlockedFor` call, which is now inside `isAbilitySuppressed`).
  - create `__tests__/compendium-ability-locks.test.mjs`.
- Signatures:
  - `settleLockOrder(draft)`. Each lock source whose own condition holds gets `lockSince = ++draft.lockSeq` if it has none; sources stamped in the same command go current-turn player first; a source whose condition fails loses `lockSince`.
  - `isAbilitySuppressed` builds `activeLocks` from the sources sorted by `lockSince`, skipping any source suppressed by an earlier active lock.
- Tests:
  - Empoleon V (corpus BST 040) Active first, then Klefki (corpus SVI 096) promoted → Klefki's lock inert, Empoleon's works (1824). Reverse order → reversed (1824).
  - Path to the Peak in play, then Empoleon V → Empoleon has no Ability, so the opponent's Basics' Abilities work.
  - Greninja-GX (corpus SM197) Elusive Master from hand under Path → allowed (1123).
  - Garbotoxin vs a Poké-Power → the Power works (134; closes I239's lock half).
- Rulings: 1674, 30, 1825, 1824, 142, 1123, 134.
- Green when: new file plus `node --test shared/engine/__tests__/ability-gates.test.mjs shared/engine/__tests__/legacy-passive-powers.test.mjs`; `pnpm audit:abilities`.

### Slice 17 — Energy typing and Energy rewrites (S2)
- Files:
  - modify `rules/energy-effects.mjs:276 energyMatchesSearchWhat` (typed filters match Basic Energy only when off-board).
  - modify `reduce/attack-steps.mjs:160,373` (typed attached-discard candidates by provision: `serverEnergyDescriptor` provides the type or any; selection counted in Energy units, so one DCE = 2).
  - modify `rules/server-energy.mjs` (in-play overrides: Spectral Breach makes Special Energy {C} with no effect; Dark Aura makes your attached Energy {D}; both respect `isAbilitySuppressed`).
  - modify `reduce/retreat.mjs` (retreat discards run `resolveSpecialEnergyDiscard`).
  - modify `rules/special-energy-parse.mjs:1207,1216` (errata timing: Double Rainbow −10 before W/R, Shield Energy −10 after W/R).
  - create `__tests__/compendium-energy-typing.test.mjs`.
- Signatures: `energyMatchesSearchWhat(card, what, { inPlay = false } = {})`. Off-board, a typed filter on a non-Basic Energy → false.
- Tests:
  - Speed {L} Energy (corpus RCL 173) in deck ∉ "{L} Energy card" search (668, 464, 1195).
  - Rainbow Energy (corpus TRR 17) attached counts for "Discard all {P} Energy" (1776, 685, 687).
  - One DCE (corpus BS 96) satisfies "discard 2 Energy" (652).
  - Dusknoir (corpus VIV 071) in play → a DCE provides {C} and an Aurora provides {C}.
  - Hydreigon (corpus NVI 79) → a {G} attached to your Pokémon pays {D}.
  - Recycle Energy (corpus N1 105) discarded for Retreat → hand (690).
  - Double Turbo Energy (corpus BRS 151) → −20 applied (control).
  - Shield Energy (corpus PRC 143) after W/R (696); Double Rainbow before W/R (718).
- Rulings: 668, 464, 1195, 1776, 685, 687, 652, 690, 696, 718.
- Green when: new file plus `node --test shared/engine/__tests__/special-energy-*.test.mjs`; `node scripts/audit-all-special-energy.mjs`; `pnpm audit:attacks`.

### Slice 18 — Damage-modifier scope (S2/S3)
- Files: modify `rules/attack-engine.mjs:100-330`, `rules/attack-markers.mjs parseMarkerSentence`, `reduce/attack-damage.mjs damageBenchedPokemon` and `reduce/attack-effect.mjs:1104` (self-damage); create `__tests__/compendium-damage-modifiers.test.mjs`.
- Signatures:
  - `abilityDamageReduction` returns `{ beforeWR, afterWR, attackerScoped:{beforeWR, afterWR} }`; `ignoreDefenderEffects` drops only the defender-scoped part.
  - Weakness applies when `defender.weakness || markerType`; with no printed Weakness the multiplier is ×2.
  - The Bench path applies attacker outgoing modifiers and turn bonuses whose text doesn't say "Active".
  - Jet Shoot's after-W/R increase needs damage > 0 after W/R.
  - Self-damage applies the attacker's own W/R.
  - Double Thread's errata'd W/R applies to its Bench targets.
- Tests:
  - Oranguru Now You're in My Power (TCGdex sv08-156) on a Pokémon with no printed Weakness, then a 50 {C} attack → 100 (2057).
  - Spiritomb Ticking Terror (TCGdex swsh9-089) parses.
  - Salamence Shred (TCGdex dv1-8) vs Garbodor (corpus CRE 057) Gloomy Garbage → 130; vs Pyroar (corpus MEG 024) Intimidating Fang → 140 (2346, 2214).
  - After Florges (corpus SVI 093) Moonblast, a 30 Bench snipe (Dark Crobat Skill Dive, TCGdex ex7-3) → 0 (1822).
  - Swanna Feather Dance (TCGdex bw1-37) + a spread attack → Bench +40 (437).
  - Talonflame Jet Shoot (TCGdex xy4-10) + a Fighting 10 vs Resistance −20 → 0 (501).
  - Golurk (corpus AOR 35) Superpower recoil applies Resistance (620, 324).
- Rulings: 2057, 2346, 2214, 1822, 437, 501, 620, 324, 719.
- Green when: new file plus `node --test shared/engine/__tests__/attack-scaling.test.mjs shared/engine/__tests__/attack-markers*.test.mjs`; `pnpm audit:attacks`; `pnpm audit:oracle`.

### Slice 19 — Retreat (S2)
- Files: modify `reduce/legality.mjs:1321` (direct retreat pays exactly), `reduce/retreat.mjs:45-92` ("no Retreat Cost" and set costs can't be increased; Field Runner) and `reduce/legality.mjs:588-598` (a set/ignored attack cost can't be increased); create `__tests__/compendium-retreat.test.mjs`.
- Signatures: `retreatPaymentBlockReason(cost, selectedEnergy) → string|null`. It refuses when the Energy units exceed the cost and one card can be removed while still paying it.
- Tests:
  - Retreat cost 1 with 3 Energy selected → refused; a DCE for cost 1 → allowed (837, 2127).
  - Rescue Board (corpus TEF 159) holder at ≤30 HP + Gravity Gemstone → 0 (1971).
  - Cinderace V (corpus SWSH015) with Energy → free retreat (122).
  - A Stadium cost increase after "ignore all Energy" → still 0 (263).
- Rulings: 837, 2127, 1971, 122, 263.
- Green when: new file plus `node --test shared/engine/__tests__/retreat-*.test.mjs`.

### Slice 20 — Attack rules, remainder (S2/S3; needs 7)
- Files: modify `reduce/attack.mjs` (Smokescreen flip before Confusion; double-attack window; copy chooser filter; Victory Star over the copy coin), `reduce/legality.mjs` attack gate ("used last turn" gate via `player.lastAttack`; only the second attack or a pass while `flags.pendingSecondAttack`), `rules/attack-steps.mjs` + `effects/attack-steps.mjs` (Yoga Loop extra turn → `draft.extraTurnFor`; Thumping Snore `asleepFlips:2`; "search for any card" min 1 for attacks without "up to"; Bail Out; switch-conditional status), `reduce/attack-effect.mjs:829` (record damage taken on the Bench too), and the slice 7 'advance' step (`extraTurnFor`); create `__tests__/compendium-attack-misc.test.mjs`.
- Tests:
  - Terrakion Cavern Tackle (TCGdex swsh12-097) used last turn → refused (1115, 2094, 1610).
  - Medicham V Yoga Loop (TCGdex swsh7-83) KO → the same player takes another turn.
  - Confused attacker vs Smokescreen (TCGdex swsh5-31): the Smokescreen flip event comes before the Confusion flip (2317, 2326).
  - Ω Barrage: an Energy attach between the two attacks → refused.
  - Snorlax (corpus LOR 143) Thumping Snore → 2 Checkup flips (1756).
  - Copy chooser omits an attack whose condition fails (1942).
  - Watch and Learn (TCGdex xy9-67) copying a W&L → copies W&L (657, 656).
  - Victory Star re-flip rewinds Assist's coin (299).
  - Captivating Tail with no switch → no status (366, 498).
  - Any-card search min 1 (347). Bail Out takes 2 (1632).
  - Cinderace VMAX (corpus RCL 036) Counter counts damage taken while Benched (384).
- Rulings: as listed.
- Green when: new file plus `node --test shared/engine/__tests__/attack-copy*.test.mjs shared/engine/__tests__/attack-coin-gates.test.mjs`; `pnpm audit:attacks`; `pnpm audit:oracle`.

### Slice 21 — Abilities, remainder (S2/S3; needs 7)
- Files: modify `reduce/knockout.mjs handleKnockout` (wire `parseOnKoAbilities` from ability-triggers.mjs: search/return to hand, Lost Out, attacker-side +1 Prize), `reduce/attach.mjs:128-150` (α Growth max 1 extra), `rules/ability-combat.mjs` (Phantump first turn; Flaming Fighter non-stacking by Ability name; Abnormal Outbreak only for the player going second; promotion trigger window closes at the next command) and the slice 7 promotion step (on-promotion Abilities, Tachyon Bits, before the winner is decided); create `__tests__/compendium-ability-misc.test.mjs`.
- Tests:
  - Primal Kyogre-EX (corpus PRC 55) α Growth offers 1 extra (19).
  - Phantump (corpus CRI 038) turn 1/2 → refused (2349).
  - Infernape (corpus UPR 23) ×2 → bonus counted once (126).
  - Abnormal Outbreak for the player going first → refused (7).
  - Lugia-EX (corpus PLS 108) Overflow → +1 Prize.
  - On-KO search/return Abilities per rulings 1990, 2308.
  - Tachyon Bits on promotion makes 2 win ways vs 1 → win (2036).
- Rulings: 19, 2349, 126, 7, 43, 1990, 2308, 2036.
- Green when: new file plus `node --test shared/engine/__tests__/ability-one-offs.test.mjs`; `pnpm audit:abilities`.

### Slice 22 — Trainer rules, remainder (S2/S3)
- Files: modify `effects/trainer-steps.mjs` (cost-discarded ids are excluded from the same card's recovery: `ctx.costPaidIds`; Cheryl heals every damaged Evolution Pokémon; Energy Search Pro one per type; Flower Shop Lady exactly 3+3 when available), `effects/executor.mjs:977` ("up to" min 1 for Trainer/Ability sources, 0 for attacks; "any card" deck search min 1), `reduce/legality.mjs:1415` (Lt. Surge's Strategy: up to 3 Supporters when played first), `reduce.mjs:274` (Will never applies to the Confusion flip), the attack cost path (Pokémon League HQ taxes 0-cost attacks) and `reduce/trainer.mjs` (Chaotic Swell discards the new Stadium); create `__tests__/compendium-trainer-misc.test.mjs`.
- Tests:
  - Superior Energy Retrieval (corpus PLF 103) / Junk Arm (corpus TM 87) / Dowsing Machine (corpus PLS 128) never offer the just-discarded cards (1179, 1056, 981).
  - Lt. Surge's Strategy (corpus UNB 178) → 2nd and 3rd Supporters allowed (1071).
  - Cheryl (corpus BST 123) → all damaged Evolution Pokémon healed (1518).
  - Energy Search Pro (corpus SSP 176) → one of each type (2063).
  - Flower Shop Lady (corpus UD 74) → 3+3 (1011).
  - Will (corpus CEC 208) doesn't control the Confusion flip (1202).
  - Pokémon League HQ (corpus OBF 192) → a 0-cost Basic attack needs {C} (2001).
  - Chaotic Swell (corpus CEC 187) → the new Stadium is discarded (965).
  - Up-to split (2301). Computer Search (corpus BS 71) min 1.
- Rulings: as listed.
- Green when: new file plus `node --test shared/engine/__tests__/trainer-steps*.test.mjs shared/engine/__tests__/wotc-trainer-costs.test.mjs`; `pnpm audit:trainers`.

### Slice 23 — Setup (S2)
- Files: modify `shared/engine/setup.mjs` (deal hands; mulligan until a Basic; Prizes after the mulligans) and `reduce/turn.mjs setupCommand` (error when a deck has no Basic); create `__tests__/compendium-setup.test.mjs`.
- Signatures: `setupGame` drops the `maxMulligans` default cap. A precheck `deck.some(isBasicPokemon)` returns `{ error:'no_basic_pokemon', playerId }` before dealing.
- Tests:
  - A 60-card deck with 1 Basic over 300 seeds → every game starts with a Basic in hand, and the Prizes never hold the only Basic (821).
  - A deck with 0 Basics → error.
  - Bonus draws unchanged in count.
- Rulings: 821, 869.
- Green when: new file plus `node --test shared/engine/__tests__/setup.test.mjs`; `node scripts/e2e/opening-coin-choice-test.mjs`.

### Slice 24 — Errata (S3)
- Files: create `shared/engine/rules/errata.mjs` (a table keyed by TCGdex id → replacement attack/ability/Trainer text, applied where legacy wordings are applied at data entry, D202); create `__tests__/compendium-errata.test.mjs`.
- Signatures: `applyErrata(card) → card` (pure; returns a copy with the text replaced when `card.id` is in the table).
- Tests:
  - Brick Smash (ex5-9): Weakness applies (708).
  - Ghost Head can't KO Banette (727).
  - Fainting Spell (dp7-18) KOs the attacker on heads (725).
  - PlusPower WotC: +10 before W/R, not attached (1104).
  - Feebas Ascension (ex5) flips (705).
- Rulings: 708, 727, 725, 1104, 705.
- Green when: new file passes; `pnpm audit:attacks`.

### Slice 25 — Bookkeeping (no engine behavior)
- Files:
  - delete `out/trainer-simulator-audit.json`, `out/attack-simulator-audit.json` and `out/attack-simulator-audit.md` after reading them (no generator; superseded by the `audit:trainers`/`audit:attacks` gates).
  - `.agent/ISSUES.md` lines: O12 out of scope (bonus-draw timing and Snorlax Doll placement, refs I235); ~1,900 triaged-only compendium rulings as a P3 audit follow-up; the O11 outcome.
  - `.agent/DECISIONS.md` lines for O2, O3, O6, O7 and O8.
  - `MAP.md`/area doc lines for the new modules (ability-effects, bench-limit, play-effect, errata).
- Green when: `pnpm harness:check` passes; `pnpm test`.

## Out of scope
- Mulligan bonus draws after Active placement, and Snorlax Doll at setup (needs a placement phase; I235).
- Team Battle rulings.
- The ~1,900 card-specific rulings the audit only triaged (a follow-up audit, filed in slice 25).
- Client UI for new state (an "Ability effect active" badge): no finding requires it.

## Approval questions
1. O11 Rule Box: follow ruling 1508 (BREAK is a Rule Box; pre-BW ex/LEGEND are not) and amend D76, or keep D76 as is?
2. Slice order: the default ships the S1 slices first (1–6), then the turn-end group (7–9), then the rest. Reorder?

## Deviations (Builder appends here during build)

---
Self-approval checklist (only when the user is unreachable):
- [ ] Every constraint traceable into the Design section
- [ ] Every edge-case row has an expected behavior (or a written strike reason)
- [ ] Interfaces fully named and typed — no hand-waving
- [ ] Slices each ≤1 session and independently green
- [ ] Every slice row is pinned: files, signatures, test cases with expected values, card rulings
      cited (corpus row / TCGdex id) — no banned words; a builder would make zero choices
- [ ] No section reads "TBD"
