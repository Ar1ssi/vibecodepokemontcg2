# 023: TCG Live card affordance glows
Status: built (review fixes + slice 5 applied; visual check pending)
Date: 2026-09-21 · Session: S238

## Problem

Pokémon TCG Live tells a player at a glance what they may do, by glowing the card itself:
hand cards that are playable now, Pokémon (active or benched) whose Ability can be used,
the Active when it has a payable attack, and an in-play Stadium whose effect is activatable.
This sim glows only *in-play Abilities* (`.has-usable-ability`, S157/S158 "highlight-parity"),
and signals attacks/abilities through sidebox buttons (`.attacks-available` /
`.abilities-available`) rather than on the board. A player cannot see, without reading the
board, which hand cards are live, which Active can strike, or that the Stadium is usable.
The glow is also **colour-coded by card kind**, the way Live teaches the player the card
taxonomy: Energy by its type colour, Supporters red, Items/Tools blue, Stadiums green (in
hand *and* in play); Pokémon stay the existing cyan (user, S238).

## Constraints

- **C1 — CSS reaches only the iframe that owns the element.** Hand and board cards live in
  `selfContainerDocument` / `oppContainerDocument` (`client/src/initialization/.../containers.js`,
  `get-zone.js:36`), which load only `client/src/css/self-containers.css` and
  `opp-containers.css`. The in-play Stadium is parent-owned (`#stadium`, D93) and lives in the
  top document, styled by `client/src/css/index.css`. A glow class placed in the wrong sheet is
  invisible (this exact bug is why S157→S158 moved the ability glow into the container sheets).
- **C2 — one source of truth for legality.** The glow must never disagree with what the game
  will accept. Legality is already centralized: `enumerateOptions` (`client/src/setup/general/e2e-options.mjs`)
  for hand moves, `computeActionAffordances` (`client/src/setup/rules/action-affordances.mjs`)
  for attack + in-play ability, `stadiumActivationStatus` (`shared/engine/rules/stadium-effects.mjs:2037`)
  for the Stadium. The glow is a *renderer* of those decisions, never a re-derivation.
- **C3 — selection outranks ambient glow.** `.highlight` / `.selectHighlight` (index.css:206/212
  and mirrored in the container sheets) must keep winning the source-order tie (existing
  `highlight-parity-css.test.mjs` contract). New glow rules go *above* `.highlight`.
- **C4 — no opponent information leak.** Only the local turn player's own cards glow;
  the opponent's hand is face-down and never scanned.
- **C5 — accessibility.** Under `prefers-reduced-motion: reduce` the affordance stays visible
  as a static glow (the information is functional, unlike mat FX); only the animation stops.
- **C6 — no new dependencies; UI-only, additive.**
- **C7 — one palette.** The colour of a glow is a function of the *card*, independent of why it
  glows (playable / ability / attack). The palette is the same energy-type table the inspector's
  attack banner already uses (`card-inspector.mjs:80` `BANNER`) — extracted, not copied — plus
  Supporter red / Item-Tool blue / Stadium green / default cyan. A card's colour never disagrees
  between surfaces, and no per-colour CSS class is invented per energy type.
- **C8 — Pokémon stay cyan.** Only Energy / Supporter / Item / Tool / Stadium are tinted; a
  playable Pokémon, a usable Ability, and a payable attack all keep today's cyan (user, S238).

## Current state

Facts from reading code this session.

- `client/src/setup/rules/rules-bridge.js:1809` `hookActionAffordances()` is the one DOM refresh
  loop for board affordances. It scores two sideboxes (`self`/`opp`), only for the turn player
  (`isTurn`), calls `computeActionAffordances(...)` (`:1863`), toggles the attack/ability button
  classes (`:1886-1889`), and adds `.has-usable-ability` to `card.wrapper || card.image`
  (`:1890-1896`) tracked in `glowNodes` and cleared per refresh (`:1830-1833`). It re-runs on 9
  document events (`:1900-1910`). It already resolves `activeCard`, `attachedEnergyCards`,
  `benchCards`, `stadiumCard`, `extraAttacks`, and the merged `isAbilitySpent(user, card)`
  predicate — all the inputs a hand/stadium glow needs too.
- `action-affordances.mjs:66` `computeActionAffordances({activeCard, attachedEnergyCards,
  benchCards, stadiumCard, extraAttacks, isAbilityUsed, ensureCardData})` returns
  `{attackAvailable, abilityAvailable, usableAbilities:[{card,zone,index,family,abilityName}]}`.
  It uses `resolveAttackContext` + `listUsableActions` for attack payability (the same engine
  path the sidebox button reflects) and `collectUsableAbilityCandidates` + `filterUsableAbilities`
  for abilities. Pure, node-tested (`__tests__/action-affordances.test.mjs`).
- `e2e-options.mjs:122` `enumerateOptions({user, hand, active, bench, activeZoneCards,
  isAbilityUsed, statusKey, attachedCardsOf, prizeCounts, stadiumName, deckList})` is the
  canonical legal-move enum used by the playtest bot. It returns tagged options with `handIndex`:
  `playBasic`, `evolve`, `attach`, `playTrainer` (Supporter/Item/Stadium all normalize to this
  kind at `:243-264`, gated by `canPerformAction` + `trainerPlayBlockReason`). It returns `[]`
  when it is not `user`'s turn (`:150-151`). Pure and node-importable.
