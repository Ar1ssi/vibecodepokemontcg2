# 018: Stadium card double-click opens the inspector with a Use panel

Status: shipped
Date: 2026-09-20 · Session: S193

## Problem
Double-clicking the in-play Stadium shows only a plain enlarged scan (`click-events.js:345,393`).
The attack/ability inspector — the TCG Live readout with a clickable panel — is gated to your own
Active/Bench Pokémon (`click-events.js:367-370`, `card-inspector-model.mjs:101-114`). A player who
wants to *use* a Stadium must find the small sidebox button instead. The user wants the same
double-click module on the in-play Stadium, with a Use control, reusing the existing activation path.

## Constraints
- Studio/legacy both paths must work: activation goes through the existing `stadiumEffect(user)`
  (`chat-buttons.js:4473`), which already does the authoritative dispatch, turn gate, once-per-turn
  gate, condition gate and cost payment — do not duplicate that logic.
- The inspector is mounted in the main document via the carousel `decorate` hook and styled by
  `index.css` (013 C3/C5). No board-iframe CSS.
- Pure decisions stay DOM-free and unit-testable (`card-inspector-model.mjs` is DOM-free).
- No new dependency; no new test file (avoid the `pnpm test` explicit-list trap).
- #stadium is neutral: `event.target.user` is unset, so `mouseClick.cardUser` is `'opp'`; the
  cardUser gate cannot be reused for stadium routing.

## Current state
- `click-events.js:316` `doubleClick` → `resolvePreviewCard` → for `active|bench|hand|stadium`
  it builds attached slides, then only `active|bench` + `cardUser==='self'` opens the inspector
  (`371`); otherwise `openCardPreview(targetImage, card)` (`393`).
- `card-inspector.mjs:557` `openCardInspector({card,attachedSlides,zone,getContext,onAttack,onAbility})`
  builds the carousel with a `decorate` hook; `decorateInspectorSlide` (`366`) bails to the bare
  scan when `model.kind === 'plain'` (`375`); `buildChrome` (`237`) draws HP/ability/attacks/stats;
  `wirePanelClicks` (`435`) fires `onAttack`/`onAbility`; `hydrateContext` (`529`) calls the
  Pokémon-specific `resolveLiveContext`.
- `card-inspector-model.mjs:184` `buildInspectorModel(card, ctx)` returns `kind:'pokemon'` or
  `kind:'plain'`; `isInspectablePokemon` explicitly rejects `stadium` (`107`).
- `stadium-effects.mjs` (pure) exports `isStadiumCard` (`70`), `classifyStadiumEffect` (`127`),
  `applyStadiumEffect` (`982`, returns `{family,executed,results}`), `stadiumOnceConditionMet` (`334`).
- `rules-state.mjs` exports `stadiumUsed(player)` (`685`), `markStadiumUsed` (`681`), `rulesState`
  (`.enabled`, `.turnPlayer`, `.flags[player]`).
- Activation UI today: sidebox `stadiumButton` → `stadiumEffect(systemState.initiator)`
  (`sidebox/p1/chat-buttons.js:55`, `p2:57`).

## Options

**1. Where the stadium usability decision lives**
- A) New pure `stadiumActivationStatus(card, {rulesEnabled,yourTurn,usedThisTurn,flags})` in
  `stadium-effects.mjs`, consumed by the model. One home for stadium rules, testable, mirrors
  `listAttacks`/`listAbilities` feeding the Pokémon model.
- B) Re-derive inside `card-inspector.mjs` from `applyStadiumEffect` + read `rulesState` directly.
  Spreads rules into the DOM layer; the model would then just carry raw data.
- Pick **A** — same separation the inspector already enforces (model is the only decision point).

**2. What the module shows for a Stadium**
- A) Overlay an opaque panel (like an attack/ability panel) over the printed effect text, with a
  `Stadium` badge, the name, the effect text, and click-to-use when usable.
- B) Add a floating "Use" button only, leaving the printed text visible.
- Pick **A** — consistent with the module the user asked for; the panel restates the text in the
  same live, orb-resolved style as attacks. Panel is content-sized (013: never stretch).

