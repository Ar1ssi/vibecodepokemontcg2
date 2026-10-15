# 069: Public lobby rooms — a clickable room list in the Multiplayer tab
Status: draft (awaiting user approval)
Date: 2026-10-15 · Session: S-quirky-allen

## Problem
Today two players can only meet by sharing a room ID: one player generates or types an ID, sends it
out of band, and the other types it exactly (case-sensitive). There is no way to find a game from
inside the app. The ask: a fixed set of rooms that always exist and are listed live in the Multiplayer
tab. Click a room to sit down, or click Watch on a full room to spectate. No codes needed.

## Constraints
- Two seats per room; spectators unlimited (GameRoom.addPlayer caps at 2: server/game/room.mjs:97).
- D191: match format is room-level propose/accept on `roomInfo`, never engine state → public rooms
  must not preset a format without a new decision (see Options §5).
- D9/D44/Finding 7: a seated player who disconnects keeps their seat and resumes on reconnect;
  `userReconnected` re-seats by username (server/server.js ~823). Public rooms must keep that.
- D17: prod runs SERVER_AUTHORITATIVE=1; local/dev/tests run it off → the lobby must work in both
  modes (and in SHADOW_MODE).
- No new dependencies (D4). Seat tokens use Node's built-in `crypto.randomUUID`.
- Netcode change ⇒ feature.md approval gate + a review.md pass before landing on main.
- Every boundary handles empty/invalid input; state logic ships with tests that fail without it.

## Current state (read this session)
- `client/index.ejs:141-195`: `#p2Box` holds `#p2ExplanationBox` (the "enter or generate a unique
  room ID" text), `#lobby` (`#nameInput`, `#roomIdInput` + copy + Generate, `#coachingModeCheckbox`,
  `#spectatorModeCheckbox`, `#joinRoomButton`) and `#connectedRoom` (header with the room ID, format
  panel, chat, Leave Room).
- `client/src/initialization/document-event-listeners/sidebox/p2/room-buttons.js`: Generate sets the
  ID to `socket.id + '0'`. Join picks a random trainer name if the name box is empty, sets
  `systemState.roomId` and emits `joinGame(roomId, username, isSpectator)`. Leave resets the UI and
  emits `leaveRoom`.
- `client/src/initialization/socket-event-listeners/socket-event-listeners.js:302-395`: `joinGame`
  reply → `handleJoinGame` (hides `#lobby`, shows `#connectedRoom`, header `'id: ' + roomId`);
  `roomReject` → full-screen "room full" overlay (no reason payload); `connect` (:421) re-emits
  `userReconnected` while `isTwoPlayer`.
- 24 client sites read `#spectatorModeCheckbox.checked` as "am I spectating". It is state, not just
  an input.
- `server/server.js`: `roomInfo: Map<roomId, {players:Set<username>, spectators:Set<username>,
  setupActionCache, format}>` (:278). `joinGame` handler (:713-822) creates rooms on demand. A matching
  username always counts as `isExistingPlayer`, even while that seat's socket is live, and
  `GameRoom.addPlayer` then moves the seat to the new socket. `disconnectHandler` (:560) removes a
  username only on an explicit leave. On a plain disconnect the seat stays in `room.players` forever.
  `cleanUpEmptyRooms` (:304, every 5 min) deletes a GameRoom after ROOM_GRACE_MS (30 min) with no
  sockets, but keeps the roomInfo entry while `players` is non-empty. Once the GameRoom is gone, the
  join falls through to `room.players.size >= 2` → `roomReject`.
  **Consequence:** a room whose two players closed their tabs stays "full" until the server restarts.
  With throwaway codes nobody notices. With 8 permanent rooms it would lock the lobby within hours.
- `resetGameAfterPlayerLeft` (:350) drops a seat from the GameRoom and re-broadcasts a fresh game to
  the remaining player. `broadcastRoomFormat` (:540) emits `roomFormat` to a room.
- `shared/engine/commands.mjs:19` `PROTOCOL_VERSION = '2.0.0'`. A mismatch on `joinGame` tells the
  client to reload.
