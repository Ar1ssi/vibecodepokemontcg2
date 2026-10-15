# 069: Spectator mode on the server-authoritative netcode (POV switch + broadcast layout)
Status: building (approved by user via two AskUserQuestion answers, 2026-10-15)
Date: 2026-10-15 · Session: S— (branch `claude/wizardly-hawking-d2elhh`)

## Problem
Under SERVER_AUTHORITATIVE=1 a spectator sees an empty board: the server already sends spectators
`viewFor(state, null)`, but that view has `you:null, them:null`, so `applyView` places nothing, and
the legacy action-replay path (`spectatorActionData`) still runs and fights the renderer. The user
wants spectating to work, plus a top-left switch between three views:
- **P1 POV / P2 POV** — exactly what that player sees (their hand face up, the other hand as backs).
- **Broadcast** — side-by-side, stream-style: P1 on the left, P2 on the right, both hands face up.

## Constraints
- Invariant 5 (view.mjs): seated players never see hidden info. Spectators are a separate audience;
  the user chose (2026-10-15) that spectators may see both hands. Decks and face-down prizes stay hidden.
- Spectators never act: server already rejects (`spectator_readonly`); the client must not offer actions.
- `applyView`'s monotonic stateVersion guard; card DOM lives in two iframes (self = bottom, opp = top, CSS 180°).
- Legacy (non-authoritative) spectating keeps working unchanged.

## Current state
- `shared/engine/view.mjs` `viewFor(state, null)` → `{ isSpectator:true, you:null, them:null, players:{id:{zones}} }`,
  hand = `{count}`.
- `server/game/room.mjs` `handleCommand` broadcasts to `spectatorSockets` too; `server/server.js`
  `broadcastFreshGame` (reset/leave) reaches players only; `joinGame` emits bare `spectatorJoin` and asks peers
  for legacy `requestSpectatorData`.
- `client/src/setup/spectator/spectator-join.js` — legacy join + `spectatorActionData` replay via `acceptAction`.
- `client/src/initialization/socket-event-listeners/socket-event-listeners.js` — `view` → `applyView`.
- `client/src/setup/netcode/apply-view.js` — renderer; `reconcileTurnState`/`reconcileGameEnded`/
  `reconcilePendingChoice` key off `view.you.playerId`.
- `client/src/setup/image-logic/iframe-rect.mjs` — maps iframe-local rects to the page through the iframe's
  CSS matrix; assumes the iframe's AABB equals its layout box (true for 0°/180°, false for 90°).

## Options
O1 — where both-hands data comes from.
- A: server spectator view carries both hands (owner-style zones per player); client hides the off-POV hand.
  One wire shape, POV switch is instant, no server round trip. Spectator payload holds both hands.
- B: spectator subscribes to a seat; server sends that seat's player view, or an "omniscient" one for broadcast.
  Exact per-POV redaction on the wire, but a new subscribe message + per-spectator mode state on the room.
- Pick A: broadcast mode needs both hands anyway, so B buys no secrecy; A keeps the room stateless per spectator.

O2 — how a spectator view reaches the renderer.
- A: pure adapter `spectatorPerspective(view, mode)` maps `players` → `you`/`them` (+ redacts the off-POV hand),
  then the normal `applyView` runs. Reuses every reconcile path and FX.
- B: a spectator renderer of its own. Duplicates 2.4k lines. Pick A.

O3 — switching perspective.
- A: tear down the rendered cards (`clearRenderedBoard`) and re-apply the cached raw view. Simple, correct.
- B: let the diff move each card between iframes. Cross-document moves + holo/overlay state: fragile. Pick A.

O4 — broadcast layout.
- A: CSS mode on `body.spectator-broadcast`: rotate the self iframe 90° into the left half, the opp iframe −90°
  into the right half (hands at the outer edges, Actives meet in the middle), mat turned to match.
- B: new zone layout HTML. Several times the work. Pick A; fix `iframe-rect.mjs` to recover the layout box from
  the AABB centre so FX overlays land on rotated boards.

## Design
Server
- `view.mjs`: `redactSpectatorZones(player)` = owner-style zones (hand cards visible, deck count, prizes per
  `prizeCards`, face-down board cards hidden). The hand becomes an array; its length is the count.
- `server.js` `joinGame` (spectator): emit `spectatorJoin` with `{ serverAuthoritative, protocolVersion }`; send
  `requestSpectatorData` to peers only when not authoritative. `userReconnected` (spectator) same.
- `server.js` `broadcastFreshGame`: also emit a fresh spectator view to each `spectatorSockets` id.

Client — `client/src/setup/spectator/spectator-view.mjs` (pure, node-tested)
- `SPECTATOR_MODES = ['p1','p2','broadcast']`; `seatIds(view)` → sorted player ids.
- `spectatorPerspective(rawView, mode)` → `null` for a non-spectator/empty view; else
  `{ ...rawView, you, them, players: undefined, turn: { ...turn, isYourTurn: turn.player === you.playerId } }`
  where `mode 'p2'` puts the 2nd seat in `you`, `'p1'`/`'broadcast'` the 1st. In POV modes `them.zones.hand`
  becomes `{instanceId}` per card unless `revealed`. Missing second seat → `them: null`.
