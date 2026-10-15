# 073: Deck boxes beside the mat, and the opening deal out of them
Status: approved (user) — gate questions answered 2026-10-15 (send the box, rest beside each deck, fly back open)
Date: 2026-10-15 · Session: S-deckbox-deal · Branch: `claude/practical-pasteur-phs3b5`

## Problem
Design 071 gave every deck a TCG Live deck box, but it only shows in the builder's Customize tab. The user wants
both players' 3D deck boxes resting off the mat in the blurred band, and at game start each box flies up onto
its owner's half of the mat, opens, and the cards fly out onto the mat (the deck spot).

## Constraints
- three.js is vendored and lazy-`import()`ed only; pure math lives in `.mjs` files node tests can load (STATE).
- Board animations play one after another through the FX queue (`netcode/advisory-animations.js`); a scene
  returns a hold that lasts until it ends (CLAUDE.md code standard).
- Never gate on the OS reduced-motion query; use `motionReduced()` / `fxDisabled()` from `image-logic/mat-fx.mjs`.
- Opacity on a preserve-3d element flattens it: fade hosts, not 3D cards (043). Not relevant to the WebGL path.
- Netcode change is display-only and additive; the user approved sending the box id (gate question 1).
- `'self'`/`'opp'` never go over the wire (PROJECT landmine): the box id rides the sender's own deck packet.
- Deck box ids are catalog ids (`boxes.json`); unknown ids show the default box (071 edge case 2).
- e2e (`isE2eMode()`) timings must not grow: the harness has nobody watching (pattern of `e2eDelayMs`).

## Current state
- `customize-stage/object-stage.js`: draws box + sleeve in one three scene for the Customize tab; assets
  `assets/deckbox/{deck-box,card}.mesh.json`, `interior.webp`, `shadow-box.webp`, `scene.json`, atlases.
  `boxes.mjs`: `loadBoxCatalog`, `boxById`, `boxAtlasUrl`.
- The box mesh is one welded shell: exterior submesh 0, interior lining submesh 1. Mesh space: x width
  ±3.43, y depth (front −2.22 … back +2.08), z height (0 bottom … −9.48 top). A groove rings the box at
  z ≈ −6.0 … −6.5 (rings of vertices at −6.0, −6.1, −6.3, −6.5): the cap seam. The card mesh is 6.4 × 8.9,
  +z face = sleeve (submesh 0), −z = card back (1), edges (2). Measured this session (node + SwiftShader renders).
- `native-deck-builder.js`: `applyDeckBox` stores the id in the library (`setActiveDeckBox`); no game-side
  announcement exists ("builder-only"). Coins use `gameLink.announceCoin` → `rules-coin-changed` (host) or
  `host.post('coin')` (editor tab, validated by `builder-window.mjs` `PAYLOAD_CHECKS`).
- Wire: `exchangeData` params `[username, deckData, cardBack, coachingMode, callback, matId, format]` (sent on
  room join); `loadDeckData` params `[deckData, format]` (sent on every deck load). Replays call
  `fn(user, ...params, emit)`; `deck-format-args.mjs` `resolveFormatAndEmit` tells a pre-051 packet (boolean
  in the format slot) from a new one. The server caches the latest of each per socket for late joiners
  (`server.js` setupActionCache) and reads only params[1]/[6] (`shadow.mjs`).
- Game start: `actions/general/ready.js` `readyUp` → both ready → `setupPrizes` (rules) or `setup` (free play),
  then `both-players-ready`. Under server authority the server sends `turnOrderCall` at once; rules-bridge
  opens the call picker (`handleServerTurnOrderCall`), then `showServerCoinFlip`, `applyServerTurnOrderResult`.
