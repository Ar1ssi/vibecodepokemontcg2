# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 1
Focus: Adopt repository & establish harness
Active: none
Next: Ready for feature or patch work (e.g., address high priority issues in ISSUES.md)
Blocked: none

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- pnpm lint fails due to CRLF line endings and ESLint no-undef errors on global variables.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S1 2026-09-07 bootstrap: adopted repository, verified 797 unit tests passing.

