# 024: FX sequencing, audio & TCG-Live parity round 2
Status: shipped S252 (slices 0-6 on branch claude/charming-ride-78yi9u) — awaiting user look/listen
Date: 2026-09-22 · Session: S252

## Problem
Design 022 shipped 16 mat effects, but the S252 gap analysis against Pokémon TCG Live found
nine remaining deficits. Ranked: (1) the client is **completely silent** — no audio anywhere;
(2) effects are **unsequenced** — a whole advisory batch fires in one frame, so an attack reads
as a flash instead of a sequence; (3) no **attack-name banner** although `attackExecuted` already
carries `attackName`; (4) **damage counters are static** (`damage-counter.css` has zero keyframes);
(5) several emitted events have **no FX at all** (`prizesTaken`, `pokemonPromoted`,
`pokemonDevolved`, `statusCleared`, `cardsDiscarded`, in-attack `coinFlipped`); (6) no **targeting
feedback** before an attack lands; (7) **Tool attach** is silent by design-022 choice; (8) the
`fx-off` kill switch **does not reach the iframes**, so "effects off" leaves idle motion running,
and there is no settings UI; (9) design 022 edge rows 7 & 9 were never verified.

## Constraints
Inherited from design 022 and still binding:
- **Rules/authoritative mode only.** Server-driven effects ride the advisory stream
  (`SERVER_AUTHORITATIVE=1`). Legacy 2p is not a delivery gate.
- **No engine behavior change.** Presentation only. `attackName`, `defenderId`, `weakness` etc.
  already exist — this design adds **no engine fields at all**.
- **Reduced motion.** Every transient effect honors `prefers-reduced-motion: reduce`.
- **Pointer-events integrity.** Overlays never intercept clicks/drags.
- **CSS/audio verification is the user's.** Do not drive a browser pane to judge look or sound.
- Perf: overlays detached and removed on end; no per-frame layout thrash.
New to this design:
- **Autoplay policy.** A browser blocks `AudioContext` until a user gesture. Audio must never
  throw, never log noise, and must start working after the first real gesture.
- **No binary assets.** The repo ships no audio files and none can be sourced/licensed here, so
  sound is synthesized (see Options).
- **Sequencing must never delay input.** Choreography is cosmetic; the board state is already
  applied when FX run. A queue must not gate clicks, and must drain (not stall) under a flood.

## Current state (read this session, not memory)
- `advisory-animations.mjs` — `EVENT_FX` maps 12 event types → effect names; `advisoryAnimationPlan`
  returns `{kind:'fx'|'shuffle'|'draw'|'knockout'}`.
- `advisory-animations.js:70` `handleAdvisoryEvent` — mirror guard (`shouldAnimateMirror`), then a
  4-arm branch; `fx` calls `playFx(plan)`. `handleBeforeApply` captures KO ghosts + `captureOrigins`.
- `mat-fx/dispatcher.mjs` — `createFxDispatcher({effects, staticFallbacks, isDisabled,
  isMotionReduced})`; runs the effect **synchronously**, try/caught. Returns nothing.
- `mat-fx/index.js` — `EFFECTS` registry, `STATIC_FALLBACKS` is `{}`.
- Effects: `combat.js` (damage/attack), `status.js`, `lifecycle.js` (evolve/attach/retreat/
  trainer-play/stadium-play), `flow.js` (turn-banner/ability-banner/game-over). Each is
  `(plan) => void`, fire-and-forget, driving `runPose` on a detached overlay.
- `image-logic/mat-fx.mjs` — `spawnOverlay`, `runPose(host, ms, poseFn, onDone) -> cancel`,
  `rectForInstance`, `motionReduced()`, `fxDisabled()` (`body.fx-off` or
  `localStorage['ptcg-fx-off']==='1'`).
- `css/mat-fx.css` (parent overlays) · `css/mat-ambient.css` + `css/status-marker.css` idle
  keyframes (imported *inside* the iframes by self-/opp-containers.css — **cannot see
  `document.body.fx-off` of the parent**, the slice-3 deviation of design 022).
- `actions/counters/damage-counter.js` — `applyDamageCounterStyle(el, amount)` is called on every
  create and every update, in both `addDamageCounter` and `updateDamageCounter`. Counters are
  elements **inside** the iframes. `css/damage-counter.css` has no animation of any kind.
