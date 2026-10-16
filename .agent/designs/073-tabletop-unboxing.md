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

Follow-up brief (2026-10-16, verbatim, two messages; the first came with a TCG Pocket screenshot of
three Genetic Apex packs floating over a white floor, the second with a 14 s screen recording of a
TCG Pocket pack opening, both kept in the session scratchpad):
4. "Make the background look like this from tcg pocket with reflections"
5. "Here is a video of a pack unboxing, try and replicate the physical unboxing of the pack as well
   (the swipe and the rainbow, not the way the cards come out) and you can study the reflection
   better since this is a video"

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
| A9 | "Make the background look like this from tcg pocket": a pale-blue studio (gradient backdrop, white horizon glow, a white floor that fades to blue at its edges) instead of the dark study and walnut desk, on the bench and the legacy page | before/after frames per beat, scratch `it13/` |
| A10 | "with reflections" / "study the reflection better": the floor mirrors what stands on it — a soft, blurred image about a third as strong as the object where it meets the floor, fading out over about one object height (measured on the video) | frames of the sealed box, lid open and a pack carried over the floor |
| A11 | "replicate the physical unboxing of the pack … the swipe": the held pack tears along its seam as the finger swipes across, a white-hot cut following the finger; the torn strip springs up off the pack and spins away | frame strips of a drag tear and a button tear |
| A12 | "… and the rainbow": the tear's light as in the video — a glow at the seam's start before the swipe, a ring where the finger lands, a flash with a rainbow halo when the cut completes, then a screen-wide beam with rainbow edges that thins away, and the cut edge glinting cyan | the same strips |
| A13 | "not the way the cards come out": the stack is still drawn out and revealed as before | rec-tabletop pool integrity unchanged |
| A14 | "remove the tcg live code cards as those are useless": no code card in the box or at the front of any pack | physical/pack-stack tests; carry run frames |
| A15 | "a left click and drag opens the box": a drag across the box tears the shrink-wrap as far as it goes (all the way, or let go past half, and it comes off; short of that it settles back); a drag up on the lid lifts it; a tap only nudges the lid | carry run: tap leaves the box shut, drags open it |
| A16 | "take all the things out of the box with your mouse": each item is pressed and dragged out (straight up clear of the walls, then flat under the pointer, its shadow on the landing spot) and set down where it is let go; a tap takes that one item to its usual place; the dock's button still takes the rest | carry run: spots recorded per item, `itemsOut` once all are out |
| A17 | "can put the card deck wherever you want": the deck (wrapped or not), the leaflet, the promo and the sealed packs can be carried anywhere on the floor at any time nothing is held, stacking on what they're set on and never inside the box; the spots survive a reload, and a torn pack's cards pile where it lay | carry run: spots equal across a reload; flow tests |

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
  site lets the tester switch surface. **Superseded by message 4:** the default is now the TCG Pocket
  studio floor with nothing on it; the black mat and the two printed mats stay selectable on the bench
  and lie on that floor. The bench's saved preferences move to a v2 key that keeps quality, sound and
  era but not the old surface, since "mat" was the old default and can't be told apart from a choice.
- (assumed) Only the backdrop, floor, light and the pack's tear change to the TCG Pocket look. The
  camera framings and the real-world flow stay: the box still sits on the floor and is opened by hand;
  the cards still come out of the pack the way they did before (message 5 excludes them).
- (assumed) The floor's reflection is a real planar mirror (the scene drawn again from below the
  floor at half resolution), dimmed and blurred by the height of what it mirrors, matching the video:
  ~0.33 at the contact line, gone by ~1.1 object heights. Low quality draws no reflection; reduced
  motion keeps the reflection and plays none of the tear's light.
