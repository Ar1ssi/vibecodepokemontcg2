# State — the single source of "now". Rewritten IN FULL at every Full END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: every stale line here taxes every session.
     History belongs to journal/. Contradicts git log / journal? Trust git: rebuild from
     `tail -n 20` of the journal + `git log -5`, note the crash in the journal. -->

Session: 295
Focus: S295 special-Energy coverage audit (scratch special-energy-coverage-audit.md, SE1–SE16) fixed in 6 commits
  on `claude/special-energy-coverage-fixes-db7eb0`. Branch also carries the S294 #182–#184 merges, which were
  never pushed: it is 80 commits ahead of origin/main, 0 behind.
Active: none. Awaiting user go-ahead to push the branch / fast-forward main.
Next: maintenance due (S290 skipped; ISSUES Open 49/40, Closed 34/30 over cap).
  036 slice 16 (regression gate `pnpm audit:attacks`, close I136) — ledger NEXTSTEPS.md.
  P2 engine backlog: I151 (reactive Tool conditions), I154 (26 server-missing Trainer steps), I164 (ability
  follow-on steps), I136. Then I165–I174, I155, I161–I163, I137, I126/I127, I121.
  User visual check of typed Tera entry/skin + Mega vortex in a real rules-mode game.
  Pending approval: designs 028 (I85), 029 (I86).
Blocked: I85/I86 need design approval; I87 needs the user's description.

## Watch-outs (≤5)
- Gates after engine changes: `pnpm audit:oracle` (~2 min), `pnpm audit:abilities` (~2 min), `pnpm audit:trainers`
  (seconds). Legit rate changes → `--update-baseline` + commit the baseline JSON. Known `pnpm test` failure:
  card-inspector-model "retreat greys…"; coin-flip-ceremony is flaky.
- Parallel branches collide on D/I ids: take the next free id by grep of this checkout AND open branches.
  The primary checkout still holds another session's uncommitted harness edits (S288 CLAUDE.md/workflows).
- Engine: `applyCommand` clones state — read results via `findCard(res.state, id).card`; attacking ends the
  turn → assert events. Special-Energy fixtures need `type: 'Energy'` (getAttachedSpecialEnergies) and the
  real printed text with "Pokémon" (é) — parser regexes match the accented word.
- Special Energy: `node scripts/audit-all-special-energy.mjs` lists parsed-but-unenforced steps; keep its
  `isUnenforcedStep` in sync when a consumer lands (I172, I173).
- Bash heredoc eats `\` and mangles é → use the Edit/Write tools. Primary working copy is CRLF (repo LF).

## Recently shipped (≤3 one-liners; older → journal)
- S295 special-Energy audit SE1–SE16: suite 3920/3921 (known inspector fail), oracle/abilities/trainers PASSED.
- S294 local merge of #182/#183/#184 (unpushed): suite 3879/3880, all three gates PASSED.
- S293 trainer design 038 complete (I138–I152 fixes) on #182.
