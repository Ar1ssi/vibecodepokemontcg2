# 009: TCG Live table — tilted mat, cropped hand, 3D deck, synced animations
Status: draft
Date: 2026-09-14 · Session: S130 (drafted as S107 on a stale checkout; renumbered on push)

## Problem
The battle board should look and feel like Pokémon TCG Live (user reference screenshot, S107):
1. The mat leans away from the viewer in a slight perspective tilt.
2. Both hands are flat strips cropped about halfway off-screen: own hand at the bottom edge,
   opponent's hand (card backs) at the top edge (user, S107).
3. The mat sits higher on the screen than the hand — spatially above, not drawn over it (user,
   S107). Today the hand strip is inside the board area: `#hand` takes the bottom 32% of the self
   iframe and the bench starts at 34%.
4. The deck is a 3D stack. Its height shrinks as cards leave it.
5. Animations play for BOTH players, not only for the player who did them. Scope: shuffle, draw,
   and a new knockout animation (user, S107).

## Constraints
- Two playmat iframes (`#selfContainer`, `#oppContainer`, index.ejs:57-58) own every zone's DOM,
  drag/drop and click handling. `.opp` is flipped with `scaleX(-1) scaleY(-1)` (index.css:159-167).
  Moving zones out of the iframes is out of scope (cost: every getZone/drag/click path).
- Zone geometry comes from CSS vars (self/opp-containers.css:28-62), kept in lockstep with
  `mat-layouts.mjs`'s `sim` profile by a unit test (mat-layouts.test.mjs). Picked mats overwrite
  the vars through `apply-mat-layout.js`.
- Parent-page overlays (shuffle/draw flights, card pop) map iframe rects through
  `iframe-rect.mjs`, which only models the iframe's own 2D transform.
- Prod runs `SERVER_AUTHORITATIVE=1` (D17). Every netcode change is tested in BOTH modes (STATE
  watch-out).
- Animations are advisory (Invariant 4). Removing one must never change game state.
- Catch-up replay must not animate (`shouldAnimateDrawFlight` in draw-flight-predicate.mjs).
- No new dependency.

## Current state (read S107 on a checkout 55 commits behind main)
Builder: re-verify every `file:line` below before slice 1. PR #128 (mat/card positions with the
right drawer closed) and design 008 (attack preview) landed after this was read and touch
index.css + apply-mat-layout.js.
- `client/index.ejs:39-58` — `#battleMat` (mat art, fixed behind) + the two iframes.
- `client/src/css/index.css:151-167` — `.self` bottom 50%, `.opp` top 50% flipped, both 75.5% wide.
- `client/src/css/self-containers.css:144-199` (opp mirror at opp-containers.css:139+) — `#hand`
  is `position: fixed; bottom: 0; height: calc(var(--hand-height) - 3px)`, horizontal scroll.
  Every zone is `position: fixed` with % of the iframe box.
- `self-containers.css:292+` — `#deckCover` holds one sleeve `<img>` (`Cover`, update-cover.js).
  There is no thickness; the cover disappears only at 0 cards.
- `client/src/setup/playmat-anim.mjs` — per-iframe MutationObserver animations. Its `#deckCount`
  observer (lines 64-75) records the count and does nothing else (dead stub).