- `actions/zones/prize-take-prompt.js` — `flyUp`/`flyBack` prize fan; no claim flourish.
- Payloads verified this session: `attackExecuted {attackerId, defenderId, attackName, damage,
  benchDealt, playerId}` · `prizesTaken {playerId, count, cards[]}` · `prizeTaken {playerId,count}` ·
  `pokemonPromoted {instanceId, playerId}` · `pokemonDevolved {playerId, instanceId,
  targetInstanceId}` · `statusCleared {condition, instanceId, playerId}` ·
  `cardsDiscarded` (executor) · `coinFlipped {playerId, face}`.

## Options

**O1 — Audio source. Pick: procedural Web Audio synthesis** (`OscillatorNode` + noise buffer +
gain/filter envelopes, one small voice-spec table).
 - *Procedural*: zero bytes added, no licensing question, every sound tunable as data, testable as
   pure param math. Costs: no realistic foley — it is an arcade/UI palette, not sampled thuds.
 - *Sampled files*: richer, but the repo has no audio assets, none can be licensed from here, and
   it would add a binary-asset pipeline plus page weight. Rejected: undeliverable in this session
   and a dependency-shaped decision the user did not ask for.
 - *No audio*: rejected — it is the #1 gap.

**O2 — Sequencing model. Pick: a cosmetic FX queue with declared durations.** Each effect returns
a number of ms (its "hold"), `undefined` meaning 0. A queue module drains plans in arrival order,
waiting the previous hold before starting the next, with a **total-budget cap** (`MAX_QUEUE_MS`)
past which holds collapse to 0 so a flood drains immediately.
 - *Queue with declared holds*: sequencing is pure data (a number per effect), unit-testable
   without a DOM or timers; effects stay synchronous and unchanged in shape.
 - *Promise-returning effects*: more expressive (an effect could await its own rAF), but makes
   every effect async, makes failure handling and cancellation harder, and cannot be tested
   without fake timers. Rejected for a cosmetic layer.
 - *No queue, add `setTimeout` inside each effect*: rejected — sequencing logic would be smeared
   across six modules with no single place to cap or flush it.
 - **Gating:** the queue is *cosmetic only*. It never blocks `applyView`, never blocks input, and
   is flushed (holds → 0, pending drained immediately) on catch-up/hidden-tab/`fx-off`.

**O3 — Counter motion location. Pick: CSS keyframes in `damage-counter.css`, triggered by a class
toggled in `applyDamageCounterStyle`.** The counters live inside the iframes where parent-page
overlays cannot reach; `applyDamageCounterStyle` is already the one funnel for create+update.
 - vs. a parent-page overlay tracking each counter's rect: rejected — duplicates position logic
   that the iframe already owns, and breaks on scroll/resize.
 - Retrigger uses the `void el.offsetWidth` reflow-restart idiom, the standard way to replay a
   keyframe on an element that already carries the class.

**O4 — Reaching the iframes with the kill switch. Pick: propagate `fx-off` / `reduced` as classes
onto each iframe's `<html>` element** from one `fx-settings.js` applier, called on boot and on
every settings change. The iframes' CSS then guards idle motion on `:root(.fx-off)`.
 - vs. `postMessage` to the iframes: rejected — same-origin iframes are already directly
   reachable (`selfContainerDocument` / `oppContainerDocument` are used throughout this codebase).
 - vs. leaving it broken: rejected — it is gap (8) and makes the toggle dishonest.

**O5 — HP display.** Out of scope, deliberately. TCG Live shows remaining HP, but adding an HP
readout is a new persistent UI element with its own layout/sizing/ownership questions, not an
*effect*. The counter's "count-up + danger pulse" (slice 3) covers the felt gap. Filed as an
ISSUES.md line rather than smuggled in here.

## Design

### Contract (pinned first — every later slice reuses this surface)

**1. Effect return value.** An effect is now `(plan) => number | void`, where the number is its
**hold in ms**: how long the queue should wait before starting the next plan. It is *not* the
effect's own duration (a 900 ms damage pop holds only ~180 ms — Live overlaps tails). `void`/
non-finite → `0`. Existing effects keep working unchanged (they return `undefined` → hold 0)
until each is given a hold in its slice.

**2. `mat-fx/fx-queue.mjs` (pure, DOM-free).**
```js
createFxQueue({ run, now, schedule, maxQueueMs = 2500 }) -> {
  push(plan),      // enqueue; starts draining if idle
  flush(),         // run everything pending immediately with zero holds
  clear(),         // drop everything pending (mirror guard / fx-off)
  pending(),       // number, for tests
}
```
- `run(plan) -> number` is the dispatcher. `now()` → ms. `schedule(fn, ms)` → a timer handle
  (injected so tests use a fake clock, never a real `setTimeout`).