**3. Which Stadiums get a Use action**
- Continuous/passive/unknown stadiums have no activatable effect (`applyStadiumEffect().family` is
  `continuous-*`/`none`/`unknown`). Show the effect panel but no click (receded, reason tooltip).
- `setup-once` / `once-per-turn` are actionable → show a clickable Use when legal.
- Pick: actionable families only; matches the sidebox button's real effect coverage.

**4. Usability gate strictness**
- Gate `usable` on: rules enabled · it is the acting player's turn · not already used this turn
  (once-per-turn) · once-per-turn condition met. Click always funnels through `stadiumEffect`, so
  any residual gap (e.g. unpayable discard cost) still produces the authoritative chat message.
- Pick: gate as above; do not attempt to pre-compute cost payment (that mutates zones).

**5. Route + actor**
- Route `mouseClick.zoneId === 'stadium'` (no cardUser gate). Acting user = `systemState.initiator`
  (the same actor the sidebox button passes). Close the inspector before calling `stadiumEffect`,
  mirroring the attack path, so effect pickers are not buried under the carousel.
- Pick: as stated.

## Design

### Pure: `stadium-effects.mjs`
```js
export const STADIUM_ACTION_FAMILIES = ['setup-once', 'once-per-turn'];

// { actionable, usable, reason }
export function stadiumActivationStatus(card, {
  rulesEnabled = true, yourTurn = true, usedThisTurn = false, flags = {},
} = {})
```
- not a stadium → `{actionable:false, usable:false, reason:'Not a Stadium card.'}`
- `applyStadiumEffect(card).family` not in `STADIUM_ACTION_FAMILIES` → actionable false, reason
  "Continuous effect — always active while in play." (or "no activatable effect" for none/unknown)
- `!rulesEnabled` → reason "Rules mode is off."
- `!yourTurn` → reason "It's not your turn."
- once-per-turn && `usedThisTurn` → reason "Already used this turn."
- `results[0].condition` unmet via `stadiumOnceConditionMet` → condition reason (named-supporter
  wording mirrors `chat-buttons.js:4532`).
- else `{actionable:true, usable:true, reason:null}`.

### Pure: `card-inspector-model.mjs`
- import `isStadiumCard`, `stadiumActivationStatus`.
- New `if (isStadiumCard(card))` branch **before** `isInspectablePokemon`, returning:
  ```
  { kind:'stadium', name, text, actionable, usable, reason,
    recede: actionable && !usable, blockTopPct: stadiumZoneBounds().topPct,
    dimLevel:'none', interactive: usable }
  ```
  `text` = `card.text ?? card.effect ?? ''`.

### Pure: `attack-zone-geometry.js`
- `export function stadiumZoneBounds()` → `{ topPct: 30 }` (constant, content-sized panel over the
  printed effect box). No height — the panel is as tall as its text.

### DOM: `card-inspector.mjs`
- `stadiumEl(model)`: `section.ptcg-stadium[data-ptcg-stadium]`, banner `--ptcg-banner` (stadium
  slate `#5a6070`), head reuses `.ptcg-atk__head/.ptcg-atk__badge/.ptcg-atk__name` ("Stadium"),
  body reuses `.ptcg-atk__text` + `textWithOrbs`; `title = reason`; `ptcg-stadium--recede` when receded.
- `buildChrome` branches: `if (model.kind === 'stadium') return buildStadiumChrome(model)`.
- `applyAffordances`: toggle `.ptcg-stadium--usable` on `handlers?.onUse && model.usable`.
- `wirePanelClicks`: `.ptcg-stadium[data-ptcg-stadium]` → if `model.usable`, `stopPropagation`,
  `actions.onUse()`.
- `openCardInspector({..., onUse = null})`; pass `onUse` through `decorate` actions.
- `hydrateContext`: `if (isStadiumCard(state.card)) return;` (no async context; `rerender` re-reads
  `getContext()` each event so the gate stays live).
