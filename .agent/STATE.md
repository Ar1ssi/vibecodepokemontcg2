# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 9
Focus: server-authoritative netcode — kill multiplayer desyncs at the architecture level
Active: none (Slice 7 complete)
Next: Slice 8 — Phase 3 flip and Phase 4 deletion pass
Blocked: none

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `pnpm lint` fails on Windows CRLF line endings across existing codebase; lint changed files with `npx eslint --rule "prettier/prettier: off" <files>`.
- Shared modules in `shared/engine/` must import relatively and stay DOM-free (Invariants 6, 8 verified by invariants.test.mjs).
- Test baseline: `pnpm test` → 912 pass / 0 fail (64 `.mjs` files, plain `node --test`, no jsdom).
- Redaction contract: assert on serialized payload (`JSON.stringify(view)`), never leak deck or unrevealed opponent hand/prizes.
- Client applyView renderer handles monotonic version guards (Edge Case 8) and identity-stable DOM continuity.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S9 2026-09-07 feature: Slice 7 shipped — Client applyView renderer, cmd emitters, in-flight affordances, Phase 2 dual-run; 912 tests green.
- S8 2026-09-07 feature: Slice 6 shipped — PendingChoice protocol, resumable effect executors (trainers, abilities, stadiums); 895 tests green.
- S7 2026-09-07 feature: Slice 5 shipped — turn loop, attack resolution, KO & prize handling, deterministic setupGame; 876 tests green.