- Board: two iframes (`#selfContainer` bottom, `#oppContainer` top, flipped 180°) over `#battleMat`; the mat art
  is `#battleMatArt img.mat-art-image` with a blurred ambient copy filling the band either side. Each iframe has
  `.hover-gutter-probe` spanning the mat art horizontally (069). Deck spot = `#deckCover img` (shuffle-flight.js);
  `visualRectOf` maps it to the viewport. Table tilt `DEFAULT_TILT_DEG` 12° (`sizing/table-tilt.mjs`).
- FX queue: `holdFxQueue(ms)` pushes a blocking wait so later plans play after it.

## Options
1. **Where the boxes render.** A: one fixed, full-viewport transparent WebGL canvas in the parent page, drawn on
   demand (layout change, texture load, animation frame). B: a small canvas per box, plus a full-screen one only
   during the deal. Pick **A**: one context, one camera, the boxes and flying cards share depth (cards rise out
   of the box behind its walls); idle cost is one draw on layout change.
2. **Cards in flight.** A: three.js card meshes in the same scene. B: DOM flights (`card-flight.js`). Pick **A**:
   a DOM card cannot come out from inside a WebGL box; the card mesh and sleeve texture already exist.
3. **Opening the box.** The mesh is welded, so a lid must be cut. A: split triangles at the groove (centroid
   z < −6.25 → lid), hinge at the back edge of the cut, add a flat rim ring to close the wall gap. B: ship a
   new pre-split mesh from the importer. Pick **A**: pure split at load (tested), no asset churn.
4. **Opponent's box on the wire.** A: append `deckBoxId` to `exchangeData` (index 7) and `loadDeckData`
   (index 2), cached and replayed by the server like the deck. B: a new relayed `changeDeckBox` action. Pick
   **A**: the box belongs to the deck packet; B adds an action-log entry, counters and peer-log replay for a
   cosmetic. Box picks made mid-room travel with the next deck load (as sleeves do on join). Bump
   `PROTOCOL_VERSION` 2.1.0 → 2.2.0 so a stale tab is asked to reload instead of misreading `emit`.
5. **Where the game tab learns its own box.** A: `gameLink.announceDeckBox` → `deck-box-changed` event (host)
   or `host.post('deck-box')` (editor tab), like coins. B: read localStorage on demand. Pick **A**: same path as
   coins, works for both builder roles.
6. **Sequencing.** The deal plays when both players are ready, before prizes. A: `readyUp` awaits it before
   `setupPrizes`/`setup`, holds the FX queue for its length, and the server coin's call/flip/result handlers wait
   for it (`afterOpeningDeal`). B: push it into the FX queue only. Pick **A**: the call picker is not an FX plan;
   without the gate it would open over the scene.

## Design
### Pure modules
`client/src/setup/netcode/mat-fx/deck-box-math.mjs`
- `LID_CUT_Z = -6.25`; `splitBoxMesh(mesh, cutZ = LID_CUT_Z)` → `{ body: { index, submeshes }, lid: { index,
  submeshes }, hinge: { y, z }, rim: { outer, inner } }`. A triangle is lid when its centroid z < cutZ. `hinge.y`
  = max exterior y at the cut (back face), `hinge.z = cutZ`. `rim.outer`/`rim.inner` = `{ x0, x1, y0, y1 }` from
  exterior / interior vertices within 0.35 of the cut.
