# 073: Tabletop unboxing — a physically modelled Build & Battle box in one three.js scene, and a standalone unboxing site
Status: approved (self — user away: "approve your plan automatically … You have free reign", 2026-10-15)
Date: 2026-10-15 · Session: S(current) · builds on designs 051, 052, 054, 055 (legacy flow)

## Problem
Brief (verbatim, three messages):
1. "I want you to make the most realistic pokemon unboxing experience you can, and keep reiterating
   upon it as many times as possible. Use the old build and battle flow, where you open the box and
   take out whats inside, but make it as realistic and accurate as possible. use threejs if needed."
2. "One more thing, host a seperate website thats just the unboxing experience for testing. Now keep
   working on this for as long as needed to have it be as accurate as possible"
3. "Last interjection, approve your plan automatically and work on it once youre ready. I will be
   unavailable for a while. You have free reign."

Today's legacy opening (`/build-and-battle-legacy`, designs 052/055) is a hybrid: a CSS cuboid box with
a clip-path wrap and a hinged top, WebGL pillow packs over invisible DOM anchors, and DOM cards with CSS
holo. Three renderers, three lighting models, hand-offs between them, and the box is a guess at the
product (a lidded cuboid). Nothing is taken *out* of the box: the packs fly out on their own.

## Acceptance
| # | Criterion (the brief's words) | Evidence |
|---|---|---|
| A1 | "most realistic … as realistic and accurate as possible": one lit 3D world (three.js) — box, wrap, contents, packs, cards share one camera, lights, shadows, environment | frame strips `.agent/scratch/tabletop/` per phase; § Research facts each modelled |
| A2 | "Use the old build and battle flow, where you open the box and take out whats inside": shrink-wrap off → lid open → contents taken out one by one → deck unwrapped (promo) → each pack torn and its cards pulled → laid out; drives the legacy `session.unboxing` reducer | tabletop-flow tests (reducer events per action); legacy route browser run |
| A3 | "use threejs": vendored three 0.185.0 (D193), lazy `import()` | stage module imports `three` only |
| A4 | "host a seperate website thats just the unboxing experience for testing": `/unboxing` page — box picker (all 42 boxes), seed, the scene, results; no builder, no game | server route test; browser run of `/unboxing?box=phantasmal-flames&seed=42` to done |
| A5 | "keep reiterating … as many times as possible": iteration log with before/after frames per round | § Deviations "Iteration N" entries |
| A6 | Accurate contents per box kind and era (40-card deck vs 23-card Evolution pack, code card generation, Basic Energy per pack where printed) | physical.mjs + pack-stack.mjs tests citing sources |
| A7 | Pool integrity: the scene never changes what the player gets | browser check: revealed ids == `session.packs[i]` in order; reducer only via dispatch |
| A8 | WebGL missing / fx-off → the legacy DOM scene (052/055) still opens the box | mount fallback tests (pure decision) + `--disable-webgl` browser run |

## Assumptions
- (assumed) The modern box is a flip-top *deck box*: the lid covers the top ~76 % of the front and ~22 %
  of the back with diagonal side cuts, hinged on the back. Evidence: the Destined Rivals product render
  shows the lid line across the front and the diagonal on the side; the Sun & Moon Prerelease render shows
  the two-tone diagonal side; the Phantasmal Flames render shows the side diagonal; TheGamer: "provided in
  a deck box that can comfortably hold about 100 unsleeved cards"; Screen Rant (Journey Together): "it all
  comes inside a pretty solid deck box". All eras use this construction (XY/SM kits show it too).
- (assumed) Interior: four packs stand upright against the back wall, the deck (promo = its bottom card,
  facing the front, "The bottom card of the deck is an exclusive Black Star Promo" — TheGamer) stands in
  front of them, the code card between deck and packs, the folded tips leaflet behind the packs. No source
  shows the interior; this order puts the promo in view the moment the lid opens.
- (assumed) Sizes in mm: card 63 × 88 × 0.31, corner radius 3 (folio.fyi card guide); pack 66 × 121
  (booster top-loader 70 × 121 internal, booster sleeve 73 × 120 — retailer specs; the vendored wrapper art
  fixes the aspect 1426 / 780); box 92 × 131 × 60 (fits the packs upright; matches BOX_PROPORTIONS
  1 : 1.45 : 0.65 from the 052 frames); board 0.5.
