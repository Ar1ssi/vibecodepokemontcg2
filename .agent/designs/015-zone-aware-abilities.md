# 015: Zone-aware ability activation

Status: approved (user) — enforcement layer and PR shape each confirmed by the user
Date: 2026-09-19 · Session: S182

## Problem

`listAbilities()` (`shared/engine/rules/attack-window.mjs`) is position-blind by construction: it
documents itself as "usable abilities for a card (active or benched)" and takes no zone. So an
ability printed *"Once during your turn, if this Pokémon is in the Active Spot, you may make your
opponent's Active Pokémon Asleep."* reports `usable: true` from the Bench.

Three layers inherit the mistake, and all three are wrong in the same direction:

1. **Engine** — `listAbilities` says `usable: true`.
2. **Server** — `validateLegality`'s `useAbility` case checks only the once-per-turn flags, so the
   dispatch is accepted.
3. **Panel** — `buildInspectorModel` (design 013) is documented as faithful to the engine, so the
   inspector offers a clickable ability panel on a benched Pokémon that the rules forbid.

Nothing in the printed text is enforced; the ability simply works from anywhere.

Also carried in this PR (user request, same PR): `passiveCostDiscount` in `ability-executors.mjs`
was fixed in `e236cc3`, but that commit was pushed to `worktree-card-inspector` *after* PR #153
merged, so it never reached `main`. This branch is based on the branch tip, so the fix rides along
rather than being cherry-picked. Its defect: any ability text merely mentioning "cost"/"energy"
granted a free cost symbol off every attack.

## Constraints

- `listAbilities` is the shipping primitive the panel trusts; payability/position decisions must not
  be re-derived in the DOM layer (013 model header, rule 1).
- Absence of a zone must keep today's behavior: every existing caller passes no zone, and
  `action-affordances.mjs` calls `listUsableActions` for the **active** card. Default `zone` is
  therefore `'active'` — no caller changes behavior by omission.
- MUST NOT false-positive on the two near-miss phrasings that share the words "Active Spot":
  *"when this Pokémon moves from your Bench to the Active Spot"* (a trigger that fires **on the
  move** and is legal from the Bench) and *"As long as this Pokémon is in the Active Spot, …"*
  (a passive with nothing to activate). A false positive silently disables a legal ability.
- `ability-executors.mjs` imports nothing (verified), so `reduce.mjs` may import it with no cycle.
- No new dependency. No new machine-readable error code (see Options C).

## Current state

| File | Role |
|---|---|
| `shared/engine/rules/attack-window.mjs` | `listAbilities(card, {abilityUsed, rulesEnabled})` → `[{name, text, oncePerTurn, used, usable, reason}]`. Pure. |
| `shared/engine/rules/ability-executors.mjs` | Pure text parsers for ability families; owns `textOf` + `passiveCostDiscount`. No imports. |
| `shared/engine/reduce.mjs` | `validateReferences` (Step 3, instanceId/zone integrity) then `validateLegality` (Step 4, returns `{allowed, reason}`). `case 'useAbility'` lives in both. |
| `client/src/setup/rules/card-inspector-model.mjs` | 013 model; calls `listAbilities({ability: rawAbility}, {abilityUsed, rulesEnabled})` and folds `usable` into the panel descriptor. |

Flow being changed: printed text → `listAbilities.usable` → inspector panel affordance →
`dispatchAuthoritativeUseAbility` → `validateLegality` → effect.

## Options

**A — Enforcement depth.** *(a)* engine only: the primitive is right but the server still accepts a
stale/crafted bench click. *(b)* engine + server: the rule holds, the panel stays wrong-looking.
*(c)* engine + server + panel: one rule, three consistent layers.
**Pick: (c)** — user-approved. The panel is documented as faithful to the engine, so leaving it
offering a forbidden click would be a second defect; and a server-only fix would leave the player
unable to tell why nothing happened.

