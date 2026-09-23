# 036: Mega brush-stroke vortex on the orb canvas
Status: shipped S280 (approved (self): the user named the defect, "the ribbons at the end for the mega evolution look way too stretched and flat", with a TCG Live clip)
Date: 2026-09-23 · Session: S280 · Replaces the slash vortex of design 034 (field, lens, orb of 035 unchanged)

## Problem
034's vortex was flat SVG crescents (`megaSlashSvg`) scaled and rotated in CSS: stretched thin arcs in one plane,
no depth, no thickness, no brush texture. The user called them "way too stretched and flat".

## Reference breakdown (user clip, TCG Live Mega, frame crops)
At the orb burst, fat orange and blue brush crescents whip round the card on wide, nearly flat orbits seen from
slightly above: they sweep below the card in front and above it behind, pass BEHIND the card on the far side,
decelerate, then unwind (tail catches the head) and fade. Each stroke is thick past its middle with a pointed head
and a tail that splits into sharp dry-brush prongs; some switch abruptly from orange to blue along their length.
A few small flecks are thrown off the main strokes.

## Options
1. Rendering. A: keep SVG slashes and add more layers (no per-point perspective, no behind-the-card pass).
   B: draw on the existing orb canvas (035) with real 3D orbits. Pick B: the stage and its WAAPI clock (D118)
   already exist, and depth needs per-segment projection.
2. Colour switch. A: gradient blend. B: hard split with a short feather. Pick B, as in the clip.

## Design
`mat-fx/mega-vortex.mjs` (DOM-free): `MEGA_VORTEX_RIBBONS` (one row per stroke: tail/head colour, orbit radius,
width, arc, tilt, roll, phase, spin, launch lag, prong count); `megaRibbonPose(t, burstAt, lag)` (opacity, spread,
sweep, length); `vortexPoint` (tilted, rolled orbit point, card heights); `strokeTaper` (crescent),
`tailFlare(u, spikes, shift)` (prongs); `strokeOutline` (perspective-scaled outline, CAMERA 9); `sideRuns`
(splits a stroke into front/behind runs by z); `runColourStops` (hard colour split); `drawMegaVortex(ctx, t, opts)`
draws the behind-runs clipped around the card's box (so they pass behind it), then the front-runs. `entry.js` `playMegaOrb` draws it after `drawMegaOrb`
on the same stage; `playCanvasStage(host, {className, cx, cy, size, duration, draw, before})` is extracted and shared
with the Tera entry (037). Removed: `megaSlashSvg`, `megaSlashPose`, `MEGA_ORANGE/BLUE` and their CSS.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | before burst / after fade | draw makes no calls | [x] covered: drawMegaVortex test |
| 2 | every t in [0,1] | draws without throwing | [x] covered: sampled draw test |
| 3 | stroke crossing z = 0 | split into front/behind runs, no gaps | [x] covered: sideRuns tests |
| 4 | tail/head colours differ | one hard stop pair, not a blend | [x] covered: runColourStops tests |
| 5 | no 2D context / no WAAPI | stage skipped, rest of entry plays | [x] playCanvasStage guard (untestable under node) |

## Test plan
`__tests__/mega-vortex.test.mjs` (14 tests: pose beats, orbit geometry, taper/prongs, outline, runs, colour stops,
draw with a recording context). Manual: harness frames compared with the user's clip.

## Migration / rollout
n/a: cosmetic. Revert = `git revert` of the S280 commit.
