# 043: TCG Live opponent Trainer play
Status: built S308 on feature/opp-play-fx (not pushed) — video out/opp-play.webm; design self-approved (user sent the clip, asked directly and answered the scope questions in chat), flagged at close
Date: 2026-09-25 · Session: S308

## Problem
When the opponent plays a Trainer or Stadium, `lifecycle.js trainerPlay` shows today's centred
presentation: the card grows from where it was, holds under a screen dim, then fades out in place.
The user sent a TCG Live clip (5.1 s, `out/play-ref/`) and wants the opponent's plays to look like
it, with the preview held twice as long.

Reference, frame by frame (15 fps crops): a face-down card lifts off the opponent's hand and drops
toward the mat, flipping face up on the way (~130 ms). It lands small on the mat, then grows to a big
preview in the middle of the play area (~200 ms, about 2.5× a board card, no screen dim). It holds
still for ~600 ms, then shrinks into its spot on the board (~200 ms) and stays there.

Scope (user answers): opponent Trainers and Stadiums only. Your own plays keep today's presentation.
Pokémon, Energy, Tools and evolutions are unchanged.

## Constraints
- D103[mat-fx]: WAAPI keyframes sampled from pure pose functions; pose math is DOM-free and unit-tested.
- Cosmetic only: board state is already applied; overlays remove themselves with backstop timers.
  `body.fx-off .fx-overlay` hides them, and reduced motion skips the effect (no STATIC_FALLBACKS entry).
- The opponent's board iframe is turned 180° (`frameTurnOf`), so its cards read upside down on screen.
  The flight must start and land at the board's turn, and the preview must be upright.
- Memory (user feedback): no whiteouts or spinning sunburst rays. Keep one palette.
- FX queue budget 2500 ms (fx-queue.mjs). An effect may return its own hold (dispatcher override).

## Current state
- Engine `effects/trainer.mjs` (~174–210): the card leaves the hand for `zones.board` (or
  `draft.stadium`, with a `cardMoved hand→stadium`), then `trainerPlayed {playerId, instanceId, name,
  stadium}`; Tools emit `cardAttached` instead. A Trainer that resolves with no choice goes silently from
  the board to the discard pile in the same command, so post-diff it may sit in the pile.
- `advisory-animations.mjs`: `trainerPlayed` → effect `trainer-play`. (`stadiumEffectUsed` →
  `stadium-play` is USING a Stadium, not playing one: out of scope.)
- `origins.mjs idsToCapture`: `trainerPlayed` snapshots the hand card pre-diff via
  `captureKnockoutGhost` → `{rect, src, user, turn}`. The opponent's hand is redacted to
  `{instanceId}`, so its card is registered and drawn as the sleeve (`src` = card back).
- `lifecycle.js trainerPlay`: `presentCard(presentSrcFor(origin, element), origin.rect)`, hold 520
  (`fx-holds.mjs`). Post-diff the element's `src` is the face (Trainers are public once played).
- `combat.js hideDuring(element, promise, backstopMs)` hides a real card while its ghost moves.
- `card-flight.js pileOf(user, 'discard')` → `{rect, turn}` of the discard pile cover.

## Options
1. Where the preview sits. A: viewport centre, like today. B: centre of the play mat (union of the
   `#selfContainer`/`#oppContainer` iframe rects). **Pick B**: the reference holds the card on the mat,
   and the mat is not centred when side panels are open.
2. The real card at the destination. A: leave it visible; the preview lands on top of a card that is
   already there. B: hide it (`visibility`) until the preview lands, then show it. **Pick B**: the landing
   is the payoff. `hideDuring` moves to `image-logic/mat-fx.mjs` so combat and this effect share it.
3. Where it lands. A: always its element. B: element if it is on screen; otherwise the discard pile when
   the card went there (a Trainer that resolved at once); otherwise shrink and fade in the middle. **Pick B**.
4. Flip. A: swap the image source at the half-way point. B: two faces (sleeve back, card front) with
   `backface-visibility: hidden` under one rotateY. **Pick B**: a true 3D flip on the compositor.

