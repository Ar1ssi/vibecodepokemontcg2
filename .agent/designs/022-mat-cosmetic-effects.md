# 022: Mat cosmetic effects — glows & animations to TCG-Live parity
Status: approved (user, S236) — building
Date: 2026-09-21 · Session: S236

## Problem
Our mat renders correct game state but lacks the transient juice TCG Live has: no
damage popups, attack impact, KO burst, status idle motion, evolution/energy/retreat
flourishes, active-Pokémon glow, hover lift, mat holo tilt, turn banner, ability banner,
or win celebration. Feature request: implement all 16 missing effects. Target implementer:
Sonnet 5, working one increment per session on a single branch.

## Constraints
- **Rules/authoritative mode only.** Every server-driven effect rides the advisory-event
  stream, which only flows under `SERVER_AUTHORITATIVE=1` (rules engine). Legacy 2p netcode
  is untested — do NOT gate delivery on `test:2p`; verify under authoritative only.
- **No engine behavior change.** Effects are presentation. Engine edits are limited to
  *adding fields* to already-emitted advisory events (never new mutations, never new events
  unless a row below says so). Any engine field add ships with a `reduce`/executor unit test.
- **Reduced motion.** Every transient effect honors `prefers-reduced-motion: reduce` — the
  motion is skipped or reduced to a static state; the game stays fully playable.
- **Pointer-events integrity.** Decorative overlays never intercept clicks/drags. Follow the
  `.mat-holo` passthrough rule ([holo/base.css:340](client/src/css/holo/base.css)): the real
  card `<img>` stays the sole hit target.
- **CSS-verification is the user's.** Do not drive the Browser pane to judge visuals; the user
  checks localhost. Ship each slice, report, let the user eyeball.
- Perf: overlays are detached DOM removed on animation end (no leak); no per-frame layout
  thrash beyond the existing flight pattern.

## Current state (read this session, not memory)
- **Dispatch pipeline.** Engine reduce/executor push advisory events into an `events[]` array.
  `applyView` fans every event to `onAdvisoryEvent` ([apply-view.js:2161](client/src/setup/netcode/apply-view.js))
  → `handleAdvisoryEvent` ([advisory-animations.js:70](client/src/setup/netcode/advisory-animations.js))
  → pure `advisoryAnimationPlan(event, selfPlayerId)`
  ([advisory-animations.mjs:7](client/src/setup/netcode/advisory-animations.mjs)). Plan returns
  `null` for unknown `event.type` → no-op. `onBeforeApply`
  ([apply-view.js:2033](client/src/setup/netcode/apply-view.js)) fires BEFORE the DOM diff — the
  only place to snapshot an element that the diff is about to remove (KO ghost uses it).
- **Element lookup.** `getCardRegistry()` (apply-view.js) → `record.element` per `instanceId`.
  `visualRectOf(el)` ([iframe-rect.mjs](client/src/setup/image-logic/iframe-rect.mjs)) → on-page
  rect across the self/opp iframes. This is the positioning primitive for popups/shake.
- **Overlay pattern (reuse this).** `playKnockoutGhost`
  ([knockout-flight.js:42](client/src/setup/image-logic/knockout-flight.js)): create a
  `document.body` host div, append `<img>`, `requestAnimationFrame` tick applying a pose fn from a
  paired `*-pose.mjs`, `host.remove()` at t=1. `draw-flight.js`, `shuffle-flight.js`,
  `prize-take-prompt.js` (`flyUp`/`flyBack`) all follow it. Pure pose math lives in `*.mjs`,
  DOM in `*.js` — keeps the pose unit-testable.
- **Already emitted advisory events** (payloads verified in shared/engine):
  - `damageUpdated` `{instanceId, damage /*cumulative*/, healed?}` — executor.mjs:984,1488,
    special-energy.mjs:77,161, trainer-steps.mjs:835. **Carries total damage, not the hit delta.**
  - `pokemonKnockedOut` `{instanceId, playerId, attackerPlayerId, prizeCount}` — reduce.mjs:714.
  - `statusApplied` `{playerId, instanceId, condition}` — executor.mjs:873,1402. Also
    `addSpecialCondition`, `specialConditionUpdated`, `statusCleared`.
  - `pokemonEvolved` `{playerId, instanceId, targetInstanceId}` — trainer-steps.mjs:505,1209.
    Also `pokemonDevolved`.
  - `cardAttached` `{instanceId, targetInstanceId, playerId}` — executor.mjs:107,
    trainer-steps.mjs:151. Covers energy AND tools; filter by attached card type client-side.
  - `abilityUsed` `{instanceId, name, playerId}` — ability.mjs:74.
  - `cardRetreated`, `pokemonSwapped`, `cardSwitched`, `retreat` — switch/retreat family.
  - `trainerPlayed` / `playTrainer`, `stadiumEffectUsed` / `stadiumTriggered`.
  - `turnStarted`, `gameEnded`. (Confirm exact payload fields when you build that slice.)
