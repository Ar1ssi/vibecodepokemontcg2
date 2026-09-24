# Active work — design 038: design 035 review fixes (I138–I150)

Branch `claude/wizardly-brown-k61li3` (design 035 slices 1–12 + S288 reviews). Spec:
`.agent/designs/038-trainer-review-fixes.md` (approved S289, option A ×5). One slice per commit, suite green between.
- [x] 1 I138 prize-clause side + attack gate; I139/I140 Tool `phase` split (S289)
- [x] 2 I141 + I143: faceDown choice options (engine + picker), count-only look events, Heavy/Beast Ball choice (S290; live Peonia check skipped per user)
- [x] 3 I142 Mr. Fuji bench-only + `resetLeftPlay`; I147 single reveal; I146 Focus Band coin events + bench RNG (S291)
- [x] 4 I144 `prizeFlags` at all damage sites; I145 shared `chaosGymBlocks` gate (S292; I152 filed)
- [x] 5 I148 `onlyCopiesInHand`; I149 `turnOnePermission`; I150 gate steps/removed + baseline regen; I153 filed;
      I152 fixed too (S293). Design 038 complete — next: merge branch to main
Verify each slice: node --test "shared/**/*.test.mjs" "client/**/*.test.mjs" "server/**/*.test.mjs" "bot/**/*.test.mjs"
(known fail: card-inspector-model "retreat greys"; coin-flip-ceremony flaky) + oracle/audit:trainers per the plan.

# Active work — S264 12-item batch (branch `feature/batch-s264`, worktree `../vibe-batch-s264`)

Increment ledger (one cluster per commit, suite green between):
- [x] C1 card abilities: #2 Eelektrik Dynamotor, #8 Toxtricity Sinister Surge, #12 Munkidori
      Adrena-Brain, #3 Stadium-as-Trainer (Acerola's Premonition + matchesSearch type-only kinds)
- [x] C2 FX: #1 holo on double-click preview (auth-mode wrapper), #7 Mega entry poses (gather→enclose→crack→burst)
- [x] C3 board UI: #9 End Turn button, #10 View Board (choose pickers + choice modal), #11 card blink (apply-view placeInViewOrder + src guard)
- [ ] #5 "basic prompt gone" — debug, repro first
- [ ] #6 logging, #4 30th anniversary set — design first, waiting on user approval

# Active work — design 009: TCG Live table rework

Branch: `claude/design-009-review-287815` (worktree `dawns-multi-stage-selection-8f8db1`).
Commit 1 = S130's build as found; commit 2 = S131 review fixes. The primary checkout still holds
S130's original uncommitted tree; discard it once this branch is accepted.
Full plan: `.agent/designs/009-tcg-live-table.md` (status: draft; S131 deviations appended).

| Slice | Status | Notes |
|---|---|---|
| 1 | built, S131-fixed | `#playfield` + three-band cropped hand |
| 2 | built, S131-fixed | perspective() in transform, far half negated, mat sized to playfields |
| 3 | built, S131-fixed | `#deckStack` sibling + raised cover |
| 4 | built, S131-fixed | mirror gate uses `isCatchingUp` |
| 5 | built, S131-fixed | `zoneShuffledIntoDeck` animates the deck |
| 6 | built | knockout ghost, both modes |

## S131 — review fixes (read this first)
Verified: `pnpm test` 1402/1402; headless Chromium on the real iframe HTML+CSS (zones full size,
hand shows half of each card, no vertical hand scroll, strip hit-tests as `#hand`, lift band lets
clicks through to the playfield, near edge wider / far edge narrower, 12px deck edge on both
halves). NOT verified: the full app (parent `#battleMat` sizing/pivot, seam alignment with mat
art, drag/drop from the flat hand onto the tilted bench), `pnpm test:2p`, the authoritative 2P
run, the user's localhost look. Tune `tiltDeg`/`perspectivePx` (14 / 1400) with the user.

## S130 (cont.) — slice 6 done (design 009 all 6 slices built)

Knockout ghost animation (design's slice 6 scope: O5 pick B — a detached parent-page overlay,
game actions never delayed).

**New `client/src/setup/image-logic/knockout-pose.mjs`** — pure `knockoutPose(t, { fromRect,
toRect })`. Two phases: `t <= KNOCKOUT_FLASH_END (0.35)` flashes brightness/desaturates in place
(no drift); the rest eases (`easeInOutCubic`) from the victim's rect center to the discard rect
center, scaling down, rotating, and fading to `opacity: 0`. `KNOCKOUT_DURATION_MS = 900`.

**New `client/src/setup/image-logic/knockout-flight.js`** — `captureKnockoutGhost(user,
cardImageEl)` → `{ rect, src, user } | null` (null on a missing element or a zero-size rect, edge
case 17). `playKnockoutGhost(ghost)` builds a fixed overlay (same `document.body`-appended-div
pattern as `shuffle-flight.js`) and drives it with `knockoutPose` via `requestAnimationFrame`,
resolving the discard rect for `ghost.user` at play time (not capture time) via
`#discardCover`/`visualRectOf`. Extracted `visualRectOf` out of `shuffle-flight.js` into
`iframe-rect.mjs` per the design's own instruction, so both files share one implementation instead
of two copies.

