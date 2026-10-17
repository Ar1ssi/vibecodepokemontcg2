# 018 — Once-per-game GX attack and VSTAR Power limits

Status: shipped (S193)
Workflow: feature

## Problem

Rulebook App. 9/19: a player may use **one VSTAR Power per game** and **one GX attack per
game**, tracked **independently**. Two P0 defects (`rulebook-30c-vs-rules-engine-gaps.md` #2/#3):

1. **Server:** `useVStarGX` sets both `flags.vstarUsed` and `flags.gxUsed`
   (`reduce.mjs:3177-3187`), and `advanceTurn` replaces the whole `flags` object every turn
   (`reduce.mjs:976-987`). The guard at `reduce.mjs:1859-1866` therefore only blocks reuse
   *within the current turn*, and GX/VSTAR cross-cancel. A GX attack (an attack whose name
   ends in `GX`) never sets `gxUsed` at all.
2. **Legacy:** `ko-flow.mjs` `koOutcome`/`handleKO` treat a GX knockout as an immediate
   match loss (`ko-flow.mjs:63-70, 107-120`). App. 19 awards **2 Prize cards** — there is no
   match-loss rule. (`prizesForKO` already returns 2 for GX.)

## Goal

- Persist the two limits for the whole game, per player.
- Track GX and VSTAR separately.
- A GX attack is consumed by using it, and blocked once spent.
- GX knockout awards 2 prizes on the legacy path; the server path already does.

## Out of scope

- VMAX: the rulebook gives VMAX no once-per-game mechanic. Its rule box / 3-prize KO is
  already implemented (`prizesForKO`) and is verified, not changed, here.
- Executing a VSTAR Power's printed *effect* (attack/ability resolution). This design tracks
  the allowance only; the effect path is the existing `attack` / `useAbility` machinery.
- Full Phase 0 `card-classify.mjs`; TAG TEAM / V-UNION / LEGEND; tiebreaker; Mega turn-end.

## Current state (files)

- `shared/engine/state.mjs` — `createGameState` builds `players[id].flags`; `cloneGameState`
  clones flags. No per-game object.
- `shared/engine/setup.mjs` — `setupGame` re-initialises `flags` per player.
- `shared/engine/commands.mjs` — `useVStarGX` shape (instanceId only); `DISPOSITION_TABLE`.
- `shared/engine/reduce.mjs` — `validateLegality` attack + useVStarGX cases; `advanceTurn`;
  `attack` execution; `useVStarGX` execution.
- `shared/engine/view.mjs` — exposes `you/them.flags` to clients.
- `shared/engine/rules/damage-parser.mjs` — attack-text helpers; home for the new classifier.
- `shared/engine/rules/ko-flow.mjs` — legacy KO/prize logic.
- `client/src/setup/netcode/dual-run-bridge.js` — `VSTARGXFunction` translator.
- `client/src/actions/general/VSTAR-GX.js` — legacy sender (`[type]`).

## Options

### A. Where the once-per-game state lives

1. Keep `player.flags.*Used`, teach `advanceTurn` to carry them across the rebuild.
   - Tradeoff: smallest diff, but leaves two "used" sources on one object and the next
     wholesale-reset elsewhere can drop them again (the current bug's root cause).
2. **`player.oncePerGame = { vstarUsed, gxUsed }`**, initialised once and never touched by
   `advanceTurn`. **Pick.**
   - Tradeoff: one new field + view projection, but immune to the reset pattern and reads
     clearly as "game-scoped, not turn-scoped".

### B. GX-vs-VSTAR discrimination

1. Infer server-side from card subtypes.
   - Tradeoff: a VSTAR Power can be an ability or attack and the marker command is generic;
     inference needs card context the legacy sender does not supply.
2. **Explicit `kind: 'vstar' | 'gx'` enum on `useVStarGX`**, matching the legacy `type`
   argument (`'GX'`/`'VSTAR'`). **Pick.**
   - Tradeoff: strict shape; the dead client path must send it (it already has the value).

### C. GX attack detection

1. Card-data flag (`attack.gx`). TCGdex does not expose one; would need new plumbing.
2. **Pure helper `isGxAttack(attack)` on the printed name** (`/[\s-]GX$/i`), beside
   `isGxCard`. **Pick.**
   - Tradeoff: name-based, but TCGdex leads every GX attack name with the marker and
     `isGxCard` already relies on the same fallback.

### D. View projection

1. Add `oncePerGame` to the view and update `apply-view.js`/`view-diff.mjs`.
2. **Merge `oncePerGame` into the exposed `flags`** so the wire shape and client stay put.
   **Pick** — the client only needs the used booleans; where they are stored is server-side.

## Edge cases

| Case | Handling |
|---|---|
| State built without `oncePerGame` (old snapshots, tests) | Reads use `?.`, treated as unused; `cloneGameState` defaults `{}`. |
| `useVStarGX` with no `instanceId` (legacy sender) | `instanceId` optional in shape; `validateReferences` skips the lookup when absent; the flag is per-player, so no card is needed. |
| Second GX attack same turn | `attackerAttacked` already blocks; once-per-game is the cross-turn guard. |
| Confused GX attack fizzles (tails) | Flag is **not** consumed — only the resolving path sets it. |
| GX attack raises a target/search choice | Flag is set on the normal path before the search suspend and in the target-resume branch, so suspension never loses it. |
| GX attack under a search suspend | Normal path reaches the flag-set after the search block; covered. |
| Unknown `kind` | Shape validation rejects with a readable reason. |
| Non-GX attack after a GX attack | Allowed — only GX attacks are limited. |
| VSTAR used, then a GX attack | Allowed — limits independent. |
| GX used, then `useVStarGX kind:'vstar'` | Allowed. |

## Work plan (one green commit)

1. Add `isGxAttack` (`damage-parser.mjs`) + tests.
2. Add `oncePerGame` to `createGameState`/`cloneGameState`/`setupGame`/`view` projection.
3. `commands.mjs`: `kind` enum, optional `instanceId`.
4. `reduce.mjs`: GX attack legality + consumption (normal + target-resume); `useVStarGX`
   split flags + persisted legality; `advanceTurn` untouched.
5. Legacy: `ko-flow.mjs` GX KO = 2 prizes; update `rules-extended.test.mjs`; README text.
6. `dual-run-bridge.js` translator passes `kind`.
7. New `shared/engine/__tests__/once-per-game.test.mjs`; add to `package.json` test list.

## Verification

- `node --test` on the new + touched test files, then full `pnpm test`.
- `pnpm lint` (repo already red on CRLF/pre-existing no-undef; ensure no new errors).

## Decisions

- D-GX: GX attacks are identified by printed name; consumption is per-player per-game.
- `oncePerGame` is game-scoped state immune to `advanceTurn`'s per-turn flag rebuild.
- The view projects `oncePerGame` into `flags` for the existing client buttons.

## Review

Hostile read-only review found: hand-built players in `server/game/room.mjs` lacked `oncePerGame`
(fixed), `validateLegality` silently treated an absent `kind` as vstar when called directly
(fixed with an explicit guard), and `dual-run-bridge.js` destructured a possibly-null parameter
list (fixed with an `Array.isArray` guard). Missing edge tests were added: Confused fizzle does
not spend the limit; a target-choice suspend spends it on resume; a state without `oncePerGame`
still works; the legacy `[type]`→`kind` mapping. Noted, not fixed (documented boundary): the
attack panel does not grey a spent GX attack — the server rejects it.
