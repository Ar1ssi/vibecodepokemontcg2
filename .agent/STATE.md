# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 37
Focus: Netcode repair — design 002, slice 2.1 (sweep grace + roomInfo decoupling) built and merged
Active: none
Next: build slice 2.2 (clientSeq clearing, protocol version, emitCmd surfacing) — see NEXTSTEPS.md ledger
Blocked: none

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- All netcode work happens directly in the primary checkout (`main`) on short-lived
  `feature/netcode-repair-<slice>` branches, merged back and deleted — per explicit user
  instruction, no new worktree per slice.
- `pushAction` and `requestAction` must not be dropped: the server's own deck init is fed from
  the pushAction relay (server.js), and setup actions rely on it.
- Reconnect recovery: peer-log catch-up (1.1) for stale opponent-action gaps, and the
  counter-ordered `requestAction` queue (1.2, `client/src/setup/netcode/request-action-queue.js`)
  for out-of-order self-board mirror actions. `SERVER_AUTHORITATIVE` stays off (D8) until
  slice 3.6's flip gate passes.
- `pnpm lint` fails on Windows CRLF across the codebase; lint changed files with
  `npx eslint --rule "prettier/prettier: off" <files>`.
- `pnpm test:2p` needs a running server first (`node server/server.js`, localhost:4000) —
  it does not boot one itself; kill it by PID after (`netstat -ano | grep :4000` then
  `taskkill //PID <pid> //F`) since background-subshell `node` isn't visible to `pkill` on
  Windows/git-bash.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S37 2026-09-09 feature(netcode slice 2.1): GameRoom.lastActivityAt (touched by addPlayer/
  handleCommand/pushAction ingest); empty-room sweep now requires ROOM_GRACE_MS (30 min) idle
  past empty sockets, and no longer deletes roomInfo from the authoritative branch; 1013 tests
  & test:2p green.
- S36 2026-09-09 feature(netcode slice 1.3): deleted dead sync-check scaffolding (emitSyncCheck/
  triggerSyncCheck stubs, heartbeat, dead relay entries); kept requestSyncLogBundle/syncLogBundle
  (design was wrong — live listeners found); removed stale worktree; 1009 tests & test:2p green.
- S35 2026-09-09 feature(netcode slice 1.2): counter-ordered requestAction queue replaces the
  moveCardBundle/counter-status exemptions; 1009 tests & test:2p green.
