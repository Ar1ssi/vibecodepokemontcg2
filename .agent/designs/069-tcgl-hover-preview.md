# 069: TCG Live hover preview — dwell 0.8 s, enlarged card in the blurred band left of the mat
Status: approved (self — one-shot)
Date: 2026-10-15 · Session: S—

## Problem
TCG Live shows a large copy of any face-up card after the pointer rests on it briefly, on the left of the
screen, so a player can read a card without clicking. Here the only way to read a card is double-click
(013 inspector / `openCardPreview`) or the single-click focus on your own Active (067). Both are modal and
cover the board. The user asked for the TCG Live hover: **dwell 0.8 s → an enlarged preview in the
blurred area to the left of the mat**, swapping instantly between cards. They also want it **toggleable
in settings**.

User, verbatim:
- "Draft a plan for the implementation of the tcg live card hover mechanic, where if a card is hovered
  over for 0.8s an enlarged preview shows up on the left side of the screen, off the mat."
- "Im talking about the blurred area off of the mat. Keep the instant swap. Add a setting for it."
- "Go ahead and one shot it, then have a hostile fresh reviewer check it, then implement the fixes it finds."
- "No. Hover only needs to show the top card if its a pokemon." (said mid-build, when attached-Energy
  art was being wired up)

## Acceptance
| # | Criterion (the user's words) | Evidence |
|---|---|---|
| A1 | "hovered over for 0.8s" → preview appears | model test `arms on enter and shows after exactly 800 ms` |
| A2 | "enlarged preview … left side of the screen, off the mat" / "the blurred area off of the mat" | placement tests rows 9–10; dom test `places the preview in the band left of the probe` |
| A3 | "Keep the instant swap" | model test `warm swap`; dom test `swaps instantly` |
| A4 | "Add a setting for it" | fx-settings tests; dom test `setting off hides and blocks` |
| A5 | "only needs to show the top card if its a pokemon" | model tests `stackTopCard`; dom test `hovering an attached Energy previews the top Pokémon` |

## Assumptions
- (assumed) The top-card rule covers the whole in-play stack: hovering the Pokémon, its attached Energy
  token, a Tool, or a lower Stage previews the top Pokémon. Hand, Stadium, discard and board cards
  preview themselves. Why: this is the only stack on the board; elsewhere every card is its own top card.
- (assumed) If a stack's root is not a Pokémon (free-play mat), the hovered card previews itself.
- (assumed) Built on the session's designated branch in the primary folder, not a `feature/<slug>`
  worktree. Why: the session's git instructions pin the branch.

