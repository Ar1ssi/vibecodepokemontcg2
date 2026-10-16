# 074: TCG Live attack UI, ported 1:1 (overlay everywhere, stack view, status popup)
Status: approved (self — one-shot)
Date: 2026-10-16 · Session: S—

## Problem
User, verbatim: "Since the old holofoil system has been removed (except for older cards) port the tcg live
attack ui 1:1, decompiling whatever you need to do so."
Scope answer (AskUserQuestion, 2026-10-16): **"Everywhere + gaps (Recommended)"** — retire the 013 print-band
overlay: Bench, opponent Active and sidebox open the TCG Live overlay too; also build the unported pieces
(damage-mod arrows/tint, buff/debuff HUD, traced VSTAR layout, TMP fonts/colours; action-list drawer).

Today only your own Active opens the TCG Live AttackOverlay (design 067). Bench double-click and the sidebox
Attack button open the 013 carousel with panels laid over the printed bands; opponent Pokémon open a plain
scan. Damage shows the pre-Weakness total with no tint or arrow, cost icons are energy coins (no
fulfilment state), and the HUD has no buff/debuff buttons (I242, I243).

## Acceptance
| # | Criterion (the brief's words) | Evidence |
|---|---|---|
| A1 | Tap routing is TCG Live's: own Active → AttackOverlay; own Bench → AttackOverlay when it has a usable action, else the stack view; opponent Active/Bench → the stack view | |
| A2 | Benched overlay hides attacks (AttackOverlay.HideAttacksForBenchedPokemon) and Retreat does nothing | |
| A3 | Sidebox Attack button opens the AttackOverlay, not the 013 carousel | |
| A4 | HUD: Buff/Debuff buttons (lit when the card has positive/negative effects) open the status popup; Stack opens the stack view; Close | |
| A5 | Cost icons are TCG Live's type icons, filled per EnergyFulfillmentHelper.CalculateSatisfiedEnergy_Greedy, empty ones tinted the registry ink | |
| A6 | Damage readout ports AttackOption.SetAttackDamageValue: final damage after Weakness/Resistance, green for Weakness, red for Resistance, buff/debuff arrow | |
| A7 | VSTAR Power entries use titleBarHeight_V 1.25 and the VPowerBar rects (traced, not inferred) | |
| A8 | Overlay geometry, sprites, colours and font sizes come from the dumped prefabs (refs/074-tcgl-attack-ui) | |
| A9 | Status popup (MatchModalPopup + StatusEffectModalOption): positive / negative columns, one entry per effect with its source | |
| A10 | Stack view ports StackedCardOverlay_Landscape: card carousel left, info panel right (name/HP bar, energy, tools, buff/debuff, attack list, weakness/resistance/retreat) | |
| A11 | The 013 print-band chrome is gone for Pokémon (the Stadium panel stays) | |
| A12 | Backdrop is TableCoverPanel (its three panels), not a flat 42 % dim | |

## Assumptions
- (assumed) **Fonts.** The game's TMP assets are Akko Pro Bold Condensed (Display_Bd/BdOutline/Md) and Akko W1G
  (Text_Medium/Bold/BoldItalic); only SDF atlases ship, no font files, and Akko is a commercial typeface. The
  stacks name `'Akko Pro Condensed'`/`'Akko W1G'` first (used when installed) and fall back to the vendored
  Rodin Condensed and Barlow Semi Condensed. Sizes, tracking and colours are the prefab's.
- (assumed) **Landscape only.** The game ships `FocusedCardOverlay_Landscape` with `actionListButton: null`; the
  action-list drawer is a portrait/mobile surface. Not built; I242's drawer item closes as "not in landscape".
- (assumed) **Damage outcome source.** TCG Live reads server `actionOutcomes`. Here the client runs the shared
  pure `computeAttackDamage` against the opponent's Active (public data) once `parseAttackDamage` resolves;
  unresolved (coin, choice) → printed label, exactly the game's "not finished" path (`flag` true).
- (assumed) **Effects source.** posStatusEffects/negsStatusEffects come from the server in the game. Here: live
  `attackMarkers` (polarity by kind, table in the model), Special Conditions (negative), attached Tools
  (positive, their text). Entries name the source attack/card as EffectDescriptionGenerator does.
- (assumed) Titlebar sheen/trail (ModelUiRenderer meshes with stencil shaders) is drawn as a CSS sheen on the
  bar while the attack is usable, timed from the mesh animation is not recoverable without the shader; it
  is a taste-level approximation, flagged for the user's localhost pass.
