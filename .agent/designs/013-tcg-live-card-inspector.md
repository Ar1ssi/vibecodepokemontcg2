# 013: TCG Live card inspector on double-click
Status: approved (user — S174: O1-C folded into the panel, panel is interactive; recorded as D50)
Date: 2026-09-19 · Session: S174

## Problem

Double-clicking a Pokémon today enlarges the card scan (and, when it carries attached
cards, opens those as extra carousel slides). It shows nothing the player actually has to
reason about: current HP, resolved attack damage, weakness/resistance/retreat. To get any
of that they must read the tiny print on the mat, or keep the Attack Window panel open.

Design 008 solved the *acting* half — single-click opens a magnified card with clickable
attack/ability zones. It left the *inspecting* half as a bare card scan. This design fills
that half, in the shape the user asked for and signed off visually over 20 spike revisions
(`panel-spike.mjs`, best render `out/ptcg-live-panel-v20-0.png`).

**008 and 013 collide as specified.** `click` and `dblclick` are bound to the same element
(`card-listener-table.js:18-19`), and a double-click fires two clicks first. On your own
active during your turn, click #1 opens the attack preview, click #2 tears it down and
re-pops it, then `dblclick` tears it down again to open the carousel. Two overlay systems
fighting over one gesture. Resolving this is the core of the design, not a detail.

## Constraints

- **C1 — the card scan is the background and stays visible.** Rendered pieces sit *on top*
  of the print and occlude only the text they replace. No opaque fill (cream, silver, dark
  band) may stand in for the card. The user rejected three separate attempts at this.
- **C2 — dimming uses `filter`, never `opacity`.** The panels are opaque precisely so the
  printed text under them does not show. Alpha on a panel lets that print ghost back
  through, which re-creates the double-text C1 exists to prevent. Verified in this session:
  `opacity: .45` on `.atk` produced visible ghosting (`v22`/`v23` renders); `filter`
  (`v24`/`v25`) does not.
- **C3 — one surface for the panel and the attached Energy.** User decision: double-click
  shows the PTCG Live layout *and* keeps attached Energy as carousel slides.
- **C4 — server authority.** Under `SERVER_AUTHORITATIVE` the legacy zone arrays are empty,
  `mouseClick.card` is null, and cards are stamped on `<img>.card` by `apply-view.js`. Every
  read must go through `resolvePreviewCard`, as 008's wiring already does.
- **C5 — playmat boards live in iframes.** `selfContainer`/`oppContainer` load only
  self-/opp-containers.css; `index.css` never reaches them. Panel chrome must mount in the
  main document, where the carousel and `popHost` already live.
- **C6 — reuse the shipping primitives.** `attackZoneBounds()` for band geometry,
  `listAttacks()` for payability, `parseAttackDamage()` for resolved damage,
  `computeContentBox()` for the letterbox case. The spike re-derived none of this and the
  design must not either.
- **C7 — `ENERGY_SYMBOL_TO_TYPE` is exported, not copied.** The spike carries a local copy
  of a module-private map (`energy-effects.mjs:237`). Shipping must export the original.

## Current state

Facts from reading code this session.

- `client/src/setup/image-logic/click-events.js:341` `doubleClick()` — for
  `active|bench|hand|stadium`: calls `closeCardPreview(null, true)`, then forks on
  `fullViewHost(targetImage)`. If the card carries `attachedCards`, it maps them to
  full-art stand-ins and calls `openCarouselViewer({candidates: [...attached, card],
  initialIndex: attached.length})`; otherwise `openCardPreview(targetImage, card)`.
- `client/src/setup/image-logic/click-events.js:272` `imageClick()` — the `else` branch
  (no `selectHighlight`) calls `shouldOpenAttackPreview(...)` and, on `'attack'` or
  `'ability'`, `openAttackPreview(previewCard, previewCard.image, {zone})` and returns.
- `client/src/setup/rules/attack-preview.js:337` `openAttackPreview()` — opens via
  `openFloatingCardPreview({onOpened: ({popHost, overlay, whenOpened})})`, waits
  `whenOpened` (R6), then `renderZones()` appends zone elements to
  `.card-preview-face--front` and action buttons to `overlay`. Registers `REFRESH_EVENTS`
  (7 events) and `CLOSE_EVENTS` (`rules-turn-began`, `rules-session-reset`); teardown runs
  in `onClosed`, so `doubleClick`'s `closeCardPreview(null, true)` already cleans up
  correctly. **The teardown is sound; the flash is not.**
