# Handoff — design 034 slice 3 (ability gates & suppression)

Written S279 (2026-09-24) at user request, mid-build. Slices 1–2 are committed; slice 3 is not
started. Read `.agent/designs/034-ability-behaviour-implementation.md` first, then this file.

## Where things are

- Branch `feature/ability-behaviour`, worktree `C:\Users\SMG26\AppData\Local\Temp\opencode\ability-behaviour-wt`
  (primary checkout stays on `main`). Commits: `56b8486a` design+ledger, `ff74b498` slice 1,
  `c0c85aad` slice 2a, `d5fea83c` slice 2b, `ed9720d4` harness.
- Baselines (Node v24.20.0, Windows): `pnpm test` → 3351 pass / **1 pre-existing fail**
  (`client/src/setup/rules/__tests__/card-inspector-model.test.mjs` "retreat greys…", fails on main
  too); `pnpm audit:oracle` → PASSED 0 failures; lint is prettier-warning noise only.
- Merge caveat: the primary checkout holds an untracked copy of the design file and uncommitted
  S278 harness edits. Delete the untracked design copy before merging (the branch tracks it); the
  S278 STATE/journal conflict is expected.
- Slice 3 spec (design work plan): *"Suppression predicate + activation block reasons + picker
  parity; play locks; status immunity; evolve permission/lock; retreat/counter locks;
  summon/first-turn/extra-attack gates"*. Green when: legality tests per gate; picker parity test;
  `pnpm test` green.

## Slice 1–2 surface you build on

- `cardAbilityText(card)` (`rules/ability-executors.mjs`) is the only text accessor (plural
  `abilities[]`, I128).
- `rules/ability-combat.mjs` (D117): readers return plain structs; it may import tool-combat, but
  **nothing may import ability-combat from tool-combat/stadium-effects** (cycle). Add the slice-3
  readers here: `isAbilitySuppressed`, `abilityActivationBlockReason`, `abilityPlayLocks`,
  `abilityStatusImmune`, `abilityEvolvePermission`, `abilityEvolveLock`, `abilityRetreatLock`,
  `abilityCounterMoveLock`, `abilitySummonRestricted`, `abilityFirstTurnAttack`,
  `abilityExtraAttack`. Reuse its private helpers (`sideInPlay`, `opponentInPlay`, `holderZone`,
  `dedupe`, `nonStackingOnce`, `inPlayConditionMet`) — they already filter to Pokémon and fail
  closed on unverifiable holder position.
- `ctx` shape used by slice-2 readers (extend additively, document in the module header):
  `{ sideCards, opponentSideCards, inPlayCards, sideActive, sideBench, opponentActive,
  opponentBench, stadium, zone, isActive, attackerIsActive, attackerIsEx, opponentHandCount,
  turnNumber }`. The `abilityActivationBlockReason` context additionally wants
  `{ used, activated, koedLastOppTurn, enteredPlayTurn, playedToBenchTurn, movedToActiveTurn,
  prizesRemaining, phase }`.
- Slice-2 wiring patterns to copy: `attackAbilityReads` (reduce.mjs, builds ctx from draft),
  `cardEffectiveHp` passes `sideCards`, `handleKnockout` adds `abilityPrizeModify`, retreat uses
  `abilityRetreatCost`, `attackCostPayable` uses `abilityAttackCostDiscount` + `applyEnergyMultiplier`.

## Corpus wordings (exact, from the S278 sweep rows; no need to re-query)

Suppression ("no Abilities"):
- Wobbuffet PHF: "As long as this Pokémon is your Active Pokémon, each Pokémon in play, in each
  player's hand, and in each player's discard pile has no Abilities (except for {P} Pokémon)."
- Alolan Muk SUM: "Each Basic Pokémon in play, in each player's hand, and in each player's discard
  pile has no Abilities."
- Giratina XY184: "Each Pokémon BREAK has no Abilities (this includes Abilities of its previous
  Evolution)."
- Glaceon-GX UPR: "As long as this Pokémon is your Active Pokémon, your opponent's Pokémon-GX and
  Pokémon-EX in play, in their hand, and in their discard pile have no Abilities, except for
  Freezing Gaze."
- Galarian Weezing RCL: "As long as this Pokémon is in the Active Spot, your opponent's Pokémon in
  play have no Abilities, except for Neutralizing Gas."
- Empoleon V BST: "As long as this Pokémon is in the Active Spot, your opponent's Basic Pokémon in
  play have no Abilities, except for Pokémon with a Rule Box (Pokémon V, Pokémon-GX, etc. have Rule
  Boxes)."
- Gorebyss FST: "Your opponent's Rapid Strike Pokémon in play have no Abilities."
- Flutter Mane TEF: "As long as this Pokémon is in the Active Spot, your opponent's Active Pokémon
  has no Abilities, except for Midnight Fluttering."
- Gastrodon SSP: "As long as this Pokémon is on your Bench, Benched Stage 2 Pokémon (both yours and
  your opponent's) have no Abilities."