- `client/src/setup/general/e2e-api.js:477` `joinRoom(roomId, username)` drives the code UI. 10 root
  e2e scripts call it (two-player-sync-test.mjs, room-format-test.mjs, …).

## Options

### 1 · How rooms "pre-exist"
- A. Static list in a shared module; the server derives each listing from live `roomInfo`/`gameRooms`.
  A room with no entry is simply empty. No lifecycle change, nothing to persist.
- B. Rows in SQLite (`PublicRooms` table) that admins can edit. Adds a migration and admin surface for
  a list that rarely changes.
- C. Env-configured list (`PUBLIC_ROOMS=...`). Flexible, but the client needs the names too, and that
  means an extra fetch.
- **Pick A.** The rooms are product content, not data. A stays a one-line change to edit, and the
  client imports the same module from `/shared`.

### 2 · How the client learns room status
- A. Push: the client emits `lobbySubscribe` while the Multiplayer tab's lobby is visible. The server
  replies with a snapshot and re-emits `lobbyRooms` (debounced 250 ms) on any seat/format/deal change
  in a public room.
- B. Poll `GET /api/lobby` every 5 s. Simpler server, but stale for up to 5 s, and two players can
  click the same "open" seat.
- **Pick A.** Socket.IO already exists. Live status matters for "is someone waiting?", and the
  debounce bounds the cost.

### 3 · Ghost seats (players who closed their tab)
- A. Release a public-room seat whose owner has had no socket for `PUBLIC_SEAT_RELEASE_MS`
  (default 180 000, env-overridable). Until then the listing shows them as "reconnecting".
- B. Release immediately on disconnect. This breaks the reconnect guarantees (D9, Finding 7) on every
  network blip.
- C. Leave it alone. The lobby locks up (see Current state).
- **Pick A, public rooms only.** Code rooms keep today's behavior (no regression risk; filed as an
  ISSUES line).

### 4 · Seat identity (the lobby shows usernames)
Today a matching username takes over a seat, even one whose socket is live. With names listed
publicly, anyone can take over a seat by typing the name shown.
- A. Seat token: on first seating in a public room the server issues `crypto.randomUUID()`. The
  client keeps it in sessionStorage and sends it with `joinGame` and `userReconnected`. A seated
  username without the matching token is rejected `name_taken`.
- B. Hide usernames in the listing ("1/2 players"). Cheap, but a guessable name (the random trainer
  names) still takes the seat.
- C. Accounts/login. Out of scope.
- **Pick A, and show the names.** It closes the takeover hole completely for public rooms. Code rooms
  are unchanged.

### 5 · Format per room (D191 interaction)
- A. Rooms carry no preset format. The listing shows the agreed format once players set one (D191
  unchanged).
- B. Half the rooms locked to Standard, half to Build & Battle (supersedes D191 for public rooms).
- **Pick A for v1** and ask the user. B is a follow-up that needs its own decision.

### 6 · Room codes
- A. Keep them behind a collapsed "Private room (with code)" section under the list. Same code path
  as today, so the e2e scripts keep working.
- B. Remove them. Friends lose a private table, and 10 e2e scripts need rewriting.
- **Pick A.** It is also the low-risk path.

### 7 · Spectate control
- A. Each row gets Join (seat open) and Watch (always). Watch sets the hidden
  `#spectatorModeCheckbox` before emitting, so the 24 existing readers keep working.
- B. Replace the checkbox with `systemState.isSpectator` everywhere. That is a 24-site refactor
  mixed into a netcode feature.
- **Pick A.** The checkbox becomes a hidden state carrier (ISSUES line to retire it later).

## Design

### Data — `shared/lobby/public-rooms.mjs` (new, served at /shared)
```
PUBLIC_ROOM_PREFIX = 'public:'
PUBLIC_ROOMS = frozen [{ id: 'public:pallet', name: 'Pallet Town' }, … 8 entries]
isPublicRoomId(roomId: unknown) → boolean      // string && in PUBLIC_ROOMS
publicRoomName(roomId: unknown) → string|null
```
Room names (taste call, user may rename): Pallet Town, Viridian City, Pewter City, Cerulean City,
Vermilion City, Lavender Town, Celadon City, Saffron City. An ID typed as a code that equals a public
ID simply joins that public room. It is the same room, so no special-casing is needed.