- `client/src/setup/rules/attack-preview.js:102` `contentBoxFor(popHost)` — resolves the
  rendered image box, branching on holo (forced 100%/100%) vs plain `img` (`contain` →
  letterbox, via `computeContentBox`). This is R4's fix and the pattern the inspector must
  follow.
- `client/src/setup/image-logic/card-picker.js:84` `buildSlideContent(card)` — returns
  `{node, holoWrapper}`; either a `.mat-holo` wrapper from `buildHoloCard` or a plain
  `img.discard-pile-card`. `openCarouselViewer` (`:1338`) is a thin wrapper over
  `openCardPicker({mode: 'browse', minCount: 0, maxCount: 0})`. Browse mode assembles
  `main > stage`, then `meta`, then `actionBar` with a "Close" button.
- `client/src/setup/image-logic/card-listener-table.js:18-19` — `click: imageClick`,
  `dblclick: doubleClick` on the same nodes. Source of the collision.
- `shared/engine/rules/attack-window.mjs:38` `listAttacks(card, {energyTypes,
  stadiumCostModifier, abilityUsed, rulesEnabled, priorAttacks})` → per-attack
  `{index, name, cost, effectiveCost, damage, payable, onceUsed, reason, usable}`. Already
  applies passive cost discounts and the wildcard/Colorless asymmetry.
- `shared/engine/rules/rules-state.mjs:411` `parseRetreatCost` returns a **count**, not
  symbols — enough for legality, not for a faithful preview tile.
- `.agent/designs/008-tcg-live-attack-preview.md` — D1 (single-click = attack preview) and
  D6 (bench single-click = ability preview) are user-confirmed; R3 records that this made
  single-click selection of the active unreachable, with right-click as the escape hatch.

### Verified while building slice 1 (S174)

Three shapes the renderer must tolerate, confirmed by test rather than read:

- **Weakness/resistance arrive under two spellings.** Server hydration sets `card.weakness` /
  `card.resistance` (singular objects) while `createCard` normalizes `weaknesses` /
  `resistances` (plural arrays, empty unless a source filled them). A reader handling only one
  spelling shows a blank tile on half the cards. They are not `${key}s` — "weakness"
  pluralises to "weaknesses", so that construction silently misses.
- **Printed damage is a string on the server path, a number on the client path.** `extractStats`
  passes `attack.damage` through unchanged ('30+'), while client enrichment runs it through
  `parseDamage`. The model keeps both halves: a numeric base for `parseAttackDamage`, and the
  printed label as the fallback.
- **The retreat tile can only ever show Colorless pips, and that is correct.** `parseRetreatCost`
  discards the printed symbols and keeps a count; `extractStats` expands that count into
  `['Colorless', …]` (audit B-6). Colorless is exactly what the engine charges, so showing it
  beats reproducing print the game would not honour. O4-B resolved without widening
  `parseRetreatCost`.

`attackZoneBounds()` returns `null` for a card with no attacks, so the band is optional in the
model (`bandTopPct: null`) rather than assumed present — E5.

## Options

### O1 — where the collision goes

**A. Debounce the single-click attack preview (~220 ms), cancelled by `dblclick`.**
Preserves 008 D1/D6 verbatim. Costs 220 ms on every attack selection, and the timer is
state that must be cleared on every path that can end a click (blur, Escape, card moved).

**B. Accept the flash; rely on the existing teardown.**
Zero new machinery — `onClosed` already cleans up, so this is a cosmetic defect, not a
leak. But it is a visible double-pop on the most common inspection gesture, and it is the
first thing a player will notice.

**C. Fold 008's zones into the inspector and give single-click back to select-to-move.**
One host, one gesture vocabulary: double-click = inspect *and* act, single-click = select.
Deletes the flash by deleting the overlap. Also repairs R3 — the capability 008 took away
comes back for free.

**Pick: C.** It is the only option that leaves one overlay system per gesture, and it is
what PTCG Live itself does (enlarge, then pick the attack from the enlarged panel). A buys
nothing that C does not also buy, and B ships a known visual defect.

> [!IMPORTANT]
> C **revises 008 D1 and D6** — both user-confirmed. It revises them for the better
> (fewer hosts, R3 repaired), but it is not a silent change: the gate must state it plainly
> and the user must sign it. If the user declines, fall back to A, not B.

### O2 — which host carries the inspector