- `stadiumActivationStatus(card, {rulesEnabled, yourTurn, usedThisTurn, flags})` (`stadium-effects.mjs:2037`)
  returns `{actionable, usable, reason}` — `actionable` false for continuous/passive Stadiums,
  `usable` folding in turn / once-per-turn / condition gates. `card-inspector.mjs:595`
  `stadiumContextFor` and `:615` `resolveLiveContext` already assemble this context from
  `getStadium()` / `getAuthoritativeStadiumArray()`; `card-inspector-model.mjs:388-413` consumes it.
- The Stadium node: legacy `#stadium` holds the card image in the top document
  (`update-stadium-card.js:33`, `apply-view.js:1364` `reconcileStadium` appends the img into
  `#stadium`). `getZone(user,'stadium')` (`get-zone.js:39-40`) reads the top document. So the
  Stadium's glow belongs in `index.css`, unlike board cards.
- `getZone(user,'hand')` returns `{array, element}` for the iframe's `#hand`; each entry is a
  `Card` (`deck-constructor/card.js`) with `.image` and, once holo-hydrated, `.wrapper`
  (`hydrate-holo.js:111`).
- `.has-usable-ability` + `@keyframes ability-glow` exist in both container sheets
  (`self-containers.css:183-190`, `opp-containers.css:172`), declared before `.highlight`, and
  are guarded by `__tests__/highlight-parity-css.test.mjs` (which matches a selector inside a
  comma-separated rule via its `ruleBody` helper).
- Colour sources that already exist: `card-inspector.mjs:80` `BANNER` maps a type name to a hex
  (Fire `#c0392b`, Water `#2d7dd2`, … Colorless `#8e8e93`) and `BANNER_DEFAULT = '#8e8e93'`;
  `energy-token-assets.mjs:61` `getEnergyTokenFront` resolves a card's energy type by
  `types[0]` / name word / `{X}` symbol / `'dark'`, but returns an image path rather than the
  type key. Neither the palette nor the key resolver is reusable as written.
- Card-kind predicates: `isEnergy`/`isTrainer` (`shared/engine/cards.mjs`), `isStadiumCard`
  (`stadium-effects.mjs`, exported), `isSupporterTrainer`/`isToolTrainer`
  (`trainer-play-conditions.mjs`). There is no shared `isItemTrainer`; "Trainer that is not
  Supporter/Stadium/Tool" is the Item bucket.
- No glow exists for hand playability, the Active's attack, or the Stadium today.

## Options

### O1 — where hand playability is decided

**A. Reuse `enumerateOptions` and map its options back to hand cards.**
Structural parity by construction: a card glows iff the bot would be offered a legal move for
it, from the same gates (`canPerformAction`, `canEvolve`, `trainerPlayBlockReason`) the server
enforces. Smallest correct change; no new legality logic.

**B. Write a dedicated per-card playability scan.**
Natural-shaped return, but duplicates five gate families that already exist and will drift the
moment a rule changes — exactly the failure mode `e2e-options.mjs`'s header warns against.

**C. Extract the per-card logic from `enumerateOptions` into shared helpers and call them from both.**
Most robust, but rewrites the bot's enum in the same breath as a cosmetic feature.

**Pick: A**, with a parity test that locks the options→glow mapping. C is the natural follow-up if
`enumerateOptions`' attack gate ever needs to match `listUsableActions` (out of scope here — we
never read its attack options).

### O2 — glow class vocabulary and per-card colour

**A. Extend `.has-usable-ability` to mean "any glow".** One class, but conflates four distinct
meanings, prevents per-kind styling, and makes the CSS tests unable to tell them apart.

**B. Per-colour CSS classes** (`.glow--fire`, `.glow--supporter`, …). Eleven energy types plus
four kinds of hand-written rules, and adding an energy type means editing three stylesheets.

**C. One base class + a per-node CSS variable** — a single `.has-glow` carries the
`box-shadow`/`animation` and reads `--glow-rgb`; the glue sets `--glow-rgb` from
`glowColorFor(card)`, and `.has-usable-ability` (the pre-023 class, still styled) is kept
alongside for compatibility. No reason classes: `clearGlow` clears `has-glow` for everything.

**Pick: C.** One rule per stylesheet covers every colour; energy types need no CSS at all; the
variable travels with the node into whichever document owns it. A grouped rule would also force
all four kinds to the same colour, which C7 forbids. Keeping `.has-usable-ability` in the
selector preserves the existing `highlight-parity-css.test.mjs` contract.

### O3 — where the DOM glue lives

**A. Extend `hookActionAffordances`.** One refresh loop, one clear, one event list — the same
"one dispatch" principle D94 adopted for mat FX.

**B. A second observer/listener set for hand/stadium glows.** A second writer to the same nodes
and a second set of triggers that can disagree with the button states.

**Pick: A.**

### O4 — attack glow target

The user's wording is card-level ("an attack that can be used if it is your active Pokémon").
Glow the **whole Active card** using `computeActionAffordances().attackAvailable` (the same
boolean the attack button uses), not the inspector's per-attack zones (which already carry
their own unusable marks in the preview).