**B — Predicate breadth.** *(a)* any mention of "active spot": simple, but matches the on-move
trigger and the passive above — it would break legal abilities. *(b)* a restrictive conditional on
this Pokémon's position only: `if this Pokémon is in the Active Spot` / `if this Pokémon is active`.
**Pick: (b)** — user-approved direction. Reuses the exact phrasing list `isPassive` already trusts in
`ability-effects.mjs`, so the two modules agree on what "positional" means. Missing an exotic
wording leaves an ability over-permissive (today's behavior); a false positive breaks a legal
ability, which is strictly worse.

**C — Where the server refuses.** *(a)* a new code in `validateReferences` (`ability_requires_active`):
that function's vocabulary is machine codes the client relays verbatim, and a new one has no
player-facing meaning. *(b)* a `reason` in `validateLegality`'s existing `useAbility` case, next to
`'Ability already used this turn.'`.
**Pick: (b)** — the case already returns human-readable refusals, and "it is not this card's turn to
be used from here" is a legality fact, not reference staleness. No new vocabulary, no client change.

**D — Bench-restricted abilities (`requiresBench`).** *(a)* build the symmetric case. *(b)* skip it.
**Pick: (b)** — searched the corpus: every "on your Bench" occurrence is a **passive** (Tera
immunity, Shadowy Darkness Energy, Stage-2 damage scaling) or damage-scaling text. No *activated*
bench-only ability exists to gate, so `requiresBench` would be unexercised speculation.

## Design

`shared/engine/rules/ability-executors.mjs` — new pure predicate beside the other text parsers:

```js
// A conditional on this Pokémon's own position, not a bare mention of the Active Spot.
const ACTIVE_SPOT_CLAUSE =
  /if this pok[eé]mon is (?:in the active spot|active)\b/;

export function requiresActiveSpot(card) {
  return ACTIVE_SPOT_CLAUSE.test(textOf(card));
}
```

`shared/engine/rules/attack-window.mjs` — `listAbilities` gains an optional zone:

```js
export function listAbilities(card, opts = {}) {
  const { abilityUsed = false, rulesEnabled = true, zone = 'active' } = opts;
  ...
  const offSpot = rulesEnabled && zone !== 'active' && requiresActiveSpot(card);
  // usable: !used && !offSpot
  // reason: used ? 'Already used this turn (once per turn).'
  //              : offSpot ? 'This ability can only be used from the Active Spot.'
  //              : ''
}
```

`used` still wins the `reason` slot (more specific state). `offSpot` is gated on `rulesEnabled` for
parity with `listAttacks`' `onceUsed`.

`shared/engine/reduce.mjs` — inside `validateLegality`'s existing `case 'useAbility'`, after the
once-per-turn check:

```js
if (cardRef.zoneId !== 'active' && requiresActiveSpot(cardRef.card)) {
  return { allowed: false, reason: 'This ability can only be used from the Active Spot.' };
}
```

`client/src/setup/rules/card-inspector-model.mjs` — pass the zone it already receives:

```js
listAbilities({ ability: rawAbility }, { abilityUsed, rulesEnabled, zone })
```

No other model change is needed: `ability.usable` already folds in `abilityInfo.usable`, and
`recede` / `dimLevel` already handle the Bench (`dimLevel` is `'none'` there, which stays correct —
a benched card has no energy problem to report).

## Edge cases & failure modes

| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | card has no ability | `listAbilities` → `[]`; `requiresActiveSpot` → `false` | [x] covered: 'listAbilities: no ability → empty list', 'requiresActiveSpot: absent and malformed cards are false' |
| 2 | malformed / missing ability text | `textOf` falls back through `abilityText`/`text`/`effect` → `''` → `false` | [x] covered: 'requiresActiveSpot: absent and malformed cards are false' |
| 3 | `zone` omitted by an existing caller | defaults `'active'` → identical to today | [x] covered: 'listAbilities: an omitted zone keeps the active-spot behavior' |
| 4 | on-move trigger ("moves from your Bench to the Active Spot") | NOT restricted — no `if`-conditional | [x] covered: 'listAbilities: an on-move trigger is NOT position-restricted' |
| 5 | passive ("As long as this Pokémon is in the Active Spot…") | NOT restricted by this predicate (passives are not activated) | [x] covered: 'listAbilities: a passive naming the Active Spot is NOT position-restricted' |
| 6 | "Pokemon" without the accent | matches (regex allows `e`/`é`) | [x] covered: 'requiresActiveSpot: "Pokemon" without the accent still matches' |
| 7 | benched + already used this turn | `used` reason wins; still unusable | [x] covered: 'listAbilities: a spent once-per-turn ability reports "used", not position' |
| 8 | rules disabled | `offSpot` false → facts shown, actions dropped (013 E18) | [x] covered: 'listAbilities: rules off ignores position' |
| 9 | active-spot ability on the Active | usable, reason `''` | [x] covered: 'listAbilities: a positional ability is refused from the Bench' (active half), 'model: the same positional ability is usable from the active spot (015)' |
| 10 | server: bench dispatch of an active-only ability | `{allowed:false, reason:…}` | [x] covered: 'ability: an Active-Spot ability is refused from the Bench' |
| 11 | server: bench dispatch of a non-positional ability | still allowed | [x] covered: 'ability: a non-positional ability from the Bench is unaffected by the guard' |
| 12 | server: active dispatch of an active-only ability | allowed | [x] covered: 'ability: the same Active-Spot ability is allowed from the Active' |

## Test plan

- **Pure/unit** — `requiresActiveSpot` + `listAbilities` zone matrix in
  `shared/engine/rules/__tests__/rules-extended.test.mjs` (already wired into `pnpm test`).
- **Server** — `shared/engine/__tests__/ability-execution.test.mjs`: a bench `useAbility` for a
  positional ability is refused; the same command from the Active is allowed.
- **Model** — `client/src/setup/rules/__tests__/card-inspector-model.test.mjs`: benched active-only
  ability → `usable:false`, `recede:true`, reason names the Active Spot; the existing Agile test
  (non-positional) must keep passing from the Bench.
- **Manual** — none; all three layers are pure functions reachable from `node --test`.

## Migration / rollout

n/a — no data, schema, or persisted state. `zone` is an additive optional argument, so the change is
backward compatible for every existing caller and reverts by reverting the commit.

## Work plan

| Slice | Delivers | Green when |
|---|---|---|
| 1 | Predicate + zone-aware `listAbilities` + its tests | `rules-extended.test.mjs` green |
| 2 | `validateLegality` refusal + its tests | `ability-execution.test.mjs` green |
| 3 | Model threads `zone` + its tests | `card-inspector-model.test.mjs` green |

## Deviations (Builder appends here during build)

- **D1 — the PR carries more than this design.** The user chose "one PR based on the branch", so
  this branch is based on `worktree-card-inspector` (e236cc3) and the PR's diff against `main` also
  includes the previously-unmerged inspector ability work (`3e7c939`, `fd5680d`, `bfa1cfe`) and the
  `passiveCostDiscount` fix (`e236cc3`). Those commits were reviewed as part of 013; only the
  zone-restriction work described above is new here. Reviewed separately, this design would have
  read as "engine-only, no client threading".
- **D2 — `useVStarGX` was not extended.** Its `validateLegality` case never resolves the card (it
  checks only the VSTAR/GX used flags), so the same guard there would need a new `findCard` lookup
  on a path with no evidence of a positional VSTAR power. Left alone deliberately; filed as an
  ISSUES.md line rather than silently widened.
- **D3 — slice 3 was not slice-sized.** Threading `zone` through the model is a one-word argument,
  so the three slices ran as two real edits plus one trivial one. The plan over-partitioned.
- **D4 — a pre-existing `??` left in place.** `card-inspector-model.mjs` reads
  `reason: abilityInfo.reason ?? null`, which cannot catch the `''` that `listAbilities` returns
  (the same latent bug fixed with `||` for attacks). It is harmless here — the DOM layer tests
  `if (ability.reason)` — so it was left to keep this diff to the fix.

## Verification (Builder)

- Focused proof, all three suites green: `rules-extended.test.mjs` 352 pass,
  `ability-execution.test.mjs` 6 pass, `card-inspector-model.test.mjs` 51 pass.
- Regression proof — each fix reverted in isolation via `git stash push -- <file>`, confirming the
  new tests fail without it:
  - `attack-window.mjs` reverted → 2 failures, both `actual: true, expected: false` (the two
    positional assertions).
  - `reduce.mjs` reverted → `actual: null, expected: 'This ability can only be used from the Active
    Spot.'`
  - `card-inspector-model.mjs` reverted → `true !== false` on the bench usability assertion.
- Full gate: `pnpm test` → **1949 tests, 1949 pass, 0 fail** (1934 before; +15 new).
- `pnpm exec eslint <changed files>` → 10,628 errors, of which 10,612 are `Delete ␍` and the only
  two non-CRLF are the pre-existing unused imports `expandEnergyEntries` / `parseStadiumCostModifier`
  in `attack-window.mjs`. Both are baseline conditions recorded in STATE.md, not introduced here;
  `git diff --numstat` shows 292 insertions / 10 deletions with no whole-file rewrites.