### Server state additions (on the existing `roomInfo` entry, public rooms only)
```
room.presence:   Map<username, { socketId: string|null, disconnectedAt: number|null }>
room.seatTokens: Map<username, string>
```
Created lazily by the pure helpers below. Code rooms never get them.

### Pure server modules (unit-tested, no io/socket imports)
`server/lobby/seat-presence.mjs`
```
markSeatConnected(room, username, socketId)           // presence = {socketId, disconnectedAt:null}
markSeatDisconnected(room, username, now)             // presence = {socketId:null, disconnectedAt:now}; no-op if unseated
forgetSeat(room, username)                            // deletes presence + token
releasableSeats(room, now, releaseMs) → string[]      // seated usernames with disconnectedAt && now-disconnectedAt >= releaseMs
```
`server/lobby/seat-token.mjs`
```
issueSeatToken(room, username, mint = crypto.randomUUID) → string   // overwrites any old token
checkSeatClaim(room, username, token) → 'new' | 'owner' | 'taken'
  // 'new'   : username not in room.players
  // 'owner' : seated and token === room.seatTokens.get(username)
  // 'taken' : seated and token missing/mismatched
```
`server/lobby/lobby-directory.mjs`
```
describePublicRoom({ id, name, room, gameRoom, serverAuthoritative }) → {
  id, name,
  players: [{ username, connected: boolean }],   // join order, ≤2
  spectators: number,
  format: 'tcg' | 'build-battle' | null,         // room.format.format
  status: 'open' | 'waiting' | 'full' | 'in-game'
}
  // open: 0 seated · waiting: 1 seated · full: 2 seated, not dealt · in-game: 2 seated and
  // serverAuthoritative && roomFormatLocked(gameRoom) (the existing "dealt" test, server.js:555)
buildLobbySnapshot({ roomInfo, gameRooms, serverAuthoritative }) → { rooms: PublicRoomSummary[] }
  // one entry per PUBLIC_ROOMS item in list order; missing roomInfo → status 'open', empty lists
```

`server/lobby/public-seat-flow.mjs` holds the decisions server.js makes, so they are testable without sockets:
```
decideJoin({ room, username, token, isSpectator, seatsFull }) → { action: 'seat'|'spectate'|'reject', reason?: 'full'|'name_taken', issueToken: boolean }
decideReconnect({ room, username, token }) → { action: 'seat'|'reject', reason?: 'name_taken' }
planSweep({ roomInfo, now, releaseMs }) → [{ roomId, username }]    // public rooms only
createDebouncer(ms, fn, timers = globalThis) → () => void           // trailing-edge, one pending timer
```

### Socket protocol (additive; PROTOCOL_VERSION → '2.1.0')
| Direction | Event | Payload |
|---|---|---|
| C→S | `lobbySubscribe` | none → socket joins Socket.IO room `lobby:watchers`, gets `lobbyRooms` now |
| C→S | `lobbyUnsubscribe` | none → leaves `lobby:watchers` |
| S→C | `lobbyRooms` | `{ rooms: PublicRoomSummary[] }` |
| C→S | `joinGame` | existing args + 4th arg `seatToken?: string` |
| S→C | `joinGame` | existing payload + `seatToken?: string` (public rooms, seated only) |
| C→S | `userReconnected` | existing payload + `seatToken?: string` |
| S→C | `roomReject` | now `{ reason: 'full' \| 'name_taken' \| 'seat_failed' }` (was empty) |

### Server control flow (server/server.js)
- `notifyLobby(roomId)`: no-op unless `isPublicRoomId(roomId)`. Otherwise it schedules one debounced
  (250 ms, single shared timer) `io.to('lobby:watchers').emit('lobbyRooms', buildLobbySnapshot(...))`.
  It is called after: joinGame (seat/spectate), every disconnectHandler path, userReconnected,
  seat release, `setRoomFormat`, `dealOpeningHands`, `resetGameOnPlayerRequest`.