- **Existing mat FX to keep / build on.** Holo shine/glitter/glare (pointer-driven,
  [holo/base.css](client/src/css/holo/base.css); `.mat-holo .card__rotator { transform: none }`
  disables 3D tilt on board — line 332). `ability-glow`/`attack-glow`/`highlight-pulse` keyframes
  in self-/opp-containers.css + index.css. Flights: draw/shuffle/knockout/prize. Coin
  `coin-toss-arc`. Status tokens are **static** ([status-marker.css](client/src/css/status-marker.css)).
  Table tilt ([apply-table-tilt.js](client/src/setup/sizing/apply-table-tilt.js)).

## Options
- **A. One `fx` plan-kind + a client effect registry** (pick). Extend `advisoryAnimationPlan`
  to map the new event types to `{ kind: 'fx', effect: '<name>', user, ...payload }`. A single
  new `handleAdvisoryEvent` branch dispatches on `plan.effect` to a registry of effect fns in a
  new `mat-fx/` dir. One choke point, one test file, uniform reduced-motion guard.
  vs **B. A bespoke `kind` per effect** (like shuffle/draw/knockout today) — more switch arms in
  both files, duplicated guards. Rejected: 12 server-driven effects would bloat the dispatcher.
- **Damage delta**: engine `damageUpdated` carries cumulative `damage`. For a "−30" popup and
  shake magnitude we need the hit amount. **Pick:** add an optional `delta` field where the
  engine *increases* damage from an attack/effect (positive = damage dealt). Client falls back to
  diffing against last-seen damage per instanceId if `delta` absent (defensive). Add `weakness:true`
  where the damage step applied Weakness, for the ×2 flash. vs computing delta purely client-side
  from state diffs — fragile across catch-up replay. Engine field is the honest source.
- **Pure-client effects** (holo mat tilt, hover lift, active breathing glow, status idle motion,
  turn banner): no event needed — driven by CSS on existing state classes or client turn state.
  Keep them out of the advisory registry.

## Design

### Contract (pin FIRST, before any effect — stable surface every later slice reuses)
1. **Shared overlay util** `client/src/setup/image-logic/mat-fx.mjs` (+ `.js` if DOM needed):
   - `spawnOverlay({ rect, className }) -> host` — creates the `document.body` host div at a
     `visualRectOf` rect, returns it; caller appends content + drives rAF; caller removes.
   - `runPose(host, durationMs, poseFn, onDone?)` — the rAF tick loop extracted from
     knockout-flight, so effects share one timer path.
   - `motionReduced() -> boolean` — reads `matchMedia('(prefers-reduced-motion: reduce)')`.
   - `rectForInstance(instanceId) -> rect|null` — registry + `visualRectOf`, null-safe.
   - These generalize the knockout/draw pattern; **refactor knockout-flight & draw-flight to use
     them in slice 0** (behavior-preserving) so the pattern has one owner.
2. **Dispatch extension** in `advisory-animations.mjs`: add a `EVENT_FX` map
   `{ damageUpdated: 'damage', statusApplied: 'status', pokemonEvolved: 'evolve',
   cardAttached: 'attach', abilityUsed: 'ability-banner', cardRetreated: 'retreat',
   pokemonSwapped: 'retreat', trainerPlayed: 'trainer-play', stadiumEffectUsed: 'stadium-play',
   turnStarted: 'turn-banner', gameEnded: 'game-over' }`. For a mapped type return
   `{ kind: 'fx', effect, user, instanceId, ...fields }`. Unmapped → existing behavior / null.
   `pokemonKnockedOut` stays its own `kind: 'knockout'` (needs the pre-diff ghost).
