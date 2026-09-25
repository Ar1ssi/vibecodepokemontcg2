# 042: TCG Live knockout scene and discard flights
Status: shipped S307 (main c4b9d579) — slices 1–2 green, video out/ko-scene.mp4; design self-approved (user gave the clip and asked directly; scope posted in chat), flagged at close
Date: 2026-09-25 · Session: S307

## Problem
The knockout (design 009/026) is a flash + desaturate in place, then a 900 ms drift that fades on
its way to the discard pile, with a small ring/shard burst. A plain discard is only a 420 ms puff on
the pile. The user sent a TCG Live clip (3.3 s, `out/ko-ref/`) and wants the KO "like this", and
discarded cards to "flow similarly".

Reference, frame by frame: gold five-point stars spray off the KO'd card; the whole play mat
flashes a gold→orange radial zoom burst with dark streaks converging on the card (static, fades in
~0.7 s); the card is thrown back away from the attacker, tipping over in 3D, then swings forward
while its attached Energy fan out from behind it; the card, then each Energy, flies in an arc to
the owner's discard pile trailing a gold light streak, and they land stacked.

## Constraints
- D103[mat-fx]: WAAPI keyframes sampled from pure pose functions; canvas stays static or reads the
  WAAPI clock (D118/D119). Pose math DOM-free and unit-tested under `node --test`.
- Cosmetic only: board state is already applied; self-removing overlays with backstop timers;
  `body.fx-off .fx-overlay` hides them.
- The KO ghost is captured pre-diff (`handleBeforeApply`) and starts on the attacker's impact
  (`deferStart: afterImpact`, 1.5 s backstop) — keep that contract.
- Memory (user feedback): no whiteouts, no spinning sunburst rays. The reference's rays are a
  static zoom burst; they stay static and never cover the card in white.
- Opp board iframe is rotated 180°; overlay card art must turn with it (`frameTurnOf`).
- Fx queue budget 2500 ms; the KO hold paces the prize claim / promote that follow.

## Current state
- `image-logic/knockout-flight.js`: `captureKnockoutGhost(user, img)` → `{rect, src, user}`;
  `playKnockoutGhost(ghost, {deferStart})` runs `knockoutPose` (knockout-pose.mjs) on rAF over
  900 ms plus `playKnockoutBurst` (core, 2 rings, 16 shards; skipped when fx off / reduced).
- `netcode/advisory-animations.js`: `handleBeforeApply` captures one ghost per
  `pokemonKnockedOut` (from `registry.get(event.instanceId).element`) and `captureOrigins`;
  `runPlan` plays the ghost for plan kind `knockout` and returns `holdFor('knockout')` (520).
- Engine `handleKnockout` (reduce.mjs ~1560–1620) moves the victim's whole stack to discard with
  NO `cardsDiscarded` event, then emits `pokemonKnockedOut {instanceId, playerId, ...}`.
- Pre-diff the stack is in the registry: root record `stackAttached: [{cardData, record}]`;
  `origins.visibleStackRecord` finds the drawn card. Energy draw as tokens: the img's `src` is the
  token and `dataset.energyCardSrc` holds the card art (apply-view `applyEnergyToken`).
- `cardsDiscarded {playerId, cards}` — `cards` is `[{instanceId, name}]` or bare ids (mill paths);
  plan effect `discard` → `lifecycle.js discard` = puff on `#discardCover`.
- Post-diff, apply-view re-sets every rendered card's `src` to its display src, so a discarded
  card's element (discard is public) shows its face even when it was an opp hand sleeve.

## Options
1. Burst rendering. A: CSS conic/radial gradients — hard-edged rays, and blurring a full-board
   element every frame is expensive. B: one canvas drawn ONCE (gradient + blurred ray wedges), then
   only its opacity/scale animate on WAAPI. **Pick B**: soft rays at one draw's cost, D103-clean.