- **Budget:** the queue tracks the sum of holds it has *committed*. Once that sum exceeds
  `maxQueueMs`, every subsequent hold is clamped to 0 until the queue goes idle and resets. This
  is the flood guard (edge 4/11).
- A `run` that throws is swallowed by the dispatcher already; the queue additionally treats a
  thrown/`NaN` hold as 0 so one bad effect cannot wedge the chain.

**3. `mat-fx/fx-holds.mjs` (pure).** One table `HOLD_MS` mapping effect name → hold, so
choreography is reviewable in one place, plus `holdFor(effect)`. Values (ms):
`attack-banner 620 · attack 240 · damage 180 · status 260 · knockout 520 · prize-claim 320 ·
evolve 240 · devolve 240 · attach 140 · tool-attach 120 · retreat 200 · promote 220 ·
trainer-play 520 · stadium-play 520 · ability-banner 480 · turn-banner 260 · discard 120 ·
coin-flip 420 · status-clear 160 · game-over 0`.

**4. `mat-fx/fx-audio.mjs` (pure) + `mat-fx/fx-audio.js` (Web Audio driver).**
- Pure side owns `VOICES`: effect name → array of *voice specs*
  `{ wave, freq, freqTo?, dur, gain, delay?, type:'tone'|'noise', filter? }`, plus
  `voicesFor(effect, plan)` which may vary a voice by plan (e.g. damage pitch drops with amount,
  `weakness` adds a bright overtone, `game-over` differs win/lose) and `clampGain`.
- Driver owns a lazily-created `AudioContext`, a master `GainNode` (volume from settings), a
  shared noise `AudioBuffer`, and `playVoices(specs)`. It is created on first use and
  `resume()`d on the first pointer/key gesture (autoplay policy). Every entry point is
  try/caught and no-ops when `AudioContext` is unavailable (Node tests, old browsers).
- Sound is dispatched from the **same choke point as visuals** (the dispatcher), so one guard
  order governs both and a muted-but-animated (or vice versa) state is impossible to drift into.

**5. `fx-settings.mjs` (pure) + `fx-settings.js` (DOM).** One owner of all three toggles,
replacing the ad-hoc `fxDisabled()` localStorage read:
- keys `ptcg-fx-off` (visuals+motion), `ptcg-sfx-off` (audio), `ptcg-fx-volume` (0–1, default 0.6).
- pure: `readSettings(storage)`, `writeSetting(storage, key, value)`, `normalizeVolume(v)`.
- DOM: `applyFxSettings()` writes `fx-off`/`fx-reduced` classes onto `document.body` **and onto
  `selfContainerDocument.documentElement` / `oppContainerDocument.documentElement`** (O4), and
  pushes volume into the audio driver. Called on boot and after any change.
- `mat-fx.mjs`'s `fxDisabled()` keeps its signature and delegates here, so no caller changes.

**6. Dispatcher extension.** `createFxDispatcher` gains injected `playSound` and `holdFor`, and
now **returns the hold**. Guard order is unchanged and still the single choke point:
`plan.kind==='fx'` → `isDisabled()` → reduced-motion table → effect missing → run.
Audio is gated by `isDisabled() || isSfxDisabled()` but **not** by reduced motion (a
reduced-motion user may still want sound; motion and audio are separate accessibility axes).

**7. New `EVENT_FX` entries** (no engine change; all payloads verified above):
`prizesTaken → 'prize-claim'` · `prizeTaken → 'prize-claim'` · `pokemonPromoted → 'promote'` ·
`pokemonDevolved → 'devolve'` · `statusCleared → 'status-clear'` · `cardsDiscarded → 'discard'` ·
`coinFlipped → 'coin-flip'`. `attackExecuted` now fans to **two** plans (banner then lunge) — see
slice 2.

### Slice detail

**Slice 2 — attack choreography.** `attackExecuted` is the one event that must produce a
*sequence*. `advisoryAnimationPlan` returns an **array** for it: `[{effect:'attack-banner'},
{effect:'attack'}]` (plan fields shared). `handleAdvisoryEvent` already handles one plan; it
gains an array branch that pushes each onto the queue in order. `attack-banner` reuses
`playBanner` from flow.js (extracted to a shared `banner.js`) with the attack name as title and
the attacker's name as sub. Targeting: `attack-banner` also spawns a `fx-target-ring` on the
defender's rect (pulsing ring, fades) so the player sees *who* is being hit before damage lands.

