# 069: TCG Live hover preview — dwell 0.8 s, enlarged card on the left
Status: draft
Date: 2026-10-15 · Session: S—

## Problem
TCG Live shows a large copy of any face-up card after the pointer rests on it briefly, on the left of the
screen, so a player can read a card without clicking. Here the only way to read a card is double-click
(013 inspector / `openCardPreview`) or the single-click focus on your own Active (067). Both are modal and
cover the board. The user asked for the TCG Live hover: **dwell 0.8 s → an enlarged preview on the left
side of the screen, off the mat**.

## Constraints
- C1 Dwell = **800 ms** (user, 2026-10-15). Other timings below are proposals and still need checking
  against the TCG Live extract (`E:/TCGLive_Extract`, user's machine). Look for the hover/zoom component
  and record its pose, size and fade durations here before slice 3.
- C2 Server authority: every card read goes through `resolvePreviewCard` (`preview-card.mjs:63`). A
  redacted (face-down) card gets **no** preview. That covers the opponent's hand, face-down prizes and
  the deck. Nothing about a hidden card may leak.
- C3 Non-modal: the preview never takes pointer input (`pointer-events: none`), never closes or blocks
  click, double-click, drag or context menu, and never steals focus.
- C4 Cards live in two iframes (`#selfContainer`, `#oppContainer`, `index.ejs:63-64`), and the Stadium lives
  in the main document. The preview mounts once, in the **main document**, like 067 (C5 there).
- C5 Holo: reuse `resolveHoloEffect` / `buildHoloCard` / `startHoloAnimation(…, MAT_HOLO_OPTIONS)`
  (`holo.mjs`) and `toHighResCardImageUrl`. Use no new holo code. Fade the host, never set `opacity` on a
  preserve-3d card (STATE watch-out, 043).
- C6 No new dependency. Desktop pointer only: touch input (`pointerType !== 'mouse'`) never arms the
  dwell timer. Long-press is out of scope. No `prefers-reduced-motion` gating (D56).
- C7 Visual-only parts (CSS, fade) are the user's to check on localhost. The timer state machine,
  eligibility and placement are pure and must be unit-tested.

## Current state (read this session)
- Layout: `#battleMat` is `position: fixed; left: 0; width: 75.5%` (`index.css:204-208`). `.self`/`.opp`
  iframes are 75.5% wide (`index.css:182-194`). In `sidebox-hidden` mode the mat goes to 100%
  (`index.css:3663+`). **The mat is flush with the left edge of the screen, so today there is no off-mat
  space on the left.** This is the main open question (Options §1).
- Left-edge zones: `--prizes-left: 1%; --prizes-width: 7%` and `--bench-left: 20%` in both halves
  (`self-containers.css:45-57`, `opp-containers.css:36-48`). Columns 8–20% of the mat hold no card zone.
- Card listeners: one table for every card `<img>`: `CARD_IMAGE_LISTENERS` (`card-listener-table.js:17`).
  It has click, dblclick, drag*, contextmenu, and no hover entries. The authoritative renderer receives the
  table by injection (`apply-view.js`).
- A per-card pointer layer already exists: `attachMatTilt` (`mat-tilt.mjs:31`) puts `pointermove` /
  `pointerleave` / `dragstart` on the real `<img>`, which shows that `<img>` receives pointer events
  under its holo layers.
- Hand hover lift is pure CSS (`self-containers.css:478-522`). It is compatible, and nothing changes there.
- Modal previews: `isCardPreviewOpen` (`full-view.js:31`), `isCardFocusOpen` (`card-focus.mjs:65`),
  `isCardInspectorOpen` (`card-inspector.mjs:960`). The overlays sit at z-index 2400 (`card-focus.css:29`).
- Re-render: `apply-view.js` rebuilds card `<img>`s. A hovered element can be detached without a
  `pointerout`. The inspector handles the same problem with `REFRESH_EVENTS` + a MutationObserver
  (`card-inspector.mjs:67,479-482`).
- Iframe documents: `selfContainerDocument` / `oppContainerDocument` (`containers.js:8,10`).

## Options
1. **Where the preview sits** (the user must choose. It changes layout cost by an order of magnitude.)
   - A. **Reserve a real left gutter**: shift `#battleMat`, both iframes, `#stadium`, resizers and
     `#boardButtonContainer` right by `--hover-gutter` (about 20vw at 16:9, about 386 px for a 540 px-tall
     card). This is faithful to "off the mat", but the board gets about 26% narrower on every screen, and
     everything that measures the mat (`apply-table-tilt.js`, mat-fx flight targets, resizers,
     `lost-zone-panel.js`) has to be rechecked. The cost is 1–2 extra sessions plus a visual pass on every FX scene.
   - B. **Overlay the mat's left margin**: the preview is fixed at the left edge of the viewport, vertically
     centred, and above the board (z 2300, under modal overlays). It covers the prize column and the empty
     8–20% band while visible. It is non-interactive and only shows while you hover. The board doesn't
     change. When the hovered card itself is under the preview's footprint (your/opp prizes, far-left
     bench), the preview anchors to the **right** edge of the mat instead, so it never hides its own source.
   - C. Over the sidebox (right, truly off the mat). The rest is the same as B. This is the wrong side
     for the user's ask.
   - **Recommendation: B now, built so A is a one-function swap.** Placement is a pure
     `previewPlacement(anchorBox, sourceRect, viewport)`: A only changes `anchorBox` (the gutter rect
     instead of the mat's left margin) plus the layout CSS. B ships in one session and A stays open.
2. **Event wiring**: per-`<img>` entries in `CARD_IMAGE_LISTENERS` (dies with each re-render, no global
   state) vs **delegated `pointerover`/`pointerout` on the three documents** (one install, survives
   re-renders, catches the Stadium). **Pick: delegated.** Install happens once per document load.
   Re-render detachment is handled by `revalidate()` (Design).
3. **Moving between cards once a preview is up**: re-dwell 800 ms on each card vs **warm swap**. A warm
   swap replaces the preview at once while it is visible, or within 300 ms of hiding. **Pick: warm swap**
   (to confirm against the extract). Sweeping the bench or hand then reads naturally, which is the point of the feature.
4. **What it shows**: the plain card (high-res + holo) vs the card + live overlays (damage, status, attached).
   **Pick: plain card.** The inspector (013) remains the place for live state, and duplicating its chrome
   here would fork it.

## Design
**Module `client/src/setup/image-logic/hover-preview-model.mjs`** (pure, no DOM, injected clock):
```
HOVER_DWELL_MS = 800; HOVER_WARM_MS = 300; HOVER_FADE_IN_MS = 120; HOVER_FADE_OUT_MS = 80
createHoverModel({ now, setTimer, clearTimer }) → {
  enter(key, meta) // key = stable card identity (img element ref or card id); meta = {pointerType}
  leave(key)       // ignored if key ≠ current
  suppress(reason) // 'pointerdown'|'drag'|'contextmenu'|'modal'|'blur'|'detached' → hidden, timer cleared
  state()          // {phase:'idle'|'arming'|'shown', key, warmUntil}
  onChange(fn)     // fn({phase, key}) — the DOM layer renders from this only
}
```
- Transitions: idle→arming on `enter` (mouse only). arming→shown when the dwell timer fires. Going from
  shown to a different key's `enter` stays shown with the new key (warm). shown→idle on `leave`/`suppress`
  sets `warmUntil = now + HOVER_WARM_MS`. idle→shown with no timer when `enter` lands before `warmUntil`.
- `previewPlacement({ anchorBox, sourceRect, viewport, aspect = 1.397, heightFrac = 0.5 })` →
  `{ left, top, width, height, side: 'left'|'right' }`. Height = min(heightFrac·vh, anchor height).
  Width = height/aspect. The preview centres vertically on the viewport and clamps inside it.
  `side: 'right'` when `sourceRect` intersects the left-side box.
- `isHoverEligible({ card, modalOpen, dragging, buttons })` → boolean. False for a null card (redacted
  or unresolved), any modal open, a drag in progress, or a mouse button held.

**DOM layer `client/src/setup/image-logic/hover-preview.js`**:
- `installHoverPreview(doc)` is idempotent per document. It adds `pointerover`, `pointerout`,
  `pointerdown`, `dragstart`, `contextmenu` (capture) and `wheel` to `doc`, and `blur` to `doc.defaultView`.
  Callers: main document at startup, plus each iframe's `load` (same seam as the playmat script inject,
  `index.ejs:1147`).
