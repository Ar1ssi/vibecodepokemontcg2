# Design 008 — TCG Live-Style Attack Selection System
Status: reviewed — decisions D1–D4 confirmed by user (S123); abilities placement still open
Author: agent (S114)

Replace the current draggable floating "Attack Window" panel with a TCG Live-style interaction: **click the active Pokémon → card magnifies into the existing card preview overlay → translucent attack hit-zones overlay the magnified card's attack text regions → click an attack to use it**.

## Decisions (user-confirmed, S123)

| # | Question | Decision |
|---|----------|----------|
| D1 | Interaction trigger | **Single click** on your own active Pokémon opens the attack preview (Option A). Double-click keeps its current meaning: pure visual preview, no attack zones. |
| D2 | Retreat & Pass placement | **Keep both.** Retreat/Pass buttons are added to the magnified card overlay *and* stay in their existing sidebox/chat location — the overlay is an additional entry point, not a replacement. |
| D3 | Attack zone sizing | **Dynamically sized** (Option B): zone height derives from the attack count rather than fixed slots. |
| D4 | Unpayable attacks | **Not highlighted.** Every attack still gets a zone, but only payable attacks receive the glow/hover treatment. Unpayable zones render plain (no glow, no dim-to-grey), are inert on click, and expose the `reason` from `listUsableActions()` as a hover tooltip. |

> [!NOTE]
> Assumed while recording D4: unpayable zones stay *visible and inert with a reason tooltip* rather than being removed. "Not highlighted" was read as "no glow", not "no zone".

### Still open

> [!WARNING]
> **Ability activation** (unanswered): should abilities also move onto the magnified card overlay, or stay in the existing panel? The plan below assumes they stay, and the Attack Window becomes an Abilities-only panel (Component 5).

## Review findings (S123)

Verified against `0241d2d`. The file/line references in the plan all check out. These are the gaps found:

**R1 — Single-click must not swallow the move-destination path (blocking, Component 4).**
`imageClick()` (`client/src/setup/image-logic/click-events.js:238`) branches on
`event.target.classList.contains('selectHighlight')` *first*: that branch is how a card is moved
onto the active slot (attaching Energy from hand, promoting from bench). Gating the attack preview
at the top of `imageClick` would break both. The preview may only be opened from the **else**
branch, i.e. when no `selectHighlight` is present on the target.

**R2 — Gate on card owner, not just `zoneId` (blocking, Component 4).**
Both iframes contain an `#active` element, so `mouseClick.zoneId === 'active'` matches the
opponent's active too. The condition must also require `mouseClick.cardUser === 'self'`
(the manual-verification list already expects this; the component spec does not state it).

**R3 — Single-click on the active becomes unreachable for selection (Component 4).**
With D1, the player can no longer highlight-select their own active to move it elsewhere
(discard, shuffle-in, bench swap) during their main phase. `openCardContextMenu()`
(`click-events.js:84`) is the existing right-click escape hatch — the design should name it as the
documented alternative, or define a modifier-click fallback.

**R4 — Percentage zones must be anchored to the rendered image box, not the face (Component 1).**
`previewSizeForSource()` (`card-pop.mjs:218`) sizes the pop host from the **source rect's** aspect
ratio (the mat thumbnail), not the card's true 2.5:3.5. The plain-image path then uses
`object-fit: contain` (`index.css:1837`) while the holo path uses `cover` with
`aspect-ratio: var(--card-aspect)` (`index.css:1848`). So whenever the mat card's aspect differs
from the card's, the `contain` path letterboxes and face-relative percentages land off the artwork.
Zone geometry must be computed from the image's rendered content box, and must handle the two
paths differently — or `previewSizeForSource` must be given the true card aspect.

