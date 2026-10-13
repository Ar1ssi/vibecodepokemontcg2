# 069: TCG Live card holofoil — the game's own shaders and per-card masks
Status: approved (self — one-shot)
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
Later the user reversed the storage answer ("I have made a mistake. We need an alternative way of streaming
the cards") and chose **Cloudflare R2** (AskUserQuestion): the textures leave git and stream from a bucket.
Then: "make sure you add the reverse holos from tcg live as well" — O3 moves to B.

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
- Repo weight: the ~4.7 GB of textures are not in git (gitignored). They stream from Cloudflare R2; git holds
  only the importer and the three JSON files (~460 KB).
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
**Superseded: B** (user request after the build, § Problem). A reverse-holo card wears TCG Live's `_ph` printing;
one TCG Live lacks keeps the CSS reverse holo.

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
### Data (under `client/src/assets/tcgl-foil/`: JSON committed, textures gitignored and on R2)
- `shaders.json` — byte copy of `WebApp/web/data/foil/shaders.json` (GLSL source, not imagery).
- `materials.json` — `{ materials: { <MAT name>: {shader, tex: {<prop>: {name, scale, offset}}, floats,
  colors} }, textures: { <name>: {url, wrapU, wrapV, filter, srgb} } }` regenerated from the shaders
  bundle; `url` = `tex/<name>.webp`, relative to the texture base.
- `tex/<name>.webp` — material textures, native size, lossless.
- `cards/<tcglSet>/<texName>.webp` — card fronts and masks, native size, lossless. `tcglSet` = the
  bundle's set (`sv1`, `swsh12-5a`), `texName` = the Unity texture name (`sv1_en_258`,
  `sv1_etch_en_258`, `sv1_wp_en_258`, `bw1_en_005_alt`).