- `joinGame` for a public room, seated path: compute `claim = checkSeatClaim(room, username, token)`
  before the existing full checks. `'taken'` → `roomReject {reason:'name_taken'}`, return.
  `'owner'` → existing `isExistingPlayer` path. `'new'` → existing path. On a successful seat:
  `markSeatConnected`. On `'new'`, also `issueSeatToken` and include it in the `joinGame` reply.
- `userReconnected` for a public room, non-spectator: `checkSeatClaim` must be `'owner'`, else
  `roomReject {reason:'name_taken'}`. On success, `markSeatConnected`.
- `disconnectHandler`, unintended path, public room, seated username: `markSeatDisconnected(now)`.
  Explicit leave path: the existing branch plus `forgetSeat`.
- Extract the leave-as-player block (:584-595 + the `resetGameAfterPlayerLeft` branch) into
  `releasePlayerSeat(roomId, room, username)` so the explicit leave and the sweep share one path.
  The sweep variant also emits `io.to(roomId).emit('leaveRoom', {roomId, username, isSpectator:false})`
  so the remaining player sees the opponent leave exactly as with a manual Leave.
- `sweepPublicSeats()` runs on `setInterval` every 15 s. For each public room:
  `releasableSeats(room, Date.now(), PUBLIC_SEAT_RELEASE_MS)` → `releasePlayerSeat` each → `notifyLobby`.
  `PUBLIC_SEAT_RELEASE_MS` follows the ROOM_GRACE_MS env pattern (server.js:52).
- `cleanUpEmptyRooms` stays unchanged. A released public room hits its existing empty-room paths.

### Client
- `client/index.ejs` `#p2Box`: the explanation becomes "Pick a room to play, or watch a full one." The
  room-ID row, Generate, and Join Room button move into `<details id="privateRoomDetails"><summary>Private
  room (with code)</summary>…</details>`, with all IDs unchanged. `#spectatorModeCheckbox` and its label
  move inside that `<details>` (still the spectate control for code rooms). New `<ul id="publicRoomList"
  aria-live="polite">` sits between `#nameInput` and `#privateRoomDetails`.
- `client/src/setup/lobby/public-room-view.mjs` (new, pure): `publicRoomRows(rooms) → [{ id, name,
  statusLabel, playersLabel, formatLabel, canJoin, canWatch }]`. Labels: open → "Open"; waiting →
  "<name> is waiting"; a player with `connected:false` → "<name> (reconnecting)"; full → "Full";
  in-game → "In game". `canJoin = status ∈ {open, waiting}`, `canWatch = status !== 'open'`.
  `formatLabel`: tcg → "Standard", build-battle → "Build & Battle", null → "".
- `client/src/setup/lobby/public-room-list.js` (new, DOM): renders rows into `#publicRoomList`. Join →
  `joinRoomById(id, {spectate:false})`, Watch → `joinRoomById(id, {spectate:true})`. Subscribes on
  init and on `room-changed` when `!systemState.isTwoPlayer`; unsubscribes when a room is joined. It
  also re-subscribes on socket `connect` while in the lobby.
- `room-buttons.js`: extract the Join click body into exported `joinRoomById(roomId, { spectate })`.
  It sets `#spectatorModeCheckbox.checked = spectate`, `#roomIdInput.value = roomId` (the header copy
  button keeps working), picks the username as today, and reads the stored token via `seat-token-store`.
  The code Join button calls `joinRoomById(roomIdInput.value.trim(), { spectate: checkbox.checked })`.
- `client/src/setup/lobby/seat-token-store.mjs` (new): `readSeatToken(roomId, username) → string|null`,
  `writeSeatToken(roomId, username, token)`, `clearSeatToken(roomId)`. sessionStorage key
  `ptcg.seatToken.<roomId>` → JSON `{username, token}`. Every access is try/catch'd; on any failure it
  returns null or no-ops.