### O5 — where a card's colour is resolved

**A. In the DOM glue**, branching on the card's type at paint time. Colour rules become
untestable outside a browser.

**B. In a pure `glowColorFor(card)` module**, called by `computeCardGlows` so each glow entry
carries its `rgb`. Colour precedence is a unit test.

**Pick: B.** Keeps the model the single place a glow is decided (C2's spirit), and lets the
palette be shared with the inspector banner (C7).

## Design

### New pure colour module: `client/src/setup/rules/card-glow-colors.mjs`

Single source for the hand/board glow palette and for the inspector's attack banner.

```js
// Extracted from card-inspector.mjs's BANNER so the banner and the glow can never disagree (C7).
export const TYPE_GLOW = {
  fire: [192, 57, 43], water: [45, 125, 210], grass: [63, 155, 79],
  lightning: [224, 165, 31], psychic: [155, 89, 182], fighting: [207, 106, 28],
  dark: [74, 74, 94], metal: [127, 135, 146], dragon: [91, 110, 225],
  fairy: [224, 127, 168], colorless: [142, 142, 147],
};
export const GLOW_RGB = {
  supporter: [229, 57, 53],   // red
  item: [66, 165, 245],       // blue (Items *and* Tools)
  stadium: [67, 160, 71],     // green
  default: [120, 200, 255],   // cyan — Pokémon hand/ability/attack (C8)
};

/**
 * Precedence is load-bearing: a Stadium is a Trainer, and a Tool is a Trainer, so the
 * most specific kind must win. Energy type falls back to Colorless grey when absent.
 * @returns {{ tone:string, rgb:[number,number,number] }}
 */
export function glowColorFor(card) {
  if (!card) return { tone: 'default', rgb: GLOW_RGB.default };
  if (isStadiumCard(card)) return { tone: 'stadium', rgb: GLOW_RGB.stadium };
  if (isSupporterTrainer(card)) return { tone: 'supporter', rgb: GLOW_RGB.supporter };
  if (isTrainer(card)) return { tone: 'item', rgb: GLOW_RGB.item };   // Item or Tool
  if (isEnergy(card)) {
    const key = energyTypeKeyFor(card);            // types[0], name word, or {X} symbol
    return { tone: `energy-${key}`, rgb: TYPE_GLOW[key] || TYPE_GLOW.colorless };
  }
  return { tone: 'default', rgb: GLOW_RGB.default };                  // Pokémon
}
```

`energyTypeKeyFor(card)` is new: `energy-token-assets.mjs`'s current `getEnergyTokenFront`
resolves a card's type by `types[0]`, then a type word in the name, then a `{X}` symbol, then
`'dark'` — but returns an image path, not the key. The extraction returns the canonical key
(`'fire'`, `'darkness'`, …) and `getEnergyTokenFront` is refactored to map key → `ENERGY_TOKEN_FRONT[key]`,
so both callers share one resolver. `card-inspector.mjs`'s `BANNER`/`BANNER_DEFAULT` are
re-expressed to import `TYPE_GLOW` so the banner and glow agree.

### New pure orchestrator: `client/src/setup/rules/card-glow-model.mjs`

Composes the three existing decisions into one plain object. DOM-free, node-tested.

```js
import { enumerateOptions, defaultStatusKey, ... } from '../general/e2e-options.mjs';
import { computeActionAffordances } from './action-affordances.mjs';
import { glowColorFor } from './card-glow-colors.mjs';
import { stadiumActivationStatus } from '/shared/engine/rules/stadium-effects.mjs';
import { rulesState } from '/shared/engine/rules/rules-state.mjs';

// Hand-move kinds that make a hand card glow. `moveCard` is NOT included: enumerateOptions
// emits playTrainer (not moveCard) for every Trainer, Stadium included.
const HAND_GLOW_KINDS = new Set(['playBasic', 'evolve', 'attach', 'playTrainer']);

export async function computeCardGlows({
  user = 'self',
  handCards = [],
  activeCard = null,
  attachedEnergyCards = [],
  benchCards = [],
  activeZoneCards = [],
  stadiumCard = null,
  extraAttacks = [],
  isAbilityUsed = () => false,
  ensureCardData = async () => {},
  // hand-legality context, forwarded verbatim to enumerateOptions
  prizeCounts = null,
  deckList = [],
  stadiumName = null,
  statusKey = defaultStatusKey,
  attachedCardsOf = undefined,
  // stadium-legality context (defaults read the live singleton, as enumerateOptions does)
  rulesEnabled = rulesState.enabled,
  yourTurn = rulesState.turnPlayer === user,
  stadiumUsedThisTurn = !!rulesState.flags?.[user]?.stadiumUsed,
  flags = rulesState.flags?.[user] || {},
} = {}) {
  // 1. Attack + in-play abilities reuse the exact affordability path the sidebox uses.
  const affordance = await computeActionAffordances({
    activeCard, attachedEnergyCards, benchCards, stadiumCard, extraAttacks,
    isAbilityUsed, ensureCardData,
  });

  // 2. Hand playability = the bot's legal-move enum, filtered to hand entries.
  const options = await enumerateOptions({
    user, hand: handCards, active: activeCard, bench: benchCards,
    activeZoneCards, isAbilityUsed, statusKey, attachedCardsOf,
    prizeCounts, stadiumName, deckList,
  });
  const handPlayable = new Map();
  for (const o of options) {
    if (HAND_GLOW_KINDS.has(o.kind) && Number.isInteger(o.handIndex)) {
      const card = handCards[o.handIndex];
      if (card) handPlayable.set(card, glowColorFor(card));
    }
  }

  // 3. Stadium activatability.
  const stadium = stadiumCard
    ? stadiumActivationStatus(stadiumCard, { rulesEnabled, yourTurn, usedThisTurn: stadiumUsedThisTurn, flags })
    : { actionable: false, usable: false, reason: 'No Stadium in play.' };

  return {
    handPlayable,                              // Map<Card, {tone, rgb}>
    activeCanAttack: affordance.attackAvailable,
    activeColor: glowColorFor(activeCard),     // Pokémon → default cyan (C8)
    abilityCards: affordance.usableAbilities,  // [{card, zone, index, family, abilityName}]
    stadiumUsable: stadium.usable,
    stadiumColor: glowColorFor(stadiumCard),   // green when usable and when in hand (C7)
    stadiumReason: stadium.reason,
  };
}
```

`enumerateOptions` already returns `[]` when it is not `user`'s turn, and
`computeActionAffordances` is only called by the glue for the turn player, so a single call per
side is safe.

### Changed: `client/src/setup/rules/rules-bridge.js`, `hookActionAffordances`

Replace the direct `computeActionAffordances` call (`:1863-1877`) with `computeCardGlows` and
widen the class application. `isAbilitySpent`, `stadiumCard` and `extraAttacks` carry over
unchanged; the zone reads switch to the live sources (slice 5, below) so both render paths
describe the same cards.

```js
const GLOW_CLASSES = ['has-glow', 'has-usable-ability'];
const glowNodes = new Set();               // nodes currently carrying any glow (for clear)
// ...
const localUser = systemState.isTwoPlayer ? systemState.initiator : 'self';
// ...
// Every read goes through the live (view-aware) sources — slice 5.
const activeZoneCards = liveZoneArray(user, 'active');
activeCard = liveActiveCard(activeZoneCards);
const handCards = user === localUser ? liveZoneArray(user, 'hand') : []; // C4: own hand only
const benchCards = liveZoneArray(user, 'bench').map((card) => liveCardFor(card));
const glows = await computeCardGlows({
  user, handCards, activeCard,
  attachedEnergyCards: attachedEnergiesFor(activeCard, activeZoneCards),
  benchCards, activeZoneCards,
  stadiumCard, extraAttacks,
  isAbilityUsed: (card) => isAbilitySpent(user, card), ensureCardData,
  prizeCounts: { self: liveZoneArray(user, 'prizes').length,
                 opponent: liveZoneArray(user === 'self' ? 'opp' : 'self', 'prizes').length },
  stadiumName: stadiumCard?.name || null,
  deckList: [/* the player's own 60: deck or ownDeckCards + discard + lostZone + prizes + hand */],
});
// The Stadium is parent-owned (#stadium, D93); its card node is not the one to class.
const addGlow = (card, { node: override = null, color, ability = false } = {}) => {
  const node = override || glowNodeFor(card); // registry wrapper/element, else legacy wrapper/image
  if (!node?.classList) return;
  const { rgb } = color || glowColorFor(card);
  node.classList.add('has-glow');
  if (ability) node.classList.add('has-usable-ability');
  node.style?.setProperty('--glow-rgb', rgb.join(','));
  glowNodes.add(node);
};
for (const [card, color] of glows.handPlayable) addGlow(card, { color });
for (const { card } of glows.abilityCards) addGlow(card, { ability: true });
if (glows.activeCanAttack) addGlow(activeCard, { color: glows.activeColor });
if (glows.stadiumUsable) {
  addGlow(stadiumCard, { node: document.getElementById('stadium'), color: glows.stadiumColor });
}
```

The glue imports `glowColorFor` for the ability case (a Pokémon → default cyan); hand, active
and Stadium colours arrive pre-resolved on the model so the colour decision has one home.

`clearGlow` removes every class in `GLOW_CLASSES` from each tracked node and clears the inline
`--glow-rgb` (`node.style?.removeProperty('--glow-rgb')`), then clears the set. The button-class
toggles stay exactly as today.

`deckList` is only read by `enumerateOptions` to trace Rare Candy lines
(`trainerTargetCountsOf`). The glue passes the player's own 60 (deck zone + discard + prizes +
hand + lost zone), so the Rare Candy case below only over-glows when a zone array is unavailable.

