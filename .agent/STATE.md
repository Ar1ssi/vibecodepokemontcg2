# State — the single source of "now". Rewritten IN FULL at every Full END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: every stale line here taxes every session.
     History belongs to journal/. Contradicts git log / journal? Trust git: rebuild from
     `tail -n 20` of the journal + `git log -5`, note the crash in the journal. -->

Session: 300
Focus: S299 fixed the #board double-click trap: the free-play board was missing from `doubleClick`'s zoom
  list, so the card got the legacy #fullImage overlay (top document, under the z-index-2 mat iframes,
  unclosable). Zone list + routing now in `double-click-zoom.mjs`; live 2P probe + unit test green.
Active: none — S300 Birch shuffle+coin draw fix done in worktree birch-coinflip (fix/birch-coinflip), uncommitted.
Next: maintenance due (S290 skipped; ISSUES Open 51/40, Closed 35/30 over cap).
  Triage I180 (remaining legacy-overlay zones: discard/lostZone/viewCards/attachedCards).
  036 slice 16 (regression gate `pnpm audit:attacks`, close I136) — ledger NEXTSTEPS.md.
  P2 engine backlog: I151 (reactive Tool conditions), I154 (26 server-missing Trainer steps), I164 (ability
  follow-on steps), I136. Then I165–I175, I155, I161–I163, I137, I126/I127, I121.
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
- S300 Professor Birch's Observations / Drasna / Gambler: coin-picked shuffle-draw (trainer-effects + test); suite 4064/4065, all gates PASSED, trainer baseline updated.
- S299 #board double-click fix (`double-click-zoom.mjs` + test), live 2P verified; I180 files the remaining zones.
- S298 trainer-play fly-out card back (`presentSrcFor` src order) + S297 PR #181 design 024 (D146–148, I177–179).
- PRs #186 drag swing, #187 inspector fix, #188 special-Energy merged to main (S296).
