# 069: TCG Live card holofoil — the game's own shaders and per-card masks
Status: draft
Date: 2026-10-13 · Session: S-069 (worktree `feature/tcgl-foil`)

## Problem
The user's request, verbatim (2026-10-13):

> Study the web app folder in here and see how it implements its holofoil code and replace ours with
> it. Notice how the cards in the cardart folder have masks / multiple layers as well. Make sure those
> are imported and mapped properly to our site.

Then: "Make sure its served at the highest quality, no compressions."

Answers given in this session (AskUserQuestion): assets live in **this repo** at **1024² / native
resolution, lossless** (~4.7 GB, accepted after the size and push-cap costs were stated); cards TCG Live
does not cover **keep today's CSS holo**; the TCG Live shader runs **everywhere** (mat, hand, previews,
focus popup, deck builder, pack opening).

## Constraints
- No build step, native ESM (PROJECT.md). three.js is already a client dependency (D193, vendored,
  import map `three` → `/src/vendor/three/three.module.min.js`), loaded only by `import()`.
  three is never imported by node tests (STATE watch-out): pure math lives in `.mjs` files without three.
- D34: foil is lit by a fixed light from the card angle, never the cursor. D55/D56: the foil drifts on
  every surface while not held, ignores prefers-reduced-motion, has no opt-out. D106: never re-set an
  unchanged `src` or re-insert a card node (restarts animations).
- D201: CSS holo art windows key on `data-card-layout`; the fallback path must keep working unchanged.
- "Highest quality, no compressions": every texture is decoded from the game's own data (DXT5 inside
  the card bundles / shaders bundle — that is the ceiling) and stored as **lossless** WebP
  (`lossless=True, exact=True`) at **native size**. No downscale, no lossy step, and the views render
  at the full device pixel ratio.
- Repo weight: the user accepted ~4.7 GB in this repo. GitHub rejects one push over 2 GB, so the asset
  commits are split per set group and pushed one commit at a time (§ Migration).
- The extract (`E:/TCGLive_Extract`) and the Unity cache are not in the repo; the importer is
  rerunnable (`pnpm foil:import -- --src E:/TCGLive_Extract`), like `fx:import-attack` (068).
- Hard rule 7 (card text looked up): the TCG Live ↔ TCGdex mapping is verified against TCGdex names
  fetched by the importer, never from memory.

## Current state (read this session)
Ours:
- `client/src/setup/deck-builder/core/holo.mjs` — `resolveHoloEffect(card)` (TCGdex rarity → simey
  `data-rarity`), `buildHoloCard(src, rarity, {trainer})` (simey DOM `.card > .card__translater >
  .card__rotator > img + shine/glitter/glare/glare2`), `startHoloAnimation(card, {auto, tilt})` (rAF
  loop: drift or cursor spring → `computeLightVars` → CSS vars), `syncCardAspect`.
- `client/src/css/holo/*.css` (18 sheets) — the simey layers; imported by `index.css`,
  `self-containers.css`, `opp-containers.css`, `mat-ambient.css`, `coin/base.css`.
- Call sites that build a foil: `deck-constructor/hydrate-holo.js` (mat + hand, async after
  `ensureCardData`), `image-logic/card-picker.js` `buildSlideContent` (picker, inspector, card focus 067),
  `image-logic/full-view.js` (double-click preview; also clones an existing wrapper),
  `sidebox/native-deck-builder-unboxing.js` `cardFaceNode` (pack opening).
- Card identity: `card.id` is the TCGdex id (`sv01-012`, `swsh12.5-GG01`, `bw1-1`) set by
  `ensureCardData`, else `extractTcgdexIdFromImageUrl(src)` (`shared/engine/rules/legacy-set-ids.mjs:264`).
- Mat/hand cards live in same-origin iframes (`self-containers.html`, `opp-containers.html`) driven by
  the parent window's modules.

TCG Live WebApp (`E:/TCGLive_Extract/WebApp`):
- `web/js/foil.js` — `createFoilMaterial(cardId, frontUrl, opts)`: a `THREE.RawShaderMaterial` from the
  game's `TPCi/Cards3D/*` shaders (DX11 bytecode → GLSL ES 3.00, `web/data/foil/shaders.json`, 27
  shaders), constant buffers filled like Unity (`$Globals` from the `MAT_Cards3D_*` material,
  UnityPerCamera / PerDraw / PerFrame from mesh + camera), textures `_CardColorDiffuse` (1024² card
  front), `_CardEtch`, `_CardWhitePlateMask`, `_CardColdFoilMask`, `_CCPatternTex`, plus the material's
  spectrum / shine / glitter textures. `foilGeometry` maps a rounded card into the front's UV window
  u 0.142107–0.857893, v 0–1. `createFoilView` — one shared WebGL renderer, each view a 2-D canvas that
  receives a copy of its frame.