**Legacy wiring (`rules-bridge.js`'s `checkKnockouts`)** — right after `card.__rulesKODetected =
true` (card element still on the board), capture + play the ghost for **both** `player` values —
this loop already watches both `self` and `opp` zones for local KO detection, and design's O5 pick
explicitly says both sides should ghost, not just the owner. Gated on the same
`shouldAnimateMirror({ syncReplaying, hidden })` predicate slice 4 built (catch-up replay and
backgrounded tabs don't animate). The owner's `moveCardBundle` discard call two lines below is
untouched — not delayed, exactly per O5's rejection of option A.

**Authoritative wiring** — `apply-view.js` gained the design's `options.onBeforeApply(events,
localPlayerId)` hook, called at the TOP of `applyView` (before `diffViews` and the DOM
reconciliation loops that would otherwise remove the KO'd card from `cardRegistry` first).
`localPlayerId` is now computed early (moved up from its previous single use at
`reconcilePendingChoice`, no behavior change there). `socket-event-listeners.js` wires
`advisory-animations.js`'s new `handleBeforeApply` as `onBeforeApply`: for every
`pokemonKnockedOut` event it looks the victim's `<img>` up in `getCardRegistry()` (still present
at this point) and calls `captureKnockoutGhost`, stashing the result in a module-level
`instanceId -> ghost` map. `advisoryAnimationPlan` gained a `pokemonKnockedOut` case → `{ kind:
'knockout', user, instanceId }` (mapped from `event.playerId`, i.e. the victim's side — same
mapping the shuffle/draw cases already use). `handleAdvisoryEvent`'s new `'knockout'` branch pulls
the captured ghost by `instanceId` and plays it (or drops it silently if capture failed or the
replay/hidden gate says no — edge cases 17/19).

**CSS** — added `.card-knockout-ghost`/`.card-knockout-ghost img` to `index.css` (mirrors
`.card-shuffle-flight`'s shape, its own `z-index: 2400` band so a KO ghost never fights a
concurrent shuffle overlay for stacking order). Deleted the unused `tcgl-knockout`
`@keyframes`/`.tcgl-knockout` class from `self-containers.css`/`opp-containers.css` (no JS ever
applied it — confirmed by grep before deleting) per the design's explicit instruction.

**Updated `advisory-animations.test.mjs`** — the slice-5 test that asserted
`pokemonKnockedOut -> null` (written before this slice existed) now asserts the real
`{ kind: 'knockout', user, instanceId }` plan for both players, plus a null case for a missing
`instanceId`; the "unrelated event types" test keeps `cardMoved` and swaps in a genuinely-unknown
type instead of `pokemonKnockedOut`.

**New `client/src/setup/image-logic/__tests__/knockout-pose.test.mjs`** (registered in
`package.json`'s explicit test list): duration/flash-end sanity, t=0 endpoint (at the victim rect,
opaque), t=1 endpoint (at the discard rect center, opacity 0), flash phase never drifts,
opacity monotonically non-increasing across the full timeline, and out-of-range `t` clamps to the
0/1 endpoints.

**Not built this slice:** a direct unit test for `captureKnockoutGhost`/`playKnockoutGhost`
themselves (DOM-heavy — `getBoundingClientRect`/`document.hidden` — same class of thing
`shuffle-flight.js` also leaves to manual/2P verification, not unit tests, per the design's own
test plan). `knockoutPose`'s endpoint/monotonic tests are the unit coverage the design's test plan
actually asks for.

**Not verified this session** — standing instruction: no node/pnpm/lint. Owed before this can be
called done: `pnpm test` (expect `knockout-pose.test.mjs`'s 6 new cases, the revised
`advisory-animations.test.mjs` cases, on top of slice 5's baseline), `pnpm test:2p` (legacy KO
ghost), an authoritative 2P run (`SERVER_AUTHORITATIVE=1 PORT=4100 node server/server.js`,
confirming a `pokemonKnockedOut` event actually reaches both clients and both play the ghost), and
a manual localhost look at the ghost's timing/feel (flash → drift → fade) per the user's stated
CSS/animation verification preference. Everything uncommitted, no worktree, no branch, per this
session's explicit instructions. **Design 009 has no slices left to build** — full `pnpm test` +
`pnpm test:2p` + authoritative 2P run + manual localhost pass across all 6 slices is now owed
before this can move from "built" to "verified."

## S130 (cont.) — slice 5 done

Authoritative advisory animations (design's slice 5 scope: prod `SERVER_AUTHORITATIVE` path shows
shuffle/draw animations too, not just legacy).

**New `client/src/setup/netcode/advisory-animations.mjs`** — pure `advisoryAnimationPlan(event,
selfPlayerId)`. Maps `event.playerId === selfPlayerId` to `user: 'self'`, else `'opp'`. Only two
kinds, per the design's own O4 text (knockout is slice 6's separate `onBeforeApply` hook):
`zoneShuffled`/`zoneShuffledIntoDeck` → `{ kind: 'shuffle', user, zoneId }`; `cardsDrawn` → `{
kind: 'draw', user, cards, count }` (cards filtered to those with a real `instanceId`). Everything
else (`pokemonKnockedOut`, `cardMoved`, malformed input, missing `playerId`) → `null`.

**New `client/src/setup/netcode/advisory-animations.js`** — `handleAdvisoryEvent(event,
selfPlayerId)`: builds the plan, then gates on slice 4's `shouldAnimateMirror({ syncReplaying,
hidden })` (reusing the same replay/hidden-tab flags, per the design's own instruction) before
calling `playShuffleFlight`/`playDrawToHand`. For `draw`, looks up each card's `<img>` via
`getCardRegistry()` (the authoritative renderer's instanceId → element map, already built by
Phase 3B) and calls `playDrawToHand(user, { image: record.element })` per card — `playDrawToHand`
already staggers multiple calls internally (`STAGGER_MS`), so no new sequencing code was needed.
For `shuffle`, needed a card count to size the flight visual; `zoneId === 'deck'` can't use
`getAuthoritativeZoneArray` (deck is redacted to `{ count }` even for its own owner — O4-A/I5), so
added `getAuthoritativeDeckCount(side)` to `apply-view.js` alongside the existing
`getAuthoritativeZoneArray`.

**`apply-view.js`** — `onAdvisoryEvent(ev)` calls now pass `localPlayerId` as a second argument
(`onAdvisoryEvent(ev, localPlayerId)`), since the plan function needs it to resolve `user`. The
existing `apply-view.test.mjs` callback ignores its arguments, so this is behavior-additive, not
breaking.

**`socket-event-listeners.js`** — `socket.on('view', ...)`'s `applyView` call now passes
`onAdvisoryEvent: handleAdvisoryEvent`. This is the actual wire-up the design's slice-5 line and
S130's earlier journal flag both named as missing — before this, prod showed zero shuffle/draw
animation for either player, since `onAdvisoryEvent` was never passed at all.

New `client/src/setup/netcode/__tests__/advisory-animations.test.mjs` (registered in
`package.json`'s explicit test list): shuffle plan for self/opp, `zoneShuffledIntoDeck` treated
the same as `zoneShuffled`, missing `zoneId` → null, draw plan carrying instanceIds, empty/
malformed `cards` → null, unrelated event types → null (edge case 7), and null-safe on missing
event/`selfPlayerId`.

**Not built this slice:** knockout is explicitly slice 6's job (its own `onBeforeApply` hook,
since a knockout's card is gone from the DOM by the time advisory events replay — this slice's
`cardRegistry` lookup approach would return nothing for it).

**Not verified this session** — standing instruction: no node/pnpm/lint. `pnpm test` (expect the
7 new `advisory-animations.test.mjs` cases on top of slice 4's baseline) is owed, as is an
authoritative 2P run (`SERVER_AUTHORITATIVE=1 PORT=4100 node server/server.js`, per the design's
own test plan) to confirm shuffle/draw actually animate on both screens now — this is the one
piece of slice 5 that can't be reasoned about from source alone, since it depends on the server
actually emitting `events` alongside `view` (confirmed by reading `server/server.js`'s four
`emit('view', ...)` call sites, but not run live). Everything uncommitted, no worktree, no
branch, per this session's explicit instructions.

## S130 (cont.) — slice 4 done

Legacy mirror animations (shuffle, + draw path per the design's audit instruction).

**Bug found in passing (both paths, same root cause):** `syncReplay: true` is set whenever this
client is applying a *relayed* action from the other player (shuffle's `!emit` branch,
`moveCardBundle`'s `isMirrorReplay`) — not only during true catch-up replay. The old
`shouldAnimateDrawFlight({ syncReplay, syncReplaying })` gate in `move-card.js` therefore
silenced the opponent's draw flight on every live 2P game, not just replay — the same class of
bug the design's O4 section already documented for shuffle.

**New `shouldAnimateMirror({ syncReplay, syncReplaying, hidden })`**
(`draw-flight-predicate.mjs`) — same input shape as `shouldAnimateDrawFlight` per the design, but
ignores `syncReplay` entirely (it can't distinguish "live mirror-apply" from "catch-up replay");
gates only on `syncReplaying` (true catch-up) and `hidden` (backgrounded tab). 7 new tests in
`sync-action-args.test.mjs` (already registered).

**`shuffle-zone.js`** — flight now plays when `emit` (originator, unchanged) OR
`shouldAnimateMirror(...)` (mirror, new) is true, replacing the old
`!(isTwoPlayer && !emit)` originator-only gate. The old code comment claimed animating the mirror
"made the other player's deck look like it shuffled too" — per the design's own instruction this
is a live-verification question about the `user`/side mapping, not a reason to keep the mirror
silent; did not re-suppress it.

**`move-card.js`** — the hand-flight gate (`handFlight && shouldAnimateDrawFlight({ syncReplay,
syncReplaying })`) now calls `shouldAnimateMirror({ syncReplaying })` instead, dropping
`syncReplay` from the call so a mirror-applied draw (`isMirrorReplay` → `syncReplay: true`)
animates like any other live draw. `playDrawToHand`'s own internal gate (`draw-flight.js:138-145`)
was already correct (never received `syncReplay`) and is unchanged.

**Not built this slice:** slice 5 (authoritative advisory animations) is a separate wire-up — the
prod `SERVER_AUTHORITATIVE` path still shows no shuffle/draw animation for anyone (STATE's key
finding), since `onAdvisoryEvent` still isn't passed to `applyView`. This slice only fixes the
legacy (non-authoritative) mirror path per the work plan's own slice split.

**Not verified this session** — standing instruction: no node/pnpm/lint. `pnpm test` (expect 7 new
`shouldAnimateMirror` cases on top of slice 3's baseline) and `pnpm test:2p` (legacy mode, per the
design's own test plan) are owed before slice 5. Manual 2P check also owed: opponent's shuffle and
opponent's draw should now visibly animate on the other player's screen; confirm the `user`/side
mapping in `playShuffleFlight`/`playDrawToHand` reads correctly for the mirror side (the thing the
old comment worried about) rather than mirroring the wrong player's deck/hand. Everything
uncommitted, no worktree, no branch, per this session's explicit instructions.

## S130 (cont.) — slice 3 done

**New `client/src/setup/zones/deck-stack.mjs`** — pure `deckStackLayers(count, { maxCount = 60,
maxLayers = 12 })`: 0 → 0, else `clamp(ceil(count/maxCount * maxLayers), 1, maxLayers)`, so it's
monotonic and clamps at `maxCount`.

**`playmat-anim.mjs`** — the dead `#deckCount` observer stub now calls a new `renderDeckStack
(deckCoverEl, countText)`: `Number.parseInt`s the text, bails (stack untouched) on non-finite —
covers edge case 2 without a separate parse module, since it's a 3-line DOM guard, not pure logic.
On a valid count it clears any `.deck-stack-layer` children and inserts `layers` of them before
the existing cover `<img>`. Runs once on module init too (initial deck count), not just on
mutation.

**CSS** (`self-containers.css`/`opp-containers.css`, mirrored) — `--deck-layer-px: 1.1px`;
`#deckCover img` gets `position: relative; z-index: 1` so it stacks above the layers;
`.deck-stack-layer` is an absolutely-positioned sleeve-edge strip (`bottom: 0; height: 4%`),
each offset `translateY(calc(var(--deck-layer-i) * -1 * var(--deck-layer-px)))` — reads as a
rising 3D edge under the cover once the table tilt (slice 2) is in view. Opp gets the identical
local rule: its whole iframe is already flipped 180° by the parent, so no sign flip needed here.

New `client/src/setup/zones/__tests__/deck-stack.test.mjs` (8 tests, not yet registered in
`package.json`'s explicit test list — owed before slice 4, per standing "not run" instruction this
session): 0/1/maxCount/above-maxCount boundaries, monotonicity across 0..70, non-finite/negative/
undefined → 0, and custom `maxCount`/`maxLayers`.

**Not verified this session** — standing instruction: no node/pnpm/lint. `pnpm test` (register the
new test file first) and manual localhost look (user's own stated verification method for this
repo, no Browser-pane check) are both owed before slice 4.

## S130 (cont.) — slice 2 done

Built the tilt itself (design's slice 2 scope).

**New `client/src/setup/sizing/table-tilt.mjs`** — pure `tiltTransforms({ tiltDeg, perspectivePx,
eyeYFrac })` and `projectPoint(point, params, half)`. Chose the ancestor-`perspective`-property
route (not the `perspective()` transform function baked into `--tilt-transform`) so `eyeYFrac`
(the vanishing point) can move independently of `tiltDeg`'s rotation pivot — the design's params
name suggested that independence was wanted. Self/opp pivot at `50% 0%` (local top edge = the
seam in both iframes, per the design's own reasoning about the opp iframe's 180° flip); `#battleMat`
(one continuous element spanning the full mat height, unlike the two split iframe contexts) pivots
at `50% 50%` (its own vertical center = the seam). `rotateX` only displaces points off its own
axis, so every point exactly on that axis is invariant regardless of `tiltDeg`/`perspectivePx` —
that's what actually keeps the seam continuous, not a specific chosen number. `projectPoint`
implements the same perspective-divide + rotateX math the browser applies, used only by the unit
tests below.

**New `client/src/setup/sizing/apply-table-tilt.js`** — `applyTableTilt(params)` writes
`--tilt-perspective-px` (shared) plus each half's `--tilt-transform`/`--tilt-origin`/
`--tilt-perspective-origin` onto: each iframe's own `documentElement` (self/opp, via a fresh
`contentDocument` lookup each call — same pattern as `apply-mat-layout.js`'s `frameDocument`, not
a cached reference, so it survives iframe reloads) and the parent page's own `documentElement`
(consumed by `#battleMat`'s CSS). `initializeTableTilt(params)` calls it once, then re-runs it on
each iframe's `load` event, `window resize`, and the existing `mat-layout-applied` custom event
(`apply-mat-layout.js:343`) — covers "iframe load, resize, board flip, and mat change" from the
slice 2 brief, except board flip specifically (see below).

**CSS** — added to `self-containers.css`/`opp-containers.css`/`index.css`: `--tilt-*` custom
properties (default `--tilt-transform: none`, `--tilt-perspective-px: 0px`, so nothing renders
differently until `apply-table-tilt.js` runs), a new `html { perspective: var(--tilt-perspective-px);
perspective-origin: var(--tilt-perspective-origin); }` rule per document (establishes the 3D
context `#playfield`/`#battleMat` rotate within — `position:fixed` descendants stay correctly
contained since `perspective` on `html` makes `html`'s content box their containing block, which is
already effectively the viewport), and `transform: var(--tilt-transform); transform-origin:
var(--tilt-origin);` added to the existing `#playfield` (self/opp) and `#battleMat` (index.css)
rules.

**Board flip:** `flip-board.js` now imports `applyTableTilt` and calls it (no params, so current
defaults) at the end of `flipBoard()`. Traced first whether this is actually needed: flip swaps
`selfContainer`/`oppContainer`'s `height`/`bottom` inline styles, but each iframe keeps its own
`documentElement` and thus its own inherited `--tilt-*` custom properties across the swap — nothing
about the tilt vars themselves needs recomputing today (self and opp use identical tilt params).
Called it anyway per the brief's literal instruction ("re-runs on... board flip") since it's cheap
and future-proofs against a later per-side tilt asymmetry; flagged here rather than silently
skipped.

**Wired in `front-end.js`**: `initializeTableTilt()` added alongside the existing
`initializeMatLayout()` call.

**Deviation from the design doc's literal return shape:** the design's "Design" section describes
`--tilt-transform` as if it already contains `perspective(1400px) rotateX(14deg)` combined, with
`--tilt-perspective-origin` as a seemingly redundant third value. That combination is only valid
CSS if perspective-origin and transform-origin are the same point — but the params list a separate
`eyeYFrac`, which only has an independent effect if perspective is a property on an ancestor
(distinct 3D context) rather than a function inside the rotating element's own transform list. Went
with the ancestor-`perspective` structure instead (see CSS above) so `eyeYFrac` is a real, distinct
tuning knob on localhost, not a dead parameter. `tiltTransforms`'s returned shape still matches the
design's `{ self, opp, mat }` with `{ transform, origin, perspectiveOrigin }` each — only the CSS
wiring underneath differs from a literal reading.

**New `client/src/setup/sizing/__tests__/table-tilt.test.mjs`** (7 tests, registered in
`package.json`'s explicit test list): pivot-origin assertions, seam invariance under a spread of
`tiltDeg`/`perspectivePx`/`x` for self/opp (top edge) and mat (vertical center), self/opp agreement
at the shared seam for matching local x, and two sanity checks (`tiltDeg:0` is the identity;
nonzero `tiltDeg` off-seam is not).

**Not verified this session** — standing instruction was "do not run node, pnpm, or lint tests," so
this is stricter than prior slices' "`node -c` only" precedent (S57 etc.) — no syntax check was run
at all this time. `pnpm test` is owed (expect the 7 new tests plus the existing baseline), as is
`npx eslint` on the 4 touched/new JS/mjs files. Manual verification (`pnpm start`, per the design's
own test plan: "the user checks on localhost, no Browser-pane CSS verification") is owed for the
actual tilt look/feel and to tune `tiltDeg`/`perspectivePx`/`eyeYFrac` away from the placeholder
defaults (14deg/1400px/0.5) — get the user's OK on localhost before slice 3 per the work plan.
Everything uncommitted, no worktree, no branch, per this session's explicit instructions.

## S130 (cont.) — slice 1 done

Built the "hand + mat above hand" half of the tilt groundwork (design's slice 1 scope; tilt
itself is slice 2).

**`client/self-containers.html` / `client/opp-containers.html`** — wrapped every board zone
(`boardCenterDesign`, deck/discard/lostZone text+zone, covers, `bench`, `active`, `matCoinSlot`,
`prizes`, `board`) in a new `<div id="playfield">`. Left `#handLabel`, `#handText`, `#hand`, and
the popup/menu elements (`attachedCards`, `viewCards`) outside it, per the design. `#playfield`
has no transform yet (slice 2 adds one) — it's DOM-only prep so slice 2 doesn't need to touch the
HTML again.

**`client/src/css/self-containers.css` / `opp-containers.css`** — new `--hand-crop-height: 16%`
var (kept `--hand-height` at its existing meaning/value — the RAISED card height — so
`mat-layouts.mjs`'s `sim` profile and its unit test, which pins `--hand-height` to `'32%'`, stay
untouched). `#playfield { position:fixed; inset: 0 0 var(--hand-crop-height) 0 }` (no transform).
`#hand` shrinks to `--hand-crop-height`; cards render at full `--hand-height` then
`translateY(calc(var(--hand-height) - var(--hand-crop-height)))` to pull them down so only the
top sliver shows above the strip's border — the cropped-card look. Self hand gets a `:hover`
(and `.mat-holo:has(> img:hover)`) rule that cancels the pull and raises `z-index`, per the
design's "hover lift, no lift on opp" split. Opp's crop is the same local-CSS shape; the whole
opp iframe is already flipped 180° (`index.css` `.opp`), so it reads as cropped-at-the-top card
backs on screen with no extra CSS needed. Updated `#handText`/`#handLabel`'s `bottom` from
`var(--hand-height)` to `var(--hand-crop-height)` in both files so the label sits at the new
crop line, not the old one.

**Known gap, flagged not silently dropped:** `#hand`'s `overflow-x: auto` (needed for a hand of
15+ cards to scroll, edge case 14) and `overflow-y: visible` (needed so a hover-raised card can
poke up out of the shrunk `#hand` box) fight the CSS spec rule that forces the non-`auto` axis to
`auto` too when the other is scrolling — meaning a hover-raised card may get vertically clipped
at `#hand`'s own top edge in some browsers, and this can't be proven or disproven without a live
browser (design's own test plan puts hand behavior under manual/localhost verification, not unit
tests). Did not attempt a DOM-surgery ("portal") fix — out of scope for slice 1's CSS-only intent.
**Also not built this slice:** the design's "parent `#battleMat` rect shrinks to the union of both
playfields" line — `#battleMat` is a separate fixed full-height element behind the iframes with
no dependency on `#playfield`'s box today, and iframe content (including the new crop line) was
already painting over/through it correctly without touching it; resizing `#battleMat` itself
looked like it belonged with slice 2's `apply-table-tilt.js` (which already has to compute both
playfields' rects) rather than duplicating that math here. Flag for the user to confirm on
localhost — if `#battleMat`'s own art shows behind the now-higher crop line acceptably, this can
stay deferred to slice 2; if not, it needs its own pass before then.

**Not verified this session** — standing instruction was "do not run node/pnpm/lint tests," and
this repo's CSS/visual changes are verified by the user on localhost (not via the Browser pane),
per standing preference. `#hand`'s `img.draw-flight-source` visibility-hidden rule, the
`mat-active` transparency overrides, and `mat-layouts.mjs`'s `--hand-height` contract were all
re-read and are unaffected by this diff (traced, not run). Everything uncommitted, no worktree,
no branch, per this session's explicit instructions.

## Slice 3 brief (self-contained — start here)

**Goal:** 3D deck stack. Read `.agent/designs/009-tcg-live-table.md`'s "3D deck (slice 3)" section.
Build pure `client/src/setup/zones/deck-stack.mjs`: `deckStackLayers(count, { maxCount, maxLayers })`
→ integer layer count, monotonic, clamped above `maxCount`. Give `#deckCover` stacked edge layers
under the existing cover `<img>`, and make `playmat-anim.mjs`'s `#deckCount` MutationObserver (today
a dead stub, lines ~64-75) call a new `renderDeckStack(countFromText)` — parse defensively, leave the
stack unchanged on non-numeric text (edge case 2). Unit tests: 0/1/60/>60 boundaries (edge cases 1,
3), non-numeric parse (edge case 2).

**Still open from slice 1, not yet picked up:** the design's "parent `#battleMat` rect shrinks to
the union of both playfields" line (self/opp-containers, slice 1 section) was never built — slice 2
only added the tilt transform to `#battleMat`, not a resize. Confirm on localhost whether this still
matters now that the tilt is in; if the mat art shows through acceptably behind the cropped-hand
line, this can keep sliding: otherwise it needs its own small pass.

**Also still open from slice 2:** `tiltDeg`/`perspectivePx`/`eyeYFrac` are untuned placeholders
(14deg/1400px/0.5) and the whole tilt is unverified against a live browser — get the user's OK on
the tilt's actual look before or alongside starting slice 3, per the work plan's stated gate.

---

# Active work — design 008: TCG Live attack preview

Branch: `claude/brave-volta-nu3duk`. Full plan: `.agent/designs/008-tcg-live-attack-preview.md`
(status: reviewed, decisions D1–D6 confirmed, findings R1–R12, no open questions).
One commit per slice; each commit leaves `pnpm test` green. `/clear` between slices.

| Slice | Status | Commit | Notes |
|---|---|---|---|
| 1 | done | befcf56 | `shared/engine/rules/resolve-attack-context.mjs` + unit tests; refactored `rules-bridge.js` to use it |
| 2 | done | 3ed257c | `full-view.js`: `onOpened`, `getPreviewPopHost()`, `interactive` flag |
| 3 | done | 4ff5744 | `attack-preview.js` + CSS — attack zones, Retreat/Pass buttons |
| 4 | done | 2b1f463 | `click-events.js` gating (new `attack-preview-gate.js`) + sidebox button routing |
| 5 | done | 8d29497 | Ability zones (D5) + bench overlay wiring (D6) |
| 6 | done | c761d81 | Deleted the Attack Window panel + its CSS |

**Design 008 is complete — all 6 slices shipped and manually verified (S127).** The click-to-open
overlay (`attack-preview.js`) is now the only attacks/abilities UI; `#rulesAttackWindow` /
`buildAttackWindow()` are gone. S127 ran the design doc's manual verification checklist against a
live `pnpm start` session with two real Playwright browsers: 15/16 checks pass. The one open item
(I45 — damage not observed after a UI-driven attack in this 2-browser harness; did not reproduce
under targeted debugging, likely a stale-read in the harness rather than the attack engine) is
filed separately and does not block closing 008. Caveat: that run was on brave-volta's base, before
main's playmat/zone geometry rework merged here — re-run the geometry-sensitive checks on this tree.
Remaining: archive the design doc and clear this section from NEXTSTEPS.md next touch.

## S126 — slice 6 done (design 008 complete)

Deleted `buildAttackWindow()`/`#rulesAttackWindow` from `rules-bridge.js` (its call site in
`initializeRulesEngine()`, the function body, and the now-dead `listUsableActions` /
`collectUsableAbilityCandidates` / `filterUsableAbilities` / `attack` / `resolveAttackContext`
imports it alone used) and the `.rules-aw-*` CSS block from `index.css`. Confirmed the R11
"no attacks resolved" diagnostic hint is already ported into `attack-preview.js` (slice 3) before
deleting — that was the one thing slice 6 had to check first. Marked the
`docs/card-types-taxonomy.md` "Attack window UI" appendix superseded (left the history in place
rather than rewriting it — it's >5 lines, out of scope for a pass-through fix). No remaining
references to `rulesAttackWindow`/`buildAttackWindow` outside a pre-existing, unrelated
`client/src/css/index.css.bak`. `pnpm test`: 1362/1365 pass, same 3 pre-existing
network-dependent failures as baseline. Commit c761d81.

## S125 — slice 5 done

Built ability zones (D5) + bench overlay wiring (D6). No panel deletion yet — that's slice 6.

**`shared/engine/rules/collect-usable-abilities.mjs`** — new `benchCardHasAbility(card)`:
`isUsableAbilityCard(card, { rulesEnabled: false })`, i.e. "has an interactive ability" independent
of whether it's been used this turn. Needed because D6's bench-click gate cares only about
*presence* (open the overlay if the card has an ability at all), while D4/R10 still needs the
already-used case to render plain-but-visible inside the overlay — so `filterUsableAbilities`'s
pre-filtered list (used abilities dropped) can't answer either question alone.

**`click-events.js`** — `imageClick()`'s gate now computes `hasAbility` via `benchCardHasAbility`
only for `zoneId === 'bench'` (unset for `'active'`, matching the gate's own contract). On the
gate's `'ability'` decision, opens `openAttackPreview(mouseClick.card, mouseClick.card.image, {
zone: 'bench' })`. The `'attack'` branch (slice 4) is untouched.

**`attack-preview.js`** — new `abilityInfoFor(card)` (presence via `benchCardHasAbility`, usability
via `abilityUsed('self', card)`) and `buildAbilityZoneEl`. `renderZones()` now always renders the
ability zone first (via `abilityZoneBounds`) before branching: bench overlays return right after
(D6 — ability zone only, no attack band); active overlays continue into the existing attack-list
render, now passing the real `abilityCount` (0 or 1) into `listAttackZoneBounds` so an ability
pushes the attack band down (D5, geometry already built in slice 3). An ability zone click calls
`runAbilitySteps('self', card)` (imported from `rules-bridge.js` — no circular import, that module
never imports `attack-preview.js`) and deliberately does **not** call `closeAttackPreview()`: D5/R12
say using an ability doesn't end the turn, so the overlay stays open and the existing REFRESH_EVENTS
subscription (already wired in slice 3) re-renders it once the ability's own board mutation fires.
An already-used ability zone gets `.ability-zone--unusable`, no click handler, and `title =
'Already used this turn'` — same D4 treatment as unpayable attacks.

**No new geometry/gate code needed** — `abilityZoneBounds()` (slice 3) and the gate's `'ability'`
branch (slice 4, per its own S124 note: "the gate function below already has a branch for it")
were both already built and already unit-tested (`attack-zone-geometry.test.mjs`,
`attack-preview-gate.test.mjs`) against exactly this slice's cases. Added 3 new
`benchCardHasAbility` tests to `rules-extended.test.mjs` (already in `package.json`'s test list).

**Found in passing:** `attack-preview-gate.test.mjs` and `resolve-attack-context.test.mjs` (built
in slices 1 and 4 respectively) were never added to `package.json`'s explicit `pnpm test` list —
`pnpm test` was silently not running them. Fixed (2-line addition) since it's directly relevant to
this slice's own new coverage; not a rewrite of test infra, just closing a registration gap.

**Not verified this session** — standing instruction was "do not run node/pnpm/lint". `node
--check` (syntax only, not `pnpm test`/lint) confirms all 4 touched/new-content JS files parse
clean, consistent with slices 1-5's "node -c only" precedent — same as S57-S61. `pnpm test` is
owed before slice 6: expect the 3 new `benchCardHasAbility` tests on top of slice 4's baseline,
plus `attack-preview-gate.test.mjs`/`resolve-attack-context.test.mjs` now actually running (they
were previously silently skipped). Manual verification (`pnpm start`) also owed: click your own
active with an ability to see it shift the attack band down; click a benched Pokémon with an
ability to see the ability-only bench overlay open; click one without an ability to confirm
today's select-to-move still holds (E10); use an ability from either overlay and confirm it stays
open and re-renders unusable afterward (R12/E11); confirm the opponent's bench never opens one (R2).

## S124 — slice 4 done

Built Component 4 (click gating) + Component 7 (sidebox routing). No ability/bench UI yet — that's
slice 5's job per the work plan; the gate function below already has a branch for it.

**New `client/src/setup/rules/attack-preview-gate.js`** — pure `shouldOpenAttackPreview({ zoneId,
cardUser, hasSelectHighlight, hasAbility, gate })` returning `'attack' | 'ability' | null`. Kept out
of `attack-preview.js` on purpose so it unit-tests without pulling in that module's DOM-heavy
imports (`full-view.js`, `chat-buttons.js`) — R9. `hasSelectHighlight` short-circuits first (R1: the
move-to-active flow owns that click), then `cardUser !== 'self'` (R2: both iframes have an `#active`,
so `zoneId` alone can't tell your active from the opponent's). `zoneId: 'active'` returns `'attack'`
iff `gate.allowed`; `zoneId: 'bench'` returns `'ability'` iff `hasAbility`, independent of `gate` (an
ability isn't gated by attack-turn legality). Everything else is `null`. Unit tests in
`__tests__/attack-preview-gate.test.mjs` cover all 6 cases from the verification plan.

**`click-events.js`** — `imageClick()`'s final `else` branch (i.e. no `selectHighlight`, so R1 holds)
now checks `rulesState.enabled` first (E14: no gate at all in free-play), then calls the gate with
`hasAbility: false` (bench wiring is slice 5's) and `gate: canPerformAction({ user: mouseClick.cardUser,
action: 'attack' })`. On `'attack'` it calls slice 3's `openAttackPreview(mouseClick.card,
mouseClick.card.image, { zone: 'active' })` and returns before the highlight/select code runs; on
anything else (including today's always-null bench case) it falls through unchanged, so E10 (bench,
no ability, still select-to-move) and R3 (right-click still opens the context menu — untouched) both
hold as before.

**Sidebox routing (`sidebox/p1/chat-buttons.js`, `sidebox/p2/chat-buttons.js`)** — `attackButton`/
`p2AttackButton` now resolve the acting user exactly as `attack()` itself would (`systemState.initiator`
in 2P, else the fixed `'self'`/`'opp'`), then when `rulesState.enabled` look up that side's active card
via `getActivePokemonCard(getZone(user, 'active'))` and call `openAttackPreview` instead of `attack()`
directly. Free-play (`rulesState.enabled === false`) or no active card falls through to the original
direct `attack(user)` call, so nothing changes when rules mode is off (D2/E14). Retreat/Pass sidebox
buttons are untouched per D2 — they stay a separate, mirrored entry point.

Manual verification (R1/R2/R3/E14) deferred to slice 6's integration sweep per the work plan; `pnpm
test`/`pnpm lint` not run this session per user instruction — next session should run both before
starting slice 5.

## S71 — slice 3 done

Built Component 1 core (attack zones + Retreat/Pass only — abilities and the bench overlay are
slice 5's job, per the work plan) and Component 6 CSS.

**New `client/src/setup/rules/attack-zone-geometry.js`** — pure, DOM-free geometry (R9): `
attackZoneBounds`/`listAttackZoneBounds` divide the ~52%-85% attack band into `attackCount` equal
shares and shift the whole band down per `abilityCount` (D3, D5's shift); `abilityZoneBounds`
returns the band just above it (unused by any DOM code yet — slice 5 wires it, styles already
exist per Component 6); `computeContentBox` implements R4's letterbox math — `cover`/no-natural-size
returns the full box (the mat-holo path, whose CSS already forces it to 100%/100%), `contain`
computes the actual visible rectangle from `naturalWidth`/`naturalHeight` so zone percentages land
on the artwork instead of the pillar/letterbox bars the plain-`<img>` path can have.

**New `client/src/setup/rules/attack-preview.js`** — `openAttackPreview(card, targetImage, { zone
})`, `closeAttackPreview()`, `isAttackPreviewOpen()`. Calls slice 2's `openFloatingCardPreview`
with `interactive: true` and hooks `onOpened`'s `whenOpened` promise (R6 — zones only ever mount
after the pop animation *finishes*, never at DOM mount, so a mid-spin click can't hit one).
`renderZones()` re-derives energy/cost via `resolveAttackContext` + `listUsableActions` exactly
like the panel did, minus R7's `appendMessage` inheritance announcement (dropped for good, not
rehomed — Component 5's own note says fold it into I43 once the panel goes in slice 6). Usable
attacks get `.attack-zone--usable` (glow) and a click handler that closes the preview and calls
`attack(rulesState.turnPlayer, true, idx)`; unpayable/once-used ones get `.attack-zone--unusable`
(plain, inert, `title` = the `reason` string) per D4. R11's diagnostic (`console.warn` + the
visible `id=… · data not loaded` hint) is carried over verbatim for the 0-attacks case. Retreat/Pass
buttons mount as siblings in `.card-preview-overlay` (not inside the card face, per R5 — the face
has `overflow:hidden`) and call `retreat('self')`/`pass('self')`, matching the sidebox convention.

**R12 (re-render while open):** subscribes to the same 6 board-mutation events the panel used
(minus the panel's own `rules-turn-began`/`rules-session-reset`, which close the overlay instead)
and re-renders zones in place — but only once `zonesReady` (i.e. after `whenOpened` resolved), so
an event firing mid-animation can't race the zone mount. `rules-turn-began`/`rules-session-reset`
close the overlay outright (E13). Listeners are added in `onOpened` and torn down in `onClosed` —
no listener survives a close.

Bench overlays (`zone: 'bench'`): `renderZones` returns immediately with nothing rendered (no
attack zones, no ability zones yet — D6's ability-only bench overlay is slice 5). The function
accepts and stores `zone` now so slice 5 doesn't need to touch this file's call signature.

**Component 6 CSS** added to `index.css` (`.attack-zone`, `.attack-zone--usable/--unusable`,
`.attack-zone-label`, `.attack-preview-actions`, `.attack-preview-btn` + modifiers,
`@keyframes attack-glow`) plus the `.ability-zone` variants up front since they're the same shapes
— unused until slice 5 wires them, same pattern as the geometry file's unused `abilityZoneBounds`.
Did **not** touch `#rulesAttackWindow`/`.rules-aw-*` — that deletion is Component 5/slice 6, and
the panel is still the only working attacks UI until slice 5 lands (per the ledger's own warning).

New `client/src/setup/rules/__tests__/attack-zone-geometry.test.mjs` (12 tests): 0/1/2/3-attack
band division, non-overlap, ability-shift, out-of-range index, ability-zone presence/absence and
placement above the attack band, and `computeContentBox`'s cover/missing-size/both-letterbox-
directions/exact-match cases. Registered in `package.json`'s explicit test list (added after
`mat-pick.test.mjs`, same directory).

