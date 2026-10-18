# 074: three.js board — one WebGL scene for the table, both seats and the hand
Status: draft (awaiting user approval of §Options picks and the slice plan)
Date: 2026-10-16 · Session: cloud session (user answered 16 scoping questions; answers under §User picks)

## Problem
The board is two same-origin iframes (`client/self-containers.html`, `client/opp-containers.html`) plus the top-page
`#stadium` and `#battleMat`, laid out by ~2,500 lines of per-iframe CSS and tilted with CSS `perspective()` (design 009).
Every effect, picker, drag avatar and popup finds a card by `getBoundingClientRect` inside an iframe and maps it out
through the iframe's CSS matrix. The CSS tilt blurs HiDPI (worked around with `zoom: 2`), flattens any ancestor with
`overflow`/`filter`, cannot cast shadows or light foil, and every TCG Live asset we import (foil shader, coin shaders,
impact prefabs) already lives on a GPU camera the DOM board can only imitate. The user wants the whole board (table,
every zone, the hand, counters and markers) rendered by three.js, matching today's 12° look first, with the HTML
board retired once the scene reaches parity.

## Constraints
- No bundler, native browser ESM, no new npm runtime dependency (PROJECT.md S2; D4). three.js 0.185.0 is already
  vendored (D193); only `three.module.min.js`, `three.core.min.js`, `RoomEnvironment.js` are vendored and there is
  no `three/addons/` import-map entry (`scripts/vendor-three.mjs`, byte-checked by `scripts/__tests__/vendor-three.test.mjs`).
  Any addon is vendored through that script and justified in DECISIONS.md.
- Pure math in `.mjs`, DOM/WebGL in `.js`; `.mjs` never imports `three` (STATE watch-out; pack3d precedent).
- Animations are advisory (design 002 Invariant 4): removing one never changes game state. Catch-up replay and a
  hidden tab never animate (`advisory-animations.js:368-381`).
- `'self'`/`'opp'` are points of view; `systemState.initiator` is today derived from an iframe CSS class
  (`global-variables.js:44-47`) — never sent over the wire (PROJECT.md landmine).
- Server authority is the default netcode (D216); the legacy relay stays reachable with `SERVER_AUTHORITATIVE=0`.
- Card art as a WebGL texture needs CORS. Verified hosts (`holo.mjs:189-195`): assets.tcgdex.net,
  images.pokemontcg.io, limitlesstcg.nyc3(.cdn).digitaloceanspaces.com, ptcgsim.online.
- fx-preview gates visuals by freezing WAAPI clocks (`.claude/skills/fx-preview/SKILL.md:75`); the scene's clock
  must be freezable the same way.
- Hard rules: never delete content unread; a design that deletes the iframes states its revert path (§Migration).
- User picks (2026-10-16), binding for this design: see §User picks.

## Current state (read this session; agents' path:line reports folded in)
**Shell and layout**
- `client/index.ejs:45-65` — `#battleMat` (mat art as `<img>`s in two halves), the two iframes, top-page `#stadium`;
  `:1169-1188` injects `playmat-anim.mjs` into each iframe (generic slide/fade on added `<img>`s, deck-stack height
  from `#deckCount` text).
- `client/self-containers.html:3-45` `#playfield` (tilted plane) holds deck/discard/lostZone popups, the three covers,
  `#deckStack`, `#bench`, `#active`, `#matCoinSlot`, `#prizes`, `#board`; outside it: `#hand`, `#attachedCards`,
  `#viewCards`. `opp-containers.html` is the same with `opp-` class prefixes, shifted one line.
- `client/src/css/index.css:186-225` iframes fixed 75.5% × 50%, `.opp` flipped `scaleX(-1) scaleY(-1)`;
  `self-containers.css:36-103` zone CSS vars (% of the iframe), `:408-417` `#playfield` `zoom: 2` + `--tilt-transform`,
  `:575-617` bench grid / active flex / prizes grid, `:427-445` three-band hand strip.
- `client/src/setup/sizing/mat-layouts.mjs` — pure zone profiles (`sim`, `one-player`, `two-player`, `edge-to-edge`,
  `edge-to-edge-two-player`), % of one player's half; `layoutToCssVars` flattens them. `apply-mat-layout.js:126-153`
  writes the vars into both iframes and paints the mat halves; `changePlaymat :408` is synced through `processAction`.
- `client/src/setup/sizing/table-tilt.mjs` — pure CSS tilt: `DEFAULT_TILT_DEG = 12`, `DEFAULT_PERSPECTIVE_PX = 1400`,
  pivot at the centre of the near playfield's bottom edge, `projectFromPivot`, `seamShiftPx`, `OVERSAMPLE = 2`,
  `battleMatBox`; `apply-table-tilt.js:137-178` applies it to both frames, `#battleMat`, `#stadium`, re-runs on
  frame load/resize/`mat-layout-applied`/`board-layout-changed`.
- `client/src/setup/zones/get-zone.js` — `getZone(user, zoneId)` → `{ array, element, elementCover, getCount,
  getRenderedCount }`, switching on `selfContainerDocument`/`oppContainerDocument`
  (`initialization/global-variables/containers.js:7-10`, captured once at load; 43 files import them, 55 import `getZone`).
- `client/src/setup/zones/deck-stack.mjs` — pure `deckStackLayers(count)`; `hand-stack-dom.js:177` `reconcileHandStacks`
  (design 014 duplicate stacking).

**Render path (authoritative)**
- `socket-event-listeners.js:524-549` `socket.on('view')` → `applyView(view, events, { onBeforeApply, onAdvisoryEvent })`
  or `applySpectatorView`.
- `client/src/setup/netcode/apply-view.js` (2,447 lines) — keyed reconcile by `instanceId` over the whole view:
  `createOrUpdateCardElement :458-581` builds an `<img>` (`buildCardImage`), stamps `data-instance-id/-zone/-side/
  -damage/-special-condition/-ability-used`, `img.card = cardData`, registry record `{ instanceId, element, card,
  side, zone, container, holoCard }` (`cardRegistry :49`); `placeCardInZone :993-1061` (`.play-container` on
  active/bench, roots before attachments); `layoutCardStack :1210-1270` (Stage over Basic at 1/15 width, Tools at
  1/6); Energy → tokens `:1163-1177` (`planEnergyTokenRow`); overlays as sibling `<div>`s positioned in px
  (`damageCounter :694`, condition markers `:718-722`, `statusLoop :828`, `abilityCounter :909`,
  `repositionCardOverlays :932` on resize); covers `reconcileZoneCover :1462`; counts `:1406`; stadium `:1534`;
  pending choice `:1580`; turn state `:1938`; game ended `:2023`; sweep `:2383-2401`; `board-view-applied` `:2440`.
  Read APIs: `getCardRegistry :265`, `getAuthoritativeZoneArray :293`, `getAuthoritativeDeckCount :307`,
  `getAuthoritativeStadiumArray :320`, `clearRenderedBoard :2197`.
- `server-rendered-zones.mjs:30-32` `legacyDomSuppressed` is true only when `serverAuthoritative && isTwoPlayer`:
  **solo mode (`isTwoPlayer=false`) still renders through the legacy client pipeline** (`move-card.js:720`,
  `build-deck.js:29`, `attach-card.js:106`, counters in `actions/counters/*`), with card state on DOM expandos
  (`card.image.damageCounter` etc.: 404 refs in 49 client files, 54 in 16 `shared/` files, read back by
  `shared/engine/zones/card-state.mjs` fallbacks).
- View shape (`shared/engine/view.mjs:166`): `{ gameId, stateVersion, rulesEnabled, turn, winner, winReason,
  stadium, pendingChoice, isSpectator, you: { playerId, username, deckFormat, flags, zones, attackExtras },
  them: {...} }`; owner zones `deck: { count }`, `hand/active/bench/discard/lostZone: card[]`, `prizes` (face-down =
  identity only), `board` (face-down unrevealed = identity only). A card is `createCard` (`shared/engine/cards.mjs:34`):
  `instanceId, name, set, number, id, src, type, supertype, subtypes, hp, attacks, damage, specialCondition,
  abilityUsed, attachedTo, revealed` (+ `faceDown`, poison/burn flags as extra props). Redacted = `{ instanceId }`.
- Spectators get both hands (`viewFor` `isSpectator` branch); `spectator-session.js:155` modes `p1|p2|broadcast`,
  broadcast rotates the frames ±90° (`body.spectator-broadcast`).

**Input**
- `card-listener-table.js:17-25` `CARD_IMAGE_LISTENERS` (click, dblclick, dragstart/over/leave/end, contextmenu) attached
  per `<img>`; covers add `drop`. Zones get dragover/dragleave/drop (`table/zones.js:7-41`); top-doc `#stadium` and the
  Lost Zone rail (`lost-zone-panel.js:79-81`, `data-drop-zone`/`data-drop-user`) too.
- `click-events.js:47-67` `identifyCard` fills `mouseClick` (`global-variables.js:76-95`) from `event.target.user`,
  `readCardInstanceId(target)` (`authoritative-dispatch.js:174`, `data-instance-id`), `closest('#deck, #hand, …')`.
- `drag.js` — native HTML5 DnD only; `:133-196` target predicates (`.highlight`, `.highlightBox`, `.board-drop-ready`);
  `:256-456` drop → `retreat()` / `moveToDeckTop` / `moveCardBundle(user, initiator, from, to, index, targetIndex,
  'move', true, null, { moving, target })` (`:437-451`); `drag-avatar.js` draws a top-document avatar with the
  `drag-tilt.mjs` spring, mapping pointer positions through `iframe-rect.mjs`.
- Mat picker (`rules/mat-picker.js:149-172`) outlines real board `<img>`s (inline `outline`, `data-mat-pick="1"`), reads
  the pick from a capture-phase click on all three documents; `e2e-api.js:157-192` finds those nodes and calls
  `img.click()`. Prize/choice/deck-peek/discard pickers are top-document overlays that never touch board cards.
- Card focus (`rules/card-focus.mjs:255`) flies a clone from `viewportRectOf(card.image)` to `focusRect(viewport)` with
  `rotateX = DEFAULT_TILT_DEG`, hides the source (`visibility: hidden` on `.mat-holo`), adds `hand-lowered` to the
  self iframe root. Hover preview (`hover-preview-dom.mjs:50`) installs pointerover/out per document, mouse only.
- No touch handling anywhere; no `tabindex`/`role` on cards; `alt` is the only accessibility.

**FX**
- `advisory-animations.js:219` `handleBeforeApply` snapshots pre-diff ghosts/origins from the registry; `:345`
  `handleAdvisoryEvent` → `advisoryAnimationPlan` (pure) → `fxQueue.push`; `runPlan` → `playFx` (`mat-fx/index.js:83`,
  `createFxDispatcher`); effect signature `(plan) => holdMs | undefined`, `HOLD_MS` in `fx-holds.mjs`.
- 41 scenes (agent inventory): all draw in the top document from `rectForInstance(instanceId, registry)`
  (`image-logic/mat-fx.mjs:101` → `visualRectOf`, which already returns the plain rect for a top-document element,
  `iframe-rect.mjs:87-100`), pile rects via `docForSide(user, selfDoc, oppDoc).getElementById('deckCover'|'discardCover'|'prizes')`
  (`side-doc.mjs:16`, callers `card-flight.js:25`, `prize.js:19`, `draw-scene.js:34`), board rects from the iframe
  elements (`draw-scene.js:29`, `opp-play.js:33`, `shuffle-flight.js:27`). Techniques: WAAPI on overlay clones,
  `playCanvasStage` 2D canvases, per-card `tcgl-canvas`, raw-WebGL2 impact stage (`impact-stage.js`, FOV 20° top-down),
  three.js coin stage. `hideDuring` (`mat-fx.mjs:181`) hides the real card by `style.visibility`. Written INTO card DOM:
  `status-loop.js`, `tera-skin.js`, `tcgl-foil-view.js:183` (per-card 2D blit from one shared renderer; I258 ≈12 MB
  GPU per live foil card). Table shake animates `#battleMat`, both iframes and `#stadium` (`combat.js:303`).
- three.js precedents: pack3d (`native-deck-builder-pack3d.js:130-140, 313-330` hand-made WebGL2 context → quiet
  null fallback, `RoomEnvironment` + PMREM, on-demand rAF, `renderer.setSize(w, h, false)`, dispose +
  `forceContextLoss`), coin stage, customize stage, foil material (`tcgl-foil-material.js:110 createFoilMaterial(record)`,
  `:338 foilGeometry(w, h, uvWindow, radius, segments)`; `tcgl-foil-store.js` manifest + R2 texture base). No shared
  renderer/texture helpers; matrix math duplicated in `coin-stage-math.mjs`, `impact-math.mjs`, `tcgl-foil-pose.mjs`, `pack3d.mjs`.

**Tests touching the board DOM**: `netcode/__tests__/apply-view.test.mjs` (MockDocument with self/opp zones),
7 CSS tests parsing `self/opp-containers.css`, ~16 stub-DOM unit tests, Playwright `test-card-inspector-e2e.mjs`
(frames by URL, `#active img`, `#hand img`), `fullview-test.mjs`, `spectator-view-test.mjs` (`contentDocument
img.card-image[data-zone="hand"]`), fx-preview `capture-*.mjs`/`rec/*.mjs` (24 iframe-document reads).