### Changed: CSS

> **S239 restyle (user, matched against a TCG Live capture):** the breathing halo below was replaced by a
> **flowing lit rim**: a fully lit 3px rim in `--glow-rgb` with soft white hotspots drifting along it (two
> conic-gradient layers turned by registered `--glow-angle` 3.2s and `--glow-angle-2` 4.9s reversed) over a
> 10px bloom. Hand cards keep a steady rim (Live's hand glow does not move). Per-kind colours kept (user),
> though Live's capture shows one cyan for everything. Bare `<img>` draws the ring as `padding: 3px`
> (border-box) over the gradient; `.mat-holo` and `#stadium` use a masked `::after`. Reduced motion pauses
> (static lit rim). Code blocks below describe the pre-S239 halo; the sheets are the truth.

One variable-driven rule per stylesheet (the variable is inherited by the node and travels into
whichever document owns it — C1).

**`client/src/css/self-containers.css` and `opp-containers.css`** — replace the fixed cyan
`ability-glow` rule (`:183-190` / `:172`) with a `card-glow` rule that reads `--glow-rgb`, kept
*above* `.highlight`. `.has-usable-ability` stays in the selector so the pre-023 class keeps
glowing:

```css
@keyframes card-glow {
  0%, 100% { box-shadow: 0 0 4px 1px rgba(var(--glow-rgb, 120, 200, 255), 0.35); }
  50%      { box-shadow: 0 0 10px 3px rgba(var(--glow-rgb, 120, 200, 255), 0.6); }
}
.has-glow,
.has-usable-ability {
  box-shadow: 0 0 8px 2px rgba(var(--glow-rgb, 120, 200, 255), 0.5);
  animation: card-glow 2s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  /* Paused, not `animation: none`: a paused animation still applies its
     box-shadow, which must outrank `#hand img`/`#board img`'s ID-specific
     default shadow. -1s holds the 50% frame (half the 2s duration). */
  .has-glow,
  .has-usable-ability {
    animation-delay: -1s;
    animation-play-state: paused;
  }
}
```

**`client/src/css/index.css`** (Stadium is parent-owned, D93) — the same `card-glow` keyframes
and `.has-glow` rule; the Stadium element receives `.has-glow` and a green `--glow-rgb`:

```css
@keyframes card-glow { /* same as above */ }
.has-glow {
  box-shadow: 0 0 8px 2px rgba(var(--glow-rgb, 120, 200, 255), 0.5);
  animation: card-glow 2s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .has-glow {
    animation-delay: -1s;
    animation-play-state: paused;
  }
}
```

The Stadium's tilt transform lives on the element's `transform`, so animating `box-shadow`
compounds cleanly. The class is placed on `#stadium` itself (its card image is a child, not the
element `getZone` returns), which is why the glue passes `document.getElementById('stadium')` as
the node override.