- Its assets are **lossy and downscaled** (`cards_import.py` q80/q85, masks capped 512/1024;
  `export_foil.py` material textures q92 capped 1024) — not usable under the user's quality rule.
- Sources: `E:/TCGLive_Extract/cardart/bundles/<set>_en_<NNN>` (15,825 card bundles; each holds the
  front, etch, white plate, cold foil textures — all DXT5, format 12 — and `MaterialManifest*`
  records), `cardart/manifests.jsonl` (the manifests as JSON, one bundle per line), `cardart/masks/`
  (PNG decodes of the masks), the Unity cache `%LOCALAPPDATA%Low/Unity/pokemon_Pokemon TCG Live/shadersbundle`
  (material textures), `card_database_rows.tsv` (TCG Live card id, set code, card number, English name).
- Coverage: 15,468 card ids; base printing foil for 6,782, non-foil for 8,686. Sets BW1 onward only.

## Options
**O1 · Card face under the foil.** Masks are pixel-registered to TCG Live's own 1024² front.
- A: Draw the TCG Live front in the shader (WebApp's way); our `<img>` stays underneath for identity
  and hit-testing. Exact registration; one more 1024² texture per card.
- B: Keep our TCGdex scan and warp the masks onto it. Different scan, crop and corner radius: masks
  land a few px off — fails "mapped properly".
- **Pick A.** The only option that registers the masks.

**O2 · Asset storage.** User decision: in this repo, native size, lossless WebP (~4.7 GB measured on a
40-card sample: PNG 8.2 GB, lossless WebP 4.7 GB). Not re-litigated.

**O3 · Which printings.** A: base printing only (6,782 cards). B: also the reverse-holo `ph` variant —
needs fronts for the 8,686 non-foil-base cards too (~+5 GB). **Pick A.** Reverse-holo cards (pack
opening's reverse slot, set browser "Reverse Holo") keep the CSS reverse holo. Filed as an issue.

**O4 · How a tilted card renders on a flat surface.** Mat and hand cards never rotate visibly; the
foil must still react to the virtual angle.
- A: Rotate the mesh — the canvas shows a foreshortened card over a flat `<img>`. Wrong.
- B: Rotate the mesh for shading (object matrix, normals, view vector all see the tilt) but rasterize
  it face-on: `unity_MatrixVP` is replaced by `P · V · R⁻¹` (R = the tilt rotation), while
  `unity_MatrixV`, `unity_MatrixP`, `unity_MatrixInvV` and `_WorldSpaceCameraPos` stay the real camera.
- **Pick B.** CSS keeps doing the visible tilt (previews), the shader sees the angle everywhere.

**O5 · Who decides "foil or not" for a covered card.** A: TCG Live's manifest (game's own printing data).
B: TCGdex rarity, TCG Live only supplies the look. **Pick A**: the user asked for the game's mapping.
A covered card whose TCG Live base is NonFoil renders flat even if its TCGdex rarity says holo.

**O6 · Many views per frame.** A: `renderer.setSize` per view (WebApp) — reallocates the drawing buffer
whenever consecutive views differ in size. B: one shared canvas that only grows; each view renders into
the bottom-left `w×h` viewport (scissor on) and copies that rect. **Pick B.**

**O7 · TCG Live → TCGdex mapping.** A: hand table of number formats per set. B: set table only;
cards matched by ordinal and verified by name through the TCGdex API. **Pick B** (data, not guesses).

## Design
### Data (all committed, under `client/src/assets/tcgl-foil/`)
- `shaders.json` — byte copy of `WebApp/web/data/foil/shaders.json` (GLSL source, not imagery).
- `materials.json` — `{ materials: { <MAT name>: {shader, tex: {<prop>: {name, scale, offset}}, floats,
  colors} }, textures: { <name>: {url, wrapU, wrapV, filter, srgb} } }` regenerated from the shaders
  bundle; `url` = `/src/assets/tcgl-foil/tex/<name>.webp`.
- `tex/<name>.webp` — material textures, native size, lossless.
- `cards/<tcglSet>/<texName>.webp` — card fronts and masks, native size, lossless. `tcglSet` = the
  bundle's set (`sv1`, `swsh12-5a`), `texName` = the Unity texture name (`sv1_en_258`,
  `sv1_etch_en_258`, `sv1_wp_en_258`, `bw1_en_005_alt`).