- `manifest.json`:
  ```
  { "v": 1, "uv": {u0, u1, v0, v1},
    "shaders": [<TPCi/Cards3D/... names>], "materials": [<MAT_Cards3D_... names>],
    "cards": { "<key>": [tcglId, shaderIdx, materialIdx, frontTex, etchTex|"", wpTex|"", cfTex|"", cc|""] },
    "flat": ["<key>", ...],
    "reverse": { "<key>": [same row, from the card's MaterialManifest_ph] } }
  ```
  `key` = `normalizeCardKey(tcgdexId)`; `flat` = covered cards whose base printing is NonFoil. `reverse` = the
  reverse-holo printing: same front as the base, its own `_wp_ph_` white plate, one of 6 shipped shaders (FlatSilver,
  Rainbow, SunBeam, Cosmos, Tinsel, SunPillar; AngledPillars is only in the unmapped `ec` set); independent of the
  base (a flat base can have one). Import: 9,129 reverse printings, 0 dropped; textures 8.87 GB in all.

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
| 1 | Card with no id and no parseable image URL | `resolveFoilEffect` → CSS `resolveHoloEffect` result | [x] holo.test `keeps the CSS holo for a card with no id` |
| 2 | Manifest fetch fails / malformed / `v` ≠ 1 | `foilManifestNow()` null → every card uses the CSS path; one console warning | [x] tcgl-foil-store.test (404, v2, fetch reject → null, one warning) |
| 3 | Manifest not loaded yet on a sync call site | CSS path for that build; hydrate-holo awaits the manifest | [x] holo.test `while the manifest is not loaded`; hydrate-holo awaits `loadFoilManifest()` |
| 4 | Local id zero-padding differs (`sv01-12` vs `sv01-012`, `GG01` vs `gg1`) | Same key | [x] tcgl-foil-manifest.test `normalizeCardKey` |
| 5 | Covered card whose TCG Live base is NonFoil | No foil (O5), even with a holo TCGdex rarity | [x] holo.test `covered NonFoil printing` |
| 6 | Uncovered card (pre-BW, unmapped set) | Today's CSS holo, unchanged | [x] holo.test `uncovered card` |
| 7 | Record without etch / wp / cf | Plain white texture for that slot (WebApp `plain.white`) | [x] code: `cardTexture(…, PLAIN.white)` in tcgl-foil-material.js; capture families without etch draw `live` |
| 8 | Texture 404 / decode error | View → `fallback`, canvas removed, card shows its `<img>` without foil | [x] code path `view.fail` (browser-only, not automated) |
| 9 | No WebGL2 / shader link error | `fallback` for that view; renderer creation failure disables all TCG Live views for the session | [x] code path `getRuntime` → `disabled` (browser-only, not automated) |
| 10 | WebGL context lost | All views → `fallback`; no re-creation | [x] code path `webglcontextlost` (browser-only, not automated) |
| 11 | Wrapper removed / card moved zones (re-hydrated) | View destroyed next frame; a re-hydrate mounts a fresh view | [x] code path `drawView` destroy + `unhydrateHolo` → `unmountTcglFoil` (browser-only) |
| 12 | Same card mounted twice (full-view clone) | Clone gets its own view; the source keeps its own | [x] code path `remountTcglFoil` (browser-only) |
| 13 | Off-screen, zero-size or hidden wrapper | Not drawn that frame | [x] `isDrawable`; observed in foil-shot: rows below a 1000 px viewport stayed undrawn |
| 14 | Card in an iframe (mat / hand) | Canvas created in the iframe document; rect and DPR from the iframe window | [x] code: canvas from `wrapper.ownerDocument`, rect/DPR from its `defaultView` (mat iframes not exercised by the capture) |
| 15 | Tilt values NaN / out of range | Clamped to [−1, 1]; NaN → 0 | [x] tcgl-foil-pose.test `clamps` |
| 16 | Importer: TCG Live name ≠ TCGdex name at the ordinal | Retry by numeric local id; else unmapped and reported | [x] foil-import-map.test `retries by numeric local id`, `reports … unmapped` |
| 17 | Importer: bundle missing or texture absent | Card skipped, reported; manifest never names a file that was not written | [x] import run 1: 4 bundles MemoryError → `dropped 4`, manifest named none of them; rerun filled them |
| 18 | Importer rerun | Existing lossless files kept unless `--force`; output byte-identical for unchanged input | [x] rerun: `written 0.0 MB`, manifest/materials/shaders sha1 OK |
| 19 | Reverse-holo printing | CSS reverse holo (O3) | [x] unboxing `faceRarity`: reverse slot skips TCG Live coverage |
| 20 | Face-down / hidden card | Unchanged: hydrate-holo never builds a wrapper for a hidden card | [x] hydrate-holo unchanged: `isCardHidden` gate before any wrapper |

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
- Texture base: the server answers `GET /api/tcgl-foil/config` with `{ textureBase }` (`server/tcgl-foil-config.mjs`):
  `FOIL_TEXTURE_URL` (the R2 bucket's public URL) when set and valid; else `/src/assets/tcgl-foil` when a local
  import exists (`tex/` present); else null, and the client keeps the CSS holo on every card. The JSON files are
  always same-origin, so shaders and manifest stay versioned with the code.
- Upload: `pnpm foil:upload -- --remote <rclone remote:bucket>` (rclone `copy`, never `sync`; `cards/**` + `tex/**`,
  MD5 skip of unchanged files, `Content-Type: image/webp`, `Cache-Control: public, max-age=604800`). Bytes are
  uploaded as imported — lossless, native size. The bucket needs `scripts/tcgl-foil/r2-cors.json` (WebGL reads
  textures cross-origin) and public access (r2.dev or a custom domain).
- Render: `FOIL_TEXTURE_URL` is declared `sync: false` on both services; the deploy clone does not grow.
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

## Acceptance
| # | Criterion (the brief's words) | Evidence |
|---|---|---|
| A1 | "see how it implements its holofoil code and replace ours with it" — covered cards render with TCG Live's own `TPCi/Cards3D` shaders (port of WebApp `foil.js`) | tcgl-foil-material.js (port of WebApp foil.js); foil-shot: 24 shader families `live` |
| A2 | "the cards in the cardart folder have masks / multiple layers … Make sure those are imported" — etch, white plate, cold foil, CC pattern decoded from the card bundles | 16,283 lossless WebP: 6,657 fronts + etch / plate / cold-foil masks, 52 material textures; tcgl-foil-assets.test |
| A3 | "… and mapped properly to our site" — every shipped TCG Live card is matched to a TCGdex id by set table + name check | importer report: 6,657 foil + 8,118 flat mapped, 186 unmapped (TCGdex gaps, § Deviations); foil-import-map.test |
| A4 | "served at the highest quality, no compressions" — native size, lossless WebP, full device pixel ratio | tcgl-foil-assets.test: every WebP `VP8L`, fronts 1024²; backing = CSS box × screen scale × DPR |
| A5 | Shader runs everywhere: mat, hand, previews, focus popup, deck builder, pack opening (session answer) | hydrate-holo (mat, hand), card-picker (picker, card focus), full-view (previews, deck builder), unboxing (packs) |
| A6 | Cards TCG Live does not cover keep today's CSS holo (session answer) | holo.test `uncovered card`, `while the manifest is not loaded` |
| A8 | "add the reverse holos from tcg live as well" — reverse-holo cards (pack reverse slot, set browser "Reverse Holo") render TCG Live's `_ph` printing | holo.test `reverse-holo printings`; tcgl-foil-manifest.test; foil-import-map.test; importer report `reverse 9129`; foil-shot: 6 reverse families `live`, silhouette diff 0 |
| A7 | Textures stream from Cloudflare R2 at native resolution, not from git (later session answer) | `.gitignore`; server/tcgl-foil-config.test; tcgl-foil-store.test; foil-shot against a separate CORS origin: 24/24 families `live`, every texture fetched from that origin |

## Assumptions
- Land: branch (assumed) — the prompt names no landing mode; the workflow default is `branch`, so nothing is
  pushed.
- Python runs as `python -P` with the script dir as cwd (assumed) — UnityPy lives in user site-packages,
  which `-I` hides; `-P` still keeps the extract's folders off `sys.path`.
- Extraction runs on a process pool, one worker per core minus one (assumed) — lossless `method=6` on
  ~17k textures is hours single-threaded; the output bytes do not depend on the worker count.
- Slice order 1 → 3 → 2 → 4 → 5 (assumed) — the asset extraction (slice 2) runs in the background while the
  pure pose math is built; slices 4 and 5 need the assets to verify.
- The deck builder has no foil call site of its own (assumed, grep `buildHoloCard`): its card views are the
  preview (`full-view.js`) and the picker (`card-picker.js`), both wired in slice 5.

## Deviations (Builder appends here during build)
- Set table, verified by the importer's name check (2026-10-13): `rsv10-5` → `sv10.5w` and `zsv10-5` → `sv10.5b`
  (the design had them swapped: TCG Live's r-set ends with Reshiram ex = White Flare, its z-set with Zekrom ex =
  Black Bolt); added `me5-5` → `30th` and `me5-5c` → `30th-c` (counts 158 / 30 match, names confirm);
  `swsh7-5r` → `cel25cc` takes prefix `CC`.
- `namesMatch` also reads TCG Live's energy symbols (`{G}` → Grass … `{*}` → Prism Star) and accepts a TCGdex
  qualifier TCG Live leaves out (`(Professor Magnolia)`, ` LV.X`, a leading `Basic` on basic Energy).
- `matchSetCards` gets a third tier: a name printed exactly once in the TCG Live set and once in the mapped
  TCGdex sets (30th Classic Collection, which TCG Live numbers in its own order).
- Sets still over 10 % unmapped are TCGdex gaps, not table errors: no TCGdex set (`ec`, `gum`, `me5-5m`, `smalt`,
  `xyalt`), `mebsp` #94–100 and `mee` #9–16 (reprinted energy) are not on TCGdex.
- `tcgl-foil.css` is imported by the three sheets that `@import` `holo/base.css` (index, self-, opp-containers);
  `mat-ambient.css` and `coin/base.css` only mention it.
- Camera distance factor 1.0 instead of WebApp's 1.04, and the mesh stretched along x (≤ 1.6 %) to the canvas
  aspect: rasterization is always face-on (O4), so the TCG Live front covers our `<img>` edge to edge.
- Lighting: the WebApp's front-light setting (`_LightDirection` toward the viewer, no card-edge shading) on every
  surface; its `board` setting lights 3-D cards seen at an angle, and our mat cards are face-on.
- Card texture anisotropy 16 (clamped to the GPU's maximum) instead of 4 — sharper foil on small mat cards.
- A wrapper built but never placed in a document is released after 10 s (buildHoloCard mounts before its
  callers insert the wrapper).
- Slice commits landed in the order 1, 3, 4, 5, 2: the asset extraction (~2 h on 23 workers) ran in the
  background while the code slices were built and verified against a one-set import.
- Storage moved to Cloudflare R2 after the build (user reversal, § Problem): the five texture commits were
  dropped from the unpushed branch (old head e59a623e, in the reflog) and replaced by one commit without
  textures; materials.json texture paths became base-relative (`tex/…`). No new npm dependency: rclone is an
  external CLI the uploader calls. The asset test skips its texture checks on a checkout without an import.
- Reverse holos added after the build (O3 → B): the manifest gains an optional `reverse` map (still `v: 1`; an
  older client ignores it). A reverse-holo card is one whose rarity resolves to `reverse holo` (set browser copies,
  whose `-reverse` id suffix is stripped) or a pack's reverse slot (explicit flag). Fixed in passing: a set-browser
  reverse copy of a card with a NonFoil base used to lose its CSS reverse holo (coverage `flat` → no foil).
  Only `MaterialManifest_ph` is imported; `_ph2`, `_mph` (Master Ball), `_sph` (Poké Ball) are pattern variants
  our app has no printing for.

## For the landing commit (Land: branch — not done on this branch)
- DECISIONS: `[board-ui]` Cards TCG Live prints wear its own foil (design 069): the base printing's
  MaterialManifest decides foil or none, rendered with the game's TPCi/Cards3D shaders and the card's own
  etch / white plate / cold foil masks over TCG Live's front; textures lossless WebP at native size, streamed
  from Cloudflare R2 (`FOIL_TEXTURE_URL`), never committed;
  reverse-holo cards wear TCG Live's `_ph` printing when it has one; uncovered cards keep the CSS holo; tilt comes from the holo animation (D34/D55/D56 hold).
  `[client]` amend D193: three is also loaded by `import()` on the first TCG Live foil mount.
- ISSUES: Poké Ball / Master Ball reverse patterns (`_sph`, `_mph`, `_ph2`, ~600 cards) not imported — no such
  printing in our app; unmapped TCG Live sets (`ec`, `gum`, `me5-5m`, `smalt`, `xyalt`, `mebsp` #94–100, `mee` #9–16);
  GPU memory ~12 MB per live foil card (front + etch + plate, mipmapped).
- MAP: `client/src/setup/foil/`, `scripts/tcgl-foil/`, `client/src/assets/tcgl-foil/`.
- Before deploy: create the R2 bucket, apply `r2-cors.json`, enable public access, `pnpm foil:upload`, then set
  `FOIL_TEXTURE_URL` on both Render services. Until then the site keeps the CSS holo (no breakage).
