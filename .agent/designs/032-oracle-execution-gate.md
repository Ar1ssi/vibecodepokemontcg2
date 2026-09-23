# 032: Oracle execution gate (I113)
Status: shipped
Date: 2026-09-23 · Session: S269

## Problem
`ability-audit.mjs` (EXECUTED_FAMILIES, "pctExecuted 99") and `attack-false-positive-audit.mjs`
(EXECUTED_ATTACK_FAMILIES) trust hand-kept family lists; `audit-all-pokemon` counts only thrown
errors. A silent executor no-op passes every gate. The S265 state-diff oracle
(`.agent/scratch/cov/oracle.mjs`) catches no-ops but is a throwaway, has no pass/fail, and cannot
see damage amounts, so damage-scaling families (per-energy, per-prize, conditional-damage,
extra-by-type) are only verified by reading code.

## Constraints
- Full corpus run is ~3 min (12918 entries × 8 seeds): too slow for `pnpm test`; runs as
  `pnpm audit:oracle`. The pure parts (tags, damage capture, gate compare) are unit-tested in `pnpm test`.
- Deterministic: seeded RNG, fixed board, instance ids reset per run — so the ratchet can be exact.
- No new dependency. Corpus: tracked `out/pkmn-pokemon-cards.json`.

## Current state
- `.agent/scratch/cov/oracle.mjs` — board builder, snapshot, diffTags, choice auto-resolver, corpus loop.
- `.agent/scratch/cov/family-exec.mjs` — per-family "effect beyond plain damage" rate (BASE_TAGS set).
- `ability-audit.mjs:80` EXECUTED_FAMILIES (module runs main() on import → not importable).
- `attack-false-positive-audit.mjs:21` EXECUTED_ATTACK_FAMILIES / PARTIAL_ATTACK_FAMILIES (runs main() on import).
- Engine events already carry damage: `attackExecuted.damage` (dealt), `attackDamageScaled{base,total}` (reduce.mjs).

## Options
1. Gate rule. A: fixed threshold per family (e.g. ≥50%) — arbitrary, many real families sit below
   it because the fixed board can't trigger every condition. B: ratchet against a committed baseline
   — catches any regression exactly, needs `--update-baseline` on legit changes. **Pick B** (user-approved),
   plus a hard rule: a family on an EXECUTED list with 0 observed rows fails unless listed in
   ORACLE_BLIND_FAMILIES with a reason (passives can't be observed through useAbility).
2. Where the family lists live. A: keep in the audit scripts and guard main() — two scripts to
   touch anyway, lists stay split. B: move to `scripts/lib/executed-families.mjs`, both audits import.
   **Pick B**: one source the gate and the audits share.
3. Damage signal. A: `attackDamageScaled` event only — misses coin "does nothing" paths. B: record
   dealt damage per seed and compare with the printed base number. **Pick B**: dealt covers scaled totals and coin zero-outs alike.

## Design
- `scripts/lib/oracle-harness.mjs`: `buildState(holder, zone)`, `snapshot(state)`,
  `diffTags(before, after, events)`, `pickSelection(pc)`, `runOnce/runAll(buildCmd, holder, zone, seeds)`
  → `{ tags[], errors[], eventTypes[], dealt[] }`, `oracleCorpus(corpus, { seeds })` → rows,
  `printedBase(damageText)`.
  Attack row adds `printedBase`, `dealt` (per-seed dealt damage from attackExecuted).
- `scripts/lib/oracle-gate.mjs` (pure): `BASE_TAGS`; `rowObserved(row)` = any tag outside BASE_TAGS,
  or (attack) some dealt ≠ printedBase; `familyRates(rows)` → `{ 'attack:<f>': {n, observed}, 'ability:<f>': … }`;
  `checkGate(rates, baseline, { executedAttack, executedAbility, blind })` → `{ failures[], warnings[] }`:
  fail when a baselined family's observed/n drops below baseline; fail when an executed family has
  observed 0 and is not blind; warn on families missing from baseline (new) and on blind families.
- `scripts/lib/executed-families.mjs`: EXECUTED_ATTACK_FAMILIES, PARTIAL_ATTACK_FAMILIES,
  EXECUTED_ABILITY_FAMILIES, ORACLE_BLIND_FAMILIES (Map family → reason).
- `scripts/audit-oracle.mjs`: run corpus, write `out/oracle-rows.json`, print table, compare with
  `scripts/oracle-baseline.json`; `--update-baseline` rewrites it; exit 1 on failures.
- `package.json`: `audit:oracle`; test glob adds `"scripts/**/*.test.mjs"`.

## Edge cases & failure modes
| # | Case | Expected behavior | Covered by |
|---|---|---|---|
| 1 | empty rows / family n=0 | rate 0, no divide-by-zero; absent from rates | [x] covered: familyRates counts rows…; executed family with no rows… |
| 2 | baseline file missing or malformed | exit 1 with message telling to run --update-baseline | [x] reasoning: readBaseline() returns error → main exits 1 (audit-oracle.mjs); run before baseline existed printed it |
| 3 | rate equal to baseline / one row lower | equal passes; lower fails | [x] covered: checkGate passes an unchanged rate and fails a drop of one row |
| 4 | family in baseline but gone from corpus/classifier | warning, not failure | [x] covered: checkGate warns on families new since, or gone from, the baseline |
| 5 | engine throws / returns error for an entry | recorded in row.errors, run continues | [x] covered: engine rejections and throws are recorded as errors |
| 6 | printed damage blank or "30×"/"10+" | printedBase 0 / 30 / 10; dealt ≠ base → observed | [x] covered: printedBase reads…; damage that differs…; per-Energy attack… |
| 7 | executed family observed 0, not blind | failure; blind → warning | [x] covered: an executed family never observed fails… |
| 8 | pending choice loop never ends | guard stops after 12 choices (existing) | [x] reasoning: MAX_CHOICES loop bound in runOnce; full corpus run terminates (12918 rows) |

## Test plan
Unit (`scripts/lib/*.test.mjs`, in `pnpm test`): printedBase parsing, diffTags on hand-built
snapshots, runOnce on one real attack (flat 30 → dealt 30; "does 20 more for each Energy" → dealt ≠ base),
familyRates/checkGate rows 1-4, 7. Manual: full `pnpm audit:oracle` run, then baseline written,
then a second run passes.

## Migration / rollout
n/a: tooling only. Revert = delete the new files and the package.json lines.

## Work plan
| Slice | Delivers | Green when |
|---|---|---|
| 1 | executed-families.mjs + harness + gate libs with tests; audits import lists | pnpm test green |
| 2 | audit-oracle.mjs, baseline, package.json script; full run | audit passes twice |

## Deviations
- Baseline run found 8 executed families with 0 observed rows; all board/API limits, registered in ORACLE_BLIND_FAMILIES with reasons (6 passive ability families; Alakazam ex bench-attack; Poliwrath {D} condition).
- Rows file goes to out/oracle-rows.json only with --rows (6 MB, untracked).