- `manifest.json`:
  ```
  { "v": 1, "uv": {u0, u1, v0, v1},
    "shaders": [<TPCi/Cards3D/... names>], "materials": [<MAT_Cards3D_... names>],
    "cards": { "<key>": [tcglId, shaderIdx, materialIdx, frontTex, etchTex|"", wpTex|"", cfTex|"", cc|""] },
    "flat": ["<key>", ...] }
  ```
  `key` = `normalizeCardKey(tcgdexId)`; `flat` = covered cards whose base printing is NonFoil.

### Card key
`normalizeCardKey(id)`: lowercase; split at the last `-`; strip leading zeros from the local id's
numeric run (`sv01-012` → `sv01-12`, `swsh12.5-GG01` → `swsh12.5-gg1`, `bw11-RC1` → `bw11-rc1`).
Null for a falsy id or one without `-`.

### Importer (`scripts/tcgl-foil/`)
- `import-foil.mjs --src <extract> [--unity-cache <dir>] [--sets a,b] [--offline-tcgdex <dir>]`:
  1. Reads `cardart/manifests.jsonl`; per bundle the `MaterialManifest` (base) record →
     `{shader: legacyShaderName(_s), material: materialName(_f), front: _c, etch: _e, wp: _w, cf: _cf, cc: _cc}`
     (empty strings dropped).
  2. Reads `card_database_rows.tsv` rows with `variant == 0` → `{tcglId, setCode, number, name}`.
  3. Maps each TCG Live set to TCGdex segments by `TCGL_TO_TCGDEX_SETS` (`foil-import-map.mjs`), fetches
     `https://api.tcgdex.net/v2/en/sets/<id>` per mapped set (cached under `.cache/tcgdex-sets/`).
     A segment is `{set, prefix}`: the set's cards whose local id matches `^<prefix>\d+$`
     (case-insensitive; prefix `''` = purely numeric ids), keyed by that number. Segment 1 takes TCG Live
     numbers 1…max(segment 1); each next segment starts at the previous segment's last TCG Live number + 1
     (`#N` → local number `N − start + 1`). A match is accepted only when `namesMatch(tcglName,
     tcgdexName)`. A miss retries every card of the mapped sets with the same name and local number N.
     Still no match → unmapped (reported, not shipped).
  4. Writes the texture list and runs `extract-textures.py` (UnityPy + Pillow): decodes each named
     Texture2D from its bundle (`cardart/bundles/<bundle>`) and the material textures from the
     shaders bundle; saves `lossless=True, exact=True, quality=100, method=6`; skips files already
     present with the same size header unless `--force`.
  5. Writes `manifest.json`, `materials.json`, copies `shaders.json`; prints counts: mapped foil, flat,
     unmapped per set, bytes written.
- `foil-import-map.mjs` (pure, tested): `TCGL_TO_TCGDEX_SETS`, `legacyShaderName`, `materialName`
  (ports of `export_foil.py` `legacy_shader` / `material_name`), `namesMatch`, `matchSetCards`,
  `normalizeCardKey` (re-exported from the client module), `buildManifest`.

`TCGL_TO_TCGDEX_SETS` (TCG Live set code, lowercased → segments `set[:prefix]` in order; set ids from
`api.tcgdex.net/v2/en/sets`, fetched 2026-10-13):
bw1…bw10 → same id · bw11 → [bw11] · bw11r → [bw11:RC] · bw6-5 → [dv1] · bwbsp → [bwp:BW] ·
xy0…xy12 → same · xy5-5 → [dc1] · xy9-5 → [g1] · xy9-5r → [g1:RC] · xybsp → [xyp:XY] ·
sm1…sm12 → same · sm3-5 → [sm3.5] · sm7-5 → [sm7.5] · sm11-5 → [sm115, sma:SV] · smbsp → [smp:SM] ·
swsh1…swsh12 → same · swsh3-5 → [swsh3.5] · swsh4-5 → [swsh4.5, swsh4.5sv:SV] · swsh7-5 → [cel25] ·
swsh7-5r → [cel25cc] · swsh9a/10a/11a/12a → [swsh9tg:TG]/[swsh10tg:TG]/[swsh11tg:TG]/[swsh12tg:TG] ·
swsh10-5 → [swsh10.5] · swsh12-5 → [swsh12.5] · swsh12-5a → [swsh12.5gg:GG] · swshbsp → [swshp:SWSH] ·
sv1…sv10 → sv01…sv10 · sv3-5 → [sv03.5] · sv4-5 → [sv04.5] · sv6-5 → [sv06.5] · sv8-5 → [sv08.5] ·
rsv10-5 → [sv10.5b] · zsv10-5 → [sv10.5w] · svbsp → [svp] · sve → [sve] · me1…me5 → me01…me05 ·
me2-5 → [me02.5] · mebsp → [mep] · mee → [mee]. Not mapped (no TCGdex set confirmed): me5-5, me5-5c,
me5-5m, ec, gum, `*alt` sets. The importer's name check is the arbiter; a wrong table row shows up as
unmapped cards in the report, never as a wrong foil. The report's unmapped count per set is reviewed in
slice 2; a row with >10 % unmapped is fixed in the table before the assets are committed.