**Not verified this session** — standing instruction was "do not run node/pnpm/lint tests."
`pnpm test` (baseline 1334/1337 → expect 1346/1349 with these 12 new tests, same 3 pre-existing
TCGdex-network failures) and `npx eslint` on the 3 touched/new JS files plus `index.css` are still
owed before slice 4 starts. Manual verification (`pnpm start`) not done either — `openAttackPreview`
has **no call site yet** (Component 4/slice 4 wires `click-events.js` to call it), so nothing in
the running app changed this session; the Attack Window panel is untouched and still the only way
to attack today. Everything uncommitted, no branch, matching S69/S70's pattern.

## S70 — slice 2 done

Modified `client/src/setup/image-logic/full-view.js` per Component 3:
- `getPreviewPopHost()`: new exported getter, returns `cardPreviewState?.popHost ?? null` — the
  one DOM seam `attack-preview.js` (slice 3) needs to mount hit-zones, without exposing the whole
  internal state object.
- `openFloatingCardPreview()` gained two new options: `onOpened` and `interactive` (both default
  to off/false, so every existing caller — `openCardPreview`, `native-deck-builder.js` — is
  unaffected).
  - `onOpened({ popHost, overlay, whenOpened })` fires synchronously right after the overlay/pop
    host are mounted and `playSelectPop` has been kicked off — matching Component 3's "after the
    DOM is mounted and the pop animation starts." `whenOpened` is a promise that resolves only
    when the pop animation actually **finishes** (wired as `playSelectPop`'s `onDone` callback,
    previously unused — `null` — at this call site). This is deliberately handed back rather than
    resolved internally: R6 says zone-click gating belongs to the *animation-end* signal, not
    mount, and Component 3's own text only promises the mount-time fire — `whenOpened` lets slice
    3 satisfy R6 without slice 2 needing to know anything about zones.
  - `interactive`: stored on `cardPreviewState.interactive`; when true, the overlay's click
    handler returns early for any click whose target isn't the overlay itself, instead of always
    calling `preventDefault`/`stopPropagation` — so a click landing on a child (a future attack
    zone) reaches that child's own listener instead of being swallowed by the overlay's
    close-on-background-click handler. Default `false` reproduces today's overlay click behavior
    exactly.