### Lifecycle / refresh

Unchanged: the 9 events at `rules-bridge.js:1900-1910` plus `rules-turn-began`,
`rules-turn-view-applied`, `rules-session-reset`, `rules-card-moved`, `action-processed` already
cover hand changes, energy attach, and status changes. The `generation` guard (`:1844`, `:1883`)
already discards a stale async refresh, so adding a heavier hand scan does not introduce a race.

## Edge cases & failure modes — the completeness contract; Builder ticks every row

| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | Rules mode off (free play) | `refresh` early-returns after clearing; no glows at all | [x] covered: glue `refresh` clears then early-returns (DOM-only, untestable in node) |
| 2 | Setup phase or game ended | early-return branch clears; no glows | [x] covered: same `refresh` early-return branch |
| 3 | Not the turn player | `enumerateOptions` returns `[]`; the model also gates attack/ability on `yourTurn`; no glows | [x] covered: `card-glow-model.test.mjs` "nothing glows for the non-turn player" (hand + attack + abilities) |
| 4 | Opponent's hand | never scanned; the glue passes `handCards` only when the box's `user` is the local player | [x] covered: glue `localUser` gate (`isTwoPlayer ? initiator : 'self'`); review finding, fixed |
| 5 | Card data unresolved (`ensureCardData` rejects) | Pokémon skipped by `enumerateOptions` (`card.hp` guard); no glow rather than a wrong one | [x] covered: `enumerateOptions` `card.hp` guard + glue try/catch leaves the side dim |
| 6 | Bench full | Basic Pokémon option suppressed → no hand glow | [x] covered: `card-glow-model.test.mjs` "…does not glow when the bench is full" |
| 7 | Evolve card in hand, no legal target | `canEvolve` fails for every target → no glow | [x] covered: `card-glow-model.test.mjs` "a Stage 1 glows only when canEvolve passes…" |
| 8 | Energy card in hand, already attached this turn | `canPerformAction('attachEnergy')` fails → no glow | [x] covered: `card-glow-model.test.mjs` "energy glows, then stops once…spent" |
| 9 | Supporter on turn 1 / Supporter already played | `trainerPlayBlockReason` → no glow | [x] covered: `card-glow-model.test.mjs` "a Supporter does not glow on turn 1 or once already played" |
| 10 | Stadium in hand, same name in play / Stadium already played this turn | `trainerPlayBlockReason` → no glow | [x] covered: `card-glow-model.test.mjs` "a Stadium in hand stops glowing by same name or once already played this turn"; `e2e-options.test.mjs` "a second Stadium is not offered once one was played this turn" |
| 11 | Rare Candy in hand, Basic in deck (deckList unavailable) | over-glows (bounded, documented); degrades gracefully | [x] covered: glue now passes the player's own 60 (deck+discard+lost+prizes+hand); bounded only if a zone array is unavailable |
| 12 | Active attack unpayable / asleep / paralyzed / confused | `listUsableActions` → `attackAvailable` false → no Active glow | [x] covered: `action-affordances.test.mjs` (attackAvailable false) feeds `activeCanAttack`; glue glows only when true |
| 13 | Stadium continuous/passive effect | `stadiumActivationStatus.actionable === false` → no glow | [x] covered: `card-glow-model.test.mjs` "stadiumUsable follows stadiumActivationStatus gates" (passive) |
| 14 | Stadium once-per-turn already used | `stadiumUsedThisTurn` true → no glow | [x] covered: `card-glow-model.test.mjs` "stadiumUsable follows stadiumActivationStatus gates" (used / not-my-turn) |
| 15 | No Stadium in play | `stadiumUsable` false; no node to class | [x] covered: `card-glow-model.test.mjs` "stadiumUsable is false with no Stadium in play" |
| 16 | Stadium node is the parent-owned `#stadium` element, not `card.wrapper/image` | glue classes `document.getElementById('stadium')` for the stadium glow, not the card node | [x] covered: glue `addGlow(stadiumCard, …, { node: stadiumNode() })` |
| 17 | Holo card (wrapper) vs plain card (image) | `card.wrapper || card.image` — both classed | [x] covered: glue `addGlow` node = `override || card?.wrapper || card?.image` |
| 18 | Card leaves hand before a refresh | node detached; `clearGlow` classList on a detached node is harmless | [x] covered: glue `clearGlow` only touches tracked nodes' classList |
| 19 | Rapid successive refreshes (attach + attack) | `generation` guard discards stale results; classes always reflect the newest | [x] covered: glue `generation` guard before the apply loop |
| 20 | Selection ring active on a glowing card | `.highlight`/`.selectHighlight` declared after the glow rule → ring wins | [x] covered: `highlight-parity-css.test.mjs` "declares .has-glow before .highlight in every sheet" |
| 21 | `prefers-reduced-motion: reduce` | glow visible, animation paused (not removed) so the animated shadow still applies | [x] covered: `highlight-parity-css.test.mjs` "keeps the glow visible but stops the animation under reduced motion" |
| 22 | Non-2P local play | only the local player's hand glows; the opponent's board may glow when it is their turn (public info) | [x] covered: glue `localUser` gate; review finding, fixed |
| 23 | Playable Supporter in hand | red `--glow-rgb` (229,57,53) | [x] covered: `card-glow-colors.test.mjs` "tints a Supporter red…" |
| 24 | Playable Item or Tool in hand | blue (66,165,245); Tool is not mistaken for a Supporter/Stadium | [x] covered: `card-glow-colors.test.mjs` "tints an Item blue" / "tints a Tool blue…" |
| 25 | Energy card in hand, no resolvable type (Special Energy) | Colorless grey (142,142,147), not an invisible/crash | [x] covered: `card-glow-colors.test.mjs` "falls back to Colorless grey…" |
| 26 | Basic Energy spelled `Basic {F} Energy` (no type word) | `energyTypeKeyFor` resolves the symbol → Fighting orange | [x] covered: `card-glow-colors.test.mjs` "resolves a symbol-spelled basic Energy"; `energy-token-assets.test.mjs` "resolves the canonical type key…" |
| 27 | Stadium in hand (playable) vs Stadium in play (activatable) | both green (67,160,71) via `isStadiumCard` before the Trainer branch | [x] covered: `card-glow-colors.test.mjs` "tints a Stadium green…" |
| 28 | A `--glow-rgb` left on a node that stops glowing | `clearGlow` removes the inline property; no stale tint | [x] covered: glue `clearGlow` calls `node.style?.removeProperty('--glow-rgb')` |

