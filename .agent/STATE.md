# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 17
Focus: server-authoritative netcode — resolving audit findings
Active: none (Finding 9 resolved)
Next: High Severity Finding 10 (Missing initiator attribution in PendingChoice.resumeToken) and remaining audit items
Blocked: none

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- `pnpm lint` fails on Windows CRLF line endings across existing codebase; lint changed files with `npx eslint --rule "prettier/prettier: off" <files>`.
- Shared modules in `shared/engine/` must import relatively and stay DOM-free (Invariants 6, 8 verified by invariants.test.mjs).
- Test baseline: `pnpm test` → 946 pass / 0 fail (plain `node --test`, no jsdom).
- `handleKnockout` discards victim + attachments from active or bench; auto-promotion is guarded strictly for active KO.
- Reconnects match `username` against `state.players` and reserve seats against 3rd-party takeover (Finding 7 resolved).

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S17 2026-09-08 patch: Fixed audit finding 9 (bench knockout victim/attachment discard, no illegal auto-promote); 946 tests green.
- S16 2026-09-08 patch: Fixed audit finding 8 (parameter unpacking in dual-run-bridge.js for retreat, ability, damage counters, and conditions); 944 tests green.
- S15 2026-09-08 patch: Fixed audit finding 7 (identity swap/seat hijacking prevention via state.players matching, seat reservation on disconnect); 927 tests green.