- `client/src/actions/zones/shuffle-zone.js:43-47` — legacy path: ONLY the originator plays
  `playShuffleFlight`. The mirror skips it on purpose ("made the other player's deck look like it
  shuffled too").
- `shuffle-zone.js:32-40` — authoritative path: `dispatchAuthoritativeZoneOp` returns BEFORE the
  flight, so under the prod flag nobody sees a shuffle.
- `client/src/setup/netcode/apply-view.js:1147-1152` replays server advisory events through
  `options.onAdvisoryEvent`. The only caller (socket-event-listeners.js:453) never passes it, so all
  server events (`zoneShuffled`, `zoneShuffledIntoDeck`, `cardsDrawn`,
  `handShuffledIntoDeckAndDrawn`, … from shared/engine/reduce.mjs) are dropped.
- `client/src/setup/image-logic/shuffle-flight.js` — parent-page flight from the deck cover rect,
  already correct for the flipped opp iframe via `readFrameTransform`.
- Knockout, legacy: `rules-bridge.js:1226-1287` `checkKnockouts` runs on BOTH clients for BOTH
  sides, once per card (`card.__rulesKODetected`). It posts a chat line and
  `playAttackFeedback(true)`. Only the owner (`player === 'self'`) then calls
  `moveCardBundle(... 'discard' ...)` right away, so the card leaves the board instantly.
- Knockout, authoritative: reduce.mjs:97-103 emits `pokemonKnockedOut { instanceId, playerId,
  attackerPlayerId, prizeCount }`. It is dropped like every other advisory event (see above).
  applyView updates the DOM BEFORE it replays events, so by then the KO'd card is gone.
- `tcgl-knockout` keyframes exist in self/opp-containers.css (flash, desaturate, dim) but no JS
  applies the class.

## Options
**O1 — where the tilt lives**
- A: `rotateX` on a parent wrapper around `#battleMat` + both iframes. One plane, simplest math.
  But iframe content flattens into the iframe plane, so the hand tilts too. To keep it flat, the
  hand must leave the self iframe, which breaks drag/drop, hand-sort and draw-flight targets.
  `iframe-rect.mjs` must also learn perspective projection.
- B: inside each iframe, wrap the board zones (not `#hand`) in a `#playfield` element with
  `perspective` + `rotateX`. Parent `#battleMat` gets the same tilt. The hand stays flat in the same
  document and keeps all its handlers. `getBoundingClientRect` already includes same-document 3D
  transforms, so `iframe-rect.mjs` keeps working without changes. Cost: the two halves are two 3D
  contexts, so both must use the same eye point for the seam to line up.
- C: merge both iframes into one document. Correct long-term, far too big for this change.
- **Pick B.** It is the only option that keeps the hand flat without moving zone DOM. A pure
  `table-tilt.mjs` computes both halves from one set of parameters, and a unit test proves the
  seam points project to the same screen coordinates.

**O2 — deck thickness**
- A: real `translateZ` layers under `preserve-3d`. True 3D, but any `overflow`/`filter` on an
  ancestor silently flattens it, so it breaks easily.
- B: N stacked sleeve-edge layers offset upward by `translateY`, plus a darker edge. Under the tilt
  it reads as 3D. Predictable, and it works with picked mats.
- **Pick B.** The layer count comes from pure `deckStackLayers(count)`, which is unit-tested.

**O3 — how deck-count changes reach the stack**
- A: call `updateDeckStack` from every move/draw/shuffle path. Many call sites, easy to miss one
  (legacy, authoritative, replay).
- B: extend playmat-anim.mjs's existing `#deckCount` observer (it is a dead stub today). One hook,
  and it covers every path because every path updates the count text.
- **Pick B.** The stub becomes live code instead of being deleted.

**O4 — syncing animations**
- Legacy: allow the mirror to play `playShuffleFlight(user, …)`, gated on a new
  `shouldAnimateMirror({ syncReplay, syncReplaying, hidden })` (catch-up replay must not animate).
  The old "looked like the other deck shuffled" complaint is a question to confirm live: if the
  mirror's `user` resolved to the wrong side, fix that mapping — do not suppress the flight again.
- Authoritative: pass `onAdvisoryEvent` in socket-event-listeners.js. It goes to a pure
  `advisoryAnimationPlan(event, selfPlayerId)` → `{ kind: 'shuffle'|'draw', user, zoneId, count }`
  or `null`, plus a thin DOM caller. Both players, originator included, animate from the SAME
  server event, so there is one source and no double-play.
- Alternative rejected: re-enable only the legacy mirror. Prod (authoritative) would still show
  nothing.

**O5 — knockout animation**
- A: add `tcgl-knockout` to the real card image and delay the owner's discard move until it
  ends. Delays a game action for a cosmetic reason. The relayed move can also race the mirror's
  animation, and it cannot work in authoritative mode because the card is gone before events play.
- B: a parent-page "ghost": capture the card's on-screen rect and image while the card is still
  there, then play the KO in an overlay (flash → desaturate → drop toward that player's discard →
  fade), the same way `shuffle-flight.js` works. Game actions are never delayed, and removing the
  card mid-animation does not matter.
- **Pick B.** Trigger points: legacy = `checkKnockouts` detection (both clients already detect
  every KO exactly once). Authoritative = a new `options.onBeforeApply(events)` hook at the TOP of
  `applyView`, which snapshots the victim's rect by `instanceId` before the DOM diff removes it.
  The ghost plays after the view applies.

## Design
### Tilt (slices 1-2)
- New pure module `client/src/setup/sizing/table-tilt.mjs`:
  `tiltTransforms({ tiltDeg, perspectivePx, eyeYFrac })` →
  `{ self: { transform, origin, perspectiveOrigin }, opp: {...}, mat: {...} }`.
  Both halves rotate about the seam (the local top edge in both iframes, because opp is flipped
  180°). Opp's local rotation sign is derived from conjugating by the 180° flip; the seam test
  pins it. Defaults: `tiltDeg: 14`, `perspectivePx: 1400` (to be tuned with the user on localhost).
- `projectPoint(point, params, half)` (pure) is used ONLY by the seam-continuity test.
- `apply-table-tilt.js` (new, beside apply-mat-layout.js) writes `--tilt-transform`,
  `--tilt-origin`, `--tilt-perspective-origin` on each iframe's documentElement and on
  `#battleMat`. It re-runs on iframe load, resize, board flip and mat change.
- self/opp-containers.html: wrap the board zones (active, bench, prizes, deck, discard, lost zone,
  stadium, board, labels that belong to zones) in `<div id="playfield">`. `#hand`, the hand labels,
  popups and menus stay OUTSIDE it. `#playfield` has a transform, so `position: fixed` zone
  children now resolve against `#playfield`. Zone % vars therefore become % of the playfield.
  This is intended and keeps mat-layouts profiles unchanged in meaning.

### Hand + mat above hand (slice 1)
- `#playfield`: `position: fixed; left:0; right:0; top:0; bottom: var(--hand-visible)`.
- `#hand`: flat, `bottom: 0`, height = `--hand-visible` (default ≈ 16% of the iframe). Cards are
  sized to full card height `--hand-card-height` and `translateY(50%)`, so the bottom half is
  clipped by the viewport. On `:hover`/drag source: `translateY(0)` lift with a short transition,
  and `z-index` above the playfield.
- Opp iframe gets the same `#playfield` + cropped `#hand` structure (opp-containers.css). The
  opp iframe is flipped 180°, so the same CSS crops its hand at the TOP edge of the screen: card
  backs, half visible. No hover lift on the opp hand (it cannot be interacted with).
- Parent `#battleMat` rect shrinks to the union of both playfields (not the full iframes), so the
  mat art stops behind the hand, as in the screenshot.

### 3D deck (slice 3)
- Pure `client/src/setup/zones/deck-stack.mjs`:
  `deckStackLayers(count, { maxCount = 60, maxLayers = 12 })` → integer 0..maxLayers.
  0 cards → 0 layers. 1 card → 1 layer. Output is monotonic in count and clamps above maxCount.
- `#deckCover` gets `.deck-stack` edge layers (`div`s tinted from the sleeve, each
  `translateY(-i * var(--deck-layer-px))`). The cover img sits on the top layer.
- playmat-anim.mjs's `#deckCount` observer calls `renderDeckStack(countFromText)`. It parses the
  count defensively: non-numeric text → leave the stack unchanged.

### Synced animations (slices 4-5)
- `draw-flight-predicate.mjs`: add `shouldAnimateMirror` (same inputs as
  `shouldAnimateDrawFlight`).
- shuffle-zone.js:45 → animate when `emit` (originator) OR `shouldAnimateMirror(...)` (mirror).
- Audit the legacy draw path (move-card.js:559-572): does the mirror fly the opp's drawn card
  back from opp deck → opp hand? If not, enable it with the same gate.
- New `client/src/setup/netcode/advisory-animations.mjs` (pure plan) +
  `advisory-animations.js` (calls `playShuffleFlight` / draw flight). Wired as
  `onAdvisoryEvent` at socket-event-listeners.js:453. It skips while a view is applied as part of
  catch-up (reuse the replay flags).

### Knockout animation (slice 6)
- New `client/src/setup/image-logic/knockout-flight.js`:
  `captureKnockoutGhost(user, cardImageEl)` → `{ rect, src, user } | null` (uses the
  `visualRectOf` mapping from shuffle-flight.js — extract it to iframe-rect.mjs's neighbour
  instead of copying it). `playKnockoutGhost(ghost)` builds a fixed overlay and runs the pose
  timeline.
- Pure `client/src/setup/image-logic/knockout-pose.mjs`: `knockoutPose(t, { fromRect, toRect })`
  → `{ x, y, scale, rotate, opacity, brightness, saturate }`, `KNOCKOUT_DURATION_MS ≈ 900`.
  Phases: 0-0.35 flash + desaturate in place, 0.35-1 drift toward that player's discard with
  fade out.
- Legacy: in `checkKnockouts`, right after `card.__rulesKODetected = true`, capture + play the
  ghost for BOTH `player` values (skip when replaying or hidden, via `shouldAnimateMirror`).
  The owner's discard move is NOT delayed.
- Authoritative: `applyView` gets `options.onBeforeApply(events)`, called before the DOM diff.
  advisory-animations.js captures ghosts for every `pokemonKnockedOut` (instanceId → element via
  the client's instance map; the Builder confirms which lookup `setInstanceMap` feeds), then plays
  them from `onAdvisoryEvent`. `advisoryAnimationPlan` gains `kind: 'knockout'`.
- The unused `tcgl-knockout` CSS class is deleted in this slice (replaced by the ghost).

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | Deck count 0 | No cover (existing), 0 stack layers | [ ] deckStackLayers(0) |
| 2 | `#deckCount` text non-numeric/empty | Stack unchanged, no throw | [ ] parse test |
| 3 | Count 1 / 60 / >60 (big custom deck) | 1 layer / max / clamped max | [ ] boundary tests |
| 4 | Two shuffles back-to-back | `cancelShuffle` restarts the flight (existing) | [ ] reasoning + manual |
| 5 | Catch-up replay applies 30 actions | No animations | [ ] predicate + plan tests |
| 6 | Tab hidden | No animation (existing `document.hidden` guard) | [ ] existing test |
| 7 | Unknown/malformed advisory event | Plan returns null, nothing plays | [ ] plan test |
| 8 | Authoritative originator | Animates once from the server event, not twice | [ ] plan test + 2P |
| 9 | Board flip (coaching) / spectator | Tilt re-applied for the new viewer | [ ] manual |
| 10 | Picked mat with custom zone vars | Zones still on the printed boxes, now tilted | [ ] mat-layouts test + manual |
| 11 | Window resize | Tilt vars recomputed; seam still continuous | [ ] seam test + manual |
| 12 | Drag card from flat hand onto tilted bench | Drop hits the right zone | [ ] manual (2P harness drag) |
| 13 | Solo mode (both boards local) | Shuffles animate once per action | [ ] manual |
| 14 | Hand of 15+ cards | Horizontal scroll still works in the cropped strip | [ ] manual |
| 15 | Opp hand 0 cards / 15+ cards | Empty strip / backs overlap or scroll, still cropped at top | [ ] manual |
| 16 | Two Pokémon KO'd at once (spread attack) | Two ghosts play at the same time, independently | [ ] knockout-pose test + manual |
| 17 | KO victim element not found (authoritative) | capture returns null, no ghost, no throw | [ ] plan/capture test |
| 18 | Owner's discard move lands mid-ghost | Ghost keeps playing; the real card is already in discard | [ ] reasoning (ghost is detached) |
| 19 | KO detected during catch-up replay | No ghost | [ ] predicate test |

## Test plan
- Unit (`node --test`): table-tilt seam continuity, deckStackLayers boundaries, count parse,
  shouldAnimateMirror, advisoryAnimationPlan per event type (incl. knockout) + null cases,
  knockoutPose endpoints/monotonic fade, mat-layouts lockstep.
- 2P: `pnpm test:2p` (legacy), and a server-authoritative run
  (`SERVER_AUTHORITATIVE=1 PORT=4100 node server/server.js`) for the shuffle/draw sync.
- Visual/CSS: the user checks on localhost (per the user's stated preference). No Browser-pane
  CSS verification.

## Migration / rollout
n/a: client-only, no data. Revert = revert the slice commits. The tilt amount lives in one params
object, so `tiltDeg: 0` gives a flat board if the tilt must be switched off in prod quickly.

## Work plan — one branch `feature/009-tcg-live-table`, one worktree
| Slice | Delivers | Green when |
|---|---|---|
| 1 | `#playfield` wrapper in both iframes, mat above hand, both hands half-cropped (own: hover lift) — no tilt yet | pnpm test green; user OKs layout on localhost |
| 2 | table-tilt.mjs + apply-table-tilt.js, tilt on both playfields + #battleMat | seam test green; user OKs tilt; drag/drop manual pass |
| 3 | 3D deck stack (deck-stack.mjs + observer) | unit tests; user OKs look |
| 4 | Legacy mirror animations (shuffle, + draw if missing) | predicate tests; `pnpm test:2p` |
| 5 | Authoritative advisory animations wired | plan tests; authoritative 2P run shows shuffle on both screens |
| 6 | Knockout ghost animation, both modes (+ `onBeforeApply` hook) | pose/plan tests; KO visible on both screens in legacy and authoritative 2P runs |

## Deviations (Builder appends here during build)
- Slice 2 (S130), REVERTED in S131: ancestor `perspective` on each `<html>` made the root the
  containing block of every fixed zone and collapsed the board. S131: `--tilt-transform` is
  `perspective(p) rotateX(±a)`, so each plane's eye point is its transform-origin, and all three
  origins sit on the seam. `eyeYFrac` and `perspectiveOrigin` are dropped.
- S131: halves are chosen by the frame's current class (`.self` = near, `.opp` = far), not its id.
  The far half uses `rotateX(-a)`, which is the flip conjugate. `tiltTransforms` returns
  `{ near, far, mat }`. The `#battleMat` box and pivot come from pure `battleMatBox()`.
- S131: `#hand` has three bands (off-screen / strip / lift room), `pointer-events: none`, and the
  strip is `#hand::before`. `--hand-crop-height` is in vh. A mat profile's `--hand-height` no
  longer sizes the hand (mat-layouts test exempts it).
- S131: the deck stack lives in a sibling `#deckStack`, not inside `#deckCover`, because
  update-cover.js removes `firstElementChild`. `--deck-stack-dir` follows the frame class.
- S131: the mirror gate is `shouldAnimateMirror({ syncReplaying, isCatchingUp, hidden })`.
  `syncReplaying` is never set anywhere; `isCatchingUp` is what peer-log catch-up sets.
- S131: a `zoneShuffledIntoDeck` event animates the deck, not its source zone.

---
Self-approval checklist (only when the user is unreachable):
- [ ] Every constraint traceable into the Design section
- [ ] Every edge-case row has an expected behavior (or a written strike reason)
- [ ] Interfaces fully named and typed — no hand-waving
- [ ] Slices each ≤1 session and independently green
- [ ] No section reads "TBD"