- (assumed) Our packs' tear lines stay jagged (the real crimp's teeth); the TCG Pocket light follows
  that line. The strip no longer folds back 150° under the finger: as in the video it stays on, flexing
  a little as the cut passes, and springs off when the cut completes.
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
| 1 | WebGL missing / context creation fails | fallback 052 scene in the same root | [x] build-battle.test "rows 1–3" (context that cannot draw); rec-tabletop pass 3 (`--disable-webgl`, bench message) |
| 2 | `import()` of three or a stage module fails | fallback, no console spam | [x] same path: `import().then(createTabletopApp).catch(useFallback)`; renderer failure exercised by the rows 1–3 test |
| 3 | `fxDisabled()` | fallback without creating a context | [x] build-battle.test "row 3" (DOM scene synchronously, no tabletop) |
| 4 | card image 404 / CORS / slow (> 2.5 s) | card back with the name printed; flow unchanged | [x] `faceTexture` → `fallbackFace(card)`; TCGdex's doubled CORS header now routed through `/api/card-art` (card-art tests) |
| 5 | box render / face missing | procedural faces in the box palette | [x] `prepareBoxFaces`: no cut and no loadable/unresized render → drawn faces |
| 6 | reload at sealed / wrap off / lid open / deck shown / mid-pack 3 of 10 / done | settled picture of that state; mid-pack: 3 cards on the pile, 7 in hand | [x] rec-tabletop pass 2 (same card back in hand); every state restored by the iteration captures |
| 7 | repeated clicks during an animation | one action per completed beat, one queued | [x] `run()` queue (one `queued` task) |
| 8 | Skip while mid-pack | reveals that pack first (reducer refuses finish mid-pack), then finish | [x] `skipToEnd`; legacy browser run skipped to done |
| 9 | tab hidden mid-animation | backstop lands the animation; state already saved | [x] stage backstop `(delay + duration) / speed + 700 ms` (none on the manual film clock) |
| 10 | `motionReduced()` | every beat lands at once; scene still 3D | [x] `instant` → `animate` lands t = 1; legacy and bench both pass `motionReduced` |
| 11 | window resize / phone width | camera aspect and dock adapt; no horizontal scroll | [x] layout.test portrait framing + fan; iteration 7 captures at 390 × 844; picker overflow check |
| 12 | pool integrity | revealed ids == `session.packs[i]`; packs never written | [x] rec-tabletop pass 1 (every pack, in order) |
| 13 | unmount mid-animation / remount 20× | context released each time, no late callbacks | [x] `stage.dispose` → `forceContextLoss`; rec-tabletop pass 4 (12 open/exit cycles) |
| 14 | 23-card Evolution pack boxes (XY–SWSH) | thinner wrapped stack, promo on the bottom | [x] physical.test; Sword & Shield box captured open and laid out |
| 15 | pack picked out of order | it becomes the next logical pack; reload shows the same untorn packs | [x] flow.test (`tearPackAction`, `logicalOfVisual`) |

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
- **Iteration 6 (foils against the real cards).** Compared held cards with their TCGdex images
  (me02-046 reverse, me02-017 holo rare, me02-130 Mega Hyper Rare, me02-117 Ultra Rare). Before: the
  gold card hid its Charizard under a generic wave etch; the holo rare's art box was blocky speckle
  (relief at 3 cycles/mm aliasing at 4 px/mm); a reload mid-pack showed the front card's back while
  its face loaded. After: etched foils emboss the print's own light and dark (the silhouette stands
  up in the gold, as on the real card) with a fine etch over it; every pattern's relief fades once
  its smallest feature drops under ~2 px (`ttFoilFeature`), and the rainbow phase uses the faded
  pattern; starlight/glitter keep their points of light in the sparkle term (sparser, smaller,
  brightest reflections only); startup waits ≤ 6 s for the held cards' faces.
- **Iteration 7 (phones and haze).** Before (390 × 844): the box a small island in empty floor, the
  table framed from 2.4 m and fogged almost black — FogExp2 0.0007 also hazed the landscape table
  by ~36 %; the summary fan's five columns shrank to thumbnails. After: portrait framings (`narrow`
  half-widths, a steeper look at the table), linear fog set from the camera's distance to its
  target (clear to 1.4×, gone by 4.5×), `summaryColumns` picks the 2–5 column fan that shows the
  cards biggest at the screen's aspect (tested: every card inside the view, none overlapping); the
  desk toned down a little now the haze no longer dims it.
- **Iteration 8 (one clock, filmed frame by frame).** Before: delays ran on `setTimeout` beside the
  animation clock, so slow motion and stepping drifted apart, and screenshots starved while
  SwiftShader drew 0.7–2 s frames (fake-clock and video capture both stalled). After: every delay,
  wait and animation runs on the stage's scene clock (`stage.wait`, delayed `animate` starts);
  `?film` gives the bench a manual clock the api's `advance(ms)` steps, so a beat films in about a
  minute. Filmed take-out, deck unwrap and a hit reveal: the held deck shadowed the mat and hung
  huge in the corner while the promo was shown, and its cellophane veiled the promo. Now held
  things drop their shadow a quarter of the way up, the deck goes down on the table (back up) as
  the promo comes up to the eye, and the deck cellophane is a thinner film (env 0.55, haze 0.035).
  Shadow depth shaders compile behind the loading screen (one frame drawn with every shadow on);
  a frame-time governor drops to pixel ratio 1, then a 1024 shadow map, below ~30 fps.
