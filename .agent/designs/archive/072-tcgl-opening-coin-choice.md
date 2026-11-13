# 072: TCG Live opening coin flip — the winner chooses first or second
Status: shipped (PR) · approved (self — one-shot) · Date: 2026-10-15 · Route: oneshot-feature.md · Extends design 013

## Problem
> Implement the starting coinflip from tcglive (e:/tcglive_extract) including the option to go first or
> second if you win the coinflip. then hostile review, fix whatevers found, and make a pr

Today (design 013) the caller calls heads/tails and the server's coin decides the starter directly:
"if the coin lands on it, you go first". TCG Live instead makes the coin's winner choose.

## TCG Live's flow — source
`E:/tcglive_extract/carddata/game/Standard.json`, game action `StartingCoinFlip`
(actionGuid `8b79d9cf-024e-4407-801d-b00038107789`), sub-actions in order:
1. P1 is asked `pl_calling_starting_coin` ("Call the starting coin flip. Choose heads or tails.") with
   options Heads/Tails; P2 sees `op_calling_coin` ("Your opponent is calling the starting coin flip...").
2. P2 is told `op_called_heads` / `op_called_tails` ("Your opponent chose heads. Flipping the coin...").
3. One coin is flipped. Match → P1 decides the order, else P2 (`SetMetaData` PlayerWonStartingCoinToss).
4. Winner is asked `pl_calling_turn` ("Do you want to go first?") with `option1_yes` "Yes" / `option2_no` "No";
   the loser sees `op_calling_turn` ("Your opponent won the coin flip and is deciding who goes first.").
5. Both are told `setup_pl_turn` ("You will go first.") / `setup_op_turn` ("Your opponent will go first.");
   `GameFirstPlayer` is recorded.
Battle log (`WebApp/web/data/ui/loc_en.json`): `blog_loc_selected_coinface` "[playerName] chose [coinFace]
for the opening coin flip.", `blog_loc_won_coin_toss` "[playerName] won the coin toss.",
`blog_loc_going_first` / `_second` "[playerName] decided to go first/second."
The prompt-button cue is `chooseFirstOrSecond` (`MatchAudioCollection.cs:100`, played from
`SimpleButtonModalOption.cs:59` on the Yes/No buttons); our `playUiCue('choose-first-second')` already maps it.

## Constraints
- D10: the client supplies only its call and its yes/no; the coin comes from the room's seeded rng.
- Handshake state stays on `GameRoom.turnOrder`, outside `GameState` (design 013 A2).
- A silent or disconnected seat never hangs the match (013 C2), now for the choice too.
- Legacy flag-off 2P: untouched (STATE: netcode verified under `SERVER_AUTHORITATIVE=1` only).

## Current state
`server/game/room.mjs` `beginTurnOrderCall` / `submitTurnOrderCall` / `#resolveTurnOrder` (call → flip →
starter, phase `resolved`); `server/server.js` `dealOpeningHandsIfReady`, `finishTurnOrder`,
`autoFinishTurnOrder`, the `turnOrderCall` socket handler and the disconnect hook (transport inline in
server.js, untested). Client: `client/src/setup/netcode/turn-order-call.js` (socket → DOM events) and
`rules-bridge.js` `handleServerTurnOrderCall` / `applyServerTurnOrder` / `openCoinCallPicker` /
`playTurnOrderCoinAnimation`; ceremony `client/src/setup/rules/coin-flip-ceremony.js`.

## Options
- Where the choice lives: **(pick) a second phase of the same `GameRoom.turnOrder` handshake**
  (`awaiting-call` → `awaiting-choice` → `resolved`) vs. an engine `pendingChoice` (rejected in 013 A1:
  non-card choice kind, enters hashState).
- Transport: **(pick) extract the turn-order socket logic into `server/game/turn-order-transport.mjs`**
  (injected `emit`, `deal`, timers) so the new flip→choice→deal sequencing gets unit tests, vs. more
  untested closures in server.js.
- Silent winner default: **(pick) the winner goes first** (assumed) — the pre-072 outcome, so a silent
  seat gets what it always got.

## Design
Room (`room.mjs`), all transient:
- `turnOrder` gains `winnerPlayerId`, `choiceId`, `goFirst`, `choiceAuto`; phases
  `'awaiting-call' | 'awaiting-choice' | 'resolved'`.