**Slice 3 — counters & prize.**
- `applyDamageCounterStyle` gains a third argument `motion` (`'land'|'bump'|null`) and toggles
  `fx-counter-land` / `fx-counter-bump` with the reflow-restart idiom. `addDamageCounter` passes
  `'land'` when it just created the element, `'bump'` otherwise; `updateDamageCounter` passes
  `'bump'` only when the text actually changed. A new `dmg-danger` class (pure fn
  `isDangerDamage(damage, hp)` in `damage-counter-style.mjs`) drives a slow red pulse when the
  Pokémon is within one tier of KO.
- `prize-claim` effect: the claimed prize count flashes as a `fx-prize-claim` burst at the
  prize-zone rect with a per-card sparkle, plus the audio chime.

**Slice 4 — remaining events.** `promote` (rise + glow on the new Active), `devolve` (inverse
evolve burst), `status-clear` (ring collapsing inward, no label), `discard` (small card-shaped
puff at the discard rect), `coin-flip` (a heads/tails chip pop at the acting side's active card,
reusing the coin art if resolvable, else a text chip), and **tool attach** — `attach()` stops
early-returning for non-Energy and instead plays a subtler `fx-tool-attach` (no scale-in, just a
soft ring) so gap (7) closes without making Tools as loud as Energy.

**Slice 5 — settings UI & parity.** A compact FX panel (three controls: Effects on/off, Sound
on/off, Volume) added to the existing settings surface, wired to `fx-settings.js`; iframe class
propagation (O4) with `:root(.fx-off)` guards added next to every idle keyframe in
`mat-ambient.css`, `status-marker.css`, `damage-counter.css`. Plus verification of design 022's
two `[~]` edge rows.

## Edge cases & failure modes — Builder ticks every row per slice
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | `AudioContext` unavailable (Node, old browser, blocked) | audio no-ops, no throw, visuals unaffected | [x] `ensureContext` returns null on a missing ctor or a throwing `new`; `playFxSound` bails. Every pose/voice test imports the palette under `node --test` with no AudioContext at all |
| 2 | Autoplay policy: no user gesture yet | context created suspended; resumed on first gesture; no console noise | [x] `bindGestureUnlock` on pointerdown/keydown (not `once`: a context can re-suspend); `resumeContext` try/caught and silent. Live: AudioContext present, no page errors |
| 3 | Sound muted (`ptcg-sfx-off`) but effects on | visuals play, silence | [x] unit: 'the mute silences sound but leaves visuals alone' |
| 4 | Event flood (multi-hit, chained damage, catch-up burst) | queue budget clamps holds to 0 past `maxQueueMs`; drains, never stalls | [x] unit: 'holds collapse to 0 once the budget is spent, and the queue drains' + 'the budget resets once the queue goes idle' |
| 5 | Catch-up replay / hidden tab | queue `clear()`ed, origins discarded, no audio | [x] `handleAdvisoryEvent`'s mirror-guard branch clears the queue and discards origins before returning; unit coverage on `clear()` |
| 6 | `prefers-reduced-motion: reduce` | transient visuals skipped; **audio still plays** (separate axis) | [x] unit: 'reduced motion skips the visual but KEEPS the sound'; CSS media queries retained (asserted by the kill-switch CSS test) |
| 7 | `fx-off` set | no visuals, no audio, **and iframe idle motion stops** (O4) | [x] unit: 'the kill switch stops sound as well as visuals' + CSS guard test. **Live-verified**: toggling the checkbox set `fx-off` on `document.body` AND on both playmat iframes' `<html>`, and persisted |
| 8 | An effect throws mid-chain | dispatcher swallows; queue treats hold as 0; later plans still run | [x] unit: dispatcher 'a throwing effect returns a 0 hold so the queue keeps moving' + queue 'a throwing run does not wedge the chain' |
| 9 | `attackExecuted` with no `defenderId` (bench-only / fizzle) | banner still plays; no target ring, no lunge; no throw | [x] unit: 'a bench-only attack still fans, with no defender'; `attackBanner` only rings when `rectForInstance` resolves, `attack` returns 0 without both rects |
| 10 | Counter element recreated between update and animation | class applied to the live element only; no stale ref | [x] `applyDamageCounterStyle` is called with the local `damageCounter` binding that was just created or re-read from `targetCard.image.damageCounter`, after the listener cleanup — never a captured earlier reference |
| 11 | Queue still draining when the game ends / player leaves | pending choreography dropped, no timer leak | [x] cleared on the `game-restarted` event (dispatched by restart.js and by the `leaveRoom` socket handler) and whenever `fxOff` turns on; unit coverage on `clear()` cancelling the armed timer |
| 12 | `prizesTaken` with `count` 0 or missing `cards` | no burst, no throw | [x] unit: 'nothing to celebrate draws nothing'; `prizeClaim` returns 0 before touching the DOM |
| 13 | Tool attach vs Energy attach | distinct effects, Energy unchanged from design 022 | [x] the Energy branch is byte-identical to design 022 below the added guard; the Tool branch is a separate overlay class and returns the shorter `tool-attach` hold |
| 14 | Volume out of range / corrupt localStorage | `normalizeVolume` clamps to [0,1]; unreadable storage → defaults | [x] unit: 'normalizeVolume clamps and rejects junk', 'a corrupt stored volume falls back', 'a missing or throwing storage yields defaults, not a throw' |
| 15 | Self vs opp side / flipped board (022 row 7) | rects via `visualRectOf` resolve per iframe | [~] every new anchor (`prizeRectFor`, `discardRectFor`, `activeRectFor`) goes through `visualRectOf`, the same primitive design 022 used and the one that owns the opp iframe's 180° flip. Not eyeballed on a flipped board — user to confirm |

