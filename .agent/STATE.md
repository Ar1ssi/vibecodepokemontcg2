# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 14
Focus: server-authoritative netcode — resolving critical audit findings
Active: none (Critical Finding 6 resolved)
Next: Critical Finding 7 (identity swap/seat hijacking on reconnect) and remaining audit items
Blocked: none

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `pnpm lint` fails on Windows CRLF line endings across existing codebase; lint changed files with `npx eslint --rule "prettier/prettier: off" <files>`.
- Shared modules in `shared/engine/` must import relatively and stay DOM-free (Invariants 6, 8 verified by invariants.test.mjs).
- Test baseline: `pnpm test` → 919 pass / 0 fail (plain `node --test`, no jsdom).
- Server broadcasts redact PendingChoice options for opponents and spectators (Finding 1 resolved).
- Client commands synchronize monotonic sequence via `lastClientSeq` on view and reset upon socket re-registration (Finding 6 resolved).

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S14 2026-09-08 patch: Fixed audit finding 6 (clientSeq reset on reconnect, lastClientSeq in view broadcasts/requestView, seedClientSeq); 919 tests green.
- S13 2026-09-08 patch: Fixed audit finding 5 (applyView choice resolver socket/room context & defaultNetcodeContext); 917 tests green.
- S12 2026-09-08 patch: Fixed audit finding 4 (exchangeData/loadDeckData parameter offset in server.js); 915 tests green.
