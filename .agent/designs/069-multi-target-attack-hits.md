# 069: Multi-target attack hits — the move reaches every Pokémon it damages
Status: draft — awaiting user approval
Date: 2026-10-15 · Session: S-069 (branch `claude/great-wozniak-hwz8xu`)

## Problem
The user's request, verbatim (2026-10-15):

> for atacks that damage multiple pokemon, draft a plan so that the attack animation also hits those pokemon

Today a move scene (design 063/065) flies from the attacker to ONE defender. Every other Pokémon the
attack damages (spread to the Bench, "each of your opponent's Pokémon", a chosen Bench snipe, the
attacker's own Bench) only gets its damage number and a TCG Live `_C` prefab (design 068), all at the
same contact instant, with nothing travelling to it and no card reaction. A Bench-only attack is
worse: the move flies at the opponent's Active, which takes no damage, while the Bench pops.

## Constraints
- Client cosmetic only (D94): no engine, rules, netcode or protocol change. Everything is derived on
  the client from events both clients already receive (`damageUpdated`, `attackExecuted`). So no
  approval gate beyond this plan; hard rule 7 applies only to test fixtures (cited below).
- One clock (D103/D118/D119): canvas layers draw from a WAAPI animation's `currentTime` via
  `playCanvasStage`; card motion is WAAPI keyframes from pure pose functions. No rAF.
- 063 render budget: per scene ≤ 2 canvases + this design's 1 extra branch canvas; ≤ 30 tongues per
  frame; the headless probe (`rec-move.mjs` timing) median ≤ 17 ms, p95 ≤ 140 ms.
- House FX rules (fx-designer): one palette start to payoff (branch lanes use the scene's material);
  no whiteouts / board-wide blooms; 3D cards never get opacity; colour from data.
- D105: under reduced motion the dispatcher skips `attack` and `damage` scenes (static fallbacks
  unchanged); `fx-off` plays nothing. Nothing new to add.
- FX queue budget 3800 ms (fx-queue.mjs): the attack's queue hold still ends at contact; the ripple
  after contact must not grow any hold.
- Pure logic in `.mjs` testable under `node --test` without jsdom; DOM only in the `.js` twins.

## Current state (read this session)
- `advisory-animations.mjs` maps `attackExecuted` → `['attack-banner', 'attack']` plans and
  `damageUpdated` → one `damage` plan per card. `attackLeads(events)` moves each `attackExecuted`
  to just before the first hit (`damageUpdated` / `pokemonKnockedOut` / `statusApplied`) of its
  segment (segment bounds: `attackExecuted`, `turnStarted`). The engine pushes `attackExecuted`
  after the damage it resolved (reduce.mjs:8558, resume path reduce.mjs:10228 with no `defenderId`).
- `attackExecuted` carries `attackerId, defenderId, attackName, damage` (Active damage dealt),
  `benchDealt` (sum of every non-Active hit), `playerId` — not the list of damaged cards.
- `combat.js` `attack(plan)` picks a signature spec, else a move spec, else a lunge, and plays it
  from the attacker to `plan.defenderId` (fallback: the opponent's Active). The scene announces its
  contact on the impact queue (`announceStrike(contactMs, ctx)`; `createImpactQueue` in
  combat-pose.mjs runs every queued job at that one moment with one `ctx`).
- `combat.js` `damage(plan)` queues a job: at contact → damage number, then the 068 prefab
  (`impactVariant(amount, bench)` → `_C` on the Bench) or the old `strikeTarget` dressing, then
  table shake. Its rect comes from `combatRect` (live card, else the pre-diff snapshot captured by
  `origins.mjs` for every `damageUpdated` id, so a KO'd Bench card still resolves).
- `attackBanner(plan)` rings `plan.defenderId` only.
- Knockouts: `advisory-animations.js:252` `playKnockoutGhost(ghost, { deferStart: afterImpact })`
  starts every KO at contact.
- `move-player.js` `playMove({spec, attacker, defender, ...})`: one host overlay over the union of
  both rects, a lane (`laneGeometry(from, to)`), beats `{at, until, layer, drawer, params}` drawn by
  lane-relative drawers (`move-drawers.js`). Travelling drawers: `projectile` (57 beats), `beam`
  (54), `volley` (41), `bolt` (20). Impact dressing is stripped when a 068 prefab plays
  (`withoutImpactBeats`, impact-select.mjs).
- `damage-hit.mjs` `classifyHitOnce(plan)` is stateful (diffs against `lastSeenDamage`), so it can run
  once per plan; nothing peeks at a hit without consuming it.
- Sound: a `damage` plan only sounds heals; the hit sample belongs to the attack (design 064
  `attack-sound.mjs`), aligned to contact.

## Options
1. **Where the target list comes from.**
   A. Engine adds `targets[]` to `attackExecuted` — exact, but a protocol change (approval gate,
      both emit sites, replay compat). B. Client derives it from the `damageUpdated` events in the
      attack's segment, the same pass `attackLeads` already makes. **Pick B**: no protocol change,
      and the segment rule is already relied on for ordering.
2. **How secondary targets are hit.**
   A. A full move scene per target — over the canvas and blur budget at 3+ targets.
   B. Primary keeps its full scene; each secondary gets the move's own *travel* beats replayed on
      its own lane (attacker → that card), then the 068 `_C` prefab, its number, and a card recoil.
   C. Prefab + number + recoil only, nothing travels. **Pick B**, with C as the automatic
      fallback for moves with no travel beats (quake, burst, roar…: their area beats already read as
      board-wide) and beyond the lane cap.
3. **Timing of secondary hits.** A. All at contact (today). B. A ripple: hits land one step apart,
   ordered by distance from the primary. **Pick B** — it reads as the attack reaching each card.
   Step 80 ms, total spread capped at 400 ms. (Taste call T1.)
4. **Which card is primary** when the Active takes no damage (snipe / Bench spread). A. Keep the
   Active. B. The hit card with the most damage (ties: engine order). **Pick B**; the Active stays
   primary whenever it is hit.

## Design
### Data: the hit list (pure)
`advisory-animations.mjs`:
```js
/** attackExecuted event -> the cards it damaged, in first-seen order (attacker excluded, deduped). */
export function attackHitIds(events) // Map<object, {instanceId, damage, dealt?}[]>
```
Same walk as `attackLeads`: collect `damageUpdated` events since the last segment bound (one entry
per `instanceId`, the last event's `damage`/`dealt` win); at an `attackExecuted`, store them minus
`event.attackerId`, then reset. `advisoryAnimationPlan` gains option `hits` (array | null); when given,
both `attack-banner` and `attack` plans carry `hits`. `advisory-animations.js` computes `attackHits = attackHitIds(events)` in
`handleBeforeApply` and passes `attackHits.get(event)` for `attackExecuted`.

### Peeking a hit (pure)
`damage-hit.mjs`: `export function peekHit(plan)` → `classifyDamagePlan(plan, new Map(lastSeenDamage))`
(non-mutating). `attack()` runs before its damage plans (attackLeads), so the baselines are still the
pre-attack totals there.

### Target layout (pure) — new `mat-fx/multi-hit.mjs`
```js
export const HIT_STEP_MS = 80;
export const HIT_SPREAD_MAX_MS = 400;
export const MAX_BRANCH_LANES = 5;
/**
 * targets: [{id, rect, amount, isDefender}] (hits only, heals and rect-less dropped by the caller)
 * returns { primaryId, secondaries: [{id, delayMs, lane: boolean}] } or null when targets is empty.
 */
export function layoutHits(targets)
```
- primary = the target with `isDefender && amount > 0`, else max `amount` (ties: first).
- secondaries = the rest, sorted by centre distance to the primary's rect centre (ties: input order);
  `delayMs = min(HIT_STEP_MS * (i + 1), HIT_SPREAD_MAX_MS)`; `lane = i < MAX_BRANCH_LANES`.
- `export function hitDelayFor(ctx, id)` → `ctx?.hitDelays?.[id] ?? 0`.

`combat-pose.mjs`: `export function hitRecoilPose(t)` → `{ along }` (fraction of card height pushed
away from the attacker; 0 → peak 0.12 at t = 0.18 → 0 by t = 1, easeOutCubic out, easeInOutQuad back)
and `export const HIT_RECOIL_MS = 320`.

### Travel beats (pure) — `moves/move-spec.mjs`
`export const TRAVEL_DRAWERS = Object.freeze(['projectile', 'beam', 'volley', 'bolt'])` and
`export function travelBeats(spec)` → the beats whose drawer is in `TRAVEL_DRAWERS` and whose
`at < spec.contactMs` (frozen, memoised per spec like `withoutImpactBeats`).

### Branch lanes (DOM) — `moves/move-player.js`
`playMove` gains `branches = []`: `[{ rect, delayMs }]`. When non-empty and `travelBeats(spec)` is
non-empty, one extra `fx-move__canvas--branch` stage on a host over the union of the attacker and
every branch rect; per branch, a lane `laneGeometry(attacker.rect, branch.rect)` and the travel beats
drawn with `elapsedMs - delayMs` (so each arrives `delayMs` after the main contact), same material and
tint cache as the scene. The return value gains `branchEndMs` (last delay + `durationMs`).

### Control flow — `combat.js`
`attack(plan)`:
1. `targets` = `plan.hits` mapped to `{id: h.instanceId, rect: combatRect(h.instanceId),
   amount: peekHit(h).amount, isDefender: h.instanceId === plan.defenderId}`, keeping
   `peekHit(h)?.kind === 'hit'` with a rect.
2. `layout = layoutHits(targets)`; when non-null, `defenderId = layout.primaryId` (replaces today's
   `plan.defenderId` / opponent-Active pick; unchanged when `plan.hits` is absent or empty).
3. `strikeContext` adds `hitDelays` (`{[id]: delayMs}` for secondaries).
4. `playMove(...)` gets `branches` = secondaries with `lane` → `{rect, delayMs}`. `playLunge` passes
   `hitDelays` but draws no branches.
5. `markAttackScene(max(durationMs, contactMs + lastDelay + HIT_SPARKS_MS))`.

`damage(plan)`: the queued job waits `hitDelayFor(ctx, plan.instanceId)` (setTimeout; 0 → runs now),
then does exactly today's work, plus `recoilCard(plan.instanceId, ctx)` when the delay is > 0 (a
secondary): WAAPI `translate` keyframes from `hitRecoilPose` on the shown card element, direction =
attacker centre → card centre, `composite: 'add'` so the tilt and playmat slides are untouched.

`attackBanner(plan)`: rings every `plan.hits` id that has a rect (max 6), else `plan.defenderId` as today.

`advisory-animations.js` knockout: `deferStart: (start) => afterImpact((ctx) =>
setTimeout(start, hitDelayFor(ctx, plan.instanceId)))` so a Bench KO lands on its own hit.

### Lifecycle
No new state survives a batch: `hitDelays` rides on the strike context, the branch canvas self-removes
with the scene's backstop (`removeWhen`), recoil animations are fire-and-forget WAAPI.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | `plan.hits` absent / empty (older batch shape, zero-damage attack) | exactly today's behavior | [ ] |
| 2 | a hit id with no rect (left the board, snapshot missing) | dropped from layout; its damage job still runs as today | [ ] |
| 3 | one target only | no secondaries, no branch canvas, no delay — today's scene | [ ] |
| 4 | Active hit + 5 Bench (spread) | Active primary; 5 lanes, delays 80…400 | [ ] |
| 5 | > 5 secondaries (Sky Field Bench, both sides) | first 5 get lanes; the rest prefab + recoil only; delays capped at 400 | [ ] |
| 6 | Active took 0, Bench hit (snipe / Bench spread) | the most-damaged Bench card is primary; the move flies there, not to the Active | [ ] |
| 7 | chosen-target attack resumed after a pick (no `defenderId`) | resume batch's hits drive the layout; the pre-choice batch (no `attackExecuted` in its segment) plays bare as today | [ ] |
| 8 | attacker damages itself (recoil) | excluded from `hits`; number at contact as today | [ ] |
| 9 | attacker's own Bench damaged | secondaries like any other; lane is short | [ ] |
| 10 | a heal in the segment | `peekHit` kind `heal` → not a target; its heal number plays as today | [ ] |
| 11 | a Bench target is KO'd | its KO ghost starts at its own hit delay, not at contact | [ ] |
| 12 | spec with no travel beats (quake, burst, roar…) or a lunge | no branch canvas; secondaries get prefab + recoil on the ripple | [ ] |
| 13 | 068 prefab not loaded yet | secondaries fall back to `strikeTarget` as today, on the ripple | [ ] |
| 14 | reduced motion / fx-off | unchanged (attack and damage scenes skipped / nothing) | [ ] |
| 15 | two attacks in one batch (extra-attack Abilities) | each `attackExecuted` gets only its own segment's ids | [ ] |
| 16 | a damage job throws | the error stays inside that job; others keep their delays (jobs are independent timers) | [ ] |

## Test plan
- Unit (node --test): `attackHitIds` (rows 1, 8, 15), `layoutHits` (3–6), `peekHit` does not move the
  baseline (10), `travelBeats` (12), `hitRecoilPose` bounds, `hitDelayFor`.
- Engine-fed unit: real `applyCommand` events for the three fixture cards below, through
  `attackHitIds`, so the segment rule is checked against what reduce actually emits (rows 4, 6, 7).
- Video (fx-preview): `rec-attack-hit.mjs` gains `SPREAD=1` (Active + 3 Bench damage events behind one
  `attackExecuted`); the frame strip must show branch travel to each Bench card and staggered numbers.
- Perf: the 063 probe on the `SPREAD=1` run (5 lanes): median ≤ 17 ms, p95 ≤ 140 ms. Over budget →
  `MAX_BRANCH_LANES = 3` (pinned fallback, no other change).
- Manual: user look pass on localhost (FX work is not self-graded).

## Migration / rollout
n/a: client cosmetic. Revert = revert the slice commits; no data or protocol touched.

## Work plan
| Slice | Files | Signatures & data | Test cases: input → expected | Rulings (source) | Green when |
|---|---|---|---|---|---|
| 1 | modify `client/src/setup/netcode/advisory-animations.mjs`, `advisory-animations.js`, `__tests__/advisory-animations.test.mjs`; create `client/src/setup/netcode/__tests__/attack-hit-ids.engine.test.mjs` | `attackHitIds(events) → Map<event, {instanceId, damage, dealt?}[]>`; plan option `hits` → `plan.hits` on both attack plans | `[dmg A, dmg B, attackExecuted(attacker X)]` → `[A, B]`; `[dmg X, dmg A, atk(X)]` → `[A]`; `[dmg A, dmg A, atk]` → one A (last fields win); `[dmg A, atk1, dmg B, atk2]` → atk1 `[A]`, atk2 `[B]`; `[dmg A, turnStarted, atk]` → `[]`; engine: Kyurem ex Blizzard Burst with 2 Prizes taken, opp Active + 2 Bench → 3 ids; Mewtwo ex Photon Bullets vs Active ex + 1 Bench ex + 1 non-ex → 2 ids; Buzzwole-GX Jet Punch: resume batch → `[benched pick]` | Kyurem ex BLK 165, Mewtwo ex 30C 157, Buzzwole-GX 30C 57 (`out/pkmn-pokemon-cards.json`) | `node --test` on both files; `pnpm test:changed` |
| 2 | modify `mat-fx/damage-hit.mjs`, `mat-fx/combat-pose.mjs`; create `mat-fx/multi-hit.mjs`, `mat-fx/__tests__/multi-hit.test.mjs`; extend `__tests__/combat-pose.test.mjs` | `peekHit(plan)`; `layoutHits(targets)`; `hitDelayFor(ctx,id)`; `hitRecoilPose(t)`; constants as in Design | 1 target → `{primaryId, secondaries: []}`; defender 130 + Bench 20,20 → defender primary, delays 80,160; defender 0 + Bench 30 → Bench primary; 8 targets → 7 secondaries, `lane` true for 5, last delay 400; `peekHit` twice → same result, and a later `classifyHitOnce` still sees the delta; recoil pose 0 at t=0 and t=1, max 0.12 | — | `node --test` on the three test files |
| 3 | modify `moves/move-spec.mjs`, `moves/move-player.js`; extend `moves/__tests__` spec tests | `TRAVEL_DRAWERS`; `travelBeats(spec)`; `playMove({... branches})` → `{holdMs, durationMs, contactMs, branchEndMs}` | every shipped spec (SPECS + SIGNATURE_SPECS): `travelBeats` ⊆ beats, all `at < contactMs`; a quake spec → `[]`; memoised (same array twice) | — | `node --test` on move tests; `rec-move.mjs` still exits 0 |
| 4 | modify `mat-fx/combat.js`, `advisory-animations.js` (KO deferStart) | control flow as in Design § Control flow | covered by slice 2 pure tests + slice 5 video; lint clean | — | `npx eslint --quiet` on both; `pnpm test:changed` |
| 5 | modify `.claude/skills/fx-preview/rec/rec-attack-hit.mjs` | `SPREAD=1` env: Active + 3 Bench `damageUpdated` then one `attackExecuted` with `hits` | run exits 0; log shows `numbers: 4`, `branchLanes: 3`; probe median ≤ 17 ms, p95 ≤ 140 ms | — | the run's output pasted in the commit body |

## Taste calls for the user (defaults chosen; change any before slice 4)
- T1 Ripple vs simultaneous: default ripple, 80 ms step, nearest-to-primary first.
- T2 Sound per secondary hit: default none (the attack's one sampled hit stays); alternative a quieter
  copy of the hit sample on each ripple step.
- T3 Branch origin: default from the attacker for every move; alternative for spread moves, branches
  fan out from the primary defender (reads as "splashing" onto the Bench).
- T4 Target rings on the banner: default ring every hit card.

## Deviations (Builder appends here during build)