## Design
New `mat-fx/opp-play.mjs` (pure):
- `OPP_PLAY_HOLD_MS = 1200` (the reference's ~600 ms, doubled as asked), `OPP_PLAY_MS = 520 +
  OPP_PLAY_HOLD_MS + 300` = 2020. Phases: drop and flip 0–260 ms, grow 260–520, hold, place (last 300).
- `oppPreviewRect(center, viewport, aspect=0.716)` → a card-shaped box, height
  `min(0.42·viewport.height, 380)`, centred on `center`.
- `oppPlayTrack({from, preview, to, fromTurn, toTurn, toFade})` → `(t) => {x, y, rotate, flip, scale,
  opacity}`, px from the preview centre, `scale` relative to the preview. `from`/`to` are rects or null.
  With no `from`, the card starts above the preview at scale 0.3. With no `to`, it shrinks to 0.3 at the
  centre and fades (`toFade` also fades it, for the discard pile). `flip` is rotateY degrees, 180 (back)
  down to 0 by the end of the drop. `rotate` goes from `fromTurn` to 0 over the drop and from 0 to
  `toTurn` (normalised to [-180, 180]) during the place. A small overshoot (scale 1.04) when the grow ends,
  settling by 60 ms into the hold.

New `mat-fx/opp-play.js` (DOM): `playOppTrainer({origin, element, src})` builds
`.fx-opp-play` (host on the preview rect) → `__card` (preserve-3d) → `__back` img (origin src, the
sleeve) + `__front` img (face) + `__shine`. Runs the track via `sampleKeyframes`/`animateFrames`,
hides the destination element until the landing, and returns false when nothing could play.
`lifecycle.js trainerPlay`: `plan.user === 'opp'` → `playOppTrainer`; returns
`holdFor('opp-trainer-play')` (1700: what follows starts as the card is placed), or 0 when it drew
nothing. Your own plays keep `presentCard`.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | no origin (hand not on screen, capture failed) | starts above the preview, face down | [x] covered: oppPlayTrack no hand rect |
| 2 | no face src (element missing) | nothing plays; the effect returns hold 0 | [x] reasoning: playOppTrainer returns false without src; trainerPlay returns 0 |
| 3 | destination not on screen, card in the discard pile | shrinks onto the pile and fades | [x] covered: oppPlayTrack toFade; video (Nest Ball onto the pile) |
| 4 | destination unknown, not in the pile | shrinks to 0.3 at the centre and fades | [x] covered: oppPlayTrack no slot shrinks and fades |
| 5 | Stadium replacing a Stadium | the old one flies to the pile first (design 042), then the preview | [x] reasoning: the discard event comes first in the batch (effects/trainer.mjs), design 042 flies it |
| 6 | opponent board turned 180° | starts turned, preview upright, lands turned like the board | [x] covered: oppPlayTrack starts/lands at 180, upright hold; normalizeTurn; video |
| 7 | your own Trainer | today's presentation, unchanged | [x] covered: playsOppPreview; trainerPlay keeps presentCard for self |
| 8 | fx off / reduced motion / hidden tab | skipped by the dispatcher and the queue | [x] reasoning: unchanged dispatcher/queue guards; no STATIC_FALLBACKS entry |
| 9 | two Trainers in one batch | queued; each plays its own scene (hold 1700, budget 2500 collapses later holds) | [x] reasoning: fx-queue paces each plan; budget test in fx-queue tests |
| 10 | real card re-rendered or effect aborted | visibility restored by the backstop timer | [x] reasoning: hideDuring backstop OPP_PLAY_MS + 400 |
| 11 | tiny/zero viewport or mat rects | preview falls back to the viewport centre; nothing plays under 2 px | [x] covered: matCenter fallbacks; playOppTrainer returns false under 2 px |

## Test plan
Unit (`node --test`): opp-play track (starts at the hand turned, back showing; face showing by the end of
the drop; centred and upright during the hold, full hold length; lands on the destination at its turn;
no-from and no-to fallbacks; rotate normalisation), preview rect, trainerPlay routing by side
(pure helper). Video check: Playwright on the e2e board (`.agent/scratch/rec-opp-play.mjs`), frames
compared with the reference sheet.

## Migration / rollout
n/a — client cosmetic. Revert = revert the commit; no data touched.

## Work plan
| Slice | Delivers | Green when |
|---|---|---|
| 1 | pure opp-play.mjs + tests; DOM driver, CSS, trainerPlay routing, hold; video check | suite green, video matches |

## Deviations (Builder appends here during build)
- Opacity runs on the host, not the 3D card: animating it on the preserve-3d wrapper flattened it and
  the sleeve side never showed (caught on the first video). `landsAtMs` dropped: the real card is shown
  when the card animation finishes (`hideDuring` on the same promise that removes the overlay).
- The new hold name `opp-trainer-play` needed a voice (fx-audio test "every effect with a hold has a
  voice"): a swoosh on the drop plus the trainer chime at 0.26 s; `index.js soundPlanFor` routes the
  opponent's `trainer-play` to it. `apply-view resolveCardBackSrc` is now exported for the no-origin back.
- The shine band sits in its own clipped layer: the 3D card wrapper cannot clip.
- The opponent's board is turned 180°, so the card turns half a circle while it shrinks into its slot.