- (assumed) Double-click routes like a single tap (idempotent), as 067 O5 did for the Active.

## Constraints
- 067 holds: flight/pose/timings, click guard, picker observer, hand lowering. D208–D210.
- Server authority: card reads via `resolvePreviewCard`; nothing hidden reaches the client (opponent hand,
  deck). Opponent stack view shows only in-play public cards.
- No new dependency (TypeTreeGeneratorAPI lives in the extract's tools venv, not the repo).
- No `prefers-reduced-motion` gating (memory). Visual checks are the user's, on localhost.
- Card foil: the stack view and overlay cards use `buildSlideContent` (TCG Live foil, D214) unchanged.

## Current state
- `click-events.js:284` `imageClick`: own Active → `openOwnActiveFocus` (067); everything else select-to-move.
  `:342` `doubleClick`: own active/bench → `openCardInspector` (013 print carousel); opponent → carousel/preview.
- `chat-buttons.js` (p1/p2): Attack button → `openCardInspector`.
- `card-inspector.mjs:302` `buildChrome(model, 'print'|'focus')`; `:402` `buildFocusChrome`; model in
  `card-inspector-model.mjs:387` (`damageLabel` = parsed pre-W/R total, `:492`).
- `card-focus.mjs` HUD: Stack + Close only, SVG icons; Stack opens the attached-cards carousel.
- `shared/engine/rules/attack-engine.mjs:55` `computeAttackDamage` returns `{total, base, attackerBonus,
  multiplier, flat, resistance, reduced, prevented, …}`. `attack-markers.mjs:38` `liveAttackMarkers`.
- TCG Live (decompile `E:/TCGLive_Extract/Code/TPCI.RainierClient`, prefab dumps in refs/074-tcgl-attack-ui,
  made with `scripts/attack-ui/dump-tree.py`): PlayerCardOwner.OnCardClicked, ActiveController,
  OpponentActiveController (no action selection → deep inspection = StackCardOverlay), BenchController
  (`CanShowActionSelection` = mine && (usable actions || bench-usable attack); else deep inspection),
  AttackOverlay, AttackOption, CardActionOption, AttackOverlayHUD (buff/debuff both call
  `ShowAllStatusesInPopup`), EnergyCostDisplay, EnergyFulfillmentHelper, StatusDisplayHelper,
  EffectDescriptionGenerator.

## Options
**O1 — opponent / non-actionable cards.** A: the stack view (game's deep inspection). B: the overlay read-only.
**Pick A**: it is what the game does; B would invent a surface.
**O2 — damage outcome.** A: shared `computeAttackDamage` client-side. B: a server-sent per-attack preview.
**Pick A**: pure, already the engine's own maths, no netcode change; B is a protocol change for a label.
**O3 — 013 print chrome.** A: delete the `print` layout for Pokémon. B: keep it behind a flag.
**Pick A**: nothing routes to it after this; the Stadium panel keeps its own branch.

## Design
### Modules
- `client/src/setup/rules/attack-ui-model.mjs` (pure, tested):
  ```js
  export function costFulfillment(cost: string[], attached: string[][]) -> { type, filled }[]   // greedy port
  export function damageReadout(printed: string|null, outcome: Outcome|null) -> { text, tone, mod }
    // tone: 'weakness'|'resistance'|'plain'; mod: 'buff'|'debuff'|null; printed null → { text: '', … }
  export function damageOutcome(breakdown, { printedBase }) -> Outcome   // from computeAttackDamage
  export function statusEffectsFor(card, { turnNumber, zoneCards, sourceZoneCards }) -> { positive: Entry[], negative: Entry[] }
  export function tapRoute({ zoneId, cardUser, card, hasUsableAction }) -> 'overlay'|'stack'|null
  export const WEAKNESS_INK = '#0e800e', RESISTANCE_INK = '#e61717'   // AttackOption weaknessColor/resistanceColor
  ```
  `Outcome = { finalMin, finalMax, unmodifiedBase, hitWeakness, weaknessAmount, hitResistance,
  resistanceAmount, reduced, reducedAmount, bonus, boostedAmount, blocked, flipUntil }`.
- `card-inspector.mjs`: focus chrome rebuilt to the prefab (cost icons, damage, VSTAR, retreat cost, scroll
  arrows); `print` layout removed for Pokémon. Model gains `costIcons`, `damage` readout, `bench` flag.
- `card-focus.mjs`: TableCover backdrop, sprite HUD (Buff, Debuff, Stack, Close), bench mode.
- `client/src/setup/rules/status-popup.mjs` + `css/status-popup.css`: MatchModalPopup + StatusEffectModalOption.
- `client/src/setup/rules/stack-view.mjs` + `css/stack-view.css`: StackedCardOverlay_Landscape.
- `click-events.js`, `chat-buttons.js` (p1/p2): routing through `tapRoute`.
- `scripts/attack-ui/import-attack-ui.mjs`: new sprite rows; `dump-tree.py`, `tree-outline.py`, `tree-detail.py`.

### Flow
Tap on an in-play Pokémon → `tapRoute` → overlay (`openCardFocus`, zone active|bench) or `openStackView`.
Overlay HUD Stack → close overlay immediately → `openStackView(card)`. Buff/Debuff → `openStatusPopup(card)`
(overlay stays; its close hitbox is off while the popup is up, as the game toggles `closeHitbox`).

## Edge cases & failure modes
| # | Case | Expected | Covered by |
|---|---|---|---|
| 1 | Cost `[]` | one `Empty` icon, filled (EnergyCostDisplay) | |
| 2 | Cost with Colorless and surplus typed energy | typed fill first, surplus pays Colorless | |
| 3 | Multi-type attached (Blend/Rainbow) | fills one unmet typed slot each, rest go to Colorless | |
| 4 | Attack with no printed damage | empty damage text, damage tab hidden (alpha 0) | |
| 5 | `30+`/`20×`/`50-` with a coin step | printed label (not finished) | |
| 6 | Defender Weakness | final number, green ink | |
| 7 | Defender Resistance | final number, red ink | |
| 8 | Damage reduced by a defender marker/Tool | debuff arrow | |
| 9 | Bonus from Tool/marker | buff arrow | |
| 10 | No opponent Active (setup) | printed label, no tint | |
| 11 | Bench card, ability usable | overlay, attacks hidden, Retreat inert | |
| 12 | Bench card, no usable ability | stack view | |
| 13 | Opponent card face-down / unresolved | no route (unchanged) | |
| 14 | Status popup with no effects | buttons disabled, never opens | |
| 15 | Stack view on a Basic with no attachments | carousel of one card, no arrows | |
| 16 | Turn change / session reset with stack view or popup open | both close | |
| 17 | Reconnect mid-open | view closes on `rules-session-reset` | |
| 18 | VSTAR Power attack/ability | 1.25 bar, VPowerBar strip, outlined name | |
| 19 | Opponent's hidden info | stack view shows only the in-play stack and its attachments | |

## Test plan
Unit: `attack-ui-model.test.mjs` (every function, rows 1–12, 14). Contract: CSS/asset pins
(`attack-ui-assets.test.mjs`, `card-focus-css.test.mjs`, new `stack-view-css.test.mjs`). Routing: `tapRoute`
table. Manual (user, localhost): overlay look, stack view, popup, bench overlay, fonts fallback.

## Migration / rollout
No data. Revert = revert the branch. Supersedes D50/D53 for Bench and opponent Pokémon taps.

## Work plan
| Slice | Files | Contract | Tests | Green when |
|---|---|---|---|---|
| 1 | scripts/attack-ui/{dump-tree,tree-outline,tree-detail}.py, import-attack-ui.mjs, assets, attack-ui-assets.test | new rows: dmg-mod bg, arrows up/down, hud circle/stroke/shadow, icn status/stack/close(+shadow), backing shadow_60, gradient, dropdown, brdr-b1, retreat shadow, type icons full/empty ×13 | `--check` drift test; asset pins | test green |
| 2 | attack-ui-model.mjs + test | signatures above | rows 1–12, 14; tapRoute table | `node --test` green |
| 3 | card-inspector(-model).mjs, card-focus.mjs, card-focus.css | overlay to prefab; HUD sprite buttons; TableCover; bench mode | CSS pins, model tests | test:changed + lint |
| 4 | status-popup.mjs/.css + test | `openStatusPopup(card)`, `closeStatusPopup()` | entries from statusEffectsFor; empty → no open | green |
| 5 | stack-view.mjs/.css + test | `openStackView({card, zone, user})`, `closeStackView()` | ordered stack, info panel model | green |
| 6 | click-events.js, chat-buttons p1/p2, card-focus-routing.mjs | `tapRoute` wired; dblclick same; print layout removed | routing tests | test:changed + lint |
| 7 | harness: MAP, DECISIONS, ISSUES (I242/I243), design Status | | | full `pnpm test` |

## Deviations