### Client modules (`client/src/setup/foil/`)
- `tcgl-foil-manifest.mjs` (pure): `normalizeCardKey(id)`; `parseFoilManifest(json)` →
  `{uv, records: Map<key, FoilRecord>, flat: Set<key>}` (throws on `v !== 1`);
  `foilRecordFor(parsed, cardId)` → `FoilRecord | null`; `foilCoverage(parsed, cardId)` →
  `'foil' | 'flat' | null`; `textureUrl(texName)` → `/src/assets/tcgl-foil/cards/<set>/<texName>.webp`
  where `<set>` = texName up to its first `_`.
  `FoilRecord = {tcglId, shader, material, front, etch, wp, cf, cc}` (missing masks = null).
- `tcgl-foil-store.js`: `loadFoilManifest()` — one fetch of `manifest.json` (memoized promise; failure
  resolves to null and logs once); `foilManifestNow()` — the parsed manifest or null; started by
  `front-end.js` at boot.
- `tcgl-foil-pose.mjs` (pure): `FOIL_TILT_DEG = 14` (WebApp `createFoilView` tilt);
  `poseAngles({tiltX, tiltY})` → `{rx: −tiltY·14°, ry: tiltX·14°}` in radians, inputs clamped to [−1, 1];
  `rotationMatrix(rx, ry)` (column-major 4×4, R = Ry·Rx), `multiply(a, b)`, `transposeRotation(m)`
  (inverse of a pure rotation) — plain arrays, no three.
- `tcgl-foil-material.js`: port of WebApp `createFoilMaterial` + `foilGeometry` (three), reading
  `shaders.json` / `materials.json` / the record; texture URLs via `textureUrl`; `update(mesh, camera,
  timeSec, {rasterVP})` writes `rasterVP` (when given) into `unity_MatrixVP` and UnityPerFrame offset 272,
  everything else as WebApp. `_CardColorDiffuse` = the record's `front` texture.
- `tcgl-foil-view.js`: `mountTcglFoil(wrapper, record) → view | null` and `unmountTcglFoil(wrapper)`.
  Creates `<canvas class="tcgl-foil">` with `wrapper.ownerDocument`, appends it to `.card__rotator`
  after the `<img>`, sets `wrapper.dataset.tcglFoil = 'loading'`; after the four card textures load and the
  first frame draws → `'live'`. WebGL2 unavailable, shader link error, texture error, or context lost →
  `'fallback'` and the canvas is removed. One shared `WebGLRenderer` (alpha, antialias,
  `preserveDrawingBuffer: true`, `outputColorSpace = LinearSRGBColorSpace` as WebApp) whose canvas only
  grows; per frame, for each view: skip when its wrapper is disconnected (destroy), `rect` is under 2 px,
  outside its window's viewport, or `visibility: hidden`; backing size = `round(rect × devicePixelRatio)`
  of the wrapper's window (no cap below `renderer.capabilities.maxTextureSize`); camera as WebApp
  (`fov 30`, card 6.3×8.8, distance `(H/2)/tan(15°)·1.04`, aspect = backing w/h); mesh rotation from the
  wrapper's pose (below); `rasterVP = P·V·R⁻¹`; `setViewport/setScissor(0, 0, w, h)`, render, then
  `ctx.drawImage(shared, 0, sharedH − h, w, h, 0, 0, w, h)`.
