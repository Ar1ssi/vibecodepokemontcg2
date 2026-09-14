# Design 008 — TCG Live-Style Attack Selection System
Status: draft
Author: agent (S114)

Replace the current draggable floating "Attack Window" panel with a TCG Live-style interaction: **click the active Pokémon → card magnifies into the existing card preview overlay → translucent attack hit-zones overlay the magnified card's attack text regions → click an attack to use it**.

## User Review Required

> [!IMPORTANT]
> **Interaction trigger — single-click vs double-click on the active Pokémon:**
> Today, single-click highlights/selects a card (used in card movement workflows), and double-click opens the card preview. The new attack flow also opens a card preview. Two options:
> - **(A) Single-click the active Pokémon opens attack preview** (when it's your turn in main phase) — feels more TCG Live-like but changes the meaning of single-click on the active slot specifically. Double-click would still work as a pure visual preview (no attack zones) outside of your main phase.
> - **(B) Double-click opens the preview with attack zones overlaid** when it's your turn — consistent with existing behavior but slower.
>
> **Recommended: Option A** — the active Pokémon has no useful single-click action during your main phase anyway (you can't move it via selection), so repurposing single-click for attack preview is natural and faster.

> [!IMPORTANT]
> **Retreat & Pass buttons:** TCG Live shows retreat and pass options alongside attacks. Should these also appear on the magnified card overlay (as buttons below the card), or remain in their current location (chat area / sidebox buttons)?
>
> **Recommended:** Add "Retreat" and "Pass Turn" buttons below the magnified card in the overlay, making the card preview the single interaction point for all main-phase actions.

> [!WARNING]
> **Ability activation:** The current Attack Window also lists usable abilities. Should abilities also appear in the magnified card overlay? TCG Live handles abilities via a separate button on the card itself. For now the plan leaves abilities in the existing Attack Window (which would become an "Abilities" panel only), and only moves attacks + retreat + pass to the card overlay. This can be extended later.

## Open Questions

1. **Attack zone positioning on card art:** Pokémon cards have attacks in the lower ~40% of the card. The hit-zones will be positioned as percentage-based overlays on the magnified card image. Different cards have 1–2 attacks at varying vertical positions. Should the zones be:
   - **(A) Fixed percentage regions** (e.g., attack 1 at 55–70%, attack 2 at 70–85% from the top) — simpler, works for ~95% of cards.
   - **(B) Dynamically sized** based on the number of attacks — 1-attack cards get a larger single zone.
   - **Recommended: B** — use fixed top boundaries but expand the zone height based on attack count.

2. **Unpayable attacks:** Should unpayable attacks still show hit-zones but be visually dimmed/greyed (TCG Live style), or be completely invisible?
   - **Recommended:** Show all attack zones, dim unpayable ones with reduced opacity + a red/grey tint, and show a tooltip on hover explaining why.

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
  5. Renders attack zones with visual states: **usable** (highlighted glow border), **unpayable** (dimmed, greyed), **once-used** (locked icon)
  6. Renders "Retreat" and "Pass Turn" action buttons below the card
  7. On attack zone click: closes the preview and calls `attack(rulesState.turnPlayer, true, idx)` from `chat-buttons.js`

- **`closeAttackPreview()`** — closes the overlay via `closeCardPreview()` and cleans up hit-zones

- **`isAttackPreviewOpen()`** — state query for other modules

- **Attack hit-zone layout strategy:**
  - Each zone is an absolutely-positioned `<div>` inside `.card-preview-face--front`, using `top`/`height` as percentages of the card image
  - 1-attack card: single zone covering ~55%–85% from top
  - 2-attack card: zone 1 at ~52%–68%, zone 2 at ~68%–84%
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

- In `imageClick()` (line 238): when `mouseClick.zoneId === 'active'` and it's the player's main phase (check via `canPerformAction({ user: 'self', action: 'attack' })` returning `allowed: true` or a payability-only reason), call `openAttackPreview()` instead of the default highlight behavior.
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
.attack-zone--unusable      — 50% opacity, grey overlay, no-pointer cursor, tooltip
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
| E8 | Inherited attacks (attack-inheritance ability) | `listUsableActions` already handles `mergeInheritedAttacks`. Extra zones rendered for inherited attacks, labeled "(inherited)". |
| E9 | Preview animation not yet finished when attack zone is clicked | Zone clicks are gated on DOM mount complete (the `onOpened` callback). Safe. |

## Work plan

| Slice | Scope | Est. |
|-------|-------|------|
| 1 | Component 2 (`resolve-attack-context.mjs`) + unit tests; refactor `rules-bridge.js` to use it | small |
| 2 | Component 3 (`full-view.js` modifications — `onOpened`, `getPreviewPopHost`, `interactive` flag) | small |
| 3 | Component 1 (`attack-preview.js`) + Component 6 (CSS) — core overlay with attack zones, retreat/pass buttons | medium |
| 4 | Component 4 (click-events.js wiring) + Component 7 (sidebox button routing) | small |
| 5 | Component 5 (attack window → abilities-only panel) + integration testing + edge-case sweep | small |

## Verification Plan

### Automated Tests

- Unit tests for `resolve-attack-context.mjs`: verify energy gathering, cost modifiers, and ability-used flag resolution against stub card data — `pnpm test`.
- Unit tests for attack zone positioning logic: given 1-attack and 2-attack cards, verify correct percentage bounds.
- Existing attack engine tests (`pnpm test`) must remain green — no changes to `attack-engine.mjs`, `attack-window.mjs`, or `damage-parser.mjs`.

### Manual Verification

- Start a local 2-player game (`pnpm start`), load decks, reach main phase.
- Single-click the active Pokémon → verify the card magnifies with holo effect and attack zones appear overlaid.
- Verify usable attacks have glow highlight, unpayable attacks are dimmed.
- Click a usable attack → verify the preview closes and the attack executes normally (damage applied, turn advances).
- Click an unpayable attack → verify nothing happens (no crash, zone stays dimmed).
- Press Escape or click the dark overlay → verify the preview closes without attacking.
- Verify the Abilities panel still works for Pokémon with abilities.
- Verify double-click on bench/hand cards still opens the normal card preview (no attack zones).
- Verify opponent's active Pokémon click does NOT open attack zones.
- Run `pnpm test` — all tests pass.