**R5 — Retreat/Pass buttons cannot live inside the card face (Component 1/6).**
`.card-preview-face` sets `overflow: hidden` (`index.css:1816`) and `.card-preview-pop` sets
`pointer-events: none` (`index.css:1795`) with a size equal to the card box. Buttons "below the
card" must mount in `.card-preview-overlay`, positioned against the pop host's rect, with
`pointer-events: auto` set explicitly. Note also the overlay's click handler closes the preview on
`event.target === overlay` — the button container must be a child, not the overlay itself.

**R6 — Gate zone clicks on animation end, not mount (Component 3 vs E9).**
Component 3 describes `onOpened` as firing "after the DOM is mounted and the pop animation
*starts*", but E9 claims this makes mid-animation clicks safe. It does not: `.card-preview-flip`
spins through its back face during the pop. `playSelectPop()` (`card-pop.mjs:357`) already resolves
a promise on completion and accepts an `onDone` callback — hook zone activation to that instead.

**R7 — Do not carry the chat side effect into `shared/` (Component 2).**
The block being extracted (`rules-bridge.js:296-307`) calls `appendMessage()` on every `refresh()`
for attack-inheritance. `resolveAttackContext()` must stay DOM/chat-free; the announcement stays in
`rules-bridge.js` (and is arguably a bug today — it re-announces on every refresh). Everything else
in that block is injection-friendly, and `shared/engine/rules/` already hosts async
dependency-injected modules, so the placement is fine.

**R8 — E8 (inherited attacks) does not hold today.**
`mergeInheritedAttacks()` (`attack-window.mjs:14`) works, but the only live call site always passes
`priorAttacks: []` (`rules-bridge.js:305`), so no attack is ever actually inherited. Rendering
"(inherited)" zones is therefore dead code until `priorAttacks` is populated. Either drop E8 from
this design's scope or file the gap separately — do not claim it works.

**R9 — Verification plan has no coverage for the wiring.**
Only `resolve-attack-context.mjs` and the zone-geometry function get unit tests. Per the
watch-outs, `client/src/setup/...` UI wiring has no jsdom harness in this repo, so keep the
decision logic (should-open predicate from R1/R2, zone geometry from R4/D3, usable-vs-plain
classification from D4) in pure exported functions that tests can reach, and keep the DOM files
thin callers.

## Current state

### Files read
- `client/src/actions/chat-buttons/chat-buttons.js` — attack/pass/retreat monolith (4573 lines); `attack()` is the main execution entry (line 449–2232), called from both sidebox buttons and the rules attack window.
- `client/src/setup/rules/rules-bridge.js` — `buildAttackWindow` (lines 207–408); draggable floating panel that lists attacks + abilities with payability badges; delegates to `attack()` on click.
- `client/src/setup/image-logic/full-view.js` — `openCardPreview()` (line 142) and `openFloatingCardPreview()` (line 174); creates a magnified card clone inside `.card-preview-overlay` → `.card-preview-pop` → `.card-preview-flip` → `.card-preview-face--front`.
- `client/src/setup/image-logic/click-events.js` — `imageClick()` (line 238) handles single-click (highlight/select), `doubleClick()` (line 270) opens card preview for active/bench/hand cards.
- `shared/engine/rules/attack-window.mjs` — `listAttacks()`, `listAbilities()`, `listUsableActions()` — pure, DOM-free functions that compute payability, once-per-turn status, and effective cost.
- `shared/engine/rules/attack-engine.mjs` — `canPayAttackCost()`, `computeAttackDamage()`, `expandEnergyEntries()` — pure attack math.
- `shared/engine/rules/rules-state.mjs` — `canPerformAction({ action: 'attack' })` (line 672) — legality gate (turn check, phase check, turn-1 restriction, already-attacked, pending-effect locks).
- `client/src/css/index.css` — `.card-preview-overlay` (line 1689), `.card-preview-pop`, `.card-preview-flip`, `.card-preview-face` CSS for the existing preview system; `#rulesAttackWindow` and `.rules-aw-*` styles (line 4395+).
- `client/index.ejs` — board layout uses iframes (`#selfContainer`, `#oppContainer`), each containing `#active` div for the active Pokémon slot.

