# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 34
Focus: Netcode repair — design 002, slice 1.1 (peer-log reconnect catch-up) built and green
Active: none
Next: build slice 1.2 (counter-ordered `requestAction` queue) — see NEXTSTEPS.md ledger
Blocked: none

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Work happens in the worktree `../vibecodepokemontcg2-netcode-repair` on
  `feature/netcode-repair`, per CLAUDE.md worktree rules — not in the primary checkout.
  Resume there; `NEXTSTEPS.md` at its root is the slice ledger. Do not create a second
  worktree for this branch — git will refuse (already checked out there).
- `pushAction` and `requestAction` must not be dropped: the server's own deck init is fed from
  the pushAction relay (server.js:658-674), and setup actions rely on it.
- Reconnect recovery now exists for the non-authoritative path only (slice 1.1: peer-log
  catch-up, capped at 200 actions, 5s timeout, O2-C "reload and rejoin" fallback).
  `SERVER_AUTHORITATIVE` stays off (D8) until slice 3.6's flip gate passes.
- `pnpm lint` fails on Windows CRLF across the codebase; lint changed files with
  `npx eslint --rule "prettier/prettier: off" <files>`.
- `pnpm test:2p` needs a running server first (`node server/server.js`, localhost:4000) —
  it does not boot one itself.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S34 2026-09-09 feature(netcode slice 1.1): peer-log reconnect catch-up (requestPeerLog/
  peerLog, capped+timed-out, O2-C fallback); 1004 tests & test:2p green.
- S33 2026-09-09 feature(netcode slices 0.1-0.2): SERVER_AUTHORITATIVE defaults off,
  render-target guard stops the stadium-wipe and blind-renderer writes; 993 tests green.
- S32 2026-09-09 feature(design): wrote design 002 (13-slice netcode repair plan), verified
  against source; filed I10-I14, decided D8-D10.
