# Area: reducer (shared/engine/reduce/ — one module per command domain)
<!-- Cap 60 lines. Moved out of MAP.md on 2026-11-13 (maintain sweep) to keep MAP under cap; one line per module, wording unchanged. -->
Purpose: the server-authoritative command reducer. `applyCommand` in shared/engine/reduce.mjs (the facade, 3 exports) checks shape, choice/turn gate, references and legality, then calls one `<type>Command` handler here (D218).
Owner code: shared/engine/reduce.mjs, shared/engine/reduce/
Rules: handlers get locals explicitly; cycles inside reduce/ are call-time only, never read at load (D218). Engine changes ship a failing-first test and pass `pnpm audit:oracle`.
## Modules
shared/engine/reduce/shared.mjs — cross-domain reducer helpers: `inPlayView`, `cardEffectiveHp`, `activeAttackMarkers`, `setGameEnded`/`isGameConcluded`/`isGameFrozen`, once-per-game and tiebreak reads, `rootsIn`
shared/engine/reduce/legality.mjs — `validateReferences` (stale view) + `validateLegality` (rules gate), `attackCostPayable`, `resolveAttacker`, attach/play/ability/once-per-game lock readers
shared/engine/reduce/attack.mjs — attack declaration: coins, Ninja Trick, declared/copied attack flows, `attackViewFor`/`attackExtrasFor` (granted, borrowed, Stadium/Tool attacks), GX/VSTAR spend; `attack` command
shared/engine/reduce/attack-damage.mjs — attack damage placement: bench damage/Thorns, target clauses and options, flat and Active-target damage, retaliation, `applyAttackTargets`
shared/engine/reduce/attack-steps.mjs — attack-time prompts and executor runs: search, discard/mill scaling, spread attaches, optional costs, `attackResumeContext`, `planAttackSteps`/`runAttackSteps`
shared/engine/reduce/attack-effect.mjs — `resolveAttackEffectPhase` (the whole attack effect phase) + `finishAttackTail`
shared/engine/reduce/knockout.mjs — `handleKnockout`, Tool on-KO effects, KO win settles, promotions, KO Energy moves, damage-counter KOs, Prize entitlement/choices; `takePrizes`/`takePrizesByIndex`/`promote`
shared/engine/reduce/turn.mjs — `resolveCheckup`, between-turns/end-of-turn effects, `advanceTurn`, `endTurnFromEffect`; `setup`/`pass`/`takeTurn`/`loadDeck`/`cardStats`
shared/engine/reduce/retreat.mjs — `computeEffectiveRetreatCost`, retreat Energy choice, `applyRetreatSwap`; `retreat` command
shared/engine/reduce/attach.mjs — `attachCard` (Energy/Tool attach and Evolution), Energy attach plan, Energy-attach and opponent-evolve triggers
shared/engine/reduce/trainer.mjs — `promoteTrainerPlay` (hand→board drop becomes playTrainer), Chaos Gym gate, Trainer turn-end/Prize-win settles; `playTrainer`/`stadium-effect`
shared/engine/reduce/ability.mjs — Call Energy, ability turn-end and outcome settles; `useAbility`/`useVStarGX`
shared/engine/reduce/board.mjs — manual board commands (move, draw, counters, conditions, zone shuffles/moves, reveal/hide, board ops), `clearFaceDownOffBoard`
shared/engine/reduce/choice.mjs — `resolveChoice`: routes a pending choice's `resumeToken.effectType` back to the domain that raised it