### Data flow today
```
User clicks chat button / attack window row
  → chat-buttons.js: attack(user, emit, attackIndex)
    → rules-state.mjs: canPerformAction({ action: 'attack' })
    → attack-engine.mjs: canPayAttackCost()
    → attack-engine.mjs: computeAttackDamage()
    → chat-buttons.js: applies damage, handles KO/promotion
    → dispatches 'rules-attack-declared' DOM event
      → rules-bridge.js: phase transition → end turn
```

## Proposed Changes

### Component 1: Attack Preview Overlay Module (New)

#### [NEW] `client/src/setup/rules/attack-preview.js`

New module that orchestrates the TCG Live-style attack selection flow. Responsibilities:

- **`openAttackPreview(card, targetImage)`** — the main entry point:
  1. Calls the existing `openFloatingCardPreview()` from `full-view.js` to magnify the card with the holo animation
  2. After the preview DOM is created, overlays transparent clickable attack hit-zones on top of the magnified card face
  3. Gathers energy/cost data using the new shared `resolveAttackContext()` helper
  4. Calls `listUsableActions()` from `attack-window.mjs` to get payability status
  5. Renders attack zones with visual states per D4: **usable** (highlighted glow border), **unpayable** (plain — no glow, inert, `title` tooltip carrying the `reason`), **once-used** (locked icon)
  6. Renders "Retreat" and "Pass Turn" action buttons below the card — mounted in `.card-preview-overlay`, not in the card face (see R5). These are additive; the sidebox/chat buttons stay (D2).
  7. On attack zone click: closes the preview and calls `attack(rulesState.turnPlayer, true, idx)` from `chat-buttons.js`

- **`closeAttackPreview()`** — closes the overlay via `closeCardPreview()` and cleans up hit-zones

- **`isAttackPreviewOpen()`** — state query for other modules

- **Attack hit-zone layout strategy (D3 — dynamically sized):**
  - A pure exported `attackZoneBounds({ attackCount, index })` returns `{ topPct, heightPct }`; the DOM code only applies the result, so the geometry is unit-testable (R9)
  - Zones are absolutely-positioned `<div>`s inside `.card-preview-face--front`, but their percentages are resolved against the **rendered image content box**, not the face box (R4)
  - The attack block spans ~52%–85% from the top and is divided by attack count: 1 attack → one full-height zone; 2 attacks → two equal zones; 3+ → equal shares of the same band
  - Cards with an Ability push their attacks lower; pass the ability count into `attackZoneBounds` and shift the band's top boundary down accordingly rather than assuming a fixed start
  - Each zone has: attack name label, energy cost icons (using existing energy token PNGs from `client/src/assets/energy/tokens/`), damage value
  - Hover state: zone border glows, background lightens
  - Click: brief flash animation → close overlay → execute attack

---

### Component 2: Shared Attack Data Helper (Extract from rules-bridge)

#### [NEW] `shared/engine/rules/resolve-attack-context.mjs`

Extract the energy-gathering + cost-modifier + ability-used logic currently duplicated between `rules-bridge.js:282–315` and `chat-buttons.js` into a shared, reusable helper:

```javascript
/**
 * Gathers attack context for the active Pokémon.
 * @returns {{ energyTypes, stadiumCostModifier, abilityUsedFlag, priorAttacks }}
 */
export async function resolveAttackContext(user, getZone, ensureCardData, getStadium, abilityUsed)
```

Both `rules-bridge.js` and `attack-preview.js` will call this instead of inline data gathering. This eliminates the current duplication and ensures both UIs always agree on attack payability.

---

### Component 3: Card Preview Integration (Modify)

#### [MODIFY] `client/src/setup/image-logic/full-view.js`

