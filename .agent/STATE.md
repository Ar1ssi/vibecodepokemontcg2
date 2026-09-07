# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 5
Focus: server-authoritative netcode — kill multiplayer desyncs at the architecture level
Active: none (slice 3 completed and verified)
Next: Slice 4 — Shadow mode (Phase 1): server ingests relay traffic, compares hashes, logs mismatches.
Blocked: none

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `pnpm lint` fails on Windows CRLF line endings and no-undef globals (from S1 bootstrap; unfixed).
- Shared modules in `shared/engine/` must import relatively and stay DOM-free (Invariants 6, 8 verified by invariants.test.mjs).
- Test baseline: `pnpm test` → 850 pass / 0 fail (49 `.mjs` files, plain `node --test`, no jsdom).
- Redaction contract: assert on serialized payload (`JSON.stringify(view)`), never leak deck or unrevealed opponent hand/prizes.
- D3 in DECISIONS.md says rules tests use JSDOM. They do not; PROJECT.md was corrected in S2.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S5 2026-09-07 feature: Slice 3 shipped — command vocabulary/schemas, pure applyCommand reducer, server GameRoom behind flag; 850 tests green.
- S4 2026-09-07 feature: Slice 2 shipped — pure Card/GameState/rng/view data models, state hash, invariant tests; 828 tests green.
- S3 2026-09-07 feature: Slice 1 shipped — pure rules/zones in `shared/engine/`, `/shared` static route, 797 tests green.