## Test plan

- **Unit** (`node --test`, files under `client/src/setup/rules/__tests__/`; the glob in `pnpm
  test` (D75) picks up new files automatically):
  - `card-glow-model.test.mjs`:
    - hand Basic glows when Active exists and bench has room; not when bench is full; not when
      not the turn player.
    - energy glows, then stops once `rulesState.flags[user].energyAttached` is set.
    - Stage 1 glows only when `canEvolve` passes for a target; never on turn 1.
    - Supporter blocked turn 1 / already-played Supporter → no glow.
    - Stadium in hand blocked by same-name-in-play / already-played-this-turn → no glow.
    - `activeCanAttack` true with payable energy, false with zero energy; mirrors
      `computeActionAffordances().attackAvailable` exactly.
    - `abilityCards` deep-equals `computeActionAffordances().usableAbilities`.
    - `stadiumUsable` true for a once-per-turn Stadium on your turn, false when used / not your
      turn / continuous.
  - **Parity invariant:** for a fixture hand (including an evolution), `handPlayable` keys
    equals the set of `enumerateOptions(...)` hand entries filtered by the model's exported
    `HAND_GLOW_KINDS`; the fixture also asserts each expected kind appears, so a rename fails loudly.
  - `card-glow-colors.test.mjs`:
    - `glowColorFor` precedence: Stadium green, Supporter red, Item blue, Tool blue, Energy by
      type, Pokémon default cyan.
    - every `TYPE_GLOW` key resolves from its printed spelling (`'Fire'`, `'{F}'`, `'Dark'`,
      `'Basic {F} Energy'`), and an unknown/absent type falls back to Colorless grey.
    - `card-inspector.mjs`'s banner colour equals `glowColorFor`'s energy colour for the same
      type (guards the extraction in C7).