3. **Client registry** `client/src/setup/netcode/mat-fx/index.js`:
   `const EFFECTS = { damage, status, evolve, attach, ability-banner, retreat, trainer-play,
   stadium-play, turn-banner, game-over }` — each `(plan) => void`. `handleAdvisoryEvent`'s new
   `plan.kind === 'fx'` branch: `if (motionReduced()) return applyStaticFallback(plan);`
   else `EFFECTS[plan.effect]?.(plan)`.
4. **CSS**: one new file `client/src/css/mat-fx.css`, all classes prefixed `fx-`
   (`fx-damage-pop`, `fx-shake`, `fx-flash`, `fx-evolve-burst`, …). Keyframes namespaced `fx-*`.
   Status idle keyframes go in status-marker.css (co-located with the tokens they animate).
5. **Reduced-motion**: transient effects early-return; state-reflecting effects (glow ring,
   status idle) drop to a static style under the media query.

### Server-driven effects (registry entries)
- **damage** (`damageUpdated`, delta>0): float `fx-damage-pop` "−<delta>" red, rising+fading over
  the target's rect top; if `weakness`, add `fx-weakness-flash` (×2 white pop). delta<0 (heal):
  green "+<n>" using `healed`. Also triggers **defender shake** (`fx-shake` on a positioned
  overlay, not the real card — avoids layout) + **screen shake** scaled by delta (small
  `translate` on the mat root, capped) for delta ≥ threshold.
- **attack impact**: `attackExecuted` event → attacker lunge toward defender + on-hit flash on
  defender. (Confirm `attackExecuted` payload has attacker + defender instanceIds; if only
  attacker, pair with the following `damageUpdated` target.)
- **knockout burst** (upgrade, not new): before the existing ghost-slide-to-discard, play an
  `fx-ko-burst` (flash + dissolve/scale) on the captured ghost rect. Extend `knockout-pose.mjs`
  or add a pre-phase; reuse the captured ghost from `onBeforeApply`.
- **status** (`statusApplied`): brief `fx-status-apply` pop on the token as it appears (the idle
  loop is CSS, below).
- **evolve** (`pokemonEvolved`): `fx-evolve-burst` flash + scale-pop on the evolved card's rect.
- **attach** (`cardAttached`, filtered to `registry.get(instanceId).type === 'Energy'`):
  `fx-energy-snap` — energy icon/card scales in and snaps onto the target rect. Tools → no FX
  (or a subtler `fx-tool-attach`); decide when building, default energy-only.
- **retreat** (`cardRetreated`/`pokemonSwapped`): slide the promoted card from bench slot to
  active slot (both rects from registry) — reuse `runPose` translate.
- **trainer-play / stadium-play**: `fx-card-present` — card zooms to center, holds, fades.
- **ability-banner** (`abilityUsed`): center name banner sweep using `event.name`.
- **turn-banner** (`turnStarted`): "Your Turn / Opponent's Turn" sweep + brief turn-timer glow.
- **game-over** (`gameEnded`): win → `fx-celebrate` (confetti/sunburst); lose → subdued dim.

### Pure-client effects (no advisory event)
- **status idle** (status-marker.css): keyframes per condition on existing classes —
  `.status-asleep` slow Zzz pulse, `.status-burn` flame flicker, `.status-poison` bubble,
  `.status-paralyzed` spark jitter, `.status-confused` wobble/swirl. All `prefers-reduced-motion`
  → static.
- **active breathing glow**: pulsing ring on the active slot element (self/opp). Toggle via the
  existing active-slot class; CSS keyframe `fx-active-breathe`.
- **board card hover lift**: `:hover` transform/scale + shadow on board card wrappers. Must not
  break drag; scope to non-dragging state.
- **holo mat tilt**: re-enable a *subtle* pointer-driven rotator tilt on `.mat-holo` (currently
  `transform: none`, line 332). Small max angle; keep pointer-events passthrough intact. Behind
  a guard so it can be disabled if it interferes with drag hit-testing.