- Add an `onOpened` callback option to `openFloatingCardPreview()` — fires after the preview DOM is mounted and the pop animation starts. The attack-preview module hooks this to inject its hit-zones.
- Export `cardPreviewState` read access (or a `getPreviewPopHost()` getter) so `attack-preview.js` can mount its overlay elements inside the existing preview DOM structure.
- Add an `interactive` option flag: when true, clicking the overlay background still closes, but clicking inside the card face delegates to the attack zones instead of being swallowed.

---

### Component 4: Click Event Wiring (Modify)

#### [MODIFY] `client/src/setup/image-logic/click-events.js`

- In `imageClick()` (line 238): open the attack preview **only from the final `else` branch** — i.e. the target carries no `selectHighlight` class, so move-to-active flows (attaching Energy, promoting from bench) are untouched (R1).
- The gate is `mouseClick.zoneId === 'active' && mouseClick.cardUser === 'self'` plus `canPerformAction({ user: 'self', action: 'attack' })` returning `allowed: true` or a payability-only reason. The `cardUser` check is required — both iframes contain an `#active` element (R2).
- Factor the gate into a pure exported `shouldOpenAttackPreview({ zoneId, cardUser, hasSelectHighlight, gate })` so it can be unit-tested (R9).
- Because single-click on the active no longer selects it during your main phase (D1), right-click → `openCardContextMenu()` (line 84) is the documented way to move the active elsewhere (R3); call this out in the release note.
- The existing double-click handler remains unchanged (it opens a pure visual preview without attack zones, useful for inspecting opponent's cards or your own cards outside main phase).

---

### Component 5: Attack Window Panel (Modify)

#### [MODIFY] `client/src/setup/rules/rules-bridge.js`

- `buildAttackWindow` `refresh()` (line 265): strip the "Attacks" section from the panel HTML when rules mode is on — the panel becomes an "Abilities" panel only.
- Keep the "Abilities" section rendering and click handling intact.
- Refactor energy/cost data gathering to use the new `resolveAttackContext()` helper.
- Rename the window title from "⚔️ Attack Window" to "✨ Abilities" (only shown when abilities exist).

---

### Component 6: Attack Preview CSS (New)

#### [NEW] Attack preview styles added to `client/src/css/index.css`

```
.attack-zone                — transparent absolute-positioned hit region over the card
.attack-zone--usable        — hover glow (box-shadow pulse), pointer cursor
.attack-zone--unusable      — no glow, no tint (D4): default cursor, pointer-events inert, `title` tooltip with the reason
.attack-zone:hover          — border highlight animation
.attack-zone-label          — attack name/cost/damage info shown on the zone
.attack-preview-actions     — container for Retreat/Pass buttons below the card
.attack-preview-btn         — styled action buttons (glass/frost effect to match TCG Live)
.attack-preview-btn--retreat
.attack-preview-btn--pass
```

Key visual properties:
- Attack zones: `backdrop-filter: blur(2px)` with a subtle colored border matching the Pokémon's type
- Usable zones: pulsing glow animation (`@keyframes attack-glow`)
- Transition: `background 0.15s ease, box-shadow 0.15s ease`

---

### Component 7: Sidebox Button Routing (Modify)

#### [MODIFY] `client/src/initialization/document-event-listeners/sidebox/p1/chat-buttons.js` and `sidebox/p2/chat-buttons.js`

- When rules mode is on, the `#attackButton` / `#p2AttackButton` click opens `openAttackPreview()` instead of directly calling `attack()`. This provides a consistent entry point regardless of whether the player clicks the card or the sidebox button.
- Per D2, the sidebox **Retreat** and **Pass** buttons keep their current direct behavior — they are not rerouted through the overlay, they are simply mirrored by it.
- When rules mode is off, retain the direct `attack()` call (free-play mode).

## Edge cases

| # | Case | Handling |
|---|------|----------|
| E1 | Active Pokémon has 0 attacks (data not loaded yet) | Show the magnified card with a "Loading attacks…" message where zones would be; no zones rendered. Retry on `ensureCardData` resolve. |
| E2 | Player clicks active during opponent's turn | Normal highlight behavior (no attack preview). `canPerformAction` returns `allowed: false`. |
| E3 | Player clicks active during setup/draw phase | Normal highlight behavior (not main phase). |
| E4 | Player clicks active after already attacking this turn | Normal highlight or dimmed preview with "Already attacked" message. |
| E5 | Asleep/Paralyzed active Pokémon | Open the preview, show attacks, but display a status-condition badge. Clicking an attack still routes through `chat-buttons.attack()` which handles the coin-flip/block flow. |
| E6 | Card preview already open (e.g., double-clicked bench) when active is clicked | `openFloatingCardPreview` already calls `closeCardPreview` first (line 184). Safe. |
| E7 | Escape key pressed while attack preview is open | Routes through existing `closeCardPreview` → `closeAttackPreview` cleanup. |
| E8 | Inherited attacks (attack-inheritance ability) | **Out of scope** — the live call site always passes `priorAttacks: []`, so nothing is ever inherited today (R8). Zones render whatever `listUsableActions` returns; no "(inherited)" label work in this design. Tracked separately in ISSUES. |
| E9 | Preview animation not yet finished when attack zone is clicked | Zone clicks are gated on the pop animation **completing**, via `playSelectPop`'s `onDone` — not on DOM mount (R6). |

## Work plan

| Slice | Scope | Est. |
|-------|-------|------|
| 1 | Component 2 (`resolve-attack-context.mjs`) + unit tests; refactor `rules-bridge.js` to use it | small |
| 2 | Component 3 (`full-view.js` modifications — `onOpened`, `getPreviewPopHost`, `interactive` flag) | small |
| 3 | Component 1 (`attack-preview.js`) + Component 6 (CSS) — core overlay with attack zones, retreat/pass buttons | medium |
| 4 | Component 4 (click-events.js wiring) + Component 7 (sidebox button routing) | small |
| 5 | Component 5 (attack window → abilities-only panel) + integration testing + edge-case sweep | small |

Slice 1 must keep `appendMessage()` out of the extracted helper (R7).

## Verification Plan

### Automated Tests

- Unit tests for `resolve-attack-context.mjs`: verify energy gathering, cost modifiers, and ability-used flag resolution against stub card data — `pnpm test`.
- Unit tests for `attackZoneBounds()`: 1-, 2- and 3-attack cards produce non-overlapping bounds inside the band; ability-bearing cards shift the band down; 0 attacks returns an empty list.
- Unit tests for `shouldOpenAttackPreview()`: opponent's active → false; `selectHighlight` present → false; not your turn → false; own active in main phase → true.
- Existing attack engine tests (`pnpm test`) must remain green — no changes to `attack-engine.mjs`, `attack-window.mjs`, or `damage-parser.mjs`.

### Manual Verification

- Start a local 2-player game (`pnpm start`), load decks, reach main phase.
- Single-click the active Pokémon → verify the card magnifies with holo effect and attack zones appear overlaid.
- Verify usable attacks have the glow highlight and unpayable attacks have none (D4), with the reason visible on hover.
- Verify single-clicking a hand Energy and then the active still attaches it (the preview must NOT open on that second click) — R1.
- Verify right-click on the active still opens the context menu (R3).
- Verify zone alignment on a plain (non-holo) card and on a holo card — the two use different `object-fit` paths (R4).
- Click a usable attack → verify the preview closes and the attack executes normally (damage applied, turn advances).
- Click an unpayable attack → verify nothing happens (no crash, zone stays dimmed).
- Press Escape or click the dark overlay → verify the preview closes without attacking.
- Verify the Abilities panel still works for Pokémon with abilities.
- Verify double-click on bench/hand cards still opens the normal card preview (no attack zones).
- Verify opponent's active Pokémon click does NOT open attack zones.
- Run `pnpm test` — all tests pass.