- Updated the `cardPreviewState` JSDoc shape to include `interactive?: boolean`.

No new call site wired yet — `interactive`/`onOpened` are unused until slice 3's
`attack-preview.js` calls `openFloatingCardPreview` with them. Nothing in `openCardPreview()`
(the double-click path) or `native-deck-builder.js`'s call changed.

**Not verified this session** — standing instruction was "do not run node/pnpm/lint tests."
`pnpm test` and `npx eslint client/src/setup/image-logic/full-view.js` are still owed before
slice 3 starts (baseline: 1334/1337, same 3 pre-existing TCGdex-network failures as S69). Manual
double-click card preview comparison (`pnpm start`) also not done — should confirm the existing
preview still opens/closes identically since default args are unchanged. Everything uncommitted,
no branch, matching S69's pattern.

## S69 — slice 1 done

Built `shared/engine/rules/resolve-attack-context.mjs`: DOM-free helper wrapping
`classifyEnergyEffect`/`resolveAttachedEnergyType` (energy-effects.mjs), `parseStadiumCostModifier`
(stadium-effects.mjs), and `parseAttackInheritance` (ability-executors.mjs). Returns
`{ energyTypes, stadiumCostModifier, abilityUsedFlag, priorAttacks, inheritsAttacks }` — added
`inheritsAttacks` (not in the original brief's return shape) so `rules-bridge.js` can keep its
`appendMessage` inheritance announcement at the call site (R7) without re-deriving
`parseAttackInheritance` itself. `priorAttacks` is hardcoded `[]` per R8/I43 — not "fixed" here.

Refactored `rules-bridge.js`'s `refresh()` (lines ~282-307): the DOM-coupled energy filter
(`getZone('self','active').array.filter(...)`) stays at the call site per the WARNING; the
`appendMessage` chat announcement also stays, now gated on `inheritsAttacks`. Removed now-unused
imports (`resolveAttachedEnergyType`, `parseStadiumCostModifier`, `parseAttackInheritance`) —
`classifyEnergyEffect` stays imported, still used elsewhere in the file (line ~1090).

New `shared/engine/rules/__tests__/resolve-attack-context.test.mjs`: 6 tests covering no active
card, empty `attachedEnergyCards`, one `ensureCardData` rejection (skip-and-continue), null
`stadiumCard`, a normal 2-energy + cost-modifier-stadium case, and `priorAttacks` staying `[]`
even when inheritance text is present.

**Not verified this session** — standing instruction was "do not run node/pnpm/lint". `pnpm
test` and `npx eslint` on the touched files are still owed before slice 2 starts (baseline to
compare against: 1334/1337, 3 pre-existing TCGdex-network failures excluded). Manual Attack
Window comparison (`pnpm start`) also not done. Everything uncommitted, no branch, per the
09-2026 sessions' standing pattern (not explicitly re-confirmed this session — worth checking
next time).

