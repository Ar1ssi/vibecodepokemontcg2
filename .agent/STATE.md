# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs to journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 205
Focus: rulebook-30c implementation Phases 0–6 AND review-fix-plan Phases 1–6 are COMPLETE.
  Nothing is committed yet. Next work is the commit + the overdue maintenance sweep.
Active: worktree `C:\Users\SMG26\Downloads\vibe-rulebook-30c` on `feature/rulebook-30c` @ 1bcff16,
  UNCOMMITTED Phases 0–6 + review-fix Phases 1–6. S205: `shared/engine/rules/card-classify.mjs`
  (App. 24 comment), `package.json` (`test` → globs), `.agent/DECISIONS.md` (D74/D75), plan.
Next: user hasn't asked to commit — once approved, commit Phases 0–6 + review-fix Phases 1–6 (one
  cluster each) on `feature/rulebook-30c`. Then maintenance due (carried from S200, multiple of 10):
  run `.agent/workflows/maintain.md` (DECISIONS is ~124 lines vs its 50-line cap — archive it).
Blocked: nothing.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `pnpm test` WORKS now (D75, S205): `node --test "shared/**/*.test.mjs" "client/**/*.test.mjs"
  "server/**/*.test.mjs" "bot/**/*.test.mjs"` — 2126/2126 green, 0 fail. (Was broken on Windows
  with "The command line is too long"; the old explicit list also omitted evolution.test.mjs.)
- Lint bar: `npx eslint --rule 'linebreak-style: off' --rule 'prettier/prettier: off' <files>`.
  Pre-existing errors only: card-search `URL`/`fetch`, evolution `fetch`/no-empty, ko-flow
  `rulesState`/`defenderBoard`, rules-bridge/chat-buttons `no-empty`+unused, rules-extended unused
  imports, reduce.test `getZone`/`findCard`; S198–S205 added none. `pnpm lint` is NOT usable.
- Card classification: ONLY `card-classify.mjs` predicates (`isRuleBoxPokemon` = sole rule-box
  definition; `isTeamFlareHyperGearCard` = App. 24 marker, accepts a modern ex by design, D74).
  Name-suffix predicates require a separator — `/(?:^|[\s-])ex$/i`, NOT `endsWith('ex')` (D73).
- All server discard pushes route through `state.mjs` `discardCardToPlayerZone` (Prism Star →
  `lostZone`, App. 17) — new effect code must too; a raw `zones.discard.push` is a bug (S201).
- Ancient Traits (App. 23) are marker-only: `ancientTraitIn` matches the printed α/Ω (lowercase
  ω after `.toLowerCase()`!), never trigger wording (D72). `tcgAbilityFromDetail` drops TCGdex
  `type:"Ancient Trait"` entries, so real trait EFFECTS stay unimplemented — tagging only.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S205 review-fix Phase 6: TFHG/tiebreak kept + documented (D74), `pnpm test` → globs (D75); 2126/2126.
- S204 review-fix Phase 5: I22 closed, I61–I63 filed, legacy draw message reworded; 2073/2073 (uncommitted).
- S203 review-fix Phase 4: `isExCard`/`isGxCard` require a separator (Toxapex fixed); 2073/2073 (uncommitted).