- Pose: `startHoloAnimation` stores `card.__foilTilt = {tiltX, tiltY}` each tick (the value it already
  passes to `computeLightVars`); the view reads it (default `{0, 0}`).

### Wiring
- `holo.mjs`: `resolveFoilEffect(card)` → `'tcgl'` when `foilCoverage(manifest, cardId) === 'foil'`;
  `null` when `'flat'`; otherwise `resolveHoloEffect(card)`. `cardId` = `card.id ?? card.data?.id ??
  extractTcgdexIdFromImageUrl(card.image?.src ?? card.imageUrl ?? card.src)`.
  `buildHoloCard(src, rarity, {trainer, cardId})`: when `rarity === 'tcgl'` and a record exists →
  `data-rarity="tcgl"`, `mountTcglFoil(card, record)` after the DOM is built. The simey layers stay in
  the DOM (fallback).
- `tcgl-foil.css` (imported next to `holo/base.css` in the five sheets that import it):
  `.tcgl-foil {position:absolute; inset:0; width:100%; height:100%; pointer-events:none;
  border-radius: inherit}`; `[data-tcgl-foil="loading"] .tcgl-foil {opacity:0}`;
  `[data-tcgl-foil="live"] .tcgl-foil {opacity:1; transition: opacity 120ms}`;
  `[data-tcgl-foil] :is(.card__shine, .card__glitter, .card__glare, .card__glare2) {display:none}` except
  `[data-tcgl-foil="fallback"]`, which shows nothing extra (rarity `tcgl` has no simey rules).
- Call sites switch `resolveHoloEffect` → `resolveFoilEffect` and pass `cardId`: `hydrate-holo.js`
  (awaits `loadFoilManifest()` with the card data), `card-picker.js` `buildSlideContent` (both
  branches), `full-view.js` (fresh build; the clone path calls `remountTcglFoil(clone, sourceWrapper)`,
  which removes the cloned blank canvas and mounts a new view), `native-deck-builder-unboxing.js`
  `cardFaceNode` (normal slot only; the reverse slot keeps `'reverse holo'`, O3).
- `unhydrateHolo` / wrapper removal: the view destroys itself on the next frame when its wrapper is
  disconnected; `unmountTcglFoil` is also called from `unhydrateHolo` for immediate release.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | Card with no id and no parseable image URL | `resolveFoilEffect` → CSS `resolveHoloEffect` result | [ ] |
| 2 | Manifest fetch fails / malformed / `v` ≠ 1 | `foilManifestNow()` null → every card uses the CSS path; one console warning | [ ] |
| 3 | Manifest not loaded yet on a sync call site | CSS path for that build; hydrate-holo awaits the manifest | [ ] |
| 4 | Local id zero-padding differs (`sv01-12` vs `sv01-012`, `GG01` vs `gg1`) | Same key | [ ] |
| 5 | Covered card whose TCG Live base is NonFoil | No foil (O5), even with a holo TCGdex rarity | [ ] |
| 6 | Uncovered card (pre-BW, unmapped set) | Today's CSS holo, unchanged | [ ] |
| 7 | Record without etch / wp / cf | Plain white texture for that slot (WebApp `plain.white`) | [ ] |
| 8 | Texture 404 / decode error | View → `fallback`, canvas removed, card shows its `<img>` without foil | [ ] |
| 9 | No WebGL2 / shader link error | `fallback` for that view; renderer creation failure disables all TCG Live views for the session | [ ] |
| 10 | WebGL context lost | All views → `fallback`; no re-creation | [ ] |
| 11 | Wrapper removed / card moved zones (re-hydrated) | View destroyed next frame; a re-hydrate mounts a fresh view | [ ] |
| 12 | Same card mounted twice (full-view clone) | Clone gets its own view; the source keeps its own | [ ] |
| 13 | Off-screen, zero-size or hidden wrapper | Not drawn that frame | [ ] |
| 14 | Card in an iframe (mat / hand) | Canvas created in the iframe document; rect and DPR from the iframe window | [ ] |
| 15 | Tilt values NaN / out of range | Clamped to [−1, 1]; NaN → 0 | [ ] |
| 16 | Importer: TCG Live name ≠ TCGdex name at the ordinal | Retry by numeric local id; else unmapped and reported | [ ] |
| 17 | Importer: bundle missing or texture absent | Card skipped, reported; manifest never names a file that was not written | [ ] |
| 18 | Importer rerun | Existing lossless files kept unless `--force`; output byte-identical for unchanged input | [ ] |
| 19 | Reverse-holo printing | CSS reverse holo (O3) | [ ] |
| 20 | Face-down / hidden card | Unchanged: hydrate-holo never builds a wrapper for a hidden card | [ ] |