- `nextSpectatorMode(mode)` cycles p1 → p2 → broadcast → p1.

Client — wiring
- `spectator-session.js`: holds `mode` + last raw view; `applySpectatorView(raw, events, opts)` adapts + calls
  `applyView`; `setSpectatorMode(mode)` → `clearRenderedBoard()` then re-apply cached raw view, toggles
  `body.spectating`/`body.spectator-broadcast`, sets `systemState.p2SelfUsername/p2OppUsername`, updates the switch.
  `startSpectatorSession()` / `endSpectatorSession()` on join / leave.
- `apply-view.js`: `clearRenderedBoard(options)` removes every registry card (shared helper with the stale-card
  sweep) and resets `lastRenderedVersion`/`lastAppliedView`; `reconcileTurnState` runs when `you.playerId` is set
  (spectator perspective included); spectator views pass `null` as chooser to `reconcilePendingChoice` and name the
  chooser in the banner; `reconcileGameEnded` never says Victory/Defeat to a spectator.
- `socket-event-listeners.js`: `view` → spectator session when spectating an authoritative room; `spectatorJoin`
  payload sets `serverAuthoritative` and requests a view; reconnect requests a view for spectators too;
  `spectatorActionData` / `sendSpectatorData` are no-ops in authoritative rooms.
- `cmd-emitter.js`: refuses `spectator` (no emit) when `body.spectating`.
- `index.ejs` + `index.css`: `#spectatorViewSwitch` (three buttons, top-left of the board, hidden unless
  `body.spectating`); `body.spectating` hides End Turn / attack and action buttons; broadcast CSS per O4.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | spectator joins before any player | raw view has 0–1 seats → `you` = the one seat or null; no throw | [x] spectator-view.test: 'no seats yet', 'one seat only' |
| 2 | malformed / non-spectator view into adapter | returns null; the session reports `not_spectator_view` and renders nothing | [x] spectator-view.test: 'a non-spectator or malformed view is refused' |
| 3 | one seat only | `them: null`; P2 POV with one seat shows that seat | [x] spectator-view.test: 'one seat only' |
| 4 | repeated swap clicks / swap before first view | no cached view → mode stored, nothing rendered; same mode again = no-op | [x] spectator-session.js `setSpectatorMode` early returns; apply-view.test '069: clearRenderedBoard…' |
| 5 | reset / player leaves | spectators get a fresh view | [x] spectator-view-test.mjs step 13 |
| 6 | spectator reconnect | re-registered as spectator, requests view, re-renders in current mode | [x] spectator-view-test.mjs step 12 |
| 7 | revealed card in hand in POV mode | stays face up on the off-POV side | [x] spectator-view.test: 'p1 POV…' (Rare Candy) |
| 8 | pending choice | spectator sees a non-interactive "<name> is making a choice" banner, never a picker | [x] apply-view.test '069: a spectator gets a named waiting banner…' |
| 9 | game over | modal says "<name> Wins!", never Victory/Defeat | [x] apply-view.test '069: the end screen names the winner…' |
| 10 | seated player's views | unchanged (owner/opponent redaction untouched) | [x] view.test 'Invariant 5…' + room.test redaction asserts unchanged and green |
| 11 | legacy (non-authoritative) room | old replay path untouched; switch hidden | [x] manual: legacy server, spectator join — same zone counts as main, switch hidden, no page errors |
| 12 | FX on rotated boards | rect mapping uses the layout box, not the AABB | [x] iframe-rect.test 'a card on a 90°-turned board…' |

## Test plan
Unit: view.test.mjs (spectator hands), spectator-view.test.mjs (adapter), apply-view.test.mjs (turn state,
pending banner, game end, clearRenderedBoard), iframe-rect test (90° mapping), room/server tests where touched.
Manual (user, localhost SERVER_AUTHORITATIVE=1): third browser joins as spectator; switch P1/P2/Broadcast.

## Migration / rollout
No data. Revert = revert the commits; the spectator wire shape change is server+client in one deploy.

## Work plan
| Slice | Files | Green when |
|---|---|---|
| 1 | view.mjs, server.js, view/room tests | spectator view has both hands; fresh-game reaches spectators |
| 2 | spectator-view.mjs (+test), apply-view.js (+test), iframe-rect.mjs (+test) | adapter + renderer tests pass |
| 3 | spectator-session.js, spectator-join.js, socket-event-listeners.js, cmd-emitter.js, index.ejs, index.css | changed tests + e2e smoke |

## Deviations
- Broadcast boards keep their normal layout box and are scaled (`--bc-scale`, set by apply-table-tilt.js) rather than
  re-laid out at a 2:1 box: a narrower box pushed bench/deck/trash off screen.
- The parent mat's art and zone-outline svg cannot follow a 90° board (their geometry is measured from frame AABBs),
  so broadcast hides the mat art and each board draws its own zone plates (`html.spectator-broadcast` in
  self/opp-containers.css). Mat art is not shown in broadcast.
- Turn banner and HUD name the player for spectators ("Bravo's Turn"), not "Your/Opponent's".
- `board-layout-changed` document event re-runs the table tilt: entering broadcast does not resize the frames, so
  the tilt's ResizeObserver never fires.