- `restPlacement({ deckRect, matRect, boardRect })` → `{ side: 'left'|'right', cx, cy, height } | null`. Side =
  the band on the deck's side of the mat centre. Band = board edge … mat edge. `height = min(deckRect.height *
  1.15, (bandWidth − 2·EDGE) / BOX_SCREEN_ASPECT)`; null when height < MIN_REST_HEIGHT (48). `cx` band centre,
  `cy` deck centre clamped into the board.
- `hoverPlacement({ deckRect, matRect, restHeight })` → `{ cx, cy, height }`: beside the deck toward the mat
  centre (1.9 deck widths), at the deck's centre height, `height = deckRect.height * 1.35`.
- `dealTimeline(cardCount)` → `{ liftMs, openMs, firstCardMs, staggerMs, flightMs, landMs, returnMs, totalMs }`.
  Cards fly = `flyingCardCount(deckCount)` = clamp(deckCount, 0, 24).
- Easings, `bezier3`, `screenToWorld({x,y}, viewport)` (camera maps 1 world unit = 1 CSS px at z = 0).

`client/src/setup/netcode/mat-fx/deck-box-gate.mjs` — `createOpeningDealGate({ schedule })` →
`{ begin(ms) , end(), afterOpeningDeal(fn), busy() }`. Callbacks run at once when idle, FIFO when the deal
ends; `begin` arms a backstop at ms + 1500 so a lost `end` never wedges the coin flow. A default instance is
exported for the app.

`client/src/setup/deck-constructor/deck-box-args.mjs` — `sanitizeDeckBoxId(v)` (string 1–128 of
`[A-Za-z0-9_.-]` else null); `resolveExchangeTail(format, deckBoxArg, emitArg)` and
`resolveLoadTail(format, deckBoxArg, emitArg)` → `{ format, deckBoxId, emit }` where `deckBoxId` is undefined
when the packet predates 073 (boolean in the box slot, or in the format slot).

### Game-side state — `client/src/setup/netcode/mat-fx/deck-box-state.mjs`
`createDeckBoxState()` → `{ idFor(side), setId(side, id), isDealt(side), setDealt(side, bool), resetAll(),
subscribe(fn) }`. Sides `'self'|'opp'`. Ids are catalog ids or null (default box). The app instance lives in
`deck-box.js`; `deck-box-changed` (`{ target, deckBoxId }`) sets ids; `game-restarted`, `room-changed`, and a
deck load for a side clear `dealt`.

### Runtime
- `deck-box-stage.js` (lazy three): `createDeckBoxStage({ onLost })` → `{ canvas, setBox(side, boxId), setRest(side,
  placement|null, open), render(), playDeal(sides: Array<{ side, sleeveUrl, deckRect, cardCount, rest, hover }>)
  → Promise<void>, resize(), dispose() }`. Body mesh + lid pivot (hinge) + rim ring + card-stack block per side.
  Camera: perspective, fov 20°, at z = (vh/2)/tan(10°). Box pose: upright, pitched 15° (scene.json holder),
  yawed +25° (right band) / −25° (left band). Lid open angle 1.9 rad (~110°). Cards: card mesh, sleeve map on
  +z, landing pitched by `DEFAULT_TILT_DEG`, the opponent's turned 180° in plane.
- `deck-box.js` (no three import): `installDeckBoxes()` creates `#deckBoxStage` lazily once a side has a deck,
  tracks layout (resize, `mat-layout-applied`, `board-layout-changed`, a 500 ms rect poll while idle), hides in
  spectator sessions. `playOpeningDeal()` → Promise: skipped (resolves at once, marks both dealt) when
  e2e, `fxDisabled()`, `motionReduced()`, hidden tab, or the stage is unavailable; otherwise opens the gate,
  holds the FX queue for `totalMs`, hides each dealing side's deck cover (`html.deckbox-dealing` in its iframe),
  plays, reveals, marks dealt, closes the gate.

### Wiring
- `ready.js`: `await playOpeningDeal()` right after the format check, before setup/setupPrizes.
- `rules-bridge.js`: `rules-turn-order-call`, `-flip`, `-result` listeners run through `afterOpeningDeal`.
- `exchange-data.js`, `import.js` (`loadDeckData`), `socket-event-listeners.js` (join exchange): send
  `deckBoxIdForWire()`; on an opp packet with a defined box id, `setId('opp', id)`.
- `native-deck-builder.js`: `announceDeckBox` on both links; called by `applyDeckBox` and
  `refreshDeckBoxSelection`; host applies `deck-box` messages. `builder-window.mjs`: `'deck-box'` payload check.