- New exported `stadiumContextFor(card, {rulesEnabled, yourTurn, usedThisTurn, flags})` →
  `{ rulesEnabled, yourTurn, stadiumUsed, flags }` (maps to the model's ctx field).

### DOM: `click-events.js`
In the `active|bench|hand|stadium` branch, after `attachedSlides`:
```js
if (mouseClick.zoneId === 'stadium') {           // full-view guard already passed
  const user = systemState.initiator;
  openCardInspector({
    card, attachedSlides, zone: 'stadium',
    getContext: () => stadiumContextFor(card, {
      rulesEnabled: Boolean(rulesState.enabled),
      yourTurn: rulesState.turnPlayer === user,
      usedThisTurn: stadiumUsed(user),
      flags: rulesState.flags?.[user] || {},
    }),
    onUse: () => { closeCardInspector(); stadiumEffect(user); },
  });
  return;
}
```
(imports: `stadiumContextFor`, `stadiumUsed`, `stadiumEffect`.)

### CSS: `index.css`
- add `.ptcg-stadium` to the shared `.ptcg-atk,.ptcg-ability` base (opaque white, flex column,
  `pointer-events:auto`), to `--recede`, and to `--usable` (+ hover).
- No new sized selector needed (head/body reuse existing `--u` classes).

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | no Stadium in #stadium (zone empty) | double-click never fires (no card element); `stadiumEffect` also guards "No Stadium is in play." | existing guard; not unit-testable (no DOM harness) |
| 2 | card missing text / unknown family | panel shows name, no body; `actionable:false`, receded, reason "no activatable effect" | [x] `rules-extended` "continuous and non-stadium"; model "gets kind stadium" |
| 3 | continuous stadium | panel shown, not clickable, reason "Continuous effect…" | [x] `rules-extended` continuous; model "a continuous Stadium shows text but is never usable" |
| 4 | double-click repeatedly / Use twice | first click closes inspector then fires; second Use blocked by turn/once-per-turn gate + `stadiumUsed` | [x] `rules-extended` per-turn gates; model "already used recedes" |
| 5 | `rulesState` flags for the player missing | `flags = {}`; condition check treats as unmet, panel receded with reason | [x] `rules-extended` "condition gates once-per-turn" (flags `{}`) |
| 6 | not your turn / rules off | `usable:false`, receded, reason shown; `stadiumEffect` also messages | [x] `rules-extended` gates; model "off-turn and rules-off stadiums recede" |
| 7 | Setup-once stadium already in play | actionable while it is your turn; same as sidebox behavior (no new gate) | [x] `rules-extended` "setup-once is actionable" |
| 8 | Grand Tree (special-cased in chat-buttons) | classified once-per-turn → actionable; Use routes to `stadiumEffect` → `executeGrandTreeSpecialRule` | classification [x] `rules-extended` "Grand Tree: once-per-turn"; live click not run (no runtime server in env) |
| 9 | acting user `'opp'` in 2P | `systemState.initiator` used, same as sidebox; `yourTurn` compares against `rulesState.turnPlayer` | code-path only; live 2P not run (no runtime server in env) |

## Test plan
- Pure unit in `rules-extended.test.mjs`: `stadiumActivationStatus` — non-stadium, continuous,
  once-per-turn (usable/used/not-your-turn/condition-unmet), setup-once, rules-off.
- Unit in `card-inspector-model.test.mjs`: stadium card → `kind:'stadium'`, text, usable/recede,
  never `kind:'pokemon'`; Pokémon path unchanged.
- `card-inspector-css.test.mjs`: `.ptcg-stadium` opaque (no background void), joins usable/recede.
- Manual: `pnpm test:inspector` Playwright gate is Pokémon-specific; do a live double-click on an
  in-play Stadium (Artazon + a once-per-turn stadium) in a hand-started server.
- `pnpm test` full run green.

## Migration / rollout
n/a — UI-only, no schema/state/data change; fully reverted by reverting the diff.

## Work plan — slices ≤1 session, each leaving the repo green
| Slice | Delivers | Green when |
|---|---|---|
| 1 | `stadiumActivationStatus` (pure) + unit tests | `pnpm test` green |
| 2 | model stadium branch + `stadiumZoneBounds` + model tests | `pnpm test` green |
| 3 | renderer (`stadiumEl`, `buildChrome`, `applyAffordances`, `wirePanelClicks`, `openCardInspector.onUse`, `stadiumContextFor`, `hydrateContext` guard) + CSS | `pnpm test` green |
| 4 | `click-events.js` routing + manual live check | `pnpm test` + `pnpm lint` (delta clean) |

## Deviations (Builder appends here during build)