## User picks (2026-10-16)
| # | Question | Pick |
|---|---|---|
| 1 | Scope | Table + every zone in-scene (hand, prizes, piles, Stadium, counters, markers, energy tokens, counts); the four list popups stay HTML |
| 2 | HTML overlays | Architect decides per overlay (§O7) |
| 3 | Solo mode | Server views only; solo runs through a server-side authoritative room; legacy renderer retires |
| 4 | Rollout | Flag, then delete; each phase lands on main green |
| 5 | Camera | Match today's 12° CSS tilt first; TCG Live pose later |
| 6 | Cards | Card meshes: TCG Live dimensions, front/back faces, foil shader as material, piles as stacks |
| 7 | TCG Live table assets | Procedural table (no extract import) |
| 8 | Mats | Keep the 178-mat catalog and the 5 layout profiles |
| 9 | FX | Bridge (2D layer over the canvas) first, then port card motions to meshes |
| 10 | Input | Pointer events + raycast; touch unsupported but not blocked |
| 11 | Tests | Shadow DOM mirror (also the accessibility tree) |
| 12 | Perf | Discrete GPU assumed |
| 13 | Plan shape | One design doc |
| 14 | Look | Studio table: mat texture, soft contact shadows, RoomEnvironment lighting, dark floor; no post-processing |
| 15 | Hand | TCG Live fan (arc, half cropped, rise on hover; opponent's backs fanned at the top) |
| 16 | Card art CORS | Server proxy with cache for non-verified hosts |

## Options
**O1 — what the scene consumes**
- A: the scene is a second consumer of `apply-view.js`'s registry and DOM (mesh per registry element). Cheapest start,
  but the DOM stays the layout authority and 1,500 lines of zone/overlay DOM code stay forever.
- B: a pure `board-model.mjs` turns a server view into placements; the scene and the mirror both derive from it;
  `apply-view.js` keeps the non-board work (turn state, pickers, pending choice, game ended, audio) and skips its zone
  pass under the flag. More to write up front; one source of truth; the zone DOM code is deleted at the end.
- **Pick B.** The "what to show" decisions reuse the same pure helpers apply-view calls today (`planEnergyTokenRow`,
  `topPokemonCard`, `getDamageCounterTier`, `listConditions`, `deckStackLayers`, hand stacks).

**O2 — the mirror (user pick 11) implementation**
- A: two open shadow roots (`#selfBoard`, `#oppBoard`) each holding the same zone ids as an iframe does today.
  `getZone` → `root.getElementById(zoneId)`, `docForSide` returns the root, `identifyCard`'s `closest('#active…')`,
  FX `getElementById('deckCover')` and `querySelectorAll('img')` all keep working. Cost: document-level capture
  listeners see the host as `event.target`; two call sites switch to `event.composedPath()[0]`.
- B: one tree with `data-side`/`data-zone` attributes and prefixed ids. Every `getElementById(zoneId)` and
  `closest('#…')` caller changes (≥ 10 modules), and ids diverge from the engine's zone names.
- **Pick A.** Shadow roots implement `getElementById`, so the two iframe documents are replaced by two roots with the
  same contract; `containers.js` exports keep their names.

**O3 — how the scene dispatches input to existing handlers**
- A: after a raycast hit, dispatch synthetic `click`/`dblclick`/`contextmenu` `MouseEvent`s (`bubbles`, `composed`,
  with `clientX/Y`) on the hit card's mirror `<img>`; `click-events.js`, keybinds, mat picker, context menu placement
  work unchanged. Drag is rebuilt on pointer events and ends in the same `moveCardBundle`/`retreat`/`moveToDeckTop`
  calls, with the routing in `drag.js:256-456` extracted to a pure `drop-router.mjs`.
- B: rewrite every handler to take `{ instanceId, zoneId, side }`. Cleaner, but touches ~12 modules before anything
  renders and loses the legacy-mode path while the flag is off.
- **Pick A** for phases B–F; B is the shape the deletion phase (G) leaves behind for drag only (drop-router).

**O4 — camera matching the 12° tilt (user pick 5)**
- A: keep world units = CSS px of the flat layout (what `#playfield` is before its transform), and derive a
  `PerspectiveCamera` whose projection of that plane equals `perspective(1400px) rotateX(12deg)` about the pivot
  `table-tilt.mjs` uses. Pure `board-camera.mjs`; its test compares against `projectFromPivot` on seam/corner points.
- B: author a fresh camera and tune by eye. Faster today, no pixel match, and the user chose "match first".
- **Pick A.** Both halves are one plane now, so there is no seam shift; the far half is laid out as the near half
  rotated 180° about the seam (the same thing `.opp`'s flip does).

**O5 — card geometry and material**
- A: one `ExtrudeGeometry` from a rounded-rect `Shape` (depth = thickness, no bevel) with three material groups:
  front (card art or foil), back (sleeve), rim (tinted). Rounded corners and a real edge from three core only.
- B: `foilGeometry` plane front + plane back + box rim. Three draw calls per card, visible corner seams.
- **Pick A.** Dimensions follow TCG Live: 6.397 × 8.9 × 0.064 units scaled so width = the zone's card width in px.
  Foil: `createFoilMaterial(record)` (`tcgl-foil-material.js:110`) becomes the front group's material directly; the
  per-card blit path (`mountTcglFoil`) is not used by the scene (closes I258 for the board).

**O6 — counters, markers, counts, energy tokens**
- A: HTML overlays projected from rects (today's shape). Breaks user pick 1.
- B: in-scene planes parented to the card mesh: damage counter = `assets/damage-counter/*.webp` plane + `CanvasTexture`
  digits; condition badges = `assets/status-markers/*.webp`; held-condition loop = the status-loop sprite sheet as an
  animated `CanvasTexture`; energy tokens = the token row from `planEnergyTokenRow` as small planes; ability tab =
  plane; zone counts = `CanvasTexture` text planes beside the piles.
- **Pick B.** Text is numbers and short labels only; everything long stays HTML (§O7).

**O7 — HTML overlays (user pick 2: architect decides)**
| Overlay | Phase B–G | Later (phase H) |
|---|---|---|
| Card focus 067 | HTML clone flown from the projected rect (`viewportRectOf` of the mirror img); `hand-lowered` becomes a hand pose | lifted card as a mesh |
| Card inspector 013, choice modal, pickers, carousel, deck peek, discard viewer | HTML, unchanged | unchanged |
| Hover preview 069 | HTML; the scene feeds enter/leave (§D5) | unchanged |
| Right-click menu | HTML, anchored to the projected rect | unchanged |
| Zone list popups (deck/discard/viewCards/attachedCards) | HTML panels in the top document (moved out of the iframes) | unchanged |
| Chat, sidebox, board buttons, turn banner, battle log | HTML | unchanged |

**O8 — solo mode through the server (user pick 3)**
- A: a solo room is an ordinary `GameRoom` whose two seats are owned by ONE socket; commands carry `seat`; the socket's
  view is the near seat's owner view with the far seat's private zones filled from the far seat's owner view
  (`viewForSolo`). One socket, one view, one protocol with a `seat` field.
- B: the client opens a second Socket.IO connection for the far seat and merges the two views. No server change, but
  every per-socket client module (`systemState.roomId`, sync heartbeat, chat, exchangeData) runs twice.
- **Pick A.** Server tests cover it in isolation; the client keeps one socket.

**O9 — feature flag and fallback**
- `board=3d` query param or `localStorage['ptcg-board-3d']==='1'` (pure `isBoard3dRequested(search, storage)`).
  WebGL2 missing or lost twice → the iframe board, with one chat line. While the flag is off nothing in the iframe path
  changes. Phase G flips the default on and then deletes the iframe path; the flag survives one release as the kill
  switch (`ptcg-board-3d=0`), then goes.

**O10 — render loop and clock**
- On-demand rendering (`invalidate()`), no `setAnimationLoop`. All scene tweens read a WAAPI `Animation` on the canvas
  (`canvas.animate([], { duration: 1e9 })`), the pattern `canvas-stage.js` and the impact stage use, so fx-preview can
  freeze the scene at a time and `page.clock` is not needed.

**O11 — shared GL helpers**
- New `client/src/setup/gl/`: `gl-renderer.js` (`createRenderer({ canvas, onLost })` with the hand-made WebGL2 context,
  `resizeTo(host)`, `dispose()`), `gl-textures.js` (refcounted cache, `acquireTexture(url, { colorSpace })`,
  `release(url)`, CORS proxy rewrite). pack3d, coin and customize stages are NOT migrated here (ISSUES line at close).

**O12 — card art textures**
- `cardArtSrc(card)` → `toHighResCardImageUrl` → host check against `CARD_ART_CORS_HOSTS` (the `holo.mjs:189` set,
  moved to a shared `card-art-hosts.mjs`) → verified: load directly; else `/api/card-image?url=` (server, same shape
  as `/api/mat-image`, LRU 200 entries, `Cache-Control: public, max-age=86400`). A failed texture shows the back plus
  a `CanvasTexture` name label and retries once after 5 s.

## Design
### D1 Module layout
```
client/src/setup/board3d/
  board-flag.mjs            isBoard3dRequested(search, storage) · BOARD3D_KEY
  board-layout.mjs          flatLayout(profile, halfPx) → zone rects in flat px (both halves)
  board-camera.mjs          cameraFromCssTilt({ viewportW, viewportH, tiltDeg, perspectivePx, nearHalfPx }) → { fov, position, target, near, far }
  board-model.mjs           boardModelFrom(view, ctx) → BoardModel (pure)
  hand-fan.mjs              handFanPoses(count, { width, radius, maxSpreadDeg, cardW, cardH, hoverIndex }) → pose[]
  card-geometry.mjs         roundedRectShapePoints(w, h, r, segs) · CARD_UNITS · cardScaleFor(widthPx)
  pile-stack.mjs            pileLayers(count) (wraps deckStackLayers) · pileOffsets(layers, thickness)
  overlay-plan.mjs          counterPlan(card) · markerPlan(card) · countLabelPlan(zone, count) — sizes/anchors in card units
  board-scene.js            createBoardScene({ host, flagged }) → { applyModel, invalidate, rects, hitTest, dispose, clock }
  card-mesh.js              cardMeshPool: acquire(instanceId) / release / setFront / setBack / setPose / setHidden
  table-mesh.js             table plane, mat texture halves, contact-shadow planes, floor vignette, lighting
  overlay-meshes.js         counter/marker/token/count planes parented to card meshes
  board-mirror.js           two shadow roots, mirror <img> per card, zone/cover elements, rect write-back
  board-input.js            pointer pipeline → raycast → synthetic events / drag
  drop-router.mjs           routeDrop(hit, mouseClick, systemState) → { kind: 'retreat'|'deckTop'|'move', args } | null  (pure, from drag.js:256-456)
  board-rects.js            rectForInstance / pileRect / boardRect providers (replaces visualRectOf callers' iframe math)
  board3d.js                boot: flag check, renderer, wiring into apply-view/socket, fallback
client/src/setup/gl/        gl-renderer.js · gl-textures.js · card-art-hosts.mjs
client/src/dev/board-lab.html  lab page (served like attack-fx-lab.html) with fake views and sliders
server/game/room.mjs       solo seats (§D7)
server/server.js           /api/card-image proxy · joinGame solo flag · cmd.seat
```

### D2 Board model (pure)
```js
// board-model.mjs
/** @typedef {{ instanceId:number, side:'self'|'opp', zone:ZoneId, index:number,
 *   face:'front'|'back', src:string|null, name:string, backSrc:string,
 *   role:'root'|'stage'|'tool'|'energy', host:number|null, stackIndex:number,
 *   energyToken:{ src:string, double:boolean }|null, rotation:0|90|180|270,
 *   damage:number, conditions:string[], poison:boolean, burn:boolean, abilityUsed:boolean,
 *   glow:string|null, selected:boolean, matPick:'idle'|'picked'|null, hidden:boolean }} Placement
 * @typedef {{ version:number, nearSeat:'you'|'them', placements:Placement[],
 *   piles:{ [side]: { deck:{count,sleeve}, discard:{count,top}, lostZone:{count,top}, prizes:{count, faceUp:number[]} } },
 *   stadium:{ instanceId, src, facing:'self'|'opp' }|null, handStacks:{ [side]: number[][] } }} BoardModel */
export function boardModelFrom(view, { selfPlayerId, cardBackSrcFor, layoutProfile, uiState }) {}
export function placementById(model, instanceId) {}
export function diffModels(prev, next) {} // { added, removed, moved, restyled } by instanceId
```
- `uiState` = `{ selected:Set<instanceId>, glows:Map<instanceId,string>, matPick:Map<instanceId,'idle'|'picked'>, hidden:Set<instanceId> }`,
  read from the mirror's classes/styles (§D4) so existing code that toggles `.highlight`, `.has-glow`, `--glow-rgb`,
  `data-mat-pick`, `style.visibility` keeps driving visuals.
- Zone geometry: `flatLayout(profile, halfPx)` reproduces `layoutToCssVars` in px for a half of `halfPx = { w, h }`
  (today: iframe 75.5vw × 50vh, zoomed 2×): returns `{ self:{ active, bench[5], prizes[6], deck, discard, lostZone,
  board, hand }, opp: same mirrored, stadium }` rects in flat px with y up from the near edge. Bench slots follow the
  5-column grid at `--bench-gap`; prizes the 3×3 grid; hand is the fan's baseline, not a rect.

### D3 Scene
- **Units and camera** — 1 world unit = 1 flat CSS px; origin at the pivot `table-tilt.mjs` uses (centre of the near
  half's bottom edge), x right, y away from the viewer along the table, z up. `cameraFromCssTilt` puts the eye at
  `(0, 0, perspectivePx)` relative to the pivot in the TILTED frame, i.e. the table plane is rotated by `tiltDeg`
  about the x-axis through the pivot and the camera looks along -z of the screen; `fov = 2·atan((viewportH/2)/perspectivePx)`,
  aspect = viewport. Test: `projectFromPivot` of the seam corners equals the camera's `project()` of the same points
  within 0.5 px. The spectator broadcast pose (frames ±90°) becomes `cameraFromCssTilt` with `broadcast: true`
  (table rotated 90° about z, both hands cropped at the screen sides).
- **Table** (`table-mesh.js`) — a plane of the two halves' union with the mat art as two `MeshStandardMaterial` maps
  (same images `apply-mat-layout.js:156-192` loads; `object-fit` reproduced in UVs by `matUvFor(fit, aspect)`), a
  dark floor plane under it (vignette `CanvasTexture`), `RoomEnvironment` through `PMREMGenerator`, one
  `DirectionalLight` from the far-left (shadow map 2048, cards cast, table receives), `NeutralToneMapping`,
  `outputColorSpace = SRGBColorSpace`, pixel ratio `min(devicePixelRatio, 2)`. Contact shadows under piles are
  a blurred radial `CanvasTexture` plane (no addon).
- **Cards** (`card-mesh.js`) — pooled meshes (`ExtrudeGeometry` per distinct card width, cached); groups `[front,
  back, rim]`; front = `MeshStandardMaterial({ map, roughness .55, metalness 0 })` or the foil material when
  `foilRecordFor(manifest, card.id)` returns one (`tcgl-foil-manifest.mjs:67`); back = the side's sleeve
  (`cardBackSrcForUser`, `hydrate-holo.js:30`); rim = `MeshStandardMaterial({ color: 0xe8e2d4 })`. Face-down and
  redacted cards show the back. Pose per placement: zone slot rect → centre + yaw (`rotation`) + the stack offset
  (Stage over Basic at 1/15 width, Tools at 1/6, energy tokens along the bottom edge per `ENERGY_TOKEN_BOTTOM`). A
  pose change tweens 180 ms on the scene clock unless `motionReduced()`.
- **Piles** — deck: `pileLayers(count)` thin boxes with the sleeve on top; discard/lostZone: top card face up on
  `min(count, 6)` layers; prizes: 6 slots, backs unless revealed; counts as text planes (`overlay-plan.mjs`) beside
  each pile, replacing `#deckCount`/`#discardCount`/`#lostZoneCount`/`#prizes` count text.
- **Hand** — `handFanPoses` (arc of radius `radius`, spread capped at `maxSpreadDeg`, cards overlap to fit `width`,
  the baseline sits so that the bottom 45 % of a card is below the screen edge, hover index lifts a card by
  `cardH·0.35` and un-crops it); own hand faces up, opponent hand backs fanned at the top edge. Hand stacks (design
  014) collapse a stack group to one fanned slot with a count plane. Hand sort stays the existing checkbox (moved to
  the HUD) acting on the same `sortZoneCards`.
- **Stadium** — a card mesh at the layout's stadium rect, yaw by `setStadiumFacing` state (`stadium-facing.mjs`).
- **Overlays in scene** (`overlay-meshes.js`) — planes parented to the card mesh at anchors from `overlay-plan.mjs`:
  damage counter (tier from `getDamageCounterTier`, art `counter-flat/-wave/-slash.webp`, digits `CanvasTexture`),
  condition badges (`poison-badge.webp`, `burn-badge.webp`, rotation conditions rotate the card as today's
  `ROTATION_CONDITIONS`), status loop (sprite sheet frames from `status-loop.mjs` keys on an animated
  `CanvasTexture`), ability tab, energy token row, selection ring (`selected`), glow ring (`glow` colour), mat-pick
  outline (`#ffd23f` idle / `#38d66b` picked).
- **Reconcile** — `applyModel(model)`: `diffModels(prev, next)` → acquire/release meshes, set faces/poses/overlays;
  then `mirror.sync(model, rects)` (§D4). `invalidate()` renders once per frame while anything tweens or the pointer
  moves; idle = no rendering.
- **Lifecycle** — `board3d.js` boots after `initializeMatLayout` (`front-end.js:26`): flag → `createRenderer` (null →
  fallback) → `createBoardScene` → hides both iframes (`display: none`, not removed) and `#battleMat`; `ResizeObserver`
  on the host → `resizeTo` + camera; `visibilitychange` hidden → stop tweens; context lost → one rebuild, second loss
  → fallback; `dispose()` on `leaveRoom`/reset releases textures and the pool.

### D4 Mirror (shadow roots) and the registry
- `#boardMirror` holds `#selfBoard` and `#oppBoard`, each `attachShadow({ mode: 'open' })`; the root contains the same
  zone ids an iframe has (`deck, discard, lostZone, deckCover, discardCover, lostZoneCover, deckStack, bench, active,
  prizes, board, hand, attachedCards, viewCards`) as empty `<div>`s, `pointer-events: none`, `opacity: 0`, absolutely
  positioned at their projected rects; `#stadium` stays the existing top-document element but is positioned by the
  scene. Each card is an `<img class="card-image" draggable="false" alt=name data-instance-id data-zone data-side …>`
  (the same attributes `createOrUpdateCardElement :522-545` writes, `img.card = cardData`, `img.user = side`),
  `src` = the same art URL (browser cache shared with the texture load), wrapped in `.play-container`/`.mat-holo`
  where apply-view does so today, so `closest('.mat-holo')`, `imageAnchor`, `hideDuring` and `findMatPickHit` keep
  their targets. `role="img"`, `aria-label` = name + zone + counters (accessibility tree).
- `containers.js`: when the flag is on, `selfContainerDocument`/`oppContainerDocument` are the two shadow roots and
  `selfContainer`/`oppContainer` the hosts (same export names; 43 importers unchanged). The 4 `documentElement`/`body`
  consumers (`click-events.js` and friends, grep `ContainerDocument.(documentElement|body|defaultView)`) take
  `root.host` instead. `docForSide` (`side-doc.mjs`) returns the roots.
- Registry: `getCardRegistry()` records keep `{ instanceId, element: mirrorImg, card, side, zone, container, holoCard }`,
  so every registry consumer (`advisory-animations.js:232`, `authoritative-dispatch.js:80`, `manual-card-dispatch.js:26`,
  `e2e-api.js:177`, `live-card-sources.mjs:23`, every mat-fx module) is unchanged. `apply-view.js` under the flag:
  `createOrUpdateCardElement` builds into the mirror roots (same code, `getZone` now resolves the root), and the
  overlay/stack/cover px positioning (`:597-627, :694-932, :1210-1294, :1462-1526`) is skipped (`if (board3dActive())`).
- Rect write-back: after each `applyModel` and on every rendered frame where a pose changed, `mirror.sync` writes
  `left/top/width/height` of each card's projected screen rect (axis-aligned bounds of the 4 projected corners) onto
  the mirror `<img>` (inline style), and the zone rects onto the zone `<div>`s. So `getBoundingClientRect` on any mirror
  node is the on-screen rect, and `visualRectOf` (no `frameElement`) returns it unchanged.
- UI state read back from the mirror (MutationObserver, attribute filter `class, style, data-mat-pick`): `.highlight`,
  `.selectHighlight` → `selected`; `.has-glow` + `--glow-rgb` → `glow`; `data-mat-pick`/outline → `matPick`;
  `style.visibility === 'hidden'` on the img or its `.mat-holo` → `hidden` (FX `hideDuring`, card focus source hide).
  The observer calls `scene.setUiState(instanceId, patch)` → `invalidate()`.

### D5 Input (pointer + raycast)
- `board-input.js` listens on the canvas: `pointerdown/move/up/cancel`, `dblclick`, `contextmenu`, `wheel`
  (pass-through), `pointerleave`. `hitTest(clientX, clientY)` → `{ instanceId, side, zone, index, mirrorEl, point }`
  for the top-most card mesh (cards are pickable; zone planes are invisible pick targets `zonePlanes[side][zone]`;
  the Lost Zone rail and `#stadium` keep their own DOM drop targets and are hit by DOM `elementFromPoint`).
- Click: `pointerup` within 6 px / 400 ms of `pointerdown` → `mirrorEl.dispatchEvent(new MouseEvent('click', { bubbles: true,
  composed: true, clientX, clientY, button }))`; two clicks within 350 ms also dispatch `dblclick`; right button →
  `contextmenu`. `identifyCard`, `imageClick`, `doubleClick`, `openCardContextMenu`, keybind selection and
  `findMatPickHit` run unchanged; the two document-level capture listeners (`mat-picker.js:272-303`, `rules-bridge.js:1570`)
  and `closePopups` read `event.composedPath()[0]`. The 500 ms card-focus click guard (`card-focus.mjs:53`) is untouched.
- Hover: a hit change calls `hoverPreview.setTarget(mirrorEl | null)`; `hover-preview-dom.mjs` gains that one exported
  seam (its internal `pointerover` path calls the same function). Mouse only as today (`pointerType === 'mouse'`).
- Drag: `pointerdown` on a card + 6 px movement → `beginDrag(hit)`: the card mesh lifts (`z + 24`, `drag-tilt.mjs`
  spring on pitch/roll driven by pointer velocity, shadow softens), `mouseClick` is filled by `identifyCard` on a
  synthetic `dragstart`-free path (`identifyCardFromHit(hit)` writes the same fields). On move: `hitTest` for the
  target (card → attach/evolve candidate, zone plane → zone), predicates ported from `drag.js:133-196` into
  `drop-router.mjs` `dropTargetFor(hit, dragging, state)` → highlight = glow on the target card/zone plane
  (`zonePlanes` get a glow material; `#board` gets `.board-drop-ready` written to its mirror div so `drop-zone.mjs`'s
  `playsOntoBoard` logic is reused). On `pointerup`: `routeDrop(target, mouseClick, systemState)` → the same three
  calls as today (`retreat`, `moveToDeckTop` after `manualDeckActionAllowed`, `moveCardBundle(… { moving, target })`);
  no target or `Escape`/`pointercancel` → fly back (180 ms tween). Spectators: `notSpectator` gate before `beginDrag`.
  Top-document drops (Lost Zone rail, `#stadium`): `document.elementFromPoint` under the pointer → `data-drop-zone`
  path from `drag.js:303-314`.
- Keybinds: unchanged; `.selectHighlight`/`.highlight` on mirror imgs render as the selection ring.
- Flip board (`flip-board.js`): under the flag, swaps `nearSeat` in the model and the two shadow hosts' `self`/`opp`
  classes (so `systemState.initiator` keeps reading a class until phase A3 makes it a field); the scene re-poses.

### D6 Rect providers and the FX bridge (phase E)
- `board-rects.js` exports `rectForInstance(instanceId)`, `pileRect(side, 'deck'|'discard'|'lostZone'|'prizes')`,
  `boardRect(side)`, `matRect()`; under the flag `image-logic/mat-fx.mjs rectForInstance` delegates to it, and the
  three iframe-element readers (`draw-scene.js:29`, `opp-play.js:33`, `shuffle-flight.js:27`) read `boardRect(side)`.
  Everything else keeps reading mirror rects through `visualRectOf`.
- `hideDuring` and `captureKnockoutGhost` (`knockout-flight.js:37`) work on mirror imgs (src + rect) unchanged; the
  scene hides the mesh while the mirror is hidden (§D4).
- Table shake (`combat.js:303`) → `scene.shake(offsets)` (camera offset tween) instead of translating `#battleMat`
  and the frames; one `if (board3dActive())` branch.
- In-card-DOM effects: `status-loop.js` → status loop plane (§D3); `tera-skin.js` → a Tera overlay material on the
  front group; `mountTcglFoil` → not mounted under the flag (foil is the material). Mega hex field (`entry.js:117`)
  → a plane on the table under the card instead of `#battleMatSurface` layers.
- Phase H ports card flights (draw, discard, KO, retreat/switch, opponent preview landing, evolve) to mesh tweens:
  each `*-pose.mjs` already returns `{ x, y, scale, rotate, opacity }` per t; the scene plays them on the clock and
  the plan returns the same hold. Sprite/canvas scenes (impact, evolve/devolve, Tera/Mega, status pops, banners,
  particles) stay 2D overlays for good.

### D7 Solo mode through the server (phase A)
- Server: `GameRoom` gets `solo = false`; `addSoloPlayer(socketId, username, deckLists: { p1, p2 })` seats `p1` and
  `p2` for one socket (`socketToPlayer.set(socketId, 'p1')`, `soloSeats = new Set(['p1','p2'])`); `seatFor(socketId,
  cmd)` returns `cmd.seat` when the room is solo and the seat is `p1|p2`, else the mapped seat (`handleClientCommand :252`,
  `resolveChoice :869`, `submitTurnOrderCall :522`, `submitTurnOrderChoice :626`, `markReady :417`, `peekDeck :401`).
  `getViewForSocket(socketId)` in a solo room returns `viewForSolo(state, near)`: `viewFor(state, near)` with
  `them.zones.hand` and `them.zones.prizes` replaced by the far seat's owner zones and `pendingChoice` = whichever
  seat's choice is open (`choiceSeat` field added). `shared/engine/view.mjs` gains `viewForSolo(state, nearId, opts)`
  (pure, tested). Public-lobby listing and spectators ignore solo rooms (`room-sweep.mjs` grace unchanged).
- Wire: `joinGame(roomId, username, isSpectator, seatToken, { solo: true })`; `cmd.seat?: 'p1'|'p2'`;
  `COMMAND_SCHEMAS` (`commands.mjs:25`) accept `seat`. `PROTOCOL_VERSION` → `2.2.0`.
- Client: the Solo tab (`header-buttons.js` / `p1Button`) joins `solo-<random>` with `solo: true` instead of
  `isTwoPlayer = false`; `systemState.isTwoPlayer = true`, `systemState.solo = true`, `systemState.nearSeat = 'p1'`.
  `emitCmd` (`cmd-emitter.js:158`) adds `seat` from the acting card's side (`side === 'self' ? nearSeat : farSeat`).
  Flip board in solo swaps `nearSeat` and requests a view (`requestView`). `systemState.initiator` becomes a plain
  field set by flip (A3), the CSS-class derivation removed.
- The legacy relay (`SERVER_AUTHORITATIVE=0`) keeps the iframe board; the 3D board requires authority and says so in chat.

### D8 Server card-art proxy
- `GET /api/card-image?url=` — same validation as `/api/mat-image` (`server.js:197`), host set = any host not in
  `CARD_ART_CORS_HOSTS` is allowed only if it is one of the hosts `cardArtSrc` can produce (`images.pokemontcg.io`
  variants, TCGdex, Limitless, ptcgsim.online, plus `custom` deck art hosts listed in `server/card-art-proxy-hosts.mjs`);
  10 s timeout; in-memory LRU of 200 bodies ≤ 2 MB each; `Cache-Control: public, max-age=86400`; `Access-Control-Allow-Origin: *`.

### D9 Flag, boot and fallback
```js
// board-flag.mjs
export const BOARD3D_KEY = 'ptcg-board-3d';
export function isBoard3dRequested(search = '', storage = null, { defaultOn = false } = {}) {}
// board3d.js
export function initializeBoard3d({ host = document.getElementById('board3dHost') } = {}) {} // returns { active:boolean, reason:string|null }
export const board3dActive = () => active;
```
- `index.ejs`: `<div id="board3dHost"><canvas></canvas><div id="boardMirror">…</div></div>` before the iframes; the
  iframes stay in the markup until phase G.
- Fallback reasons: `no-webgl2`, `context-lost-twice`, `flag-off`, `legacy-netcode`; each logs one console line and
  (except `flag-off`) one chat line.

## Edge cases & failure modes — the completeness contract; Builder ticks every row
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | View with no cards (pre-deal) | Table, empty piles, zero-count labels; no meshes in the pool | [ ] board-model test `empty view` |
| 2 | Malformed view (missing `you`/`them`, card without `instanceId`) | `boardModelFrom` returns the previous model unchanged and logs once; scene untouched | [ ] board-model test `malformed` |
| 3 | Redacted card (`{ instanceId }` only) | Back face, `alt="Face-down card"`, no counters, not hoverable for preview | [ ] board-model test `redacted` |
| 4 | Face-down board card, later revealed | Back → front flip tween (300 ms) on the clock; `revealed` toggles `face` | [ ] model diff test + lab check |
| 5 | Hand of 0 / 1 / 15 / 40 cards | Fan spread 0° / centred / overlapping to fit width / clamped overlap, still hoverable | [ ] hand-fan boundary tests |
| 6 | Bench 0–5, >5 (legacy decks allow it) | 5-column grid; the 6th+ card continues the row at the same pitch | [ ] board-layout test |
| 7 | Deck count 0 / 1 / 60 / 90 | No pile mesh / 1 layer / 12 layers / 12 layers clamped (`deckStackLayers`) | [ ] pile-stack test |
| 8 | Evolution stack: Basic+Stage1+Stage2 + 2 Tools + 4 Energy | Top Stage visible, lower stages offset 1/15 width, tools 1/6, energy tokens along the bottom edge per `planEnergyTokenRow` | [ ] board-model stack test |
| 9 | Duplicate hand cards (design 014 stacks) | One fanned slot per stack with a count plane; click opens the stack as today | [ ] model handStacks test |
| 10 | Same view version twice / older version | Second apply is a no-op (`stateVersion` guard already in applyView) | [ ] existing apply-view guard test |
| 11 | Two views 20 ms apart during a pose tween | The second applyModel retargets the running tween; no snap to start | [ ] card-mesh tween retarget test (clock-driven) |
| 12 | Texture 404 / CORS failure / proxy timeout | Back + name label, retry once after 5 s, never throws | [ ] gl-textures test with failing loader |
| 13 | WebGL2 unavailable at boot | `initializeBoard3d` returns `{ active:false, reason:'no-webgl2' }`, iframe board untouched | [ ] board3d boot test (stub) + `WEBGL=0` rec |
| 14 | Context lost once / twice | Rebuild scene from the last model / fall back to the iframes with one chat line | [ ] gl-renderer onLost test |
| 15 | Window resize, DPR change mid-game | Camera + renderer resize; mirror rects rewritten; no layout thrash (one frame) | [ ] camera test for two viewports + lab |
| 16 | Hidden tab | Tweens pause, no renders; on visible, model re-applied once | [ ] scene clock test |
| 17 | Drag started, pointer leaves the canvas | Drag continues over HTML targets (rail, stadium) via `elementFromPoint`; `pointerup` anywhere ends it | [ ] input test with synthetic events |
| 18 | Drag cancelled (Escape, `pointercancel`, right-click) | Fly-back tween; no command emitted; highlights cleared | [ ] drop-router returns null + input test |
| 19 | Drop on own card (attach/evolve) vs zone vs cover | `routeDrop` returns `move` with `target`, `move` without, `deckTop` respectively (same gates as drag.js) | [ ] drop-router table tests (one per drag.js branch) |
| 20 | Drop while spectating / not your turn gating | `notSpectator` blocks `beginDrag`; rules gates unchanged (server refuses) | [ ] input test |
| 21 | Card removed by a view while its card focus / preview is open | Existing auto-close paths fire (`card-focus.mjs:226-239`); mesh released; mirror img removed | [ ] e2e inspector script |
| 22 | FX hides a card (`hideDuring`) then the card moves zones in the next view | Mirror visibility carried on the new placement until the backstop restores it | [ ] mirror observer test |
| 23 | Knockout: card leaves the view before the KO scene | `handleBeforeApply` captured the ghost from the mirror (src + rect) before the diff — unchanged path | [ ] fx-preview rec-ko |
| 24 | Mat change mid-game (`changePlaymat`) | Texture swap + relayout from the new profile; cards re-pose | [ ] table-mesh test with two profiles |
| 25 | Flip board / spectator POV switch / broadcast | `nearSeat` swap re-poses everything; broadcast camera; drags blocked for spectators | [ ] camera broadcast test + spectator e2e |
| 26 | `fx-off` / reduce-motion | Pose changes snap (0 ms); overlays still drawn | [ ] scene test with `motionReduced()` stubbed |
| 27 | Mat pick with 1 / 6 candidates, Escape, Confirm | Outlines on the candidates' meshes; `__ptcg.pick` finds `data-mat-pick` on the mirror imgs and clicks them | [ ] mat-pick e2e via `__ptcg` |
| 28 | Solo: command for the far seat | `cmd.seat='p2'` accepted; `p1` seat untouched; view returns both hands | [ ] room solo tests |
| 29 | Solo: `seat` on a non-solo room / invalid seat | Ignored, socket's mapped seat used; invalid seat refused with `bad_seat` | [ ] room test |
| 30 | Solo: pending choice for the far seat | `viewForSolo` exposes it; the picker opens; `resolveChoice` carries the seat | [ ] view test + e2e |
| 31 | Legacy relay (`SERVER_AUTHORITATIVE=0`) with the flag on | Fallback `legacy-netcode`; iframe board | [ ] boot test |
| 32 | 60 foil cards on screen | One material per foil record shared by meshes; GPU ≤ 150 MB on a discrete GPU (measured in the lab) | [ ] lab measurement recorded in Deviations |
| 33 | Non-CORS card art host | Proxy rewrite; disallowed host → 403 → back + label | [ ] card-art-hosts test + server proxy test |

## Test plan
- Unit (`node --test`, no three): board-flag, board-layout (vs today's CSS var math for the `sim` profile and one mat
  profile), board-camera (vs `projectFromPivot`), board-model (empty, malformed, redacted, stacks, tokens, hand
  stacks, diff), hand-fan, pile-stack, overlay-plan, drop-router (one test per `drag.js:256-456` branch), gl-textures
  (injected loader), card-art-hosts, `viewForSolo`, room solo seats, `/api/card-image` handler (injected fetch).
- Mirror/observer tests under jsdom (the existing jsdom pattern: `hover-preview-dom.test.mjs`): attribute → uiState.
- e2e: `test-card-inspector-e2e.mjs`, `fullview-test.mjs`, `spectator-view-test.mjs` rewritten to query
  `document.getElementById('selfBoard').shadowRoot` (Playwright locators pierce open roots); a new
  `scripts/e2e/board3d-drag-test.mjs` (hand → bench, attach, evolve, retreat via synthetic pointer events on the canvas,
  asserting through `__ptcg.zone`); `pnpm test:2p` on the solo room (both seats from one page).
- Visual: fx-preview `capture-board.mjs` / `rec-*.mjs` pointed at the mirror; frozen frames of draw, KO, evolve, attack
  on the 3D board vs the iframe board; the user checks look and feel on localhost at every phase gate (STATE rule).
- Gates: `pnpm gates` says REQUIRED for netcode (phase A) → full `pnpm test`; `pnpm audit:oracle` not needed (no engine change).

## Migration / rollout
- Phases land on `main` behind `ptcg-board-3d` (default off) through phase F; phase G flips the default on after the
  user's parity sign-off, keeps `ptcg-board-3d=0` as the kill switch for one release, then deletes the iframe path.
- Revert path before G: flag off. Revert path after G: revert the G3 deletion commit (the iframe shells, their CSS,
  `iframe-rect.mjs`, `apply-table-tilt.js`, `table-tilt.mjs`'s CSS parts, `playmat-anim.mjs`, the CSS tests) — one
  commit, listed in its message.
- Data: none. Protocol: `2.2.0` adds optional `seat` and the solo join option; old clients ignore both.

## Work plan — slices ≤1 session, each leaving the repo green
Phases run in order A → G; H after the user signs off G. Within a phase, slices are sequential unless marked ∥.
Every slice: `pnpm test:changed`, lint touched files; A-slices and G-slices: full `pnpm test`.

| Slice | Files (create / modify) | Signatures & data shapes | Test cases: input → expected | Rulings used (source) | Green when |
|---|---|---|---|---|---|
| A1 solo view | create `shared/engine/view.mjs` `viewForSolo`; tests `shared/engine/__tests__/view-solo.test.mjs` | `viewForSolo(state, nearId, { attackExtrasFor }) → view` = `viewFor(state, nearId)` with `them.zones.hand/prizes` from the far owner, `pendingChoice` of either seat, `choiceSeat:'p1'|'p2'|null`, `solo:true` | 2-seat state with hidden hands → both hands full; far pending choice → exposed with `choiceSeat`; nearId unknown → null | n/a | tests green |
| A2 solo room | modify `server/game/room.mjs` (`solo`, `addSoloPlayer`, `seatFor`, `getViewForSocket`), `server/server.js` (`joinGame` 5th arg `{ solo }`, `cmd.seat`, `resolveChoice.seat`, turn-order seat), `shared/engine/commands.mjs` (`seat` in schemas, `PROTOCOL_VERSION='2.2.0'`); tests `server/game/__tests__/room-solo.test.mjs` | `addSoloPlayer(socketId, username, { p1: deckList, p2: deckList }) → boolean`; `seatFor(socketId, { seat }) → 'p1'|'p2'|null` | solo join seats both; `cmd` with `seat:'p2'` moves a p2 card; `seat` on a non-solo room ignored; invalid seat → `{ ok:false, reason:'bad_seat' }`; spectator cannot join a solo room | n/a | tests green; `pnpm test` green |
| A3 solo client | modify `header-buttons.js`, `socket-event-listeners.js` (join path, `systemState.solo/nearSeat`), `cmd-emitter.js` (`seat`), `flip-board.js` (nearSeat swap + `requestView`), `global-variables.js` (`initiator` as a field set by flip), `server-rendered-zones.mjs` (`legacyDomSuppressed` → `serverAuthoritative`); tests `cmd-emitter.test.mjs`, new `solo-seat.test.mjs` | `seatForSide(side, nearSeat) → 'p1'|'p2'`; `systemState.solo:boolean`, `nearSeat:'p1'|'p2'` | self card → near seat; opp card → far seat; flip swaps; initiator no longer reads a class (grep `classList.contains('self')` in global-variables = 0) | n/a | `pnpm test:2p` + a solo Playwright run (`scripts/e2e/solo-authority-test.mjs`, new) green |
| B1 gl helpers + flag + lab | create `setup/gl/gl-renderer.js`, `gl-textures.js`, `card-art-hosts.mjs`, `board3d/board-flag.mjs`, `dev/board-lab.html`; modify `server/server.js` (serve `/dev/board-lab` like attack-fx-lab, `/api/card-image`), `index.ejs` (`#board3dHost`) ; tests `board-flag.test.mjs`, `card-art-hosts.test.mjs`, `gl-textures.test.mjs`, `server/__tests__/card-image-proxy.test.mjs` | `createRenderer({ canvas, onLost }) → { renderer, resizeTo(host), dispose() } | null`; `acquireTexture(url, { colorSpace, loader }) → Promise<Texture>`; `release(url)`; `textureUrlFor(src) → string` (proxy rewrite); `isBoard3dRequested(search, storage, { defaultOn })` | `?board=3d` → true; storage `'1'` → true; `'0'` wins over query; non-verified host → `/api/card-image?url=…`; proxy: disallowed host → 403, timeout → 504, cache hit served | n/a | tests green; lab page renders a lit test card on localhost (user) |
| B2 layout + camera ∥ | create `board3d/board-layout.mjs`, `board-camera.mjs`; tests | `flatLayout(profile, { w, h }) → { self, opp, stadium }` rects `{ x, y, w, h }` in flat px (y from the near edge); `cameraFromCssTilt({ viewportW, viewportH, tiltDeg=12, perspectivePx=1400, nearHalf:{w,h}, broadcast=false }) → { fov, aspect, position:[x,y,z], target:[x,y,z], up:[0,0,1], near, far }`; `projectToScreen(camera, point) → { x, y }` | sim profile at 1920×1080: active rect equals today's CSS vars (from `layoutToCssVars` evaluated in px, tolerance 0.5 px); seam corners project to `projectFromPivot` ± 0.5 px; broadcast rotates 90° | n/a | tests green |
| B3 board model ∥ | create `board3d/board-model.mjs`, `hand-fan.mjs`, `pile-stack.mjs`, `overlay-plan.mjs`; tests | §D2 signatures; `handFanPoses(count, opts) → { x, y, z, yawDeg, lift }[]`; `pileLayers(count) → number`; `counterPlan(card) → { tier, digits, anchor:[u,v], size }|null` | edge rows 1–9; token row for 2 basic + 1 double energy = `planEnergyTokenRow` output; diff of two views = exact added/removed/moved sets | energy-as-token rule: existing `planEnergyTokenRow` (design 071) | tests green |
| C1 table | create `board3d/table-mesh.js`, `board-scene.js` (table only), `board3d.js` (boot, fallback); modify `front-end.js` (call after `initializeMatLayout`) | `createBoardScene({ host, renderer, camera }) → { applyModel, invalidate, rects(), hitTest, shake, dispose, clock, setUiState }`; `setMat({ halves:[img,img], fit, aspect })`; `matUvFor(fit, aspect) → { u0,v0,u1,v1 }` | `matUvFor('contain', 1.94)` letterboxes; `'100% 100%'` fills; boot with no WebGL2 → `{ active:false, reason:'no-webgl2' }` | n/a | lab shows the current mat on the tilted table matching the iframe board within 2 px at the seam (screenshot pair in `.agent/scratch/`) |
| C2 cards | create `card-mesh.js`, `card-geometry.mjs`; modify `board-scene.js`; tests `card-geometry.test.mjs` | `cardMeshPool({ scene, textures }) → { acquire(id), release(id), setFront(id, { src|foilRecord }), setBack(id, src), setPose(id, pose, ms), setHidden(id, bool) }`; `roundedRectShapePoints(w, h, r, segs) → [x,y][]`; `CARD_UNITS = { w:6.397, h:8.9, t:0.064 }` | 64 points for segs=16; scale for width 120 px = 120/6.397 | card dims: design 067:30 (TCG Live card mesh) | lab: 60 cards (20 foil) at 60 fps, GPU ≤ 150 MB (Chrome task manager), numbers recorded in Deviations |
| C3 piles, prizes, stadium, counts | modify `board-scene.js`, create `overlay-meshes.js` (count labels only) | `setPiles(model.piles)`; `textPlane(text, { px }) → Mesh` | counts 0/1/60 per edge row 7; stadium facing toggles yaw 180° | n/a | lab check (user) |
| C4 hand fan | modify `board-scene.js` (hand group), `hand-fan.mjs` hover | `setHover(instanceId|null)` lifts; opponent hand = backs | 7-card fan matches the TCG Live screenshot arc (user eyeball) | n/a | lab check (user) |
| C5 in-scene overlays | modify `overlay-meshes.js`; status-loop frames from `status-loop.mjs` | `syncOverlays(id, placement)`; `statusLoopTexture(key, clock) → CanvasTexture` | counter 30/120/250 → tiers per `DAMAGE_COUNTER_TIERS`; poison+burn → both badges; rotation conditions rotate the mesh | condition visuals: existing `ROTATION_CONDITIONS`, `status-loop.mjs` | lab check (user) |
| C6 mirror + containers | create `board-mirror.js`; modify `global-variables/containers.js`, `side-doc.mjs` callers (none if roots work; verify), `apply-view.js` (`board3dActive()` skips px positioning), `click-events.js` (+3 `documentElement` users → `root.host`), `mat-picker.js:272`, `rules-bridge.js:1570` (`composedPath`); tests `board-mirror.test.mjs` (jsdom) | `createBoardMirror({ hostSelf, hostOpp }) → { roots:{self,opp}, sync(model, rectsById), observe(onUiState), dispose }`; mirror img attributes = `createOrUpdateCardElement` set | `getZone('self','active').element` is the root's `#active`; `.highlight` added → `onUiState({ selected:true })`; `style.visibility='hidden'` → `hidden:true`; `getElementById('deckCover')` non-null | n/a | jsdom tests green; `pnpm test` green (apply-view tests pass with the flag off) |
| C7 wire the view | modify `board3d.js` (subscribe: wrap `applyView` options → `boardModelFrom` → `applyModel` → `mirror.sync`), `socket-event-listeners.js` (pass `board3d` hooks), `apply-view.js` (`board-view-applied` still fires) | `board3d.onViewApplied(view, selfPlayerId)` | a 2P Playwright run under the flag renders both boards; `__ptcg.zone` counts match the mirror img counts | n/a | `pnpm test:2p` with `BOARD3D=1` green; user sees a full game on localhost |
| D1 pointer + click | create `board-input.js`; modify `hover-preview-dom.mjs` (+`setTarget`), `hover-preview.js` | `createBoardInput({ canvas, scene, mirror, hover }) → { dispose }`; `hitTest(x, y) → Hit|null` | click → `mouseClick.cardInstanceId` set; dblclick → inspector opens; right-click → `#cardContextMenu` at the mesh rect; hover → preview after dwell | n/a | inspector e2e (rewritten in F1) passes; user check |
| D2 drag | create `drop-router.mjs`; modify `board-input.js`, `drag.js` (export the gates it keeps: `manualDeckActionAllowed`), `drop-zone.mjs` (reads mirror `#board`) ; tests `drop-router.test.mjs` | `dropTargetFor(hit, dragging, { initiator, rulesEnabled }) → { kind:'zone'|'card'|'cover'|'rail'|'stadium', side, zone, instanceId|null } | null`; `routeDrop(target, mouseClick, systemState) → { kind:'retreat'|'deckTop'|'move', args:any[] } | null` | one test per `drag.js:256-456` branch (active→bench = retreat; hand→deckCover = deckTop gated; hand→active card = move with target; opp zone while not initiator = null) | n/a | `board3d-drag-test.mjs` (new) green; user check |
| D3 selection, glow, mat pick | modify `overlay-meshes.js` (rings/outline), `board-mirror.js` (observer attributes) | `setUiState(id, { selected, glow, matPick })` | mat pick via `__ptcg.pick` works under the flag | n/a | `test-card-inspector-e2e.mjs` mat-pick step green |
| D4 focus, preview, menu, popups | modify `card-focus.mjs` (`hand-lowered` → `scene.setHandPose('lowered')`), `full-view.js` (source hide → mirror), `click-events.js:201-245` (menu placement reads the mirror rect), move the four zone popups out of the iframes into `index.ejs` + `index.css` | `scene.setHandPose('normal'|'lowered')` | focus flight starts at the mesh's screen rect (±2 px, e2e boundingBox) | n/a | inspector + fullview e2e green |
| E1 FX bridge | create `board-rects.js`; modify `image-logic/mat-fx.mjs` (`rectForInstance` delegates under the flag), `draw-scene.js:29`, `opp-play.js:33`, `shuffle-flight.js:27` (`boardRect`), `combat.js:303` (`scene.shake`), `entry.js:117` (hex field plane) | `rectForInstance(id) → DOMRect-like|null`; `pileRect(side, zone)`; `boardRect(side)`; `scene.shake(offsets[])` | fx-preview recs: draw, discard, KO, evolve, attack-hit, status, Tera, Mega, coin on the 3D board (frames in `.agent/scratch/074/`) | n/a | all 41 scenes play (checklist in Deviations); user check |
| E2 in-card effects | modify `status-loop.js` (no DOM under the flag; frames via C5), `tera-skin.js` (overlay material), `hydrate-holo.js` (skip `mountTcglFoil` under the flag) | `setTeraSkin(id, palette|null)` | Tera skin persists across views; foil cards show the shader on the mesh | n/a | fx-preview rec-tera + foil-shot on the 3D board |
| F1 e2e + captures | modify `scripts/e2e/test-card-inspector-e2e.mjs`, `fullview-test.mjs`, `spectator-view-test.mjs`, `.claude/skills/fx-preview/*.mjs` + `rec/*.mjs`, `e2e-api.js` (+`cardRect(instanceId)`, `boardMode()`) | `__ptcg.cardRect(id) → { left, top, width, height }|null`; `__ptcg.boardMode() → '3d'|'iframe'` | each script passes with the flag on and off | n/a | all listed scripts green both ways |
| F2 unit test moves | split `apply-view.test.mjs` DOM-positioning cases behind a `boardMode` seam; leave the 7 CSS tests (deleted in G3) | — | `pnpm test` green with no skipped tests | n/a | `pnpm test` green |
| G1 parity sign-off | `.agent/designs/074-three-board.md` §Deviations: the user's localhost checklist (every zone, every FX, drag paths, pickers, spectator, solo, flip, resize, mat change) | — | — | — | user writes "parity OK" in chat |
| G2 default on | modify `board-flag.mjs` (`defaultOn: true`), `index.ejs` (iframes `hidden` by default) | — | boot test: no query/storage → 3D | — | `pnpm test` green; deploy check on Render |
| G3 delete the iframe path | delete `client/self-containers.html`, `opp-containers.html`, `css/self-containers.css`, `opp-containers.css`, `playmat-anim.mjs`, `apply-table-tilt.js`, `iframe-rect.mjs` (keep `visualRectOf` as a plain-rect helper in `board-rects.js`), `table-tilt.mjs` CSS parts (keep `projectFromPivot` for the camera test), `card-pop.mjs:159-204` iframe mappers, the 7 CSS tests, `index.ejs:1169-1188`, `index.css` iframe rules; modify `containers.js` (roots only), `get-zone.js` docs | — | `grep -rn "contentDocument\|frameElement\|selfContainer\b" client/src` = 0 outside the mirror | — | `pnpm test` green; `pnpm gates`; user check; DECISIONS/MAP/STATE in the landing commit |
| H1 card flights | modify `card-flight.js`, `draw-scene.js`, `ko-scene.js`, `lifecycle.js` (retreat/promote), `opp-play.js` landing: play `*-pose.mjs` poses on meshes via `scene.tween(id, poseFn, ms)`; overlays no longer clone imgs for these | `scene.tween(instanceId, poseFn:(t)=>pose, ms) → Promise` | holds unchanged (`HOLD_MS`); fx-preview frames show the mesh moving, no 2D clone | n/a | recs green; user check |
| H2 card focus mesh | modify `card-focus.mjs`: the lifted card is the mesh (`scene.lift(id, focusPose)`), inspector chrome stays HTML | `scene.lift(id, { rect, rotateXDeg }) → Promise`, `scene.unlift(id)` | inspector e2e boundingBox within 2 px of `focusRect` | n/a | e2e green; user check |
| H3 TCG Live camera | `board-camera.mjs` `cameraTcgLive()` (FOV 20°, y=183 pose from design 067:30) behind a settings toggle | `cameraPreset:'tilt12'|'tcgl'` | project test for both presets | camera: design 067:30 | user check |

Banned in a slice row: "decide", "TBD", "as needed", "appropriate", "handle edge cases", "etc.".

## Deviations (Builder appends here during build)

### H1 (a: API + draws; b: KO, retreat/promote, opp Trainer landing)
- `scene.tween(instanceId, poseFn, ms, { ease })`: pose `{ rect, rotateZDeg, tiltXDeg, lift, flipDeg }` in viewport
  px (`flight-pose.mjs` `flightPlacement` → position/quaternion/scale on the plane z = lift; `board-camera.mjs`
  `screenToPlane` is the inverse of `projectToScreen`). While a tween runs the model pose is suspended and the mesh is
  forced visible; after t = 1 it stays 100 ms then the model pose resumes (end flights at the model rect). `card-flight.js`
  `playMeshTrack({ instanceId, rect, pose, duration, delay, lift })` maps a 2D track to it (lift rises/falls over the
  first/last 15 %); `meshCanFly(id)`. `scene.rects()` now reports every posed card, hidden or not (a draw card held
  hidden by `draw-flight-source` had no rect, so `handSpotOf` found no target and the draw skipped its flight).
- Draws (own spread → hand, opp face-down deck → hand) fly the mesh; no clone, no fade. Differences to the old clone:
  the spread preview lies in the table plane (not screen-facing); a small pop when the landed card takes its fan yaw.
  `.fx-draw-scene*` rules in mat-fx.css are now unused by draws.
- H1b: KO flies the mesh (clone fallback via `meshCanFly` when the view already buried the card; stars, held ghost, pile
  catch and streak stay HTML — `playTrailTrack`); retreat/switch slide the whole stack on meshes; promote slides Bench →
  Active (`origins.mjs` now captures `pokemonPromoted`); the opp Trainer's placing leg flies the mesh after the HTML
  preview hold (`hideDuring` kept so the real card does not show at its spot during the preview). Known: retreat/promote
  run after the 200 ms settle hold, so the mesh is already at its new spot and pops back to the origin before sliding
  (fix needs the moved card held hidden from before the diff: `handleBeforeApply`, outside the three scenes).
- Verification here: node tests for the pure parts; `test:board3d-overlays`, `test:board3d`, `test:board3d-input/drag/
  pick`, `test:inspector`, `test:fullview` green; a draw probe (solo deal) saw hand meshes move through the samples with
  zero `.fx-overlay` clones. The rec-draw capture's fabricated views do not show cards on the 3D board (F1 limit), so it
  proves the calls run, not the look. Visual sign-off is the user's.

### H2
- `scene.lift(id, { rect, tiltXDeg, lift, rotateZDeg?, flipDeg?, ms = 180, ease? })` flies the mesh to the pose and
  HOLDS it (re-fitted every frame, so a camera change keeps the rect; model pose, hover and fan re-poses do not move it;
  forced visible); `scene.unlift(id, { ms, ease? })` flies back to the model pose and releases; `inspect().focusLifted`
  (`lifted` already meant the drag lift). `rects()` keeps reporting a lifted card at its board slot, so the mirror img
  and `viewportRectOf(sourceImg)` stay where the card came from. `flightPlacement` gained `fit: 'leaned'` (the leaned
  face fits the rect; the old fit overshot a square-on card by ~6 %).
- card-focus.mjs: mesh mode when the scene has a pose for the card (`card-focus-mesh.mjs` `focusMeshId`/`focusMeshPose`:
  `tiltXDeg` = −table tilt, `lift` 0.3 × rect height, the focus flight's own easing; close mid-flight uses the reversed
  curve). The HTML host keeps its box (the inspector chrome is laid out from it) with the card art hidden; a new
  `.card-focus__dim` box-shadow with a hole at the focus rect replaces the full-screen dim, which would have darkened
  the mesh under the HTML layer. No mesh (legacy card) → the HTML flight as before.
- Inspector e2e: 5e accepts `focusLifted`, 8c waits for it to clear, new 6d (mesh corners within 2 px of `focusRect`)
  and 14h (resize re-fit). Known: holo tilt on the HTML card is off in mesh mode; a focused card dropped by a view
  while open shows no face (the focus closes on turn change and attack, so not handled).

### H3
- `cameraTcgLive({ viewportW, viewportH, nearHalf, cardHeightPx })`: eye above the seam centre looking straight down, FOV
  20°, nominal distance 183 × cardH / 8.9 (design 067:30), scaled up to the smallest distance that fits the whole table
  (hands included) in the viewport: ×1.026 at every viewport tested (height binds). Setting `ptcg-camera-preset`
  (`'tilt12'` default | `'tcgl'`) through fx-settings (`setCameraPreset`), checkbox "TCG Live camera" next to the hover
  preview one; `board3d.js relayout()` picks the preset and snaps on change (subscribed to `onFxSettingsChanged`).
  Not done: hand cards keep the tilt layout's size under the top-down camera. `test:board3d-boot` 4a–4c cover the live
  toggle (far Active as tall as the near one within 1 % under tcgl; back to tilted).

### G3
- Built as five sub-slices (a sizing, b documents/sheets, c geometry, d core, e scattered refs; notes in
  `.agent/scratch/074/g3/G3*.md`), four in parallel on disjoint files, then d. Deleted: `self-/opp-containers.html`,
  `css/self-/opp-containers.css`, `playmat-anim.mjs`, `apply-table-tilt.js`, `iframe-rect.mjs`, `board-flag.mjs`,
  `double-click-zoom.mjs`, `table/resizer.js` (split-resizer handles; `#selfResizer/#oppResizer` too), the card-pop
  iframe mappers, `turnOfMatrix`, `screenShakeOffsets`, and the CSS tests that only read the deleted sheets
  (`bench-grid-css`, `board-drop-glow-css` whole; cases listed in G3b.md). `table-tilt.mjs` keeps only what
  board-camera/card-focus import (`projectFromPivot`, `seamShiftPx`, `tiltTransforms` → `{ mat }` only).
- Deviations from the row: `visualRectOf` moved to `board-rects.js` as a plain rect, but nothing imports it any more
  (fx-preview went 3D-only), so it is an export without a caller. `containers.js` builds the mirror unconditionally
  (no WebGL2 probe: the scene's own init reports). **No fallback board exists**: a page that cannot run the 3D board
  (no WebGL2, three failed to load, context lost twice, legacy relay netcode) gets `console.error` and one chat line
  `3D board unavailable: <reason>; this browser needs WebGL2`, and the game keeps running on the hidden mirror DOM.
  `?board=iframe` / stored `ptcg-board-3d` are ignored. The legacy relay (`SERVER_AUTHORITATIVE=0`) therefore has no
  visible board (its DOM renders into the hidden mirror); `test:2p` result recorded below.
- `click-events.js`: every zone takes the zoom path (the legacy `#fullImage` overlay is gone); `close-popups.js`
  dropped its `#fullImage` guards. `native-deck-builder.js` sleeve repaint read `contentWindow.document` and silently
  returned on the mirror: it now reads the mirror roots (fix). `flip-board.js` swaps the host classes through
  `boardMirror.hosts`; `board-flip-state.mjs` `swapIframes` → `swapSides`.
- Now orphaned (nothing imports them; the scene draws those overlays itself): `mat-ambient.css`, `status-marker.css`,
  `energy-token.css`, `damage-counter.css`, `mat-coin.css` (+ `fx-kill-switch-css.test.mjs` reads three of them), the
  `.full-view` panel code in `full-view.js`, the `.hover-gutter-probe` in `hover-preview-dom.mjs`, `index.css` `.self`/
  `.opp` iframe box rules (overridden by `#boardMirror > #selfBoard/#oppBoard`). Cleanup candidates, not G3's.
- Exit test: `grep -rnE "contentDocument|contentWindow|frameElement" client/src scripts` = 0 outside `board-mirror.js`
  (the names `selfContainer`/`oppContainer` stay as the mirror host bindings). Harness results: see the commit message.
- Incident: one builder ran `git stash`/`git stash pop` in the shared worktree mid-build; every other builder re-checked
  its edits afterwards and found them intact. Briefs now say never to run stash/checkout/reset.

### G2
- `isBoard3dRequested` defaults `defaultOn` to true, so the three callers (front-end.js, containers.js, board3d.js)
  need no change. The iframes carry `hidden` in `index.ejs`; `containers.js` clears it on the page that keeps the
  iframe board (no mirror), and a late fallback reloads onto `?board=iframe`, which takes that path.
- Scripts whose iframe mode meant "no query" (`fullview`, `spectator`, `inspector`, fx-preview `board-mode.mjs`) now
  send `&board=iframe`; the legacy scripts with no board query (`test:solo`, `test:flip` verified) run on the 3D
  board and pass. Boot test: `scripts/e2e/board3d-boot-test.mjs` (`pnpm test:board3d-boot`): no query → 3D, iframes
  hidden; `?board=iframe` → iframes shown; stored '0' → off.
- G1 sign-off: the user wrote "Appears to be correct" (2026-10-18). Deploy check on Render is the user's.

### G1 — localhost parity checklist (user sign-off; reply "parity OK" or list what differs)
Run `pnpm start`, open `http://localhost:4000/?board=3d` (or set `localStorage.setItem('ptcg-board-3d','1')`); a second
tab without the flag shows the iframe board for side-by-side comparison. `?board=iframe` beats the stored flag.
1. Table and zones: mat art and the 5 layout profiles (change the mat in the picker), every zone outline and count label,
   deck/discard/Lost Zone/prize piles with the right heights, stadium slot, hand fan near and far, 12° tilt matching the
   iframe board.
2. Cards: fronts, backs, face-down prizes and far hand, foil cards (needs a real GPU: colour and frame budget, edge row 32),
   damage/status/ability counters, Tera skin, status idle loop, stack badges, evolution stack order.
3. Input: click selects, double-click opens focus (hand lowers, flight from the mesh), right-click menu on a card and on
   the Stadium, hover preview after the dwell, hand card lifts on hover, keyboard `v`, `e`/`q` attach mode, Escape paths.
4. Drag: hand → Active/Bench/discard/Lost Zone/prizes/deck, Bench ↔ Active, attach Energy/Tool by dropping on a Pokémon,
   drop on empty table returns the card, drop on a far-seat zone refused, drag cancelled by right-click.
5. Popups and pickers: deck/discard/Lost Zone viewers, look panel, attached-cards carousel, mat pick (both boards),
   server card select, prize take prompt, coin ceremony.
6. FX (play a scripted game or use fx-preview `PTCG_BOARD=3d`): draw own/opp, shuffle, discard flight, KO, evolve/devolve,
   Tera/Mega entry, attack lunge + impact + shake, status apply/clear, prize take, trainer present, Stadium present, turn
   banner, ability banner, game over.
7. Modes: solo room (both seats one socket), flip board (near seat swaps; piles and hand re-pose), spectator view, 2-player
   room with a second browser, resize and devicePixelRatio change, tab hidden/shown (context loss recovery), reduced motion.
8. Fallback: a browser without WebGL2 reloads once onto the iframe board (`?board=iframe`, sessionStorage reason).

### F1
- API: `__ptcg.boardMode()` (`board3dActive()`) and `__ptcg.cardRect(id)` in `e2e-api.js`. 3D: `getBoardScene().rects()[id]`;
  iframe: the registry <img> through `viewportRectOf` (card-pop.mjs → iframe-rect.mjs `mapIframeRectToPage`, flip
  included). Deviation from the row: no new `iframe-rect.mjs` — one already exists with its test, so the pure part is only
  the choice and the null rule (`e2e-card-rect.mjs` `cardRectOf`/`usableRect`, test `e2e-card-rect.test.mjs`): null for a
  missing, empty or non-finite rect, and a 3D card the scene does not draw (hidden mesh) is null, never the <img>'s stale box.
- Every script reads the board through `window.__boardRoot(side)` (the iframe's document, or the mirror's shadow root),
  installed with `addInitScript`, and takes geometry from `cardRect`. `PTCG_BOARD=3d` adds `&board=3d` and SwiftShader's
  flags; default `iframe`. `CHROMIUM_PATH` honoured everywhere. Scripts that needed a server (`test-card-inspector-e2e`,
  `spectator-view-test`, `fullview-test`) spawn their own on a free port (`PTCG_URL` reuses one).
- `test-card-inspector-e2e.mjs`: every check kept. Mode-aware: stamping stats/attachments and `clickActive` go through
  the board image (events built in that image's own window); `hand-lowered` is the iframe root class, or the mirror host
  class AND `scene.inspect().handPose` on 3D; "source hidden" is the DOM `visibility` AND (3D) `uiState.hidden`;
  real-click points are `cardRect` centres (settled, polled); 15* hover points are `scene.hitTest`-verified points on the
  card. Changed on 3D, with reasons: **10c** — the 3D Active sits beside the focus card, so a double-click on it never lands
  on an attack panel; the second click is aimed at the lowest payable panel (the list reveals upward, so it is hit-testable
  first) and `performance.now` is held at the open and moved 350 ms on, because the card is `visibility: hidden` until its
  flight starts one drawn frame after the open and SwiftShader frames are ~0.3-1 s apart (the 500 ms guard would be gone
  before the panel exists); **14** — waits for the flight (`playState finished`, `card-focus--open` is set at the flight's
  START) and for the resize to reach the page; **15c** — the canvas has no gutter probe (`appendProbe` is iframe-only), so
  it asserts `mode` is `edge*` and the preview does not overlap the hovered card. New: 4b (the Active has an instance id).
- `fullview-test.mjs`: rewritten, the old one needed `exported-state.json` on the legacy client and its checks were stale
  (a double-click on the own Active opens the focus view; the "View attached cards" menu item returns early under
  authority, I15; the preview spring does not overshoot). New flow: solo room, Basic in each Active, Energy attached by
  `moveCardBundle { moving, target }`, then `cardRect` against Playwright's own box for the same <img> (4c), a double-click
  zoom on the FAR Active (own Pokémon open focus/inspector, not the zoom) — flight starts on the card's rect ±2 px, pop
  enlarges > 1.8x and settles at scale 1, Escape closes, card back where it was — and `openAttachedCardsPanel` on the
  near Active (iframe: `.full-view`, enlarged > 1.8x, closes; 3D: the carousel with the Energy, no `.full-view`). Iframe
  board: the double-click is click/click/dblclick dispatched on the <img>, because a real click at the card's centre can
  land on the `.play-container` div over it (seen: the click reached `DIV.play-container`, no zoom). 3D: real mouse.
  The foil-under-cursor checks of the old script have nothing to run on (fixture cards carry no rarity → no `.mat-holo`):
  printed as a note, not asserted.
- `spectator-view-test.mjs`: hands are read through `__boardRoot(side)`; new 2b (board mode) and 2c (every near-hand card
  has a `cardRect`). `PW_CHROMIUM` still works beside `CHROMIUM_PATH`.
- fx-preview: new `board-mode.mjs` (mode, launch options, `openBoard`, offline `CARD_DIR`/`CARD_IMG` routes for
  images.pokemontcg.io, and page-side `window.__fxBoard`: `root`, `zoneRect` (iframe `visualRectOf`; 3D
  `scene.zoneRects()['<side>:<zone>']`), `pauseAll`, `stepTo` (skips the scene clock: stepping it back to 0 would rewind the
  card tweens), `pushView` (fabricated view through the real `applyView` + production advisory hooks), `imageOf`). A
  fabricated view with a hand, prizes, board cards and stubs lays out on the 3D board with no room joined (server
  authoritative is enough). `capture-entry`, `capture-board`, `rec-evolve/ko/discard/move/attack-hit/deck-reveal` need only
  rects; `rec-draw/opp-play/prize` faked <img>s inside the iframe zones, which the 3D board cannot draw, so on 3D they
  push fabricated views (`cardsDrawn` / `trainerPlayed` events through the production hooks; prize take calls the same
  fan/draw entry points over the mirror images). `rec-unboxing` (builder tab), `rec-attack-impact` (lab page) and
  `cut-move.sh` have no board: unchanged. SKILL.md: one paragraph on `PTCG_BOARD=3d` plus a line in the board-DOM bullet.
- Limits found, none hidden by the scripts: (1) card-pop.mjs `createSpring` steps by the real frame time without a cap.
  On a SwiftShader page (a step spans ~10-50 frames) the open pop rings (scale max 1.77, settles after ~10 s) and the
  RETREAT spring diverges (scale ran to -200000; `Escape` set `is-closing` but the overlay never left), so
  `fullview-test` on 3D holds Escape to "starts closing" and finishes with `closeCardPreview(null, true)`. A real GPU at
  60 fps is unaffected, but any long frame feeds the same integrator; clamping `dt` in `loop` is the fix (not my files).
  (2) `rec-attack-hit` needs a longer "types ready" window on 3D (shader links take seconds on SwiftShader; the iframe
  window of 600 ms made 3D fall back to the DOM dressing); `WEBGL=0` is refused on 3D (no WebGL, no board). `SPREAD=2` on
  the iframe board fails in this sandbox with the original script too (colorless prefab not ready within 600 ms,
  verified against `HEAD`): not changed. (3) Frame-time and trace probes (`rec-move`, `rec-deck-reveal`) read
  SwiftShader's ~0.3-1 s frames on 3D. (4) `capture-board` holo emulation (DOM moves on the iframe wrapper) is iframe-only;
  3D reports tera skins from `uiState`. (5) The sandbox has no TCGdex: `/api/tcgdex/...` 404s are logged, harmless.
- Status at hand-off. All eight scripts below are rewritten; none is left undone. Run by me before the stop order (full
  output tails in the report): the three harnesses, `PTCG_BOARD=3d` and default, 53/53, 24/24 (3D) and 23/23 (iframe),
  19/19 twice, all ALL PASS. fx-preview: every script ran to exit 0 in both modes EXCEPT `rec-attack-hit` on the iframe board,
  exit 1 in the last run ("the impact prefab did not play": the unchanged 600 ms ready window, flaky in this sandbox, passed
  once earlier; 3D passes with the 6 s window). NOT verified after the last edit: `e2e-api.js` now reads the mode through a
  module-level `currentBoardMode` instead of `this.boardMode()` (lint + unit test only). Frames and videos were only
  spot-checked by eye for tera entry, tera skins and the 3D KO/draw videos; `rec-prize`/`rec-opp-play` 3D runs prove the
  calls run, not that the scene looks right. Changed: `test-card-inspector-e2e`, `fullview-test`, `spectator-view-test`,
  `capture-board`, `capture-entry`, `rec-evolve`, `rec-ko`, `rec-discard`, `rec-draw`, `rec-opp-play`, `rec-prize`,
  `rec-move`, `rec-attack-hit`, `rec-deck-reveal`, `e2e-api.js`; new `board-mode.mjs`, `e2e-card-rect.mjs` (+ test).

### D4
- Popups: option (a), not the Work-plan row's move to `index.ejs`. The five panels (`#deck`, `#discard`, `#lostZone`,
  `#viewCards`, `#attachedCards`) stay in the mirror shadow roots, so `getZone(...).element`, `zone-buttons.js`,
  `close-popups.js`, `flip-board.js`, `lost-zone-panel.js` and apply-view keep resolving them by id, unchanged; (b)
  would have needed a patched `getElementById` and still missed every `root.querySelector`/observer/`containerContains`.
  The iframe sheets are NOT adopted: they zoom and tilt `#playfield` and add holo transforms, which would make zones
  the containing block of the position-fixed card twins and move them off their rects. New `css/board3d-panels.css`
  (linked into both roots) carries only the panel rules from self-containers.css, placed on the mat column (37.75 %)
  in the seat's half (`.self-view` bottom, `.opp-view` top), upright for both seats, grey panel kept (the iframe
  theme had made the pile viewers transparent; unreadable over the canvas). Holo layers are not styled in popups.
- Invisibility moved from `:host`/`#boardMirror` `opacity: 0` (a child cannot undo it) to every non-popup subtree.
  `sync` skips cards inside a popup (one filter) and no longer sizes `#deck`/`#discard`/`#lostZone` as their piles
  (covers/stack still are). It does not clear a rect a card brings from the board (clearing broke a card that passed
  through a legacy zone and came back with no sync after); the panel sheet's `!important` box rules outrank it.
- `close-popups.js`: a pile viewer's "empty" counts rendered cards too (`zone-popup-display.mjs`); under authority the
  legacy array is empty, so a Lost Zone viewer closed in the click that opened it, on both boards (fix, not 3D-only).
- `board-scene.js`: `rects()`/`hitTest` advance the tweens between frames, so with frames far apart a whole tween could
  start and end unseen by any frame; no `cardsMoving` frame, no mirror sync (a played card's mirror img kept its hand
  rect and card focus flew from there). The first frame after `applyModel` now reports `cardsMoving` to `onRender`
  (report only: it does not keep frames coming, so no render loop). D3's off-frame flag stays beside it: dropping it
  (the builder's first cut) left the hover lift stuck under headless SwiftShader (`test:board3d-input` 7a/7b), as the
  frame after an off-frame-finished tween no longer asked for the next one.
- Harness precondition: four Basics in the near hand (Active, discard, Lost Zone, Bench), not three — step 9a benched
  nothing on a three-Basic deal.
- Card focus needed no change (C6 already routes `hand-lowered` to `setHandPose`); verified: flight start = mesh rect,
  mesh hidden, hand down/up, picker auto-close. `openCardPreview` takes `sourceRect` from the <img> under the flag (a
  holo wrapper has no box there) and strips the mirror rect from its clone. `openAttachedCardsPanel` → carousel
  (`attached-carousel.js`, shared with `doubleClick`). `isDoubleClickZoomZone(zone, { board3d })`: every zone zooms,
  so `#fullImage` is never built. Stadium menu anchors on `scene.rects().stadium`.
- Harness `board3d-overlays-test.mjs`: (c) `v` opens `#deck` (keybinds.js), not `#viewCards`; it holds the client's
  legacy deck copy (the view sends a count), so the check is "one visible <img> per card the zone holds"; `#viewCards`
  is shown as viewDeck shows it (authority looks go to the picker). (d) double-clicking the own Active opens the
  focus (067), so the attachments are checked via its Stack button → carousel, plus `openAttachedCardsPanel`. The
  near Lost Zone pile sits under the Prizes at its centre in this layout, so (b') dispatches the pile click on the
  mirror cover as board-input.js does (printed note). Not changed: the "View attached cards" menu item returns early
  under authority (`mouseClick.card` is null, I15), on both boards.

### D3
- Select-to-move and attach mode never worked for server-drawn cards on either board: `imageClick` and the `e`/`q`
  keybind read the legacy zone arrays, which authority never fills, and `e`/`q` threw on an in-play card.
  `netcode/server-card-select.js` (+ pure `.mjs`) selects through the card registry: a click puts `.highlight` on
  the card's registry <img>, the zone keys send `moveCardBundle` with `{ moving }`, `e`/`q` rings the owner's
  Pokémon in play with `.selectHighlight`, and the next click on one attaches with `{ moving, target }`.
  `deselectCard` clears those classes. Legacy-rendered games are unchanged (no instance id, no registry card). The
  deck keys (arrows, `s`) still address the card by its legacy index; not covered here.
- `.cmd-pending` was never applied (no caller handed `emitCmd` an element). `process-action.js` now passes the
  registry <img> of the command's `payload.instanceId`, so the iframe board shows index.css's in-flight style too.
  The mirror reports it as `pending`, which `card-mesh.js` `setDim` draws at 60 % on the card's own clone of its
  front (a foil gives way to the plain front while dimmed). `pending` does not ride on the board model, so a
  `uiState()` snapshot leaves it to the observer's report.
- The mirror also treats `.draw-flight-source` (draw-flight.js `hideForFlight`) like `visibility: hidden`.
- The harness opens the mat pick with mat-picker.js `openMatPick` over registry cards, as mat-picker-adapter.js
  does for a server choice; the fixture deck has no card whose effect asks for one.

### E1
- `board-rects.js`: `createBoardRects({ getScene })` → `rectForInstance(id)`, `pileRect(side, zone)` (prizes from D2's
  `zoneRects()['<side>:prizes']`, which stands with no prize left), `boardRect(side)` (the side's half of `tableBounds`
  projected; else its zone/pile union; else the scene host's half), `matRect()`/`matCorners()` (cloth quad); module-level
  ones bound to `getBoardScene()` while `board3dActive()`. `seatTurnOf(el)`: 180 for a node in `#oppBoard`'s root —
  `frameTurnOf` (evolve-scene.js) returns it under the flag, so every far-seat scene turns with its card as on the iframes.
- Found: apply-view runs the advisory loop (FX start synchronously on an idle queue) BEFORE `board-view-applied`, where
  board3d.js gives the scene the new model, and the scene then tweens moved cards 180 ms. Measured on a real hand→Bench
  move: at FX time the scene still had the card in the hand (rect = hand spot); a real draw's new card had no scene rect
  and a 1 px mirror img, so the draw skipped its flight. Fix (deviation, client FX queue only): `handleBeforeApply` queues
  `holdFxQueue(fxSettleHoldMs(events))` — 200 ms when the batch moves a card and the 3D board runs, else 0; measured after
  it, the draw's rect is the settled one. Limit: the scene clock is the canvas's WAAPI time, which only advances on drawn
  frames; a frame-starved page (headless SwiftShader at ~2 fps) can still read a mid-tween rect. A scene
  `settledRects()` (tween destinations) would remove the wait — needs board-scene.js/card-mesh.js (not E1's files).
- Shake: `screenShakeKeyframes(amp, ms)` (combat-pose.mjs; same damped sine as `screenShakeOffsets`, keyframe times
  where the WAAPI `cubic-bezier(0.2, 0.6, 0.4, 1)` reaches them) → `scene.shake`; the page elements no longer move.
- Mega hex field: above the canvas in a `.fx-mega-field-board3d` layer the size of `matRect()`, clipped to the projected
  cloth (inline `clip-path: polygon`) and `mix-blend-mode: screen`, so it lights mat and cards alike instead of sliding
  under the cards (impossible over one canvas). `draw-scene.js handSpotOf` reads the scene rect (the mirror img syncs only
  on drawn frames). `prize.js` prefers `pileRect(side, 'prizes')`.
- Frames `.agent/scratch/074/e1/*.png` (`capture-e1.mjs`: solo room, both Actives + Bench, advisory events / registry
  plans fired with real ids, WAAPI frozen; rAF/WebGL scenes frozen by parking rAF). Fixture faces are 1×1 white.
  Overlay boxes logged equal to `scene.rects()` for the card each scene names. Impact prefab textures are not served
  here (no TCG Live texture host): the DOM hit dressing fallback played, at the same rect + seat turn the prefab takes.
- 41-scene checklist (R = plays at the right rect, H1 = plays but needs a port, B = broken):
  **R (34):** shuffle flight · KO ghost flight (ghost taken from the mirror img before the diff, mesh hidden) · KO stars ·
  discard flight + pile catch · discard zone sweep · attack banner · target ring · lunge (attacker mesh hidden via
  `hideDuring`) · move scene · signature move scene · aura pulse · damage number · DOM hit dressing · impact prefab
  (assets absent here; same rect/turn) · table shake (`scene.shake`, 13 keys) · status apply · status clear · evolve
  (own; opp turned 180°) · devolve · Tera entry · Mega orb + vortex · Mega hex field (deviation above) · energy snap ·
  tool ring · retreat/switch slide · promote · own Trainer present · opp Trainer preview + landing · Stadium present ·
  turn banner + edge glow · ability banner + card tag · prize claim burst · game over · coin ceremony.
  **H1 (5):** draw own (spread at mat centre → hand), draw opp face-down (deck → hand, 180°), prize take flight, deck
  reveal — right rects, but the hand card is held with the `draw-flight-source` class, which the mirror does not observe
  (only `style.visibility`), so its mesh shows in the hand while the flight lands on it; Bench recoil — WAAPI `translate`
  on the mirror <img> (invisible), the mesh does not move. **Ported by E2, not E1 (2):** status idle loop, Tera crystal
  skin (scene overlay planes). **B: 0.** Not frozen (same `rectForInstance`/viewport paths as frozen ones): devolve,
  sweep, move/signature scenes, aura, status clear, attach, retreat, promote, Stadium, ability, game over, prize flight.

### E2
- No `setTeraSkin` API: tera-skin.js calls `scene.setUiState(id, { teraSkin: palette | null })`, which already merges
  into the placement `overlays.sync` gets; board-scene.js unchanged. The reconciler's "node" on the 3D board is a
  per-(scene, card) handle, so a rebuilt scene reads as a new node — but refresh runs only on `board-view-applied` /
  `holo-wrapper-changed`, so after a context-loss rebuild the skins return with the next view.
- The skin is five planes on the card face (overlay-meshes.js, timing in pure `tera-skin-frame.mjs`): tint, facets
  (painted from `teraSkinFacets(...).facets`, a new field: each triangle with its fill), sheen (texture-offset sweep,
  card-shaped alphaMap), rim aura, three glints. Blends are approximations: CSS `color` → multiply toward the tint by
  its alpha (dst·(1 − a + c·a)), `overlay` facets → normal alpha, `screen` sheen → additive. Side by side with the DOM
  (`.agent/scratch/074/e2-dom-ref-board.png` vs `e2-tera-settled.png`) the art stays readable, slightly darker.
- status-loop.js under the flag: `createStatusLoop` returns an empty DocumentFragment (apply-view's `insertBefore`
  inserts nothing, `parentNode` stays null), so apply-view.js needed no edit; sync/place return early.
- Foil: `buildHoloCard({ mountFoil: false })` (hydrate-holo under the flag) marks the board wrapper
  `data-tcgl-foil="deferred"` via `deferTcglFoil` and keeps the record, so full-view's `remountTcglFoil` still mounts
  its clone; hover preview / inspector build their own wrappers (unaffected). Lab `?cards=12` with a stubbed manifest
  and a local texture host: 4 foil meshes wear `createFoilMaterial` (`e2-foil.png`); the shader look with fake textures
  proves plumbing only.

### F2
- Seam: `isBoard3dActive` on `setDefaultNetcodeContext` (null = the real `board3d.js` flag); apply-view's calls go through a
  local `board3dActive()` that reads it. Fixture `apply-view-fixture.mjs` re-injects it after every `resetRenderState`.
- Seven mixed cases were split rather than moved whole: their registry/class/src/attachedCards assertions stay in
  `apply-view.test.mjs` (both modes), their px assertions moved to `apply-view-dom-layout.test.mjs`; three px-only cases
  moved whole. Covers have no `board3dActive()` branch (their only geometry is `resetImage`'s zero reset, same in both
  modes), so no cover case moved.

### D2
- Signatures as the slice brief set them: `dropTargetFor(hit, dragging, state)` and `routeDrop(target, dragging, state)`
  (`dragging` = what `identifyCard` reads, plus the <img>'s `.attached`; `state` = `{ initiator, isSpectator, rulesEnabled,
  solo }`). A target carries dragOver's `highlight` ('card'|'zone'|'both'); a route carries `gates`, the
  `manualDeckActionAllowed` actions to pass first (`moveToDeck`, `draw`, `deckToBench`, `benchToHand`). `retreat`'s
  args[2] is the Bench card's instance id; board-input.js swaps in its mirror <img> (drag.js passes the <img>).
- Two rules drag.js never needed: a card lands only on its own side (an iframe drop into the other seat's same-named zone
  moved it within its owner's zones); an open pile's top card dropped back on its pile (`discard` → `discardCover`) is no
  move. Drags start on cards only; a pile stack (the deck cover's HTML5 drag) does not start one.
- The target card's ring is `scene.setCardHighlight(id)` (merged over the UI state when it is drawn), not
  `setUiState`, which would overwrite the glow the mirror reports for that card. Zone light =
  `scene.setZoneHighlight(side, zone, on)` on the new pick planes (`hitTest` → `{ plane: true }`; the Stadium slot is
  `side: null`); `scene.zoneRects()` gives their screen rects. An Item/Supporter keeps its Trainer board lit for the
  whole drag (mirror `#board.board-drop-ready`, set by drag.js `markBoardReady`, now exported).
- A drop that sent a call holds the card where it fell for up to 800 ms (`dropCard(id, { holdMs })`), so it flies from
  there to where the server's view puts it; a refused or rejected move flies back. The release after an Escape-cancel
  is swallowed (no click, no hover lift on the card flying back under the pointer).
- `drag.js`: the four gate blocks became `refuseManualDeckAction(action)` (same cue and chat line); `identifyCard` now
  wraps `identifyCardElement(el)` (click-events.js). `drop-zone.mjs` needed no change. The HTML5 handlers stay bound to
  the mirror imgs (`draggable`) but never fire: `:host` has no pointer events; the harness counts zero `dragstart`.
- Harness: the server lets only the turn player act past the Starting Active, so it flips the solo board to put the turn
  seat near, and runs the far-seat drag (g) first, as a Starting Active move, sent as whichever seat is far.

### D1
- Acceptance (a) asserts `mouseClick.cardInstanceId`/`zoneId` (the Work-plan row's check), not `.highlight`: under server
  authority `imageClick` returns before selecting (`mouseClick.card` reads the legacy zone arrays, never populated, I15),
  on the iframe board too. (b) is checked through closePopups closing `#cardContextMenu` after an empty-table click.
  (c) plays the Basic with `__ptcg.playFromHand` (setup `options()` lists nothing for the near seat in debug mode).
- The browser's own `click` on the canvas after a release over a card is stopped at the canvas (else the page's
  closePopups undoes the card's click); over empty table it bubbles and is the closePopups trigger. Only the primary
  button clicks; `contextmenu` comes from the canvas's native event (one per gesture, any platform). No `wheel`
  listener: it bubbles untouched to the hover preview's document-level suppression.
- `hover-preview-dom.mjs`: a document's `within` scope no longer applies to nodes in a shadow root (mirror cards are
  the board), and the shown card's MutationObserver watches its shadow root (the body never sees those mutations).
- The input is built with each canvas (`buildGraphics`) and disposed in `teardownGraphics`, so a context-loss rebuild
  re-binds it. The hover preview is looked up per change (`getHoverPreview`), so boot order does not matter.
- Harness timing: SwiftShader draws frames ~0.25–0.5 s apart and the scene clock moves with them, so lift/drop are
  polled (≤ 6 s), never a fixed sleep. Not covered here (pre-existing): the Stadium's context menu anchors on the
  page's hidden `#stadium img`.

### C7
- The gate is `scripts/e2e/board3d-view-test.mjs` (`pnpm test:board3d`, own authoritative server), not `pnpm test:2p`
  with `BOARD3D=1`: test:2p drives the legacy relay (`SERVER_AUTHORITATIVE=0`), where the 3D board refuses to start
  (row 31). The view wiring itself needed no change: `board-view-applied` → `boardModelFrom` already serves 2P and the
  spectator (spectator-session.js hands `applyView` an owner-shaped view; a POV switch's `clearRenderedBoard` +
  `applyView` re-poses the scene — checked by id sets).
- Fixes the run exposed: the mirror hosts inherited `.self`/`.opp` (fixed half-height boxes, far seat flipped 180°),
  so far-side rects came out mirrored — `index.css` gives `#boardMirror > #selfBoard/#oppBoard` the full box and the
  containing-block transform. A page drawing no frames (throttled/hidden) kept pre-tween rects — board3d.js adds a
  trailing sync 400 ms after the last change (past the 180 ms pose / 300 ms flip tweens); boot test covers it.
- Pre-existing, both boards (flag: legacy relay): right after the deal the peer's relayed `setupPrizes` (reset.js
  `removeImages`) detaches apply-view's redacted opp-hand imgs until the next view re-places them. The scene draws the
  hand from the model regardless; the harness checks the opp mirror hand only after the next view. Fix belongs in the
  legacy relay (netcode, approval-gated), not here.

### C6
- `containers.js` also probes WebGL2 at load (a throwaway context, lost at once) before choosing the mirror, so row 13
  (`no-webgl2` → iframe board untouched) still holds.
- Architect decision (late fallback): the 43 importers cannot be rebound, so any fallback after containers.js bound the
  mirror (`legacy-netcode`, `load-failed`, `context-lost-twice`, and a boot/rebuild `no-webgl2` the load-time probe
  missed) writes `sessionStorage['ptcg-board-3d-fallback'] = reason` and `location.replace`s the URL with
  `board=iframe` — never when it already has it (no loop), never when no mirror is bound (chat line as before).
  `flag-off`/`no-host` refuse without reload. The reloaded page (`front-end.js`, `takeBoard3dFallback`) reads and
  clears the key and posts "3D board off: <reason>; reload without ?board=iframe to retry". For the reload to land on
  the iframe board, `isBoard3dRequested` now lets `?board=iframe` beat a stored '1' (stored '0' still beats all).
- The roots carry the whole iframe id skeleton (zone buttons, sort checkboxes, headers, count spans, board circles),
  not only the zones: `zone-buttons.js`, `stadium-observer.js` etc. bind to them at boot and throw on null. Each root
  lends the page's `createElement` (8 legacy `ContainerDocument.createElement` sites, `hand-stack-dom.js`).
- Layout: `:host` has `transform: translateZ(0)` so it is the containing block of everything in its root, card imgs are
  `position: fixed !important; transform: none !important` (no zone/`.play-container`/`.mat-holo` offset, box = the
  projected rect), cover imgs fill their cover. `sync` writes px from the host box, only values that changed.
- The observer reports a card only when its state differs from what the scene last got (a report or a `uiState()`
  snapshot), so sync's own style writes never loop. `board-scene.js` gains `onRender({ cardsMoving })`; board3d.js syncs
  (microtask-coalesced) after each model, each relayout, and every frame a card moved plus the frame it settled.
- apply-view's count labels / VSTAR-GX lookup resolve through `getRootNode()` (the page's `ownerDocument` would hit the
  top document); `hand-stack-dom.js` compares stacks by root node. `documents.js`: the page's closePopups listener
  ignores clicks retargeted from a mirror host (the root's listener already ran with the real target).
- Unchanged, verified: `apply-mat-layout.js`, `apply-table-tilt.js`, `spectator-session.js`, `drag-avatar.js`,
  `native-deck-builder*.js` address the iframes by id (hidden, harmless), never the roots; the mutation observers and
  `e2e-api.js` mat-pick scan work on the roots as-is. `inspect().cards` is the pool: count is `cards.ids().length`.

### C5
- Struck: D3's "rotation conditions rotate the card as today's ROTATION_CONDITIONS" — the DOM never did (only the
  server `rotation` a player sets by hand turns a card); no condition yaw in `card-poses.mjs` (architect-confirmed).
- Counter art is `counter-flat.webp` for every amount (damage-counter.css: the tier classes no longer change the look),
  with `counter-back.webp` as the CSS `::before` underside (shifted 11 %, scaled 0.9); wave/slash stay unused.
- Overlays sit on the card's FOOTPRINT in its seat frame (server `rotation` undone, far seat's 180° kept), as apply-view
  measures the turned card's rect; rings hug the card; loop card parts turn with it, sky parts stay screen-upright.
- The idle loop is a faithful port, not a single frame sheet: `status-loop-frame.mjs` evaluates every status-loop.mjs part
  (fade windows, drift, grow, rock, flipbook steps) and the CSS paints (`STATUS_LOOP_PAINT`); `overlay-meshes.js` paints
  them on three 512 px canvases per card (under the card for the glows TCG Live draws behind it — no card cut-out
  needed — over the card, and screen-upright). Sheets load as images (canvas sources), not through the texture cache.
  `status-loop.mjs` exports its grids as `STATUS_LOOP_SHEETS`. Frozen (still drawn) while `motionReduced()`.
- `sync` takes `{ widthPx, tokens }` (the stack's `energyToken`s, drawn on its visible card) and keys each card's dress,
  rebuilding only on change; the scene calls it for every posed card on each apply, a superset of `restyled`.
  Single tokens are round discs, two-orb tokens square (energy-token.css), not wider. `setUiState` re-dresses at once and
  its `hidden` overrides the model's. Lab `?cards=10&overlays=1`: 41 overlay meshes on 10 cards; `rects()` identical
  with and without overlays (17 keys, max diff 0 px) — `.agent/scratch/074/c5-overlays.png`.

### C4
- Hand crop follows the layout, not "45 %": the fan's screen edge sits on `hand.edgeY` with
  `crop = (edgeY − baselineY) / cardBox.hand.h` (0.5: the DOM's two-strip card one strip under the edge), so an upright
  card's bottom is on `baselineY`. Hover keeps hand-fan's 0.35 card-height lift.
- `card-poses.mjs` adds `handPoses(model, layout, { hover, lowered })` and `handGroupsOf(model, side)`; `placementPose`
  now reads its `handPoses` option; `posesFor(model, layout, { hover, lowered })`. A stack's cards share the slot's
  x/y/yaw and stack one card thickness apart under the front card (z), so no z-fighting. Hovering any card of a stack
  lifts the slot. Hand cards missing from `handStacks` get their own slot in view order.
- `handLoweredOffset(cardH)` = 1.1 × cardH (`.hand-lowered #hand` moves `bottom` −1 → −3.2 strips; a card is 2 strips);
  `setHandPose` uses the 180 ms card tween, not the DOM's 250 ms in-cubic.
- "×N" stack badges are `createStackBadges` in `count-labels.js`: text planes parented to the front card's mesh (so they
  follow its tweens), near its top edge, depth-test off. `inspect()` adds `badges`, `hover`, `handPose`.
- Lab adds `?handstack=K` (K copies of one printing → one stack) besides `?hand`, `?opphand`, `?hover`.

### C3
- Files follow the C3 brief, not the Work-plan row: count labels are `count-labels.js` + `text-plane.js` (no
  `overlay-meshes.js` yet), piles are `pile-mesh.js`, poses `pile-poses.mjs`.
- Open piles draw `pileVisualCount(count) - 1` plain layers and the pool's face-up top card on them (top at
  `z = pileThicknessPx(pileVisualCount(count) - 1)`), so `min(count, 6)` cards show in all, as pile-stack.mjs documents.
- `placementPose` takes `{ piles }` (the model's piles) to tell a pile's top card; without it a discard/Lost Zone card
  has no pose. Prize slots stack in the stylesheet's paint order (0, 2, 4 under 1, 3, 5) one card thickness apart.
  `stadiumPose`'s `nearSeat` is unread: `stadium.facing` is already relative to the near player (`stadiumOf`).
- `createPileMeshes` adds `onNeedsRender` (sleeve loaded), `objects()`/`pileAt()` (scene raycast) and `meshCount()`;
  `thicknessPx` is the whole stack's height. `createCountLabels` adds `count()`; anchors may carry `heightPx` (prizes
  use the six slots' bounding box) and `fontPx` (`clamp(10px, 4vh, 20px)` of the iframe, as `.self-text`). Labels
  ignore depth so a neighbouring pile never hides them; opp labels read upside down like `.opp-text`.
- `rects()` returns `pile:<side>:<zone>` for every pile, drawn or empty (footprint at the stack top), and `stadium`
  whenever the layout has a Stadium zone, so E1 can aim at an empty discard. A card whose pose changes without a diff
  move (a discard top settling) tweens to it. Lab `?cards=12&piles=1` (SwiftShader 1920×1080): 19 pile layer meshes
  (4 stacks), 8 labels, 28 card meshes (12 + 12 prizes + 3 pile tops + Stadium) — `.agent/scratch/074/c3-piles.png`.

### C2
- Trainer board row follows the CSS, not "1/4 card width": `#board` is a centred flex row (self-containers.css:808-828),
  cards `100% - 1.5vh` tall with `.25vw` margins, bottom-aligned in the 5 px padded box. A row wider than the box
  overlaps its cards to fit (CSS wraps into a scrolled second line). `placementPose` takes `{ boardCounts }` for it
  (`posesFor` counts); `handPoses` is accepted and unread (hand → null until C4).
- `CardPose` adds `hidden` and `widthPx`. `yawDeg` turns clockwise seen from above (CSS `rotate()`); far-seat
  `stackOffset` turns with the seat. Cards rest 1.5 px above the cloth (the mat overlay is at z 1).
- Pool extras beyond the row: `setCamera(desc)` (tilt for `tableToWorld`), `ids()`, `cornersOf(id)` (front-face world
  corners for `rects()`), deps `timers` (retry) and `foil.uv` (manifest UV window). Scene adds `refreshCards()` (foil
  manifest arrived) and `inspect().cards`. A width change swaps the geometry at once and tweens scale from the
  on-screen size; face changes are their own 300 ms flip tween (edge row 4). Front shows the back until its image loads.
- Foil: the front cap's UVs must be the manifest window of the square foil front, so geometries are cached per
  (width, UV window); a foil card wears plain art until `material.ready`, and plain art again if it fails. The shared
  RawShaderMaterial writes each mesh's Unity builtins in `material.onBeforeRender` + `uniformsNeedUpdate`. flag: the
  foil shaders bypass the renderer's tone mapping/sRGB output (tcgl-foil-view renders them to LinearSRGB), so foil
  colour on the 3D board is unverified; this container has no foil texture host ("no texture host configured"), so the
  lab never exercised the foil path.
- apply-view.js unchanged: `getLastAppliedView()` already exists. board3d.js loads the foil as hydrate-holo does
  (`loadFoilManifest` + `loadFoilData`, record via holo.mjs `foilCardId`/`isReverseHoloCard`) and feeds
  `boardModelFrom(getLastAppliedView(), { selfPlayerId: view.you?.playerId })` on `board-view-applied`.
- Lab `?cards=60&stack=1` (SwiftShader, 1920×1080, sim mat without art; not GPU or fps numbers): 65 card meshes,
  392 draw calls (3 material groups × main + shadow pass per card), 32,764 triangles, 5 geometries, 7 textures,
  3 programs; `rects()` 65 entries; `hitTest` at a rect centre returns the topmost card. The e2e fixture faces are a
  1×1 GIF, so fronts render white (`.agent/scratch/074/c2-cards.png`). Edge row 32's GPU ≤ 150 MB needs a real GPU.

### A2
- `bad_seat` is `{ ok:false, success:false, error:'bad_seat', reason:'bad_seat', clientSeq }`: `success`/`error` let
  server.js's existing `cmdRejected` path carry it unchanged. Turn-order call/choice and `peekDeck` answer
  `{ ok:false, reason:'bad_seat' }`; a stranger socket in a solo room keeps `unauthorized` / `not_caller`.
- Solo join's first view copies the existing envelope `{ gameId, stateVersion, view, events: [], pendingChoice,
  lastClientSeq }` (the normal join sends no view; no envelope has `roomId`), after a `joinGame { serverAuthoritative,
  protocolVersion, rejoinedGame, solo: true }`. `lastClientSeq` in a solo room is the higher of the two seats'
  (`getClientSeqForSocket`): one client counter stamps both seats.
- Added: solo on a public room id → `roomReject solo_room` (keeps it out of the lobby); `addPlayer` refuses in a solo
  room; the same username on a new socket reclaims its solo room (`joinGame` solo or `userReconnected`), anyone else
  → `solo_room`; `viewTargets()` lists seated sockets only (spectator pushes unchanged).
- An invalid `seat` (e.g. `'p3'`) on a NON-solo room is rejected `bad_command` by `validateCommandShape`, not
  ignored; a valid `p1|p2` there is ignored.
- Architect decision (A2 follow-up): per-seat `pushAction`s (`exchangeData`/`loadDeckData`, `readyUp`, Reset request)
  resolve their seat with `seatFor(socket.id, data)` (`server/game/setup-actions.mjs`); missing/bad seat in a solo
  room → `cmdRejected { reason:'bad_seat' }`. The setupActionCache keeps one packet per seat in a solo room
  (`solo:<seat>` keys; a solo rejoin replays both). `instanceMap` and `dealOrder` payloads carry `seat` on every room;
  a solo socket gets both seats' copies. `addSoloPlayer`'s `{ p1, p2 }` lists stay stored only, as `addPlayer` does.

### A3
- Turn-order copies: the server sends a solo socket one `turnOrderCall`/`turnOrderFlip`/`turnOrderResult`
  per seat with no `seat` field, so `turn-order-call.js` attributes copies by arrival order (p1 then p2,
  as `forEachSeat` sends them; a replay is p1's), reads `data.seat` first when present, relabels sides to
  the near seat, dispatches only the copy holding the callId / choiceId, and answers with that seat.
  Server follow-up: add `seat` to those three payloads, then drop the arrival-order fallback.
- Every "acting on 'opp' in 2P → ask the peer" branch (44 sites, `user === 'opp' && emit &&
  isTwoPlayer`) also requires `!systemState.solo`, so the far side runs the path 'self' runs; gates use
  `actsForSide` (authoritative-dispatch.js). Starting Active picker opens for the far seat too.
- Leaving any room sets `serverAuthoritative = false` (legacyDomSuppressed now reads it alone, and a
  stale `true` would blank the local board). Solo chat stays in the Solo tab's `#chatbox`.
- The page still boots on the local board; the Solo tab click joins the solo room (front-end.js is
  slice C1's, and an auto-join at boot would change every legacy-solo e2e).
- Board flip in solo clears the rendered board when the first view from the new near seat lands and
  drops views still drawn from the old seat; the sync heartbeat hashes p1's side (the server compares
  the socket against p1). Legacy-built deck piles do not move on a solo flip; deck counts and covers
  come from the view. `systemState.p2SelfUsername/p2OppUsername` follow their seats across a flip.

### C1
- `setMat` spec = `matSpecFor(mats)` from a new pure `sizing/mat-spec.mjs` (apply-mat-layout's `currentMatSpec()` and
  the lab share it): brief fields plus `boxAspect` (the `--mat-width/height` box), `overlaySrc`/`farOverlaySrc` (zone
  svg), `far` (per-half fit/aspects; each iframe has its own profile), `flip` (full-size mat owned by opp), `scale`
  (`--mat-scale`), `profile` (near half, for `flatLayout`). Art = `object-fit` inside that box (`matBoxRect` +
  `matUvFor` + `clipQuad`); a two-player box spans the whole table (CSS sizes it to one playfield — looks unintended).
- `createTable` also takes `renderer` + `RoomEnvironment` (PMREM needs the renderer) and reproduces
  `img.mat-ambient-image` (pre-blurred 256 px canvas) behind letterboxed art. SVG mat textures go through
  `createMatTextureLoader` (rasterized from the viewBox at 2048 px; an `<img>` of a viewBox-only svg decodes tiny).
- Boot reasons add `no-host` and `load-failed`; `legacy-netcode` is checked at boot only (joining a legacy room later
  does not fall back). `shake` resolves a Promise when done; `inspect()` exposes scene/camera/layout for e2e.
- Seam at 1920×1080: iframe `#playfield` top 540.01 px, scene `projectToScreen` 540.00 px (near edge 955.69 both).

### B3
- `rotation` comes from the root's server `rotation` (reduce/board.mjs rotateCardCommand), snapped to a quarter turn,
  not from `ROTATION_CONDITIONS`: apply-view `applyRotation(img, root.card.rotation)` never rotates for a condition
  (conditions show as markers). Code is truth.
- Placement gains `stackOffset:[right, up]` (card widths; Stage peeks up 1/15 per layer, Tools right 1/6) and
  `energyBadges` (the "Nx" badges past four tokens); `energyToken` also carries `left/size/bottom/zIndex` from
  `planEnergyTokenRow(keys, 1)`. Overlay fields (damage, conditions, poison, burn, abilityUsed, energyBadges) sit on
  the stack's VISIBLE card, read from the root, as apply-view draws them. A token-less Energy is role `tool` (drawn
  as a shifted card, as apply-view does). `stadium` adds `name`. `piles.deck` adds `layers`.
- Prizes are `back` unless `revealed` or the owner's `flags.prizesFaceUp` (view.mjs prizeCards), not "without revealed".
- overlay-plan anchors are overlay CENTRES in card units (v up) and sizes are in card widths; the DOM damage counter
  sits upper-right (left = w/1.5, top = h/4), so `counterPlan` reproduces that, not a bottom-left corner.
  `countLabelPlan` returns legacy's "(N)" text centred above the pile.

### B2
- Seam at `depth = half.h * 0.84`, not `half.h`: `half` is the iframe box (1449.6 × 540 at 1920×1080) but the pivot
  is the PLAYFIELD's bottom edge (`#playfield` stops one `--hand-crop-height` strip above the iframe bottom,
  self-containers.css:413) and `battleMatBox().depth` is that playfield height. `flatLayout` returns `depth`;
  opp maps `y → 2·depth − y`; the hand strip is at y < 0 (`hand.baselineY = −2·strip`, `hand.edgeY = −strip`).
- World frame per the B2 brief (x right, y up the screen, z toward the viewer; table rotated by the tilt), so the
  tilted camera's `up` is `[0,1,0]`, not the row's `[0,0,1]`.
- Broadcast mirrors today's CSS (index.css:6450-6453, `#selfContainer` rotate(90deg)): near hand on the screen's
  LEFT, far edge right, flat +x → screen down, scaled by `--bc-scale`, no tilt (`tiltDeg: 0` on the camera).
- `--prizes-columns` is written but never read by any stylesheet; the CSS grid is always two overlapping cards per
  row, so the prize slots reproduce that for every profile (all profiles have `columns: 2`).
- Card aspects are not deterministic in CSS (intrinsic image ratio): in-play/prizes/Stadium use `--card-aspect`
  0.718 (holo/base.css:90), piles `--deck-card-aspect` 0.716. Extra fields beyond the row: `depth`,
  `cardBox.{deck,discard,lostZone,hand}`, `benchPitch`, `benchSlotRect()` (edge case 6), camera `tiltDeg`/`shiftPx`/`viewport`.

### B1
- attack-fx-lab has no route of its own (express.static serves `/src/dev/*`), so the lab is reachable both at
  `/src/dev/board-lab.html` (static, same as attack-fx-lab) and at `/dev/board-lab` (one `sendFile` route in server.js).
- `/api/card-image` also answers 502 for a non-`image/*` upstream and follows ≤3 redirects only within the allowed hosts
  (403 otherwise); cache entries expire after 24 h (`now`). `CARD_ART_PROXY_HOSTS` = the five CORS hosts:
  `card-image-url.mjs` produces no other images.pokemontcg.io variant.
- Texture cache keys include the colour space, so `release(url, { colorSpace })` mirrors `acquire`.

---
Self-approval checklist (only when the user is unreachable):
- [ ] Every constraint traceable into the Design section
- [ ] Every edge-case row has an expected behavior (or a written strike reason)
- [ ] Interfaces fully named and typed — no hand-waving
- [ ] Slices each ≤1 session and independently green
- [ ] Every slice row is pinned: files, signatures, test cases with expected values, card rulings
      cited (corpus row / TCGdex id) — no banned words; a builder would make zero choices
- [ ] No section reads "TBD"
