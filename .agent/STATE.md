# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 8
Focus: server-authoritative netcode — kill multiplayer desyncs at the architecture level
Active: none (Slice 6 complete)
Next: Slice 7 — Client applyView renderer & cmd emitters (Phase 2 dual-run)
Blocked: none

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `pnpm lint` fails on Windows CRLF line endings across existing codebase; lint changed files with `npx eslint --rule "prettier/prettier: off" <files>`.
- Shared modules in `shared/engine/` must import relatively and stay DOM-free (Invariants 6, 8 verified by invariants.test.mjs).
- Test baseline: `pnpm test` → 895 pass / 0 fail (60 `.mjs` files, plain `node --test`, no jsdom).
- Redaction contract: assert on serialized payload (`JSON.stringify(view)`), never leak deck or unrevealed opponent hand/prizes.
- D3 in DECISIONS.md says rules tests use JSDOM. They do not; PROJECT.md was corrected in S2.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S8 2026-09-07 feature: Slice 6 shipped — PendingChoice protocol, resumable effect executors (trainers, abilities, stadiums); 895 tests green.
- S7 2026-09-07 feature: Slice 5 shipped — turn loop, attack resolution, KO & prize handling, deterministic setupGame; 876 tests green.
- S6 2026-09-07 feature: Slice 4 shipped — passive shadow mode, relayed RNG consumer, legacy action translation, `/debug/shadow-report`, mismatch logging; 861 tests green.