- `submitTurnOrderCall` / `resolveTurnOrderCallAutomatically` now flip and stop at `awaiting-choice`,
  returning `{ ok, callerPlayerId, call, result, winnerPlayerId, choiceId, coinId, auto, timeoutMs }`.
- `submitTurnOrderChoice(socketId, { choiceId, goFirst })` → rejects `no_pending_choice` (no handshake or
  still awaiting the call), `already_resolved`, `not_winner`, `stale_choice`, `invalid_choice`
  (`goFirst` not boolean). `resolveTurnOrderChoiceAutomatically()` → `goFirst: true, choiceAuto: true`.
  Both return `{ ok, callerPlayerId, call, result, winnerPlayerId, goFirst, starterPlayerId, coinId,
  auto, choiceAuto }`. `isAwaitingTurnOrderChoice()`.
- `TURN_ORDER_CHOICE_TIMEOUT_MS = 25000` (ceremony ~4 s plays before the prompt opens).
Pure (`turn-order-flip.mjs`): `resolveStarterPlayerId` → renamed `resolveCoinWinnerPlayerId` (same
logic: it names the toss winner now); new `resolveStarterFromChoice({ playerIds, winnerPlayerId, goFirst })`.
Transport (`turn-order-transport.mjs`, `createTurnOrderTransport({ emitTo, deal, onOpened, setTimer,
clearTimer })`): `open`, `receiveCall`, `receiveChoice`, `handleSeatLost(gameRoom, roomId, playerId)`,
`clearTimer`. Messages, per seat, 'self'/'opp' relative:
- `turnOrderCall` (unchanged).
- `turnOrderFlip { roomId, caller, call, result, winner, choiceId (winner only, else null), coinId, auto,
  timeoutMs }` — then the choice timer is armed; a winner with no socket is auto-chosen at once.
- in: `turnOrderChoice { roomId, choiceId, goFirst }`; reject → `turnOrderChoiceRejected { roomId, reason }`.
- `turnOrderResult { roomId, caller, call, result, winner, goFirst, starter, coinId, auto, choiceAuto }`,
  then the deal (unchanged `dealOpeningHands(gameRoom, roomId, starterPlayerId)`).
Client:
- `turn-order-call.js`: `turnOrderFlip` → `rules-turn-order-flip` (normalized, cached),
  `turnOrderResult` → normalized with the new fields, `turnOrderChoiceRejected` → event.
- `rules-bridge.js`: picker copy = TCG Live's strings; on flip → chat line(s) + ceremony (result text
  "You won the coin flip!" / "Your opponent won the coin flip."), then the winner gets the
  "Do you want to go first?" Yes/No prompt (`openTurnOrderChoicePicker`), the loser a waiting line.
  E2E / rules-off seats answer at once (`goFirst: true`). On result → "You will go first." /
  "Your opponent will go first." and the existing begin-setup path; the FX hold for the deal covers only
  the part of the ceremony still playing.
- Battle-log lines follow TCG Live's wording with "You"/"Your opponent".

