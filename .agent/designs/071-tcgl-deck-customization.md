# 071: TCG Live deck customization — 3D deck box, sleeve and coin preview
Status: built (awaiting review and the user's localhost check)
Date: 2026-10-15 · Session: S-deckcust · Branch: `feature/tcgl-deck-customize` (stacked on `feature/tcgl-coins`, design 069)

## Problem
The Customize tab shows flat grids for sleeves, coins and mats. TCG Live shows a 3D stage with the deck's
box, sleeve and coin, a Preview All / Focused toggle, arrows and drag-to-rotate. There is no deck box
concept here at all. User asked for TCG Live's deck boxes rendered in 3D plus that preview screen.

## Constraints
- three.js is vendored (import map `three`), lazy `import()` only; pure math lives in `.mjs` (STATE watch-out).
- Coin stage from 069 (`coin-stage.js`) is reused unmodified; it owns its own canvas and camera.
- Saved library shape `ptcg-sim.deck-library.v1` is additive only; old records must load (`parseLibrary`).
- Sleeve and coin ids persisted by decks stay frozen (D84). Sleeves/coins offered stay the existing catalogs
  (user: "existing catalog only"); the TCG Live coin group from 069 is part of that catalog on this branch.
- FX look is checked by the user on localhost; no Browser-pane CSS verification (memory: feedback_css_preview).
- Never gate on OS reduced-motion; use `motionReduced()` from `image-logic/mat-fx.mjs` (memory).
- Assets copied from `E:/TCGLive_Extract` are committed (like status-fx / coins imports).

## Current state
- `native-deck-builder.js`: Customize tab with switcher (`#nativeDeckBuilderCustomizeSwitcher`, buttons
  `data-view="sleeve|coin|mat"`), panels `#nativeDeckBuilderSleevePanel/CoinPanel/MatPanel`, `setView`, shared
  filter input; `rememberCosmetic` mirrors picks when no deck is loaded.
- `native-deck-builder-sleeve-picker.js`, `-coin-picker.js` (069 adds TCG Live coin group + live preview via
  `createCoinStage`), `-mat-picker.js`: grids with filter, ownership (`eliteTrainerBox.owned*Ids`), `onChange`.
- `native-deck-builder-library.js`: `setActiveSleeve/Coin/Mat`, `getActive*` over `deck-library.mjs`
  (`sleeveId`, `coinId`, `matId` per deck; `setDeckSleeve/Coin/Mat`, `saveDeckSnapshot`, `createDeckInLibrary`).
- `csv-adapter.mjs` serialises `#SLEEVE,` / `#COIN,` meta lines. `builder-window.mjs` validates cosmetic payloads.
- Extract (all under `E:/TCGLive_Extract`): `Pokemon TCG Live_Data/resources.assets/Mesh/Sleeve_Deck_Box.obj`
  (1781 v, groups `_0` exterior, `_1` interior), `sharedassets1.assets/Mesh/Card.obj` (card model),
  `WebApp/assets/deckbox/<id>.webp` (380 atlases, 32 MB), `WebApp/assets/ui/db_<id>-t/*.webp` (380 thumbs),
  `WebApp/web/data/ui/level4.json` (scene poses), `WebApp/web/data/ui/loc_en.json` (names),
  `WebApp/web/data/vfx/fx_deckbox.json` + `WebApp/assets/vfx/fx_deckbox/` (interior and shadow textures).
  The same screen is already ported in `WebApp/web/js/shell-customize.js` (reference for poses and loaders).

## Options
1. **Where objects render.** A: one three scene holding all three (needs coin-stage refactor). B: one canvas
   per object, CSS-composited in a stage div. Pick **B**: coin stage stays untouched, 069 can keep evolving;
   cost is up to 3 WebGL contexts (box, sleeve, coin) only while the Customize tab is open, released on hide.
2. **Box mesh source.** A: OBJ from extract, parsed by the existing `parseCoinObj`/`packCoinMesh`. B: WebApp's
   pre-exported JSON. Pick **A**: same pipeline as coins, extract stays the single source.
3. **Persistence key.** `deckBoxId` on the library record, next to `sleeveId`/`coinId`. Rejected: nesting into
   a `cosmetics` object (would migrate three live fields for no gain).
4. **Default box.** `db_pc_pokeballs` (TCG Live's `DeckCustomizationManager` default, WebApp `CATS[0].def`);
   null means default, never stored as the default id.
5. **Unlock.** Boxes are all selectable (no currency). ETB ownership gating applies only to what it gated
   before (sleeves, coins).
6. **Foil.** Coin uses 069's real shaders for TCG Live coins and its default-material-with-scan path for
   real-world coins; nothing new here.

## Design
### Assets (slice 1) — `client/src/assets/deckbox/`
- `boxes.json`: `{ default, boxes: [{ id, name, atlas, thumb }] }`, sorted by name. `name` = loc_en text with TMP
  tags stripped and U+FFFD replaced by `—`; falls back to the humanised id. `atlas` = `atlases/<id>.webp`,
  `thumb` = `thumbs/<id>.webp`.
- `scene.json` (already in three's space): `{ fov, distance, holder: { q }, slots: { box|sleeve|coin: { grouped,
  focused, mesh?, shadow, pivot? } } }`, poses `{ p, q, s }`; the coin also has `pivot` and `mesh` (the disc sits
  at pivot × mesh). `shadow` carries `tint` (rgba).
- `deck-box.mesh.json`, `card.mesh.json`: `packCoinMesh` output turned a half turn about y (`toThreeMesh`).
- `interior.webp`, `shadow-box.webp`, `shadow-card.webp`, `shadow-coin.webp`.
- Importer `scripts/fx/deckbox/import-tcgl-deckbox.mjs --src <extract dir>` (`pnpm fx:import-deckbox`):
  builds in `<out>.tmp-<pid>`, swaps in with `swapIn` (old copy renamed aside, restored if the swap fails).

### Pure modules — `client/src/setup/deck-builder/core/customize-stage/`
- `stage-math.mjs`: `layoutFor(scene, focus|null)` → `{ box|sleeve|coin: { visible, pose } }`, `blendPose`,
  `composePoint`, `projectPoint`, `coinFrame`, `coinShadowFrame`, `yawDegrees`, `passiveYaw`, `dragYaw`,
  `nextIndex`.
- `boxes.mjs`: `loadBoxCatalog`, `boxById`, `defaultBox`, `boxAtlasUrl`, `boxThumbUrl`, `filterBoxes`, `stepBoxId`.
- `cosmetic-state.mjs`: `effectiveCosmeticId` (loaded deck's record, else the mirror), `deckBoxIdForSave`
  (undefined with a deck loaded), `importedDeckBoxId` (default → null, unknown → ignored).

### Runtime
- `object-stage.js` (lazy three): `createObjectStage({ host, onLost })` → `{ setBoxAtlas, setSleeveTexture,
  setPose(slot, pose, yaw), render, resize, dispose }` and `loadScene()`. Everything fetchable is loaded before
  the renderer exists, so a rejection leaves nothing behind. Fixed textures are cached module-wide.
- `customize-stage.js`: `initializeCustomizeStage({ panelEl, getSelection, onStep, loadStages? })` →
  `{ show, hide, setView, refresh }`. Builds the object stage and the 069 coin stage on show, disposes both on
  hide, coin swaps are serialised, an exception in a frame or a lost context marks the panel unavailable.
  Omitted from the game's screen: the selection "pop" clips, the rim point light.
- `native-deck-builder-box-picker.js`: `initializeDeckBuilderBoxPicker({ panelEl, onChange, onCatalog })`.
- Wiring in `native-deck-builder.js`: `applyDeckBox/applySleeve/applyCoin` are the one write path for the
  pickers, the arrows and CSV import; switcher gains `data-view="box"`; every editor detach also drops the
  mirrored `deckBoxId`.
- Persistence: `deck-library.mjs` `deckBoxId` (+ `setDeckBox`, snapshot and create options); library wrapper
  `setActiveDeckBox` / `getActiveDeckBox`; CSV meta `#DECKBOX,`. No game-side effect.