- `handleJoinGame`: if `data.seatToken` → `writeSeatToken`. The header reads `publicRoomName(roomId) ??
  'id: ' + roomId`. `connect` handler: add `seatToken: readSeatToken(...)` to `userReconnected`. Leave
  Room: `clearSeatToken(roomId)`.
- `roomReject` overlay text by reason: full → existing text; name_taken → "Someone in this room is
  already using that name — pick another username."; seat_failed/absent → existing text.
- CSS (index.css next to `#lobby` :913): row layout (name, status, format chip, Join/Watch buttons),
  dark-mode-1 variant. Visual-only, exempt from tests and checked on localhost.
- `e2e-api.js`: add `joinPublicRoom(roomId, username, { spectate })` → `joinRoomById`. Keep `joinRoom`.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | No rooms have roomInfo (fresh server) | Snapshot lists all 8 as `open`, 0 spectators | [ ] |
| 2 | Malformed `joinGame` token (number, 10 kB string) / unknown roomId on subscribe | Token non-string → treated as missing; `lobbySubscribe` ignores payload | [ ] |
| 3 | Seat release exactly at `releaseMs` / at `releaseMs-1` | Released at ≥, kept at < | [ ] |
| 4 | Two players click the same last seat at once | Socket.IO serializes; second hits the existing full check → `roomReject {full}`; lobby updates | [ ] |
| 5 | Same username, no/wrong token, seat owner connected | `roomReject {name_taken}`; owner's socket untouched | [ ] |
| 6 | Same username, no token, owner disconnected within grace | `roomReject {name_taken}` (no takeover via listing) | [ ] |
| 7 | Owner reloads tab (sessionStorage kept) and clicks the room | Token matches → `owner` → existing rejoin path (`rejoinedGame`) | [ ] |
| 8 | Owner disconnects, reconnects after grace (seat released) | `userReconnected` → claim `new` but seat gone; if room has space they are re-seated fresh, else `roomReject {full}` | [ ] |
| 9 | Remaining player when opponent's seat is released mid-game | Receives `leaveRoom` + fresh-game view (same as manual leave); lobby shows `waiting` | [ ] |
| 10 | sessionStorage throws (private mode) | Token store no-ops; join works; reload rejoin then needs grace expiry (documented) | [ ] |
| 11 | Burst of 50 seat/format changes in 1 s | ≤ 5 `lobbyRooms` emits (250 ms debounce) | [ ] |
| 12 | Code room activity | No `lobbyRooms` emit, no presence/token state, no release sweep | [ ] |
| 13 | SERVER_AUTHORITATIVE off | Status never `in-game` (full instead); release still frees `room.players` | [ ] |
| 14 | Spectator leaves/disconnects | Spectator count drops; no seat logic touched | [ ] |
| 15 | Old client (2.0.0) joins | Existing protocol mismatch path → "reload" message + leaveRoom | [ ] |
| 16 | Player in a room has lobby tab open in a second tab | Second tab is just a watcher; joining a seated name there → `name_taken` | [ ] |
| 17 | Server restart | All rooms `open`; stale client gets existing `server_restart` path; stale token harmless (claim `new`) | [ ] |
| 18 | Dependency fails/times out | n/a — no external dependency; `crypto.randomUUID` is synchronous built-in | struck |
| 19 | Crash between release steps | n/a — release is synchronous in one tick; no persisted state | struck |

## Test plan
- Unit (`node --test`): `shared/lobby/__tests__/public-rooms.test.mjs`,
  `server/lobby/__tests__/{seat-presence,seat-token,lobby-directory}.test.mjs`,
  `client/src/setup/lobby/__tests__/{public-room-view,seat-token-store}.test.mjs`. These cover rows
  1-3, 5-6, 10, 12-14 through the pure functions.
- Integration: `socket.io-client` is not a dependency (package.json) and adding one would need a
  DECISIONS line. Instead, the server wiring stays thin. The claim → seat → presence → release
  sequence lives in a pure `server/lobby/public-seat-flow.mjs` (`decideJoin`, `decideReconnect`,
  `planSweep`) that server.js calls, so rows 4-9, 11 and 16 are unit-tested there with fake rooms.
  The socket paths are covered end to end by the Playwright e2e below.