## Edge cases & failure modes
| # | Case | Expected | Covered by |
|---|---|---|---|
| 1 | Call submitted | phase → `awaiting-choice`, winner = caller iff result === call, no deal yet | [x] room-turn-order "submitTurnOrderCall flips and hands the choice to the winner" |
| 2 | Winner says go first / second | starter = winner / the other seat; `setup` seats that starter | [x] room "winner going second…", "the chosen starter is the player the setup command seats first" |
| 3 | Loser or spectator submits the choice | `not_winner`, phase unchanged | [x] room "submitTurnOrderChoice rejects the loser and spectators" |
| 4 | Choice before the call / with no handshake | `no_pending_choice` | [x] room "a choice before the coin is flipped is refused" |
| 5 | Duplicate choice | `already_resolved`, deal once | [x] room + transport "a duplicate choice deals once" |
| 6 | `goFirst` not boolean, stale `choiceId` | `invalid_choice` / `stale_choice` | [x] room "malformed and stale choices are rejected" |
| 7 | Winner silent | after `TURN_ORDER_CHOICE_TIMEOUT_MS` server picks go-first, `choiceAuto: true`, deals | [x] transport "a silent winner goes first when the choice times out" |
| 8 | Winner disconnects mid-choice | auto go-first at once; dealt when their seat is bound again | [x] transport "a winner who drops is chosen for at once and dealt to on their return" |
| 9 | Caller disconnects mid-call | auto call → flip; if the dropped caller won, auto choice at once, dealt on their return | [x] transport "a dropped caller is called for…" |
| 10 | Reset / leave mid-choice | `clearTurnOrderCall` + timer cleared; old `choiceId` stale; an explicit Leave is not answered for (the reset follows) | [x] room "a choiceId from before resetGame is stale"; Leave: server.js disconnectHandler skips `handleSeatLost` when the reset will find the seat — not automated (server.js closure), traced by the independent re-review |
| 11 | Hidden info | `choiceId` only reaches the winner's socket | [x] transport "only the winner receives a choiceId" |
| 12 | Result arrives while the ceremony still plays (auto paths, e2e) | starter cached; game starts after the animation and after the deal (dealOrder) | [x] turn-order-call "turnOrderResult is dispatched and cached"; bridge order: `opening-coin-choice-test.mjs` (real prompts; one answer per run, run with CHOICE=first and CHOICE=second) + room-rejoin-reset-test 3/3 — the bridge has no unit harness |
| 13 | E2E / rules off | the winner answers go-first at once; same starter distribution as before | [x] flip-gate-test step 2 (deal + starter draw), room-format-test, reset-during-choice-test |
| 14 | Legacy flag-off 2P, 1P | unchanged flows | n/a — not touched |
| 15 | A seat rebinds its socket mid-handshake (reconnect, rejoin) | its pending call/flip prompt is re-sent (choiceId only to the winner) | [x] transport "replayTo re-sends the pending call…", "a winner whose socket was replaced…" |
| 16 | Choice resolves while any seat is unbound | result stays undealt; dealt once every seat is bound (rejoin replay or next ready) — no seat misses its dealOrder | [x] transport "a result that could not be dealt…", "open retries an undealt result…" |
| 17 | Set Up waits on the deal | `waitForDealOrder(OPENING_DEAL_WAIT_MS)` 45 s ≥ call + choice timeouts (was 5 s: local-shuffle fallback) | [x] deal-order "the opening wait outlasts the call and choice timeouts" |

## Test plan
`node --test` on shared/engine/rules/__tests__/turn-order-flip.test.mjs,
server/game/__tests__/room-turn-order.test.mjs, server/game/__tests__/turn-order-transport.test.mjs (new),
client/src/setup/netcode/__tests__/turn-order-call.test.mjs; then full `pnpm test`; a live 2P run with
`SERVER_AUTHORITATIVE=1` on PORT 4100.

## Migration / rollout
No persisted data, `GameState` unchanged. Revert = revert the branch (server and client ship together;
the message set changes in both).

## Work plan — slices ≤1 session, each leaving the repo green
| # | Slice | Files | Check |
|---|---|---|---|
| 1 | Pure helpers + room two-phase handshake | turn-order-flip.mjs, room.mjs, their tests | rows 1–6, 10 |
| 2 | Transport module, server.js wiring | turn-order-transport.mjs (+test), server.js | rows 5, 7–9, 11 |
| 3 | Client adapter + bridge prompts, ceremony text | turn-order-call.js (+test), rules-bridge.js, coin-flip-ceremony.js | rows 12–13 |

## Assumptions
- (assumed) A silent winner goes first — the outcome before this change.
- (assumed) The 3D TCG Live coin render (design 069, unmerged `feature/tcgl-coins`) is out of this change;
  the ceremony uses whatever coin renderer `main` has, so the two land independently.
- (assumed) Legacy flag-off 2P and 1P keep "caller wins goes first": both are unverified paths (STATE
  watch-out) and 1P has no second human to choose.
- (assumed) Choice timeout 25 s: the prompt opens only after the ~4 s ceremony, leaving ~20 s to answer.

## Deviations (Builder appends here during build)
- Transport dep is `onCallOpened`, not `onOpened`; `deal` returns a boolean so an undealt result can be retried (review).
- Added in build/review: `OPENING_DEAL_WAIT_MS` (Set Up gave up on the deal after 5 s), the bridge waits for `dealOrder` before starting
  (`deal-order-received` event), seat replay on (re)join, Leave no longer auto-answers, undealt-result retry.
- Re-review: the deal waits until every seat has a socket (a first-back seat was dealt to while the other was away).
- Reviewer finding "result lines print mid-ceremony" rejected: `maybeBeginServerTurnOrder` returns before announcing until the ceremony
  timer sets `serverTurnOrderAnimationDone`, and that timer prints "won the coin toss" first.
