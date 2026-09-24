# 037: Terastallization entry (canvas) and persistent Tera crystal skin
Status: shipped S280, amended S281 (typed palette, below) (approved (self): the user sent a Scarlet/Violet clip, "study the terastilize animation, and at the end look at the filter it puts on the pokemon"; skin lifetime chosen by the user: "Persist while in play")
Date: 2026-09-23 · Session: S280 · Replaces the Tera part of design 034 (and D117's mint colour)

## Problem
034's Tera entry was a mint CSS slab with a jewel, streaks and violet smoke: nothing like the main-series
Terastallization the user pointed at. And after the entry the card looked exactly as before, while in the games a
Terastallized Pokémon keeps a crystal "filter" (blue glass facets, glints) for as long as it is out.

## Reference breakdown (user clip, S/V Terastallization)
Tera Orb drops onto the Pokémon in a violet starburst → screen flashes lime then teal → six-point Tera Jewel blazes
over the Pokémon and dims → Pokémon goes white → chunky glittering crystal blocks grow round it from a glitter floor,
rainbow beams fan out behind → cluster brightens to a whiteout and bursts into a blue disc of chromatic shards under
two expanding rainbow rings → Pokémon revealed wearing an icy blue faceted crystal skin with white glints.

## Options
1. Entry rendering. A: more CSS layers. B: one canvas stage with real 3D prisms (lit per face, depth-sorted).
   Pick B, reusing 036's `playCanvasStage` and D118's WAAPI clock.
2. Skin carrier. A: CSS filter on the card img (can't draw facets or glints). B: layers inside the holo wrapper's
   rotator (tint/facets/sheen, clipped to the card, follow its tilt) plus an aura for rim glow and glints; a card with
   no wrapper gets a CSS glow only (an <img> holds no children). Pick B.
3. When skins update. A: poll. B: reconcile on a new `board-view-applied` event (end of applyView) and on
   `holo-wrapper-changed` (the wrapper replaces the img later). Pick B.

## Design
Entry: `mat-fx/tera-crystal.mjs` (DOM-free): `TERA_ENTRY_MS` 3000, `TERA_BURST_AT` .83, `TERA_REVEAL_AT` .88,
`TERA_PALETTE` (icy blue/silver + lime/teal/violet accents), `teraEntryPose(t)`, `buildTeraScene(seed)` (prisms,
trail, rays, glitter, shards), `projectPoint`, `prismGrowth`, `drawTeraEntry(ctx, t, {cx, cy, unit, card, scene})`.
`entry.js` `playTeraEntry` draws it on a 7-card-height canvas stage. Old Tera poses/SVGs/CSS removed.
Skin: `mat-fx/tera-skin.mjs` (pure): `teraSkinTargets(zoneArrayOf, held)` (top card of each in-play Tera stack,
both sides, active + bench), `createSkinReconciler({targetIds, nodeFor, apply, remove, schedule, cancel})`
(`refresh` diffs wanted vs applied by instanceId and moves a skin when its node changes; `hold(id, ms)` strips it and
keeps it off until the timer), `teraSkinFacets(seed)` (low-poly SVG mesh), `teraSkinGlints(seed)` (3 staggered).
`mat-fx/tera-skin.js` (DOM): applies `.fx-tera-crystal` + layers; `installTeraSkins()` from `mat-fx/index.js`.
`apply-view.js` dispatches `board-view-applied` after `lastAppliedView = view` (listeners read the new view; holds
from the advisory loop are already set). `playSignatureEntry(kind, rect, instanceId)` holds the skin for
`TERA_ENTRY_MS * TERA_REVEAL_AT` so the card comes out of the burst already crystal. Styles: css/mat-ambient.css.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | Tera Pokémon evolves / leaves play / goes to hand | skin follows the top card or comes off | [x] covered: teraSkinTargets + reconciler tests |
| 2 | holo wrapper arrives after the img | skin moves img → wrapper | [x] covered: reconciler "new node" test; harness |
| 3 | entry still playing | skin held until reveal, then applied once | [x] covered: hold tests |
| 4 | bad zones / non-object cards / null ids | skipped | [x] covered: teraSkinTargets test |
| 5 | FX off (`fxDisabled`) or no authoritative view | no skins (existing ones removed on next refresh) | [x] targetIds guard |
| 6 | reduced motion | layers static, glints hidden | [x] CSS media block |
| 7 | every t in [0,1] of the entry | draws without throwing, save/restore balanced | [x] covered: drawTeraEntry tests |

## Test plan
`__tests__/tera-crystal.test.mjs` (11), `__tests__/tera-skin.test.mjs` (12, incl. reconciler with fakes),
`__tests__/apply-view.test.mjs` (+1: `board-view-applied` after advisories, view readable). Manual: harness captures
(stand-in board, emulated holo wrap) compared with the clip.

## Migration / rollout
n/a: cosmetic. Revert = `git revert` of the S280 commit. Limitation: skins need an authoritative view (rules mode).

## Amendment S281: the crystal takes the card's type colour (D122)
User: "Tera animation color should change based on card energy type"; asked whether the lasting skin follows too,
they chose both. `TERA_TYPE_RGB` (tera-crystal.mjs) holds a vivid crystal colour per type (not card-glow's TYPE_GLOW,
whose Darkness/Metal read grey). `teraPaletteFor(type)` (via `normalizeEnergyType`, so 'Fire', 'R', 'Dark' resolve)
returns `TERA_PALETTE` with deep/ice/cyan mixed from it; `teraPaletteForCard(card)` uses `card.types[0]`. Colorless,
unknown or missing type keeps the icy default. `drawTeraEntry(..., { palette })` threads it through every draw (`g.palette`):
prisms, glitter floor, silhouette glow, glints, burst disc and shard fringes take the type; orb, lime/teal flash, jewel,
violet/pink/red accents and rainbow rings stay universal. `playSignatureEntry(kind, rect, instanceId, card)` passes the
entering card (entry.js `enter`, lifecycle.js `evolve`). Skin: `teraSkinFacets(seed, palette)` colours the coloured
planes; `teraSkinColors(palette)` gives `--fx-tera-ice/cyan/deep` (`r, g, b`), set inline by tera-skin.js on the
skinned node and removed with the skin; mat-ambient.css reads them with the icy default as fallback.
Tests: tera-crystal +4 (palette per type, name/symbol/default, per card, draw uses the palette), tera-skin +2.