**A. Keep `openFloatingCardPreview` (the 008 pop host) and add slides to it.**
The pop host is single-card; teaching it a carousel means reimplementing `computeSlideLayout`,
peek, drag and holo sync there. Rejected: that is most of `card-picker.js`.

**B. Mount the chrome in the carousel (`card-picker.js` browse mode).**
The carousel already does N slides, drag/scroll, holo, `initialIndex`, and already serves
the attached-Energy case (C3). The no-attached-cards case becomes the same call with one
candidate, which also removes today's `openCardPreview` fork.

**Pick: B.** One host for both branches, so the panel looks identical whether or not the
Pokémon carries Energy — which today it does not.

### O3 — how the chrome reaches the carousel

**A. Branch inside `buildSlideContent` on a "this is a Pokémon inspector" flag.**
Piles card-domain logic into a generic picker used by the discard pile, deck, prizes and
trainer pickers.

**B. Add an optional `decorate({node, holoWrapper, card, index}) => node` hook to
`openCardPicker`, supplied by the inspector.**
`card-picker.js` stays generic and learns nothing about attacks, HP or energy; the
decorator wraps the slide node in a positioned container and appends the chrome, keeping
`holoWrapper` inside it so `slideWrapper()` (`:73`) still resolves.

**Pick: B.** The hook is the smallest possible change to a heavily-shared file.

### O4 — retreat symbols

**A. Widen `parseRetreatCost` to return symbols.** Touches the legality path used by
`retreat.mjs` for a preview-only need.
**B. Read `detail.retreat` in the inspector's own mapper, falling back to a filled count.**
No rules-layer risk; duplicates a five-line normalisation.

**Pick: B**, with slice 1 asserting the stamped card actually carries `retreat` symbols
under server authority — if it does not, B degrades to the count and the tile shows pips.

### O5 — what the HP pill reports

The reference screenshot shows `280` beside a `20` damage orb, i.e. **max** HP with damage
reported separately, not remaining HP. **Pick: max HP + separate damage orb**, matching the
reference. Remaining HP stays in the tooltip.

## Design

### New module: `client/src/setup/rules/card-inspector.mjs`

