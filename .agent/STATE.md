# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 212
Focus: closed I65 — full ability parse/classify coverage. `parseAbility`
  (shared/engine/rules/abilities.mjs) gained ~40 step types (locks, energy/damage moves,
  transform/self-return, deck peek/Lost Zone/win, condition recovery, coin/cost/misc) and
  `classifyAbility` (ability-effects.mjs) gained 18 families + predicate fixes (D83). Continuous
  step types added to PASSIVE_ABILITY_STEP_TYPES. Corpus retest: printings=6098 attacks=8690
  abilities=4228 attackGaps=0 abilityGaps=0 engineFailures=0 unattributed=0 (was 199 ability gaps,
  1 unattributed). Also fixed the audit splitter to recognize Buried Fossil's static evolve clause.
Active: merge PR #175 into main.
Next: merge PR #176 into main, run tests, and sync local repository.
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Stadium extras have ONE merge order (D78): printed → inherited → granted, de-duped by name, shared by server and client.
- Both classifiers are order-sensitive: primary mechanic wins. Attack: `first-turn-attack` checked last; "Remove N damage counters" stays heal. Ability: `discard-cost` after attach, `attack-cost` after cost-discount. Both are announce-only.
- Audit artifacts: `out/pkmn-pokemon-cards.json`, `out/pokemon-attacks-abilities-full-audit.txt`, `out/pokemon-attacks-abilities-audit.json`. Re-run: `node scripts/audit-all-pokemon.mjs`.
- pkmncards text extraction normalizes curly quotes to ASCII and KEEPS paragraph newlines; static clauses with no header skipped via `STATIC_CARD_TEXT` (Buried Fossil).
- Card classification: only `card-classify.mjs` predicates. D77 stadium inspector Use gate is `stadiumActivationStatus`.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S212 feature: closed I65 — all 4228 abilities parse + classify (gaps 199→0, D83).
- S211 fix: closed I66 — last 6 attack one-offs mapped, attackGaps 168→0 (D82).
- S207 stadium deep mechanics + client attack-list wiring (PR #174, D78).