## Slice 1 brief (self-contained — start here)

**Goal:** extract the attack-context gathering that `rules-bridge.js` does inline into a shared,
DOM-free, unit-tested helper, and have `rules-bridge.js` call it. Behaviour-neutral: the Attack
Window must look and act exactly the same after this slice. No UI work, no new UI files.

**Read first (and only these):**
- `.agent/designs/008-tcg-live-attack-preview.md` — "Component 2", plus findings **R7** and **R8**
- `client/src/setup/rules/rules-bridge.js:265–330` — the `refresh()` block being extracted
- `shared/engine/rules/attack-window.mjs:119` — `listUsableActions()`, the consumer
- `shared/engine/rules/__tests__/evolution.test.mjs` — test file style (node:test, top-level
  `await import`, `assert/strict`)

**Create `shared/engine/rules/resolve-attack-context.mjs`:**

```javascript
export async function resolveAttackContext({
  activeCard,
  attachedEnergyCards,   // caller supplies — see the DOM warning below
  ensureCardData,        // injected async fn; must be try/caught per card
  stadiumCard,           // may be null
  abilityUsed,           // injected (card) => boolean
}) // => { energyTypes, stadiumCostModifier, abilityUsedFlag, priorAttacks }
```

It should call `classifyEnergyEffect` + `resolveAttachedEnergyType` (`energy-effects.mjs:111,283`),
`parseStadiumCostModifier` (`stadium-effects.mjs:444`) and `parseAttackInheritance`
(`ability-executors.mjs:433`) — these are the exact functions the inline block uses today. The
returned shape is what `listUsableActions()` already consumes, so don't redesign it.

> [!WARNING]
> **The energy filter is DOM-coupled and must NOT move into `shared/`.** The current line is
> `getZone('self','active').array.filter(c => c.type === 'Energy' && c.image?.relative === active.image)`
> — it compares live DOM nodes. That filtering stays in `rules-bridge.js`; the helper receives the
> already-filtered `attachedEnergyCards` array. Same rule for `appendMessage()` (**R7**): the
> attack-inheritance chat announcement stays on the client side and does not enter `shared/`.

> [!NOTE]
> `priorAttacks` is always `[]` at the live call site today, so inheritance never actually fires
> (**R8**, tracked as I43). Preserve that behaviour exactly — return `[]`. Do not "fix" it in this
> slice; it changes attack legality and belongs in its own change.

**Then refactor `rules-bridge.js`:** replace lines ~279–307 with a `resolveAttackContext(...)` call,
keeping the `appendMessage` inheritance announcement and the DOM energy filter at the call site.

