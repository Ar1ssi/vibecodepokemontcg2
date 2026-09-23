# 035: Mega keystone orb as a 3D canvas shell
Status: shipped S279; the vortex drawn after it on the same canvas is design 036 (S280) (approved (self): the user named the target: "look at the orb itself, not the colour", with a main-series clip)
Date: 2026-09-23 · Session: S279 · Replaces the orb part of design 034 (field, lens, slash vortex unchanged)

## Problem
The user called 034's Mega "cheap and plasticy" and pointed at the main-series orb. 034's orb was a flat SVG disc
(orange with blue swooshes) that scaled up and faded: no volume, no material, no break-up.

## Reference breakdown (user clip, X/Y Blaziken, 12 fps crops)
Pokémon goes white-hot → flame wings flare in a V behind it → a white-hot sphere swells out → thin energy ribbons
wrap it on tilted orbits, passing behind and in front → the sphere hardens into a dark, flat-shaded faceted shell
with a bright rim, light rays visible inside → white cracks spread across it in an irregular brick-like net and
widen, light bleeding through → the shell shatters into thick glass shards that tumble toward the camera.

## Options
1. Rendering. A: more SVG/CSS layers (can't do depth-sorted ribbons, per-facet shading or a 3D shatter). B: canvas
   2D with real 3D geometry, orthographic sphere and perspective for the shatter. Pick B; ~40 polygons and 5 ribbons
   per frame is cheap.
2. Clock. A: its own rAF timer. B: rAF redraws, reading `currentTime` of a WAAPI animation on the canvas. Pick B: it
   stays in step with the other WAAPI layers, freezes/steps with them (harness), and its `finished` feeds `removeWhen`.
3. Colour. Kept TCG Live's orange/blue for ribbons/flames (the user said the form, not the colour, was wrong).

## Design
`mat-fx/mega-orb.mjs` (DOM-free): `buildMegaShell(seed)` (wavy lat/long brick net on the unit sphere, 40% of the
mid-band cells split on a diagonal; each fragment has centroid, shade, crack `order` spreading from one side,
`crackWidth`, shatter flight/spin); `megaOrbPose(t, burstAt)` (opacity, radius, white, shell, glow, crack, gap,
ribbon, ribbonAlpha, flames, shatter, yaw, turn, shake); `drawMegaOrb(ctx, pose, shell, {cx, cy, unit, time})`
(flames → halo → back ribbon runs → white core → inner rays → facets depth-sorted + glowing cracks + rim → front
ribbon runs → motes); helpers `ribbonPoint`, `ribbonTaper`, `ribbonOutline`, `depthRuns`, `fromLatLon`.
`entry.js` `playMegaOrb` puts a DPR-scaled canvas (7 card heights square) under the vortex. Timing: MEGA_ENTRY_MS
2800 → 3200, MEGA_BURST_AT 0.4 → 0.5; the card silhouette is now a white-hot card (orange/blue SVGs removed).

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | no 2D context / no WAAPI | orb skipped, rest of the entry plays | [x] guard in playMegaOrb (untestable under node: no canvas) |
| 2 | host removed early (backstop) | rAF loop stops on `!canvas.isConnected` | [x] guard; reasoning |
| 3 | pose invisible | draw makes no calls | [x] covered: drawMegaOrb test |
| 4 | every t in [0,1] | draws without throwing | [x] covered: drawMegaOrb 99-sample test |
| 5 | seeds | deterministic per seed, full sphere coverage, unit-length points | [x] covered: buildMegaShell tests |

## Test plan
`__tests__/mega-orb.test.mjs` (12 tests: geometry, timeline beats, ribbon math, draw with a recording context).
Manual: harness frames compared with the user's clip.

## Migration / rollout
n/a: cosmetic. Revert = `git revert` of the S279 commit.
