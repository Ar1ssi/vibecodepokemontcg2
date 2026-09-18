# 014: Duplicate Hand Card Stacking
Status: draft
Date: 2026-09-18 · Session: S177

## Problem
When a player holds duplicate copies of a card in hand (e.g. multiple Rare Candies, Ultra Balls, or Energy), each copy currently occupies an independent horizontal slot in the `#hand` ribbon. In Pokémon TCG Live (and the user's reference screenshot), duplicate cards in hand stack together into a single composite card slot:
1. The front card is displayed in full.
2. Duplicate copies stack behind it, stepped upward by a vertical offset (~14px) so each copy's top header banner ("ITEM TRAINER", card name frame) peeks out.
3. A circular count badge (white disc with dark bold text "2", "3", etc.) sits centered horizontally on the top edge of the front card.
4. Hovering lifts the entire stack together. Dragging or clicking plays the top copy, immediately updating the remaining stack count or unwrapping if only 1 copy remains.

## Constraints
- Pure logic must run headless under `node --test` with no DOM or browser dependencies (`shared/engine/zones/hand-stack.mjs`).
- The underlying card collections (`getZone(user, 'hand').array` in legacy/rules mode and `getAuthoritativeZoneArray(side, 'hand')` in server-authoritative mode) must remain completely untouched: all individual `Card` instances keep their distinct identity (`instanceId`, `syncInstance`, `cardId`). Hand count, mulligans, turn legality, and netcode hashes must not be disrupted.
- Hidden/unrevealed cards (card backs or redacted cards) must never stack, as grouping would leak private hand contents to opponents/spectators.
- Hover lift on `#hand` must not clip the stepped background cards or the top circular badge under `#hand`'s `overflow-y: hidden`.
- HTML5 drag-and-drop, context menus, card double-click preview, and keyboard shortcuts must continue functioning identically.
- Zero new runtime dependencies.

## Current state
- `client/src/css/self-containers.css:241-285` (and `opp-containers.css:214-255`): `#hand` is a flex container with `overflow-x: auto; overflow-y: hidden;`. Direct children (`#hand img, #hand .mat-holo`) have `height: calc(200% / 3);` and hover lift `translate: 0 -50%`.
- `client/src/actions/move-card-bundle/move-card.js:611`: Appends moving cards directly to `dZone.element` (`#hand`).
- `client/src/setup/netcode/apply-view.js:763, 1705-1710`: `placeCardInZone` appends authoritative card nodes directly to `zone.element`.
- `client/src/actions/zones/general.js:359-385`: `sort(user, 'hand')` clears images and appends sorted card images to `zone.element`.
- `client/src/initialization/mutation-observers/hand-observer.js:11-17`: MutationObserver on `#hand` calls `adjustAlignment` on childList changes.
- `client/src/setup/image-logic/click-events.js:241`: Checks `event.target.parentElement.id === 'hand'` for context menu positioning.
- `client/src/setup/image-logic/zone-card-lookup.js:14-41`: `findZoneCardIndex` locates a card in `zone.array` by comparing the card instance, `cardId`, `syncInstance`, or `imageAnchor(card.image)`.

## Options

**O1 — Stacking Representation in the DOM**
- Option A: Keep cards as direct children of `#hand` and apply dynamic negative margins, `z-index`, and absolute badge overlays.
  - Tradeoff: Fragile; hover lift on one card does not lift the duplicates behind it; badge positioning cannot easily bind to the card bounding box across horizontal scroll.
- Option B: Wrap duplicate cards (count >= 2) in a dedicated `.hand-card-stack` container in `#hand`.
  - Tradeoff: Creates an intermediate wrapper element, but cleanly groups the front card, stepped back cards, and badge into a unified layout component that lifts cohesively on hover and matches `.play-container` architecture.
- **Pick Option B.** It provides exact visual fidelity to Pokémon TCG Live, clean CSS transitions, and unified hit-testing.

**O2 — Scope of Duplicate Grouping**
- Option A: Group all cards by card back / identity on both sides.
  - Tradeoff: Leaks private hand information when opponent's hand is face down.
- Option B: Group only face-up cards with matching printed `name`. Cards that are hidden (card backs), redacted, or nameless are treated as unique singles.
  - Tradeoff: Requires checking face visibility, but preserves complete fog-of-war privacy and rules integrity.
- **Pick Option B.**

**O3 — Reconciler Invocation Strategy**
- Option A: Trigger exclusively inside `MutationObserver` on `#hand`.
  - Tradeoff: MutationObserver fires asynchronously; DOM mutations inside the observer require careful re-entrancy guards and can cause a visual frame of unstacked layout before snapping.
- Option B: Explicit synchronous calls at all hand mutation sites (`moveCard`, `sort`, `applyView`, `clearZoneImages`), accompanied by a re-entrancy-guarded fallback in `handObserver`.
  - Tradeoff: Touches a few call sites, but guarantees instantaneous, flicker-free rendering before paint.
- **Pick Option B.**

## Design

### 1. Pure Stacking Engine (`shared/engine/zones/hand-stack.mjs`)
Pure functions with zero DOM coupling:
- `computeHandStacks(cards, { isHidden = isCardHidden } = {})`:
  Takes an array of card objects or view card descriptors.
  Iterates cards and identifies face-up cards with matching `name`.
  Returns an array of stack descriptors:
  ```javascript
  {
    key: string,
    name: string,
    count: number,
    isStack: boolean,
    cards: [
      { card, layerIndex: 0, isFront: true, offsetPx: 0, zIndex: count + 1 },
      { card, layerIndex: 1, isFront: false, offsetPx: 14, zIndex: count },
      ...
    ]
  }
  ```
  Preserves relative order based on the first occurrence of each card in hand.

### 2. DOM Stacking Reconciler (`client/src/setup/zones/hand-stack-dom.js`)
- `reconcileHandStacks(user, options = {})`:
  1. Locates `handElement` for `user` (`selfContainerDocument.getElementById('hand')`).
  2. Traverses current card nodes in `#hand` (including cards already inside `.hand-card-stack` containers).
  3. Uses `computeHandStacks` to determine grouping.
  4. For groups with `count >= 2`:
     - Creates or reuses `<div class="hand-card-stack" data-card-name="..." data-stack-count="...">`.
     - Places back cards (`k > 0`) with `transform: translateY(-${k * 14}px); z-index: ${count - k};`.
     - Places front card (`k = 0`) with `transform: translateY(0); z-index: ${count + 1};`.
     - Inserts or updates `<div class="hand-card-stack__badge">${count}</div>`.
  5. For groups with `count === 1`:
     - Unwraps the card node if it was in `.hand-card-stack`.
     - Clears any inline stacking styles and removes the empty wrapper.
  6. Reconciles DOM child order and calls `adjustAlignment(handElement)`.
  7. Guarded by an `isReconciling` latch to prevent observer recursion.

### 3. CSS Styling (`self-containers.css`, `opp-containers.css`)
- `.hand-card-stack`:
  - `position: relative; height: calc(200% / 3); aspect-ratio: var(--card-aspect, 734 / 1024); margin: 0 .25vw; flex-shrink: 0; transition: translate 0.15s ease;`
  - Hover: `#hand > .hand-card-stack:hover { translate: 0 calc(-50% + 18px); z-index: 20; }`
- `.hand-card-stack > img, .hand-card-stack > .mat-holo`:
  - `position: absolute; bottom: 0; left: 0; width: 100%; height: 100%; margin: 0;`
- `.hand-card-stack__badge`:
  - `position: absolute; top: 0; left: 50%; transform: translate(-50%, -50%);`
  - `width: clamp(24px, 2vw, 30px); height: clamp(24px, 2vw, 30px);`
  - `background: #ffffff; border: 1.5px solid rgba(0, 0, 0, 0.2); border-radius: 50%;`
  - `box-shadow: 0 2px 5px rgba(0, 0, 0, 0.35); color: #111111; font-weight: 700; font-size: clamp(14px, 1.2vw, 17px);`
  - `display: flex; align-items: center; justify-content: center; z-index: 25; pointer-events: none;`

### 4. Integration Points
- `move-card.js`: Call `reconcileHandStacks(user)` whenever cards enter or leave `'hand'`.
- `general.js`: In `sort(user, 'hand')`, call `reconcileHandStacks(user)`.
- `apply-view.js`: In `applyView`, call `reconcileHandStacks('self', options)` after `reconcilePlacedCard`.
- `rebuild-zone-dom.js`: In `clearZoneImages`, remove any `.hand-card-stack` wrapper nodes.
- `click-events.js`: Update line 241 from `parentElement.id === 'hand'` to `event.target.closest('#hand')`.

## Edge cases & failure modes — the completeness contract; Builder ticks every row
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | empty / none / zero input | Empty hand produces 0 children, clean exit | [ ] |
| 2 | single cards (no duplicates) | Displayed as normal direct `#hand` children without stack wrappers or badges | [ ] |
| 3 | exactly 2 duplicates | 1 stack with 1 card behind (-14px) and circular badge "2" | [ ] |
| 4 | 3 or 4 duplicates | Stepped back cards (-14px, -28px, -42px) with badge "3" or "4" | [ ] |
| 5 | drag/play a card from stack | Dragged card leaves hand, stack updates to count - 1 or unwraps to single card | [ ] |
| 6 | cancel drag | Card stays in stack at full opacity | [ ] |
| 7 | face-down / hidden cards (card backs) | Never stacked, rendered as individual card backs | [ ] |
| 8 | holo cards in stack | `.mat-holo` wrapper preserved inside stack with active foil shader | [ ] |
| 9 | context menu on stacked card | Right-click identifies card and positions context menu correctly | [ ] |
| 10 | double-click preview | Enlarges the clicked card via high-res preview overlay without unstacking | [ ] |
| 11 | server-authoritative 2P view update | Hand placed from authoritative view and stacked immediately | [ ] |

## Test plan
- Unit tests: `shared/engine/zones/__tests__/hand-stack.test.mjs` verifying stack computation, counts, layering, and hidden card exclusion.
- Regression suite: `pnpm test` (all 1851 existing tests must pass).
- Live verification: Test dragging from duplicate stack in browser / Playwright.

## Work plan
| Slice | Delivers | Green when |
|---|---|---|
| 1 | Pure `hand-stack.mjs` computation engine + comprehensive unit test suite | `node --test shared/engine/zones/__tests__/hand-stack.test.mjs` passes |
| 2 | DOM reconciler `hand-stack-dom.js` + CSS styles in `self-containers.css` and `opp-containers.css` | Stacks and badges render correctly in DOM |
| 3 | Wiring into `move-card.js`, `apply-view.js`, `general.js`, and `click-events.js` | Duplicate cards in hand stack on draw, sort, and play; full suite green |