- `commands.mjs`: `PROTOCOL_VERSION = '2.2.0'`; `shadow.mjs` comment lists the new trailing param.
- CSS: `mat-fx.css` `#deckBoxStage` (fixed, inset 0, pointer-events none, z-index 850: above the board iframes,
  under the builder workspace 900 and the sidebox); `self-containers.css` / `opp-containers.css`
  `html.deckbox-dealing #deckCover { visibility: hidden }`.

### Timeline (ms, 24 cards)
lift 0–650 · lid opens 650–1000 · card k leaves at 950 + 45k, flies 560 · last lands 2545 · reveal deck +
fade landed cards 2545–2745 · return 2700–3350 (lid stays open) · total 3350.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | No deck on a side | No box for that side; the deal skips it | [ ] |
| 2 | Unknown / malformed box id on the wire | Sanitized to null → default box | [ ] |
| 3 | Packet from a pre-073 client (no box slot) | `deckBoxId` undefined → opp keeps its current box; emit read correctly | [ ] |
| 4 | Pre-051 packet (no format) | emit read from the format slot as before | [ ] |
| 5 | Band too narrow (two-player / sim layouts) | No resting box (null placement); the deal still flies from the board edge | [ ] |
| 6 | WebGL missing / context lost / asset fetch fails | Stage unavailable, logged once; deal resolves at once; coin flow unaffected | [ ] |
| 7 | e2e, fx off, reduced motion, hidden tab | Deal skipped (sides marked dealt, boxes rest open) | [ ] |
| 8 | `end` never called (exception mid-scene) | Gate backstop releases queued coin callbacks | [ ] |
| 9 | Call/flip/result arrive during the deal | Run in arrival order after it | [ ] |
| 10 | Call arrives with no deal running | Runs at once (unchanged flow) | [ ] |
| 11 | Restart / room change / new deck | `dealt` cleared → box rests closed | [ ] |
| 12 | Sync replay / catch-up of readyUp | `readyUp` returns before the deal (existing `syncReplaying` guard) | [ ] |
| 13 | Resize or sidebox toggle mid-deal | Placements are read once at start; rest re-measured after | [ ] |
| 14 | Sleeve image fails to load (CORS / 404) | Default card back | [ ] |
| 15 | Deck of 1 card / 60 cards | 1 card flies / 24 fly | [ ] |
| 16 | Spectator session | No boxes drawn | [ ] |

## Test plan
- Node: `deck-box-math` (split partitions every triangle, lid above cut, hinge at back, rim inside outer,
  placements for right/left decks, narrow band → null, timeline ordering and totals, card count clamp),
  `deck-box-gate` (fake clock: idle runs now, FIFO after end, backstop), `deck-box-args` (rows 2–4),
  `deck-box-state`, `builder-window` (`deck-box` payload), protocol version test.
- Recording: `.claude/skills/fx-preview/rec/rec-deck-box.mjs` (SwiftShader) for the user's localhost check.

## Migration / rollout
Additive. Revert: drop the trailing wire params (old packets still parse), remove `#deckBoxStage` wiring from
`ready.js`/`rules-bridge.js`; no stored data changes.

## Work plan
| Slice | Files | Signatures & data shapes | Test cases | Rulings | Green when |
|---|---|---|---|---|---|
| 1 pure | deck-box-math.mjs, deck-box-gate.mjs, deck-box-args.mjs, deck-box-state.mjs + tests | as in Design | rows 1–5, 8–11, 15 | n/a | `node --test` on the four |
| 2 wire | exchange-data.js, import.js, socket-event-listeners.js, native-deck-builder.js, builder-window.mjs, commands.mjs, shadow.mjs | as in Wiring | builder-window payload, protocol 2.2.0 | n/a | `pnpm test:changed` |
| 3 stage | deck-box-stage.js, deck-box.js, mat-fx.css, self/opp-containers.css, front-end init, ready.js, rules-bridge.js | as in Runtime | recording | n/a | lint clean, recording shows rest + deal |

## Deviations
