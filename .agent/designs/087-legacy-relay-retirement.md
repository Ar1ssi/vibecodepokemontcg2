# 087: Retire the legacy relay — the server always runs the rules
Status: building — slices 1–2 built 2026-11-12 on the user's go-ahead ("higher risk, do them yourself"); slice 3 struck by the user's decision 1 (D246); what the no-room board becomes is open (§ No-room board)
Date: 2026-11-12 · Session: cleanup after the 2026-11-12 size audit (I251 step 2)

## Problem
Two netcode modes existed: server authority (default since D216, the only mode production runs) and
the legacy relay (`SERVER_AUTHORITATIVE=0`), where clients ran the rules and the server forwarded
messages. Since the three.js board (D220) a relay room has no visible board (I264), so the mode
could not be played, yet 30 server branches, a spectator replay path and ~12 k lines of client
rules stayed alive for it.

## Constraints
- D216 server authority is the default; D220 the board is three.js only; D221 Solo is a server room.
- No protocol change: `joinGame`/`spectatorJoin` keep `serverAuthoritative: true` in their payload,
  because the client reads it to enter the view-driven mode (socket-event-listeners.js).
- Netcode change ⇒ a test that fails without it; no new dependency.

## Current state (read this session; maps by four read-only agents)
- Server: `server/server.js` branched on `SERVER_AUTHORITATIVE` at 30 sites. No handler, helper or
  import served the relay alone; the relay arm was guards plus two `requestSpectatorData` emits and
  a `roomInfo` re-create on reconnect.
- Client flag `systemState.serverAuthoritative` has TWO meanings when false: (a) a legacy relay
  room, (b) **not in any room** (before the join ack, after Leave, after `gameEnded server_restart`;
  writes at solo-room.js `leaveSoloRoom`, header-buttons.js, room-buttons.js `returnToLobby`).
  Only arms that also require `isTwoPlayer` were relay-only.
- Under authority the legacy action pipeline is still load-bearing: `pushAction` is relayed and
  replayed on the peer unless `isMirrorSuppressedAction` (accept-action.js); deck load / Set Up /
  Reset reach the GameRoom through `pushAction` (`handleSeatSetupAction`); acting on the
  opponent's card goes out as `requestAction` (process-action.js); look/reveal are plain relays;
  the action log feeds local undo replay and state export/import. So chat-buttons.js,
  rules-bridge.js and trainer-execution.js are live UI entry points with relay-era bodies behind
  `isAuthoritativeDispatchActive()` gates (19 sites) — not a separable dead mode.

## Options
1. Delete the relay mode on the server and only the client paths provably unreachable without it
   (pick). Small, verifiable against the browser harnesses, unblocks the rest.
2. Also delete every client `false` arm now. Rejected: those arms still run in state (b), and
   whether a no-room local board should exist at all is a product decision (below).

## Design
- Slice 1 (server): `SERVER_AUTHORITATIVE` constant gone; every branch takes its authority arm.
  `server/netcode-mode.mjs` exports `retiredLegacyRelayWarning(value): string | null` — a startup
  warning for `0|false|off|no`, nothing else. `roomReject solo_needs_authority` is gone with the
  branch that sent it. A reconnect to a room the server has no record of always ends the game
  (`gameEnded server_restart`); the relay's re-create is gone.
- Slice 2 (client, relay-only paths): the spectator action replay (`sendSpectatorData`,
  `emitSpectatorDataDebounced`, the `requestSpectatorData` / `spectatorActionData` handlers,
  `systemState.spectatorCounter` / `spectatorId` and the nine `spectatorId` name-swap branches that
  only the replay could arm); `spectatorJoin` always starts the view session; relay list loses
  `spectatorActionData` / `requestSpectatorData`; `solo_needs_authority` handling; the relay 2P
  harness (`two-player-sync-test.mjs`, `pnpm test:2p`) and playtest-bot's relay coin ritual;
  `createRelayedRng` (shadow mode, gone since D216).
