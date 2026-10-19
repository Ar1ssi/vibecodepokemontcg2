# 038: Dragged card swings with the pointer (TCG Live drag feel)
Status: shipped
Date: 2026-09-24 · Session: S287 (built as S282 in parallel; decision D124)

## Problem
The user sent TCG Live footage of dragging a card from hand onto the board and asked for "this effect",
then clarified: "Look at the CARD that is selected and moved around by the cursor", without the resizing or
shrinking. In our game a drag shows the browser's native ghost: a static, translucent bitmap that never moves
relative to the cursor.

## Constraints
- Drag/drop semantics stay native HTML5 DnD (drag.js, zone listeners, netcode). Only the picture changes.
- Board cards live in two playmat iframes, and the far one is CSS-flipped 180° (iframe-rect.mjs), so a drag
  crosses documents.
- FX kill switch and opt-in reduced motion (mat-fx.mjs `fxDisabled`/`motionReduced`, D103 era) must apply.
- No resize/shrink during the drag (user). Pointer events are suppressed during a native drag, so dragover is
  the only position signal.

## Current state
- drag.js: `dragStart` dims the source (0.6, attached cards 0), `dragEnd` restores; `drop` does the move.
- card-listener-table.js / cover-listener-table.js wire those handlers onto every card/cover <img>.
- iframe-rect.mjs: `readFrameTransform`, `mapIframeLocalToViewport`, `visualRectOf` (iframe → parent viewport).

## Footage measurements (frame-by-frame quad fit on the 240 fps clip, scratchpad `quad.py`)
- Roll (rotateZ) follows horizontal velocity: rightward means clockwise. It reaches ~12–16° even at
  0.25–0.5 px/ms, lags ~100 ms, and settles upright in ~150–300 ms once the pointer stops.
- Pitch: top edge recedes by a few degrees on upward motion (T/B width ratio ≈ 0.95). Yaw: none (L/R ≈ 1.0).
- The card is fully opaque with a soft shadow. Live also shrinks it as it crosses the board, which is
  excluded per the user.

## Options
1. Custom pointer-event drag replacing native DnD: full control, but it rewrites every drop path and netcode
   hook. Rejected: huge blast radius for a cosmetic change.
2. Keep native DnD; blank the ghost with `setDragImage(transparent pixel)` and draw a body-level avatar
   positioned from `dragover` in every frame's window. Picked: drop logic untouched, and one element crosses
   both iframes.
3. Render the avatar inside the source iframe: clipped at the iframe edge and flipped on the far side.
   Rejected.
Physics: velocity-target spring (picked, matches the measured lag/settle) vs. pendulum about the grab point
(needs gravity, reads floaty; footage shows no pendulum swing when stationary).

## Design
- `drag-tilt.mjs` (pure): `DRAG_TILT` params, `DRAG_TILT_STILL` (reduced motion), `createDragTilt(point)`,
  `stepDragTilt(state, point, dtMs, params)`, `tiltTargets(velocity)`, `grabOffset(rect, point)`,
  `dragAvatarTransform(pointer, grab, tilt)`, `returnTransform(rect, size, grab)`. Velocity is smoothed
  (τ 40 ms) and measured over the real gap. Targets are `max·tanh(v/speed)`. The spring (k 360, c 30) is
  sub-stepped at ≤16 ms, and a frame gap is capped at 100 ms.
- `drag-avatar.js` (DOM): `startDragAvatar(event)` (from dragStart) and `endDragAvatar(event)` (from dragEnd,
  plus its own capture `drop`, `mousemove`, and `pointerdown` on every window). The avatar is a fixed <img>
  at the source's visual size, with `transform-origin` at the grab point. rAF steps the physics. A cancelled
  drag (`dropEffect === 'none'`) flies back to the source in 180 ms while the source is hidden. Any other end
  removes the avatar at once.
- `iframe-rect.mjs`: `mapIframePointToViewport` (a point version of the rect mapper, which now uses it).
- CSS `img.drag-avatar` in index.css: z 100001, pointer-events none, card corner radius, shadow.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | FX off / non-<img> source / no dataTransfer | native ghost, no avatar | [x] e2e FXOFF run (avatar null, drop worked) |
| 2 | invalid dt / point, NaN, Infinity | state unchanged / finite | [x] drag-tilt "zero, negative or invalid…", "long stall…" |
| 3 | boundaries: max roll, slow speed, settle | ≤ max·1.05, ≥60% at 0.3 px/ms, <0.5° after 450 ms | [x] drag-tilt tests |
| 4 | new drag while one is live / flying back | stale session ended first | [x] startDragAvatar calls endDragAvatar(); source hidden during flight |
| 5 | dragend never arrives (source re-rendered away) | drop/mousemove/pointerdown end it | [x] reasoning: mouse events are suppressed only during a native drag |
| 6 | cancel flight stalls (hidden tab) | 1 s backstop removes the avatar, restores visibility | [x] reasoning: settle() on backstop |
| 7 | far (flipped) iframe drag | pointer stays on the grabbed spot | [x] e2e "far-side drag…" grab 0.31 vs 0.30 |
| 8 | frame-rate independence | 60 Hz ≈ 144 Hz | [x] drag-tilt "same at 60 Hz and 144 Hz" |
| 9 | reduced motion | card follows flat, no fly-back | [x] drag-tilt "reduced motion keeps the card flat" |
| 10 | size | avatar = picked-up visual size | [x] e2e "keeps the picked-up size"; returnTransform scale test |

## Test plan
Unit: `__tests__/drag-tilt.test.mjs` (15), `iframe-rect.test.mjs` (+1). E2E eyeball: scratchpad Playwright,
2P room, real mouse drags (sweep right/left, hold, Escape cancel, bench drop, far-side card).

## Migration / rollout
n/a: client-only cosmetic. Revert = drop the two drag.js calls. The FX kill switch (`ptcg-fx-off`) already
restores the native ghost at runtime.

## Work plan
| Slice | Delivers | Green when |
|---|---|---|
| 1 | physics + avatar + wiring + CSS + tests | unit + e2e green |

## Deviations
- The source keeps its existing 0.6 dimming during the drag. Live empties the slot, but that is a separate
  hand-layout change the user did not ask for.
