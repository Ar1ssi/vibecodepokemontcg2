# 067: TCG Live card focus — the 3D Active-card popup
Status: approved (user)
Date: 2026-10-11 · Session: S—

## Problem
Today your Active opens a flat enlarged scan in a carousel on **double-click** (design 013, D53).
TCG Live opens its focus view on a **single tap**: the card lifts off the board in perspective to a fixed
pose, the board dims, the hand drops away, and the attack/ability list expands over the card's lower half.
The user asked for that flow rebuilt ("the 3D thing"), after the sprite re-skin (`cf2522a5`) was not enough.

## Constraints
- **D50/D53 superseded for your own Active only** (user, 2026-10-11): single-click on your own Active opens
  the focus view. Bench, Stadium, hand and opponent cards keep today's behaviour. Select-to-move for the
  Active stays reachable by drag and the right-click menu (008 R3's escape hatch).
- C1/C2 (013): the card scan stays visible; chrome that covers print is opaque/frosted; dimming uses
  `filter`, never `opacity` on those panels.
- C4: server authority — every card read goes through `resolvePreviewCard` (`preview-card.mjs`).
- C5: playmat boards (and the **hand**, `#hand` in `self-containers.css:426`) live in iframes; the popup
  mounts in the main document, so the hand is lowered by a class on the iframe's `documentElement`.
- Holo: the focus card is a `buildHoloCard` wrapper (`card-picker.js:89`); `.card__rotator` already reads
  `--rotate-x/-y` (`holo/base.css:129`).
- No new dependency. Legacy (non-authoritative) mode is not verified (memory: legacy untested).
- No `prefers-reduced-motion` gating (memory: user's Windows reports it; D56).
- Visual-only checks are the user's on localhost; pure maths and CSS contracts are tested.

## Current state
Facts read this session (decompile `E:/TCGLive_Extract/Code`, scene dump of `level6`, repo files).

**TCG Live (source numbers, never recalled):**
- Camera `CameraRig/Main Camera`: perspective, **FOV 20°**, rig at y=25 looking down (rot X 90°), camera local
  z=-158, so world camera y=183. Board plane y=0.
- Card mesh `Card.obj`: 6.397 × 8.9 × 0.064 units.
- `AttackMover` (player, `PlayerFloatingSlots_LS/CardActionsAnchor`, level6 obj 15043): pos (-8, **100**, 0),
  rot X 90° (face-on to camera), scale 2. `ZeroMover` tail: `durationInSeconds` **0.25**, `easeing` enum index
  **8** (DOTween `Ease` order: 8 = InCubic), `stopPreviousAnimations` false. Other movers (obj 11468 y=173 scale
  .35, opponent 12497/14048) are not used here.
- `AttackOverlay` (level6 obj 12165): `OverlayOffset` (0.1, 0, 0), top/bottom padding 0.05,
  `closedWindowHeight` 0.3, `maxWindowHeight` 4.25 (card is 8.9 tall), `openCurve` Hermite (0,0,slope 0)→(1,1,slope 2)
  = **t²** (ease-in quad), `maxOpenDuration` **0.3 s**, `closeCurve` = 1-(1-t)² (ease-out quad),
  `maxCloseDuration` **0.15 s**, duration scales with |Δheight|/(4.25-0.3).
- `AttackOverlay.Show`: card to `attackMover`, card non-interactive, `backgroundCover.Show()`, hand collapses
  (`handCollapseController`), HUD (`AttackOverlayHUD`: buff, debuff, stack-view, action-list, close), a
  `closeHitbox` click-outside, card quality → HighRes. Action click → overlay closes, card goes to
  `cardFocusLocal` (not back to its slot). Close without an action → `GoToPreviousMover`.
- Derived pose: card height = 8.9·2 / (2·83·tan 10°) = **60.81 % of viewport height**, width ratio .71876,
  centre x = 50 % + (-8 / visible-width)·100 % ⇒ **34.63 % of width at 16:9**, centre y 50 %.
  Lift scale vs the board plane = 183/83 = 2.205 (× object scale 2).

**Repo (`file:line`):**
- `click-events.js:242` `imageClick` — single click is select-to-move; a no-op under SERVER_AUTHORITATIVE
  (`:281`). `:287` `doubleClick` opens `openCardInspector` for own active/bench (`:367-385`).
- `card-listener-table.js:17-25` — `click`, `dblclick`, drag, `contextmenu` on every card `<img>`. A native drag
  suppresses `click`, so click-vs-drag needs no threshold.
- `card-inspector.mjs:458` `decorateInspectorSlide(built, card, getContext, actions)` → `div.ptcg-inspector`;
  owns the chrome, affordances, delegated clicks, REFRESH_EVENTS re-render and live-context hydration.
  `:791` `closeCardInspector`. This design **reuses it unchanged**.
- `card-pop.mjs:188` `viewportRectOf(el)` — card rect in main-document viewport coordinates.
- `full-view.js:193` `openFloatingCardPreview` — overlay z-index 2400, `closePopups()` (Escape) removes it.
- `table-tilt.mjs:31` `DEFAULT_TILT_DEG = 12`, `PERSPECTIVE 1400`; the tilt is inside each iframe's `#playfield`,
  so `getBoundingClientRect` already returns the tilted box. `#hand` is outside `#playfield`, untilted.
- No hand-collapse state exists (`self-containers.css:426-439`, `--hand-crop-height` `:42`).
- `holo.mjs:549` `startHoloAnimation(card,{auto,phaseOffset,tilt})`; `:503` `MAT_HOLO_OPTIONS`.

## Options
**O1 — how to draw the 3D card.**
A. CSS 3D (perspective container + transform tween on the existing DOM/holo card). Holo keeps working, no dependency.
B. three.js mesh. True depth/shadow, but re-implements every holo effect as shaders.
**Pick A** (user, 2026-10-11).

**O2 — how the list appears.** The game anchors a bottom region over the card's lower 48 %. Our 013 stack is
already laid out per printed text band (signed off over 20 revisions).
A. Keep 013's stack geometry; add the game's expand animation (reveal from its top edge, ease-in quad, 0.3 s).
B. Re-lay out as a bottom-anchored list. Throws away the per-frame band maths for a pixel-match we cannot verify.
**Pick A.** Anchor edge (top vs bottom) is not recoverable from the serialized data; top-edge reveal is a taste call.

**O3 — flight easing.** Source value is DOTween index 8 = InCubic (accelerates into the pose).
A. Faithful: `cubic-bezier(0.32, 0, 0.67, 0)`, 250 ms. B. Out-cubic, which reads as a "pop".
**Pick A**: it is the recovered value; one CSS variable (`--focus-flight-ease`) retunes it if it feels wrong.

**O4 — card edge thickness (0.064 units).** A. Flat card + lift shadow. B. Edge slab pseudo-elements.
**Pick A**: the card barely tilts; the slab adds seams to every holo layer for ~3 px at 60 vh.

**O5 — double-click on your Active.** A. Route to the same focus (idempotent). B. Keep opening the carousel.
**Pick A**: the second click of a double-click lands on the backdrop, so B would flash open/closed. Attached
cards move to the HUD Stack button, which opens the existing carousel with the same `attachedSlides`.

**O6 — what happens on an action click.** A. Fly back to the slot (0.25 s). B. Restore at once (the game sends
the card to a different mover, not back).
**Pick B** for attack and retreat (the attack FX plays at the slot); close by backdrop/✕/Escape flies back (A).

## Design
### Modules
- `client/src/setup/rules/card-focus-geometry.mjs` — pure, no DOM:
  ```js
  export const FOV_DEG = 20;
  export const FLIGHT_MS = 250;            // ZeroMover.durationInSeconds
  export const FLIGHT_EASE = 'cubic-bezier(0.32, 0, 0.67, 0)';   // DOTween index 8, InCubic
  export const EXPAND_MS = 300;            // AttackOverlay.maxOpenDuration
  export const EXPAND_EASE = 'cubic-bezier(0.11, 0, 0.5, 0)';    // openCurve = t²
  export const COLLAPSE_MS = 150;          // maxCloseDuration
  export const COLLAPSE_EASE = 'cubic-bezier(0.5, 1, 0.89, 1)';  // closeCurve = 1-(1-t)²
  export const COLLAPSED_FRACTION = 0.3 / 4.25;                  // closedWindowHeight / maxWindowHeight
  export const perspectiveFor = (viewportHeight) => number;      // (h/2) / tan(FOV/2)
  export const focusRect = ({ width, height }) => ({ left, top, width, height });
  export const flightTransform = (fromRect, toRect, { tiltDeg }) => ({ translateX, translateY, scale, rotateX });
  export const expandDurationMs = (fromFraction, toFraction) => number;   // |Δ| / (1 - COLLAPSED_FRACTION) · EXPAND_MS
  export const collapseDurationMs = (fromFraction, toFraction) => number; // same scaling · COLLAPSE_MS
  ```
- `client/src/setup/rules/card-focus.mjs` — DOM + lifecycle:
  ```js
  export function openCardFocus({ card, zone, attachedSlides, onAttack, onAbility, onRetreat }) -> boolean
  export function closeCardFocus({ immediate = false, returnToSlot = true } = {}) -> void
  export const isCardFocusOpen = () => boolean
  ```
  Builds `.card-focus` (main `document.body`, z-index 2400) > `.card-focus__backdrop`, `.card-focus__stage`
  (`perspective: perspectiveFor(innerHeight)px`) > `.card-focus__card` (holo wrapper through
  `decorateInspectorSlide`), `.card-focus__hud` (✕ close; Stack when `attachedSlides.length`).
- `client/src/css/card-focus.css` (imported by `index.css`) — layout, backdrop, shadow, HUD.
- `self-containers.css` — `.hand-lowered #hand { transform: translateY(105%); transition: transform .25s ease-in; }`.
- `click-events.js` — own Active (`zoneId==='active'`, `cardUser==='self'`, resolved card) routes **both** `click`
  and `dblclick` to `openCardFocus`; everything else unchanged.
- `close-popups.js` — `closePopups()` also calls `closeCardFocus({ immediate: true })`.

### Flow
1. `openCardFocus`: no-op if open or `!card?.image`; `closePopups()` first. Read `from = viewportRectOf(card.image)`
   and `to = focusRect(viewport)`. Hide the source (`visibility:hidden`, restored on close). Add `hand-lowered` to the
   self iframe `documentElement`.
2. Mount; `await image decode` (1.5 s cap). Animate `.card-focus__card` with WAAPI from
   `flightTransform(from, to, {tiltDeg: 12})` to identity over `FLIGHT_MS` / `FLIGHT_EASE`; lift shadow grows
   with it; backdrop fades in over the same time. The list (`.ptcg-stack`, `.ptcg-stats`) is revealed with
   `clip-path: inset(0 0 calc(100% - h) 0)` from `COLLAPSED_FRACTION` to 1 over `EXPAND_MS` / `EXPAND_EASE`,
   concurrently with the flight (the game starts both in `OnOpen`).
3. While open: pointer tilt via the picker's holo hover handlers; REFRESH_EVENTS re-render through the reused
   inspector state; window resize recomputes `focusRect` and re-places the chrome.
4. Close (backdrop click after the 120 ms arm delay, ✕, Escape, `rules-turn-began`, `rules-session-reset`):
   collapse the list (`COLLAPSE_MS`), fly back, unhide the source, raise the hand. Attack/retreat: restore at once.
5. Attack → `closeCardFocus({returnToSlot:false})` then `attack(rulesState.turnPlayer, true, index)`;
   retreat likewise; ability keeps the focus open (re-renders on the board event), as 013 does.

### State
Module-level `focusState = null | { root, card, sourceImg, sourceVisibility, animations, armed, onResize }`.
A second `openCardFocus` while open returns `false`. `closeCardFocus` is idempotent.

## Edge cases & failure modes — the completeness contract; Builder ticks every row
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | Card unresolved, face-down, or no `image` | `openCardFocus` returns false; old click path (no-op under server authority) | [ ] |
| 2 | Click on an own Active while rules are disabled or it is not your turn | Focus opens read-only: model gives no `usable` panels, no affordances | [ ] |
| 3 | Viewport ≤ 320 px wide or portrait (900×1200) | `focusRect` keeps ≥ 16 px margin, width ≤ 90 % of viewport, still 0.71876 aspect | [ ] |
| 4 | Double-click on the Active | One focus, never a flash: second click lands on the backdrop inside the arm delay and is ignored; `dblclick` routes to the same idempotent open | [ ] |
| 5 | Open while a carousel/preview/picker is up | `closePopups()` first, then open | [ ] |
| 6 | Source card removed or moved mid-focus (attack, board event) | Focus stays; on close no unhide target → fade out instead of fly-back | [ ] |
| 7 | Image decode fails or exceeds 1.5 s | Open with the plain `<img>` and no tilt; chrome placed on `load` | [ ] |
| 8 | Close pressed mid-flight | Reverse the running animation from its current progress, not restart | [ ] |
| 9 | Window resize while open | `--u`/perspective/focus rect recomputed; chrome re-placed (existing `placeChrome`) | [ ] |
| 10 | Turn changes or session resets while open | Existing CLOSE_EVENTS tear down the chrome state; focus closes immediately | [ ] |
| 11 | Ability opens a server `pendingChoice` picker | Focus closes immediately so the picker is not hidden under z-index 2400 | [ ] |
| 12 | Opponent Active / Bench / hand / Stadium click | Unchanged (013 inspector or plain preview) | [ ] |
| 13 | Hand class never removed (crash mid-close) | `closeCardFocus` always runs `finally` removing `hand-lowered`; `rules-session-reset` also clears it | [ ] |
| 14 | Attached cards present | HUD Stack button opens `openCarouselViewer` with the same ordered `attachedSlides`; focus closes first | [ ] |
| 15 | `prefers-reduced-motion` | Not gated (user decision, memory) | struck: policy |
| 16 | Legacy (non-authoritative) mode | Same path via `resolvePreviewCard`; not verified (legacy untested) | struck: out of verification scope |

## Test plan
- Unit (`node --test`): `card-focus-geometry.test.mjs` — constants, `perspectiveFor`, `focusRect` (16:9, 16:10,
  portrait clamp), `flightTransform` identity/scale/translate, `expandDurationMs`.
- Contract: `card-focus-css.test.mjs` — backdrop/stage carry no `opacity` on covering panels (C2), `perspective`
  set from JS not hardcoded, `self-containers.css` defines `.hand-lowered #hand`, `index.css` imports the sheet.
- Routing: `click-events` open decision extracted as a pure `shouldOpenCardFocus({zoneId, cardUser, card})` and tested.
- Manual (user, localhost, `SERVER_AUTHORITATIVE=1`): click Active; flight, dim, hand drop, list expand; close
  paths; attack from the list; double-click; resize; Fire/Lightning/GX/passive-ability card.

## Migration / rollout
No data. Revert = revert the commits; the 013 inspector path is untouched for every other zone. A new
Decision (supersedes D50/D53 for the own Active) lands with the last slice.

## Work plan — slices ≤1 session, each leaving the repo green
| Slice | Files (create / modify) | Signatures & data shapes | Test cases: input → expected | Rulings used (source) | Green when |
|---|---|---|---|---|---|
| 1 | create `client/src/setup/rules/card-focus-geometry.mjs`, `__tests__/card-focus-geometry.test.mjs` | exports listed in Design › Modules | `perspectiveFor(1080)`≈3062.5 (±0.1); `focusRect({1920,1080})`≈{left 428.8, top 211.6, width 472.1, height 656.8} (±0.5); `focusRect({1280,720})`≈{285.9, 141.1, 314.7, 437.9}; `focusRect({1440,900})`≈{277.3, 176.3, 393.4, 547.3}; `focusRect({900,1200})`: left ≥ 16, width ≤ 810, width/height = 0.71876 ± 0.001; `flightTransform(r, r, {tiltDeg:0})` = {translateX 0, translateY 0, scale 1, rotateX 0}; from {left 0, top 0, width 100, height 140} to {left 100, top 100, width 200, height 280} with tiltDeg 12: scale 0.5, translateX = fromCentreX − toCentreX = −150, translateY = −170, rotateX 12; `expandDurationMs(COLLAPSED_FRACTION,1)` = 300, `expandDurationMs(1,1)` = 0; `collapseDurationMs(1,COLLAPSED_FRACTION)` = 150 | scene dump: AttackMover 15043, AttackOverlay 12165, Card.obj bbox, Camera fov 20 | geometry test file green |
| 2 | create `client/src/css/card-focus.css`; modify `client/src/css/index.css` (`@import`), `client/src/css/self-containers.css` (`.hand-lowered #hand`); create `__tests__/card-focus-css.test.mjs` | classes `.card-focus`, `__backdrop`, `__stage`, `__card`, `__hud`, `__close`, `__stack`; vars `--focus-flight-ease`, `--focus-flight-ms` | CSS test: `.card-focus` z-index 2400; no `opacity:` in `.card-focus__card`/`.ptcg-stack` rules; `.hand-lowered #hand` has `transform: translateY(105%)`; `index.css` contains `@import url('./card-focus.css')` | 013 C1/C2 | `node --test` CSS test green |
| 3 | create `client/src/setup/rules/card-focus.mjs`; modify `click-events.js`, `close-popups.js`; export `viewportRectOf` import only | `openCardFocus`, `closeCardFocus`, `isCardFocusOpen`, `shouldOpenCardFocus({zoneId, cardUser, card})` | `shouldOpenCardFocus({zoneId:'active',cardUser:'self',card:{image:{}}})`=true; `{zoneId:'bench',...}`=false; `{zoneId:'active',cardUser:'opp',...}`=false; `{zoneId:'active',cardUser:'self',card:null}`=false; open twice → second returns false | design Flow 1–5; edge rows 1,4,5,8,10,11,13 | `pnpm test:changed` + lint green |
| 4 | modify `card-focus.mjs`, `card-focus.css` | flight WAAPI, list reveal `clip-path`, HUD Stack/✕, resize observer, pointer tilt | Playwright step added to `test-card-inspector-e2e.mjs`: click own Active with REAL input → `.card-focus` present, `.hand-lowered` set on the self frame, a payable `.ptcg-atk` click fires the attack and removes both | design Flow 2–4; edge rows 2,3,6,7,9,14 | e2e passes on a hand-started `SERVER_AUTHORITATIVE=1` server (user runs it) |
| 5 | modify `.agent/DECISIONS.md`, `.agent/MAP.md`; mark designs 008/013 notes | one Decision line (supersedes D50/D53 for own Active) | n/a — docs | | full `pnpm test` green; Review pass (`review.md`) on the diff |

## Deviations (Builder appends here during build)
- Slice 2 (cosmetic): the hand is lowered by moving `bottom` (`.hand-lowered #hand { bottom: calc(-3.2 * var(--hand-crop-height)) }` + the fixed `#hand::before` strip), not `transform: translateY(105%)`. A transform on `#hand` would make it the containing block of the fixed strip and the strip would jump. The CSS test pins `bottom` and forbids a transform on `#hand`.