## Test plan
- Unit (`node --test`): `foil-import-map.test.mjs` (set table spot checks, `legacyShaderName` /
  `materialName` against five WebApp `cards.json` rows, `namesMatch`, `matchSetCards` ordinal + retry +
  miss, `buildManifest` shape); `tcgl-foil-manifest.test.mjs` (keys, parse errors, coverage, texture
  URL); `tcgl-foil-pose.test.mjs` (angles, clamps, `R·Rᵀ = I`, `rasterVP` maps the tilted card's
  corners to the same clip xy as the untilted card); `holo.test.mjs` additions for `resolveFoilEffect`.
- Asset test `tcgl-foil-assets.test.mjs`: every texture the manifest names exists; every WebP under
  `assets/tcgl-foil/` is lossless (`VP8L` chunk, or `VP8X` with a `VP8L` image chunk); the manifest's
  shader / material names exist in `shaders.json` / `materials.json`.
- Capture: `scripts/tcgl-foil/foil-shot.mjs` (Playwright, worktree server) renders one card per shader
  family flat and at ±1 tilt; check: silhouette identical across tilts (O4), no `fallback`, no console
  error. Look at the sheet for defects only; the look is the user's localhost check.

## Migration / rollout
- Asset commits: one commit per set group, each under 1.5 GB, pushed one commit at a time
  (`git push origin <sha>:refs/heads/feature/tcgl-foil`), never one push over GitHub's 2 GB cap.
- Render clones the full repo on deploy (+4.7 GB). If the free plan rejects the size, the revert is
  removing `client/src/assets/tcgl-foil/` in one commit (history still holds it; a history rewrite would be
  needed to shrink clones — out of scope, user decision).
- Revert path (code): `resolveFoilEffect` falls back to CSS when the manifest is absent, so deleting
  `manifest.json` disables the feature without code changes.

## Work plan
| Slice | Files (create / modify) | Signatures & data shapes | Test cases: input → expected | Rulings used (source) | Green when |
|---|---|---|---|---|---|
| 1 Importer map | create `scripts/tcgl-foil/foil-import-map.mjs`, `scripts/tcgl-foil/__tests__/foil-import-map.test.mjs`, `client/src/setup/foil/tcgl-foil-manifest.mjs`, its test | as § Design | `normalizeCardKey('sv01-012')`→`'sv01-12'`; `('swsh12.5-GG01')`→`'swsh12.5-gg1'`; `('')`→null; `legacyShaderName('Cards/Foil/HoloFoil_Rainbow_Amplify_J')`→`'TPCi/Cards3D/HoloFoil/Rainbow'`; `materialName('HoloFoil_Rainbow_Amplify_J')`→`'MAT_Cards3D_Rainbow'`; `materialName('HoloFoil_SWHolo_J')`→`'MAT_Cards3D_SwHolo'`; ordinal match with name mismatch then numeric retry hit; miss → unmapped | WebApp `cards.json` rows sv1_258, bw1_113, sv5_141 | tests pass |
| 2 Importer run + assets | create `import-foil.mjs`, `extract-textures.py`, `package.json` script `foil:import`; commit `client/src/assets/tcgl-foil/**` in set-group commits | as § Design | importer report: unmapped count per set printed; asset test passes | TCGdex set endpoints (fetched) | asset test passes; each commit < 1.5 GB |
| 3 Pose math | create `tcgl-foil-pose.mjs` + test | as § Design | `poseAngles({tiltX:1,tiltY:0}).ry`≈0.2443; NaN→0; `multiply(R, transposeRotation(R))`≈I; rasterVP corner check | — | tests pass |
| 4 Renderer + view | create `tcgl-foil-material.js`, `tcgl-foil-view.js`, `tcgl-foil-store.js`, `client/src/css/holo/tcgl-foil.css`; modify the five CSS importers, `front-end.js` (preload) | as § Design | capture script: 27 families draw, silhouette equal across tilt | — | capture exit 0, no console error |
| 5 Wiring | modify `holo.mjs`, `hydrate-holo.js`, `card-picker.js`, `full-view.js`, `native-deck-builder-unboxing.js` + tests | as § Design | `resolveFoilEffect` cases rows 1, 3, 5, 6 | — | `pnpm test` green |

## Deviations (Builder appends here during build)