- Fallback: WebGL2 missing, context lost, or asset fetch failure → panel gets `is-unavailable`, pickers work
  as today; logged once.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | No deck loaded, user picks a box | Remembered via `rememberCosmetic`; Save writes it into the new deck | e2e run: picked a box with no deck loaded, caption and stage followed; wiring `currentCosmeticId` falls back to the mirror |
| 2 | Saved `deckBoxId` not in `boxes.json` | Treated as default; record left untouched | [x] covered: boxes.test 'boxById returns the box, and the default for null, undefined or an unknown id' |
| 3 | Library record has no `deckBoxId` (pre-071) | Loads; `getActiveDeckBox` → null; default box shown | [x] covered: deck-snapshot.test 'a library record saved before deck boxes loads and has no deck box' |
| 4 | `boxes.json` / mesh / atlas fetch fails | Stage hides, pickers still work, one console warning | [x] covered: native-deck-builder-box-picker-failure.test; customize-stage.test 'without WebGL ...' |
| 5 | WebGL2 unavailable or context lost | Same as 4; coin stage `onLost` hides the stage | [x] covered: customize-stage.test 'without WebGL the stage marks itself unavailable ...'; context loss adds `is-unavailable` via `onLost` (reading) |
| 6 | Hide/show Customize tab repeatedly | Contexts disposed on hide, rebuilt on show; no leaked canvases | [x] reasoning: hide() bumps `token` (aborts an in-flight build) and disposes both stages; show() rebuilds from `getSelection` |
| 7 | Rapid prev/next | Latest pick wins (stale texture loads ignored by token) | [x] reasoning: `swapMap` tokens per slot; a stale load disposes its texture and never reaches the material |
| 8 | Empty filter result | Grid shows empty state; stage keeps current selection | [x] covered: box-picker.test 'the filter narrows the gallery and an empty result says so' |
| 9 | Focused slot with list length 0 | `nextIndex` returns 0; arrows disabled | [x] covered: stage-math.test 'nextIndex wraps both ways and returns 0 for an empty or invalid list' |
| 10 | Opponent target (`currentLoadTarget`='opp') | Pick writes to that target's deck only | [x] reasoning: every write goes through `currentLoadTarget`; `setActiveField` already binds the target's deck |
| 11 | CSV export/import with and without `#DECKBOX,` | Round-trips; absent line → null | [x] covered: csv-adapter.test '#DECKBOX' tests (round trip, CRLF, empty) |
| 12 | Importer run with missing source file | Exits non-zero, names the file, writes nothing | [x] covered: box-catalog.test 'the importer names the missing file and leaves the output directory alone' |
| 13 | Reduced motion (`motionReduced()`) | No passive spin or slide tween; poses snap | [x] reasoning: `retarget` snaps and `frame` skips passive spin when `motionReduced()` |

