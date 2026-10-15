# 071: TCG Live deck customization — 3D deck box, sleeve and coin preview
Status: approved (user)
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
- `boxes.json`: `{ default: 'db_pc_pokeballs', boxes: [{ id, name, atlas, thumb }] }`, sorted by name.
  `name` = loc_en text with TMP tags stripped and U+FFFD replaced by `—`; falls back to the humanised id.
  `atlas` = `atlases/<id>.webp`, `thumb` = `thumbs/<id>.webp` (relative to the directory).
- `scene.json`: `{ fov, distance, tilt: [x,y,z,w], grouped: {box,sleeve,coin}, focused: {box,sleeve,coin} }`, each pose
  `{ p: [x,y,z], q: [x,y,z,w], s: [x,y,z] }` copied from `level4.json` `RendertoTextureCamera` children, plus
  `models: { box: {p,q,s}, card: {p,q,s}, shadowBox, shadowCard, shadowCoin }` from `CustomizationObjects`.
- `deck-box.mesh.json`, `card.mesh.json`: `packCoinMesh` output (`p,n,uv,i,submeshes`).
- `interior.webp`, `shadow-box.webp`, `shadow-card.webp`, `shadow-coin.webp`.
- Importer: `scripts/fx/deckbox/import-tcgl-deckbox.mjs --src <extract dir>` (`pnpm fx:import-deckbox`).
  Refuses a missing source file with the path named; writes nothing partial (build into a temp dir, then rename).

### Pure math — `client/src/setup/deck-builder/core/customize-stage/stage-math.mjs`
- `poseFor(scene, mode, slot)` → pose; `blendPose(a, b, t)` → pose (lerp p/s, slerp q).
- `focusLayout(selectedSlot)` → `{ box, sleeve, coin }` each `{ visible, pose }` for Focused: selected takes
  `scene.focused[slot]` with x forced to 0; others `visible:false`.
- `groupedLayout()` → all three `scene.grouped[slot]` visible.
- `passiveYaw(elapsedS)` → radians at 10°/s; `dragYaw(startYaw, dx)` → `startYaw + dx * 0.01`.
- `nextIndex(i, dir, length)` → wraps; length 0 → 0.

### Runtime
- `object-stage.js` (lazy three): `createObjectStage({ host, kind: 'box'|'sleeve' })` →
  `{ setTexture(url), setPose(pose), setYaw(rad), resize(), dispose() }`. Box: `MeshLambertMaterial[2]`
  (exterior atlas, colour white; interior `interior.webp`, colour 0.915); sleeve: three `MeshBasicMaterial`
  (submesh 0 sleeve texture, rest the default card back). Shadow quad under each, tinted per `scene.json`.
  z mirrored and winding flipped as in the WebApp port (OBJ is Unity left-handed).
- `customize-stage.js`: builds stage DOM (three slot hosts), mounts box + sleeve object stages and
  `createCoinStage` (069), runs one `requestAnimationFrame` loop while visible, owns Preview All / Focused
  toggle, prev/next arrows, drag-to-rotate on the focused slot, "Currently showing" caption.
  API: `initializeCustomizeStage({ panelEl, getSelection, onPick })` →
  `{ show(), hide(), setSelection({ boxId, sleeveImage, coin }), setFocus(slot|null), dispose() }`.
  `hide()` disposes all three stages (no idle contexts); `show()` rebuilds from the last selection.
- `native-deck-builder-box-picker.js`: grid of boxes (thumb + name), filter, `onChange(box|null)`;
  mirrors `initializeDeckBuilderSleevePicker` shape.
- Wiring in `native-deck-builder.js`: switcher gains `data-view="box"` (first); entering Customize defaults to
  box. Stage sits above the active picker grid (`#nativeDeckBuilderCustomizeStage`). Picking in any picker calls
  `stage.setSelection` and focuses that slot; Preview All shows all three.
- Persistence: `deck-library.mjs` `deckBoxId` (+ `setDeckBox`, snapshot and create options); library wrapper
  `setActiveDeckBox` / `getActiveDeckBox`; `rememberCosmetic(target, 'deckBoxId', …)`; CSV meta `#DECKBOX,`;
  `builder-window.mjs` accepts `deckBoxId` as nullable id. No game-side effect (box is builder-only).
- Fallback: WebGL2 missing, context lost, or asset fetch failure → stage hidden, pickers work as today;
  logged once.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | No deck loaded, user picks a box | Remembered via `rememberCosmetic`; Save writes it into the new deck | [ ] |
| 2 | Saved `deckBoxId` not in `boxes.json` | Treated as default; record left untouched | [ ] |
| 3 | Library record has no `deckBoxId` (pre-071) | Loads; `getActiveDeckBox` → null; default box shown | [ ] |
| 4 | `boxes.json` / mesh / atlas fetch fails | Stage hides, pickers still work, one console warning | [ ] |
| 5 | WebGL2 unavailable or context lost | Same as 4; coin stage `onLost` hides the stage | [ ] |
| 6 | Hide/show Customize tab repeatedly | Contexts disposed on hide, rebuilt on show; no leaked canvases | [ ] |
| 7 | Rapid prev/next | Latest pick wins (stale texture loads ignored by token) | [ ] |
| 8 | Empty filter result | Grid shows empty state; stage keeps current selection | [ ] |
| 9 | Focused slot with list length 0 | `nextIndex` returns 0; arrows disabled | [ ] |
| 10 | Opponent target (`currentLoadTarget`='opp') | Pick writes to that target's deck only | [ ] |
| 11 | CSV export/import with and without `#DECKBOX,` | Round-trips; absent line → null | [ ] |
| 12 | Importer run with missing source file | Exits non-zero, names the file, writes nothing | [ ] |
| 13 | Reduced motion (`motionReduced()`) | No passive spin or slide tween; poses snap | [ ] |

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
(none yet)
