# Area: logging (design 087 — one export with both clients and the server)
<!-- Cap 60 lines. Read this before debugging from a user-supplied log, or before adding a log call. -->
Purpose: every party logs all the time; clients ship to the server; one NDJSON export holds all of it.

## Debugging from a log — start here
1. `node tools/log.mjs summary <file>` — sources, gaps/dropped, first errors, last `sv` per party.
   Never read an export whole (0.5–20 MB); `head -1` is the header, the CLI prints ≤ 200 lines.
2. `errors [--warn]` · `around --mark | --sv N | --cs p1#N [--window 5s]` · `grep --cat fx --ev start`.
3. `trace --cs p1#41` — one command end to end: input → emit → server → engine → each client's
   view receive/apply → FX, with latencies. `sv` (stateVersion) and `cs` (the seat's clientSeq)
   are the join keys: `grep '"sv":212' file` is the whole story of one state.
4. `replay [--to SV] [--dump-state out.json]` — re-runs the real engine over the journal and stops at
   the first state-hash divergence. Engine bug? Replay to the command before it and step
   `applyCommand` in a test. A `note:` line means the log was recorded on another commit.
5. `diff-view [--seat p1]` — server state at the client's rendered version vs the view it applied vs
   its card registry (DOM): missing/extra cards, wrong zone, detached elements = a render bug.
Local dev needs no export: the server mirrors every stream to `out/logs/<bootId>/*.ndjson`
(`server`, `room_<id>`, `client_<id>`, `journal_<id>`); `node tools/log.mjs summary out/logs/<bootId>`.
While the server runs: `curl 'localhost:4000/api/log/export?room=<id>' > x.ndjson` (dev only).

## Entry (one JSON line; keys in this order)
`t` source-clock ms · `seq` per-source counter · `lvl` error|warn|info|debug|trace · `cat` · `ev` ·
`room` · `seat` · `sv` · `cs` · `d` detail (≤ 2 KB, `safeStringify`). Export adds `ts`
(server-aligned), `src` (`server` | `c:<clientId8>`), `load` (page-load id).
Categories: boot process http socket room cmd engine journal view choice fx input console error net
perf app sync decision log user. Socket taps log `in.<event>` / `out.<event>`; app CustomEvents log
as `app/<type>`. Export records: `header` · `journal` (`rec.k` rebase|rng|cmd) · `state` · `snap` · `e`.

## Files
shared/log/ — pure core, both sides: log-schema.mjs (`LIMITS`, `CATEGORIES`), logger.mjs
  (`createLogger`: level gate → flood gate 60/s per `cat|ev` → one serialized line → sink),
  safe-json.mjs, describe-element.mjs, ring.mjs, payload-policy.mjs (what a socket payload
  contributes), console-wrap.mjs, clock-sync.mjs, batcher.mjs (shipping state machine)
server/log/ — index.mjs (`createServerLogging`, the one object server.js holds; `LOG_OFF=1` = inert),
  log-store.mjs (streams `server` / `room:<id>` / `client:<id>`, byte caps, sweep), taps
  (process/http/socket), journal.mjs (`GameRoom` option; rebase + cmd records, state ring),
  replay.mjs, client-ingest.mjs (`log:hello|batch|ping|setLevel`, beacon), export.mjs (pure
  bundle builder), export-routes.mjs (`log:export`, token download, dev routes), disk-sink.mjs
client/src/log/ — boot.js (first module on the page), client-log.js (`log`, ring, `onEntry`),
  capture-*.js (console, errors, input, net, perf, socket, app), ship.js, snapshot.js,
  export-ui.js (menu items, toast), sync-log.js (`logSync`/`logDecision` for the legacy call sites)
client/src/setup/netcode/apply-view-logged.js — `view/apply` + `choice/open|closed`
tools/log.mjs + tools/log-lib.mjs — the CLI above · scripts/e2e/log-export-test.mjs — two-browser check

## Adding a log call
Client: `import { log } from '<rel>/log/client-log.js'`; server: `logging.log` / `logging.forRoom(id)`.
`log.debug(cat, ev, detail?, { room, seat, sv, cs })` — always pass `sv`/`cs` when you have them.
Never throws, never does I/O. No layout reads in details (`describeElement` reads attributes only).
New category → `CATEGORIES` in log-schema.mjs. High-frequency site → gate it with
`log.enabled('trace')` (trace is off unless the room's Verbose logging is on).

## Landmines
- Typed text is never logged: keys inside editable targets become `[text]`, `change` logs length only.
- The export is complete on purpose (both hands, deck order); every export is announced in room chat.
- Journal replay depends on every `applyCommand` going through `GameRoom.handleCommand`, and on a
  `journal.rebase` after any in-place change to `room.state` (seat added, reset). A new mutation
  site without one shows up as a `rebase` with `why: unjournaled-change` — add the call.
- `/unboxing` loads no Socket.IO client: it captures locally only (`window.__ptcgLog.export()`).
- Classic scripts that fail before boot.js runs (the Socket.IO CDN tag) leave no resource entry;
  the resulting `io is not defined` is logged as `error/uncaught`.
