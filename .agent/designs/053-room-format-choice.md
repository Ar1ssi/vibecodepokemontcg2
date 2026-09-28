# 053 · Room format choice once both players join

Status: approved (user said yes 2026-09-28 and chose "both must agree" on the decision card)
Scope tags: [netcode] [client] · Builds on design 051 (deck formats, D190 deal-time check)

## Problem
Build & Battle (051) has no match-level entry: a player finds the Build & Battle button on the
Deck tab, and the format only exists per deck. The user asked for a format choice that appears
once both players have joined a room.

## Constraints
- Works in both server modes: SERVER_AUTHORITATIVE (prod, D17) and legacy relay (dev/tests default).
- Engine state stays format-per-deck (051); undo replays `commandLog`, so the room choice must not
  enter engine state.
- Deal-time checks only (D190 / I202): a deck load is never refused.
- A browser only opens a new tab from a user gesture (popup blockers).

## Current state
- `server/server.js` `joinGame` / `userReconnected` / `disconnectHandler`: `roomInfo` holds
  `players` (usernames; removed only on an intentional leave) and `spectators`.
- `server/game/room.mjs` `isReadyToDeal` / `refuseDealOnFormatMismatch` use
  `deckFormatMismatch(state)` (`shared/engine/setup.mjs`): the two decks must agree.
- `client/src/actions/general/ready.js` `refuseDealOnFormatMismatch`: the same check on each client.
- `client/src/initialization/socket-event-listeners/socket-event-listeners.js` `handleJoinGame`.
- `client/index.ejs` `#connectedRoom` (room header, chat, Set Up / Reset / Leave).

## Options
1. Who picks. (a) Either seated player; last pick wins; changeable until the deal. (b) Propose and
   accept. User picked (b) on the decision card. A proposal can be replaced by the other player's
   counter-proposal or withdrawn by its proposer; an agreed format stays until a new proposal is accepted.
2. Where the choice lives. (a) Room level, server-held (`roomInfo.format`, mirrored on `GameRoom`),
   broadcast as a `roomFormat` event. (b) An engine command in game state. Pick (a): undo/replay and
   rematch are untouched, and it works in legacy relay mode where there is no engine room.
3. Enforcement. (a) Deal refused when a deck differs from the room format (plus the existing
   deck-vs-deck rule). (b) Refuse the deck load. Pick (a): D190.

## Design
- Pure `shared/engine/formats.mjs`:
  - `decksMismatchFormat(decks, roomFormat)`: the decks when any deck differs from `roomFormat` (or,
    with no room format, from each other), else null.
  - `formatMismatchMessage(players, roomFormat)` names the room format when set.
- `shared/engine/setup.mjs` `deckFormatMismatch(state, roomFormat = null)` delegates to it;
  `GameRoom.roomFormat` (null) feeds `isReadyToDeal` / `refuseDealOnFormatMismatch`.
- Pure `shared/engine/room-format.mjs` (server and client):
  - `applyRoomFormatAction(state, action)`, with:
    - state `{ format, proposal: { format, by } | null }`;
    - action `{ type: 'propose' | 'accept' | 'cancel', format, username, seated, dealt }`;
    - result `{ ok, state, reason }`.
  - Refusal reasons:
    - `invalid_format`;
    - `not_seated`;
    - `already_dealt`;
    - `no_proposal`;
    - `own_proposal` (accepting your own proposal);
    - `stale_proposal` (the accept names a different format from the live proposal);
    - `already_agreed` (proposing the format already agreed, with no other proposal live).
  - A counter-proposal replaces the live proposal. `cancel` withdraws your own proposal.
    `clearProposal(state)` runs when a player leaves.
- `server/server.js`:
  - One `roomFormatAction` socket event applies the action to `roomInfo`, sets
    `gameRoom.roomFormat` on accept, and broadcasts `roomFormat { roomId, format, proposal,
    seated }`.
  - A refusal goes back to the sender only, as `roomFormatRejected`.
  - `joinGame`, `userReconnected` and an intentional leave also broadcast `roomFormat`.
- Client pure `client/src/setup/general/room-format-view.mjs`:
  - `roomFormatView({ format, proposal, seated, dealt, self })` returns
    `{ mode: 'hidden' | 'pick' | 'waiting' | 'answer' | 'agreed', text, buttons }`.
- Client DOM `client/src/setup/general/room-format-panel.js`:
  - It renders `#roomFormatPanel` (under `#roomHeader`); its buttons emit `roomFormatAction`.
  - Accepting Build & Battle opens the box tab from that click.
  - Once Build & Battle is agreed, an "Open your box" button stays.
- `ready.js`: the deal check passes `systemState.roomFormat.format`.

## Edge cases & failure modes
| # | Case | Expected |
|---|------|----------|
| 1 | Only one player seated | Panel hidden; nothing to pick |
| 2 | Second player joins, no format | Both see the picker |
| 3 | A proposes | A sees "Waiting for B" + Withdraw; B sees Accept / the other format |
| 3a | B accepts | Both see "Format: … agreed"; B&B shows "Open your box" |
| 3b | B counter-proposes | Roles swap; A now answers |
| 3c | A accepts own proposal / accepts a stale format | Refused `own_proposal` / `stale_proposal` |
| 4 | Spectator sends `roomFormatAction` | Refused `not_seated`; nothing broadcast |
| 5 | Unknown format string | Refused `invalid_format` |
| 6 | Pick after the deal (authoritative) | Refused `already_dealt`; Change hidden once dealt |
| 7 | Player reloads / reconnects | Receives the current `roomFormat` on join |
| 8 | Room format B&B, a Standard deck, both Set Up | Deal refused, both Set Ups cleared, chat names the room format |
| 9 | No room format chosen | Old rule: decks must match each other |
| 10 | Player leaves on purpose | `seated` drops; live proposal cleared; agreed format kept; panel hidden until two are seated again |
| 11 | Pop-up blocked on "Build & Battle" / "Open your box" | The existing blocked-tab warning shows (openBuildBattleFromDeckTab) |
| 12 | Solo (not two-player) | Panel never shows |

## Test plan
- `shared/engine/__tests__` (formats and setup): rows 8 and 9.
- `shared/engine/__tests__/room-format.test.mjs`: rows 3 to 6, 3a to 3c, and 10.
- `room.test.mjs`: `GameRoom.roomFormat` refuses the deal (row 8).
- `client/src/setup/general/__tests__/room-format-view.test.mjs`: rows 1 to 3, 3a, 6 and 12.
- A headless two-browser run with SERVER_AUTHORITATIVE=1 covers rows 2, 3, 7 and 8 end to end.

## Migration / rollout
None. Rooms start with no format, which is the old behaviour. Revert = revert the commit.

## Work plan
One slice: pure helpers and tests → server wiring → client panel → e2e run.

## Deviations
- The `roomFormat` payload also carries `dealt` (server-authoritative only). The server rebroadcasts
  it after the opening deal and after a reset, so the panel drops its Switch button while cards
  are down. The legacy relay server cannot see the deal: there a switch is still offered and
  accepted mid-game. That is dev-only; production runs authoritative (D17).
- `room-format-test.mjs` (repo root, next to the other two-player e2e scripts) walks rows 1–3c, 6,
  7 and 8, plus the box tab opening on accept. All 14 checks pass with SERVER_AUTHORITATIVE=1.
