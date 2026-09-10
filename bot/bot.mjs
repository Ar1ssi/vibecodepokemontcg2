// Design 004 slice 5: the never-crash scaffold, ported from the Kaggle repo's
// agent.py:682 shape. A scorer bug (or a scorer that returns something not in
// `options`) must never stop the soak — it degrades to `legalFallback` instead.
// Pure Node, no Playwright/DOM import: this file only ever sees the plain JSON
// `{ ...observe(), options: await options() }` object the runner assembles.

// `pass`/`end` are the two "do nothing" kinds seen across the option enumerator
// (e2e-options.mjs) and the wider client action vocabulary; legalFallback avoids
// both when any other legal option exists, since a soak that always ends its
// turn never exercises anything.
const NO_OP_KINDS = new Set(['pass', 'end']);

/**
 * First non-pass/end option, or the pass/end option if that's all there is.
 * Never returns undefined for a non-empty `options` array.
 * @param {Array<object>} options
 * @returns {object}
 */
export function legalFallback(options) {
  const active = options.find((option) => !NO_OP_KINDS.has(option?.kind));
  if (active) return active;
  return options.find((option) => NO_OP_KINDS.has(option?.kind)) || options[0];
}

/**
 * @param {object} observation  `{ ...observe(), options: [...] }` — see design 004 slice 6.
 * @param {{ choose(observation: object): object|null }} scorer
 * @param {{ onFallback?: (reason: 'no-options'|'scorer-null'|'scorer-threw', detail?: unknown) => void }} [hooks]
 *   Optional fallback logger for the runner (design: "log every fallback — a fallback is a
 *   finding, not a shrug"). Never required — decide() never throws either way.
 * @returns {object} a legal option
 */
export function decide(observation, scorer, { onFallback } = {}) {
  const options = Array.isArray(observation?.options) ? observation.options : [];
  if (!options.length) return { kind: 'pass' };

  let choice;
  try {
    choice = scorer?.choose ? scorer.choose(observation) : null;
  } catch (err) {
    onFallback?.('scorer-threw', err);
    return legalFallback(options);
  }

  if (choice && options.includes(choice)) return choice;
  onFallback?.(choice ? 'scorer-invalid' : 'scorer-null', choice);
  return legalFallback(options);
}
