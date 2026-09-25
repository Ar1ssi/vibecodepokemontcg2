# 045: TCG Live prize flights
Status: built S309 on feature/prize-fx (not pushed) — video out/prize-flight.webm; design self-approved (user asked directly: "use what you've learned and add some similar flight to the prize card animations"), flagged at close
Date: 2026-09-25 · Session: S309

## Problem
Prize takes still use the old motion. The pick fan (`prize-take-prompt.js`) springs the sleeves up and back
(`card-pop.mjs playDrawFlight/playReturnFlight`). In server-authoritative 2P a picked prize just vanishes from
the fan and appears in the hand; the opponent's taken prizes appear in their hand with no flight. Only the
`prize-claim` burst plays. The user wants the flight language of designs 042/044 on prizes too.

Out of scope: the prize-claim burst (kept), the fan's layout and pick rules, prizes shuffled back to the deck.

## Constraints
- D103: WAAPI keyframes from pure pose functions, unit-tested; overlays self-remove with backstops.
- Draw overlays (`fx-draw`) animate with effects off, like the flights they replace (design 044).
- Unrevealed prizes are redacted to `{instanceId}` even for their owner: a picked card's face is only known
  once the server moves it to the hand.
- Memory: no whiteouts or spinning sunburst rays.

## Design
1. Fan (`prize-take-prompt.js`): fly-up and drop-back ride design 042's arc (`planFlight`/`flightPose`,
   opacity held at 1) from the prize card's rect and board turn to the fan slot and back, WAAPI on the host.
   Pure track in new `mat-fx/prize-fan.mjs` `fanFlightPose({from, to, fromTurn, reverse, seed})`.
2. Picked cards stay on screen: at confirm each chosen sleeve moves out of the overlay (it survives teardown,
   4 s backstop) and is registered as the card's hand-flight start (`draw-flight.js registerPrizeHandoff`,
   keyed by the card object and its instanceId).
3. Your prizes into the hand = the draw scene (design 044) starting from the fan sleeve (or the prize card on
   the mat when there was no fan): the sleeve flips face up into the spread / big preview, holds, drops into the
   hand. The sleeve is removed as its scene card starts. Opponent prizes = design 044's sleeve flights, from
   each taken prize's pre-diff rect (origins.mjs now snapshots `prizesTaken` cards) to their hand card.
4. Paths: legacy `playDrawToHand(..., {source: 'prizes'})` joins the side's draw batch with its start rect
   (no more spring); advisory `prizesTaken` with cards → `[prize-claim fx, draw plan {source: 'prizes'}]`.
   Batch items become `{image, wrapper, user, redacted, from: {rect, turn, release?}}`; `playDrawScene`/
   `playOppDrawFlights` start each card at `from` when present, else at the deck.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | auto prize take (no fan) | cards start at their prize slot on the mat | [x] reasoning: no handoff → pre-diff seat (advisory) / prize node rect (legacy) |
| 2 | server answer slow / never comes | sleeves hold at the fan; removed by the 4 s backstop | [x] reasoning: registerPrizeHandoff timer |
| 3 | prize origin missing (fx off: no snapshot) | start at the side's prize zone, else the deck | [x] reasoning: seats captured regardless of fx (deviation); none → scene starts above its slot, opponent card just shows |
| 4 | opponent takes 2 prizes | two sleeves arc from their prize slots to their hand | [x] video |
| 5 | last prize ends the game | flight plays under the game-over effect | [x] reasoning: gameEnded is queued after the draw plan; draw overlays are independent |
| 6 | fan cancelled (choice withdrawn) | sleeves drop back on the arc; nothing registered | [x] reasoning: cancel → finishPrizeTake(0), handOffChosen only runs on confirm |
| 7 | 1P / legacy path | same scene via the batched `playDrawToHand` | [x] reasoning: move-card passes source prizes; prizeStartOf takes the handoff |
| 8 | prizesTaken without cards | burst only (unchanged plan) | [x] covered: advisory tests (no cards / unknown side) |

## Test plan
Unit: `prize-fan.mjs` (starts at the prize rect and turn, ends on the slot upright, reverse ends on the prize,
opacity 1), advisory plan fan-out for `prizesTaken` with/without cards, origins capture of prize cards,
draw-scene track from a `from` rect. Video check (`.agent/scratch/rec-prize.mjs`): fan up, pick, sleeve to
preview to hand; opponent prize flights.

## Migration / rollout
n/a — client cosmetic. Revert = revert the commit.

## Work plan
| Slice | Delivers | Green when |
|---|---|---|
| 1 | prize-fan pure + fan WAAPI; handoff; batch `from`; advisory/origins; video | suite green, video matches |

## Deviations (Builder appends here during build)
- Prize seats are captured in `advisory-animations.js` (`capturePrizeSeats`), not origins.mjs: origins only run
  with effects on, and draws animate with effects off. The claim burst plays first, then the draw plan.
- The old spring draw flight had no callers left and was removed: `card-pop.mjs playDrawFlight/playReturnFlight/
  drawFlightPose` (+ tests), `draw-flight.js startDrawToHand/setHandFlightOrigin`, `.card-draw-flight` CSS.
- The handoff rect is the sleeve image (lifted when selected); `drawCardTrack` got `fadeIn` so the scene card
  takes over a standing sleeve without a fade.
