# Area: logging (design 088 — one export with both clients and the server)
<!-- Cap 60 lines. Every party logs all the time; clients ship to the server; one NDJSON export holds it all. -->

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
New category → `CATEGORIES` in log-schema.mjs. High-frequency site → gate on `log.enabled('trace')`.

## Landmines
- Never logged: keystrokes in editable targets (`[text]`; `change` logs length only) and any detail
  key matching `token|passw|secret|authorization|cookie` (`[redacted]`, safe-json.mjs) — a seat token
  in an export would hand over the seat. A submitted search or chat line IS logged (URL / socket).
- The export is complete on purpose (both hands, deck order); exports are announced in room chat.
- Replay needs every `applyCommand` to go through `GameRoom.handleCommand`, and a `journal.rebase`
  after any in-place change to `room.state` (else `why: unjournaled-change`). `stateVersion`
  repeats after an undo (I287), so state lines carry `game` and `n`.
- A closed stream stays closed on late entries (`store.reopen` only on join/hello/batch), or rooms
  and their journals would never expire. A payload's `roomId` counts only if the socket is in it.
- `/unboxing` has no Socket.IO client: local capture only, and no app modules are imported there.