Split so every decision is testable without a DOM (R9's precedent):

- `card-inspector-model.mjs` — pure, DOM-free. Input: preview card + attached energy +
  game context. Output: an immutable descriptor the renderer draws from.
- `card-inspector.mjs` — DOM: builds elements, supplies `decorate`, owns lifecycle.

```js
// card-inspector-model.mjs
export interface InspectorModel {
  kind: 'pokemon' | 'plain',          // 'plain' → no chrome, card scan alone
  name: string,
  hp: number | null,                  // max HP (O5)
  type: string | null,                // types[0]; dual types see E10
  damage: number,                     // damage counters, 0 when undamaged
  evolvesFrom: string | null,
  attacks: Array<{
    name: string,
    cost: string[],                   // type names, for orbs
    text: string,                     // curly-notation preserved, rendered by the DOM layer
    damageLabel: string | number | null,  // resolved (parseAttackDamage), printed fallback
    payable: boolean,
    reason: string | null,
    banner: string,                   // dominant cost type, for the banner colour
  }>,
  weakness: TypeValue | null,
  resistance: TypeValue | null,
  retreat: string[],                  // symbols, O4
  bandTopPct: number,                 // attackZoneBounds({attackCount, index: 0, abilityCount})
  footH: number,                      // visible print below the tiles
  dimLevel: 'none' | 'partial' | 'full',
}

export function buildInspectorModel(card, ctx): InspectorModel
export function dimLevelFor(attacks: Array<{payable}>): 'none' | 'partial' | 'full'
export function normalizeRetreatSymbols(retreat, hp): string[]
```

`dimLevelFor` is the user's new rule, stated exactly:

| Condition | `dimLevel` | Effect |
|---|---|---|
| ≥1 attack payable | `'none'` | no card dim; unpayable panels alone recede (`.atk--locked`) |
| 0 attacks payable, ≥1 attack | `'full'` | whole card box dims (`.inspector--locked`), unpayable panels also recede |
| no attacks at all | `'none'` | nothing to fail — see E5 |

Both dim classes use `filter` only (C2). Actions never dim: Retreat and Pass Turn stay
legal at any energy count, so greying them would lie about the game state.

### Changed: `client/src/setup/image-logic/card-picker.js`

One optional hook, no behaviour change when absent:

```js
export const openCardPicker = async ({ ..., decorate = null })
// in the slide build:
const built = buildSlideContent(card);
const node = decorate ? decorate(built, card, i) : built.node;
```

Contract for `decorate`: the returned node must still contain `built.holoWrapper` when
non-null, or `slideWrapper()` and the holo hover sync (`:223-240`) break.

`openCarouselViewer` gains a pass-through `decorate` option.

### Changed: `client/src/setup/image-logic/click-events.js`

- `doubleClick()`: for `active`/`bench`, call `openCardInspector(previewCard, {zone})`
  instead of forking between `openCarouselViewer` and `openCardPreview`. The inspector
  supplies the candidate list (attached cards first, main card at `initialIndex`) exactly
  as today, plus `decorate`.
- `imageClick()`: remove the `shouldOpenAttackPreview` branch for `active` (O1-C). Bench
  ability routing moves to the double-click path too. Right-click →
  `openCardContextMenu()` stops being the only way to move these cards (repairs R3).

### Changed: `client/src/setup/rules/attack-preview.js`

Zones render inside the inspector rather than the pop host. The zone *builders* and the
`listAttacks`/`collectUsableAbilityCandidates` wiring move to the inspector's renderer;
`openAttackPreview` is retained as a thin alias during the transition and deleted in the
last slice, once the inspector covers it. `REFRESH_EVENTS` / `CLOSE_EVENTS` / `whenOpened`
(R6) carry over unchanged.

### Geometry

`bandTopPct` comes from `attackZoneBounds({attackCount, index: 0, abilityCount})`;
`footH` is per-frame. The spike's measured Tera-ex bands (attack box top ≈52%, foot ≈8.5%)
are the seed values, **not** universal — one set cannot serve Tera-ex and classic frames.
Ship a small frame-keyed table with a conservative default, and treat mis-calibrated frames
as a data bug (visible, reportable), not a crash.

Chrome anchors to the slide's rendered content box via `computeContentBox`, following
`contentBoxFor`'s holo-vs-plain branch (R4/C5). Percentages resolve against the image
content, never the slide box.

### Lifecycle

1. `openCardInspector` builds candidates, calls `openCarouselViewer({decorate})`.
2. `decorate` builds the model, renders chrome, returns the wrapped node.
3. While open, subscribe to `REFRESH_EVENTS`; rebuild the model and re-render in place so
   payability and damage track the board (R12's lesson).
4. Close on `CLOSE_EVENTS`, Escape, or the carousel's own Close.
5. Attack/ability click routes through the same entries 008 used:
   `attack(rulesState.turnPlayer, true, idx)` / `runAbilitySteps('self', card)`.

## Edge cases & failure modes — the completeness contract; Builder ticks every row

| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | No attached cards | Same inspector, one slide; today's `openCardPreview` fork is gone | [ ] |
| 2 | Zero energy attached | Every attack unpayable → `dimLevel: 'full'`; Retreat/Pass stay live | [ ] |
| 3 | Some attacks payable, some not | `dimLevel: 'partial'`; only unpayable panels recede, payable keep colour | [ ] |
| 4 | Card data unresolved (TCGdex not loaded) | `kind: 'plain'` — card scan alone, no chrome; carry 008 R11's `console.warn` + visible `id=… · data not loaded` hint | [ ] |
| 5 | Resolved Pokémon with no attacks | `kind: 'pokemon'`, empty attack block, `dimLevel: 'none'` — nothing to fail | [ ] |
| 6 | Ability present (pushes the printed attack box down) | `attackZoneBounds` gets `abilityCount: 1`; band moves with it | [ ] |
| 7 | Opponent's Pokémon double-clicked | Inspector renders read-only: no zones, no actions, no dim (payability is not theirs) | [ ] |
| 8 | Hand / stadium / prizes / discard double-clicked | Unchanged — inspector is `active`/`bench` only | [ ] |
| 9 | Payability changes while open (ability attaches Energy) | `REFRESH_EVENTS` rebuild → attack becomes payable, dim lifts without reopening | [ ] |
| 10 | Dual-type Pokémon | Pill shows `types[0]`; model records all types so weakness matching stays correct | [ ] |
| 11 | Swiped to an Energy slide and back | Chrome belongs to the decorated slide node only; Energy slides get none and never inherit it | [ ] |
| 12 | Turn begins / session resets while open | `CLOSE_EVENTS` close it, as 008 does | [ ] |
| 13 | Click during the pop / holo animation | Zone activation gated on the settled state, per R6 — no click before chrome is ready | [ ] |
| 14 | Damage counters ≥ max HP | Pill clamps at 0 remaining; damage orb shows the true counter total, no negative HP | [ ] |
| 15 | Retreat given as a count, not symbols (server-stamped card) | `normalizeRetreatSymbols` fills Colorless pips; if the count is also absent, tile shows an em dash | [ ] |
| 16 | Frame not in the band table | Conservative default bands; print may show through — logged once per frame key, not a crash | [ ] |
| 17 | Repeated double-clicks (carousel already open) | `openCardPicker` replaces rather than stacks; no duplicate listeners, one `decorate` per slide | [ ] |
| 18 | Rules mode off (free play) | No zones, no actions; inspector still shows the read-only card facts | [ ] |
| 19 | Non-Pokémon card somehow in an active/bench slot | `kind: 'plain'` — no HP/attack tiles invented | [ ] |

## Test plan

- **Unit** (`node --test`, added to the explicit `pnpm test` file list — a new test file
  does not run until it is listed there):
  - `card-inspector-model.test.mjs` — `dimLevelFor` across the 3-way table; `buildInspectorModel`
    with 0/1/3 attacks, ability present, unresolved data, dual types, damage ≥ HP;
    `normalizeRetreatSymbols` for symbols / count / absent; resolved-damage label falling back
    to the printed string when `parseAttackDamage` reports unresolved.
  - `attack-zone-geometry` — existing tests must stay green; add the `abilityCount` case if absent.
  - Payability parity: `buildInspectorModel(...).attacks[i].payable` equals
    `listAttacks(card, sameCtx)[i].payable` — the panel must never disagree with the engine.
- **Integration**: `decorate` hook — a slide built with a decorator still exposes
  `.mat-holo` to `slideWrapper()`; browse mode without `decorate` is byte-identical to today
  (protects the discard pile, deck, prizes and trainer pickers).
- **E2E** (Playwright, `SERVER_AUTHORITATIVE=1`): double-click the active → chrome present
  and anchored; attach one Fire → dim lifts; spend energy to below a cost → dim returns;
  click a payable attack → it executes; swipe to an Energy slide → no chrome; Escape closes.
- **Manual**: the E2E render compared against `out/ptcg-live-panel-v20-0.png` (approved look)
  and `v24`/`v25` (dim states).

## Migration / rollout

No data migration. UI-only, additive except for the `imageClick` routing removal.

Revert path, in order of increasing blast radius:
1. Drop `decorate` from the `openCarouselViewer` call → inspector disappears, carousel
   behaves as today.
2. Restore the `shouldOpenAttackPreview` branch in `imageClick` → back to 008's behaviour
   (with its flash, since the carousel is still the double-click host).
3. Revert the slice-3 commit → both gone.

`decorate` is optional and `card-picker.js` is unchanged in default behaviour, so a
half-landed state is inert rather than broken.

## Work plan — slices ≤1 session, each leaving the repo green

| Slice | Delivers | Green when |
|---|---|---|
| 1 ✅ DONE 4ce9c9d | `card-inspector-model.mjs` + tests; export `ENERGY_SYMBOL_TO_TYPE` from `energy-effects.mjs` (C7); confirm the server-stamped card carries `retreat` symbols (O4) | 28 new unit tests green, wired into `pnpm test`; full suite 1746/1747 (the 1 fail is the pre-existing `trainer drop` case); no DOM touched |
| 2 | `decorate` hook in `card-picker.js`/`openCarouselViewer`; `card-inspector.mjs` renderer + CSS; band table | unit + integration green; discard/deck/prizes pickers visually unchanged (E2E regression pass) |
| 3 | Double-click routing, zone relocation from `attack-preview.js`, live refresh, dim wiring; delete `openAttackPreview` and the spike's duplicated constants | E2E under `SERVER_AUTHORITATIVE=1`; `panel-spike.mjs` deleted; lint + format clean |

Slice order is load-bearing: 1 and 2 land without changing any user-visible behaviour, so
the repo is shippable between every slice. Only 3 rewires gestures, and it does so in one
commit so 008's zones are never left orphaned.

## Deviations (Builder appends here during build)

---
Self-approval checklist (only when the user is unreachable):
- [ ] Every constraint traceable into the Design section
- [ ] Every edge-case row has an expected behavior (or a written strike reason)
- [ ] Interfaces fully named and typed — no hand-waving
- [ ] Slices each ≤1 session and independently green
- [ ] No section reads "TBD"