2. Burst extent. A: viewport. B: union of the two board iframes, edges faded by an elliptical
   mask. **Pick B**: the reference lights only the play mat, not the UI around it.
3. KO attachments. A: engine emits `cardsDiscarded` for the stack — protocol change, and would
   double-animate with the KO. B: client reads the stack from the registry pre-diff, alongside the
   ghost. **Pick B**: no engine change; the data is already there.
4. Discard origin. A: always burst on the pile (today). B: capture each discarded card pre-diff
   (hand/board) and fly it; cards with no visible origin (mill) start from the deck cover. **Pick B**.
5. Flight motion shared by KO and discard: one pure `flightPose` (quadratic arc, eased, tumble,
   3D tilt, scale to pile, trail) so both read the same. **Pick shared.**

## Design
New `mat-fx/card-flight.mjs` (pure):
- `FLIGHT_MS = 620`, `FLIGHT_STAGGER_MS = 80`, `MAX_FLIGHTS = 8`.
- `planFlight(fromRect, toRect, {fromTurn=0, toTurn=0, from={}, seed=1})` → flight
  `{dx, dy, cx, cy, r0, r1, s0, s1, t0, spin, lift}`; offsets are px from the from-rect centre,
  the arc control point bends to the upper side of the chord, `spin` ±(12–24)°.
- `flightPose(u, flight)` → `{x, y, rotate, tiltX, scale, opacity}`; path eased in-out; scale
  s0→s1 with a lift bump; rotate r0→r1 plus `spin·sin(πe)`; tiltX t0→0 via a mid-flight 28° lean;
  opacity fades over the last 12 %.
- `flightTrail(u, flight)` → `{x, y, angle, length, opacity}` from the path's velocity.
- `flightDelays(count)` → per-card delays, capped to MAX_FLIGHTS.

New `mat-fx/ko-scene.mjs` (pure):
- `KO_SCENE_MS = 1900`, `KO_FLIGHT_AT_MS = 820`, `KO_FAN_MAX = 5`.
- `koBurstPose(t)` → `{opacity, scale}` (peak 0.85 by 60 ms, gone by 750 ms).
- `koHeroPose(t, {dir})` / `koFanPose(t, i, {dir, turn, W, H})` pre-flight poses, px offsets.
- `koTrack({index, dir, turn, pileTurn, cardRect, pileRect})` → `(t) => pose` for the whole scene;
  index 0 = the KO'd card, 1..n = its attachments; flight starts at
  `KO_FLIGHT_AT_MS + index·FLIGHT_STAGGER_MS`.
- `buildKoRays(seed)` → ray table; `drawKoBurst(ctx, {width, height, cx, cy, rays})` static draw.