- e2e: new root `public-lobby-test.mjs` (pattern of `room-format-test.mjs`), run against
  `PUBLIC_SEAT_RELEASE_MS=2000 SERVER_AUTHORITATIVE=1`. Steps: two pages click Pallet Town → both
  seated. A third page sees "Full" and Watch works. Page 3 joins as page 1's name → `name_taken`.
  Page 1 closes → page 2 sees the leave within ~2 s + one sweep → the list shows "waiting".
- Manual: user checks the list's look on localhost (visual exempt).

## Migration / rollout
n/a for data: no schema, nothing persisted. Rollout is the PROTOCOL_VERSION bump (old tabs get the
existing "reload" prompt). Revert path: revert the merge commit. Code rooms are untouched, so a
revert loses only the list. Tuning without a deploy: `PUBLIC_SEAT_RELEASE_MS` env.

## Work plan — slices ≤1 session, each leaving the repo green
| Slice | Files (create / modify) | Signatures & data shapes | Test cases: input → expected | Rulings used | Green when |
|---|---|---|---|---|---|
| 1 | C `shared/lobby/public-rooms.mjs`, C `server/lobby/{seat-presence,seat-token,lobby-directory}.mjs` + tests | As in Design §Data/§Pure modules | `isPublicRoomId('public:pallet')`→true, `('abc')`→false, `(5)`→false; release at 180000→['Ash'], 179999→[]; claim seated+right token→'owner', wrong→'taken', unseated→'new'; snapshot on empty Map→8×open; 2 seated + dealt + auth→'in-game', auth off→'full' | n/a (no card rules) | new tests + `pnpm test:changed` pass |
| 2 | C `server/lobby/public-seat-flow.mjs` + test; M `server/server.js` (notifyLobby, lobby events, token claim in joinGame/userReconnected, presence marks, `releasePlayerSeat` extract, sweep, env const), M `shared/engine/commands.mjs` (2.1.0) | Protocol table above; `decideJoin({room, username, token, isSpectator, seatsFull}) → {action:'seat'\|'spectate'\|'reject', reason?, issueToken:boolean}`; `decideReconnect({room, username, token}) → {action:'seat'\|'reject', reason?}`; `planSweep({roomInfo, now, releaseMs}) → [{roomId, username}]`; `createDebouncer(ms, fn, timers = globalThis)` | rows 4-9, 11, 12, 16 via public-seat-flow tests (e.g. seated Ash + no token → reject name_taken; 50 calls in 1 s with fake timers → ≤5 fn calls) | n/a | unit tests + `pnpm gates`-required suite green; existing room e2e scripts pass |
| 3 | C `client/src/setup/lobby/{public-room-view.mjs,public-room-list.js,seat-token-store.mjs}` + tests; M `room-buttons.js` (`joinRoomById`), M `socket-event-listeners.js` (token write/read, header name, reject reasons), M `client/index.ejs`, M `client/src/css/index.css`, M `e2e-api.js` | As in Design §Client | view: waiting{Ash}→"Ash is waiting", canJoin true, canWatch true; open→canWatch false; disconnected→"(reconnecting)"; store with throwing storage→null | n/a | unit tests green; `public-lobby-test.mjs` passes; existing `room-format-test.mjs` + `two-player-sync-test.mjs` still pass |
| 4 | review.md pass (fresh agent), fixes; M `.agent/DECISIONS.md` (picks 1-4,6,7), `.agent/MAP.md` (3 new dirs), `.agent/ISSUES.md` (code-room ghost seats + takeover; retire spectator checkbox; fixed-format rooms if user wants B) | — | — | — | full `pnpm test` green; user localhost check of list styling |

## Open questions for the user
1. Room count/names: 8 Kanto towns OK, or e.g. "Table 1-8" / more rooms?
2. Format: rooms without a preset format (D191 as is), or lock some rooms to Standard and some to Build & Battle?
3. Keep private code rooms (collapsed under the list)? Recommended: yes.
4. Seat release after 3 min disconnected: OK, or longer?

## Deviations (Builder appends here during build)
