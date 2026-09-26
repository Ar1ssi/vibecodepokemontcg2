# Map — where things live. First stop when locating code: grep it (`grep -n -i <keyword> .agent/MAP.md`), never read it whole.
<!-- One line per module: `path — what it is; entry: <file>`. Update on any structure change.
     Cap 120 lines: when over, collapse a subtree into .agent/areas/<x>.md and keep one line here
     pointing at it. `(?)` marks unverified bootstrap guesses — verify on first visit, then remove. -->

.agent/ — agent harness: state, workflows, designs, journal (human manual: .agent/README.md); spawn-or-inline cost guide: .agent/DELEGATION.md
.claude/agents/ — project subagents: slice-builder (low effort, pinned-contract slices; D171), fx-designer (high effort, board visuals/CSS in the 041–046 house style; D173)
client/ — client application (EJS layout, CSS styles, client JS, deck builder, rules engine); entry: client/src/front-end.js
server/ — Express + Socket.IO + SQLite; entry: server/server.js; game rooms in server/game/room.mjs (GameRoom runs shared/engine commands, sends per-player views)
shared/tcgdex/ — TCGdex URL builder (browser → server proxy server/tcgdex-proxy.mjs, D164) + IndexedDB JSON cache (D102)
docs/ — project documentation (card types taxonomy, rule specs); entry: docs/card-types-taxonomy.md
scripts/ — admin and asset utility scripts (stadium audit, pkmncards scraper + attack/ability corpus audit, mat generator; pkmncards article HTML helper: scripts/lib/pkmn-article-html.mjs, D179)
scripts/audit-oracle.mjs (`pnpm audit:oracle`, ~2 min) — execution gate: runs every corpus attack/ability through the engine (lib/oracle-harness.mjs), ratchets per-family observed rates vs scripts/oracle-baseline.json (lib/oracle-gate.mjs); family claim lists in lib/executed-families.mjs (I113)
scripts/audit-ability-behaviour.mjs (`pnpm audit:abilities`, ~2 min) — ability gate: classes every corpus ability runs/partial/dead/consumed/unconsumed/unparsed (lib/ability-behaviour.mjs, reads effects/ability.mjs `resolveAbilitySteps`; passive rows via lib/ability-passive-probe.mjs reader probes, D135), ratchets per-family shares vs scripts/ability-behaviour-baseline.json (D134) and holds EXECUTED_ABILITY_FAMILIES claims to ≥50% runs+consumed (D136)
scripts/audit-trainer-behaviour.mjs (`pnpm audit:trainers`, seconds) — Trainer gate: per unique corpus Trainer, parse outcome + step kinds with no server executor + play condition (lib/trainer-behaviour.mjs) vs scripts/trainer-behaviour-baseline.json (D124)
scripts/audit-attack-behaviour.mjs (`pnpm audit:attacks`, ~2 min) — attack gate: classes every unique effect-text attack in out/pkmn-pokemon-cards.json ok/partial/ran-no-effect/engine-error from a rich-board reducer run (lib/attack-harness.mjs) + sentence cross-check (lib/attack-behaviour.mjs), ratchets each row vs scripts/attack-behaviour-baseline.json (design 036 slice 16)
scripts/audit-gx-oracle.mjs (`node scripts/audit-gx-oracle.mjs`, ~25 s) — GX-scoped oracle: every attack/ability of out/pkmn-gx-cards.json (pkmncards `is:gx`) through the same harness, per-entry executed/blind/passive/no-effect report (out/gx-oracle-audit.txt) + ratchet scripts/gx-oracle-baseline.json (design 047)
tools/ — internal dev tools, sync log comparison, asset mappings
client/src/setup/deck-builder/ — deck builder (themes, filters, counter, sprites, wallpapers, coins) → .agent/areas/deck-builder.md
client/src/setup/netcode/ — client transport, authoritative view renderer (apply-view.js), pickers/adapters, battle log → .agent/areas/netcode.md
client/src/setup/netcode/mat-fx/ — mat cosmetic effects (D94/D103; Mega/Tera entries D118–D122[mat-fx]; evolution scene D153–D154) → .agent/areas/netcode.md § Mat FX

