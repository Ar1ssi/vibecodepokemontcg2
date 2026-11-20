# 090: Homebrew game clock
Status: shipped
Date: 2026-11-20

## Problem
User request: a toggleable timer for homebrew games (both decks hold ≥1 homebrew card), on by
default, 3:00, each turn played adds 15 s. User answers (2026-11-20): chess clock per player;
0:00 loses; room setting either seated player toggles until the deal; homebrew = customhb cards.

## Constraints
- Engine state stays deterministic (D10 seeded rng, commandLog replay for undo, D256 journal).
- Toggle sits with the room format (design 053): seated players only, locked from the coin call.
- Solo rooms (074) and spectators never run or set a clock.

## Current state
- server/game/room.mjs GameRoom: every state change is handleCommand (→ applyCommand) or resetGame.
- server/server.js: turn-order timers live in a transport (turn-order-transport.mjs); roomFormat
  broadcast on every seat/format/deal change (`broadcastRoomFormat`).
- client setup/general/room-format-panel.js renders #roomFormatPanel from `roomFormat`.

## Options
- Clock home: A engine state (wall time breaks replay/undo determinism) · B room-level beside
  `roomFormat` (pure module, `now` injected). Pick B.
- Ending on time: A server sets `state.winner` directly (bypasses journal/views) · B a server-only
  engine command `timeOut` through handleCommand (journaled, broadcast like any game end). Pick B;
  clients sending `timeOut` are refused in handleClientCommand.
- Who runs: turn player only (a slow prompt answer on the opponent's turn burns the wrong clock) ·
  chooser of the pending prompt, else turn player. Pick the latter.

## Design
- shared/engine/homebrew-clock.mjs (pure): `createClock`, `syncClock(clock, state, now)` (charge
  runner, +15 s to the previous turn player when turn.number rises above the highest seen, pick
  new runner), `clockRunner`, `decksAreHomebrew`, `msUntilFlag`, `flaggedRunner`, `clockSnapshot`,
  `formatClock`. Arms once, at the first sync in play (turn ≥1, no openingDrawPending): on iff
  enabled and both seats hold a `customhb-*` card.
- Engine: `timeOut` command (schema, legality allowed while not ended, passes the pendingChoice
  gate) → `setGameEnded(opponent, 'time ran out')`, clears pendingChoice.
- GameRoom: `clockEnabled`, `clock`, `onClockChange`; sync after each successful command; fresh
  clock on reset; `setClockEnabled` (refused once armed); `clockPayload()`; `flagTimeOut()`.
- server/game/clock-transport.mjs: one timer per room for the runner's bank (+25 ms slack);
  emits `homebrewClock` to the room. server.js: `wireClock` at GameRoom creation; `onFlag` →
  flagTimeOut → broadcastGameResult (lifted to the io scope); `roomClockAction {roomId, enabled}`
  (seat check, refused after the deal) → `roomClockChanged` / `roomClockRejected`; the clock
  payload rides every `broadcastRoomFormat`.
- Client: homebrew-clock-view.mjs (pure) + homebrew-clock-panel.js (#homebrewClockPanel):
  pre-deal checkbox, in play two rows (own first), runner ticked locally every 250 ms.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | one deck not homebrew | clock never arms | [x] `a non-homebrew match never runs the clock` |
| 2 | client sends timeOut | refused bad_command | [x] `a client cannot send timeOut` |
| 3 | bank at 1 ms / 0 ms | not flagged / flagged | [x] `flagTimeOut ends the game … only once` |
| 4 | timer fires early | room re-checks, transport re-arms | [x] flagTimeOut null path; onFlag refresh |
| 5 | runner owes a prompt on opp's turn; times out | timeOut passes the choice gate | [x] `engine timeOut … pending prompt` |
| 6 | undo back over a turn end | no second +15 s | [x] `never twice after undo` |
| 7 | toggle after deal | refused already_dealt / setClockEnabled false | [x] `locks once the clock arms` |
| 8 | reset | fresh clock with room setting | [x] `reset starts a fresh clock` |
| 9 | joiner hears snapshot before its room switch | kept, rendered on join | [x] e2e homebrew-clock-test row 1 |
| 10 | room deleted with timer armed | timer cleared | deleteRoomIfEmpty → clockTransport.clear |
| 11 | disconnected player's turn | their clock keeps running (chess rule) | by design |

## Test plan
server/game/__tests__/homebrew-clock.test.mjs (clock math, engine, room, transport) ·
client/src/setup/general/__tests__/homebrew-clock-view.test.mjs · e2e scripts/e2e/homebrew-clock-test.mjs.

## Migration / rollout
n/a — no stored data. Revert: drop the commit; rooms carry no persisted clock state.