## Constraints
- C1 Dwell = **800 ms**, and the swap is **instant** while a preview is up (user, 2026-10-15). Fade
  durations are proposals and still need checking against the TCG Live extract (`E:/TCGLive_Extract`,
  user's machine).
- C2 Placement = the **blurred band left of the mat art** (user, 2026-10-15): the strip between the
  board's left edge and the letterboxed mat, filled by `img.mat-ambient-image`. The preview must not
  cover the mat art or its card zones.
- C3 Server authority: every card read goes through `resolvePreviewCard` (`preview-card.mjs:63`). A
  redacted (face-down) card gets **no** preview, so nothing about a hidden card leaks: the opponent's
  hand, face-down prizes and the deck.
- C4 Non-modal: `pointer-events: none`. It never closes or blocks click, double-click, drag or context
  menu, and never steals focus.
- C5 Cards live in two iframes (`#selfContainer`, `#oppContainer`, `index.ejs:63-64`), and the Stadium
  lives in the main document. The preview mounts once, in the **main document** (as 067 C5 does).
- C6 Holo: reuse `resolveHoloEffect` / `buildHoloCard` / `startHoloAnimation(…, MAT_HOLO_OPTIONS)`
  (`holo.mjs`) and `toHighResCardImageUrl`. Use no new holo code. Fade the host, never set `opacity` on a
  preserve-3d card (STATE watch-out, 043).
- C7 Setting: on by default and stored in `localStorage` like the other board settings. Turning it off
  hides a visible preview at once and stops arming. It is independent of "Disable board effects".
- C8 No new dependency. Desktop pointer only: `pointerType !== 'mouse'` never arms the timer. No
  `prefers-reduced-motion` gating (D56).
- C9 Visual-only parts (CSS, fade, size) are the user's to check on localhost. The timer model,
  placement, eligibility and the setting are pure and must be unit-tested.

## Current state (read this session)
- **Board box**: `#battleMat` is `position: fixed; left: 0; width: 75.5%` (`index.css:204-208`), tilted
  by `--tilt-transform` (design 009). It is 100% wide in `sidebox-hidden` mode (`index.css:3663+`).
  `.self`/`.opp` iframes are the same width (`index.css:182-194`).
- **The blurred band**: each `.mat-half` paints `img.mat-ambient-image` blurred (`blur(32px)
  brightness(.4)`, `index.css:261-272`) under `img.mat-art-image`. The art is positioned by
  `--mat-offset-x` / `--mat-width` (`index.css:281-286`). `layoutToCssVars` (`mat-layouts.mjs:253`)
  letterboxes the art when the layout has an aspect:
  `--mat-width = min(container, half-height × --mat-scale × aspect)`,
  `--mat-offset-x = (container − --mat-width)/2`. The zones scale into that same rect (`scaleLeft`,
  `mat-layouts.mjs:311-319`). The same vars go onto both iframes' `<html>` (`apply-mat-layout.js:77-90`).
- **Which layouts have a band**: one-player mats (contain, aspect from the art, `withImageAspect`) and
  no-mat / edge-to-edge (aspect 1.9394, `NO_MAT_LAYOUT_ID`, `apply-mat-layout.js:103`). The `sim`
  default for unclassified titles and two-player mats have **no aspect**, so `--mat-offset-x = 0` and
  there is no band. With no mat chosen, `#battleMatArt` is `[hidden]` (so it can't be measured), but the
  zones are still letterboxed.
- Band width at 1920×1080, sidebox open, edge-to-edge, `--mat-scale` 1: (1450 − 540·1.9394)/2 ≈ **201 px**
  before tilt. With the sidebox hidden it is ≈ 436 px. A lower `--mat-scale` (playmat-size slider,
  `native-deck-builder-mat-picker.js:33-71`) widens it.
- **Band neighbours**: `#selfResizer`/`#oppResizer` are thin handles at `left: -0.55%`, near the vertical
  middle (`index.css:515-532`). `#boardButtonContainer` floats in the **right** band (`index.css:553-575`).
- **Card listeners**: `CARD_IMAGE_LISTENERS` (`card-listener-table.js:17`) has no hover entries.
  `attachMatTilt` (`mat-tilt.mjs:31`) proves that the real `<img>` receives pointer events under its holo layers.
- **Hand hover lift** is pure CSS (`self-containers.css:478-522`). Nothing changes there.
- **Modal previews**: `isCardPreviewOpen` (`full-view.js:31`), `isCardFocusOpen` (`card-focus.mjs:65`),
  `isCardInspectorOpen` (`card-inspector.mjs:960`). Their overlays sit at z-index 2400 (`card-focus.css:29`).
- **Re-render**: `apply-view.js` rebuilds card `<img>`s, so a hovered element can detach without a
  `pointerout`. The inspector solves the same problem with `REFRESH_EVENTS` + a MutationObserver
  (`card-inspector.mjs:67,479-482`).
- **Settings**: checkboxes in `#settingsToggles` (`index.ejs:416-452`), wired in
  `sidebox/settings.js:57-95`. Storage is the pure `fx-settings.mjs` (keys `ptcg-*`, `readSettings`,
  `writeSetting`). `fx-settings.js` applies it, and `onFxSettingsChanged` (`fx-settings.js:46`) notifies
  listeners. `crowdOff` is the precedent for a setting stored as `'0'`/`'1'`.

## Options (resolved)
1. **Placement**: the blurred band left of the mat art (user). To find the band, there are two choices:
   (a) measure `img.mat-art-image`, which reads zero while `#battleMatArt` is hidden (no mat chosen);
   (b) recompute the CSS maths in JS, which duplicates `layoutToCssVars` and ignores the tilt; or
   (c) **use a hidden probe in each iframe** that sits on `--mat-offset-x` / `--mat-width`. **Pick: (c).**
   The probe uses the same vars as the zones, works with or without art, and its rect already includes the tilt.
2. **No band** (two-player mats, `sim` layout, or a band narrower than `HOVER_MIN_WIDTH`): the preview
   overlays the board's left edge at `HOVER_MIN_WIDTH`. It does not stay hidden, because the toggle
   already covers "I don't want it" (decided for the user, reversible).
3. **Event wiring**: **delegated** `pointerover`/`pointerout` on the main document plus both iframe
   documents. That means one install, and it survives re-renders and catches the Stadium.
4. **Card to card**: **warm swap** (user). While a preview is shown, or within 300 ms of it hiding,
   entering another card replaces it with no dwell.
5. **Content**: the plain card (high-res + holo). Live state (damage, status, attached) stays the
   inspector's job.
6. **Setting storage**: a new key in `fx-settings.mjs` (`ptcg-hover-preview-off`) vs a new store.
   **Pick: fx-settings.** It is already the board-settings store, with a tested read/write and a change hook.

## Design
**Pure model: `client/src/setup/image-logic/hover-preview-model.mjs`**
```
HOVER_DWELL_MS = 800; HOVER_WARM_MS = 300; HOVER_FADE_IN_MS = 120; HOVER_FADE_OUT_MS = 80
HOVER_EDGE_GAP = 12; HOVER_MIN_WIDTH = 160; HOVER_MAX_HEIGHT_FRAC = 0.9; CARD_ASPECT = 1.397

createHoverModel({ now, setTimer, clearTimer }) → {
  enter(key, { pointerType })  // key: the hovered <img> (identity compare)
  leave(key)                   // ignored unless key is current
  suppress(reason)             // 'pointerdown'|'drag'|'contextmenu'|'wheel'|'modal'|'blur'|'detached'|'setting'
  state()                      // { phase: 'idle'|'arming'|'shown', key, warmUntil }
  onChange(fn)                 // fn({ phase, key }); the DOM layer renders only from this
}
```
- idle → arming on `enter` (mouse only). arming → shown when the dwell timer fires.
- shown + `enter(otherKey)` stays shown with the new key, with no timer (warm swap).
- shown → idle on `leave`/`suppress`, which sets `warmUntil = now() + HOVER_WARM_MS`.
- idle + `enter` with `now() < warmUntil` goes straight to shown (warm). `suppress` other than `leave`
  clears `warmUntil` (a click or drag ends the sweep).
- arming + `leave`/`suppress` clears the timer and returns to idle.

`gutterBox({ boardRect, probeRects, viewport })` → `{ left, top, width, height }`: from
`max(0, boardRect.left)` to `min(probeRects[*].left)`, full viewport height. A missing probe rect is
ignored, and with none it returns width 0.

`previewPlacement({ gutter, boardRect, sourceRect, viewport })` → `{ left, top, width, height, mode }`:
- `mode: 'band'` when `gutter.width − 2·HOVER_EDGE_GAP ≥ HOVER_MIN_WIDTH`. Then width = that value,
  height = width·CARD_ASPECT, capped at `HOVER_MAX_HEIGHT_FRAC·viewport.height` (the width is recomputed
  from the cap). Left = `gutter.left + (gutter.width − width)/2`, and the box is vertically centred.
- otherwise `mode: 'edge'`: width = `HOVER_MIN_WIDTH`, left = `boardRect.left + HOVER_EDGE_GAP`, and the
  box is vertically centred.
- If the result intersects `sourceRect`, it mirrors to the right: about `boardRect.right − band`. In band
  mode it uses the right band, which `layoutToCssVars` makes symmetric. `mode` becomes `'band-right'`/`'edge-right'`.
- Every result is clamped inside the viewport.

`isHoverEligible({ card, enabled, modalOpen, buttons })` returns false when `!enabled`, the card is null
(redacted or unresolved), a modal is open, or `buttons !== 0`.

Settings (`fx-settings.mjs`): `HOVER_PREVIEW_OFF_KEY = 'ptcg-hover-preview-off'`. `readSettings` gains
`hoverPreviewOff: readKey(...) === '1'` (absent → on). `fx-settings.js` gains
`setHoverPreviewOff(off)`.

**DOM layer: `client/src/setup/image-logic/hover-preview.js`**
- `installHoverPreview(doc)` is idempotent per document. It adds `pointerover`, `pointerout`,
  `pointerdown`, `dragstart`, `contextmenu` (capture) and `wheel` to `doc`, and `blur` to `doc.defaultView`.
  Callers: the main document at startup, plus each iframe's `load` (the seam at `index.ejs:1147`).
- Hover target → `<img>`: `target.card ? target : target.closest('.mat-holo')?.querySelector('img')`.
  Zone plates don't resolve (unlike click's `loneImageOfZone`). Then `resolvePreviewCard(null, img)` (C3).
  A `pointerout` whose `relatedTarget` is still inside the same card is ignored (holo layers).
- **Probe**: `<div class="hover-gutter-probe">` appended once to each iframe's `#playfield`:
  `position:absolute; top:0; bottom:0; left:var(--mat-offset-x,0px); width:var(--mat-width,100%);
  visibility:hidden; pointer-events:none`. It is measured with `viewportRectOf` (`card-pop.mjs:188`, which
  maps iframe → main viewport). `boardRect` = `#battleMat.getBoundingClientRect()`.
  It is measured **at each show and warm swap** with no cache, so a resize, mat change, sidebox toggle or
  `--mat-scale` change needs no listener.
- **Render**: one `div#hoverPreview.hover-preview` in the main `document.body`. It is `position: fixed`,
  `pointer-events: none`, z-index 2300 (under the 2400 modals, over the board, `#boardButtonContainer`
  1310 and the resizers). It holds the `buildHoloCard` wrapper, or a plain `<img>`. It shows the board
  `src` at once and upgrades to high-res on load (`applyHighResToImage` pattern, `full-view.js:69`).
  A swap reuses the host and replaces only the child. Show adds `.is-shown` (opacity + `scale .96→1` on
  the **host**). Hide removes it, and the child is dropped after `HOVER_FADE_OUT_MS`.
- `revalidate()` runs on `REFRESH_EVENTS` (export it from `card-inspector.mjs`, don't copy it) and on a
  MutationObserver on the source's zone. It calls `suppress('detached')` when the source `<img>` is no
  longer `isConnected`.
- **Modal hooks**: `openFloatingCardPreview`, `openCardFocus` and `openCardInspector` call
  `suppressHoverPreview('modal')`. `isHoverEligible` also reads the three `is*Open()` flags, so a missed
  hook still can't draw over a modal.
- **Setting**: the checkbox `#hoverPreviewCheckbox` reads "Card hover preview" and goes in
  `#settingsToggles` after "Show Lost Zone". It is checked when on. `settings.js` wires it as `crowdCheckbox`
  is wired. `hover-preview.js` subscribes via `onFxSettingsChanged`, so turning it off calls
  `suppress('setting')`.
- **CSS**: `client/src/css/hover-preview.css`, linked from `index.ejs`. Tokens for the fade durations
  mirror the model constants, and a CSS contract test keeps them equal.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | Hover empty zone / plate / blurred band / mat | No arm, no preview | [ ] model + e2e |
| 2 | Face-down card (opp hand, prize, deck) | `resolvePreviewCard` → null → nothing, ever | [ ] unit (redacted) + e2e |
| 3 | Leave at 799 ms; re-enter the same card | No preview; dwell restarts from 0 | [ ] model (fake clock) |
| 4 | Card A shown → move to card B | B replaces A with no dwell | [ ] model |
| 5 | Hidden → re-enter within 300 ms / after 300 ms | Instant / full 800 ms dwell | [ ] model |
| 6 | Mouse down, drag start, right-click, wheel | Hide + disarm + clear warm; click/drag/menu work as today | [ ] model + e2e |
| 7 | Re-render detaches the hovered `<img>` | `revalidate` hides it; no orphan preview | [ ] dom test |
| 8 | Inspector / focus / double-click preview opens | Hidden and blocked until all are closed | [ ] model + e2e |
| 9 | Edge-to-edge layout, 1920×1080, sidebox open (gutter 201) | `mode:'band'`, width 177, height 247, left 12, top 416 | [ ] placement unit |
| 10 | Sidebox hidden (gutter 436, vh 1080) | width 412 → height 576 (under the 972 cap) | [ ] placement unit |
| 11 | Two-player / `sim` layout (gutter 0) | `mode:'edge'`, width 160 at board left + 12 | [ ] placement unit |
| 12 | Preview rect would cover the hovered card (left hand card, edge mode over prizes) | Mirrors to the right (`band-right`/`edge-right`) | [ ] placement unit |
| 13 | Short viewport (600 px tall, wide band) | Height capped at 540; width = 540/1.397 | [ ] placement unit |
| 14 | No probe yet (iframe not loaded) | `gutterBox` width 0 → edge mode; no throw | [ ] placement unit |
| 15 | High-res 404 / slow | Board src stays; no broken image | [ ] dom test |
| 16 | Touch / pen pointer | Never arms | [ ] model |
| 17 | Window blur / alt-tab while armed or shown | Disarm, hide | [ ] model |
| 18 | Setting turned off while shown / armed | Hides at once; no further arming; on again → works | [ ] model + settings unit |
| 19 | Setting key absent / garbage value | Treated as on (`!== '1'`) | [ ] fx-settings unit |
| 20 | Mat-FX flight clones (draw, opp-play) under the pointer | Clones carry no `.card`, so nothing shows | [ ] e2e (pointer parked over hand during draw) |

## Test plan
- Unit (`node --test`):
  - `__tests__/hover-preview-model.test.mjs`: the state machine with a fake clock (rows 3–6, 8, 16–18),
    plus `gutterBox`, `previewPlacement` (rows 9–14) and `isHoverEligible`.
  - `__tests__/fx-settings.test.mjs` (extend): rows 18–19 for the new key.
- CSS contract: `__tests__/hover-preview-css.test.mjs` checks `pointer-events: none`, that the fade sits
  on the host and not the card, that the tokens equal the model constants, and that the probe rule uses
  `--mat-offset-x` / `--mat-width`.
- E2E: extend `test-card-inspector-e2e.mjs` (`pnpm test:inspector`) with a hover step.
  - Your bench card for 900 ms → `#hoverPreview.is-shown` with that card's src, and the preview's right
    edge ≤ the probe's left.
  - Move to the next bench card → it swaps with no 800 ms wait.
  - The opponent's hand → nothing.
  - Mouse-down → hidden.
  - Untick the setting → no preview after 900 ms.
- Manual (user, localhost): the feel of 800 ms, the size in the band at your usual window size and mat
  scale, the fade, and the right-side mirror.

## Migration / rollout
No data migration: one new `localStorage` key, absent = on. To revert, remove the three
`installHoverPreview` calls and the checkbox. The stale key is harmless.

## Work plan
| Slice | Files | Signatures & data | Test cases | Green when |
|---|---|---|---|---|
| 1 | create `image-logic/hover-preview-model.mjs` + `__tests__/hover-preview-model.test.mjs` | as in Design | rows 3–6, 8, 9–14, 16–18 with the values pinned in the table | `node --test` on the file passes |
| 2 | modify `fx-settings.mjs`, `fx-settings.js`, `__tests__/fx-settings.test.mjs`, `sidebox/settings.js`, `index.ejs` (checkbox) | `HOVER_PREVIEW_OFF_KEY`, `readSettings().hoverPreviewOff`, `setHoverPreviewOff(off)` | rows 18–19 | `pnpm test:changed` green |
| 3 | create `image-logic/hover-preview.js`, `css/hover-preview.css`, `__tests__/hover-preview-css.test.mjs`; modify `index.ejs` (stylesheet link + install on main + iframe load), `self-containers.css` + `opp-containers.css` (`.hover-gutter-probe`), `card-inspector.mjs` (export `REFRESH_EVENTS`) | `installHoverPreview(doc)`, `suppressHoverPreview(reason)`, `revalidateHoverPreview()` | rows 2, 7, 15 (stub docs, no jsdom) + CSS contract | `pnpm test:changed` green; lint clean |
| 4 | modify `full-view.js`, `card-focus.mjs`, `card-inspector.mjs` (modal suppress); extend `test-card-inspector-e2e.mjs` | none new | rows 1, 2, 4, 6, 8, 18, 20 in e2e | `pnpm test:inspector` green; user localhost pass |

## Deviations (Builder appends here during build)
