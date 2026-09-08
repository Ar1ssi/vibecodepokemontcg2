# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 38
Focus: Netcode repair — design 002, slice 2.2 (clientSeq clearing, protocol version, emitCmd surfacing) built and merged
Active: none
Next: build slice 3.1 (instanceMap round-trip; index fallbacks deleted) — see NEXTSTEPS.md ledger; Phase 3 re-scope note in design applies
Blocked: none

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- All netcode work happens directly in the primary checkout (`main`) on short-lived
  `feature/netcode-repair-<slice>` branches, merged back and deleted — per explicit user
  instruction, no new worktree per slice.
- `pushAction` and `requestAction` must not be dropped: the server's own deck init is fed from
  the pushAction relay (server.js), and setup actions rely on it.
- Client-side imports of `shared/engine/*` from non-test files use the dual dynamic-import
  pattern (`/shared/...` absolute for the browser, relative as Node-test fallback) — a static
  relative `import` from a non-test client file breaks in the browser because `client/` is
  stripped from the served URL (express serves `clientDir` at `/`, `sharedDir` at `/shared`).
  See `cmd-emitter.js`'s `loadCommandsModule()`.
- `pnpm lint` fails on Windows CRLF across the codebase; lint changed files with
  `npx eslint --rule "prettier/prettier: off" <files>`.
- `pnpm test:2p` needs a running server first (`node server/server.js`, localhost:4000) —
  it does not boot one itself; kill it by PID after (`netstat -ano | grep :4000` then
  `taskkill //PID <pid> //F`) since background-subshell `node` isn't visible to `pkill` on
  Windows/git-bash.

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S38 2026-09-09 feature(netcode slice 2.2): `room.mjs` removeSocket clears `clientSeqByPlayer`
  (Finding #12); `cmd-emitter.js` resolves `PROTOCOL_VERSION` from the shared module and stamps
  it on the `cmd` envelope (Finding #7/#8); `joinGame` mismatch now emits `leaveRoom` so the
  server releases the seat (edge row 11); `process-action.js` routes `emitCmd` failures to
  `appendMessage`/`logSync` instead of a silent `.catch` (edge row 12); 1014 tests & test:2p green.
- S37 2026-09-09 feature(netcode slice 2.1): GameRoom.lastActivityAt (touched by addPlayer/
  handleCommand/pushAction ingest); empty-room sweep now requires ROOM_GRACE_MS (30 min) idle
  past empty sockets, and no longer deletes roomInfo from the authoritative branch; 1013 tests
  & test:2p green.
- S36 2026-09-09 feature(netcode slice 1.3): deleted dead sync-check scaffolding (emitSyncCheck/
  triggerSyncCheck stubs, heartbeat, dead relay entries); kept requestSyncLogBundle/syncLogBundle
  (design was wrong — live listeners found); removed stale worktree; 1009 tests & test:2p green.