## Test plan
- **Unit (node --test, DOM-free)** — the bulk:
  `fx-queue.test.mjs` (ordering, hold accumulation, budget clamp, flush/clear, throwing run,
  pending count) with an injected fake clock · `fx-holds.test.mjs` (every registry effect has a
  hold; no unknown keys) · `fx-audio.test.mjs` (`voicesFor` per effect, damage pitch scaling,
  weakness overtone, win/lose split, gain clamp, unknown effect → `[]`) ·
  `fx-settings.test.mjs` (read/write/normalize, corrupt + throwing storage) ·
  `advisory-animations.test.mjs` extensions (7 new event types, `attackExecuted` → 2-plan array) ·
  `dispatcher.test.mjs` extensions (returns hold, sound gating vs reduced motion) ·
  `damage-counter-style.test.mjs` (`isDangerDamage`) · new pose math per new effect.
- **Manual (user, localhost, authoritative mode):** per slice — look *and listen*; plus one
  reduced-motion pass, one `fx-off` pass, one muted pass.
- Full `pnpm test` green after every slice; `npx eslint` clean on touched files.

## Migration / rollout
No data, no schema, no dependency (Web Audio is a platform API, not a package — so no
DECISIONS dependency line is owed for it; the *choice* to synthesize gets one). All changes are
additive: new modules, new CSS, new `EVENT_FX` rows, one new argument on two existing functions
(both defaulted). Revert path: per-slice commit revert removes that slice's effect with zero
state impact; the whole layer is disabled at runtime by `ptcg-fx-off`.

## Work plan — slices ≤1 session, each leaving the repo green
| Slice | Delivers | Green when |
|---|---|---|
| 0 | Contract: `fx-queue.mjs`, `fx-holds.mjs`, `fx-settings.mjs/.js`; dispatcher returns hold + takes `playSound`/`holdFor`; `handleAdvisoryEvent` pushes to the queue; mirror guard clears it. No new effect yet. | queue/settings/dispatcher unit tests; existing FX visually unchanged |
| 1 | Audio: `fx-audio.mjs` voices + `fx-audio.js` driver, gesture unlock, wired through the dispatcher. Every design-022 effect gets a voice. | voice unit tests; user hears each effect |
| 2 | Attack choreography: `attack-banner` + `fx-target-ring`, `attackExecuted` → 2-plan array, banner extracted to `banner.js`. | plan/pose tests; user confirms name → target → impact order |
| 3 | Counters & prize: counter land/bump/danger animations, `prize-claim` effect. | style + pose tests; user confirms |
| 4 | Remaining events: promote, devolve, status-clear, discard, coin-flip, tool-attach. | plan/pose tests; user confirms each |
| 5 | Settings UI + iframe kill-switch propagation + 022 rows 7/9 verification. | settings tests; user confirms toggles actually silence/stop everything |

## Deviations (Builder appends here during build)
- **Settings module path.** `fx-settings.mjs/.js` live in `client/src/setup/image-logic/`, not
  `netcode/mat-fx/`: `mat-fx.mjs` (image-logic) is the low-level owner of `fxDisabled()`, and
  having it import upward into `netcode/` would invert the existing dependency direction.