- Kept on purpose: `requestAction` + its queue and peer-log catch-up (reachable under authority
  for opponent-card actions), `process-action.js:54`, `board3d.js` `legacy-netcode` refusal, and
  every state-(b) arm.

## Edge cases & failure modes
| Case | Expected | Covered |
|---|---|---|
| Operator still sets `SERVER_AUTHORITATIVE=0` | server boots authoritative, logs "is ignored" once | [x] netcode-mode.test "a server started with SERVER_AUTHORITATIVE=0 still runs the rules" |
| Other values (`1`, `legacy`, unset) | no warning | [x] netcode-mode.test "no warning…", "any other value…" |
| Spectator joins / reconnects | gets a server view, no replay request | [x] spectator-view harness: same 15 pass / 4 fail as base 87450d13 |
| Solo join | never refused for the mode | [x] solo-authority harness: same 13 pass / 1 fail as base |
| Stale tab emits `spectatorActionData` | not in the relay list: dropped | struck — no handler exists to test |
| Reconnect to a room lost in a restart | `gameEnded server_restart` | unchanged authority arm; no new test |

## Test plan
Unit: `server/__tests__/netcode-mode.test.mjs` (4), `public-room-view.test.mjs`, `rng.test.mjs`.
Browser: `scripts/e2e/spectator-view-test.mjs`, `solo-authority-test.mjs`, compared with base.
(In this sandbox the page's CDN socket.io is unreachable; the runs served it from node_modules.)

## Migration / rollout
No data. `render.yaml` drops the env var. Revert: `git revert` the slice commit.

## Work plan
| Slice | Files | Change | Tests | Green when |
|---|---|---|---|---|
| 1 ✔ | server/server.js, server/netcode-mode.mjs, server/__tests__/netcode-mode.test.mjs | as Design | 4 cases above | server + netcode suites pass |
| 2 ✔ | socket-event-listeners.js, spectator-join.js, clean-action-data.js, process-action.js, global-variables.js, header-buttons.js, room-buttons.js, solo-room.js, public-room-view.mjs (+test), shared/engine/rng.mjs (+test), scripts/e2e, package.json, README, render.yaml | as Design | harness parity with base | lint clean; suites pass |
| 3 | STRUCK 2026-11-12 (D246: the board outside a room stays) | delete the state-(b) arms: local undo replay, local shuffle/deal, `shouldExecuteLocalRulesEffect` callers, `trainer-execution.js` (2,979 lines, one call site rules-bridge.js `runTrainerSteps`), the client attack path in chat-buttons.js | | |
| 4 | not pinned — needs decision 2 | state export/import on the action log: keep, or rebuild on server views | | |
| 5 | not pinned | move the relayed `manual_override` / look-reveal actions to server commands, then drop `pushAction` mirroring and `requestAction` | | |

## Decisions the user owns
1. Should a board exist outside a room? → **Answered 2026-11-12: keep it** (D246). Slice 3 is struck.
2. Keep game-state export/import (it replays the client action log)? Moot while decision 1 stands:
   the action log and the client rules it replays stay.

## No-room board — found 2026-11-12, after decision 1
The board outside a room draws nothing today. The three.js board renders only server views
(board3d.js `onViewApplied` ← apply-view's `board-view-applied`); with no room there is no view, and
the local rules write to the hidden mirror (D220). Browser probe on 6852bd1f, page loaded, no tab
clicked: `loadFixtureDeck` both sides → local zones deck 20/20, mat empty; Set Up Both → local zones
deck 14 / prizes 6, chat prints "Both players are ready", the client "Call the coin" prompt opens,
and the mat still shows no cards. Clicking the Solo tab joins `solo-…` and the board draws. Design
074 § Deviations knew the page "still boots on the local board"; nothing draws that board (I283).
Open choice (user): (a) join the solo room at page load, so "outside a multiplayer room" is the solo
room; (b) keep the local rules and give three.js a second model source built from the local zones;
(c) leave it and tell the player to click Solo.

## Deviations
- The size audit expected the three legacy files to be deletable with the mode. They are not:
  see Current state. Slices 1–2 cut the mode; the 12 k lines need decisions 1–2.
