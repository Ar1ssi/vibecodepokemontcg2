// Behaviour classes for printed abilities (design 034 slice 7). Each oracle ability row
// (oracle-harness.mjs) is classed by what `useAbility` would run — the same step plan the engine
// builds (`resolveAbilitySteps`) — and by whether the run changed the board (`abilityObserved`).
// Per-family class counts are ratcheted against a committed baseline, so an ability that stops
// working, or stops being read, fails the audit instead of drifting back in silently.
import { resolveAbilitySteps } from '../../shared/engine/effects/ability.mjs';
import { isExecutableStepType } from '../../shared/engine/effects/executor.mjs';

/**
 * runs      activated; the board changed and every planned step has an executor
 * partial   activated; the board changed but a planned step has no executor
 * dead      activated; no state change beyond the base tags (a no-op ability button)
 * passive   every parsed step is continuous/triggered — useAbility has nothing to run
 * unparsed  neither the ability parser nor the effect templates read the text
 */
export const BEHAVIOUR_CLASSES = [
  'runs',
  'partial',
  'dead',
  'passive',
  'unparsed',
];

/**
 * What useAbility would run for `text`: `{ activated, unexecutable }`, or `{ activated: false,
 * reason }` with reason 'passive' | 'unparsed'. `unexecutable` lists planned step types with no
 * executor handler.
 */
export function abilityPlan(text, selfName) {
  const { steps, parsedSteps } = resolveAbilitySteps(text, { selfName });
  if (steps.length === 0) {
    return {
      activated: false,
      reason: parsedSteps.length ? 'passive' : 'unparsed',
    };
  }
  const unexecutable = [
    ...new Set(
      steps.map((s) => s.type).filter((t) => !isExecutableStepType(t))
    ),
  ].sort();
  return { activated: true, unexecutable };
}

/**
 * An ability row changed the board. Unlike the oracle's attack rule (oracle-gate.mjs BASE_TAGS),
 * damage on the opponent's Active and its KO fallout count: an ability deals no attack damage, so
 * they are its own effect. Only `ability-used` (fires even when nothing follows) is noise.
 */
export function abilityObserved(row) {
  return (row.tags || []).some((t) => t !== 'ability-used');
}

/** The behaviour class of one oracle ability row. */
export function behaviourClass(row) {
  const plan = abilityPlan(row.text, row.card);
  if (!plan.activated) return plan.reason;
  if (!abilityObserved(row)) return 'dead';
  return plan.unexecutable.length ? 'partial' : 'runs';
}

/** `{ <family>: { n, runs, partial, dead, passive, unparsed } }` over classed rows. */
export function classCounts(classedRows) {
  const counts = {};
  for (const { family, behaviour } of classedRows) {
    const c = (counts[family] ??= {
      n: 0,
      ...Object.fromEntries(BEHAVIOUR_CLASSES.map((k) => [k, 0])),
    });
    c.n++;
    c[behaviour]++;
  }
  return counts;
}

/** Sums every family's counts into one totals row. */
export function totalCounts(counts) {
  const total = {
    n: 0,
    ...Object.fromEntries(BEHAVIOUR_CLASSES.map((k) => [k, 0])),
  };
  for (const c of Object.values(counts)) {
    total.n += c.n;
    for (const k of BEHAVIOUR_CLASSES) total[k] += c[k] || 0;
  }
  return total;
}

const share = (c, k) => (c.n ? (c[k] || 0) / c.n : 0);

// A share that may only rise (`up`) or only fall (`down`) against the baseline. partial and
// passive move both ways legitimately (partial → runs, a mis-read now read as passive), so
// they are reported but not gated; a drop in runs catches runs → partial.
const RATCHETS = [
  ['runs', 'up'],
  ['dead', 'down'],
  ['unparsed', 'down'],
];

/**
 * Compares per-family counts with the baseline (same shape).
 * Failures: a family's runs share fell, or its dead / unparsed share rose.
 * Warnings: families new since the baseline, families gone from the corpus.
 */
export function checkBehaviourGate(counts, baseline) {
  const failures = [];
  const warnings = [];
  for (const [family, base] of Object.entries(baseline)) {
    const now = counts[family];
    if (!now) {
      warnings.push(`${family}: in baseline but no rows now`);
      continue;
    }
    for (const [k, direction] of RATCHETS) {
      const worse =
        direction === 'up'
          ? share(now, k) < share(base, k)
          : share(now, k) > share(base, k);
      if (worse) {
        failures.push(
          `${family}: ${k} ${now[k]}/${now.n} vs baseline ${base[k]}/${base.n}`
        );
      }
    }
  }
  for (const family of Object.keys(counts))
    if (!baseline[family]) warnings.push(`${family}: not in baseline`);
  return { failures, warnings };
}
