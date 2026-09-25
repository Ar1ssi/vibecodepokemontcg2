# S297 handoff — I155+ backlog fixes (`claude/rules-engine-issues-e79707`)

Branch is main + 15 commits, **not pushed**. Suite 4023/4024 (only the known
card-inspector-model "retreat greys…" failure); `audit:oracle`, `audit:abilities`,
`audit:trainers` all PASSED. Revert = revert the branch.

## Shipped this branch

| Issue | Commit | What landed | Tests |
|---|---|---|---|
| I164 | be18a015 | Energy Rain counters chain to the attach target; Oricorio ex gated on the board | ability-one-offs |
| I151 | d23c9959 | `toolConditionMet` checked by reactive Tool on-damage/on-KO readers | reactive-tool-conditions |
| I78, I165 | 5453d272 | between-turns Stadium KOs judged as one batch; sweep wins re-settled | reduce.test |
| I173, I175 | f8c39715 | `ignoredOn` host gate consumed; Holon GL reduction after W/R | special-energy-printings |
| I172 | cc41950e | Treasure Energy `attachFromPrize` offered on a Prize take | ability-one-offs |
| I169 | 81220690 | Call Energy activates via `useAbility`; Retro Energy asks before devolving | ability-one-offs, special-energy-authoritative |
| I171 | f180b3fa | effect shield gates gust/move-all-counters/per-target counters/effect KOs/energy moves; Fusion Strike `abilityShield` gates Ability status, switch and counters | special-energy-passives, ability-one-offs |
| I155 | d1b0cad8 | `coinFlip` count/headsAtLeast + `turnEnds` branch (Tickling Machine, Minion of Team Rocket); hand-activated abilities (Luxray, Charjabug) offered by glow/affordances, bot options and the context-menu dispatch | trainer-effects, trainer-execution, rules-extended, action-affordances |
| I154 | 3c58a2b5 | executors for all 26 server-missing Trainer step kinds (+ nested coin-branch kinds: `discardAllEnergyFromActive`, `discardAllTrainerInPlay`, `drawBottom`) | trainer-steps-i154 (28) |
| I163 | a531953d | `parseBetweenTurnsAbilities` v2 wired into `resolveCheckup`: condition-damage modifiers, heals, spreads, sleep flips; holder gates fail closed | ability-triggers |
| I161 | 9472ed6e | retreat "for each" scaling, typed/evolution team grants, both-player/all-in-play increases (non-stacking), named/opponent/typed self conditions | retreat-team-ability |

Key files: `shared/engine/effects/{executor,attack-steps,trainer-steps,reduce}.mjs`,
`shared/engine/rules/{ability-triggers,ability-executors,ability-combat,tool-combat,retreat,
trainer-effects,collect-usable-abilities}.mjs`, `client/src/setup/rules/{action-affordances,
card-glow-model}.mjs`, `client/src/setup/general/e2e-options.mjs`,
`client/src/setup/image-logic/click-events.js`.

## Decisions made

- **I174 closed wontfix** — legacy path, never used (user directive: no legacy work).
- **Legacy ability-picker untouched** — the hand-ability work is server-authoritative only;
  a revert of the picker edit was deliberate.
- **I153 deferred** — per-viewer event filtering (design 038 option 3B) needs its own feature
  session: no visibility contract exists, and it touches `server.js` `broadcastGameResult` plus
  every event producer.
- **Baselines**: `scripts/trainer-behaviour-baseline.json` regenerated for the I154/I155 parser
  changes (26 server-missing gaps closed + Tickling Machine/Minion recognized). Legit change.
- **Residual**: Tickling Machine's heads `opponentHandSetAside` parses but has no executor —
  folded into I137. `opponentHandSetAside` is nested in a coinFlip branch, so `audit:trainers`
  (top-level step types only) does not see it.

## Next sessions (priority order)

1. **Design 036 slice 16** — promote `scripts/audit-attack-behaviour.mjs` + a per-class baseline
   + `pnpm audit:attacks`; annotate the reports; close I136/I137. None of it exists yet
   (no script, no baseline, no package script). This is the ledger's next item and gives the
   I166–I168 attack residuals a ratchet.
2. **I168** copy-attack wordings (conditional, previous-Evolution, last-turn, old "copies that
   attack" prints) — `rules/attack-steps.mjs` / `parseAttackSteps`.
3. **I167** attack-marker residuals (client inspector pricing of attackCostIncrease/retreatDelta,
   player-wide hand locks, Pelipper two-attack base damage, Light Ledian, Lunala; stacking markers).
4. **I166** attack-effect residuals (conditional self-heal, ~160 conditional-status sentences,
   spreads, "if you do" gates).
5. **I153** feature (per-viewer event filtering) — needs a contract first.
6. **I162** ability-audit backlog — measurement; work by family from `pnpm audit:abilities --rows`.
7. Then the older Open set: I136, I137, I121, I126 (only Aqua Tube / Dark Cloak left), I127, I44, I60.

## Verification / landmines

- `pnpm test` (~40 s, 4024 tests) · one file `node --test <path>` · lint touched files
  `npx eslint --quiet <files>`.
- Gates after engine changes: `pnpm audit:oracle`, `pnpm audit:abilities`, `pnpm audit:trainers`.
  `audit:abilities` currently prints `WARN retreat-cost: 88/172 rows work — not claimed executed`
  (informational; the family is not on the claimed list).
- `applyCommand` clones state: read results from the returned `state`, not the input objects.
- Bash heredoc eats `\` and mangles é → use Edit/Write. Primary working copy is CRLF.
- Parallel branches collide on D/I ids — take the next free id by grep.