- **Static CSS** (extend `__tests__/highlight-parity-css.test.mjs`):
  - all three sheets define `.has-glow` reading `rgba(var(--glow-rgb`, and
    `@keyframes card-glow` reading the same variable; the container sheets keep `.has-usable-ability`.
  - the glow rule precedes `.highlight` in the container sheets.
  - each sheet's `prefers-reduced-motion` block disables `.has-glow`'s animation.
- **E2E** (Playwright, `SERVER_AUTHORITATIVE=1`): a playable Basic in hand glows and a Stadium
  that duplicates the in-play one does not; a playable Supporter/Item/Energy resolve red/blue/
  type colour via `--glow-rgb`; Active glows with a payable attack and stops when energy is
  spent below cost; a bench Ability card glows cyan; the usable Stadium glows green; after
  passing the turn all glows (and inline `--glow-rgb`) clear. **Not automatable in this repo
  (no committed harness) and still unverified by eye** — the visual pass is the user's
  localhost check, now valid under both modes (slice 5).
- **Manual**: localhost visual pass for colour/legibility against the existing ability glow,
  plus a reduced-motion pass.

## Migration / rollout

UI-only and additive. No data migration, no flag.

Revert path, increasing blast radius:
1. Delete the `addGlow` calls in `hookActionAffordances` → glows disappear; buttons unaffected.
2. Revert the CSS rules → nothing to colour.
3. Revert the slice commit → `card-glow-model.mjs` / `card-glow-colors.mjs` removed;
   `enumerateOptions` and CSS untouched.

`computeCardGlows` is a new module with no other consumer, so a half-landed state (model landed,
wiring not) is inert. Reverting the `BANNER` extraction alone restores the inspector banner
without touching the glow.

## Work plan — slices ≤1 session, each leaving the repo green

