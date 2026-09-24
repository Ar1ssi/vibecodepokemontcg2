# 034: Signature entries rebuilt from TCG Live footage (Tera, Mega)
Status: shipped S278; Mega orb replaced by design 035 (S279); Mega vortex by 036 and the Tera entry by 037 (S280)
Date: 2026-09-23 · Session: S278 · Supersedes the visuals of design 027 (triggers, registry and kind test unchanged)

## Problem
The user found design 027's Tera/Mega entries poor, and supplied two TCG Live clips as the target. Captures of the
old build showed why: the Tera crystal was type-coloured (a Darkness Tera rendered grey), and the Mega entry was
card-local swooshes, where Live floods the whole mat.

## Constraints
- D94 dispatch (one EVENT_FX row + registry entry, kill switch, reduce-motion) and D103 (WAAPI keyframes sampled from
  pure, unit-tested pose functions) stay. D104 triggers (`pokemonEvolved`, `enter`) are unchanged.
- No engine/protocol change, and no new dependency.

## Current state
`mat-fx/entry.js` (DOM layers + `playSignatureEntry`/`enter`), `entry-pose.mjs` (timelines), `entry-kind.mjs`
(Mega/Tera test), `lifecycle.js` `evolve` (calls `playSignatureEntry`), `css/mat-fx.css` (entry section). The mat
artwork is on the parent page in `#battleMat > #battleMatTrim > #battleMatSurface` (table tilt + mat outline clip);
the card zones are transparent iframes stacked above it.

## Reference breakdown (frames pulled from the clips)
- Tera (~1.9 s, Bench): card lands → white flash → flat mint crystal with prism facets and horizontal lens streaks →
  a six-point Tera jewel grows over the top → thin orbit arcs and dust → white light fills the crystal from the
  bottom → white burst with rays, a violet smoke ring and rainbow glitter → card revealed with twinkles.
- Mega (~2.8 s, Active): pastel hex field spreads over the whole mat from the card → glass lens around the Active →
  card goes flat orange/blue, rounds into the Mega keystone orb which grows and strains → white burst → orange and
  blue brush strokes whip round the card on a squashed orbit and decelerate → embers rise, everything fades.

## Options
1. Tera colour. A: keep type colour (D104). B: fixed mint. Pick B: Live uses mint whatever the Tera type (the
   clip's Tera Darkness Greninja is mint), and type colours such as Darkness/Metal read grey.
2. Where the Mega field lives. A: a fixed body overlay over the union of the playfield iframes' rects (tried first:
   the iframes span the full board width, so it spilled past the mat onto the black margins). B: a child of
   `#battleMatSurface`. Pick B: it inherits the table tilt and the mat outline for free, and the card zones stay on
   top of it as in Live. A soft-edged fixed overlay around the card is the fallback when the surface is missing.
3. Field reveal. A: animated `clip-path: circle()`. B: counter-scaled wrappers (compositor only). Pick A: a
   ~450 ms main-thread repaint is acceptable here and B only approximates a circle. The rest stays transform/opacity.

## Design
- `entry-pose.mjs`: Tera `teraFlash/Slab/Streak/Jewel/Ring/Fill/Whiteout/Rays/SmokePose` (TERA_ENTRY_MS 1900,
  TERA_BURST_AT 0.58, TERA_GLINT_AT 0.7); Mega `megaField/Wave/Wash/Lens/Silhouette/Orb/Flash/SlashPose`
  (MEGA_ENTRY_MS 2800, MEGA_MORPH_AT 0.16, MEGA_BURST_AT 0.4); layout `megaStageRect(card, viewport)` and
  `megaFieldPlacement(card, surfaceRect, surfaceSize)` → `{x, y, unit, reach}` in field pixels (screen → layout scale
  undoes the tilt's foreshortening).
- `entry-art.mjs` (new, pure strings): `hexPoints`, `hexTile(radius, cells)` (seamless pointy-top tile; the white
  3×4 and tinted 5×6 cell grids share one lattice, so the pattern repeats every 15 columns and 12 rows), `svgDataUrl`, `jewelStarPoints`, `teraJewelSvg`,
  `TERA_FACETS_SVG`, `MEGA_SILHOUETTE_SVG`, `MEGA_ORB_SVG`, `megaSlashSvg(colour)`.
- `entry.js`: `playSignatureEntry(kind, rect)` (card arg dropped; `lifecycle.js` updated). Mega = `playMegaField`
  (host `.fx-mega-field` in `#battleMatSurface`, fallback `.fx-overlay.fx-mega-field--floating`) + `playMegaCard`
  (card-rect overlay with overflow visible). Slashes are `rotate(tilt) scaleY(0.5) rotate(θ) translateX(r)` orbits.
  Every host is removed by `removeWhen` with a backstop.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | card rect unknown | `playSignatureEntry` returns false, nothing spawned | [x] existing guard (`if (!rect)`) |
| 2 | mat surface missing / zero-size | floating soft-edged field around the card | [x] covered: megaFieldPlacement/megaStageRect tests + code path |
| 3 | card off-screen | stage clips to empty, placement null, field skipped; card layers still play | [x] covered: `megaStageRect` off-screen test |
| 4 | two entries at once (both players) | independent hosts; no shared ids (jewel gradient only declared by the gradient-filled copy) | [x] covered: entry-art "flat copy declares no ids" |
| 5 | hidden tab / cancelled animation | `removeWhen` backstop removes both hosts | [x] existing primitive |
| 6 | kill switch toggled mid-effect | `body.fx-off` hides `.fx-overlay` and `.fx-mega-field` | [x] CSS rule |
| 7 | t outside [0,1], every layer invisible at both ends | clamped, opacity 0 at 0 and 1 | [x] covered: entry-pose generic tests |

## Test plan
Unit: `__tests__/entry-pose.test.mjs` (beats, ordering, geometry), `__tests__/entry-art.test.mjs` (hex tiling, jewel
geometry, SVG well-formedness). Manual: scratch harness drove both entries on the real board page with WAAPI time
frozen and stepped, compared frame sheets against the clips.

## Migration / rollout
n/a: cosmetic only. Revert = `git revert` of the S278 commit.

## Work plan
| Slice | Delivers | Green when |
|---|---|---|
| 1 | poses + art + DOM/CSS for both entries | mat-fx tests pass, suite unchanged, frame sheets match the clips |

## Deviations
- The Mega field sits under the card zones (iframes), so other Pokémon on the board stay visible over it. Covering
  them would mean moving the field above the iframes and losing the mat outline.