## Test plan
- Node: `stage-math` (poses, layout, wrap, yaw), library (`deckBoxId` round-trip, legacy record, snapshot
  semantics undefined vs null), csv-adapter meta, builder-window payload, importer pure helpers (name
  cleaning, pose extraction, atlas/thumb pairing, missing-file refusal), asset test (every `boxes.json` entry
  has atlas + thumb file; `scene.json` poses are finite unit quaternions).
- Not node-tested (three, DOM): `object-stage.js`, `customize-stage.js`; covered by `rec-*.mjs` style
  SwiftShader recording and the user's localhost check.

## Migration / rollout
Additive field; no migration. Revert: delete `deckBoxId` use sites and `client/src/assets/deckbox/`; saved
records keep an ignored extra field. Stacked on `feature/tcgl-coins`; lands after it.

## Work plan
| Slice | Files | Signatures & data | Test cases | Green when |
|---|---|---|---|---|
| 1 importer + assets | `scripts/fx/deckbox/import-tcgl-deckbox.mjs`, `scripts/fx/deckbox/lib/box-catalog.mjs`, `…/__tests__/*.test.mjs`, `client/src/assets/deckbox/**`, `package.json` script | `cleanBoxName(text)`, `buildBoxCatalog({ ids, names, atlasDir, thumbDir })`, `extractScene(level4)` | name `<i>A�B</i> Elite Trainer Box` → `A—B Elite Trainer Box`; missing name → humanised id; pose quaternions unit length; every atlas present | `node --test scripts/fx/deckbox` |
| 2 pure math + persistence | `stage-math.mjs`, `deck-library.mjs`, `native-deck-builder-library.js`, `csv-adapter.mjs`, `builder-window.mjs` + tests | as listed in Design | legacy record, null vs undefined, wrap, layouts, CSV round-trip | `pnpm test:changed` |
| 3 object stages | `object-stage.js` | as listed | recording only | lint clean, recording shows textured box and sleeve |
| 4 screen + wiring | `customize-stage.js`, `native-deck-builder-box-picker.js`, `native-deck-builder.js`, `index.ejs`, CSS | as listed | owned-pickers test extended for box view | `pnpm test:changed`, localhost check requested |

## Deviations
- Default box is `db_pokeball_tcgl-default`, not the game's `DB_PC_Pokeballs` (absent from the extract).
- Meshes: the extract's OBJ already has Unity's x negated, so the importer turns meshes a half turn about y
  (x and z negate, winding kept) instead of the design's z mirror. Verified against the game's box thumbnails
  and `scene.json` poses (mirrored z, quaternion x/y negated).
- Review fixes (hostile pass): coin swaps serialised; object stage fetches before it creates a context; fixed
  textures cached; `deckBoxId` mirror cleared on every detach; Save leaves a loaded deck's box to its own
  record; CSV default box imports as null; spun objects settle on retarget; sRGB shadow/interior tints.
- Rendering: box and sleeve share one three scene and canvas; only the coin has its own canvas, placed by
  `coinFrame` (projected pose). The design's "three slot canvases" is superseded; coin shadow is a CSS mask.
- `builder-window.mjs` is untouched: the deck box has no game-side message, so no payload to validate.
- `scene.json` also carries the coin's `pivot`/`mesh` poses (needed to project the disc's centre).
- Arrows step the catalog order of the focused category (sleeves, TCG Live coins then physical coins, boxes).
- Sleeves in the preview are the existing catalog's images (447 of 450 hot-linked from
  pokemon-sleeve-database.com, which sends `Access-Control-Allow-Origin: *`); a load that fails shows the
  default back and logs once.

## Landing notes (apply in the commit that lands on main)
- DECISIONS: `[deck-builder] 071: deck box = per-deck nullable deckBoxId, default box db_pokeball_tcgl-default;
  preview = one box+sleeve three scene + the 069 coin stage on its own canvas (no coin-stage refactor).`
  `[assets] 071: deck box atlases (32 MB) committed under client/src/assets/deckbox/ (imported, not streamed).`
- MAP: scripts/fx/deckbox/ (importer), client/src/assets/deckbox/, setup/deck-builder/core/customize-stage/
  (stage-math, boxes, object-stage, customize-stage), sidebox/native-deck-builder-box-picker.js.
- Lands after `feature/tcgl-coins` (stacked). STATE: Focus/Active lines for 071.
