# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 15
Focus: server-authoritative netcode — resolving critical audit findings
Active: none (Critical Finding 7 resolved)
Next: High Severity Finding 8 (parameter offset scrambling in dual-run-bridge.js) and remaining audit items
Blocked: none

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `pnpm lint` fails on Windows CRLF line endings across existing codebase; lint changed files with `npx eslint --rule "prettier/prettier: off" <files>`.
- Shared modules in `shared/engine/` must import relatively and stay DOM-free (Invariants 6, 8 verified by invariants.test.mjs).
- Test baseline: `pnpm test` → 927 pass / 0 fail (plain `node --test`, no jsdom).
- Server broadcasts redact PendingChoice options for opponents and spectators (Finding 1 resolved).
- Reconnects match `username` against `state.players` and reserve seats against 3rd-party takeover (Finding 7 resolved).

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S15 2026-09-08 patch: Fixed audit finding 7 (identity swap/seat hijacking prevention via state.players matching, seat reservation on disconnect); 927 tests green.
- S14 2026-09-08 patch: Fixed audit finding 6 (clientSeq reset on reconnect, lastClientSeq in view broadcasts/requestView, seedClientSeq); 919 tests green.
- S13 2026-09-08 patch: Fixed audit finding 5 (applyView choice resolver socket/room context & defaultNetcodeContext); 917 tests green.
