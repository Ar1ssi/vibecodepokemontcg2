# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 10
Focus: server-authoritative netcode — kill multiplayer desyncs at the architecture level
Active: none (Slice 8 complete — netcode migration fully shipped)
Next: maintenance due; next feature/optimization phase
Blocked: none

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `pnpm lint` fails on Windows CRLF line endings across existing codebase; lint changed files with `npx eslint --rule "prettier/prettier: off" <files>`.
- Shared modules in `shared/engine/` must import relatively and stay DOM-free (Invariants 6, 8 verified by invariants.test.mjs).
- Test baseline: `pnpm test` → 910 pass / 0 fail (64 test suites, plain `node --test`, no jsdom).
- Server is authoritative by default (`SERVER_AUTHORITATIVE=true`); client renders from authoritative view snapshots.
- Legacy client reconciliation stack completely removed; 20/20 edge cases covered.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S10 2026-09-08 feature: Slice 8 shipped — Phase 3 flip, Phase 4 deletion pass, edge cases 7/14/16/17/18 covered; 910 tests green.
- S9 2026-09-07 feature: Slice 7 shipped — Client applyView renderer, cmd emitters, in-flight affordances, Phase 2 dual-run; 912 tests green.
- S8 2026-09-07 feature: Slice 6 shipped — PendingChoice protocol, resumable effect executors; 895 tests green.