**Edge cases the helper must handle** (per the code standard — these need tests, not just code):
no active card, `attachedEnergyCards` empty, `ensureCardData` rejecting for one energy card
(skip it, keep going — today's `try {} catch {}` behaviour), and `stadiumCard` null.

**Definition of done:**
- `shared/engine/rules/__tests__/resolve-attack-context.test.mjs` covers the four edge cases above
  plus a normal 2-energy case with a cost-modifier stadium.
- `pnpm test` green. Baseline is **1334/1337** — the 3 failures in
  `shared/engine/rules/__tests__/card-identity-live.test.mjs` hit TCGdex over the network and fail
  in sandboxed sessions ("Host not in allowlist"). Don't chase them; don't count them as yours.
- `npx eslint shared/engine/rules/resolve-attack-context.mjs <test file> client/src/setup/rules/rules-bridge.js`
  clean **for those files** — repo-wide `pnpm lint` is red on pre-existing CRLF/`no-undef` noise.
- Attack Window still renders identical attack rows with identical payability badges. Verify by
  hand: `pnpm start`, load decks, reach main phase, compare against the pre-change panel.
- No new dependency (if one becomes necessary, it needs a `.agent/DECISIONS.md` line first).

---

# Netcode repair — increment ledger

> [!NOTE]
> **Parked.** Phase 3 reached its flip gate (3.12 passing); flipping the flag is the user's call
> (D8). The ledger below is kept as history — active work is the design 008 section above.


Branch: `feature/netcode-repair`. Full plan: `.agent/designs/002-netcode-repair.md`.
One commit per slice; each commit leaves `pnpm test` green. `/clear` between slices.

| Slice | Status | Commit | Notes |
|---|---|---|---|
| 0.1 | done | 8a79f12 | `SERVER_AUTHORITATIVE` defaults off; `render.yaml` explicit |
| 0.2 | done | 843f13b | `resolveRenderTargets` guard in `apply-view.js`; stadium-wipe repro fixed |
| 1.1 | done | f8f22a2 | Peer-log reconnect catch-up + O2-C fallback |
| 1.2 | done | 3a41122 | Counter-ordered `requestAction` queue |
| 1.3 | done | 57865a0 | Dead-scaffolding deletion; kept requestSyncLogBundle/syncLogBundle (live) |
| 2.1 | done | fc12f49 | Sweep grace + `roomInfo` decoupling |
| 2.2 | done | 4bd8c43 | `clientSeq` clearing, protocol version, `emitCmd` surfacing |
| 3.1 | done (uncommitted) | — | **3A** `instanceMap` round-trip; index fallbacks deleted |
| 3.2 | done (uncommitted) | — | **3A** Disposition map classifies all 59 actions (classify only, no impl) |
| 3.3 | done (uncommitted) | — | **3A** Condition normalisation rejects unknowns |
| 3.4a | done (uncommitted) | — | **3A** Zone-op translations |
| 3.4b | done (uncommitted) | — | **3A** Prize & board translations |
| 3.4c | done (uncommitted) | — | **3A** Setup & turn translations |
| 3.4d | done (uncommitted) | — | **3A** Reveal/look family: all 8 already `replaced_by_redaction`/`announcement_only` in DISPOSITION_TABLE, relay-only by design, no translator case needed |
| 3.4e | done (uncommitted) | — | **3A** `undo` per D6. Fixed I16 first: added a logged `loadDeck` command so deck bootstrap is in `commandLog`; `undo` = commandLog-minus-tail replay from a fresh seeded state |
| 3.5 | done (uncommitted) | — | **3A exit** Replay harness green (1089/1089) against real recorded 2P traffic. Fixed I18 (dead `setup` wiring) and I17 (deal-order desync) along the way |
| — | done | — | **O4 GATE** — ruled A (full authoritative rendering), D11. Unblocks 3B. |
| 3.6 | done (uncommitted) | — | **3B** Shared `buildCardImage` factory (legacy `Card` + authoritative renderer); real `getZone`/`cardListeners` wired via `setDefaultNetcodeContext`, injected only in `socket-event-listeners.js`. Zone-array parity for drag-completing-a-move still open (3.7-3.10) |
| 3.7 | done (uncommitted) | — | **3B** Counters and status overlays (display-only reconciliation) |
| 3.8 | done (uncommitted) | — | **3B** Covers, hand sort, intra-zone order (#10), attachment class (#11) |
| 3.9 | done (uncommitted) | — | **3B** Reveal/look overlays — mechanism already generic, no code; row 23 test; filed I19 |
| 3.10 | done (uncommitted) | — | **3B** Room-change reset + context re-seed |
| 3.11 | done (uncommitted) | — | **3C** Desync detection routed into the 1.1 peer-log path |
| — | closed | — | **3C** Precondition for 3.12 (S54): drag/drop dual-executing legacy `moveCard` + emitting a server cmd — closed by design 003 slices 1-6 (S55-S61), verified against the real suite S62 |
| — | closed | — | **3C** Second precondition for 3.12 (S63): `zoneArrays` never populated from server views (I15), so 3.11's heartbeat/e2e hash tooling had no real per-client state — closed by I24 (S64): both now read a new `apply-view.js` view cache instead; deck excluded from the comparison as owner-secret (O4-A/I5) |
| 3.12 | **passing** | — | **3C** Flip gate: `flip-gate-test.mjs` plays a full 2-browser game flag-on to a real KO win. ALL PASS (4 consecutive runs) after closing I26. Flag not flipped — that call is the user's (D8) |

## Design 003 — authoritative interaction routing (precondition for 3.12)

Full plan: `.agent/designs/003-authoritative-interaction-routing.md`. Approved S55.

| Slice | Status | Commit | Notes |
|---|---|---|---|
| 003-0 | done (uncommitted) | — | `client/src/setup/netcode/authoritative-dispatch.js` primitive + 20 unit tests. Row 1 covered. Fail-open contract: `emitAuthoritativeCommand` returns false (no emit) when translation yields null, so the gated call site falls through to its legacy body instead of losing the action |
| 003-1 | done (uncommitted) | — | `moveCardBundle` gated for locally-initiated moves. `readCardInstanceId` + `dispatchAuthoritativeMoveCardBundle`; `mouseClick.cardInstanceId` in `identifyCard`, instanceIds passed from `drop()`; `setAuthoritativeDispatchContext` seeded in `seedNetcodeContext`. Rows 2-3, 5-9 covered. **Legacy indices are unusable under authoritative rendering — slices 2-5 each need their own DOM-side identity capture.** Relay mirror still dual-executes: I21 |
| 003-2 | done (uncommitted) | — | Zone-op family gated (all 14 funcs): `dispatchAuthoritativeZoneOp`, no card-identity capture needed (family addresses by zone/position, server-resolved) |
| 003-3 | done (uncommitted) | — | **3A** Prize & board family gated (`takePrizes`, `takePrizesByIndex`, `discardBoard`, `handBoard`, `shuffleBoard`, `lostZoneBoard`) — none carry a cardHint, reused `dispatchAuthoritativeZoneOp` unmodified |
| 003-4 | done (uncommitted) | — | Setup & turn family gated: `takeTurn` only (rest of 002 §3.4c already `server_lifecycle`/`client_local`, confirmed) — reused `dispatchAuthoritativeZoneOp` unmodified |
| 003-5 | done (uncommitted) | — | `attack`/`retreat`/`stadium-effect` gated via new generic `dispatchAuthoritativeAction` (no oInitiator prefix, unlike the zone-op gate); `useAbility` gated via `dispatchAuthoritativeUseAbility` with `mouseClick.cardInstanceId` identity capture. `VSTARGXFunction` left ungated — dead local path (I23), translator mismatch (I22) |
| 003-6 | done (uncommitted) | — | `undo` re-verified against the gated paths (row 7) — found and fixed a real bug: local replay was a silent no-op under the flag (see S61) |


Phases 0–2 are done (flag off; they changed only the path already in production).

Phase 3 was re-scoped in S39 after Phase 2 landed. It now splits three ways:

- **3A (3.1–3.5)** — make the server provably right. No renderer, no DOM, zero production
  exposure. Slice 3.5 (replay recorded 2P traffic through `GameRoom`, assert `hashState`
  agreement) is the exit test and the evidence the O4 gate needs.
- **O4 gate** — decide the end state: full authoritative rendering (A), server-as-arbiter only
  (B), or B now with A behind its own gate (C). OPEN. Rule on it with 3.5's evidence in hand,
  record as D11. **Do not start 3B first.**
- **3B (3.6–3.10)** — renderer parity, only if O4-A or O4-C. This is the migration's real cost
  centre: the authoritative renderer today emits a bare `<img>` with no listeners, no counter
  overlays and no covers, so wiring it in as-is would replace a working interactive board with a
  dead picture of one.
- **3C (3.11–3.12)** — desync detection, then the flip.

Verify each slice with `pnpm test` + `pnpm test:2p`. Manual two-browser games only matter from
3.6 onward — before that the renderer is inert by design.

## S68 — I19 closed

Closed I19 (reveal/hide family had no server-side driver). See `.agent/ISSUES.md` closed entry
for the fix. Flag not flipped (D8) — still the user's call. No slice/gate status changed by this
session; this closes the last of the 3 known flip-time gaps S67 named (I25, I27, I19 — all now
closed).

## S67 — I27 closed

Closed I27 (client coin flip vs server starter disagreement). See `.agent/ISSUES.md` closed
entry for the fix. Flag not flipped — still the user's call (D8). No slice/gate status changed
by this session.

## S65 — 3.12 flip gate built and run; flag NOT flipped (I26)

Built `flip-gate-test.mjs` (`pnpm test:flip`): two real browsers, `SERVER_AUTHORITATIVE=1`,
played to a genuine win condition. It runs a full 15-turn game deterministically (3 identical
consecutive runs). Two production gaps had to be closed before it could get that far, and one
it found is a hard blocker.

**Fixed — `pass` was never gated (design 003 slice-5 miss).** `pass` is `server_command` in
`DISPOSITION_TABLE`, same slice-5 family as `attack`/`retreat`/`stadium-effect`, but slice 5
gated those three and `useAbility` and left `pass` out. Under the flag it still ran its whole
legacy body (`discardBoard`, `endTurnWithBanner`) *and* sent a command — exactly the
dual-execution design 003 exists to remove. Gated it with the same
`dispatchAuthoritativeAction` call the rest of the family uses
(`chat-buttons.js`, `commandArgs: [rngBundle]`, matching its own legacy `processAction`).

**Fixed — nothing applied `view.turn`.** Views have always carried
`turn.player`/`isYourTurn`/`number`/`phase`, and `applyView` read exactly one of those fields
(`phase !== 'ended'`, for the end modal). Nothing ever wrote `rulesState`. With every legacy
turn-advance body now skipped, `rulesState.turnPlayer` stayed frozen at whatever the local coin
flip produced while the server advanced its own turn — so the client's *next* command came back
`"It's not your turn."` and the game could not progress past turn 2. New `reconcileTurnState`
(`apply-view.js`) syncs turnPlayer/turnNumber/phase from the view; spectators and turn-less
views are left alone (a spectator view reports `isYourTurn:false` for both sides, so there is no
honest self/opp mapping). It deliberately does **not** dispatch `rules-turn-began` —
`rules-bridge.js` hangs legacy knockout/deck-out adjudication off that event, which the server
now owns; the stale-banner consequence is **I25**.

**I26 closed — the gate now passes.** New `cardStats` command carries the printed data the deck
row cannot: `hp`, `attacks`, `types`, `weakness`, `resistance`, `retreatCost`, `stage` — exactly
the fields the server's own reducers read. It addresses cards by `syncInstance` across *every*
zone and updates them in place, never rebuilding one, so it is safe to arrive mid-game (TCGdex
enrichment is async and can resolve long after `setup` has dealt). Schema in `commands.mjs`,
apply case in `reduce.mjs`, payload builder + emitter in
`client/src/setup/netcode/card-stats.js`, wired from `build-deck.js` once `ensureCardData`
settles. Two bugs surfaced while wiring it, both caught by the gate rather than by reading:
- the send hung off `Promise.all(...).then(...)`, so a *rejected* enrichment skipped it
  entirely — now `.catch(() => {}).then(...)`, sending whatever resolved (the e2e fixture stamps
  its own stats and never enriches at all);
- it read `deck.array` at send time, which by then holds only the 7 undealt cards — setup has
  already moved 13 of 20 into hand and prizes. The card list is now snapshotted at build time,
  so the cards actually in play are the ones that get stats.

**Found, not fixed — I27, turn order is decided twice.** The browsers run their own
`rulesCoinCallOverlay` coin flip, but `server.js:737` calls the `setup` command with
`payload: {}`, so `setupGame` never receives the `firstPlayerId` its signature accepts and falls
through to `starter = activeRng.next() < 0.5 ? ...`. The two disagree about half the time, and
until the first view lands the client that guessed wrong believes it is its own turn and has its
first action rejected. Self-healing once `reconcileTurnState` applies a view, but wrong until
then — same class as I17, same fix shape (feed the flip result to `setup`, or take the starter
from the server). This is what made the gate look flaky before it was diagnosed; the gate now
pulls a view up front (`window.__ptcg.requestView()`, existing `emitRequestView` plumbing) and
waits for `turnState().fromServer` before deciding who acts.

**What I26 was.** `loadDeck` (`reduce.mjs`) builds every server card from the 7-field deck row
`[quantity, name, type, imageURL, number, set, tcgId]`, and nothing server-side ever set `hp` or
`attacks`, so `createCard`'s defaults (`hp: null`, `attacks: []`) stood for every card in every
game. reduce.mjs's KO check (`koHp > 0 && defender.damage >= koHp`) could therefore never be
true: knockouts never fired, no prizes were ever taken, every attack dealt a flat 10 through the
`{name:'Attack', damage:10}` fallback, and weakness/resistance/retreat cost never applied. The
gate showed it directly — damage accumulating 10→20→30→40→50→**60** on a 60 HP Pokémon with
both clients agreeing at every step and nothing happening, the game running on to a deck-out win
at 7 attacks.

**Verified:** 1192/1192 `pnpm test` (12 new tests: 3 `reconcileTurnState`, 5 `cardStats`
reducer/schema, 4 payload builder). `pnpm test:2p` ALL PASS against a flag-off server (legacy
path provably untouched — every change is flag-gated, view-only, or additive). `pnpm test:flip`
**ALL PASS**, 4 consecutive runs: cross-client board agreement after every one of the 6 attacks,
zero `cmdRejected` on either client, KO at exactly 6 attacks, win reason `no Pokémon in play`.
Lint: zero non-prettier errors in any file touched.

**The flag is still off — flipping it is the user's call (D8).** 3.12's exit test now passes, so
the flip is available. Three known gaps ship with it if flipped as-is: **I25** (turn banner and
badges go stale), **I27** (client coin flip vs server starter disagree until the first view),
**I19** (reveal/hide unreachable server-side).

## S64 — I24 closed; 3.12 unblocked

Gave the 3.11 desync heartbeat and the e2e API a real live zone source instead of legacy
`zoneArrays` (never populated under authoritative dispatch, I15). New `lastAppliedView` cache in
`apply-view.js`, set at the end of every accepted `applyView` call and cleared by
`resetRenderState`, exposed via `hasAuthoritativeView`/`getAuthoritativeZoneArray`/
`getAuthoritativeStadiumArray`. Chose this over populating `cardRegistry`-derived arrays because
`cardRegistry` is a `Map` (insertion-ordered), not the view's own order — `hashCardList` joins in
array order, so an order mismatch would itself cause false-positive hashes; the raw last-applied
view has no such risk, since it's literally the array the server sent.

Wired in `sync-check.js` (new `viewBackedGetZone`, used by the heartbeat in
`socket-event-listeners.js` — safe unconditionally, since that heartbeat is itself gated on
`serverAuthoritative`) and `e2e-api.js` (new `liveZoneArray`, prefers the view cache once
populated, falls back to legacy `getZone` before that or in legacy mode — zero behavior change
there, so `replay-harness.test.mjs`'s frozen fixture is unaffected).

Found a second, deeper gap while wiring this: `deck` is redacted to `{ count }` even for its own
owner (design O4-A / I5) — a client can never produce a real per-card deck hash, so even with
`zoneArrays` fixed, comparing deck would be a permanent false positive on every heartbeat.
Excluded `deck` from the 3.11 comparison specifically: client's `PLAYER_ZONES` drops it, and a
new `excludeOwnerSecretZones` (`server/game/sync-check.mjs`) drops it from the server's
`hashStateZones` output before `findFirstDivergentZone` compares. Left `hashState`/
`hashBoardSnapshot` themselves untouched — the replay-harness and legacy dual-run recording still
need full deck fidelity from those (I17-style desync bugs live there).

**Verified:** 1180/1180 `pnpm test` (9 new tests). `pnpm test:2p` ALL PASS (flag off). Lint clean
on every touched file. Server boots clean with `SERVER_AUTHORITATIVE=1` (manual alt-port check).
3.12 itself not started — this only unblocks it.

## S63 — I21 closed; 3.12 blocked on a new finding (I24)

Closed I21: `accept-action.js` now skips the legacy mirror body for a relayed opponent action
(`user === 'opp'`) whenever `systemState.serverAuthoritative` is on and the action's
`DISPOSITION_TABLE` entry is `server_command`/`manual_override` — those are exactly the
actions the server's own view already renders, so running the legacy body too was a double
render. Added `isMirrorSuppressedAction` to `authoritative-dispatch.js` (reused, not
duplicated, since it already imports `DISPOSITION_TABLE` and is the one module every other
relay-gate decision lives in). Every other disposition (`server_lifecycle`,
`replaced_by_protocol/redaction`, `ui_local`, ...) is untouched — the server view carries no
equivalent for those, so they must keep running locally for the mirror to reflect them at all.

Then started 3.12 itself (full two-browser game, flag on, per-turn hash equality, zero
`cmdRejected`) and hit a second, deeper precondition: `two-player-sync-test.mjs` and the
existing `window.__ptcg.boardHash`/`zone()` e2e helpers both read state through
`getZone(...).array` — the legacy per-player `zoneArrays`. Traced whether `apply-view.js`
populates those from a server view: it does not, and says so in its own comment
(`apply-view.js:247-250`), and 3.7/3.8/3.10's own deviation notes (design 002) all confirm the
gap is still open despite those slices being the design's stated place to close it. The 3.11
desync heartbeat (`sync-check.js`'s `computeSyncCheckZones`) has the exact same dependency —
so under full authoritative rendering, that heartbeat would report every zone diverged, not
just render being blind. There is currently no non-broken way for a client to compute a real
state hash under the flag, which is exactly what 3.12's exit test needs. Filed as **I24**
rather than build a flip-gate test on top of a hash source known to be wrong — a green result
from that test would prove nothing. Did not touch `sync-check.js`/`e2e-api.js` beyond reading
them: closing I24 (populating `zoneArrays` from views, or giving sync-check/e2e tooling a
`cardRegistry`-based hash instead) is real design-scope work, not a fix-in-passing.

**Verified:** I21 fix — 1175/1175 `pnpm test` (4 new tests in
`authoritative-dispatch.test.mjs`), `pnpm test:2p` green (flag off), lint clean on all 3 touched
files. I24 is a finding, not a code change — nothing to verify beyond the trace above. 3.12
itself not started (blocked). Everything uncommitted, no branch, per standing instruction.

## S62 — full suite verification (design 003 slices 2-6)

Ran `pnpm test` and `pnpm test:2p` for first time since S56 — slices 2-6 had accumulated as
`node -c`-only, per standing instruction against running the suite those sessions.

**Verified:** 1171/1171 `pnpm test` (0 fail). `pnpm test:2p` ALL PASS (flag off). No issues found —
every slice 2-6 claim (dispatch gating, `undo` fix, fail-open contract) holds against the real
suite. Nothing changed in product code this session. Everything still uncommitted, no branch, per
standing instruction.

## S60 — design 003 slice 5 done

Gated the attack/retreat/stadium/ability family. Traced first: `attack`, `retreat` and
`stadium-effect` carry **no card identity** on the wire (`reduce.mjs` resolves the acting
Pokemon from the server's own `active` zone), so they need no registry lookup — but their
call sites also do **not** prefix `oInitiator` onto their `processAction` parameters the way
slices 2-4's zone-ops do. Extracted the forwarding core as `dispatchAuthoritativeAction`
(verbatim `commandArgs`) and made `dispatchAuthoritativeZoneOp` delegate to it with the prefix
applied — no behavior change for slices 2-4.

`useAbility` did need slice 1's treatment, as the STATE watch-out predicted: its legacy hint
is built from the legacy zone array (empty under authoritative rendering), so
`dispatchAuthoritativeUseAbility` resolves `mouseClick.cardInstanceId` against the registry
instead, and both call sites (`keybinds.js` 'w', `active-bench-buttons.js` ability button)
now pass it as a trailing `authoritativeId` argument. The emitted parameter list keeps the
legacy `[oInitiator, zoneId, index, hint]` shape the existing translator already handles.

`VSTARGXFunction` deliberately **not** gated: no client caller and no `GXButton`/`VSTARButton`
element exists, so its local body is unreachable (and would throw if reached) — filed I23,
plus I22 for its pre-existing `[type]`-vs-`[instanceId]` translator mismatch.

Row 9 note: this family's accepted losses are the biggest yet — local status coins, damage
math, KO narration, `discardBoard` and the local turn-end banner are all skipped for `attack`;
the server reducer does perform damage/KO/checkup/advanceTurn, so the game advances, but the
server's *fidelity* (not just its authority) is now load-bearing. 002's 3.12 flip gate is the
check for that.

**Verified:** `node -c` on all 6 touched/new-content files only — `pnpm test`/lint forbidden
this session per standing instruction. **Not run against the suite.** Four slices (2, 3, 4, 5)
are now unverified against `pnpm test`. 17 new unit tests added to
`authoritative-dispatch.test.mjs` (already in `package.json`'s explicit test list). Everything
uncommitted, no branch, per standing instruction.

## S59 — design 003 slice 4 done

Gated `takeTurn` (`client/src/actions/general/take-turn.js`): only action in 002 §3.4c's
setup/turn family classified `server_command` in `DISPOSITION_TABLE` — `setup`,
`setupPrizes`, `drawOpeningHand`, `readyUp`, `reset`, `restartGame` are `server_lifecycle`
and `changeCardBack`/`changePlaymat` are `client_local`, per 002's own 3.4c note, so none of
those need a gate. Confirmed against `dual-run-bridge.js`: the `takeTurn` translator case
returns `{ type: 'takeTurn', payload: {} }` — no cardHint, same shape as slices 2-3. Reused
`dispatchAuthoritativeZoneOp` unmodified, gated at the top of `takeTurn` (before the
`discardBoard`/`moveCard`/counter-reset local body), one 8-line `if` block.

**Verified:** `node -c` on `take-turn.js` only — `pnpm test`/lint forbidden this session
per standing instruction. Not run against the suite. Three slices now unverified against
`pnpm test` (2, 3, 4) since S56 — next session must run it before slice 5. No new test
file — no new dispatch logic, same reuse pattern as slices 2-3, already covered by slice
2's 24 tests. Everything uncommitted, no branch, per standing instruction.

## S58 — design 003 slice 3 done

Gated the prize & board family (002 §3.4b's list): `takePrizes`, `takePrizesByIndex`
(`client/src/actions/zones/prizes-actions.js`) and `discardBoard`/`handBoard`/
`shuffleBoard`/`lostZoneBoard` (`client/src/actions/general/board-actions.js`) — 6 call
sites total. Same shape as slice 2: none of these legacy functions attach a cardHint
(`dual-run-bridge.js` confirmed — `takePrizes`/`takePrizesByIndex` pass count/indices the
server re-validates against its own prizes zone; the board-ops translators all return a
bare `{ type, payload: {} }`, ignoring the legacy `message` chat-toggle param entirely).
So no new dispatch function was needed — reused slice 2's `dispatchAuthoritativeZoneOp`
unmodified, one 8-line gate call per site, `commandArgs` matching each function's own
`processAction` call verbatim.

Row 9 for this family: local `appendMessage` chat lines are skipped under the gate, same
accepted-loss precedent as slices 1-2 (server's advisory `events` stream is the intended
replacement).

**Verified:** `node -c` on both touched files only — `pnpm test`/lint forbidden this
session per standing instruction. **Not run against the suite** — next session must run
`pnpm test` before continuing (this is now two slices deep unverified: S57's zone-op
family and this session's prize/board family). No new test file added — no new dispatch
logic to unit-test; the two call sites reuse `dispatchAuthoritativeZoneOp`, already
covered by slice 2's 24 tests. Everything uncommitted, no branch, per standing instruction.

## S57 — design 003 slice 2 done

Built `dispatchAuthoritativeZoneOp` in `authoritative-dispatch.js`: gates all 14 zone-op
legacy functions (`shuffleIntoDeck`, `moveToDeckTop`, `switchWithDeckTop`,
`shufflePrizesToDeckBottom`, `shuffleZone`, `shuffleAll`, `shuffleBottom`, `discardAll`,
`lostZoneAll`, `handAll`, `leaveAll`, `discardAndDraw`, `shuffleAndDraw`,
`shuffleBottomAndDraw`). Unlike slice 1's `moveCardBundle`, none of these attach a
cardHint — `dual-run-bridge.js`'s translators for this family already address by zone id
or position and let the server resolve against its own zone array (shuffle order is
never client-supplied; server rolls its own via `activeRng`). So the gate needs no DOM
identity capture at all: it forwards `[oInitiator, ...commandArgs]`, exactly the array
each legacy function already builds for its own `processAction` call — one call site
diff per function, no new client-side parsing.

Row 9 (side effects `processAction` can't replicate) for this family: local chat lines
(`appendMessage`) and `shuffleZone`'s `playShuffleFlight` animation are both skipped
under the gate, same accepted-loss decision slice 1 made for `moveCardMessage` — the
server's advisory `events` stream is the intended replacement, and the animation is a
local-render-only flourish the authoritative renderer doesn't reproduce for the mirror
side today either (3.6-3.10).

**Verified:** syntax-checked all 6 touched/new files (`node -c`) — no `pnpm test`/lint
per this session's standing instruction. 24 new unit tests for
`dispatchAuthoritativeZoneOp` (dispatch, flag-off, mirror-not-gated, opp-not-gated,
untranslatable-falls-through — one representative action per case, not all 14, since the
gate logic is identical across the family). Not run against the suite this session;
next session with tests enabled should run `pnpm test` before continuing. Everything
uncommitted, no branch, per standing instruction.

## S55 — design 003 approved, slice 0 done

User delegated the 003 design gate ("choose for me"); approved as drafted, no changes. Built
slice 0: `client/src/setup/netcode/authoritative-dispatch.js`, the primitive every later 003
slice gates on. `buildAuthoritativeCardHint`/`buildAuthoritativeCardHints` resolve server
`instanceId`s straight out of `apply-view.js`'s `cardRegistry` into the `{ moving, target }`
hint shape `dual-run-bridge.js`'s translators already consume — no `zoneArrays`, no
`syncInstance` translation (registry records are already server-shaped, so
`resolveHintInstanceId` takes the `.instanceId` branch). Both fail closed: a card absent from
the registry yields null, and a bundle whose target is missing is null as a whole, so no command
can ever address one resolved card and one guessed one. `emitAuthoritativeCommand` hands the
action to an injected `processAction` — injected, not imported, because `process-action.js`
reaches `state.js`'s browser-only module scope (same seam and same reason as
`setDefaultNetcodeContext`).

Found while building: the design left unspecified what happens when `translateActionToCmd`
returns null for a gated action. Dispatching anyway would emit a `pushAction` relay with no
command behind it *and* skip the legacy body — the player's move would silently vanish. So
`emitAuthoritativeCommand` pre-checks the translation and returns `false` without emitting;
`false` is the gated call site's contract to fall through to its legacy body, degrading that
case to exactly today's behavior. Slices 1-6 must honor that. One deliberate exception:
`translateActionToCmd` *throws* for an action with no `DISPOSITION_TABLE` entry (its edge case
14) — not caught here, since a missing classification is a build-time bug, not a runtime
fallback.

**Verified:** 1142/1142 `pnpm test` (20 new tests, 1 new test file, registered in the
`package.json` explicit test list). `pnpm test:2p` green (ALL PASS, flag off). Lint clean on
both new files. Everything uncommitted, no branch, per standing instruction.

**No production call site wired**, exactly as slice 0 specified — the seam is unused until
slice 003-1 seeds it in `socket-event-listeners.js`. Nothing in the shipped behavior changed
this session; the module is inert until then.

## S53 — slice 3.11 done

Built desync detection per the design: server's `hashState`/`hashBoardSnapshot` only ever
produced one joined string, so a new `hashZoneMap` (`shared/engine/zones/zone-hash.mjs`) and
`hashStateZones` (`shared/engine/state.mjs`) return the same fingerprint as a `{zoneId: hash}`
map, letting a comparison name the *specific* zone that diverged. Client heartbeat
(`startSyncCheckHeartbeat`/`stopSyncCheckHeartbeat`, `SYNC_CHECK_INTERVAL_MS = 30000`,
re-arming the 30s interval finding #4 named dead) computes its own per-zone hashes via
`computeSyncCheckZones` (new `client/src/setup/netcode/sync-check.js`) from the real `getZone`
already wired since 3.6, and emits `syncCheck` — gated on `serverAuthoritative`, two-player,
not-spectator, and `socket.connected` so it never queues stale hashes across a disconnect.
Server's `socket.on('syncCheck', ...)` (new, alongside `cmd`/`resolveChoice`/`requestView`
inside the `SERVER_AUTHORITATIVE` block) looks up the sender's `playerId` via
`gameRoom.socketToPlayer`, computes `hashStateZones(gameRoom.state, playerId)`, and calls a new
pure `findFirstDivergentZone` (`server/game/sync-check.mjs`) — emits `desync` naming the zone on
mismatch. Client's `desync` handler routes into the existing slice-1.1 `requestPeerLogCatchup()`
— no second recovery mechanism — gated by a new pure `shouldTriggerDesyncRecovery` (row 24: skip
if `systemState.isCatchingUp` or a peer-log request is already pending).

**Verified:** 1122/1122 `pnpm test` (17 new tests across 4 files, 2 new files). `pnpm test:2p`
green (flag off). Server boots clean with `SERVER_AUTHORITATIVE=1` (manual alt-port check — no
import/wiring errors). Lint clean on all 10 touched/new files. Everything uncommitted, no
branch, per standing instruction.

**Not tested at unit level:** the `socket.on('syncCheck', ...)` handler in `server.js` and the
heartbeat/`desync` wiring in `socket-event-listeners.js` — same class of landmine as the rest of
this design (module-scope `main()`/`io()`/`document`, no test harness in this repo). All
comparison, hashing, and recovery-gating logic that *can* be pure was extracted and is unit
tested; the wiring itself was verified by reading the guard and by the manual authoritative-mode
boot.

## S52 — slice 3.10 done

Built `resetNetcodeForRoomChange()` in `socket-event-listeners.js`: calls `resetRenderState()`,
then immediately re-invokes `setDefaultNetcodeContext(...)` (factored out as `seedNetcodeContext`,
reused by `initializeSocketEventListeners`'s original inline call) so the apply-view.js:67-71 trap
(reset nulls the context; skipping the re-seed breaks choice resolution) never trips — then
`resetClientSeq(0)`. Wired at every room-boundary the design named plus one it didn't: `joinGame`
(new room start, right after the protocol-mismatch early-return) and the `leaveRoomButton` click
handler in `room-buttons.js` (design's "leaveRoom handler" — the client-side teardown that resets
`systemState`, not the `socket.on('leaveRoom')` peer-left announcement at
`socket-event-listeners.js:344`, which only appends a chat message for the other player leaving).
Found in passing: `header-buttons.js`'s `p1Button` click handler duplicates the exact same
room-teardown sequence (`cleanActionData`, `reset`, `removeSyncIntervals`, deck repopulation) as a
second, independent "leave room" entry point — wired the same fix there for parity; not naming it
would leave that path desyncing the renderer registry same as the untreated button would have.

**Verified:** 1105/1105 `pnpm test` (no new unit test — see below). `pnpm test:2p` green (flag
off). Lint clean on all three touched files. Everything uncommitted, no branch, per standing
instruction.

**Not tested at unit level:** `socket-event-listeners.js`/`room-buttons.js`/`header-buttons.js` all
import `state.js`, which runs `io()`/touches `document` at module scope — same landmine documented
for `process-action.js` (edge rows 7, 11, 12): unimportable outside a browser, no DOM/socket test
harness in this repo. Verified by reading the guard and by `test:2p`'s live-browser round trip
(join → play → leave → rejoin implicitly exercised by the fixture's join step, though not a
full leave-then-rejoin scenario). The underlying reset-then-reseed primitive
(`resetRenderState()` + `setDefaultNetcodeContext()`) is unit-covered by the existing
`apply-view.test.mjs` "Finding 5: choice resolver uses setDefaultNetcodeContext fallback" test.

## S51 — slice 3.9 done (no production code)

Investigated reveal/look overlays per 3.4d's classification: all 8 legacy actions are
`replaced_by_redaction`/`announcement_only`, so `view.mjs` already carries the
`card.revealed` branch (full data vs `{instanceId}` stub) for prizes/hand. Traced
`createOrUpdateCardElement`'s `isRedacted` check (apply-view.js:215) — it already renders
card-back vs real art purely from whichever fields the view sent, generically for every
zone, so no reveal-specific rendering code was needed. Added `apply-view.test.mjs` "Row 23"
proving the transition across successive views (redacted → revealed → redacted, same
registry entry, one node).

Found in passing: nothing in `shared/engine` ever sets `card.revealed = true` — the
mechanism this slice verifies is currently unreachable, a consequence of 3.4d's existing
relay-only classification, not a new bug. Filed I19 rather than building the missing
command unprompted (out of this slice's scope, real product-behavior call).

**Verified:** 29/29 `apply-view.test.mjs` (1 new test, Row 23). 1105/1105 `pnpm test`.
`pnpm test:2p` green (flag off). Lint clean on touched file. Everything uncommitted, no
branch, per standing instruction.

## S50 — slice 3.8 done

Built `client/src/setup/image-logic/cover-listener-table.js` (`COVER_IMAGE_LISTENERS`,
extracted from `Cover`, mirroring `card-listener-table.js`) and refactored `Cover` onto
the shared `buildCardImage` factory. In `apply-view.js`: `reconcileZoneCover` builds/
updates/removes the deck/discard/lostZone `elementCover` top-card preview per side per
view (deck is count-gated back-skin only — `view.mjs` never sends deck card data, by
design); `resolveCardBackSrc` picks the side's actual chosen skin
(`cardBackSrc`/`p1OppCardBackSrc`/`p2OppCardBackSrc`) instead of a single hardcoded
default, fixing that gap for redacted-card backs too. Fixed #10 (intra-zone order) and
#11 (attached-card class) in `placeCardInZone` — both were one-line: unconditional
`appendChild` reconciles order for free (it moves an existing child to the end), and the
play-zone top-level branch needed `classList.remove('attached-card')` alongside the
leaves-play-zones branch that already had it. Added a `sortZoneCards` render-order hook
(new `hand-sort-context.js`, reusing the existing `sortCardsByDeckList`) so authoritative
hand/discard/lostZone rendering can honor the same deck-list-order behavior legacy forces
in 2P — wired in `socket-event-listeners.js` alongside `getZone`/`cardListeners`/
`coverListeners`, absent (all current tests) leaves rendering order unchanged.

**Verified:** 28/28 `apply-view.test.mjs` (7 new tests). 1104/1104 `pnpm test`. `pnpm
test:2p` green (flag off). Lint clean on all touched files. Everything uncommitted, no
branch, per standing instruction.

## S49 — slice 3.7 done

Built display-only counter/status overlay reconciliation in `apply-view.js`:
`reconcileDamageOverlay`/`reconcileSpecialConditionOverlay`, called per-card after
`placeCardInZone`. Creates/positions/removes the `damage-counter`/status-marker sibling
`<div>`s from `cardData.damage`/`cardData.specialCondition` on every view, reusing
`img.damageCounter`/`img.specialCondition` as the storage slot (same field legacy
`addDamageCounter`/`addSpecialCondition` use) and the shared style helpers
(`damage-counter-style.mjs`, `special-condition-style-apply.js`) so tier/status classes
stay identical to legacy. Position math replicates the legacy absolute-positioning scheme
(`targetRect`/`zoneRect` offsets). Registry cleanup now also strips these overlays, since
they're zone-element siblings, not children of the removed image/container.
**Not closed here:** click-to-edit interactivity (typing into the counter, right-click "add
counter") on an authoritative card — that still routes through legacy functions in
`client/src/actions/counters/*.js`, which need populated `zoneArrays` (same open gap noted
in 3.6). See design doc's 3.7 deviation note.

**Verified:** 24/24 `apply-view.test.mjs` (3 new tests, Row 21). 1097/1097 `pnpm test`.
`pnpm test:2p` green (flag off). Lint clean on touched files. Everything uncommitted, no
branch, per standing instruction.

## S48 — O4 gate ruled A; slice 3.6 done

User ruled O4-A (full authoritative rendering) at the gate, evidence in hand from 3.5. Recorded
D11. Built slice 3.6: `client/src/setup/image-logic/build-card-image.js` (pure `<img>` factory,
no game-state imports) used by both legacy `Card.buildImage` and `apply-view.js`'s
`createOrUpdateCardElement`; `client/src/setup/image-logic/card-listener-table.js`
(`CARD_IMAGE_LISTENERS`) is the one interaction table both consume — legacy directly, the
authoritative renderer only via injection (`setDefaultNetcodeContext({ cardListeners })`,
wired for real in `socket-event-listeners.js`), since `apply-view.js` itself must stay
Node-importable and `click-events.js`/`drag.js` pull in `state.js`'s browser-only module-scope
`io()`/`document` calls. Real `getZone` wired the same way, `window.__getZone` deleted (dead).
Full functional zone-array parity (a drag actually completing a move on an authoritative card)
is **not** closed here — see the design doc's 3.6 deviation note; that's 3.7-3.10's job.

**Verified:** 18/18 new+existing `apply-view.test.mjs` tests green (Row 20 structural coverage +
getZone wiring/adapter/test-seam tests). 1094/1094 `pnpm test` green. `pnpm test:2p` green (flag
off, confirms the new production-wiring imports load fine in a real browser). Lint clean on all
touched files. Everything uncommitted, no branch, per standing instruction.

## S47 — slice 3.5 done, two structural bugs found and fixed

Built `server/game/__tests__/replay-harness.test.mjs` + a real recorder
(`record-legacy-2p-fixture.mjs`) that plays a genuine 2-browser game against a live server
(started with `SERVER_AUTHORITATIVE=1`) and dumps `{action, parameters, clientBoardHash}` per
self-initiated step (`server/game/__tests__/fixtures/legacy-2p-recorded.json`). Replaying that
fixture through a fresh `GameRoom` via the real `translateActionToCmd` bridge surfaced two
structural bugs (both closed, see ISSUES.md):

- **I18:** nothing ever called the `setup` command server-side — decks loaded but hands/prizes
  were never dealt. Fixed: `server.js` now calls it once both players' decks are *actually*
  loaded (`allDecksLoaded`, not just both players present).
- **I17:** the client's legacy hand was dealt by its own local shuffle; the server's
  authoritative hand was dealt by `setupGame`'s own `activeRng` — two independent RNG streams,
  so a card the browser showed in hand was often still in the server's `deck` zone
  (`stale_view` on `moveCard`). Fixed by making the server the sole shuffle authority end to
  end: it emits each player its own syncInstance deal order (`dealOrder` event) once both decks
  are loaded, and the client's `setupPrizes()` waits for and uses it instead of rolling a local
  shuffle (`client/src/setup/netcode/deal-order.js` holds the wait/resolve plumbing). Gated on
  `systemState.serverAuthoritative` — zero behavior change while the flag is off (D8).

  A loosen-the-`from`-check approach was tried first and reverted — it broke an existing named
  invariant test (Edge Case 3: stale_view detection) and didn't even fix the real problem (the
  client and server would still have dealt genuinely different cards). The deal-order fix is the
  one that stuck.

**Verified:** `replay-harness.test.mjs` green against 3 fresh live-browser recordings in a row.
1089/1089 `pnpm test` green (harness now added to the list). Everything in this session is still
uncommitted, no branch, per standing instruction.

3A is now genuinely provably right on real recorded traffic. Ready for the O4 gate.

## S61 — design 003 slice 6 done

Re-verified `undo` (`client/src/actions/general/undo.js`) against every gate built in
slices 1-5. Traced the actual call chain instead of assuming row 7's original claim held:
`undoAsync`'s local replay calls `acceptAction(user, action, params, false, isReplay)` for
each past entry; `acceptAction` computes `emit = user === 'self' ? true : ...`, so every
replayed gated action (`moveCardBundle`, zone-ops, etc.) re-enters its own slice-1-5 gate
with `user: 'self', emit: true` — exactly the condition that gate treats as a fresh
locally-initiated action. Under `serverAuthoritative` this fires `emitAuthoritativeCommand`,
which calls `processAction('self', true, action, parameters)` — but `processAction`'s own
guard (`!systemState.isUndoInProgress`) is false for the whole replay (`undo()` sets it true
before calling `undoAsync`), so every one of those calls silently no-ops: no local mutation
(skipped by the gate), no command sent (swallowed by the guard). The local replay loop under
the flag was doing nothing at all — correctness only survived because the pre-existing
trailing `processAction(user, emit, 'undo', [filteredActionData])` call in `undo()` (which
fires after `isUndoInProgress` is cleared) sends the real `undo` command, and the server's
own commandLog-minus-tail replay (002 3.4e) is what actually reconstructs the board.

Fixed per O1-B rather than leave it load-bearing on that guard interaction: added an explicit
check (`isAuthoritativeDispatchActive() && user === 'self' && emit`) right after the existing
opp-relay early-return, resolving immediately and skipping the whole local replay loop when
true. No new dispatch primitive needed — reused the existing exported
`isAuthoritativeDispatchActive` — since the real server dispatch already happens via the
untouched trailing `processAction` call, calling `emitAuthoritativeCommand` here too would
have double-invoked `processAction` for 'undo' once `isUndoInProgress` clears.

**Verified:** `node -c client/src/actions/general/undo.js` only — `pnpm test`/lint forbidden
this session per standing instruction. **Not run against the suite.** Slices 2-6 are now all
unverified against `pnpm test` since S56 — next session must run it before closing I21 or
touching 002's 3.12 flip gate. No new test file (no new dispatch primitive — the fix reuses
`isAuthoritativeDispatchActive`, already covered by slice 0's tests; the call site itself is
one 4-line `if`, same untestable-in-place limitation as every other gated call site in this
design). Everything uncommitted, no branch, per standing instruction.