- Iron Thorns ex TWM: "As long as this Pokémon is in the Active Spot, Pokémon with a Rule Box in
  play (both yours and your opponent's) have no Abilities, except for Future Pokémon. (Pokémon ex,
  Pokémon V, etc. have Rule Boxes.)"
- Klefki SVI: "As long as this Pokémon is in the Active Spot, Basic Pokémon in play (both yours and
  your opponent's) have no Abilities, except for Mischievous Lock."
- Psyduck MEP: "Pokémon in play (both yours and your opponent's) lose any Ability that requires the
  Pokémon using it to Knock Out itself." (self-KO-only suppression)
- Ancient Trait steps are exempt (D72) — check `isAncientTraitAbility` / `ancientTraitIn`
  (`rules/abilities.mjs`).

Play locks:
- Item: Gothitelle EPO 47 / Trevenant XY 55 "As long as this Pokémon is your Active Pokémon, your
  opponent can't play any Item cards from his or her hand."; Vileplume AOR 3 "Each player can't play
  any Item cards from his or her hand."; Omastar TEU 76 "As long as you have fewer Pokémon in play
  than your opponent, they can't play any Item cards from their hand."
- Supporter: Stoutland BCR 122, Kabutops TEU 78 (same Active-Spot template).
- Stadium: Ninetales PRC 21 ("Each player…"), Regice CES 45, Palkia CEL 004, Copperajah SFA 042.
- Tool: Chandelure VMAX FST 040; Jellicent ex WF 045 ("Item cards or Pokémon Tool cards");
  Honchkrow-GX UNB 109 ("Pokémon Tool, Special Energy, or Stadium cards").