- (assumed) Each SWSH/SV/ME pack holds 10 cards + 1 Basic Energy + 1 code card (ME02 box back: "booster
  pack contains 10 cards, [1 Basic E]nergy, and 1 Pokémon TCG Live code card"; retailer listings for
  Journey Together / Stellar Crown: "10 cards and 1 Basic Energy"); XY/SM packs: 10 cards + 1 code card.
  The extras are cosmetic: `revealed[i]` counts only the 10 pool cards.
- (assumed) Code cards are drawn generically ("CODE CARD", masked code) — never a real or fake-looking
  redeemable code; TCG Live (sv, me) vs Online (xy, sm, swsh) only changes the colour and the word.
- (assumed) Packs may be picked in any order; the k-th pack torn takes logical pack k's contents (pack art
  never correlates with contents), and the visual order is kept in a cosmetic view record so a reload
  shows the same untorn packs.
- (assumed) The table is a rubber playmat on a desk (the reference video's setting); the standalone
  site lets the tester switch surface.
- (assumed) The run flow (`/build-and-battle`, design 071) keeps its TCG-Live-style opening; ETB (057)
  keeps the 052 scene. Only the legacy B&B flow and the standalone site get the tabletop.

## Research facts (sources, 2026-10-15)
- Contents per era: ME02 box back (user video frame `refs/052-box-back.webp`): 40-card deck incl. 1 of 4
  foil promos · 4 booster packs · code card for TCG Live. Journey Together (Screen Rant): + Trainer Tips
  card, + fold-out instructions with a card list and battle tips. Before Brilliant Stars: a 23-card
  Evolution pack instead of the deck (Bulbapedia via search; `box-catalog.mjs` kinds).
- Shrink wrap: glossy film with a vertical heat-seal seam on a side face and crinkled folds over the top
  edges (`refs/052-box-left.webp`, `refs/052-box-right.webp`, `refs/052-box-top.webp`).
- Top face: black with a gold band and the Pokémon TCG wordmark (`refs/052-box-top.webp`); back: black,
  BUILD & BATTLE mark, gold rules, "Inside, you'll find:" list, red band (`refs/052-box-back.webp`).
- Pack: crimped seals top and bottom, pinched sides, a vertical fin seam on the back (common wrapper
  construction), metallised film.
- Card: 63 × 88 mm, 0.30–0.32 mm (folio.fyi).

## Constraints
- PROJECT: no build step, native ESM, `three` only through the import map (D193); vendored files never
  imported in node tests (pure math in `.mjs`, three in `.js`).
- 052/055 house rules that still apply: state lives in `session.unboxing` (`advanceUnboxing`); the scene
  reads the pool and never writes it; every beat skippable; a reload lands on the settled picture of the
  saved state; `motionReduced()` reads only `localStorage['ptcg-reduce-motion']`; `fxDisabled()` → no
  WebGL (legacy DOM scene); sound gated by `soundDisabled()` / `fxVolume()`.
- Sampled SFX are allowed (D203); synthesized where no sample exists.
- Card art from TCGdex (CORS `*`), Basic Energy from the Limitless CDN (CORS, holo.mjs list); every
  texture load fails soft (card back + name).
- Same-origin asset paths must also work from a static copy of `client/` (standalone hosting), so new
  modules resolve assets against the client root (`new URL(..., import.meta.url)`), never `/src/...`.

## Current state (read this session)
- Legacy controller `sidebox/native-deck-builder-build-battle.js` `renderOpenedBox` (:510) mounts
  `mountUnboxingScene({root, getUnboxing, dispatch, packs, packModel, classOf, look, seed, promo,
  onFinish})` on the fullscreen stage (`createStage`), B&B only (ETB has its own controller).
- `core/build-battle/unboxing.mjs`: reducer (`createUnboxing`, `advanceUnboxing`, `parseUnboxing`,
  `nextPackToTear`), `packArtIndexes`, `packSlotKind`, `hitTierFor`, `unboxingHoloRarity`, `boxSkin`, `boxArt`.
- `core/build-battle/pack3d.mjs`: pillow math (`pillowZ`, `packShape`), tear line (`packTearLine`,
  `peelAngleDeg`, `peelVertex`), tilt helpers — reused.
- `core/holo.mjs`: `resolveHoloEffect`, `cardLayoutFromImageUrl`, art windows per layout in
  `css/holo/base.css:260-283` (copied as numbers into the foil table).
- Box renders `assets/build-battle/boxes/<key>.webp` (42; ME boxes also `-front`/`-left` cuts), pack
  fronts `assets/build-battle/packs/` (172), holo pattern textures `assets/holo/*`, samples
  `assets/sfx/manifest.json` (card-flip, card-swoosh, card-place, shuffle…).

## Options
1. **Renderer.** A: keep the hybrid and upgrade parts — three lighting models and DOM↔GL hand-offs stay.
   B: one three.js tabletop scene for every object, DOM only for chrome (hints, dock, aria). **B.**
2. **Motion.** A: a physics engine (new dependency, non-deterministic, hard to test). B: authored pure
   pose functions (arcs, springs, damped settles) sampled on one rAF clock — deterministic, unit-tested.
   **B.**
3. **Foil.** A: CSS holo on DOM cards after a hand-off (breaks the single world). B: card material =
   MeshPhysicalMaterial + an injected foil term (view-angle rainbow × foil mask (art window / reverse /
   full) × ink luminance × pattern texture) and higher metalness in foil areas. **B.**
4. **Clear film (shrink wrap, deck wrap).** A: `transmission` (true refraction, an extra opaque pass,
   heavy on SwiftShader/low-end). B: an additive gloss layer (black base, sharp env reflection, adds
   highlights only) + a faint haze layer carrying the crinkle normal map. **B**, A kept out.
5. **Box model.** A: cuboid with a hinged top (052). B: the flip-top deck box of § Assumptions, built from
   board panels (0.5 mm) with printed outer faces, unprinted inner faces and light cut edges. **B.**
6. **Interaction.** A: buttons only. B: direct manipulation (drag the wrap, lift the lid, pick items,
   drag across a pack top, swipe cards) with a one-button "next step" equivalent for every action
   (dock + Space/Enter) so keyboard, touch and tests share one path. **B.**
7. **Standalone site.** A: an EJS view. B: a static `client/unboxing.html` (+ `src/unboxing-site/`) served
   at `/unboxing`; the same folder works from any static host. **B.**
8. **Pack order.** A: force the reducer's order (highlight the next pack). B: any order; logical index
   assigned at tear time; visual order kept in a cosmetic record. **B** (§ Assumptions).

## Design
### Pure modules — `client/src/setup/deck-builder/core/build-battle/tabletop/`
- `physical.mjs` — mm constants and `boxDimensions(proportions)`, `deckThickness(count)`,
  `contentsFor(box)` → `{ deck: {kind:'deck'|'evolution-pack', count}, packs: 4, codeCard:
  'live'|'online', leaflet: 'tips'|'guide' }`, `packExtrasFor(era)` → `['code', 'energy']` or `['code']`.
- `pack-stack.mjs` — `packStack({ cards, era, seed, packIndex })` → physical order from the pack's front:
  extras first (code card, Basic Energy chosen by a seeded stream `seed ^ 0x27d4eb2f`), then the ten pool
  cards in slot order (rare/hit last). Each entry `{kind:'code'|'energy'|'card', cardIndex?, energyLabel?}`;
  `revealedAfter(stack, position)` = pool cards passed.
- `layout.mjs` — table spots (mm, x right, y up, z toward the viewer, table top y = 0): box home, deck,
  promo, papers, wrap ball, pack row (4 slots), per-pack card piles and summary grids, hand pose in camera
  space; `cameraPoseFor(phase, aspect)`.
- `poses.mjs` — `lidAngle(t)` (cardboard spring: overshoot 6°, settles at 118°), `arcPath(from, to, t,
  {lift})` (quadratic Bézier with ease), `settleBounce(t)`, `wrapPeelPose(t)`, `cardSlidePose(t)`,
  `stackPullPose(t)`, `cameraBlend(a, b, t)`.
- `card-finish.mjs` — `cardFinish(card, slot, classOf)` → `{ foil: 'none'|'holo'|'reverse'|'full'|
  'gold'|'rainbow'|'etched', window: {l,t,r,b}|null, pattern: 'cosmos'|'sheen'|'glitter'|'etched'|
  'swirl', strength }` from `unboxingHoloRarity` / `resolveHoloEffect` and the layout's art window.
- `flow.mjs` — the tabletop's view model: `viewFromUnboxing(u, cosmetic)` → `{ phase, wrapOn, lidOpen,
  itemsOut, deckUnwrapped, tornOrder, currentPack, revealedInHand }` and `nextAction(view)` (the dock's
  one button: `tearWrap`, `openLid`, `takeOut`, `unwrapDeck`, `pickPack`, `tearPack`, `pullCards`,
  `revealCard`, `nextPack`, `finish`); `reducerEventFor(action, view)` → the `advanceUnboxing` event or
  null (cosmetic actions); cosmetic record `{v:1, seed, packOrder:number[], itemsOut:boolean}` parse/save.

### Browser modules — `client/src/initialization/document-event-listeners/sidebox/tabletop/`
- `tabletop-scene.js` — `mountTabletopUnboxing(options)` — the `mountUnboxingScene` options plus
  `deckRows` (leaflet deck list) and `fallback()` (mounts the 052 scene). Synchronous `{unmount}`; inside:
  `fxDisabled()` → fallback; `import('./tabletop-stage.js')` → null/throw → fallback.
- `tabletop-stage.js` — renderer (sRGB, Neutral tone mapping, PCF soft shadows, pixel ratio ≤ 2),
  camera (fov 32°), RoomEnvironment PMREM, key light + fill + rim, the table, one rAF clock with an
  animation list (`{start, durationMs, pose, apply, resolve}`), idle stop, resize, context loss → fallback.
- `tabletop-materials.js` / `tabletop-textures.js` — texture loading with timeout and fallback, canvas
  textures (crinkle normal maps, board, papers, code card, deck edges, pack back), foil material.
- `tabletop-box.js`, `tabletop-wrap.js`, `tabletop-pack.js`, `tabletop-card.js`, `tabletop-deck.js`,
  `tabletop-paper.js` — meshes per object.
- `tabletop-input.js` — raycast picking, drag gestures, keyboard; `tabletop-ui.js` — hint line, dock,
  aria-live; `tabletop-audio.js` — samples + synthesized film/board/foil sounds.

### Standalone site
`client/unboxing.html` + `client/src/unboxing-site/main.js` + `client/src/css/unboxing-site.css`; server
`GET /unboxing` sends the file. Box picker (era chips, 42 boxes with renders), seed field, surface /
quality / sound toggles, `?box=&seed=&quality=` deep links, the scene full screen, a results panel at the
end; progress saved in `ptcg-sim.unboxing-site.v1` (box, seed, `unboxing`, cosmetic record).

## Edge cases & failure modes — the completeness contract
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | WebGL missing / context creation fails | fallback 052 scene in the same root | [ ] |
| 2 | `import()` of three or a stage module fails | fallback, no console spam | [ ] |
| 3 | `fxDisabled()` | fallback without creating a context | [ ] |
| 4 | card image 404 / CORS / slow (> 2.5 s) | card back with the name printed; flow unchanged | [ ] |
| 5 | box render / face missing | procedural faces in the box palette | [ ] |
| 6 | reload at sealed / wrap off / lid open / deck shown / mid-pack 3 of 10 / done | settled picture of that state; mid-pack: 3 cards on the pile, 7 in hand | [ ] |
| 7 | repeated clicks during an animation | one action per completed beat, one queued | [ ] |
| 8 | Skip while mid-pack | reveals that pack first (reducer refuses finish mid-pack), then finish | [ ] |
| 9 | tab hidden mid-animation | backstop lands the animation; state already saved | [ ] |
| 10 | `motionReduced()` | every beat lands at once; scene still 3D | [ ] |
| 11 | window resize / phone width | camera aspect and dock adapt; no horizontal scroll | [ ] |
| 12 | pool integrity | revealed ids == `session.packs[i]`; packs never written | [ ] |
| 13 | unmount mid-animation / remount 20× | context released each time, no late callbacks | [ ] |
| 14 | 23-card Evolution pack boxes (XY–SWSH) | thinner wrapped stack, promo on the bottom | [ ] |
| 15 | pack picked out of order | it becomes the next logical pack; reload shows the same untorn packs | [ ] |

## Test plan
Unit: physical, pack-stack, layout, poses, card-finish, flow (`node --test`). Server: `/unboxing` route
markup check in the existing server tests' style. Browser: `.claude/skills/fx-preview/rec/rec-tabletop.mjs`
drives `/unboxing` through every phase on SwiftShader (seed 42 and a hit seed), checks pool integrity and
console errors, writes frame strips. Visual quality is judged against the reference frames each round.

## Migration / rollout
No stored-data change: `session.unboxing` unchanged; the cosmetic record is a new optional key. Revert:
switch `renderOpenedBox` back to `mountUnboxingScene`, drop the route.

## Work plan
| Slice | Files | Contract | Tests | Green when |
|---|---|---|---|---|
| 1 Pure core | tabletop/*.mjs + tests | § Pure modules | unit rows above | `node --test` green |
| 2 Standalone site + stage + table + box + wrap + lid | unboxing.html, unboxing-site/, tabletop/*.js, server route | § Standalone, § Browser modules | rows 1–3, 5, 11 | box opens in the browser |
| 3 Contents, deck, promo, packs, cards, foil, audio | tabletop/*.js | § Browser modules | rows 4, 6–10, 12, 14, 15 | seed 42 to done |
| 4 Legacy integration + recorder | native-deck-builder-build-battle.js, rec-tabletop.mjs | fallback chain | rows 1–3, 13 | legacy route opens a box in 3D |
| 5+ Realism iterations | any | Deviations log | strips | each round's before/after |

## Deviations (Builder appends here during build)
- **Iteration 1 (framing and props).** Before: hand pose too low, piles off-screen, busy film crinkle,
  held items casting hard shadows, lavender placeholder faces, SIR foil reading as chrome rings. After:
  per-phase camera frames, held things cast no shadow, placeholders show the card back, foil surface
  per finish mode (metalness/roughness/relief), sheen bands instead of concentric rings.
- **Iteration 2 (light).** Before: three's RoomEnvironment washed cards out. After: `tt-environment.js`
  studio room (dark walls, softbox, window, cool strip, desk bounce) as the PMREM; key light calibrated
  so a card facing it shows its printed colour.
- **Iteration 3 (table and film).** Before: promo under pack 0, torn wrappers on the code card, the
  shrink-wrap wad a 20 px orange speck (every vertex aimed at the ball's near side), barcode crimps,
  40 mm "topographic" wood rings, hint over the pack row. After: spots re-laid with an overlap/on-mat
  test (`layout.test.mjs`), MAT/LEAFLET sizes moved into the pure modules, film balls up by bearing from
  its own centre with crumpled normals, softer tear lip, shallow crimp relief, walnut plank desk at real
  scale (flat-sawn cathedral grain, pores, seams, butt joints), a lit back wall so flat gloss reads,
  table frame clears the dock. Frames: scratch `run6`→`run7`, `wrap1`.
- **Slice 4 (legacy integration).** `renderOpenedBox` mounts the tabletop on the fullscreen stage
  (`mountOnStage`, `.bb-stage--tabletop`); `fallback()` swaps the design-052 DOM scene back onto the
  stage. Done/inline boxes, ETB and the run flow keep the DOM scene. Test: the jsdom controller test
  fakes a WebGL 2 context that cannot draw → tabletop tried first, DOM scene takes over, box still sealed.
- **New interface: `/api/card-art?url=`** (not in the original design). assets.tcgdex.net answers with
  `Access-Control-Allow-Origin` twice ("*, *"); Chrome refuses it, so TCGdex faces could not become
  WebGL textures (blank cards on the legacy page). `server/card-art-proxy.mjs`: TCGdex host only,
  image paths/types only, no redirects, 4 MB cap, 64 MB byte-LRU, 6 in flight; the client
  (`card-art.mjs` `artSources`) tries the proxy, then the CDN direct. DECISIONS line due on landing:
  "[build-battle] TCGdex card art for WebGL goes through /api/card-art (doubled CORS header)".
- **Iteration 4 (every box wears its render).** Before: 37 of 42 boxes drew a generic procedural front.
  After: `box-faces.mjs` holds each render's front and side corners (render px), and `prepareBoxFaces`
  rectifies them at runtime (vendored ME cuts still win; a render that fails to load or was resized
  falls back to drawn faces). Corners measured by a one-off silhouette script (lines fitted to the
  top/bottom/side edges; the fold where the top dips, by vanishing points when the top shows, or as
  the first strong vertical edge when a white top melts into the background), checked by rectifying
  all 42; Sun & Moon and Ultra Prism show the right side, Burning Shadows, Crimson Invasion and
  Evolutions the front alone. Test: `box-faces.test.mjs` (every render covered, sizes match, convex
  clockwise quads, front proportions).
- **Iteration 5 (the tear, frame by frame).** Before: the first tear compiled the mouth-clipped card
  shaders mid-animation (a hitch on real GPUs, a 40 s stall on SwiftShader); the held pack threw a
  shadow on the mat as its wrapper set off (flyTo switched shadows on at the start of a flight); pack
  seals striped like a barcode. After: `warmShaders()` compiles the clipped stack behind the loading
  screen (probe materials kept alive so three keeps the programs); shadows return at 55 % of a
  landing flight; the wrapper surface is one normal map (shallow seal teeth, pinch creases fanning
  from the seals, faint dents) plus a roughness map (seals 0.55, body 0.3). The bench gained
  `?slowmo=N` (a scaled scene clock in `tt-stage.js`), which films motion on the real clock where
  Playwright's fake clock stalled. Recorder: `.claude/skills/fx-preview/rec/rec-tabletop.mjs`
  (every beat, pool integrity per pack, reload mid-pack, no-WebGL message); the scene's test api
  gained a read-only `held`.