New `mat-fx/card-flight.js` (DOM): `playFlight({host, card, trail, flight, delay})`,
`playLanding(pileRect, delay)`; `mat-fx/ko-scene.js`: `playKnockoutScene(ghost)`.
`captureKnockoutGhost` grows `turn`, and `src` prefers `dataset.energyCardSrc`; a KO ghost
carries `attached: [{src}]` built from the stack in `handleBeforeApply`.
`playKnockoutGhost` → `playKnockoutScene` when fx on and motion allowed, else today's drift.
`origins.captureOrigins` also captures `cardsDiscarded` cards; `lifecycle.js discard` flies them
(`takeOrigin`, post-diff src first), deck cover as the fallback origin, puff when nothing flies.
Holds: `knockout` 520 → 900 (prize claim lands while the cards fly).

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | KO'd card with no attachments | hero alone: burst, stars, knockback, flight | [x] covered: knockoutStack lone Basic; koTrack index 0 |
| 2 | `cardsDiscarded` with empty/absent `cards` | puff on the pile only | [x] covered: discardedIds(undefined); lifecycle discard falls to the puff when 0 fly |
| 3 | bare-id vs `{instanceId}` cards; >MAX_FLIGHTS cards | both parsed; first 8 fly, delays capped | [x] covered: discardedIds; flightDelays caps |
| 4 | two KOs in one batch (double KO) | each ghost plays its own scene; burst per KO | [x] reasoning: ghosts keyed per instanceId; each scene owns its overlays |
| 5 | discard pile rect missing (iframe not ready) | KO: the flight lands in place; discard: no-op | [x] covered: koTrack missing pile lands in place; discard returns 0 without a pile |
| 6 | discard origin missing (mill) | `{hidden}` origin starts from the deck cover; a snapshot already taken (trainer present) → that card skipped | [x] covered: captureOrigins marks hidden |
| 7 | opp side (board turned 180°) | knockback up, art turned 180°, lands turned like the pile | [x] covered: koHeroPose dir, koFanPose turn, koTrack turn 180; video |
| 8 | fx off / reduced motion | KO keeps the old drift; discard skipped by the dispatcher | [x] reasoning: playKnockoutGhost gates on fxDisabled/motionReduced; discard has no static fallback |
| 9 | energy token as origin | flies the full card art (`energyCardSrc`) | [x] covered: flightSrcOf |
| 10 | deferStart never fires | 1.5 s backstop starts the scene | [x] reasoning: unchanged KO_START_BACKSTOP_MS path |
| 11 | tab hidden | no scene (existing `document.hidden` guard) | [x] reasoning: unchanged guard |

## Test plan
Unit (`node --test`): card-flight (endpoints, arc bends, scale/rotation land, trail direction,
delays cap), ko-scene (burst shape, hero knockback direction per side, fan spreads behind then
flies, track continuity at flight start, lands on pile, ray table deterministic), origins capture
of `cardsDiscarded`. Video check: Playwright recording of both scenes on the e2e board
(`.agent/scratch/rec-ko.mjs`), frames compared with the reference sheet.

## Migration / rollout
n/a — client cosmetic. Revert = revert the commit; no data touched.

## Work plan
| Slice | Delivers | Green when |
|---|---|---|
| 1 | pure card-flight + ko-scene modules and tests | node --test green |
| 2 | DOM drivers, capture wiring, discard flights, CSS, holds; video check | suite green, video matches |

## Deviations (Builder appends here during build)
- Scope grown at the user's request ("do 1 and 2"): every way into the pile flies. `cardMoved`
  to discard (retreat Energy, replaced Stadium, special-energy/trainer steps, blocked hand card)
  → `discard` plan with `cards: [instanceId]`; `zoneMoved` to discard (board sweep, discardAll)
  → `discard` plan with `sweep: from`, and `captureOrigins` snapshots every card then tagged
  (`dataset.zone`/`side`) in that zone (`zoneCardIds`, `takeZoneSweep`). Energy tokens fly from a
  card-shaped box twice the token's height (`cardShapedRect`). Covered by advisory-animations,
  origins and card-flight tests.
- User cut the mat-wide burst after the first video ("remove the colored explosion thing"):
  `koBurstPose`/`buildKoRays`/`drawKoBurst`, `playMatBurst` and `.fx-ko-mat-burst` are gone; Options 1–2
  are moot. The gold stars stay.
- Video tuning (S307): burst field brighter (dark core to 10 %, orange by 28 %), rays reach 0.3–0.75
  and are all dark — the gold spokes read as a sunburst; stars 0.24–0.4 card width; knockback 0.9 H
  back, 0.5 H swing; pile catch softer.
- Discards with no pre-diff snapshot do NOT start at the deck: only `{hidden}` origins do, because a
  trainer's snapshot is taken first by its presentation (a deck start would be wrong there).
- The KO ghost now shows the stack's top card (`knockoutStack`), not `event.instanceId`'s element —
  the engine names the root Basic, which sits under an evolution. The old burst
  (`knockoutBurstPose`, `.fx-ko-burst*`) is deleted; the drift stays as the reduced-motion path.