- **Slice 0 — the queue arms a timer even when it is empty.** First cut went idle as soon as the
  queue drained, so a plan pushed mid-hold jumped the one still playing. The armed timer *is* the
  outgoing plan's hold; it must exist with an empty queue. Caught by the slice-0 unit tests.
- **Slice 0 — the queue carries every plan kind, not just `fx`.** The design only pinned `fx`,
  but `knockout`/`shuffle`/`draw` share the same batch; leaving them off the queue would have let
  a KO ghost fire before the damage number that caused it. `runPlan` in advisory-animations.js
  dispatches all four kinds and returns the hold.
- **Slice 2 — `attackName` was already on `attackExecuted`.** The design allowed for confirming
  the payload; it was there (reduce.mjs:5113), so the banner needed no engine change at all.
  Design 024 ships with **zero** engine edits, as its constraints required.
- **Slice 4 — `holdFor` moved into an effect.** `attach` handles both Energy and Tools under one
  effect name, so the Tool branch names `holdFor('tool-attach')` itself rather than being paced
  by the plan's `attach` entry. This is the one place an effect overrides its table hold.
- **Post-slice — the dispatcher now honours the effect's return value.** The design pinned
  `(plan) => number | void` but slice 0 implemented the hold purely from the table, so an effect
  that drew nothing (missing card) still paced the queue. Found in live browser verification, not
  by a test. Every effect's "nothing drawn" guard now returns 0.
- **Review pass (hostile, fresh-context subagent) — 9 findings, all resolved in the diff:**
  1. *Audio/visual drift on the commonest damage event.* `classifyDamagePlan` falls back to the
     delta against the last seen total; `damageVoices` read only `plan.dealt`. Most emitters
     (checkup Poison/Burn, Tool pings, special energy) send a cumulative `damage` only, so those
     hits drew a number, a flash and a table shake in **silence** — the exact drift putting sound
     in the dispatcher was supposed to make impossible. Both sides now classify through one
     `damage-hit.mjs`, whose per-plan cache keeps the stateful fallback from being consumed twice.
  2. *Counters popped on every window resize* — fixed before the review landed (`counterMotionFor`).
  3. *`flush()` had no caller.* O2 said flush on catch-up; edge row 5 said clear. `clear()` is
     correct (a replayed burst should be skipped, not fast-forwarded), so `flush()` was deleted
     and O2's wording is superseded by this note.
  4. *Wrong mat on an unknown side.* `user === 'self' ? selfDoc : oppDoc` resolved `user: null` —
     which `advisoryAnimationPlan` yields whenever `playerId`/`selfPlayerId` is missing — to the
     OPPONENT's mat. New `side-doc.mjs` refuses to guess; an unknown side draws nothing.
  5. *An Energy whose card record had not landed drew the Tool ring*, because
     `isEnergyCard(undefined)` is false. A missing record now draws nothing, as before design 024.
  6. *`writeSetting` returned true with no storage*, contradicting its own JSDoc; the test had
     pinned the wrong behaviour.
  7. *`applyFxSettings` stripped a hand-set `body.fx-off`* on every view apply, demoting a
     documented input to an output. It now ORs the class in, per `fxDisabled()`'s contract.
  8. *The CSS guard test could not fail* — it grepped for substrings. Rewritten to parse the
     sheets and check guard coverage by selector-token subset, with a paren-aware selector
     splitter (`:has(> img, > .mat-holo)` contains a comma). Confirmed by hand: it now fails on an
     unguarded loop and still passes a legitimately broader guard.
  9. *Queue re-entrancy.* `timer = schedule(...)` was assigned after `run`, so an effect that
     synchronously cleared the queue (one dispatching `game-restarted`) would have it re-armed on
     top of the stop. Guarded with an epoch counter.
  Minor, also fixed: a partially built `AudioContext` is now closed and its stale noise buffer
  dropped; `discardOrigins` runs once per event rather than once per fanned-out plan; the
  reflow-restart idiom is commented where it is a deliberate no-op.
- **Not done:** an HP readout (O5, filed as an ISSUES line); legacy (non-authoritative) mode still
  gets no effects, unchanged from design 022; sampled audio (O1 — procedural only).

---
Self-approval checklist (user said "implement all of them"; scope list was posted and accepted):
- [x] Every constraint traceable into the Design section
- [x] Every edge-case row has an expected behavior
- [x] Interfaces fully named — queue/settings/audio signatures, hold table, event map pinned
- [x] Slices each ≤1 session and independently green
- [x] No section reads "TBD"