- ACE SPEC: Spiritomb LTR 87 ("Each player…"), Genesect SFA 040 ("If this Pokémon has a Pokémon
  Tool attached, your opponent can't play any ACE SPEC cards from their hand.").
- Pokémon-with-Ability: Team Rocket's Arbok DRI 113 ("…any Pokémon that has an Ability from their
  hand, except for Team Rocket's Pokémon.").
- Evolve lock: Primal Kyogre/Groudon "Primal Law" ("As long as this Pokémon is in the Active Spot,
  your opponent can't play any Pokémon from their hand to evolve their Pokémon."; one data row has
  the typo "Each play can't play any Pokémon from his or her hand to evolve…").

Status immunity:
- Garganacl ex SCR 089: "This Pokémon can't be affected by any Special Conditions."
- Hoothoot PRE 077 Asleep; Pachirisu SVI 068 Paralyzed; Slowpoke MEP 086 Confused; Dachsbun SVI 099
  Burned (each "This Pokémon can't be <condition>.").
- Parse misread (report E): "can't be Confused/Paralyzed/Asleep" currently classifies as
  `statusAbility` self — should be `statusImmunityAbility`; check `rules/abilities.mjs` +
  `ability-step-plan.mjs`.

Evolve permissions (relax the turn-1 / just-played gates only):
- Scatterbug SVI 008: "This Pokémon can evolve during your first turn or the turn you play it."
- Eevee SSP 143: "As long as this Pokémon is in the Active Spot, it can evolve during your first
  turn or the turn you play it."
- Luxio POR 027: "If your opponent's Active Pokémon is a Pokémon ex, this Pokémon can evolve during
  your first turn or the turn you play it."
- Spearow 151 021: "If you go second, this Pokémon can evolve during your first turn."
- Shelmet WF 008 / Karrablast BB 009: "If you have <the other> in play, this Pokémon can evolve
  during your first turn or the turn you play it."

Retreat / counter / summon / attack:
- Omastar 151 139: "As long as this Pokémon is in the Active Spot, your opponent's Active Pokémon
  can't retreat."
- Patrat CR 070: "Damage counters on each Pokémon (both yours and your opponent's) can't be moved to
  other Pokémon."
- Palafin ex TWM 061: "Put this Pokémon into play only with the effect of Palafin's Zero to Hero
  Ability." (blocks playing it from hand)
- Meloetta ex BB 044: "If you go first, this Pokémon can use attacks during your first turn."
- Dipplin TWM 018: "If Festival Grounds is in play, this Pokémon may use an attack it has twice. If
  the first attack Knocks Out your opponent's Active Pokémon, you may attack again after your
  opponent chooses a new Active Pokémon."

## Wiring points (verified this session, line numbers drift — match by case/function)

- **useAbility legality**: `reduce.mjs` `validateLegality` → `case 'useAbility'` (~2797). Existing
  gates: used flag, `isActivatedAbility`, `stadiumAbilityBlockedFor`, `requiresKoOnOpponentTurn`,
  `requiresActiveSpot`, `isEvolvePlayedTrigger` + `enteredPlayTurn`, `isBenchPlayedTrigger` +
  `playedToBenchTurn`. Refactor into `abilityActivationBlockReason(card, ctx)` and call it here;
  add Pokémon-source suppression beside the Stadium check.
- **Picker**: `rules/collect-usable-abilities.mjs` `isUsableAbilityCard` / `filterUsableAbilities`
  (used/zone/koedLastOppTurn + actionable plan); consumed by `client/src/setup/rules/
  card-inspector-model.mjs` (~504, normalizes to singular + passes `zone`) and
  `action-affordances.mjs`. Picker parity test = same inputs → same blocked reason as the server.
- **Trainer play**: `reduce.mjs` `case 'playTrainer'` (~2755) calls `trainerPlayBlockReason`
  (`rules/trainer-play-conditions.mjs:34`). Add the opponent's `abilityPlayLocks` categories here
  (Item/Supporter/Stadium/Tool/ACE SPEC/Pokémon-with-Ability).
- **Evolve + summon**: `reduce.mjs` `case 'moveCard'` in validateLegality — hand→bench/active Basic
  gate (~2342–2360, summon restriction goes here); evolve gate (~2456–2509: `turn<=2` block,
  `enteredPlayTurn`, `flags.evolved[target]`, stage chain, `evolvesFrom`). Evolve permissions relax
  the first two; the evolve lock (Primal Law) blocks outright. `enteredPlayTurn` stamp sites:
  apply moveCard ~4929/5065, other ~6084/6087.
- **Retreat**: `reduce.mjs` `case 'retreat'` (~2619: attackerAttacked, retreatedThisTurn, statuses,
  `cannotRetreatUntilTurn`, Stadium prevention, bench, cost). `abilityRetreatLock` goes beside the
  `cannotRetreatUntilTurn` check. Legacy `canRetreat` (`rules/retreat.mjs:55`) is the client path —
  flag parity, not required.
- **Attack**: `reduce.mjs` `case 'attack'` (~2528: turn-1 block, `attackerAttacked`, statuses,
  `cannotAttackUntilTurn`, attackLock markers, cost, hand cost). `abilityFirstTurnAttack` relaxes
  the turn-1 block when it's the going-first player's turn 1.
- **Status writes**: `effects/executor.mjs` `normalizeStatusAbilityStep` (~136) + status writes
  ~1119/~1560; `effects/attack-steps.mjs` ~703 (cure), ~1254; `effects/trainer-steps.mjs` ~915,
  ~1565. Immunity must be consulted where the condition is written (find the shared write helper
  before adding a gate — one helper, not five copies).
- **Counter moves**: locate the move-damage/counter step handler (`EXTRA_STEP_HANDLERS` /
  `ATTACK_STEP_HANDLERS`; grep `moveDamage|moveCounters` in `effects/executor.mjs` and
  `effects/trainer-steps.mjs`). `abilityCounterMoveLock` gates it.
- **`movedToActiveTurn`**: no stamp exists anywhere yet. If slice 3 needs the on-promotion window,
  stamp it at bench→active move sites (retreat apply, switch steps, promotion) and delete it on
  leaving the Active Spot — mirror the `playedToBenchTurn` pattern at reduce.mjs ~4933–4935.
  Consider deferring the window itself to slice 4's on-promotion triggers and only adding the
  stamp now.

## Decisions / risks

- **Suppression ctx**: sources can sit on either side; scan `inPlayCards` (roots) plus both side
  arrays. Holder-position conditions ("in the Active Spot" / "on your Bench") need `sideActive` /
  `sideBench`; fail closed when unknown (slice-2 convention).
- **Exceptions**: "except for <AbilityName>" means the holder itself is exempt; "except for {P}
  Pokémon", "except for Pokémon with a Rule Box", "except for Future Pokémon" are target filters.
- **`abilityExtraAttack` (Dipplin)**: do **not** half-wire. The second attack is only legal after
  the first KO'd the opponent's Active, which needs the KO→promotion→attack-again turn flow (slice
  4's on-KO hooks). Ship the reader + test, leave the attack gate alone, and note it in NEXTSTEPS.
- **Psyduck's self-KO-only suppression** is a narrow filter; if it costs too much, implement the
  general suppression first and file Psyduck as an ISSUES line rather than guessing.
- Do not regress slice-2 gaps (documented in NEXTSTEPS): "for each" scaling returns 0; client
  `listAttacks` has no ability-cost options; coin gates and on-damage triggers are slice 4.

## Verification recipe

- Narrow: `node --test shared/engine/rules/__tests__/ability-combat.test.mjs
  shared/engine/__tests__/server-authoritative-parsers.test.mjs`
- Full: `pnpm test` (expect the known inspector fail only); gate: `pnpm audit:oracle` (~2 min).
- Corpus probes (gitignored scratch, copied into this worktree):
  `.agent/scratch/ability-series-audit/behave.mjs`, `behave3.mjs`, `probe.mjs --rich`,
  `rows-rich2.json` / `rows-old.json`; `wordings.mjs "Name" ...` dumps a card's text.
- Suggested sub-commits: (1) readers + matrix tests; (2) suppression + activation reasons + picker
  parity; (3) play/status/evolve/retreat/counter/summon/first-turn gates + legality tests.
