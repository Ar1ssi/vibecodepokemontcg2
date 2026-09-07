# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 3
Focus: server-authoritative netcode — kill multiplayer desyncs at the architecture level
Active: none (slice 1 completed and verified)
Next: Slice 2 — pure Card/GameState/view.mjs/rng.mjs data models + state hash.
Blocked: none

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `pnpm lint` fails on Windows CRLF line endings and no-undef globals (from S1 bootstrap; unfixed).
- Shared modules in `shared/engine/` must import relatively and stay DOM-free (Invariants 6, 8).
- Express serves `shared/` at `/shared`; client browser imports use `/shared/engine/...`.
- Test baseline: `pnpm test` → 797 pass / 0 fail (41 `.mjs` files, plain `node --test`, no jsdom).
- D3 in DECISIONS.md says rules tests use JSDOM. They do not; PROJECT.md was corrected in S2 but
  D3 itself is left as the user wrote it.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S3 2026-09-07 feature: Slice 1 shipped — pure rules/zones in `shared/engine/`, `/shared` static route, 797 tests green.
- S2 2026-09-07 feature: design 001 server-authoritative netcode — approved by user.
- S1 2026-09-07 bootstrap: adopted repository, verified 797 unit tests passing.
