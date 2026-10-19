# 044: TCG Live draws (opening hand, turn draw, opponent draws)
Status: built S308 on feature/draw-fx, shipped to main S308 — video out/draw-scene.webm; design self-approved (user sent two clips, asked directly and answered the two design questions in chat), flagged at close
Date: 2026-09-25 · Session: S308

## Problem
Every draw is one spring "drag" per card from the deck to its hand slot (`card-pop.mjs playDrawFlight`,
180 ms stagger). The user sent two TCG Live clips (`out/draw-ref/`) and wants draws to look like them,
and the opponent's draws to "fly" instead of today's drag.

Reference, frame by frame:
- Opening hand (clip 19-56-30, 24 fps): each card leaves the deck edge-on, flips face up while it flies
  (~170 ms), and lands in a spread over the mat — 4 cards on top, 3 below — one every ~85 ms. The spread
  holds ~0.2 s, then the cards drop one by one (~110 ms apart, top row first) into the hand.
- Turn draw (clip 19-57-27, 20 fps): after the "your turn" banner, the card flips out of the deck to a big
  centred preview (~150 ms), holds ~0.6 s, then drops into its hand slot (~200 ms).

User answers: holds match the clips; opponent draws get a proper flight (their cards stay face down).
Out of scope: prize takes (they keep today's flight), the mat glow at game start, the hand opening a gap.

## Constraints
- D103[mat-fx]: WAAPI keyframes from pure pose functions, unit-tested; overlays self-remove with backstops.
- Cosmetic only; `body.fx-off .fx-overlay` hides overlays. Today's draw flight ignores the fx toggles; the new
  one keeps its existing guards (`shouldAnimateDrawFlight`: sync replay, hidden tab).
- The real card is already in the hand; it stays hidden (`draw-flight-source`) until its card lands.
- Opponent board iframe turned 180° (`frameTurnOf`); their hand sits partly off the top of the screen.
- Two draw paths share `draw-flight.js playDrawToHand`: the legacy/1P mover (`move-card.js`, one call per card,
  awaited one after another) and the authoritative advisory `cardsDrawn` plan (all cards in one call).
- Memory: no whiteouts or spinning sunburst rays.

## Current state
- `image-logic/draw-flight.js`: `playDrawToHand(user, card, {fromRect})` hides the card, staggers 180 ms,
  builds `.card-draw-flight` with sleeve/face and runs `playDrawFlight` (springs). Also used for prize → hand.
- `move-card.js` ~722: deck/prizes → hand calls it with `fromRect` from `originRectForHandFlight`.
- `advisory-animations.mjs`: `cardsDrawn` → `{kind:'draw', cards}` (only `{instanceId}` entries; some engine
  sites emit bare ids). `advisory-animations.js playDrawPlan` loops `playDrawToHand`; `runPlan` holds 0.
- Engine `setup.mjs`: `openingHandDealt {playerId, count}`, `mulliganTaken`, `bonusDrawAwarded` carry no ids, so
  in authoritative 2P the opening hand (server-rendered hand zone, D11) appears with no animation at all.
- Engine `reduce.mjs advanceTurn` (~2838): the turn draw's `cardsDrawn` is pushed BEFORE `turnStarted`.

## Options
1. Batching the legacy path's one-call-per-card. A: animate each card alone. B: coalesce calls per side
   (debounce 90 ms) into one batch; batches for one side play one after another. **Pick B**: the spread needs
   the whole draw; the advisory path passes all cards at once and skips the debounce.
2. Turn draw after the banner. A: client lookahead/reorder in the queue. B: engine pushes `turnStarted` before
   the turn draw (the rulebook's order: the turn starts, then you draw). **Pick B**: one line, no client state;
   the battle log reads better too.
3. Opening hand in authoritative 2P. A: client infers it from the view diff. B: engine events carry
   `cards: [{instanceId}]` (`openingHandDealt`, `mulliganTaken`, `bonusDrawAwarded`), like `cardsDrawn`
   (instance ids are not secret: the opponent's hand is redacted to them). **Pick B**.
4. Opponent flight. A: tune the springs. B: design 042's `planFlight`/`flightPose` arc (tumble, lean, scale),
   sleeve art, no light streak. **Pick B**: same motion language as discards.

## Design
New `mat-fx/draw-scene.mjs` (pure):
- `DRAW_IN_MS 220`, `DRAW_STAGGER_MS 85`, `DRAW_OUT_MS 200`, `DRAW_OUT_STAGGER_MS 110`, `SINGLE_HOLD_MS 600`,
  `SPREAD_HOLD_MS 200`, `MAX_SPREAD 10` (more cards: the rest drop straight from the deck, no preview).
- `drawSceneTimes(count)` → `{inStart(i), allIn, holdEnd, outStart(i), total}`; count 1 holds SINGLE, else SPREAD.
- `drawSpreadRects(count, center, viewport, aspect=0.716)` → rects: rows = ceil(n/4), per row ceil(n/rows),
  top row fullest; n=1 → one card `min(0.42·vh, 380)` tall; else height fits 0.62·vh by rows and 0.72·vw by
  columns, capped at 0.3·vh; gap 10 % of the height.
- `drawCardTrack({index, count, deck, slot, hand, deckTurn})` → `(t)=>{x,y,rotate,tiltX,flip,scale,opacity}` over
  `total`, px from the slot centre, scale of the slot: hidden until its `inStart`; flies deck → slot on a
  slight arc with flip 180→0 and a tilt peak; small overshoot on arrival; holds; drops slot → hand slot
  (scale to the hand card); a missing hand rect fades it out in place.
New `mat-fx/draw-scene.js` (DOM): `playDrawScene(user, cards)` (cards = `{image, wrapper?}` already hidden):
spread centred on the mat (`matCenter`), one `.fx-flip-card` overlay per card (sleeve back, face front, the
fade on the host — design 043's lesson), each card shown when its own animation ends; returns total ms.
`playOppDrawFlights(user, cards)`: per card a `planFlight` arc deck cover → hand card, both at their turn,
`playCardTrack` with no streak, FLIGHT_STAGGER_MS apart; card shown on landing.
`draw-flight.js playDrawToHand(user, card, {fromRect, source})`: `source` 'deck' (default) joins the side's
batch; other sources (prizes) keep today's spring flight. Batch flush: face-up cards → `playDrawScene`,
face-down → `playOppDrawFlights`. `playDrawBatch(user, cards)` is exported for the advisory path (no debounce).
Advisory: `openingHandDealt`/`mulliganTaken`/`bonusDrawAwarded` with `cards` → `draw` plans; `cards` accepts bare
ids too; `playDrawPlan` skips cards not drawn in the hand, and `runPlan` returns the scene's hold (its total
minus the last drop) for your own draws, 0 for the opponent's. CSS: `.fx-flip-card*` shared with opp-play.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | empty draw / no cards in the hand DOM | nothing plays, hold 0 | [x] covered: drawSceneHold(0); reasoning: playDrawBatch returns 0 cards |
| 2 | bare-id `cards` | parsed like `{instanceId}` | [x] covered: advisory bare-id test |
| 3 | 1 card / 7 / >MAX_SPREAD | big preview / 4+3 spread / first 10 spread, rest straight to hand | [x] covered: spreadRows, drawSpreadRects, past-MAX_SPREAD track; video |
| 4 | legacy calls spread over time | debounce joins them; a later batch waits for the previous one | [x] reasoning: 90 ms window per side + sideBusyUntil in draw-flight.js |
| 5 | mulligan (hand dealt, returned, redealt) | first deal's cards are in the deck → skipped; the redeal plays | [x] covered: supersededDeals test; engine ids test; reasoning: zone==='hand' filter |
| 6 | opponent draw | sleeve arcs to their hand, face down, turned like their board | [x] video (two sleeves arc off the top) |
| 7 | hand slot missing mid-scene | card fades at its slot; real card shown by the backstop | [x] covered: no-hand track fades; reasoning: revealWhen backstop |
| 8 | sync replay / hidden tab / catch-up | no animation (existing guards); cards shown at once | [x] reasoning: shouldAnimateMirror before enqueue; drawFlightAllowed shows cards |
| 9 | prize take into hand | unchanged spring flight | [x] reasoning: move-card passes source=oZoneId; non-deck keeps startDrawToHand |
| 10 | turn draw vs banner | engine emits turnStarted first; banner, then the draw | [x] covered: turn-loop order test |
| 11 | deck-out at turn start | turnStarted then gameEnded, no draw | [x] covered: turn-loop deck-out test |

## Test plan
Unit: draw-scene (times, spread layout rows/sizes, track: hidden before its turn, sleeve at deck, face up at
slot, overshoot/hold, lands on hand slot, missing hand fades), advisory plans (opening/mulligan/bonus, bare ids),
engine (turnStarted before the turn draw; opening/mulligan/bonus events carry ids). Video check on the e2e
board (`.agent/scratch/rec-draw.mjs`) against the reference sheets.

## Migration / rollout
n/a — cosmetic plus additive event fields and one event-order swap. Revert = revert the commits.

## Work plan
| Slice | Delivers | Green when |
|---|---|---|
| 1 | engine: event ids + turn order; advisory plans | node --test green |
| 2 | draw-scene pure + DOM, opponent flights, batching, CSS; video check | suite green, video matches |

## Deviations (Builder appends here during build)
- CSS shares design 043's flip-card rules by selector (`.fx-draw-scene__*` next to `.fx-opp-play__*`) instead of
  new `.fx-flip-card` classes. Draw overlays carry `fx-draw`, which stays visible with effects off (the old
  draw flight ignored the toggle too).
- Advisory path: the drawn cards are hidden when the plan is queued (`holdDrawnCards`, 6 s reveal backstop), so
  they do not sit visible in the hand while the turn banner plays. A deal a later mulligan replaced is skipped
  (`supersededDeals`, computed in `handleBeforeApply`), so a kept card never flies in twice.
- `playDrawBatch` returns the card count; `runPlan` turns it into `drawSceneHold` for your own draws.
  Face-down = the registry's `isRedacted` or `isCardHidden`. `playCardTrack` got an optional `trail`.
