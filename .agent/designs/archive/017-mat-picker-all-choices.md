# 017: Route every in-play-Pokémon choice to the mat picker (retreat, Escape Rope, attack snipes)
Status: shipped
Date: 2026-09-19 · Session: S192

## Problem
PR #170 (design 016, D59) wired the legacy click-the-card mat picker into
`SERVER_AUTHORITATIVE` netcode, but only for **single-pick** server `PendingChoice`s whose
options are all in-play Pokémon. Several effects that make the player choose Pokémon did
not reach it:
- **Retreat**: no `PendingChoice` at all. The Retreat button sent no target and the server
  silently promoted the *first* Benched Pokémon (`reduce.mjs` `case 'retreat'`), while the
  mat only supported drag-active-onto-bench.
- **Escape Rope**: unimplemented (no parser, no step; only present in sample decklists).
- **Attack snipes**: "This attack does N damage to 1 of your opponent's Pokémon / Benched
  Pokémon" (and counter-placement wordings) either auto-picked the first benched Pokémon
  (design 013 option 2A) or were parsed but unwired (`opponentCounterClause`).
- Boss's Orders, Switch and heal trainers already routed correctly (engine `switchOpponent`
  /`switchOwn`/`heal`, min=max=1) — verified, not changed.
- Damage-to-all-Bench spread is intentionally automatic (`allBenchDamage`) — verified.

## Constraints
- Engine stays pure/DOM-free; the client owns only presentation.
- Multi-pick (`max > 1`) must be expressible: "choose one or more" attacks and
  "choose N … and put M counters on each".
- Legacy flag-off behavior must not regress; the server is the authority when on.
- No new dependency, no protocol change beyond what a `PendingChoice` already carries.

## Design
### Multi-select mat picker (client)
- `mat-picker.js` `openMatPick` gains `min`/`max`/`onConfirm`. `max <= 1` keeps the
  click-once resolve; `max > 1` toggles cards (idle yellow → selected green outline) and
  requires **Confirm**, enforcing `min..max`. `cancellable` still hides Cancel/Escape.
- `mat-pick-request.mjs`: the gate no longer rejects `max > 1`; it returns
  `{title, candidates, cancellable, min, max}` for any all-in-play-Pokémon option set.
- `mat-picker-adapter.js` forwards `min`/`max` and reports `onConfirm` selections;
  `apply-view.js` passes them through. Falls back to the carousel when an option is off-mat.

### Retreat (engine)
- `reduce.mjs`: the `retreat` case suspends to a `PendingChoice` (`resumeToken.effectType:
  'retreat'`, options = own Benched Pokémon roots, min=max=1) when there is no explicit
  `benchInstanceId` **and** 2+ bench targets. Exactly one bench still auto-switches.
- Shared helper `applyRetreatSwap` performs the Energy payment + swap for both the direct
  command and the resume path. Retreat does not end the turn.

### Escape Rope (engine)
- `trainer-effects.mjs` parses "Each player switches their Active Pokémon with 1 of their
  Benched Pokémon" into two sequential steps: `switchOwn` (the player who played it) then
  `switchOpponentOut` (the opponent). `executeSteps` already resumes each step's choice, so
  each seat gets its own mat picker; legacy `trainer-execution.js` already handles both.

### Attack target selection (engine)
- `damage-parser.mjs` `attackTargetClause` reads "does N damage to M of your opponent's
  [Benched] Pokémon" → `{kind:'damage', amount, count, scope:'bench'|'any'}`.
  `opponentCounterClause` (existing, now accepts singular "counter") covers counter
  placement; "in any way you like" distribution stays unwired (the fixed mat picker cannot
  express per-target counts) rather than misapplying a flat amount.
- `reduce.mjs` resolves `attackTarget` **after** every other attack effect (so a suspension
  never drops them): 0 candidates fizzle; `<= count` candidates apply automatically; more
  than `count` raise a `PendingChoice` (options = defender Active+Bench for `any`, Bench for
  `bench`, min=max=count). Resume applies damage/counters then emits `attackExecuted` and
  ends the turn. Bench targets go through `damageBenchedPokemon`; Active targets through a
  flat helper (Tera/bench-shield guards and KO handling preserved). W/R is not applied to
  chosen snipe targets.
- **"…in any way you like" distribution** is `attackTarget.distributable`: one counter (10)
  is placed per click, re-suspending with `remaining - 1` until all counters land. When only
  the Active is in play it auto-places every counter.
- **Legacy (flag-off) parity**: `chat-buttons.js` retreat with 2+ bench and no drag target
  opens `openMatPick`; the single-bench attack snipe and the "1 of your opponent's Pokémon" /
  counter clauses also use `openMatPick` (multi-select for choose-N).
- **Drag-to-retreat**: `drag.js` no longer refuses a Bench drop when 2+ bench Pokémon exist
  and the hit target is not a bare `<img>` (empty slot / zone background / holo overlay). It
  passes no target, so `retreat()` raises the click-the-card picker on both paths instead of
  silently promoting the first Bench Pokémon. A direct drop on a non-holo card still targets
  that card.
- **Boss's Orders** was verified end-to-end (parser → `switchOpponent` choice = opponent
  bench, min=max=1 → mat picker → clicked Pokémon promoted); no change needed.

## Edge cases & failure modes
| # | Case | Expected | Covered by |
|---|---|---|---|
| 1 | Retreat, 1 bench | auto-switch, no choice | attack-ko retreat test |
| 2 | Retreat, 2+ bench | choice → clicked bench promoted | attack-ko retreat test |
| 3 | Escape Rope, both benches 1 | both auto-switch | (auto path) |
| 4 | Escape Rope, initiator picks first | p1 choice then p2 choice | trainer-steps test |
| 5 | Snipe, 1 bench target | auto-apply | attack-scaling test |
| 6 | Snipe, 2+ bench | choice among bench | attack-scaling test |
| 7 | "1 of opponent's Pokémon" | options = Active+Bench | attack-scaling test |
| 8 | Choose N counters | min=max=N multi-pick | attack-scaling test |
| 9 | Spread to each benched | automatic, unchanged | existing spread tests |
| 10 | "in any way you like" | one counter per click until all placed; auto when only Active | attack-scaling tests |
| 11 | Attack also has deck search | target falls back to first eligible (no overwrite) | code comment |

## Test plan
- `mat-pick-request.test.mjs`, `apply-view.test.mjs`: multi-pick request + submission.
- `attack-ko.test.mjs`: retreat choice suspend/resume + single-bench auto.
- `trainer-steps.test.mjs`: Escape Rope two-step choices.
- `attack-scaling.test.mjs`: bench snipe choice, any-target choice, multi counters, auto-one,
  "in any way" sequential placement + auto.
- `pnpm test` green (1989/1989).

## Migration / rollout
No persisted state or protocol change. Revert path: revert the commit; legacy flag-off paths
are untouched.

## Deviations
- The legacy (flag-off) `chat-buttons.js` changes are syntax/lint-checked only — that
  4,700-line DOM monolith has no unit harness, and no live 2P run was done this session. The
  `SERVER_AUTHORITATIVE` path (default on) is the tested one. W/R is not applied to chosen
  snipe targets on either path.
