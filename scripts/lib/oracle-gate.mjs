// Pure gate over oracle rows (oracle-harness.mjs): per-family observed-execution rates, ratcheted
// against a committed baseline so a silent executor no-op fails the audit (I113).

/**
 * Changes any damaging attack causes, so they prove nothing about the family's own effect:
 * the hit itself, a KO and its fallout (discard, promotion, Prize taken), and `ability-used`,
 * which fires even when the ability then changes nothing.
 */
export const BASE_TAGS = new Set([
  'opp:active+dmg',
  'ko',
  'opp:active->discard',
  'opp:attached->discard',
  'opp:bench->active',
  'opp:active-changed',
  'opp:deck->hand',
  'own:prizes->hand',
  'opp:heal',
  'ability-used',
]);

/** A row shows its family at work: a non-base state change, or damage dealt ≠ the printed base. */
export function rowObserved(row) {
  if ((row.tags || []).some((t) => !BASE_TAGS.has(t))) return true;
  if (row.kind !== 'attack') return false;
  return (row.dealt || []).some((d) => d != null && d !== row.printedBase);
}

/** `{ 'attack:<family>': { n, observed } }` over all rows. */
export function familyRates(rows) {
  const rates = {};
  for (const row of rows) {
    const key = `${row.kind}:${row.family}`;
    const r = (rates[key] ??= { n: 0, observed: 0 });
    r.n++;
    if (rowObserved(row)) r.observed++;
  }
  return rates;
}

const rate = (r) => (r.n ? r.observed / r.n : 0);

/**
 * Compares rates with the baseline (same shape).
 * Failures: a baselined family's rate dropped; an executed family (per the lists) was never
 * observed and is not in `blind` (Map family → why the oracle cannot see it).
 * Warnings: families new since the baseline, families gone from the corpus, blind families.
 */
export function checkGate(
  rates,
  baseline,
  {
    executedAttack = new Set(),
    executedAbility = new Set(),
    blind = new Map(),
  } = {}
) {
  const failures = [];
  const warnings = [];
  for (const [key, base] of Object.entries(baseline)) {
    const now = rates[key];
    if (!now) {
      warnings.push(`${key}: in baseline but no rows now`);
      continue;
    }
    if (rate(now) < rate(base)) {
      failures.push(
        `${key}: observed ${now.observed}/${now.n} < baseline ${base.observed}/${base.n}`
      );
    }
  }
  for (const key of Object.keys(rates))
    if (!baseline[key]) warnings.push(`${key}: not in baseline`);
  const executed = [
    ...[...executedAttack].map((f) => `attack:${f}`),
    ...[...executedAbility].map((f) => `ability:${f}`),
  ];
  for (const key of executed) {
    const now = rates[key];
    if (!now || now.observed > 0) continue;
    const why = blind.get(key);
    if (why) warnings.push(`${key}: listed executed, oracle-blind (${why})`);
    else
      failures.push(
        `${key}: listed executed but 0/${now.n} rows show an effect`
      );
  }
  return { failures, warnings };
}
