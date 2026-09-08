# State — the single source of "now". Rewritten IN FULL at every session END. Cap: 40 lines.
<!-- Keep exactly these sections. Prune, never accrete: this file is read by every session,
     so every stale line here is a tax on all future work. History belongs in journal/.
     Contradicts git log / the journal (a session died before END)? Trust git: rebuild this
     file from the last journal entry + `git log -5`, note the crash in the journal. -->

Session: 39
Focus: Netcode repair — design 002 Phase 3 re-scoped into 3A/3B/3C after Phases 0-2 shipped
Active: none
Next: build slice 3.1 (instanceMap round-trip; index fallbacks deleted) — first slice of Phase 3A
Blocked: O4 (migration end state) is OPEN and gates Phase 3B — rule on it with slice 3.5 evidence,
  not before. Phase 3A (3.1-3.5) is unblocked and can start now.

## Watch-outs (≤5 — things the next session must know; prune ruthlessly)
- Phase 3 has ZERO production exposure: flag is off (D8) and the §0.2 `resolveRenderTargets` guard
  makes `applyView` a no-op until a real zone resolver is wired (slice 3.6). Do not treat 3A slices
  as risky, and do not wire `getZone` in early — that is slice 3.6, gated behind O4.
- The authoritative renderer is NOT one wiring change from working: it emits a bare
  `<img class="card-image">` with no listeners, while legacy `Card.buildImage` attaches seven
  (click/dblclick/drag×4/contextmenu), damage counters are sibling `<div>`s, and `Cover` is a
  separate image. That gap is Phase 3B, ~5 slices.
- All netcode work happens in the primary checkout (`main`) on short-lived
  `feature/netcode-repair-<slice>` branches, merged back and deleted — per explicit user instruction.
- Client-side imports of `shared/engine/*` from non-test files use the dual dynamic-import pattern
  (`/shared/...` absolute for the browser, relative as Node-test fallback) — see `cmd-emitter.js`'s
  `loadCommandsModule()`. A static relative import from a non-test client file breaks in the browser.
- `pnpm test:2p` needs a running server first (`node server/server.js`, localhost:4000); it does not
  boot one. Kill by PID after (`netstat -ano | grep :4000`, then `taskkill //PID <pid> //F`).

## Recently shipped (≤3 one-liners; anything older lives in the journal)
- S39 2026-09-09 feature(design): re-scoped design 002 Phase 3 into 3A (server correctness, 9 slices)
  / O4 gate / 3B (renderer parity, 5 slices) / 3C (flip); added Options O4, edge rows 17-24, filed I15.
- S38 2026-09-09 feature(netcode slice 2.2): `room.mjs` removeSocket clears `clientSeqByPlayer`;
  `cmd-emitter.js` stamps `PROTOCOL_VERSION`; `joinGame` mismatch emits `leaveRoom` to release the
  seat; `process-action.js` surfaces `emitCmd` failures; 1014 tests & test:2p green.
- S37 2026-09-09 feature(netcode slice 2.1): GameRoom.lastActivityAt; empty-room sweep requires
  ROOM_GRACE_MS (30 min) idle and no longer deletes roomInfo from the authoritative branch.
