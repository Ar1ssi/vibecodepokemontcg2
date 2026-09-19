# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 211
Focus: closed I65 — full ability parse/classify coverage. `parseAbility`
  (shared/engine/rules/abilities.mjs) gained ~40 step types (locks, energy/damage moves,
  transform/self-return, deck peek/Lost Zone/win, condition recovery, coin/cost/misc) and
  `classifyAbility` (ability-effects.mjs) gained 18 families + predicate fixes (D82). Continuous
  step types added to PASSIVE_ABILITY_STEP_TYPES. Corpus retest: printings=6098 attacks=8690
  abilities=4228 attackGaps=0 abilityGaps=0 engineFailures=0 unattributed=0 (was 199 ability gaps,
  1 unattributed). Also fixed the audit splitter to recognize Buried Fossil's static evolve clause.
  5 new test blocks in rules-extended.test.mjs; pnpm test 2188/2188.
Active: worktree `C:\Users\SMG26\AppData\Local\Temp\opencode\trainer-pkmn-audit` on
  `audit/trainer-pokemon-effects`. UNCOMMITTED (user chose to leave it for review).
Next: overdue maintenance (carried since S200): run `.agent/workflows/maintain.md` — DECISIONS is
  now 131 active lines vs its 50-line cap, journal ~2400. Also owed: browser e2e for the stadium
  inspector Use panel (PR #172); I64 (attack panel does not grey a spent GX attack); I62/I63
  (V-UNION / LEGEND). Optional: wire any of the new ability step types into execution (all are
  announce-only today).
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `pnpm test` = 2188/2188 green on this branch. Lint bar: `npx eslint --rule 'linebreak-style: off'
  --rule 'prettier/prettier: off' <files>`; `scripts/*.mjs` and root `*-audit.mjs` report
  pre-existing no-undef (node globals); rules-extended.test.mjs has 14 pre-existing unused-import
  errors only. `pnpm lint` NOT usable.
- Audit artifacts: `out/pkmn-pokemon-cards.json` (corpus), `out/pokemon-attacks-abilities-full-audit.txt`
  (grouped gaps), `out/pokemon-attacks-abilities-audit.json` (gap rows + engine results). Re-run:
  `node scripts/audit-all-pokemon.mjs`.
- Both classifiers are order-sensitive: primary mechanic wins. Attack: `first-turn-attack` checked
  last (just before `flat`); "Remove N damage counters" must stay `heal` (`\bmove`). Ability:
  `discard-cost` sits after `attach` so "play from your hand … discard" triggers stay `when-played`;
  `attack-cost` after `cost-discount`; `status-recover` excludes heal/damage-counter wording. Both
  classifiers are announce-only — no ability/attack effect is executed.
- pkmncards text extraction normalizes curly quotes to ASCII and KEEPS paragraph newlines so
  attack/ability headers can be split from effects; static clauses with no `→`/`⇢` header are
  skipped via `STATIC_CARD_TEXT` in the audit (Buried Fossil).
- Card classification: only `card-classify.mjs` predicates. D77 stadium inspector Use gate is
  `stadiumActivationStatus`; `type-change` family is classify-only (D78).

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S211 feature: closed I65 — all 4228 abilities parse + classify (gaps 199→0, D82); pnpm test 2188/2188.
- S210 fix: closed I66 — last 6 attack one-offs mapped, attackGaps 168→0 (D81); pnpm test 2183/2183.
- S209 feature: attack classifier long tail (attackGaps 168→6, D80); pnpm test 2182/2182.
