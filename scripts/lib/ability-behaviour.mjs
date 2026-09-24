// Behaviour classes for printed abilities (design 034 slice 7). Each oracle ability row
// (oracle-harness.mjs) is classed by what `useAbility` would run — the same step plan the engine
// builds (`resolveAbilitySteps`) — and by whether the run changed the board (`abilityObserved`).
// Per-family class counts are ratcheted against a committed baseline, so an ability that stops
// working, or stops being read, fails the audit instead of drifting back in silently.
import { resolveAbilitySteps } from '../../shared/engine/effects/ability.mjs';
import { isExecutableStepType } from '../../shared/engine/effects/executor.mjs';
import { isActivatedAbility } from '../../shared/engine/rules/ability-executors.mjs';
import { passiveReads } from './ability-passive-probe.mjs';

/**
 * runs      activated; the board changed and every planned step has an executor
 * partial   activated; the board changed but a planned step has no executor
 * dead      activated; no state change beyond the base tags (a no-op ability button)
 * consumed    passive (useAbility has nothing to run) and an engine passive reader answers
 *             differently with the text printed than without it (ability-passive-probe.mjs)
 * unconsumed  passive and no probed reader reads it: parsed, but nothing enforces it
 * unparsed  neither the ability parser nor the effect templates read the text
 */
export const BEHAVIOUR_CLASSES = [
  'runs',
  'partial',
  'dead',
  'consumed',
  'unconsumed',
  'unparsed',
];

/**
 * What useAbility would run for `text`: `{ activated, unexecutable }`, or `{ activated: false,
 * reason }` with reason 'passive' | 'unparsed'. `unexecutable` lists planned step types with no
 * executor handler. A text the server's activation gate rejects (`isActivatedAbility`: triggers,
 * locks, "as long as") is passive whatever it plans — the oracle runs with rules off, so it would
 * otherwise "run" effects no rules-mode player can activate.
 */
export function abilityPlan(text, selfName) {
  const { steps, parsedSteps } = resolveAbilitySteps(text, { selfName });
  if (steps.length === 0) {
    return {
      activated: false,
      reason: parsedSteps.length ? 'passive' : 'unparsed',
    };
  }
  if (!isActivatedAbility({ abilities: [{ text }] }, 0)) {
    return { activated: false, reason: 'passive' };
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

/** The passive readers consuming a row's text (see ability-passive-probe.mjs). */
export function rowPassiveReads(row) {
  return passiveReads(row.text, { name: row.card, abilityName: row.name, abilityType: row.abilityType });
}

/**
 * One oracle ability row classed: `{ behaviour, unexecutable, reads }` — the planned steps with
 * no executor, and for a passive row the probe labels of the readers consuming it.
 */
export function classifyRow(row) {
  const plan = abilityPlan(row.text, row.card);
  if (!plan.activated && plan.reason === 'passive') {
    const reads = rowPassiveReads(row);
    return { behaviour: reads.length ? 'consumed' : 'unconsumed', unexecutable: [], reads };
  }
  if (!plan.activated) return { behaviour: plan.reason, unexecutable: [], reads: [] };
  const behaviour = !abilityObserved(row) ? 'dead' : plan.unexecutable.length ? 'partial' : 'runs';
  return { behaviour, unexecutable: plan.unexecutable, reads: [] };
}

/** The behaviour class of one oracle ability row. */
export function behaviourClass(row) {
  return classifyRow(row).behaviour;
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
// consumed move both ways legitimately (partial → runs, a passive now activated), so they are
// reported but not gated; a drop in runs catches runs → partial, and a rise in unconsumed
// catches a passive reader that stopped reading its text.
const RATCHETS = [
  ['runs', 'up'],
  ['dead', 'down'],
  ['unconsumed', 'down'],
  ['unparsed', 'down'],
];

/**
 * Compares per-family counts with the baseline (same shape).
 * Failures: a family's runs share fell, or its dead / unconsumed / unparsed share rose.
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

/** Share of a family's rows the gate sees working: activated and running, or passive and read. */
export function worksShare(c) {
  return c?.n ? ((c.runs || 0) + (c.consumed || 0)) / c.n : 0;
}

/** The works share a family needs before `EXECUTED_ABILITY_FAMILIES` may claim it (D128). */
export const EXECUTED_CLAIM_SHARE = 0.5;

/**
 * Checks the executed-family claims against the gate's evidence (D128).
 * Failures: a claimed family with no rows, or whose works share is under the threshold.
 * Warnings: an unclaimed family that meets it (a claim the evidence now supports).
 */
export function checkExecutedClaims(counts, claimed, threshold = EXECUTED_CLAIM_SHARE) {
  const failures = [];
  const warnings = [];
  for (const family of claimed) {
    const c = counts[family];
    if (!c) failures.push(`${family}: claimed executed but has no ability rows`);
    else if (worksShare(c) < threshold) {
      failures.push(
        `${family}: claimed executed but only ${(c.runs || 0) + (c.consumed || 0)}/${c.n} rows run or are read`
      );
    }
  }
  for (const [family, c] of Object.entries(counts)) {
    if (!claimed.has(family) && worksShare(c) >= threshold) {
      warnings.push(`${family}: ${(c.runs || 0) + (c.consumed || 0)}/${c.n} rows work — not claimed executed`);
    }
  }
  return { failures, warnings };
}