- Hover target → `<img>`: `target.card ? target : target.closest('.mat-holo')?.querySelector('img')`.
  Zone plates do **not** resolve (unlike click's `loneImageOfZone`). Then `resolvePreviewCard(null, img)`
  for C2.
- `pointerout` ignores `relatedTarget` that is still inside the same card (holo layers).
- Render: a single `div#hoverPreview.hover-preview` in the main `document.body`, `position: fixed`,
  `pointer-events: none`, z-index 2300. Content is the `buildHoloCard` wrapper (or a plain `<img>`) at
  high-res. A swap reuses the host and replaces only its child. Show = class `is-shown` (opacity +
  `scale .96→1` on the **host**, `HOVER_FADE_IN_MS`). Hide removes the class. The child is dropped after
  `HOVER_FADE_OUT_MS`.
- `revalidate()` runs on the inspector's `REFRESH_EVENTS` plus a `MutationObserver` on the source's
  zone. It calls `suppress('detached')` when the source `<img>` is no longer `isConnected`. It doesn't
  re-resolve under the pointer, because the next real `pointerover` does that.
- Modal hooks: `openFloatingCardPreview`, `openCardFocus` and `openCardInspector` call
  `suppressHoverPreview('modal')`. The eligibility check also reads the three `is*Open()` flags, so a
  missed hook still can't show a preview over a modal.
- CSS: `client/src/css/hover-preview.css` (linked from `index.ejs`), with tokens `--hover-preview-height`,
  `--hover-preview-edge-gap`, and the fade durations mirrored from the model constants.
  A CSS contract test keeps them equal.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | Hover empty zone / plate / mat | No arm, no preview | [ ] model + e2e |
| 2 | Face-down card (opp hand, prize, deck) | `resolvePreviewCard` → null → nothing, ever | [ ] unit (redacted) + e2e |
| 3 | Leave at 799 ms / re-enter same card | No preview; dwell restarts from 0 | [ ] model (fake clock) |
| 4 | Card A shown → move to B | B replaces A immediately (warm) | [ ] model |
| 5 | Hidden → re-enter within 300 ms / after | Instant / full 800 ms dwell | [ ] model |
| 6 | Mouse down, drag start, right-click | Hide + disarm; click/drag/menu behave exactly as today | [ ] model + e2e |
| 7 | Board re-render detaches the hovered `<img>` | `revalidate` hides it; no orphan preview | [ ] dom test |
| 8 | Inspector / focus / double-click preview opens | Hover hidden and blocked until all are closed | [ ] model + e2e |
| 9 | Hovered card sits under the left footprint (prizes) | Preview anchors to the right of the mat | [ ] placement unit |
| 10 | Tiny viewport (≤ 600 px tall) / sidebox hidden (mat 100%) | Height clamps to viewport; placement still inside it | [ ] placement unit |
| 11 | High-res image 404 / slow | Shows the board-res src first, then upgrades (`applyHighResToImage` pattern); a failed upgrade keeps the low-res src | [ ] dom test |
| 12 | Touch / pen pointer | Never arms | [ ] model |
| 13 | Window blur / alt-tab while armed | Disarm, hide | [ ] model |
| 14 | Mat-FX flight clones (draw, opp-play) under the pointer | Clones carry no `.card`, so they don't resolve and nothing shows | [ ] e2e (pointer parked over hand during draw) |

## Test plan
- Unit (`node --test`): `__tests__/hover-preview-model.test.mjs` covers the state machine with a fake
  clock (rows 3–6, 8, 12, 13), `previewPlacement` (rows 9, 10) and `isHoverEligible`.
- CSS contract: `__tests__/hover-preview-css.test.mjs` checks `pointer-events: none`, that the fade sits on
  the host and not the card, and that the CSS tokens match the model constants.
- E2E: extend `test-card-inspector-e2e.mjs` (`pnpm test:inspector`, authoritative server) with a hover
  step. Hover your bench card for 900 ms → `#hoverPreview.is-shown` holds that card's src. Hover the
  opponent's hand → none. Then mouse-down → hidden.
- Manual (user, localhost): the feel of 800 ms, size, fade, and the side flip on prizes.

## Migration / rollout
n/a for data. To revert, remove the three `installHoverPreview` calls. A settings toggle
(`hoverPreview: on|off`, default on) is proposed in slice 4 only if the user wants one.

## Work plan
| Slice | Files | Signatures & data | Test cases | Green when |
|---|---|---|---|---|
| 1 | create `image-logic/hover-preview-model.mjs` + test | as in Design | rows 3,4,5,6,8,9,10,12,13 with the fake clock; placement 1920×1080 left box → `{left:16, height:540, width:387, side:'left'}` | `node --test` on the file passes |
| 2 | create `image-logic/hover-preview.js`, `css/hover-preview.css` + css test; modify `index.ejs` (link + install on iframe load) | `installHoverPreview(doc)`, `suppressHoverPreview(reason)`, `revalidateHoverPreview()` | rows 2, 7, 11 (jsdom-free: stub doc objects) | `pnpm test:changed` green; lint clean |
| 3 | modify `full-view.js`, `card-focus.mjs`, `card-inspector.mjs` (call `suppressHoverPreview('modal')`); extend `test-card-inspector-e2e.mjs` | none new | rows 1, 2, 6, 8, 14 in e2e | `pnpm test:inspector` green; user localhost pass |
| 4 (only if Option A is chosen) | `index.css` gutter vars for `#battleMat`, `.self`, `.opp`, `#stadium`, resizers, `#boardButtonContainer`; `anchorBox` reads the gutter | `--hover-gutter` | tilt + FX recordings via fx-preview `rec-*.mjs` | user visual pass |

Open for the user: Options §1 (A vs B), §3 (warm swap), and the optional on/off setting.

## Deviations (Builder appends here during build)