## Edge cases & failure modes — Builder ticks every row per slice
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | instanceId not in registry / element gone | effect no-ops, no throw | [ ] |
| 2 | delta absent on damageUpdated | fall back to last-seen diff; if unknown, skip popup (no "−undefined") | [ ] |
| 3 | delta = 0 (damage step, net zero) | no popup, no shake | [ ] |
| 4 | rapid repeated events (multi-hit, chained damage) | overlays stack independently, each self-removes | [ ] |
| 5 | catch-up replay / hidden tab | suppressed via existing `shouldAnimateMirror` guard | [ ] |
| 6 | `prefers-reduced-motion: reduce` | transient FX skipped; state FX static; game playable | [ ] |
| 7 | self vs opp side / flipped board | rects resolve per iframe via visualRectOf; correct side | [ ] |
| 8 | overlay outlives its card (KO mid-animation) | detached ghost/overlay, real-card removal irrelevant | [ ] |
| 9 | cardAttached of a Tool (not Energy) | energy FX does not fire | [ ] |
| 10 | legacy (non-authoritative) mode | events don't flow; no FX, no error (acceptable) | [ ] |

## Test plan
- **Unit (node --test, DOM-free):** extend `advisory-animations.test.mjs` — new event types map
  to the right `{kind:'fx', effect}`; unmapped → null; delta/weakness fields pass through. New
  `mat-fx-pose` tests for any `*-pose.mjs` math (damage-pop trajectory, retreat slide, ko-burst).
- **Unit (engine):** the `delta`/`weakness` field additions get a `reduce`/executor test proving
  the field appears on the right push and nowhere else.
- **Manual (user, localhost, authoritative mode):** per slice, user eyeballs the effect + a
  reduced-motion pass (OS setting). No Browser-pane self-verification.
- Full `pnpm test` green after every slice; `pnpm lint` clean on touched files.

## Migration / rollout
n/a data. Rollout: single branch `feature/mat-cosmetic-fx`, one slice per commit, `/clear`
between slices, ledger in `NEXTSTEPS.md`. Revert path: effects are additive (new modules + a
new CSS file + mapped switch arms + optional engine fields) — revert a slice's commit to remove
its effect with zero state impact. Consider a master `body.fx-off` class / localStorage toggle in
slice 0 so the whole layer can be disabled without a revert.

## Work plan — slices ≤1 session, each leaving the repo green
| Slice | Delivers | Green when |
|---|---|---|
| 0 | Contract: `mat-fx.mjs` overlay/pose/reduced-motion utils; refactor knockout- & draw-flight onto them; `fx` plan-kind + `EVENT_FX` map + client registry skeleton (no effects yet); `mat-fx.css` stub + `body.fx-off` toggle. | existing flight tests still pass; new dispatch unit tests pass; visuals unchanged |
| 1 | Combat: engine `delta`+`weakness` on attack damage push (+ test); damage/heal popup, weakness flash, defender shake, screen shake, attack lunge/impact. | engine + plan unit tests; user confirms hit popups + shake |
| 2 | KO burst upgrade on existing ghost. | ko-pose test; user confirms burst-then-slide |
| 3 | Status idle animations (5 conditions) + status-apply pop; reduced-motion static. | user confirms each condition + reduced-motion |
| 4 | Lifecycle: evolve burst, energy attach snap, retreat/switch slide, trainer/stadium play present. | plan/pose tests; user confirms each |
| 5 | Board ambience (pure client): active breathing glow, hover lift, holo mat tilt. | user confirms; drag/click still work |
| 6 | Flow: turn banner + timer glow, ability-use banner, win/lose celebration. | payload-confirm; user confirms |

## Deviations (Builder appends here during build)
- Slice 0 ✅ (S236): `mat-fx.mjs` holds DOM utils (call-time DOM only, so node-testable) instead of a `.js` split;
  `rectForInstance(instanceId, registry)` takes the registry as an argument (no `state.js` import).
  `draw-flight.js` NOT refactored: it is spring-driven (`playDrawFlight` in card-pop.mjs), not a rAF pose loop, so
  `runPose` does not apply; knockout-flight was moved onto `spawnOverlay`+`runPose`. Dispatcher split into
  `netcode/mat-fx/dispatcher.mjs` (DI, tested) + `index.js` (real deps). Kill switch: `body.fx-off` or
  `localStorage['ptcg-fx-off']==='1'`. fx plans do not require `playerId` (damageUpdated has none) -> `user: null`.

---
Self-approval checklist (only when the user is unreachable):
- [x] Every constraint traceable into the Design section
- [x] Every edge-case row has an expected behavior
- [x] Interfaces fully named — util signatures, event map, registry shape pinned
- [x] Slices each ≤1 session and independently green
- [x] No section reads "TBD" (two payloads flagged "confirm when building" with a fallback)
