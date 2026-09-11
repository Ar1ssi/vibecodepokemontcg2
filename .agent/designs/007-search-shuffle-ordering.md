# 007: Search-effect shuffle ordering and mirror-deck drift
Status: shipped (uncommitted; approved by user in chat S91 — "Go ahead" on the posted fix plan)
Date: 2026-09-11 · Session: S91

## Problem
In legacy 2P, a benched Pokémon (Dratini #6, Buddy-Buddy Poffin) never appeared on the peer's
board. Sync log `ptcg-sync-log_combined_test_1789066196357.json` shows every deck search relays
`shuffleZone` before the `moveCardBundle` that took the card (7 of 8 search shuffles in the log).
The peer then applies a permutation built for a different deck length: `rearrangeArray` silently
drops a card (perm shorter) or leaves an `undefined` slot (perm longer); an `undefined` slot makes
`resolveCardIndex` throw, and `acceptAction` swallows it — the move is lost with no sync-log trace.

## Constraints
- Legacy (non-authoritative) relay stays the default path (SERVER_AUTHORITATIVE unset); no protocol change.
- Deck order is owner-secret-ish: mirrors resolve deck cards by cardId hint, not by relay index (I24 history).
- No new dependency.

## Current state
- `card-picker.js` `confirmPicker`: moves each pick with an un-awaited `moveCardBundle`, then calls
  `onConfirm`/`onPick`, which shuffle synchronously (`shuffleDeckAfterSearch` → `shuffleZone`).
- `move-card-bundle.js`: relays the move only after `await moveCard(...)`.
- `move-card.js` `moveCard`: reads `movingCard` from `index` synchronously, awaits rules gates
  (`ensureCardData`, legality), then splices with the entry-time `index`.
- `shuffle.js` `rearrangeArray`: `indices.map(i => array[i])` — no length check.
- `shuffle-zone.js`: applies the relayed permutation, then dereferences every slot.
- `resolve-card-index.mjs`: `findIndex(c => c.cardId …)` throws on an `undefined` slot.
- Several search callers also re-moved picks the picker had already moved (the I24 double-move).

## Options
1. Where to fix the ordering
   A. Await moves before shuffling at each call site — local execution order = wire order; touches many sites.
   B. Outbox that reorders emits by call order — wire order fixed but the sender still shuffles
      before its splice, so the permutation length would still mismatch the receiver. Rejected.
   Pick A, plus the defenses below so any site not yet converted cannot lose cards.
2. Receiver when a permutation's length mismatches
   A. Keep every card (skip bad indices, append unreferenced cards) and log `shuffleZone.indices_mismatch`.
   B. Refuse the shuffle and request a resync — no full-board resync exists in legacy mode (I12).
   Pick A: content is what cardId-resolved moves need; order on a mirror is already not trusted.

## Design
- `movePicksInOrder(picks, moveOne)` (new `client/src/setup/image-logic/card-picker-moves.mjs`):
  awaits each move in turn, logs and skips a throwing move. `confirmPicker` uses it before calling
  the confirm callbacks, and sets `state.confirming` so a second confirm click is ignored.
- Remove the duplicate manual move loops in callbacks of pickers that already move
  (rules-bridge.js Telepathic energy search + ability multi-search, chat-buttons.js attack multi-search).
- `await` the move before the shuffle where the caller moves manually: trainer-execution.js
  (Nest Ball auto-bench, attach-energy paths), chat-buttons.js (search ability multi/single, stadium
  search-bench / search-hand / search).
- `moveCard`: re-resolve `index = oZone.array.indexOf(movingCard)` right before the splice; `-1` → `{ ok: false }`.
- `rearrangeArray(array, indices) → boolean`: exact-permutation flag; never drops or holes.
  `shuffleZone` logs `shuffleZone.indices_mismatch` (console.warn + sync log) on `false`.
- `resolveCardIndex` / `hintMatchesAtIndex`: skip nullish slots.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | empty picks / empty permutation / empty zone | no moves; zone intact; empty+empty is exact | [x] covered: `movePicksInOrder accepts synchronous moves and an empty pick list`, `rearrangeArray with an empty permutation keeps the zone intact`, `…empty zone with an empty permutation is exact` |
| 2 | invalid permutation entries (repeat, non-integer, out of range) | skipped, cards kept, returns false | [x] covered: `rearrangeArray ignores repeated and non-integer indices`, `…leaves no holes when the permutation is longer` |
| 3 | permutation one short / one long | all cards kept, no holes | [x] covered: `…one short`, `…longer than the zone` |
| 4 | second confirm click while moves run | ignored via `state.confirming` | [x] reasoning: guard set before the first await; picker torn down after callbacks |
| 5 | a move throws | logged, remaining picks still move, callbacks run | [x] covered: `movePicksInOrder keeps moving after one move throws` |
| 6 | origin zone reordered while moveCard awaited | splice uses live index of `movingCard`; card gone → ok:false | [x] reasoning: DOM-coupled module, no node harness; indexOf on the captured object is exact |
| 7 | mirror zone already holds an undefined slot | resolve skips it, card still found | [x] covered: `resolveCardIndex finds a card past an undefined slot …` (3 tests), `hintMatchesAtIndex tolerates …` |
| 8 | the logged sequence end to end | every card resolvable, no holes | [x] covered: `mirror survives the logged shuffle-before-move sequence …` |

## Test plan
Unit: shuffle.test.mjs, card-picker-moves.test.mjs, resolve-card-index.test.mjs additions. Full `pnpm test`.
Manual: 2P game, play Buddy-Buddy Poffin / Ultra Ball / Nest Ball; peer shows both benched Pokémon;
sync log shows move before `shuffleZone`, no `shuffleZone.indices_mismatch`.

## Migration / rollout
n/a: client-only behavior change, no data. Revert = revert the commit.

## Work plan
| Slice | Delivers | Green when |
|---|---|---|
| 1 | all of the above | pnpm test green; targeted eslint clean |

## Deviations (Builder appends here during build)
