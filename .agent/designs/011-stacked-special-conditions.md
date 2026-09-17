# 011: Stacked special conditions (audit A-1)
Status: shipped
Date: 2026-09-17 · Session: S169

## Problem
Server cards hold one `specialCondition` string. Poisoned and Burned are markers that coexist with
each other and with one of Asleep/Confused/Paralyzed, but `addSpecialCondition` overwrites and
`resolveCheckup` runs an `else if` chain, so adding Asleep to a Poisoned Pokémon wipes the Poison and
only one condition ever resolves at Checkup (server-authority-and-rules-engine-audit.md A-1). The
client model (status.mjs) already allows stacking since S168 (A-2), so client and server disagree.

## Constraints
- Rules mode, `SERVER_AUTHORITATIVE=1` only; legacy DOM path (`image.specialCondition`) untouched (S137).
- Command wire format stays backward compatible: `addSpecialCondition`/`updateSpecialCondition`/
  `removeSpecialCondition` keep `{ instanceId, condition }` (commands.mjs SPECIAL_CONDITIONS).
- State with no Poison/Burn must stay byte-identical to today (views and `hashStateZones` carry cards
  verbatim; same reasoning as D43's deleted `prizesOwed` key).
- Client sync-check hashes the view-backed arrays with the same `hashCardList`, so the hash must
  change identically on both sides.

## Current state
- `shared/engine/reduce.mjs` — `handleKnockout` clears `specialCondition` on discard; `resolveCheckup`
  Poison/Burn/Asleep/Paralyzed else-if chain; attack/retreat legality read Asleep/Paralyzed; attack
  reads Confused; retreat apply clears; add/update/remove commands set/clear the single field.
- `shared/engine/effects/executor.mjs` — switch (`:644`) and gust (`:716`) clear on the Pokémon moving to
  the Bench; `thenCondition` (`:724`) and `applyStatus` (`:913`) set; heal-with-cure (`:817`, `:830`) clears.
- `shared/engine/effects/trainer-steps.mjs` — swap (`:800`) moves the field to the incoming card;
  `poisonActive` (`:1140`) sets Poisoned.
- `shared/engine/zones/zone-hash.mjs` — `hashCardCounters` fingerprints the condition.
- `client/src/setup/netcode/view-diff.mjs` — `hasCardChanged` compares the condition.
- `client/src/setup/netcode/apply-view.js` — `reconcileSpecialConditionOverlay` draws one marker in
  `img.specialCondition`; `NO_OVERLAYS` clears overlays on non-visible stack cards.
- `shared/engine/zones/board-snapshot.mjs`, `card-state.mjs` — legacy DOM snapshot path; out of scope.

## Options
**Data model.**
A: `specialConditions: string[]` replacing the field — one field, but every reader and writer changes
   (~40 sites) and the empty-array default changes every serialized card.
B: keep `specialCondition` for the rotation condition (Asleep/Confused/Paralyzed); add `poisoned: true`
   and `burned: true` marker keys, present only while set — rotation readers are untouched, mirrors
   the physical game, and unaffected states stay byte-identical.
Pick **B** (user choice, S169).

**Marker UI.** Separate markers (one per condition, up to 3) vs one combined `P+B` marker. Pick
**separate** (user choice): readable at a glance and reuses the existing marker style per code.

**Where condition logic lives.** Inline edits at each site vs a small shared helper module. Pick a
helper, `shared/engine/rules/special-conditions.mjs`: ~10 writers need the same "route Poison/Burn to
markers, rotation to the field, clear all" rule; one implementation keeps them consistent.

## Design
New module `shared/engine/rules/special-conditions.mjs` (pure, mutates the card passed in):
- `MARKER_KEYS = { Poisoned: 'poisoned', Burned: 'burned' }`, `ROTATION_CONDITIONS = ['Asleep','Confused','Paralyzed']`.
- `addCondition(card, condition)` — Poisoned/Burned → `card[key] = true`; rotation → `card.specialCondition = condition`
  (replaces the previous rotation condition only). Unknown condition → no-op, returns false.
- `removeCondition(card, condition)` — marker → `delete card[key]`; rotation → null only if it matches.
- `clearConditions(card)` — `specialCondition = null`, delete both marker keys.
- `hasCondition(card, condition)` → boolean. `hasAnyCondition(card)` → boolean.
- `listConditions(card)` → array in Checkup order `['Poisoned','Burned', <rotation>]`.
- `copyConditions(from, to)` — clear `to`, then copy field + markers.
Legacy data: a card whose `specialCondition` is `'Poisoned'`/`'Burned'` (old saved state, replay of old
commandLog) is read as that marker by `hasCondition`/`listConditions`, and `addCondition`/`clear`
normalize it (move it into the marker key) so it cannot persist.

Reducer:
- `addSpecialCondition` → `addCondition`. `updateSpecialCondition` → rotation condition: replace rotation;
  marker: add marker; `null`: `clearConditions`. `removeSpecialCondition` → `payload.condition` given:
  `removeCondition`; absent: `clearConditions`. Event `specialConditionUpdated` gains
  `conditions: listConditions(card)` alongside the existing `condition`.
- `resolveCheckup`, per player's Active, in order: Poison (+10), Burn (+20, heads cures Burn), Asleep
  (heads wakes), Paralyzed (cleared at end of its owner's turn). One KO check after all damage
  (a Poison+Burn Pokémon at 30 HP left takes both, then is Knocked Out once).
- `handleKnockout`, retreat apply → `clearConditions`.
Effects: executor switch/gust/cure → `clearConditions`; `thenCondition`/`applyStatus` → `addCondition`;
trainer-steps swap → `copyConditions` then `clearConditions(outgoing)`; `poisonActive` → `addCondition`.
Client: `hashCardCounters` appends `P`/`B` only when a marker is set (unchanged string otherwise);
`hasCardChanged` also compares `poisoned`/`burned`; apply-view draws `img.poisonMarker` and
`img.burnMarker` (same style, codes `P`/`B`) stacked below the rotation marker, packed top-down in
Checkup-independent display order rotation → Poison → Burn; `NO_OVERLAYS` clears them too.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | no conditions | card has no marker keys; hash/view byte-identical to pre-change | [x] stacked-conditions.test.mjs: a card without markers hashes exactly as before markers existed |
| 2 | unknown condition string reaches helper | no-op, returns false (commands.mjs already rejects on the wire) | [x] stacked-conditions.test.mjs: conditions: an unknown condition is ignored |
| 3 | Poisoned+Burned at 30 HP left, Checkup | +10 then +20, one KO, one prize entitlement | [x] stacked-conditions.test.mjs: Checkup: combined Poison and Burn damage Knocks Out once and awards one prize |
| 4 | same condition added twice | idempotent, no duplicate marker | [x] stacked-conditions.test.mjs: conditions: adding the same condition twice is idempotent |
| 5 | Asleep added to Poisoned+Burned | all three held; Checkup applies all | [x] stacked-conditions.test.mjs: addSpecialCondition: Asleep on a Poisoned Pokémon keeps the Poison; Checkup: Poisoned + Burned + Asleep all resolve |
| 6 | Confused replaces Asleep | rotation replaced, markers kept | [x] stacked-conditions.test.mjs: conditions: a new rotation condition replaces the old one and keeps both markers |
| 7 | removeSpecialCondition with / without `condition` | removes only that one / clears all | [x] stacked-conditions.test.mjs: removeSpecialCondition: a named condition removes only that one; no name clears all |
| 8 | retreat, switch, gust, KO, heal-with-cure | all conditions and markers cleared | [x] stacked-conditions.test.mjs: retreat clears…; effect switch…; effect heal with cure…; Checkup KO test (discarded card). Gust (`switchOpponentOut`) is the same one-line `clearConditions` call as switch, untested |
| 9 | legacy card with `specialCondition: 'Poisoned'` | treated as Poisoned; normalized on next write | [x] stacked-conditions.test.mjs: conditions: a legacy specialCondition "Poisoned" reads as the marker and is normalized on write |
| 10 | Burn heads at Checkup while Poisoned | Burn cleared, Poison stays | [x] stacked-conditions.test.mjs: Checkup: Burn cured on heads leaves the Poison in place |
| 11 | dependency fails / concurrency | struck: pure synchronous reducer, no I/O | n/a |
| 12 | view marker removed when condition cleared | poison/burn overlay nodes removed | [x] apply-view.test.mjs: Row 21: stacked conditions draw one marker each…; Row 21: overlays removed from the zone element when the card itself leaves the registry |

## Test plan
Unit: `special-conditions.test.mjs` (helper rows 2, 4, 6, 9); reducer tests in
`stacked-conditions.test.mjs` (rows 1, 3, 5, 7, 8, 10); client `apply-view` overlay + `view-diff` +
zone-hash tests (rows 1, 12). Existing paralysis-checkup / asleep-attack suites must stay green.
Manual: user eyeballs markers in a live 2P game (CSS is user-checked per memory).

## Migration / rollout
No persisted-data migration: rooms are in-memory. Legacy string values are normalized on read/write
(row 9). Revert path: revert the slice commits; states without Poison/Burn are identical either way.

## Work plan
| Slice | Delivers | Green when |
|---|---|---|
| 1 | helper module + reducer (commands, Checkup, KO, retreat) | helper + reducer tests, full suite |
| 2 | executor + trainer-steps writers/clearers | effect tests, full suite |
| 3 | zone-hash, view-diff, apply-view markers | client tests, full suite |

## Deviations (Builder appends here during build)
- `applyStatus` with a `conditions` list (Dangerous Laser: Burned + Confused) now applies every listed
  condition; before, only the first landed because the model could hold one. Test: effect applyStatus.
- `removeSpecialCondition` shape now validates an optional `condition` against SPECIAL_CONDITIONS.
- Existing tests that asserted the old single-string storage were updated: trainer-steps.test.mjs
  (Janine's Secret Art → `poisoned: true`), apply-view.test.mjs Row 21 (marker slots).
- full-view.js hide/show and preview-card.mjs OVERLAY_SLOTS learn the two new slots so full view
  hides the markers and double-click on a marker resolves to its card.