## Rules engine — pure, DOM-free, headless-tested (~8,900 lines; portable to Node)
shared/engine/rules/rules-state.mjs — `rulesState` + `canPerformAction()` legality gate (line 597)
shared/engine/rules/attack-engine.mjs — `computeAttackDamage`, `canPayAttackCost`
shared/engine/rules/ability-combat.mjs — pure ability-side passive combat reads (damage bonus/reduction/prevention, weakness override, HP/prize/retreat/cost, extra types, energy multiplier); `computeAttackDamage` takes them as named options, built by reduce's attack sites/effectiveHp/handleKnockout/retreat/attack-cost. Slice-3 gates live here too: `isAbilitySuppressed` (wired into every reader), `abilityActivationBlockReason` (the ONE useAbility gate shared by reduce and the picker), `abilityPlayLocks`, `abilityEvolvePermission/Lock`, `abilityRetreatLock`, `abilityCounterMoveLock`, `abilityStatusImmune`, `abilitySummonRestricted`, `abilityFirstTurnAttack`, `abilityExtraAttack` (design 034, D125/D126)
shared/engine/rules/ability-triggers.mjs — pure ability-trigger planners (design 034 slice 4, D127): `parseCheckupAbilities`/`parseOnOpponentEvolveAbilities`/`parseOnDamageAbilities`/`parseEndOfTurnAbilities` wired in reduce (`resolveCheckup`, evolve site, attack on-damage site); `parseBetweenTurnsAbilities`/`parseOnKoAbilities`/`parseOnPromotionAbilities` are tested readers awaiting their hooks (slice 4b/5)
shared/engine/rules/special-energy-parse.mjs — special-energy text → structured effect steps (`parseSpecialEnergyEffects`) + pure execution helpers used by `computeAttackDamage` (damage bonus/penalty/reduction) and `effectiveHp` (+HP); audit `scripts/audit-all-special-energy.mjs` (S220)
shared/engine/rules/special-conditions.mjs — server card conditions: rotation field + Poison/Burn marker keys (D45); every reducer/effect write goes through it, and `addCondition` refuses writes to a card whose own Ability grants immunity (`abilityStatusImmune`, design 034)
shared/engine/rules/trainer-effects.mjs — text → structured trainer step parser
shared/engine/rules/trainer-play-conditions.mjs — `trainerPlayBlockReason` (turn-1 Supporter, same Stadium, printed play conditions); used by reduce.mjs legality and the bot's e2e-options.mjs
shared/engine/rules/tool-conditions.mjs — one pure condition layer for Tool modifiers (design 035/D117): `parseToolCondition`/`toolConditionMet` + gated `toolHpBonusFor`/`toolRetreatDeltaFor`; consumed by tool-combat (HP/retreat/bonus/prevention/reduction/prize) and stadium-effects.effectiveHp; holder conditions read the top evolution view
shared/engine/rules/tool-attacks.mjs — attacks a Tool grants its holder (design 035 slice 7): `parseGrantedAttacks` reads `card.attacks[]` or the printed "→" line of TM/Cube Items; merged into `attackViewFor` in reduce.mjs
shared/engine/rules/stadium-triggers.mjs — pure Stadium trigger descriptors (design 035 slice 10): `stadiumOnAttachTriggers`/`OnEvolve`/`OnBench`/`OnSwitch` + `stadiumCheckupCoinModifiers` (Wela/Slumbering), `stadiumRetreatCoin` (Mirage), `stadiumTrainerPlayCoin` (Chaos Gym), `stadiumAttackCoinModifier` (Vermilion), `stadiumWeaknessOverrides`/`stadiumResistanceOverrides`; hooks in reduce.mjs (attachCard, evolve, moveCard hand→bench, applyRetreatSwap, resolveCheckup, retreat/playTrainer apply, attack damage) and attack-engine's computeAttackDamage
shared/engine/effects/stadium-trigger-apply.mjs — applies Stadium trigger descriptors to cards (damage/heal/cure/copyConditions) and `applyStadiumSwitchTriggers`, the one switch hook shared by reduce.mjs and every executor switch site (design 035 slice 10b)
shared/engine/rules/evolved-pokemon.mjs — `evolvedView` (in-play Pokémon read as its top Evolution card), Rare Candy line tracing, Trainer target counts; used by reduce.mjs, trainer-steps.mjs, the bot
shared/engine/rules/server-energy.mjs — `serverEnergyDescriptor`: how the server prices attached Energy; the bot uses it too
shared/engine/effects/executor.mjs — resumable step runner; core step kinds inline, the rest delegated to trainer-steps.mjs
shared/engine/effects/trainer-steps.mjs — server handlers for the other trainer step kinds; multi-choice progress lives in resumeToken.context
shared/engine/rules/abilities.mjs + ability-step-plan.mjs - ability parse + ordered step plan (resume seam); Ancient Traits (`ancientTraitIn`: Δ/θ/Ω/α markers or spelled "Delta …") tag EVERY step `trait:'alpha'|'omega'|'delta'|'theta'` with `isAncientTraitAbility` so "no Abilities" gates skip them (App. 23/D72); audit `scripts/audit-all-ancient-traits.mjs` over `out/pkmn-ancient-trait-cards.json` (shared splitter `scripts/lib/split-card-text.mjs`)
shared/engine/rules/stadium-effects.mjs - pure stadium classify/parse/apply (`applyStadiumEffect`) + `stadiumActivationStatus` (the inspector stadium Use gate, design 018); server executor in shared/engine/effects/stadium.mjs
shared/engine/rules/damage-parser.mjs - attack text → damage math; `isGxAttack` name classifier; `parsePrizeOnKo`/`prizeRuleBoxes`/`prizeFilterMatches` for the on-KO "take N more Prize cards" clauses (design 036 A3)
shared/engine/rules/attack-steps.mjs + effects/attack-steps.mjs - attack text → ordered executor steps (`parseAttackSteps`, design 030/031) and their server handlers; reduce.mjs runs them before/after damage
shared/engine/rules/attack-markers.mjs - timed attack markers on cards (`card.attackMarkers`: immunity, prevention/reduction, next-turn bonus, deferred KO, retaliate, prizeBonus); read by computeAttackDamage and handleKnockout (prizeBonus, design 036 A3), cleared on retreat/KO/evolve (design 031)
shared/engine/rules/attack-conditions.mjs - whole-attack state condition gates (design 036 A1): `parseAttackCondition`/`attackConditionMet`; reduce.mjs evaluates the gate once at the top of the attack effect phase (`conditionChecked` resume flag) against the extended `buildServerAttackContext` (stadium/bench/hand/prize/energy/damage-counter/rule-box reads)
shared/engine/rules/attack-status.mjs - printed Special-Condition clauses → `{when,target,statuses}` branches (design 036 A2): dual-branch coins, multi-flip thresholds, `always`/self/both-sides; `statusesFromBranches` is reduce.mjs's status source
shared/engine/rules/attack-copy.mjs - copy-attack parser (`parseCopyAttack`: sources, filters, inline conditions, last-turn via `player.lastAttack`); reduce.mjs offers the copied attack before coins (`offerCopiedAttack`, design 031/039)
shared/engine/rules/each-filter.mjs - "each of your opponent's Pokémon that …" filters shared by counter-spread steps and reduce damage-each (design 036 A9)
shared/engine/rules/turn-damage-bonus.mjs - Trainer/Ability "during this turn, your … attacks do N more damage" bonuses (`turnDamageBonusTotal`; possessive, per-Prize, Basic-only, instance-scoped)
shared/engine/rules/rules-turnorder.mjs — deterministic coin-flip caller selection (flag-OFF 2P only since design 013)
shared/engine/rules/turn-order-flip.mjs — pure opening-coin helpers in absolute playerId space: `flipCoinFace`, `pickCoinCaller`, `resolveStarterPlayerId`; the server authority's side of the coin call (D50)
shared/engine/rules/legacy-set-ids.mjs — short set code to TCGdex set id mapping
shared/engine/rules/card-classify.mjs — single card-classification contract: `isRuleBoxPokemon`, `prizesForKO`, ex/GX/V/VMAX/VSTAR/Tera/Mega/Tag-Team/V-Union/Prism/Radiant/ACE-SPEC/LEGEND/Basic-Energy predicates; ko-flow re-exports, search-match/stadium-effects/tool-combat/reduce use it (rulebook 30c Phase 0); also understands TCGdex `energyType`/`rarity` fallbacks so client deck cards classify without `subtypes` (30c Phase 3); the `cardHasRuleBox` aliases are gone — `isRuleBoxPokemon` is the only rule-box definition (30c 4.2); `isTeamFlareHyperGearCard` is the App. 24 opponent-attaching Tool marker (30c 5.1)

