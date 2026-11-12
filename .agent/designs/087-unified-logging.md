# 087: Unified logging — one export with both clients and the server
Status: shipped 2026-11-12 — approved (user); built by slice-builder agents, verified per slice
Date: 2026-11-12 · Session: cloud (branch claude/dazzling-gauss-q4cr9n)
Supersedes: 028 (match logging, never approved). Closes I85 when shipped.

## Problem
A bug report today arrives with too little to solve it. The two client loggers (`sync-logger`,
`decision-logger`) are opt-in 800-entry buffers that only know the legacy relay actions; under
server authority they record almost nothing. The server keeps no record at all (ten boot-time
`console.*` calls). Nothing captures browser errors, console output, clicks, rendering, FX, network failures or
timing, and the two exports are pulled peer-to-peer, so a closed, reloaded or frozen tab — the tabs
that had the bug — contributes nothing. Agents then guess. The user wants one export that holds
everything all three parties knew, cheap enough to leave on for every game.

## Goal and out of scope
Goal: always-on structured logging in both browsers and the server, gathered on the server, exported
as one file that (a) shows every party's view of each moment on one timeline, (b) can rebuild the
server's game state command by command, and (c) agents can slice with a CLI instead of reading whole.

Out of scope:
- An in-app log viewer panel (028 had one). The export and the CLI are the readers.
- Screenshots / canvas captures. A WebGL canvas reads back blank without `preserveDrawingBuffer`;
  getting a true frame needs renderer changes per stage. The DOM/registry snapshot covers layout.
- Instrumenting engine internals (damage steps, effect resolution). The export carries a replayable
  command journal; `tools/log.mjs replay` re-runs the real engine to any command, which shows more
  than any trace could.
- Durable server-side history across restarts in production (Render's disk and memory are both
  wiped). The exported file is the durable copy.
- `client/src/dev/board-lab.html` (dev tool page).
- New dependencies. None are added.

## Constraints
- No build step, native ESM (PROJECT S2): client modules are plain files; shared pure code lives in
  `shared/` and is served at `/shared` (D4).
- "No durable game log, no crash recovery" (PROJECT S2) stands: nothing here is ever read back by
  the game. The dev disk sink (O2) is diagnostics only.
- Scale is a handful of games (S2): prefer the simple mechanism. Render free tier: 512 MB RAM —
  server log memory is byte-capped and evicts.
- Logging must never block or break the game: every public logging call is non-throwing, O(1), does
  no layout reads and no I/O; a logging failure degrades to dropped entries plus a counter.
- Board animation and command paths are latency-sensitive: budget ≤ 10 µs per entry, ≤ 0.5 ms added
  per server command, ≤ 1 upload per client per 2 s.
- Socket.IO `maxHttpBufferSize` is the 1 MB default (engine.io `server.js:43`); every log message
  stays under 800 KB.
- Owner-secret zones (hand, deck, prizes; O4-A/I5) — see O6: the export is deliberately complete.
- Pure logic is tested with `node --test` on `.mjs`, no jsdom.
- Server authority is the target; the legacy relay (I251, retiring) gets tap-level coverage only.

## Current state (read this session)
- `client/src/setup/general/sync-logger.mjs` + `sync-logger-bridge.js` — opt-in ring (800 entries,
  `splice` trim), `console.info` echo, peer pull over relayed `requestSyncLogBundle`/`syncLogBundle`
  with a 5 s timeout, JSON download. 20 `logSync`/`logSyncAction` call sites, all legacy-path:
  `process-action.js:49,66`, `accept-action.js:168`, `move-card-bundle.js:180,195,210`,
  `shuffle-zone.js:77`, `socket-event-listeners.js:244–963` (13 sites).
- `decision-logger.mjs` + `-bridge.js` — same shape for legacy decisions; relayed
  `requestDecisionLogBundle`/`decisionLogBundle`.
- `client/index.ejs:585–588` — four menu items (`exportSyncLog`, `copySyncCompareLog`,
  `exportDecisionLog`, `copyDecisionCompareLog`), wired in `sidebox/p1/bottom-buttons.js`.
- `tools/compare-sync-logs.mjs` — offline compare of two sync exports.
- `server/server.js` — one `io.on('connection')` (line 664) registering every handler; relay list at
  1179–1203; authority handlers `cmd` 1314, `resolveChoice` 1367, `peekDeck` 1419 (ack),
  `requestView` 1438, `syncCheck` 1478. No handler has a try/catch; no `process.on` handlers; no
  body parser; `io` created at 118 with `connectionStateRecovery: {}`.
- `server/game/room.mjs` — `GameRoom.handleCommand` (417) is the only caller of `applyCommand` for
  live commands (line 481); `resetGame` (954) rebuilds state and re-applies `loadDeck` (997–1011);
  `#seatPlayer` (161) mutates `this.state.players` in place. `this.rng` is one seeded
  `createRng(seed)` shared by commands and the opening coin.
- `shared/engine/reduce.mjs` — `applyCommand(state, command, rng)` clones (`cloneGameState`, 253),
  so a superseded state object is never mutated again; appends to `state.commandLog` (477) and
  stores `rngCursor` (483). `undo` replays `commandLog` from a fresh seeded state (60–104).
  `shared/engine/rng.mjs` — `createRng(seed, initialCursor)` seeks; `rng.cursor` is readable.
  `shared/engine/state.mjs` — `hashState(state)` (303) is a whole-state string hash.
- Client authority path: `cmd-emitter.js` `emitCmd`/`emitResolveChoice` (four silent early-return
  refusals); `socket-event-listeners.js:596` `view` handler → `applyView(view, events, options)`
  (`apply-view.js:2316`), which returns `{ applied, reason, stateVersion, diff }` and has no
  try/catch around the reconcile; `getLastAppliedView()`, `getLastRenderedVersion()`,
  `getCardRegistry()` (records `{ element, side, zone, … }`, card `<img>` carries
  `data-instance-id/zone/side/damage/special-condition`).
- FX: `mat-fx/fx-queue.mjs` `createFxQueue({ run, schedule, cancel, maxQueueMs, leadIn })` — drops
  on `clear`, swallows a throwing `run`; `mat-fx/dispatcher.mjs` `console.warn`s effect failures;
  queue built in `advisory-animations.js:303`.
- No `window` `error`/`unhandledrejection` listener anywhere in `client/src`.
- Pages: every route renders `client/index.ejs` except `/unboxing` (`client/unboxing.html`) and the
  dev board lab.
- Socket.IO 4.7.4 both sides. Verified in its source: server `socket.onAny`, `socket.onAnyOutgoing`
  (fires for direct emits, `socket.js:199`, and for room broadcasts, `in-memory-adapter.js:122`),
  adapter events `join-room`/`leave-room`, `socket.timeout(ms).emit(ev, data, cb)`; client
  `socket.onAny`/`onAnyOutgoing` (`socket-client socket.js:707,784`).