- **Coverage pass.** The edge-case table's column is filled in from what now proves each row. Added:
  build-battle.test "row 3" (effects off → DOM scene at once) and "?tabletop=0" (the design-052
  scene stays on the stage — the opt-out `rec-unboxing.mjs` now uses, since it records that scene);
  `server/__tests__/unboxing-page.test.mjs` (the bench page's files exist, import map first, route);
  rec-tabletop pass 4 (12 open/exit cycles, no WebGL context left behind). The bench now honours the
  app's reduce-motion switch, and under it a held thing no longer keeps the frame loop spinning.
- **Independent review, fixed.** A start abandoned half-way (unmounted while loading, or the context
  lost while setting the table) kept its context, audio and UI: every release now registers as it is
  made and `createTabletopApp` tears down on a throw or `isCancelled()`; the scene discards an app
  that finishes after the fallback took the root. A record left by an earlier opening of the same box
  number laid its contents beside a sealed box (`reconcileCosmetic` now refuses `itemsOut` while
  sealed; flow.test). A press queued during a beat now picks its step when it runs, and take-out,
  unwrap and pick-up are no-ops when repeated; `settle` stops the hand sway and clears the piles; the
  counter counts pool cards. The proxy only takes card-image and set-logo paths, caps bodies as they
  stream, remembers 404s for an hour, cools down 30 s after a 403/429/503 and turns away a full queue
  (card-art-proxy tests). The bench's "open this box again" closes the old scene first.
- **Iteration 9 (etched foil, film glare, the torn strip).** Compared the Dawn SIR (me02-129) and
  the gold Mega Charizard X ex (me02-130) in hand with their TCGdex images. Before: both wore 2 × 2
  pixel stair steps over the whole art (the etched relief was a screen-space derivative of the
  per-pixel print, constant over each pixel quad) and their text was mush; the fine etch showed a
  waffle grid (value-noise seams); a sealed box's top was a white mirror (the film mirrored the env's
  back wall at ~5× a white card's brightness — measured by switching layers and panels off); the
  shrink-wrap wad glowed orange (the env's floor was warm wood, but everything sits on the dark mat);
  the torn pack strip stayed folded 150° about the tear, so "lying flat" it stood in the mat as a
  copper sliver. After: relief slopes are central differences in card millimetres over the print
  prefiltered to ≥ 0.7 mm (and ≥ 1.5 px), clamped to ~19°, with dark ink pressed toward the
  mid-tones so lettering stays flat while a darker-gold silhouette keeps its edge; the fine etch is
  two octaves on turned axes; SIR relief halved; the back wall halved and the env floor is the
  mat with the desk only near the horizon (the sealed top now shows its print through a light glare,
  as in the reference photos' grazing tops; the wad is clear film with white glints); the strip's
  fold springs open into a 16 mm curl in flight and lands print up. Frames: scratch `it9/`.
- **Iteration 10 (the unfilmed beats, frame by frame).** Filmed the wrap tear, the lid, picking up a
  pack, the last card into the summary fan and setting the fan down. Before: the wrap's hole grew as
  wandering loops that cut little islands of film loose, and with clear film invisible head-on only
  those thin white lines showed (it read as glass cracking); the lid snapped most of the way open in
  0.1 s (ease-out-back starts at 4× its average speed); every flight bowed over its higher end, so a
  pack picked up arced off the top of the screen before dropping into the hand (seen from above, the
  far half of a flight at hand height projects higher than its end) and things set down were tossed
  up first. After: the hole is a star of straight tear runs with small teeth (shared by the vertex and
  fragment stages); the film round it lifts in 4.5 mm flaps whose faces tip away from the hole and
  catch the light, with a 5 mm stretched-milky lip (box film mesh ~3 mm); the lid creeps 6° as it
  unsticks, then swings past open and springs back (a lid let go mid-lift swings on); hand ↔ table
  flights bow over the straight line (`arcPoint` `over: 'chord'`), so a pack rises steadily into view.
  The torn strip keeps its toss, and take-out keeps the over-the-top arc (an upright pack leaving
  the box would otherwise pass through its front wall). Also: starlight/glitter sparkles fade once
  their cells are under ~3 px (a promo on the mat flickered single pixels), the foil's screen
  derivatives are taken outside its per-pixel branch, and an XY–Sword & Shield box's button and hints
  say "Evolution pack" (and a Prerelease Kit's "player's guide") instead of "deck"
  (`contentsWords`). Tests: poses.test (lid from rest, chord carry), physical.test (contents
  words). Frames: scratch `it10/`.
- **Iteration 11 (every era, and the wrappers' bites).** Captured six boxes (XY, two SM, SWSH pack
  and deck, SV, ME) sealed, opened and laid out. Before: a Prerelease Kit's leaflet read "BUILDING
  TIPS"; and 50 of the 172 vendored wrapper fronts had bites: `vendor-box-art.mjs` keys the studio
  white out by flooding it in from the border, and light art that reaches the wrapper's edge (a white
  Lugia, Alolan Vulpix, a silver crimp) flooded with it — up to 10 000 px holes that showed the mat
  through the pack, and threw off the seal measurements of their pillow meshes. A single outline
  template does not fit every era (Sun & Moon bottom seals sit ~2.7 % lower), so the fix reads each
  wrapper's own outline: per side, the median of its rows' edges over ±25 % and over ±3 % of the
  height, whichever sits further out (bites only push an edge inward; a side bitten longer than
  that takes the other side's), and keyed pixels inside it are kept — the RGB under them is still
  the real print at that point, so nothing is inpainted. Regenerated with the script (sources
  cached; Chromium via the new `CHROMIUM` override): every render and face came out byte-identical;
  83 wrappers changed, by added opacity only (none lost a pixel or changed size); 3 keep specks
  under 70 px; 29 measured seals now agree with their set's (Radiant Gardevoir's became measurable).
  The leaflet prints "PLAYER'S GUIDE" in a kit. Frames: scratch `it11/`, `it11b/`, `packfix/`.
- **Iteration 12 (the pull, and the legacy page and phones again).** Filmed tear → pull → set
  down. Before: the stack was drawn a full card height up out of a pack that already fills the
  view, so for a second only its lower half showed; the emptied wrapper flew to the heap still
  bulging and snapped flat on landing. After: the wrapper slides down off the cards for 72 % of the
  pull (the stack rises the rest and stays in view, the wrapper leaves through the bottom of the
  screen), and it goes slack on its way down. The legacy Build & Battle page (tabletop on its
  stage, skip, "Build your deck" into the builder) and a 390 × 844 pick-up re-checked after this
  session's changes. Frames: scratch `it12/`.
- **Iteration 13 (TCG Pocket's studio, its mirror floor, its tear — messages 4 and 5).** Studied a
  TCG Pocket screenshot and a 60 fps screen recording frame by frame (scratch `pocketvid/`).
  Before: a dim study, a walnut desk and a black mat; the pack's strip folded back 150° under the
  finger and was tossed. After: `tt-studio.js` — a white floor, whitest round the stage and
  cooling to the backdrop's pale blue toward its edges and far off, under a pale blue dome, both
  in display colour; the floor is a planar mirror (the scene drawn again from below at half
  resolution, MSAA, with depth, an oblique near plane on the floor) whose strength fades with the
  mirrored surface's height as in the recording (~0.42 at contact, gone by 130 mm, blurrier as it
  rises; averaged over four depth taps so a jump between surfaces doesn't stair-step), tone mapped
  by the floor shader to match what the eye sees; light, cool shadows; the reflected room
  (`tt-environment.js`) the same studio, its own glow kept dim (×0.3) so card art stays within ~5 %
  of iteration 12's calibration while the softboxes still give foil and film their flashes. While
  anything is held up the floor recedes to the backdrop's blue (the game opens packs against it,
  and white light can't show on white). The tear (`tt-tear-fx.js`, timed by `pocketTearLight`):
  a soft glow pulses at the seam's start; a rainbow ring opens where the finger lands; a white-hot
  cut follows the finger along a smoothed tear line while the cut part of the strip only flexes
  26°; on completion a yellow-white flash and an elliptical rainbow halo (≈70 ms), folding into a
  screen-wide beam with cyan and magenta edges that thins to a hairline by ~230 ms; the strip
  springs off at 100 ms, whips up out of view turning about its own middle and rippling like a
  ribbon, then flutters down onto the reviewed landing spot; the cut edge glints cyan. Rainbow
  bands blend premultiplied-over, so they keep their colour on the pale floor. The chrome is dark
  text on white glass; the bench's "Table" defaults to the studio floor (prefs v2), the mats lie on
  it. Bugs found on the way: the shrink-wrap's additive gloss piled alpha past 1 in the float mirror
  target (now leaves alpha alone); the cut's ribbon wound clockwise and was culled; the crumpled
  wad blew out to white on the white floor (crumpling now dims the gloss, greys the haze and gives
  it body where folds turn edge-on); and the recorder's mid-pack reload lost three card faces:
  the mirror's shaders made the loading screen's compile one 9.3 s blocking task on SwiftShader
  (no parallel compile), the image loader's 9 s timeout fired on images the proxy had long
  delivered, and the CDN fallback failed CORS. The loader's timeout now counts only time the page
  could have handled the load (`stallProofTimeout`), and the mirror's compile runs in a task of its
  own (longest task 6.6 s). The mirror skips what stands wholly above its fade height; the tear's
  shaders compile behind the loading screen; the frame-time governor's last step turns the mirror
  off. The deck held up for its unwrap gets the same floor focus as a pack. Not changed (message
  5): how the cards come out. Frames: scratch `it13/` (`v5`, `phone`, `low`, `mat`, `art`,
  `drag2`, `tear2`, `tear-sm`, `unwrap`, `summary3`, `inspect`, `legacy`). flag: SwiftShader takes
  seconds per first draw of each new shader/target state (more with the mirror); real GPUs were
  not measured here.

### Iteration 14 — the mouse does the opening (brief: "less automation and more control with the mouse pointer")
- Code cards removed (A14): the box holds deck, leaflet and packs; a pack's stack is its Basic
  Energy (SwSh on) and ten cards. The CSS scene's tray and the ETB keep theirs (other screens).
- The box opens under drags (A15): a press on the box and a drag tears the shrink-wrap as far as
  the drag goes (260 px = 40 % of its peel; all of it or let go past half and it comes off, short of
  that it settles back); a drag up on the lid lifts it; a tap on the shut lid only nudges it. The
  dock's button still plays any step whole (keyboard and reduced-motion path).
- Carrying (A16, A17): the deck, leaflet, promo and every sealed pack are pressed and dragged — out
  of the box (straight up clear of the walls first, then flat, 34 mm over the floor so its shadow
  marks the spot, leaning into its motion) and around the floor at any time nothing is held. Let go,
  it lands clamped to the framed floor, pushed out of the box's footprint, resting on whatever it
  overlaps (`placement.mjs`); what lay on something lifted comes down. A tap on an item in the box
  takes just that one to its usual place; the dock takes the rest, each to the nearest bare floor
  by its usual place (`freeSpotNear`). Spots live in the cosmetic record (`spots`, per key, dropped
  one by one when malformed, cleared beside a sealed box) and survive a reload; a torn pack's cards
  pile where it lay. With the lid up a press on the box reaches its contents (the walls cover them
  from the table's height). Drags that never left the box put the item back in its slot.
- Framerate (user report, investigated by an agent; scratch `perf/`): fill rate, not geometry or
  CPU — DPR 2 + canvas MSAA + a whole-scene mirror pass + a shadow map redrawn every frame, the
  floor and dome drawn first (no early depth reject), and a governor whose 34 ms threshold could
  not fire above 20 fps on a 60 Hz display (rAF deltas quantise to 16.7/33.3 ms). Now: floor and
  dome draw last, the shadow map redraws only when a caster changes, the mirror target has no
  MSAA, the governor steps down under ~45 fps, the pixel ratio caps at 1.5, and ticker-only
  motion draws at most ~80 times a second. Held-pack frame 197 → 137 draws; SwiftShader −14 %
  before the DPR cap (DPR 1.5 another −33 % there).
- Verified: carry runs (scratch `carry/`: wrap/lid/tap/drag/stack/reload/unwrap/promo/pick), the
  recorder (all checks, mid-pack reload included), tabletop unit tests 63/63.
