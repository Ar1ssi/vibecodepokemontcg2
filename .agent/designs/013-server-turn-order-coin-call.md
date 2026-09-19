# 013: Server-owned turn-order coin call
Status: approved (user)
Date: 2026-09-18 · Session: S173

## Problem
Under `SERVER_AUTHORITATIVE`, the opening coin flip is theater. `setupGame()` picks the starter
from the server's own RNG before any call happens (`shared/engine/setup.mjs:140`), and the client
overrides its local flip with that starter (`rules-bridge.js:766`, I27's accepted "cosmetic loss").
The user additionally reports the heads/tails call picker never opens at all in live 2P, so the
match begins with a random first player and no player input. Make the call real and server-owned.

## Constraints
- D10 / design 001: the server never trusts client-supplied randomness. The coin RESULT must come
  from the server's RNG; the client may only supply the caller's heads/tails CALL.
- Invariant 6 (`shared/engine/rng.mjs`): game randomness is a seeded, replayable stream. The flip
  must not add an unseeded `Math.random()` to the authoritative path.
- Legacy (flag-off) 2P must keep working unchanged — the existing peer-to-peer `rulesEvent`
  coin flow stays as the flag-off path (STATE watch-out: netcode verified under
  `SERVER_AUTHORITATIVE=1` only).
- `GameState` is hashed and replayed (`hashState`, commandLog/undo). Transient call bookkeeping
  must live OUTSIDE `state`, like `GameRoom.readyPlayerIds` (room.mjs:53).
- A disconnected or silent caller must never hang the match.

## Current state
- `server/server.js:367` `dealOpeningHandsIfReady(gameRoom, roomId, socketId)` — fires the `setup`
  command the instant `gameRoom.isReadyToDeal()` is true, with `payload: {}`; then broadcasts the
  post-setup `view` and per-player `dealOrder` `{ roomId, order, starter }` (`server.js:405`).
- `shared/engine/reduce.mjs:1527` `case 'setup'` — already forwards `payload.firstPlayerId` into
  `setupGame`. Nothing ever sets it.
- `shared/engine/setup.mjs:136-142` — `starter = firstPlayerId` when supplied and valid, else
  `activeRng.next() < 0.5 ? playerIds[0] : playerIds[1]`.
- `server/game/room.mjs` — `this.rng = createRng(this.seed)` (line 34), `readyPlayerIds` (53),
  `isReadyToDeal()` (375), `resetGame()` (416).
- `client/src/actions/general/ready.js:142` — after both Set Ups, `await setupPrizes('self')`
  (which itself awaits `dealOrder`) then dispatches `both-players-ready`.
- `client/src/setup/rules/rules-bridge.js` — `handleSetupClick` (654) gates on
  `openingSetupReadyForCoinFlip`, derives a designated caller from the two socket ids
  (`resolveTurnOrderCaller`, 713), opens `openCoinCallPicker` (729), flips locally in
  `runTurnOrderCoinFlip` (748) and overrides the outcome with `getDealOrderStarter()` (766).
  Peer mirror arrives as the `turnOrderCoinFlip` rulesEvent (1389).
- `client/src/setup/netcode/deal-order.js` — caches the server's `starter`;
  `getDealOrderStarter()` is what currently silences the local flip.
- `shared/engine/rules/rules-turnorder.mjs` — `decideTurnOrder({caller, call, result})` (pure,
  local 'self'/'opp' perspective) and `resolveTurnOrderCaller` (socket-id based caller pick).

Why the picker never opens today (2P, flag on): the only trigger is `both-players-ready`, which
ready.js dispatches only AFTER `setupPrizes` resolves, and `setupPrizes` awaits `dealOrder` — which
the server emits only after it has already dealt and already chosen the starter. So even on the
happy path the call could never precede the decision; and when `systemState.opponentSocketId` is
still empty at that moment `handleSetupClick` returns after emitting `peerSocketId`
(rules-bridge.js:706-712), leaving the picker dependent on a reply race. The new design removes both
couplings: the picker is driven by a server message sent BEFORE the deal.

## Options

### A. Where the call lives
- **A1 — reuse `state.pendingChoice`.** Pro: one prompt mechanism. Con: `pendingChoice` validation
  is card-instanceId based (`reduce.mjs:1238` intersects `options` with instanceIds, min/max card
  counts), so a heads/tails prompt needs a new non-card choice kind threaded through `reduce`,
  `view.mjs` redaction and every client picker — a schema change to the pure engine for one prompt,
  and it lands in `hashState`/commandLog.
- **A2 (pick) — dedicated socket handshake on `GameRoom`, outside `GameState`.** Pro: zero engine
  schema change; the transient call state cannot pollute hashes, undo or replay; mirrors the
  existing `readyPlayerIds` precedent. Con: one more bespoke message pair in server.js.

Pick A2: the call is a pre-game handshake, not a game action; it produces exactly one durable
effect (`setup`'s `firstPlayerId`), which the command log already records.

### B. Who calls
- **B1 — keep the socket-id hash (`resolveTurnOrderCaller`).** Con: needs both clients to know each
  other's socket id; that exchange is exactly what is racing today.
- **B2 (pick) — the server picks the caller from its own seeded RNG** over the registered playerIds.
  Pro: no peer exchange, deterministic under the room seed, and it is the same authority that flips.
  Con: `resolveTurnOrderCaller` becomes flag-off-only code (kept for legacy).

### C. Silent / disconnected caller
- **C1 — wait forever.** Rejected: hangs the match.
- **C2 (pick) — server-side timeout (`TURN_ORDER_CALL_TIMEOUT_MS = 15000`); on expiry the server
  flips the call itself from its own RNG and proceeds**, broadcasting `auto: true` so both clients
  can say so in chat. Pro: the game always starts. Con: a slow caller loses the call.

### D. Legacy (flag-off) path
- **D1 (pick) — untouched.** The server only runs the handshake when `SERVER_AUTHORITATIVE` is on;
  `rules-bridge.js` skips its local caller-derivation/flip only when
  `systemState.isTwoPlayer && systemState.serverAuthoritative`. Flag-off keeps the peer-to-peer flow.

## Design

### New pure module — `shared/engine/rules/turn-order-flip.mjs`
```js
export const COIN_FACES = ['heads', 'tails'];
export const isCoinFace = (value) => value === 'heads' || value === 'tails';
/** @returns {'heads'|'tails'} */
export function flipCoinFace(rng);                  // rng.next() < 0.5 ? 'heads' : 'tails'
/** @returns {string|null} playerId, null when fewer than 2 ids */
export function pickCoinCaller(playerIds, rng);     // sorted ids, rng.next() < 0.5 ? [0] : [1]
/** @returns {string|null} playerId that goes first */
export function resolveStarterPlayerId({ playerIds, callerPlayerId, call, result });
//   caller wins iff result === call; otherwise the other id. Invalid call/result -> the other id.
```
`rng` is the `createRng` shape used everywhere else (`{ next() }`) — read `shared/engine/rng.mjs`
before use.

### `GameRoom` (server/game/room.mjs) — transient, never in `state`
```js
this.turnOrder = null; // null | { phase, callerPlayerId, callId, call, result, starterPlayerId, auto }
```
- `beginTurnOrderCall()` → `{ callerPlayerId, callId } | null`
  Returns null when `!isReadyToDeal()`, when `this.turnOrder` already exists, or when fewer than two
  registered players. Otherwise picks the caller via `pickCoinCaller(playerIds, this.rng)`, mints
  `callId` (`${roomId}:${counter}`), sets `phase: 'awaiting-call'`.
- `submitTurnOrderCall(socketId, { callId, call })` → `{ ok: true, ...resolution } | { ok: false, reason }`
  Rejects: no `turnOrder` (`'no_pending_call'`), phase not `'awaiting-call'` (`'already_resolved'`),
  socket maps to a different playerId than `callerPlayerId` (`'not_caller'`), `callId` mismatch
  (`'stale_call'`), `!isCoinFace(call)` (`'invalid_call'`). On success: `result = flipCoinFace(this.rng)`,
  `starterPlayerId = resolveStarterPlayerId(...)`, `phase: 'resolved'`.
- `resolveTurnOrderCallAutomatically()` → same resolution shape with `auto: true` and `call` drawn
  from `flipCoinFace(this.rng)`. Used by the timeout and by a caller disconnect.
- `resetGame()` clears `this.turnOrder = null` (alongside `readyPlayerIds`).

### Socket protocol (server/server.js) — only when `SERVER_AUTHORITATIVE`
1. `dealOpeningHandsIfReady` becomes a two-stage gate:
   - `isReadyToDeal()` and `gameRoom.turnOrder === null` → `beginTurnOrderCall()`, then
     `io.to(callerSocket).emit('turnOrderCall', { roomId, callId, timeoutMs })` and
     `io.to(otherSocket).emit('turnOrderCall', { roomId, callId: null, waiting: true })`.
     Arm `setTimeout(timeoutMs)`, stored on the room (`turnOrderTimer`).
   - It does NOT deal yet. Dealing happens in `finishTurnOrder(gameRoom, roomId, resolution)`.
2. `socket.on('turnOrderCall', ({ roomId, callId, call }))` → `submitTurnOrderCall`. On
   `{ ok: false }` emit `turnOrderCallRejected { reason }` to that socket only. On success: clear the
   timer, `finishTurnOrder`.
3. `finishTurnOrder`: per recipient emit
   `turnOrderResult { roomId, caller: 'self'|'opp', call, result, starter: 'self'|'opp', auto }`,
   then run the existing deal with `payload: { firstPlayerId: starterPlayerId }` plus the existing
   `view` and `dealOrder` broadcasts (unchanged, so `dealOrder.starter` now equals the called result).
4. Caller disconnects while `phase === 'awaiting-call'` → `resolveTurnOrderCallAutomatically()` +
   `finishTurnOrder` (same path as the timeout).

### Client
- New `client/src/setup/netcode/turn-order-call.js` — adapter registered from
  `socket-event-listeners.js` next to the `dealOrder` listener (line 479), so it is live while
  `setupPrizes` still awaits `dealOrder`:
  - `turnOrderCall` → `document.dispatchEvent(new CustomEvent('rules-turn-order-call', { detail }))`
  - `turnOrderResult` → caches `{ caller, call, result, starter, auto }` and dispatches
    `rules-turn-order-result`; `getTurnOrderResult()` / `resetTurnOrder()` exported for late
    listeners and room/reset teardown.
- `rules-bridge.js`:
  - `handleSetupClick`: when `systemState.isTwoPlayer && systemState.serverAuthoritative`, do nothing
    (the server drives) except consume an already-cached `turnOrderResult`.
  - On `rules-turn-order-call` with a `callId` → `openCoinCallPicker({ onCall })`, whose `onCall`
    emits `socket.emit('turnOrderCall', { roomId, callId, call })`. With `waiting: true` →
    `appendMessage('', 'Waiting for opponent to call the coin…', 'announcement', false)`.
  - On `rules-turn-order-result` → `playTurnOrderCoinAnimation({ coin, result, coinOwner,
    turnPlayer: starter, isRemote: caller !== 'self' })`, a chat line naming the call and the winner
    (plus "(auto)" when `auto`), then `beginSetupWithTurnOrder(starter)` once
    `openingSetupReadyForCoinFlip` is true — if the result lands first it stays cached and the
    `both-players-ready` handler consumes it.
  - `runTurnOrderCoinFlip`'s `getDealOrderStarter()` override stays (flag-on never reaches it,
    flag-off is unaffected) — see Deletes.
- `coinOwner` stays cosmetic and local (`getSelectedCoin`/`pickRandomCoin`); only `result` and
  `starter` come from the server.

### Deletes / obsolete
- `resolveTurnOrderCaller` is now flag-off-only. Kept because the legacy path still calls it, noted
  here so a future flag-off removal takes it along.
- No dead code introduced; the `getDealOrderStarter()` override becomes unreachable under the flag
  but remains correct legacy-2P behavior and the fallback if a `turnOrderResult` is ever lost.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | `beginTurnOrderCall` with fewer than 2 registered players | returns null; no deal, no emit | [ ] |
| 2 | `submitTurnOrderCall` with `call` not 'heads'/'tails' (null, number, object) | `{ ok:false, reason:'invalid_call' }`, phase stays `awaiting-call` | [ ] |
| 3 | Non-caller socket submits a call | `{ ok:false, reason:'not_caller' }`; game not started | [ ] |
| 4 | Caller submits twice (double-click, duplicate socket event) | second → `{ ok:false, reason:'already_resolved' }`; `setup` runs exactly once | [ ] |
| 5 | Caller never answers | after `TURN_ORDER_CALL_TIMEOUT_MS` the server auto-calls and deals; both clients get `turnOrderResult` with `auto:true` | [ ] |
| 6 | Caller disconnects mid-call | same auto-resolution as the timeout; no orphaned `awaiting-call` room | [ ] |
| 7 | Stale `callId` after a `resetGame` | `{ ok:false, reason:'stale_call' }`; the new game's own call is unaffected | [ ] |
| 8 | `turnOrderResult` arrives before `both-players-ready` | cached, consumed by the ready handler; game starts once, no double `startGame` | [ ] |
| 9 | Flag OFF (legacy 2P) | server sends no `turnOrderCall`; the peer-to-peer flow is identical to today | [ ] |
| 10 | Spectator socket submits a call | `{ ok:false, reason:'not_caller' }` (spectators map to no playerId) | [ ] |
| 11 | Starter matches the call | `result === call` → caller goes first, else the other player — asserted on the resolved `state.turn.player` | [ ] |

## Test plan
- Unit (`node --test`): `shared/engine/rules/__tests__/turn-order-flip.test.mjs` — `flipCoinFace`
  over a stub rng, `pickCoinCaller` determinism and id ordering, `resolveStarterPlayerId`
  win/lose/invalid.
- Unit: `server/game/__tests__/room-turn-order.test.mjs` — rows 1, 2, 3, 4, 7, 10, 11 against a real
  `GameRoom` with a seeded rng, plus `resetGame` clearing `turnOrder`.
- Integration: rows 5, 6, 8 driven through `GameRoom` plus the extracted `finishTurnOrder` logic,
  asserting `state.turn.player === starterPlayerId` after the deal.
- Manual (row 9 and end-to-end): live 2P run with `SERVER_AUTHORITATIVE=1` on a free PORT via
  `.agent/scratch/probe.mjs` — the picker opens for exactly one seat, the announced winner matches
  the call, and `state.turn.player` agrees on both clients.
- New test files must be added to the `pnpm test` file list in package.json (STATE watch-out).

## Migration / rollout
No data migration and no persisted schema touched (`GameState` unchanged). The behavior change is
gated on `SERVER_AUTHORITATIVE`, already the prod setting (D17). Revert path: revert the branch —
`setup` falls back to `payload: {}` and `setupGame`'s own RNG, exactly today's behavior.

## Work plan — slices ≤1 session, each leaving the repo green
| Slice | Delivers | Green when |
|---|---|---|
| 1 | `shared/engine/rules/turn-order-flip.mjs` + unit tests, wired into package.json | `pnpm test` green; module not yet used by production code |
| 2 | `GameRoom.turnOrder` + `beginTurnOrderCall` / `submitTurnOrderCall` / `resolveTurnOrderCallAutomatically` / `resetGame` clearing, + `room-turn-order.test.mjs` | `pnpm test` green; server.js still deals as today |
| 3 | server.js two-stage gate, `turnOrderCall` listener, timeout and disconnect auto-resolve, `turnOrderResult` broadcast, `firstPlayerId` passed to `setup` | `pnpm test` green; flag-off path untouched |
| 4 | client `turn-order-call.js`, `socket-event-listeners.js` registration, `rules-bridge.js` picker/animation/start wiring | `pnpm test` green; live 2P probe shows a real call deciding turn 1 |
## Deviations

- **Timer ownership moved to the transport.** The design put `turnOrderTimer` on `GameRoom`.
  `eslint.config.mjs` only supplies globals to `**/*.js`, so `clearTimeout` in the `.mjs` room
  module is a `no-undef` error. Answer timeouts now live in a `turnOrderTimers` Map in
  `server/server.js`; `GameRoom.clearTurnOrderCall()` only drops the handshake state, and every
  server-side reset/teardown path clears the matching timer. A timer that fires late is a no-op
  (`resolveTurnOrderCallAutomatically` returns `no_pending_call`).
- **The start guard could not stay on `rulesState.phase`.** Found while wiring slice 4: under
  server authority the post-deal `view` reaches the client BEFORE `both-players-ready`, and
  `reconcileTurnState` (`apply-view.js:1456`) copies the server's `turn.phase` ('main') onto
  `rulesState.phase`. `handleSetupClick` and `beginSetupWithTurnOrder` both bailed on
  `phase !== 'setup'`, so the ENTIRE rules-mode opening (coin call, `startGame`, `beginTurn`,
  opening-hand draw, mulligan check) was already dead under the flag — this is the concrete cause
  of the reported "the picker never shows". `beginSetupWithTurnOrder` now guards on an explicit
  `openingStarted` latch instead, and the server-owned branch of `handleSetupClick` sits above the
  phase guard. The legacy flag-off paths keep their phase checks.
- **The opening now waits on two independent signals.** The server's flip arrives before the deal,
  so `applyServerTurnOrder` only shows the coin; the game starts from
  `maybeBeginServerTurnOrder()` once BOTH the coin animation and `both-players-ready` are done,
  whichever lands last.
- **Free play and e2e answer the call automatically.** The server does not know the client's rules
  toggle (`new GameRoom({ roomId })` always defaults `rulesEnabled: true`), and the deal waits on
  the call. With rules mode off, or under the Playwright harness, the client answers immediately
  instead of stalling both seats until the 15s timeout. The server still flips.
- **Slice 3's socket glue has no unit test.** `finishTurnOrder`/`dealOpeningHandsIfReady` live in
  `server/server.js`'s io closure and the repo has no socket-level harness. Their inputs
  (`beginTurnOrderCall`, `submitTurnOrderCall`, `resolveTurnOrderCallAutomatically`) are covered in
  `server/game/__tests__/room-turn-order.test.mjs`; the wiring itself is left to the live 2P check.
- **Live 2P probe not run.** The user asked to raise the PR once the wiring was in place, so rows 5,
  6 and 9 rest on unit coverage plus code reading rather than a live two-browser run.
