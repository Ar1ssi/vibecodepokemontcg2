# 028: Match logging — one structured log for server, client, sync and errors
Status: draft — waiting on user approval
Date: 2026-09-23 · Session: S264

## Problem
A match leaves no durable record. When the user reports a bug from "the most recent match"
(S264 item #5), nothing on disk says what happened: the server prints two console lines, the
client's sync/decision loggers are opt-in ring buffers in one browser tab, and the battle log is
chat text. Bugs cannot be reproduced after the fact. User flagged this IMPORTANT.

## Constraints
- No perf regression: logging must never block a command or a render (the reducer is pure;
  the render path runs per view).
- No new dependency without a DECISIONS.md line (the pick below adds none).
- Owner-secret data (hand, deck order, prizes — O4-A/I5) must not leak to the other player
  through a shared log.
- SQLite is already the persistence layer (`server/server.js`, `KeyValuePairs`, eviction by age).
- Server authority (`SERVER_AUTHORITATIVE=1`, :4100) is the target; legacy (:4000) is untested.

## Current state
- `server/server.js` — Express + Socket.IO; 2 `console.*` calls; SQLite `KeyValuePairs` with
  age eviction (`EVICTION_DAYS`). `/debug/shadow-report` exists as a debug endpoint.
- `shared/engine/state.mjs` — every game state already carries `commandLog` (full command
  history, replayable: `undo` replays it). This is the authoritative "what happened".
- `client/src/setup/general/sync-logger.mjs`, `decision-logger.mjs` (+ `-bridge.js`) — 800-entry
  in-memory ring buffers, opt-in via localStorage, exportable as text.
- `client/src/setup/netcode/server-battle-log.mjs` — narrates events into chat (design 021).
- `client/src/setup/chatbox/export-chat.js` — exports chat text.

## Options
1. **Where logs live.**
   A: client only (extend the ring buffers) — cheap, but lost with the tab and blind to the server.
   B: server file per match (NDJSON) — durable, but a second store beside SQLite, needs rotation.
   C: server SQLite table `match_log` + client entries shipped to it — one store, queryable,
   eviction reuses the existing age sweep. **Pick C.**
2. **What a server entry is.**
   A: re-derive from state diffs — expensive per command.
   B: log what the room already has in hand at each step: command, result (ok/rejected + reason),
   emitted event types, stateVersion, timing. **Pick B** — O(1) per command, no diffing.
3. **Client entries.**
   A: ship every client log line live — chatty on the socket.
   B: batch client entries (errors immediately; the rest every 5 s or 50 entries, whichever first)
   over one `clientLog` socket message. **Pick B.**
4. **Levels.** error / warn / info / debug. Default capture: error+warn+info. `debug` only when the
   existing localStorage toggles are on (sync/decision loggers become debug-category producers).

## Design
Data model (SQLite, created at boot like `KeyValuePairs`):
`match_log(id INTEGER PK, match_id TEXT, ts TEXT, seq INTEGER, source TEXT /*server|client*/,
player_id TEXT NULL, level TEXT, category TEXT, message TEXT, data TEXT /*JSON*/)`,
index on (match_id, seq). Categories: `command`, `choice`, `turn`, `sync`, `render`, `fx`,
`connection`, `error`.
Server:
- `server/game/match-log.mjs`: `createMatchLog({ db, matchId })` → `{ log(level, category, message,
  data), flush(), close() }`. Buffers in memory; flushes one multi-row INSERT every 1 s or 100
  entries (never awaited by the command path). Redacts owner-secret zones from `data` via the
  existing `excludeOwnerSecretZones` rule.
- `room.mjs` calls it for: command received, command result (applied / rejected + reason),
  pendingChoice opened/resolved, turn change, sync-check divergence, socket connect/disconnect,
  and every caught exception (level error, stack in data).
- `process.on('unhandledRejection'|'uncaughtException')` → error entry + flush.
Client:
- `client/src/setup/general/match-log-client.mjs`: `logClient(level, category, message, data)`;
  batches as above; `window.onerror` / `unhandledrejection` → error entries; apply-view render
  failures and rejected commands → warn.
Retention: same age sweep as `KeyValuePairs` (EVICTION_DAYS), plus a cap of the last 200 matches.
In-match access: a "Match Log" button in the Settings tab opens a panel listing the current
match's entries (filter by level/category), read via `GET /api/match-log/:matchId?since=seq`
(only players seated in that match; the opponent's secret data is already redacted at write).
Export: `GET /api/match-log/:matchId.ndjson` (download), plus a "Copy for bug report" button that
bundles the last N entries with build/session meta — replacing the need to ask "what happened".
Perf budget: <0.2 ms added per command (buffer push only); verified by a micro-benchmark test.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | Match with no commands | Header entry only (match created, players) | [ ] |
| 2 | Malformed client log payload | Dropped, one server warn entry, socket stays open | [ ] |
| 3 | Buffer at 100 entries mid-turn | Flush triggered, command path not awaited | [ ] |
| 4 | Two clients flushing at once | Server serializes inserts; seq is server-assigned | [ ] |
| 5 | SQLite write fails / locked | Entries kept in memory (cap 5 000), retried; game unaffected | [ ] |
| 6 | Server crash between flushes | `uncaughtException` handler flushes synchronously best-effort; ≤1 s loss documented | [ ] |
| 7 | Hand/deck contents in a command payload | Redacted for the opponent's view of the log | [ ] |
| 8 | Reconnect mid-match | Same match_id; connection entries on both ends | [ ] |
| 9 | Legacy mode (:4000) | Client logging works; server logs relay traffic only (flagged) | [ ] |

## Test plan
Unit: match-log buffer/flush/redaction (in-memory sqlite), client batcher, endpoint auth.
Integration: room command → entries written (reuse dual-run-sync harness). Perf: benchmark test.
Manual: play a short match on :4100, open the Match Log panel, export NDJSON.

## Migration / rollout
New table only (`CREATE TABLE IF NOT EXISTS`); no existing data touched. Revert: drop the table
and remove the calls — nothing else reads it.

## Work plan
| Slice | Delivers | Green when |
|---|---|---|
| 1 | Server `match-log.mjs` + table + room wiring + crash handlers | unit + integration tests |
| 2 | Client batcher + `clientLog` socket message + error hooks | unit tests, entries visible in DB |
| 3 | Endpoints + in-match Match Log panel + export/copy | endpoint tests, manual check |
| 4 | Retention cap + perf benchmark | tests green, benchmark under budget |

## Deviations (Builder appends here during build)