## Rules engine — DOM-coupled glue (NOT portable; the migration's cost centre)
client/src/setup/rules/rules-bridge.js — 2324 lines; orchestrates rules via document.dispatchEvent + HUD
client/src/setup/rules/trainer-execution.js — 1549 lines; resolves effects through synchronous UI pickers
client/src/actions/chat-buttons/chat-buttons.js — 4573 lines; attack/pass/retreat monolith

## State / zones
shared/engine/cards.mjs — pure `Card` model, `mintInstanceId`, DOM-free (replaces DOM-based Card identity); `isBasicPokemon` treats LEGEND/V-UNION/Restored/BREAK as non-Basic (30c 5.4)
shared/engine/state.mjs — pure `GameState` model (8 zones/player, neutral stadium), zone accessors, `hashState`; per-player `oncePerGame: { vstarUsed, gxUsed }` survives `advanceTurn` (rulebook 30c 1.2); `discardCardToPlayerZone` routes Prism Star discards to the Lost Zone (30c 3.5)
shared/engine/rng.mjs — seeded `mulberry32` PRNG, deterministic replay source (Invariant 6)
shared/engine/view.mjs — `viewFor(state, playerId)` authoritative redacted view per player/spectator (H1, Invariant 5)
client/src/setup/zones/get-zone.js — `getZone(user, zoneId)` → { array, element, ... }; 10 zones/player, stadium neutral
shared/engine/zones/zone-hash.mjs — `hashCardList`/`hashBoardSnapshot`; `SYNC_HASH_ZONES` is 8 zones (excludes UI scratch)
shared/engine/zones/*.mjs — pure: board-snapshot, card-state, hand-sort, resolve-card-index, active-pokemon
client/src/setup/deck-constructor/card.js — `Card` class; identity is `card.image` (HTMLImageElement)

## Actions (~10,582 lines, ~85% DOM-coupled — every mutation goes through the DOM)
client/src/actions/move-card-bundle/ — card movement, attach, evolve; primary mutation path
client/src/actions/zones/ — deck/hand/prize/shuffle operations
client/src/actions/counters/ — damage, special condition, ability counters (DOM overlays)
client/src/actions/general/ — setup, ready, turn, reveal/hide, reset, undo
client/src/setup/image-logic/drag.js + drag-avatar.js + drag-tilt.mjs — native HTML5 card drag/drop; the dragged card is drawn as a swinging body-level avatar (design 038, D124; physics pure in drag-tilt.mjs); a held Item/Supporter lights its board (design 046, drop-zone.mjs playsOntoBoard)

## Tests & tooling
**/__tests__/*.test.mjs — plain `node --test`, no jsdom; `pnpm test` runs them all (~3400); run one file with `node --test <path>`
two-player-sync-test.mjs — Playwright two-browser sync harness (legacy mode, `pnpm test:2p`)
flip-gate-test.mjs — Playwright two-browser full game under SERVER_AUTHORITATIVE=1: design 002's
  3.12 flip gate (`pnpm test:flip`; needs a hand-started authoritative server on PTCG_URL)
test-card-inspector-e2e.mjs — Playwright two-browser design-013 card-inspector gate
  (`pnpm test:inspector`; needs a hand-started authoritative server on PTCG_URL). Step 9 clicks the
  attack panel with REAL input (locator.click), so it catches pointer-capture regressions el.click() hides
*-audit.mjs (root) — one-off card/attack/trainer/stadium coverage audits
bot/bot.mjs, bot/heuristic-scorer.mjs — design 004 slice 5: pure-Node playtest bot (never-crash
  scaffold + greedy scorer), driven by playtest-bot.mjs via __ptcg observe/options/act
playtest-bot.mjs (root) — design 004 slice 6: the playtest runner. Two Playwright pages, bot vs.
  bot, legacy mode by default (`node server/server.js` on :4000, then `node playtest-bot.mjs
  --games=N --seed=S`); dumps a replayable trace to out/playtest/ on any failure. Found a real bug
  on first live run (I30, ISSUES.md) — see design 004 slice 6's Acceptance note.