## Options
**O1 — How the export gathers three parties.**
A: pull at export (today's pattern): ask each peer for its buffer. No steady cost; gets nothing from
a tab that closed, reloaded, froze or lost its socket.
B: every client ships its entries to the server continuously; export reads the server. Survives any
client failure; costs a small upload stream and server memory.
C: B, plus at export the server asks each live client for a heavy point-in-time snapshot (applied
view, card registry, settings) that is too big to ship continuously.
**Pick C.** The failing tab is the one whose log matters; snapshots are optional extras with a 3 s
timeout, so a dead tab only loses its snapshot, never its history.

**O2 — Where the server keeps it.**
A: SQLite table (028's pick): durable locally, but Render's disk is ephemeral so production gains
nothing, and it adds write contention and a schema.
B: in-memory byte-capped rings per stream. Fast, simple, lost on restart.
C: B plus an optional append-only NDJSON disk sink, on by default outside production.
**Pick C.** Production = memory + export file. Local dev (where the user tests and agents run) also
gets `out/logs/<bootId>/*.ndjson`, which an agent can grep with no export step, and which survives
a server crash. No schema, no migration.

**O3 — Entry storage.**
A: keep live objects, serialize at export. Zero CPU now, but logged objects mutate later (client
state is DOM-bound) so the log would lie, and byte caps are guesswork.
B: serialize each entry once, at record time, to one JSON line; store strings. ~5 µs per 1 KB
entry; exact byte accounting; the same string is shipped, stored, written to disk and exported.
**Pick B** for entries. Exception: full server game states are kept by reference (last 24) — the
reducer clones, so a superseded state is immutable, and serializing ~100 KB per command would cost
more than everything else combined.

**O4 — How much is on by default.**
A: opt-in (today). The bug has already happened by the time anyone opts in.
B: always on at `debug`; a room-wide `verbose` switch adds `trace` (pointer-move samples, full view
diffs, every resource timing) for a reproduce-and-export run.
**Pick B.** A 30-minute game is ≈1.5 MB per client and ≈1 MB server at `debug` (≈12 client and ≈6
server entries per action, ~250 B each), inside every cap below, so a normal game is kept whole.

**O5 — Correlating the three parties.**
A: a generated correlation id threaded through every call. Touches every signature.
B: reuse the ids the protocol already has as top-level entry fields: `cs` (the seat's `clientSeq`)
links click → `cmd` emit → server receipt → engine result; `sv` (`stateVersion`) links engine result
→ `view` send → client receipt → apply → FX. Clocks are aligned by an NTP-style ping.
**Pick B.** No protocol change; `grep '"sv":212'` returns the whole story of one state.

**O6 — Hidden information in the export.**
A: redact to the requester's eyes. Defeats the purpose: the user debugging needs both hands and the
deck order.
B: always complete, silently. A seated player could export mid-game to read the opponent's hand.
C: always complete, and every export posts a chat line to the room naming who exported.
**Pick C.** Players know each other and anti-cheat is a non-goal (PROJECT S2); the announcement
makes a mid-game peek visible. Spectators already see both hands. *User call — see the gate summary.*

**O7 — The old loggers.**
A: keep both beside the new system. Three logging APIs, two dead under authority.
B: migrate their call sites into the new logger (categories `sync`, `decision`) and delete the
modules, the four relay events, the four menu items and `tools/compare-sync-logs.mjs`.
**Pick B.** The new export is a superset; `tools/log.mjs` replaces the compare tool.

**O8 — Export format.**
A: one JSON document. Must be parsed whole; a 10 MB file blows an agent's reading budget.
B: NDJSON, one typed record per line, header first. `head -1` gives the overview; `grep` works;
the CLI streams it.
**Pick B.**

## Design

### 1. Entry — one schema for every source
One JSON object per line, keys in this order (so lines are prefix-comparable and patchable):

| Key | Type | Meaning |
|---|---|---|
| `t` | number | ms since epoch on the source's clock, 0.1 ms resolution. Client: `performance.timeOrigin + performance.now()`; server: `Date.now()` |
| `seq` | int | per-source counter from 1, no gaps unless entries were dropped |
| `lvl` | string | `error` `warn` `info` `debug` `trace` |
| `cat` | string | category (table below) |
| `ev` | string | dotted event name, stable, lowercase |
| `room` | string? | room id when known |
| `seat` | string? | `p1` `p2` `spec` |
| `sv` | int? | `stateVersion` this entry is about |
| `cs` | int? | the acting seat's `clientSeq` this entry is about |
| `d` | object? | detail, serialized by `safeStringify`, ≤ 2 KB (`trace`: 8 KB; journal: uncapped) |

The export adds `ts` (server-aligned ms) and `src` (`server` or `c:<clientId>`) at the front.

Categories (`shared/log/log-schema.mjs` `CATEGORIES`, frozen):
`boot` `process` `http` `socket` `room` `cmd` `engine` `journal` `view` `choice` `fx` `input`
`console` `error` `net` `perf` `app` `sync` `decision` `log` `user`.

### 2. Shared core — `shared/log/` (pure, both sides)
- `log-schema.mjs` — `LOG_FORMAT = 1`, `LEVELS`, `LEVEL_RANK` (`error` 0 … `trace` 4), `CATEGORIES`,
  `LIMITS` (every number in this design, one deep-frozen object):
  `{ detailBytes: 2048, traceDetailBytes: 8192, relayDetailBytes: 16384, floodPerSec: 60,
  clientRing: { maxBytes: 4194304, maxEntries: 20000 }, serverStreamBytes: 4194304,
  roomStreamBytes: 8388608, clientStreamBytes: 6291456, totalBytesDefault: 67108864,
  retainClosedMs: 1800000, sweepMs: 60000, batchFlushMs: 2000, batchMaxLines: 200,
  batchMaxBytes: 131072, errorFlushMs: 250, rateBackoffMs: 10000, ingestMaxLines: 500,
  ingestMaxLineBytes: 16384, ingestWindowMs: 10000, ingestWindowBytes: 524288,
  beaconMaxBytes: 262144, pingFastCount: 3, pingFastMs: 1000, pingMs: 30000, clockKeep: 8,
  stateRing: 24, journalGames: 2, journalGameBytes: 16777216, snapshotTimeoutMs: 5000,
  snapshotMaxBytes: 819200, exportTokenMs: 60000, exportAckMs: 5000, diskFileBytes: 52428800,
  diskFlushMs: 1000, diskKeepBoots: 10, toastMinMs: 60000 }`.
- `safe-json.mjs` — `safeStringify(value, { maxBytes = 2048, maxDepth = 6, maxArray = 50,
  maxString = 500 } = {}) → string`. Never throws. Cycles → `"[Circular]"`; `Error` →
  `{ name, message, stack, cause }`; objects with numeric `nodeType` → `describeElement` string;
  functions → `"[Function <name>]"`; `Map`/`Set` → arrays; `bigint` → string; a throwing getter →
  `"[Threw]"`; strings/arrays past the limit end `"…(+<n>)"`; output past `maxBytes` is replaced by
  `{"_truncated":true,"bytes":<n>,"keys":[…first 20 top-level keys]}`.
- `describe-element.mjs` — `describeElement(el) → string`: `tag#id.c1.c2[data-k=v…]` (≤ 3 classes,
  ≤ 6 `data-*` attrs, values ≤ 40 chars), then `<` and the nearest ancestor that has an `id` (≤ 4
  hops). Attribute reads only — never geometry.
- `ring.mjs` — `createRing({ maxBytes, maxEntries }) → { push({ seq, t, ts, line }), since(seq),
  toArray(), bytes(), size(), dropped(), firstSeq(), clear() }`. Array + head index, compacted when
  `head > 1024 && head > length / 2`: O(1) amortized, no `splice`.
- `logger.mjs` — `createLogger({ now, sink, level = 'debug', ctx = {} }) → { log(lvl, cat, ev, d?,
  ctx?), error|warn|info|debug|trace(cat, ev, d?, ctx?), enabled(lvl), setLevel(lvl), level(),
  child(ctx), seq(), suppressed() }`. `log` = level gate → flood gate → build line → `sink({ seq,
  t, lvl, line })`, all inside one try/catch that only counts failures. `ctx` supplies
  `room/seat/sv/cs`. Flood gate: ≤ 60 entries per second per `cat|ev`; the excess is counted and
  reported by one `log`/`suppressed` `{ cat, ev, n }` entry when that second ends.
- `payload-policy.mjs` — `summarizePayload(event, args, { trace }) → object`: `log:*` → never
  logged; `view` → `{ sv, lastClientSeq, events: [types], choice }`; `instanceMap`, `dealOrder`,
  `spectatorActionData`, `storeGameState` → `{ bytes, keys }`; `pushAction`/`requestAction`/
  `peerLog` → full up to 16 KB (the legacy relay's only truth); anything else → `safeStringify`
  at 2 KB.
- `clock-sync.mjs` — `createClockSync({ keep = 8 }) → { sample({ t0, t1, serverT }), offset(),
  rtt() }`: offset = `serverT − (t0 + t1) / 2` of the lowest-RTT sample among the last 8.
- `batcher.mjs` — pure state machine for shipping (section 5).

### 3. Server — `server/log/`
- `log-store.mjs` — `createLogStore({ now, limits, sink }) → { append(streamId, entry),
  stream(streamId), link(clientId, roomId, who), unlink(clientId, roomId), participants(roomId),
  close(streamId), sweep(), stats() }`. Streams: `server`, `room:<id>`, `client:<clientId>`.
  Caps: `server` 4 MB, room 8 MB, client 6 MB, total `LOG_MAX_MB` (default 64). A closed stream
  (room deleted / client silent) is kept 30 min. `sweep()` (every 60 s, `unref`'d) drops expired
  streams, then, while over the total, drops the oldest closed stream, then trims the largest open
  ring's oldest quarter. Every drop is counted in that stream's `dropped`.
- `server-logger.mjs` — `createServerLog({ store, build }) → { log, forRoom(roomId),
  forSocket(socket) }`: `createLogger` whose sink routes by `ctx.room` to `room:<id>` else `server`.
- `process-tap.mjs` — `installProcessTap({ log, diskSink })`: wraps `console.log/info/warn/error/
  debug` (original still runs; entry `cat: console`, re-entrancy guarded); `process.on(
  'uncaughtExceptionMonitor')` → `error` entry + synchronous disk flush + one compact JSON line to
  stderr (so Render's log keeps the fatal); `process.on('warning')`. The monitor event observes
  only — crash behavior is unchanged.
- `http-tap.mjs` — `httpLog({ log }) → express middleware`: on `res` `finish`, logs `http`/`req`
  `{ method, path, status, ms, bytes, client }` when status ≥ 400, or ms ≥ 500, or the path starts
  with `/api/`; every request at `trace`. `client` = the `x-ptcg-client` header (set by the client
  fetch wrap).
- `socket-tap.mjs` — `tapSocket(socket, { log, roomOf, seatOf })`: `onAny` → `socket`/`in`,
  `onAnyOutgoing` → `socket`/`out` (both through `summarizePayload`, with `bytes`), `disconnect`
  `(reason)`, `error`. `tapServer(io, …)`: `io.engine.on('connection_error')`, adapter
  `join-room`/`leave-room` → `store.link`/`unlink` and `room`/`join`·`leave` entries.
- `journal.mjs` — `createJournal({ roomId, log, limits }) → { rebase(state, rng, why),
  command({ cmd, playerId, before, result, after, ms }), states(), games(), stats() }`
  (section 4).
- `client-ingest.mjs` — `registerLogIngest(socket, { store, log, now })` + `beaconHandler`
  (section 5).
- `export.mjs` — `buildExport({ store, journal, snapshots, scope, requester, build, now }) →
  string[]` (lines, section 6); `mergeTimeline(streams) → entry[]` (k-way merge on `ts`, ties by
  `src` then `seq`).
- `export-routes.mjs` — `registerExport(socket, io, deps)` for `log:export`; `exportDownload`
  route; token map (16 random bytes hex, single use, 60 s).
- `disk-sink.mjs` — `createDiskSink({ dir, bootId }) → { write(streamId, line), flushSync(),
  close() }`: one append stream per log stream under `<dir>/<bootId>/`, buffered and written every
  1 s; stops a file at 50 MB with one warn; at boot keeps the 10 newest boot directories. `LOG_DIR`
  unset → `out/logs` when `NODE_ENV !== 'production'`, off in production; `LOG_DIR=off` disables.

Wiring in `server/server.js` (four insertions, no handler bodies change): create store/log/journal
factory at boot and log `boot`/`start` `{ commit, node, netcode, e2e, pid }` (`commit` =
`RENDER_GIT_COMMIT` if set, else `git rev-parse HEAD` in a try/catch, else `"unknown"`);
`app.use(httpLog)` first; `tapServer(io)` once; inside `io.on('connection')` `tapSocket(socket)`,
`registerLogIngest(socket)`, `registerExport(socket)`. `index.ejs` gets `window.__PTCG_BUILD`.

### 4. Command journal and state ring — the replayable record
`GameRoom` takes an optional `journal` (constructor option, default a no-op object, so every
existing test and caller is unchanged). Three call sites in `room.mjs`:
1. constructor end, `#seatPlayer` when it creates a seat, `resetGame` end →
   `journal.rebase(this.state, this.rng, why)` with `why` `created` / `seated:<pid>` / `reset`.
   Record: `{ k: 'rebase', game, why, seed, cursor, sv, state }` — the full state, serialized now
   (rare: a few per game). `reset` starts game `n+1`; the journal keeps the last 2 games.
2. `handleCommand` around line 481 → `journal.command(…)` for **every** `applyCommand` call,
   accepted or rejected. Record: `{ k: 'cmd', game, n, t, playerId, cmd, before: { sv, cursor },
   ok, error?, reason?, after: { sv, cursor, hash }, events, choice, ms }` — `cmd` in full
   (deck lists and `cardStats` included: they are what replay needs), `events` in full, `hash` =
   `hashState(state)`, `choice` = `pendingChoice` summary `{ choiceId, player, kind, options: n }`.
   Guard: if `before.sv`, `before.cursor` or the state object's identity differ from what the
   previous record left, a `rebase` (`why: 'unjournaled-change'`) is written first, so replay never
   starts from a wrong base and the gap itself is visible.
3. The dedupe, unauthorized, spectator and bad-seat early returns → `cmd`/`refused` log entries
   (not journal records: they never reach the engine).

The journal also logs a slim mirror of each record to the room stream (`cat: engine`, `ev:
applied|rejected`, `sv`, `cs`, `d: { type, playerId, ms, events: [types], error }`) so the timeline
reads without the journal.
State ring: the last 24 `{ sv, state }` references. At export each is serialized with `commandLog`
replaced by `commandLogLength`. Only the newest entry can still change in place (a username refresh
in `#seatPlayer`); every older one is frozen by the reducer's clone. Safety cap 16 MB of journal per game: past it, `cmd` payloads are
replaced by `{ _truncated: true }` and the header says `journal.complete: false`.

Replay (`tools/log.mjs replay`): start from the latest `rebase` at or before the target, `state =
rebase.state`, `rng = createRng(seed, cursor)`; for each `cmd` record re-seek the rng if its cursor
≠ `before.cursor`, call `applyCommand(state, { ...cmd, playerId }, rng)`, and compare error parity
and `hashState` with the record. Reports the first divergence, or dumps the state at `--to <sv>`.

### 5. Client — `client/src/log/`
Loaded by `<script type="module" src="src/log/boot.js">` placed before `front-end.js` in
`index.ejs` and in `unboxing.html`, so it runs first and sees the main module graph fail to load.

- `client-log.js` — the singleton: ring (4 MB / 20 000 entries), logger, `clientId` (16 hex chars
  in `localStorage` `ptcg-sim.log.client.v1`; a blocked storage falls back to a per-load id),
  `loadId` (new per page load). Exports `log`, `logFor(cat)`. `window.__ptcgLog = { export, mark,
  level, entries, stats }`.
- `capture-console.js` — wraps the five console methods as on the server.
- `capture-errors.js` — `window` capture-phase `error` (script errors with stack; resource
  failures as `net`/`resource.failed` `{ tag, src }`), `unhandledrejection`,
  `securitypolicyviolation`; wraps `HTMLCanvasElement.prototype.getContext` once to log
  `fx`/`gl.context` creation or `null`, and attach `webglcontextlost`/`restored` listeners.
- `capture-input.js` — one passive capture listener set on `window`: `pointerdown`, `pointerup`,
  `click`, `dblclick`, `contextmenu`, `keydown` (no repeats; inside an editable target only
  Enter/Escape/Tab are named, other keys are `"[text]"`), `dragstart`, `dragend`, `drop`, `change`
  (checkbox/select/range value; text inputs: length only), `submit`; target =
  `describeElement(event.composedPath()[0])` (open shadow roots resolve to the real card);
  `resize` (250 ms debounce), `visibilitychange`, window `focus`/`blur`, `online`/`offline`,
  `popstate`. `trace` adds `pointermove`/`dragover` at ≤ 10 Hz.
- `capture-net.js` — wraps `window.fetch` (`net`/`fetch` `{ method, url, status, ms }`, failures
  `warn`; adds `x-ptcg-client` on same-origin requests); `PerformanceObserver` `resource`: slow
  (> 1500 ms) at `debug`, all at `trace`.
- `capture-perf.js` — `longtask` observer where supported (≥ 100 ms `debug`, ≥ 500 ms `warn`); an
  rAF gap monitor (`perf`/`jank` when a visible-tab gap > 250 ms); every 30 s `perf`/`sample`
  `{ heapMB, domNodes, ringBytes, unacked }`.
- `capture-socket.js` — `tapClientSocket(socket)`: `onAny`/`onAnyOutgoing` via `summarizePayload`;
  `connect` (`{ id, recovered, transport }`), `disconnect` (`reason`), `connect_error`; manager
  `reconnect_attempt`/`reconnect`/`reconnect_failed`; engine `upgrade`.
- `capture-app.js` — wraps `EventTarget.prototype.dispatchEvent` to log every `CustomEvent`
  (`app`/`event` `{ type, target, detail }`) except `board-view-applied`; the flood gate bounds it.
- `ship.js` — drives `batcher.mjs` over the socket.
- `snapshot.js`, `export-ui.js` — section 6.

Shipping protocol (new socket events; all `log:*` are excluded from both taps):
| Event | Dir | Payload → ack |
|---|---|---|
| `log:hello` | C→S | `{ v: 1, clientId, loadId, page, build, ua, t }` → `{ ok, serverT, level }` |
| `log:batch` | C→S | `{ loadId, lines: string[], offset, rtt }` → `{ ok, acked: seq, level }` or `{ ok: false, reason }` |
| `log:ping` | C→S | `{ t0 }` → `{ t0, serverT }` |
| `log:setLevel` | C→S | `{ roomId, level: 'debug'|'trace' }` → server emits `log:level` to the room |
| `log:level` | S→C | `{ level, by }` |
| `log:export` | C→S | `{ roomId|null, note }` → `{ ok, url, sources }` or `{ ok: false, reason }` |
| `log:snapshot` | S→C | `{ exportId }` → snapshot object (3 s timeout) |
Plus `POST /api/log/beacon` (`express.text`, 256 KB, same body as `log:batch` + `clientId`) for
`pagehide`, and `GET /api/log/export/:token`.

Batcher rules: flush every 2 s, or at 200 lines / 128 KB, or 250 ms after an `error` entry, or on
`visibilitychange → hidden`; `pagehide` sends the unacked tail by `navigator.sendBeacon`. One batch
in flight at a time; an unacked batch is resent after reconnect from `acked + 1` (the entries are
still in the local ring); the server drops any `seq ≤` the stream's last. Pings: three at 1 s, then
every 30 s. `{ ok: false, reason: 'rate' }` → back off 10 s.

Ingest validation (server): socket said `log:hello` first; `lines` is an array of ≤ 500 strings,
each ≤ 16 KB with no line break, each `JSON.parse`s to an object with numeric `t` and integer
`seq`; ≤ 512 KB per socket per 10 s. A bad line is dropped and counted; a bad batch is refused
whole with one server `warn`. Accepted lines are stored with `ts = t + offset`.

Netcode instrumentation (explicit sites, each one line):
- `cmd-emitter.js` — `emitCmd`/`emitResolveChoice` log `cmd`/`emit` (`cs`, `{ type, seat }`) or
  `cmd`/`refused.local` (`warn`, `{ type, error, reason }`) for the four early returns.
- `netcode/apply-view-logged.js` (new) — `applyViewLogged(apply, view, events, options)`: logs
  `view`/`recv`, times the call, logs `view`/`apply` `{ applied, reason, ms, added, moved,
  removed, changed }` (`trace`: the full `diff`), logs `choice`/`open` when the view's
  `pendingChoice.choiceId` changed, and on a throw logs `view`/`apply.threw` (`error`, stack) then
  rethrows. The `view` handler in `socket-event-listeners.js` calls it for both `applyView` and
  `applySpectatorView`, and logs the two silent drops (`not_for_room`, `solo_perspective`).
- `mat-fx/fx-queue.mjs` — new optional `onEvent({ type: 'start'|'gate'|'clear'|'idle', plan,
  hold, pending, dropped })`; `advisory-animations.js` passes one that logs `fx`/`<type>`
  `{ effect, hold, pending }`.
- The 20 `logSync` and the `logDecision` call sites become `log.debug('sync'|'decision', ev, d)`
  with the same event names and detail objects.

### 6. Export
Flow: the Options menu's single **Export full log** item → optional note field → `log:export`.
The server (1) checks the requester is in the room (`gameRoom.canView(socket.id)`; legacy:
`socket.rooms.has(roomId)`) — with no room, the scope is the requester's own client stream plus the
`server` stream; (2) asks every live participant socket for `log:snapshot` (each client first
flushes its batch; 3 s timeout each, in parallel); (3) builds the lines; (4) posts
`<username> exported the match log.` to the room chat (`io.to(roomId).emit('appendMessage',
{ user: '', message, type: 'announcement', emit: false })`, the shape the client handler at
`socket-event-listeners.js:589` already takes); (5) acks a
one-time URL the browser downloads as `ptcg-log_<room>_<yyyymmdd-hhmmss>.ndjson` (gzip
`Content-Encoding` when accepted). If the server does not ack within 5 s, the client downloads its
own ring and snapshot as `…_local.ndjson` (same record types, header `partial: 'local-only'`).
Also: **Mark this moment** (logs `user`/`mark` and flushes — "it broke right now"), a **Verbose
logging (room)** toggle (`log:setLevel`), and a toast offering export, at most once a minute, after
a client `error` entry or a `desync`. In dev only (`NODE_ENV !== 'production'`):
`GET /api/log/rooms` and `GET /api/log/export?room=<id>` with no token, for agents on localhost.

File layout — one record per line, `k` first:
1. `{"k":"header", format, exportedAt, requester, note, room, netcode, build: { server, clients },
   range: { from, to }, counts: { byLevel, byCat }, firstError: { ts, src, seq },
   sources: [{ src, username, seat, loadIds, ua, level, offset, rtt, entries, firstSeq, dropped,
   suppressed, gaps: [{ from, to }], snapshot: 'ok'|'timeout'|'offline' }],
   journal: { games, records, complete }, legend: { …key meanings…, cli: 'node tools/log.mjs' } }`
2. `{"k":"journal", …}` — every journal record, oldest first.
3. `{"k":"state", sv, state }` — the state ring (≤ 24) — full, unredacted.
4. `{"k":"snap", src, … }` — one per client that answered: `meta` (url, viewport, DPR, UA, tz,
   visibility, GPU string), `socket` (id, connected, transport), `netcode` (`lastRenderedVersion`,
   `clientSeq`, `lastAppliedView` in full), `registry` (per card: `instanceId`, `side`, `zone`,
   `connected`, `parent` = `describeElement(element.parentElement)`, `classes`), `systemState`
   (`safeStringify`, 64 KB, depth 4), `fx` (pending, started, toggles), `settings` (`ptcg-sim.*`
   localStorage values ≤ 512 B; other keys: size only), `perf`. Over 800 KB, sections are dropped
   last-to-first from this list and named in `omitted`.
5. `{"k":"e", ts, src, t, seq, lvl, cat, ev, … }` — the merged timeline, ascending `ts`.

### 7. Agent CLI — `tools/log.mjs` (replaces `tools/compare-sync-logs.mjs`)
Input: an export file, or an `out/logs/<bootId>` directory (it merges the stream files itself).
`summary` (header, sources, completeness, first 10 errors/warns, last `sv` per party) ·
`errors` · `around --sv N | --cs seat#N | --ts T [--window 5s]` · `trace --cs p1#41` (one command:
input → emit → server → engine → view sends → each client's receive/apply/FX, with latencies) ·
`replay [--to SV] [--dump-state]` · `diff-view [--seat p1]` (server state at the client's
`lastRenderedVersion` → `viewFor` → compared with the client's `lastAppliedView` and with its
`registry` zones; lists cards missing, extra, or in the wrong zone) · `grep --cat fx --ev start`.
Every command prints ≤ 200 lines unless `--all`. `.agent/areas/logging.md` documents the schema
and these commands; `workflows/debug.md` gains one line: user supplied a log → `summary` first.

### 8. Performance budget
Per entry: one level check, one flood-map lookup, one `JSON.stringify` of a small object, one array
push. No layout reads, no I/O, no awaits. Per server command: one `hashState` and one stringify of
the command and its events (the big ones — `loadDeck`, `cardStats` — happen once per game).
Network: ≤ 1 small message per client per 2 s; nothing when idle. Server memory: bounded by
`LOG_MAX_MB`. Client memory: 4 MB ring. A benchmark test holds the per-entry and per-command costs.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | Export with no entries / room with no commands | Valid file: header (counts 0), a `rebase` journal record, no timeline lines | [x] export.test `a room with nothing logged exports a header, the created rebase and its state` (a state line too: the ring holds the rebase state) |
| 2 | `log()` given a cyclic object, DOM node, throwing getter, `undefined`, 5 MB string | One valid line ≤ cap; never throws | [x] safe-json.test (cyclic, 5 MB string, throwing getter, DOM-like node, undefined, `output never contains a raw line break`) |
| 3 | Malformed `log:batch` (not an array, line with `\n`, non-JSON, missing `seq`, 501 lines) | Bad line dropped and counted, or batch refused; one server `warn`; socket stays open | [x] client-ingest.test `batch validation: too many, bad load, bad lines, duplicates`, `batch before hello is refused…` |
| 4 | Ring at its byte cap | Oldest entries dropped; `dropped` and `firstSeq` reported in the header source | [x] ring.test `byte cap evicts the oldest…`; log-store.test `room stream stays within 8 MB and counts dropped`; e2e check 15 |
| 5 | Same batch delivered twice (ack lost, reconnect resend) | `seq ≤ last` dropped; no duplicates in the export | [x] client-ingest.test duplicates + `reconnect hello with the same ids reports the last stored seq`; `acceptTail stores a snapshot tail once…` |
| 6 | Client offline for minutes, then reconnects | Entries stay in the local ring and are shipped in order after `connect`; anything the ring evicted shows as a `gaps` range | [x] batcher.test `acked then reconnect…`, `a ring that evicted unacked entries…`; export.test `client entries seq 1, 2, 5 produce one gap…` |
| 7 | Tab closed / reloaded mid-game | History up to the last batch plus the beacon tail is in the export; `snapshot: 'offline'`; the reload appears as a new `loadId` under the same `src` | [x] ship.test `pagehide beacons the unacked lines`; client-ingest.test `beacon stores lines…`; export.test `snapshot states: … missing -> offline` |
| 8 | Tab frozen at export | Its `log:snapshot` times out at 3 s; export completes with `snapshot: 'timeout'` | [x] export-routes.test `room export: snapshots in parallel…` (one socket times out → `timeout`) |
| 9 | Server unreachable at export | Client downloads the local-only file after 5 s | [x] e2e checks 20–21 (socket disconnected → `ptcg-log_local_*.ndjson`, partial header, snapshot, own timeline) |
| 10 | Two players export at once / double click | Each request builds its own bundle and token; a token works once | [x] export-routes.test `two exports get distinct tokens that each work once` |
| 11 | Export token reused, expired or guessed | 404; nothing leaks | [x] export-routes.test `an expired token is a 404, and an unknown one too` |
| 12 | Requester not in the named room | `{ ok: false, reason: 'not_in_room' }` | [x] export-routes.test `requester outside the named room gets not_in_room…` |
| 13 | Error loop logging thousands of entries a second | Flood gate: 60/s per `cat|ev`, one `suppressed` entry per second with the count | [x] logger.test `flood gate: 100 same-ev entries -> 60 lines then one suppressed n=40` |
| 14 | A client floods the server with batches | > 512 KB / 10 s refused with `reason: 'rate'`; client backs off 10 s; game traffic unaffected | [x] client-ingest.test `rate window: 600 KB refused…`; batcher.test `failed('rate') backs off 10 s…`; ship.test `a rate refusal pauses shipping for 10 s` |
| 15 | Logger sink or serializer throws | Caught; failure counter incremented; caller unaffected | [x] logger.test `sink throwing is counted, never propagates`; journal.test `a throwing hash never reaches the room…`; apply-view-logged.test `a logger that throws never changes the result` |
| 16 | `applyView` throws mid-reconcile | `view`/`apply.threw` with stack and `sv`; error rethrown (behavior unchanged) | [x] apply-view-logged.test `a throwing apply logs view/apply.threw and rethrows the same error` |
| 17 | Server uncaught exception | Monitor logs it, flushes the disk sink synchronously, prints one JSON line to stderr; process exits as before | [x] taps.test `process tap: monitor logs one error entry, flushes disk and writes a fatal JSON line` |
| 18 | State changed outside `applyCommand` (new mutation site added later) | Next `command()` detects the mismatch and writes a `rebase` (`unjournaled-change`); replay still correct | [x] journal.test `a state change outside a command adds an unjournaled-change rebase, replay stays ok` |
| 19 | `undo` (replays `commandLog` internally) | One `cmd` record like any other; replay reproduces it because `rebase.state` carries `commandLog` | [x] journal.test `an undo is one journaled command and the replay reproduces the rewound state` |
| 20 | Reset / rematch | `rebase` (`reset`) starts game n+1; the previous game's journal is kept (last 2) | [x] journal.test `resetGame starts a new game and only the last two are kept` |
| 21 | Clock skew or a client clock change mid-session | `t` is monotonic (`timeOrigin + now()`); offset from lowest-RTT ping; header carries `offset` and `rtt` per source | [x] clock-sync.test; client-ingest.test `stored entry carries ts = t + offset…`; e2e header offsets (−0.05…−3.6 ms observed) |
| 22 | Server memory over `LOG_MAX_MB` | Sweep drops closed streams oldest-first, then trims the largest ring; counted in `dropped` | [x] log-store.test `over the total cap the oldest closed stream goes first…`, `still over … trims the largest open ring by a quarter` |
| 23 | Solo room (one socket, both seats) | One client source; journal `playerId` and entry `seat` name the acted seat | [x] journal.test `a solo room journals the seat the command acted for` |
| 24 | Spectator | Its entries ship like a player's; it may export (it already sees both hands) | [x] export-routes.test membership check (a spectator is in the Socket.IO room, so it passes `socket.rooms.has`); ingest is seat-agnostic |
| 25 | Legacy relay mode | Taps and client capture work; header `journal: null`; relay actions logged in full ≤ 16 KB | [x] payload-policy.test `relay events forward the 16 KB hint…`; export.test `client scope exports only that client stream…` (journal null); `journalFor` is null without a GameRoom |
| 26 | `localStorage` blocked / private window | Per-load `clientId`; logging otherwise unchanged | [x] client-log.test `client log counts entries, has a hex clientId…` (node has no localStorage: the per-load id path) |
| 27 | Disk sink directory unwritable or file at 50 MB | One `warn`; sink disables itself for that stream; memory logging continues | [x] disk-sink.test `unwritable dir: no throw, one warn…`, `size cap disables the stream after one warn…` |
| 28 | Typed text (chat box, deck names, search) | Keys inside editable targets are logged as `"[text]"`; `change` logs length only. What the user submits is logged as what it became: a sent chat message via the socket tap, a card search as its request URL | [x] input-filter.test `describeKey hides typed text in editable targets only`, `describeChange never leaks free text` |
| 29 | Snapshot over 800 KB | Sections dropped last-to-first; `omitted` lists them | [x] snapshot.test `an oversized view drops sections last-to-first, keeps meta, stays under the cap` |
| 30 | Pages with no room (deck builder, Build & Battle, unboxing) | Client capture and shipping work; export scope is the own session | [x] browser boot check (33 entries, 0 page errors, shipped 32/32); export-routes.test `client-scope export (no room)…`; `/unboxing` local-only (Deviations) |

## Test plan
Unit (`node --test`, pure `.mjs`): `safe-json`, `describe-element` (stub nodes), `ring`, `logger`
(levels, flood, failure isolation), `payload-policy`, `clock-sync`, `batcher` (fake clock),
`log-store` (caps, retention, sweep), `journal` + replay parity on a scripted game (reuse the
engine test decks), `client-ingest` validation, `export` (merge order, header counts, gaps),
`tools/log.mjs` commands against a fixture export.
Integration (node, real `GameRoom` + in-process Socket.IO server and two `socket.io-client`s):
commands → journal + room stream; two clients ship batches; `log:export` returns a file whose
timeline holds all three sources and whose journal replays to the live `hashState`.
E2E (`scripts/e2e/log-export-test.mjs`, Playwright, two pages): play three actions, click Export,
assert the download parses, has both `c:` sources and `server`, and `tools/log.mjs trace` finds the
click → emit → engine → apply chain for one command.
Benchmark: 50 000 `log()` calls < 500 ms; `handleCommand` with journal ≤ 0.5 ms slower (median of
200) than without.
Manual: play a game on localhost, export, run `node tools/log.mjs summary` on the file.

## Migration / rollout
No data migration: nothing persisted is touched (the old loggers' two `localStorage` flags
`ptcg-sim.sync-log.v1` / `ptcg-sim.decision-log.v1` are simply no longer read). New socket events
are additive; `PROTOCOL_VERSION` is unchanged (commands and views are untouched). Slices 1–8 run
beside the old loggers; slice 9 removes them. Kill switch: `LOG_OFF=1` on the server refuses
`log:hello` (clients then keep local rings only and export local-only) and skips taps and journal.
Revert: revert the slice commits; no state outlives the process except `out/logs/` (delete it).

## Work plan — slices ≤1 session, each leaving the repo green
| Slice | Files (create / modify) | Signatures & data shapes | Test cases: input → expected | Rulings used (source) | Green when |
|---|---|---|---|---|---|
| 1 Shared core | create `shared/log/{log-schema,safe-json,describe-element,ring,logger,payload-policy,clock-sync}.mjs` + `shared/log/__tests__/*.test.mjs` | As Design §1–2. `LIMITS = { detailBytes: 2048, traceDetailBytes: 8192, floodPerSec: 60, clientRing: { maxBytes: 4194304, maxEntries: 20000 }, … }` | `safeStringify(cyclic)` → contains `"[Circular]"`; `safeStringify('x'.repeat(5e6))` → length ≤ 2048+64; `safeStringify({ get a() { throw 1 } })` → `{"a":"[Threw]"}`; ring `maxBytes: 100`, push 3×60-byte lines → `size()` 1, `dropped()` 2, `firstSeq()` 3; logger at `debug`: `trace(...)` → sink not called; 100 same-`ev` entries in one fake second → 60 lines then one `suppressed` with `n: 40`; sink throws → `log` returns, `suppressed().failures` 1; entry line keys order `t,seq,lvl,cat,ev`; `summarizePayload('view', [{ stateVersion: 7, events: [{ type: 'attack' }] }])` → `{ sv: 7, events: ['attack'], … }`; `summarizePayload('log:batch', …)` → `null`; clock-sync samples rtt 80/20/50 → offset of the rtt-20 sample | n/a — no card text | `node --test shared/log/__tests__/` |
| 2 Server store + taps | create `server/log/{log-store,server-logger,process-tap,http-tap,socket-tap,disk-sink}.mjs` + tests; modify `server/server.js` (boot log, `app.use(httpLog)`, `tapServer`, `tapSocket`), `.gitignore` (`out/logs/`) | As Design §3. `tapSocket(socket, { log, roomOf, seatOf })`; `roomOf(socket, payload)` = `payload?.roomId ?? payload?.gameId ?? first socket room that is neither socket.id nor 'lobby:watchers'` | store: append 9 MB to a room stream → `bytes ≤ 8 MB`, `dropped > 0`; closed stream at +31 min → gone after `sweep()`; total over cap → oldest closed stream dropped first; http: `GET /api/x` 200 in 3 ms → 1 entry, `GET /src/a.png` 200 → 0 entries, same 404 → 1 entry; socket tap with a fake socket: `onAny('cmd', { roomId: 'r', clientSeq: 4 })` → entry `cat: socket, ev: in, room: 'r'`, `log:batch` → none; disk sink: 3 writes → file has 3 lines after `flushSync()`; unwritable dir → no throw, 1 warn | n/a | new tests + `node --test server/__tests__/` |
| 3 Journal | create `server/log/journal.mjs` + test; modify `server/game/room.mjs` (constructor option `journal`, 3 call sites + refused entries), `server/server.js` (pass `createJournal` at the three `new GameRoom` sites: 829, 949, 1095) | As Design §4. No-op default `{ rebase() {}, command() {}, states: () => [], games: () => [], stats: () => ({}) }` | room with journal, 2 seats, loadDeck ×2, setup, 3 commands (one illegal): records = 2 `seated` rebases + N `cmd` with `n` contiguous, the illegal one `ok: false` with the engine's `error`; replaying records from the last rebase reproduces every `after.hash`; `resetGame()` → next record `rebase` `why: 'reset'`, `game: 2`; mutate `room.state.stateVersion += 1` by hand then a command → a `rebase` `why: 'unjournaled-change'` precedes it; `states().length ≤ 24` after 40 commands; existing `server/game/__tests__` unchanged and green | n/a | `node --test server/game/__tests__/ server/log/__tests__/` |
| 4 Client capture | create `client/src/log/{boot,client-log,capture-console,capture-errors,capture-input,capture-net,capture-perf,capture-socket,capture-app}.js` + pure-part tests; modify `client/index.ejs`, `client/unboxing.html` (boot script first) | As Design §5. `boot.js` installs every capture, then `tapClientSocket` once `socket` exists (imported from `state.js`) | pure tests: key filter — `keydown 'a'` in an `<input>` stub → `key: '[text]'`, `Enter` → `'Enter'`; `describeElement` of a stub card img → `img.card[data-instance-id=12][data-zone=hand][data-side=you]<div#selfBoard`; console wrap calls the original exactly once and logs once, and a `console.error` raised inside the sink does not recurse. Browser check via existing e2e boot test: page loads with zero `pageerror` and `__ptcgLog.stats().entries > 0` | n/a | pure tests + `pnpm test:board3d-boot` |
| 5 Shipping + ingest | create `shared/log/batcher.mjs`, `client/src/log/ship.js`, `server/log/client-ingest.mjs` + tests; modify `server/server.js` (`registerLogIngest`, `POST /api/log/beacon`, `build` passed to every `res.render('index', …)`), `client/index.ejs` (`window.__PTCG_BUILD` in the existing inline script), `client/src/log/boot.js` | Events table in Design §5. `createBatcher({ now, limits }) → { add(entry), due(), take(), acked(seq), failed(reason), onReconnect(), pending() }` | batcher: 3 entries, +2000 ms → `due()` true, `take()` 3 lines; error entry → due at +250 ms; `take()` while one is in flight → `null`; `acked(3)` then `onReconnect()` → next `take()` starts at seq 4; `failed('rate')` → not due for 10 000 ms. ingest: batch before hello → `{ ok: false, reason: 'no_hello' }`; 501 lines → refused; line containing `\n` → dropped, others stored; duplicate batch → stream size unchanged; 600 KB in 10 s → `reason: 'rate'`; stored `ts === t + offset` | n/a | new tests |
| 6 Netcode instrumentation + migration | create `client/src/setup/netcode/apply-view-logged.js` + test; modify `cmd-emitter.js`, `socket-event-listeners.js`, `mat-fx/fx-queue.mjs`, `advisory-animations.js`, and the `logSync`/`logDecision` call sites listed in Current state | `applyViewLogged(apply, view, events, options, log) → apply's return`; `createFxQueue({ …, onEvent })` | `applyViewLogged` with a stub `apply` returning `{ applied: true, stateVersion: 9, diff }` → entries `view/recv` and `view/apply` both `sv: 9`; stub that throws → one `view/apply.threw` `error` and the same error rethrown; `emitCmd` with `roomId: ''` → `cmd/refused.local` `error: 'missing_room_id'`, no socket emit; fx queue: push 2 plans on a fake clock → `onEvent` types `start, start, idle`; `clear()` with 1 pending → `clear` `dropped: 1`; existing `fx-queue`, `cmd-emitter`, `apply-view` tests green | n/a | `pnpm test:changed` |
| 7 Export | create `server/log/{export,export-routes}.mjs`, `client/src/log/{snapshot,export-ui}.js` + tests; modify `server/server.js` (`registerExport`, token route, dev routes), `client/index.ejs` (menu items `exportFullLog`, `markLogMoment`, `verboseLogging`), `sidebox/p1/bottom-buttons.js` | Design §6 record shapes. `buildExport(...) → string[]`; `mergeTimeline(streams)` | merge: server ts 10, 30 and client ts 20 → order 10, 20, 30; equal ts → `server` before `c:`; client stream seq 1,2,5 → header source `gaps: [{ from: 3, to: 4 }]`; empty room → header + 1 journal line; snapshot timeout → `snapshot: 'timeout'`; token used twice → second 404; requester outside the room → `not_in_room`; integration test of Test plan passes; state lines carry `commandLogLength` and no `commandLog` | n/a | new tests + integration |
| 8 Agent CLI + docs | create `tools/log.mjs`, `tools/__tests__/log-cli.test.mjs`, `tools/__tests__/fixtures/export.ndjson` (generated by the slice-7 integration test), `.agent/areas/logging.md`; modify `.agent/workflows/debug.md` (one line) | Commands in Design §7; each prints ≤ 200 lines without `--all` | fixture: `summary` prints 3 sources and the first error; `trace --cs p1#2` prints, in order, `input`, `cmd/emit`, `socket/in`, `engine/applied`, `view/apply` ×2; `replay` → `OK <n> commands, 0 divergences`; fixture with one tampered `after.hash` → `DIVERGED at n=<k>` and exit 1; `diff-view` on a fixture whose registry puts card 12 in `bench` while the view has it in `active` → one line naming card 12 | n/a | new tests |
| 9 Delete pass + landing | delete `sync-logger*.{mjs,js}`, `decision-logger*.{mjs,js}`, their two tests, `tools/compare-sync-logs.mjs`; modify `front-end.js`, `bottom-buttons.js`, `index.ejs` (remove 4 items), `server/server.js` (remove 4 relay events); create `scripts/e2e/log-export-test.mjs`, benchmark test; harness: MAP, DECISIONS (one line per Options pick), ISSUES (close I85), `areas/netcode.md`, design 028 → archive | — | `grep -r "sync-logger\|decision-logger\|SyncLogBundle\|DecisionLogBundle" client server tools` → no matches; e2e and benchmark of Test plan pass | n/a | `TEST_BASE=origin/main pnpm gates`, full `pnpm test`, `pnpm test:2p` |

## Deviations (Builder appends here during build)
- 2026-11-12 (cosmetic): `window.__PTCG_BUILD` moved from slice 2 to slice 5, so slices 2 and 4 touch
  no common file and can be built in parallel. Built on the session branch in the primary folder
  (cloud container, one task), not a `.claude/worktrees/` worktree.
- 2026-11-12 (cosmetic, pinned before slices 2/4): event names carry the thing they are about, so
  the flood gate (60/s per `cat|ev`) is per event and one chatty type cannot starve the rest:
  socket taps log `in.<event>` / `out.<event>` (not `in`/`out`); `capture-app` logs cat `app` with
  ev = the CustomEvent type; failures get their own name (`req.failed`, `fetch.failed`,
  `resource.failed`).
- 2026-11-12 (cosmetic): the logger's sink payload also carries `room`, which is how the server
  sink routes an entry to `room:<id>`; `shared/log/console-wrap.mjs` (`wrapConsole`) is shared by
  the server process tap and the client console capture; `ring.dropOldest(n)` serves the store
  sweep; `server/log/index.mjs` (`createServerLogging`) composes the server pieces so
  `server/server.js` gets one object.
- 2026-11-12 (cosmetic): journal records are serialized with plain `JSON.stringify` (engine data is
  plain JSON); `safeStringify`'s string/array limits would cut deck lists and break replay.
- 2026-11-12 (edge row 30 refined): `/unboxing` loads no Socket.IO script, so that page captures
  into its local ring only (`window.__ptcgLog`); every `index.ejs` page ships.
- 2026-11-12 (cosmetic): CLI tests live in `scripts/__tests__/log-cli.test.mjs` with the fixture in
  `scripts/__tests__/fixtures/`, because `pnpm test` globs `scripts/**` and not `tools/**`.
- 2026-11-12 (cosmetic, found by the two-browser test): a client under load missed the 3 s snapshot
  window (2 s long tasks under software GL — the log itself showed them). The snapshot is now built
  alongside the flush, the GPU string comes from the page's own first WebGL context instead of a
  new one, and `snapshotTimeoutMs` is 5000 (the client waits `exportAckMs + snapshotTimeoutMs` =
  10 s before falling back to a local-only export).
- 2026-11-12 (cosmetic): `payload-policy` sizes payloads with the native `JSON.stringify` (it runs
  for every view on the command path) and logs `cmd` / `resolveChoice` up to the 16 KB relay cap,
  so the client's own record of what it sent is whole; `apply-view-logged.js` logs `view/apply`
  only (the socket tap's `in.view` is the receipt) and keeps its own previous view for the diff;
  `log:setLevel` with no room sets a per-client verbose level (deck builder, lobby).
- 2026-11-12 (bug fixed in passing, test `diffViews: no Stadium before or after is not a Stadium
  change`): `view-diff.mjs` reported `stadiumChanged: true` whenever no Stadium was in play.
- 2026-11-12 (slice 9): the fixture `scripts/__tests__/fixtures/log-export.ndjson` is a real export
  from `scripts/e2e/log-export-test.mjs` (`PTCG_LOG_OUT`), not from a node integration test — no
  Socket.IO client is installed for node, so the three-party path is proven in two real browsers.
- 2026-11-12 (structural, decided by the session lead after the two-browser test, within the
  approved protocol — no new event): the `log:snapshot` reply is built in ONE synchronous step.
  A starved main thread (2 s long tasks) gave each event-loop turn seconds, and the original
  reply needed several (dynamic imports, then a flush round trip): 13 s measured. Now
  `preloadSnapshotModules()` runs once after `load`, `buildSnapshotSync()` reads the cached
  modules, and the client's unshipped entries ride inside the reply as `tail`
  (`{ loadId, lines, offset, rtt }`, ≤ 128 KB); the server stores them through
  `ingest.acceptTail` (same validation and seq dedupe as a batch) and strips `tail` from the
  file. The janking tab is the one whose snapshot matters.

## Review (2026-11-12) — two independent reviewers on the whole diff, every finding reproduced
Fixed, each with a test that fails without it:
- **Room streams and journals never expired** — a socket's `disconnect` entry is logged after
  `delete-room` and `append()` reopened the stream. Append no longer reopens (`store.reopen` on
  `join-room` / hello / batch); a journal is dropped with its room stream and its bytes count
  against `LOG_MAX_MB`; `journalGameBytes` is 4 MB.
- **Seat tokens in exports** (design 069's only proof of a seat) — `safeStringify` redacts any key
  matching `token|passw|secret|authorization|cookie` in every log detail on both sides, and
  `payload-policy` redacts `joinGame`'s positional token. From the shared `server` stream an export
  now takes only `boot|process|console|log` entries and its own clients' HTTP — other sockets'
  pre-room traffic (room ids, usernames) never leaves the server.
- **`log:hello` unbounded** — `build`/`page`/`ua` are capped strings, one identity per socket
  (`client_changed`), at most 10 loads kept per client.
- **A client line could corrupt or forge the export** — lines must start `{"t":`, carry no
  `k|ts|src|load`, a known category, a bounded `ev`, `seq ≤ 1e9`, a finite sortable time; a
  snapshot cannot set its own `k`/`src`.
- **Any payload `roomId` opened a room stream** — a room id is trusted only when the socket is in
  that room. **`lobby:watchers`** is refused for exports and log levels.
- **Exports unthrottled** — one in flight per socket, 5 s apart, one chat announcement per room
  per 30 s; the client treats `busy`/`too_soon` as "the file you just got is the answer".
- **State lines keyed by `sv`** (an undo rewinds it) — emitted in ring order with `game` and `n`,
  de-duplicated by object identity; the CLI takes the latest state with that version.
- **Journal failure → a full-state rebase per command** — `last` is set before fallible work; the
  byte cap also holds for rebases (`state: null, _truncated`); `complete` is per game.
- **Line cap = relay cap** — `ingestMaxLineBytes` 20 480; an ok ack settles the whole batch.
- **Disk pruning removed any directory under `LOG_DIR`** — only `<base36>-<pid>` boot folders.
- **`/unboxing` loaded the netcode graph and raised a false toast** — no app modules are imported
  for a snapshot on a page with no socket.
- **Beacon and snapshot over transport limits** — both carry the newest unshipped lines measured
  as sent (beacon ≤ 48 000 chars; snapshot ≤ 700 KB + tail ≤ 100 KB).
- **`view/apply` diffed across games** — a lower `stateVersion` or another perspective starts a
  new baseline. **CLI**: a bare `--cs N` used by both seats is refused with the seats named;
  `diff-view` skips spectators' server comparison, reports `stale-rendered` cards and exits 1 on a
  difference; listings print their absolute `t0`; replay also compares the rng cursor.
- Smaller: the stall monitor is a 250 ms timer, not a permanent `requestAnimationFrame` loop; the
  resource observer skips `/socket.io/` and `/api/log/`; `__ptcgLog.level()` goes through the
  server; the hidden-tab flush test now tests it; benchmarks are best-of-3 and pay for the mirror
  entry; README documents the feature and no longer names the removed loggers.
Decided, not changed: request URLs keep their query string (`/api/tcgdex/...?name=<card>`): which
lookup failed is the point of logging it. Row 28 is therefore narrower than first written — text is
never captured from the keyboard, but a search the user submits appears as the request it made.
Filed: I286 (an undo lowers `stateVersion`, which the client's out-of-order guard then drops —
pre-existing, found by the review, visible as `view/apply applied:false reason:out_of_order`).
Not done (nits, accepted): a `clientId` is not bound to the first socket that used it; beacons and
snapshot tails are outside the rate window; `src` is the first 8 hex characters of the client id;
DevTools attributes console output to `console-wrap.mjs`.

---
Self-approval checklist (only when the user is unreachable):
- [ ] Every constraint traceable into the Design section
- [ ] Every edge-case row has an expected behavior (or a written strike reason)
- [ ] Interfaces fully named and typed — no hand-waving
- [ ] Slices each ≤1 session and independently green
- [ ] Every slice row is pinned: files, signatures, test cases with expected values, card rulings
      cited (corpus row / TCGdex id) — no banned words; a builder would make zero choices
- [ ] No section reads "TBD"