| Slice | Delivers | Green when |
|---|---|---|
| 1 | `card-glow-colors.mjs` (+ export `energyTypeKeyFor` from `energy-token-assets.mjs`, re-point `card-inspector.mjs`'s `BANNER`) + tests | unit suite green; inspector banner unchanged |
| 2 | `card-glow-model.mjs` + tests (legality map + per-glow colour); parity invariant; `stadiumPlayed` turn flag wired through `enumerateOptions` (edge row 10); no DOM | full unit suite green; no product behavior changed except the bot's now-correct second-Stadium gate |
| 3 | CSS: `.has-glow` + `card-glow` keyframes + reduced-motion in both container sheets and `index.css`; static CSS tests | CSS suite green; app visually unchanged (`.has-usable-ability` still styled, fallback cyan identical) |
| 4 | `hookActionAffordances` wiring (hand / attack / stadium, `--glow-rgb`, `#stadium` override), `GLOW_CLASSES` clear; local-player hand gate; manual pass | unit + CSS suite green; legacy-mode glow checks pass |
| 5 | authoritative-aware zones (`liveZoneArray`) + node lookup (`cardRegistry` via `live-card-sources.mjs`), server flag-name mapping; tests | suite green; visual pass under `SERVER_AUTHORITATIVE=1` |

Slices 1–3 change no user-visible behavior; only slice 4 turns glows on. Slice 1 is independent
of 2–4 (colour over banner extraction), so it can land or be reverted alone. Slice 5 was
re-gated after the review and built (see Deviations).

## Deviations (Builder appends here during build)

### Slice 1
- `TYPE_GLOW` is keyed by the canonical keys `energyTypeKeyFor` produces (`darkness`, not the
  draft's `dark`), so the table shares `ENERGY_TOKEN_FRONT`'s vocabulary and `glowColorFor`
  needs no second mapping.
- Added `glowHexForType(type)` (via `normalizeEnergyType`) and exported `normalizeEnergyType`
  from `energy-token-assets.mjs`; the inspector banner needs name→hex, which `glowColorFor(card)`
  (card→rgb) cannot express. The banner's shipped hexes are pinned by a parity test.
- `energyTypeKeyFor(card)` replaces the draft's direct `normalizeEnergyType(card.types?.[0] ?? name)`
  call, which could not parse a name-spelled symbol like `Basic {F} Energy`.

### Slice 2
- **Edge row 10 needed a source fix.** `enumerateOptions` forwarded `stadiumName` but never
  `stadiumPlayedThisTurn`, so a second Stadium in hand would have glowed although the server
  rejects it (`reduce.mjs:2264`) — a C2 violation. Added a per-turn `stadiumPlayed` flag to
  `rulesState` (set in `markStadiumPlayed`, reset in `resetTurnFlags`) and forwarded it from
  `enumerateOptions`'s `trainerPlayBlockReason` call. The client only learns of its *own* plays
  this way, which is all the glow needs (C4); under authoritative netcode it can only
  under-glow, never over-glow.
- `computeCardGlows` returns `stadiumReason` and, with no Stadium, `'No Stadium in play.'` —
  the draft left that string only in the inline snippet.

### Slice 3
- The container sheets keep `.has-usable-ability` in the `.has-glow` selector list. The glue
  (slice 4) is what starts adding `.has-glow`; until then the legacy class must still glow for
  slice 3 to stay behavior-neutral. `--glow-rgb`'s fallback (`120, 200, 255`) makes the legacy
  glow pixel-identical to the old fixed cyan.
- `@keyframes ability-glow` was removed from the two container sheets (dead once the rule moved
  to `card-glow`). index.css's preview `ability-glow`/`attack-glow` (a different feature) are
  untouched.

### Slice 4
- The glue now passes the player's own 60 as `deckList` (deck + discard + lost + prizes + hand),
  not `[]`: the client does expose those zone arrays, so the Rare Candy over-glow is removed in
  the normal case.
- `computeActionAffordances` is no longer imported by `rules-bridge.js`; `computeCardGlows`
  calls it. The scored loop keeps the resolved `activeCard`/`stadiumCard` per box so the apply
  loop can target the attack/Stadium nodes without re-resolving them.
- **E2E/manual still owed.** This repo has no committed Playwright config or spec (only ad-hoc
  scripts), so the "SERVER_AUTHORITATIVE=1 glow checks" bullet is not automatable here; the
  visual pass is the user's localhost check (see STATE watch-outs).

### Review fixes (S238, fresh-eyes pass)
- **[blocker, fixed] Solo opponent-hand leak.** `isTurn` is whose turn it is, not who is looking;
  in solo the `opp` box became the turn player and scanned/glowed the AI's face-down hand (C4).
  The glue now scans `handCards` only when the box's `user` is the local player
  (`systemState.isTwoPlayer ? systemState.initiator : 'self'`). Row 22's premise was wrong and is corrected.
- **[should, fixed] Reduced-motion glow was invisible.** `animation: none` let `#hand img`'s
  ID-specific default shadow win. The block now pauses the animation with `animation-delay: -1s`,
  so the animated shadow still applies (and `.highlight` still resets it to running).
- **[should, fixed] Dead reason classes** (`has-playable-card`, `has-usable-attack`,
  `has-usable-stadium`) had no CSS/test consumer; dropped, `clearGlow` clears `has-glow`.
- **[nit, fixed]** `HAND_GLOW_KINDS` exported and used by the parity test, which now includes an
  evolution fixture; the non-turn test asserts attack/ability are empty too (the model gates them).
- **[nit, fixed]** STATE/doc status drift.
- **[should, FIXED in slice 5] Authoritative 2P renders none of this.** Under authoritative dispatch
  legacy `getZone` arrays are never populated (`apply-view.js:37-43`) and the visible nodes are
  `cardRegistry` entries, so hand/ability/attack glows class detached legacy nodes. Only the
  Stadium works. The pre-existing ability glow shares the gap; this feature's stated E2E mode
  does not work. Also the server merges flags as `stadiumPlayedThisTurn`/`stadiumUsedThisTurn`
  (`apply-view.js:1796-1804`), which the model does not read, so a fixed renderer would over-glow
  a second/used Stadium — the slice-2 note's "under-glow only" is wrong.
- **[nit, retained]** Inspector's fixed Stadium banner green `#2e8b57` vs the glow's `#43a047`:
  C7 covers the energy palette, and the banner's green is a deliberate separate surface; left as is.

### Slice 5 — authoritative-aware resolution
New `client/src/setup/rules/live-card-sources.mjs` (node-tested) is the one place that answers
"which card and which node" for a glow under both render paths:
- `liveCardFor(card)` — the registry's own card object (which carries the stamped
  `attachedCards`/`abilityUsed`) under authoritative rendering; the card itself in legacy.
- `liveActiveCard(zoneCards)` — the top of the `attachedTo` stack via `topPokemonCard`, through
  the registry; legacy keeps `getActivePokemonCard`'s `image.relative` read.
- `glowNodeFor(card)` — registry `holoCard.wrapper || element`, else legacy `wrapper || image`.
The glue now reads every zone through `liveZoneArray`, maps the bench through `liveCardFor`,
resolves the active through `liveActiveCard`, and keeps `attachedEnergiesFor` (which reads the
registry copy's `attachedCards`). `deckList` falls back to `systemState.ownDeckCards` when the
server redacts the deck to a count.
- **Deviation:** the authoritative active is the *top* card, not `evolvedView` — `evolvedView`
  copies the root's `instanceId`, which would glow the hidden card behind the stack and miss the
  server's `abilitiesUsed` key (keyed by the card that acted). Non-BREAK parity with legacy is
  exact; a BREAK's inherited attacks can under-glow, the same pre-existing gap the sidebox has.
- Server flag aliases: `e2e-options.mjs` reads `stadiumPlayed || stadiumPlayedThisTurn`;
  `card-glow-model.mjs` reads `stadiumUsed || stadiumUsedThisTurn`. Covered by a case in each
  existing test.
- Still open by design: the server carries no `lastSupporterName`, so a Stadium whose once-per-turn
  condition names a Supporter can under-glow under authoritative (safe direction, C2).
- E2E remains the user's manual pass; no committed Playwright harness in this repo.

---
Self-approval checklist (only when the user is unreachable):
- [ ] Every constraint traceable into the Design section
- [x] Every edge-case row has an expected behavior (or a written strike reason)
- [x] Interfaces fully named and typed — no hand-waving
- [x] Slices each ≤1 session and independently green
- [x] No section reads "TBD"
