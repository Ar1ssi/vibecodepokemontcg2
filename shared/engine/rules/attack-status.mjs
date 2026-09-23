/**
 * @file Special-Condition clauses an attack prints (design 036 A2).
 *
 * The reducer used to resolve statuses through `classifyAttackEffect`'s family plus a
 * coin-gate guard that bailed out when BOTH an "If heads" and an "If tails" status clause
 * existed — so the 73 dual-branch attacks applied neither branch. This module reads the
 * printed clauses directly:
 *
 *   parseAttackStatusBranches(text, { selfName }) → [{ when, target, statuses }]
 *   statusesFromBranches(branches, { coin, headsCount, flips }) → { defenderConditions, attackerConditions }
 *
 * `when` is 'always', 'heads', 'tails', { firstFlip:'heads'|'tails' }, { headsAtLeast:n },
 * { headsExactly:n }, { tailsAtLeast:n } or { allHeads:true }. Threshold chains
 * ("if 1 / if 2 / if all of them are heads") are exclusive: only the highest matching
 * clause's statuses apply, so a 2-heads flip does not also apply the 1-head status.
 *
 * The target comes from the status clause's own subject: "your opponent's Active Pokémon"
 * (the defender) unless the clause says "this Pokémon" (the attacker, after the parser folds
 * the attacker's own name into it); a clause naming both applies to both. A conditional
 * sentence that does not match one of the known coin/threshold gates applies NOTHING —
 * "if …" wordings this parser cannot evaluate must not leak in as unconditional statuses.
 *
 * Unknown wording returns [] (the legacy family detection still covers a bare "… is Poisoned"
 * defender wording). Pure: no state, no randomness.
 */

import { normalizeAttackText } from './attack-steps.mjs';
import { classifyAttackEffect } from './attack-effects.mjs';

const STATUS_WORDS = {
  asleep: 'Asleep',
  paralyzed: 'Paralyzed',
  poisoned: 'Poisoned',
  burned: 'Burned',
  confused: 'Confused',
};
const STATUS_RE = Object.keys(STATUS_WORDS).join('|');
const VERB_STATUS = {
  paralyze: 'Paralyzed',
  poison: 'Poisoned',
  burn: 'Burned',
  confuse: 'Confused',
};

const properStatus = (word) => STATUS_WORDS[String(word || '').toLowerCase()] || null;

// Leading coin/threshold gate of a status sentence. Order matters: the specific wordings must
// come before the bare "if N of them is heads" form. Anything starting with "if " that no gate
// matches is skipped, never treated as unconditional.
const GATES = [
  [/^if heads?,?\s+/, () => 'heads'],
  [/^if tails,?\s+/, () => 'tails'],
  [/^if (?:the )?first flip is tails,?\s+/, () => ({ firstFlip: 'tails' })],
  [/^if (?:the )?first coin is (heads|tails),?\s+/, (m) => ({ firstFlip: m[1] })],
  [/^if all (?:of them )?are heads,?\s+/, () => ({ allHeads: true })],
  [/^if at least (\d+) of them are heads,?\s+/, (m) => ({ headsAtLeast: Number(m[1]) })],
  [/^if (\d+) or more (?:of them )?(?:are|is) heads,?\s+/, (m) => ({ headsAtLeast: Number(m[1]) })],
  [/^if you get (\d+) or more heads,?\s+/, (m) => ({ headsAtLeast: Number(m[1]) })],
  [/^if any of them (?:is|are) heads,?\s+/, () => ({ headsAtLeast: 1 })],
  [/^if (?:either|1 or both) of them (?:is|are) heads,?\s+/, () => ({ headsAtLeast: 1 })],
  [/^if both (?:of them )?are heads,?\s+/, () => ({ headsAtLeast: 2 })],
  [/^if (?:either|1 or both) of them (?:is|are) tails,?\s+/, () => ({ tailsAtLeast: 1 })],
  [/^if both (?:of them )?are tails,?\s+/, () => ({ tailsAtLeast: 2 })],
  [/^if only (\d+) (?:of them )?(?:is|are) heads,?\s+/, (m) => ({ headsExactly: Number(m[1]) })],
  [/^if (\d+) of them (?:is|are) heads,?\s+/, (m) => ({ headsExactly: Number(m[1]) })],
];

/** The gate at the start of a sentence, or null. */
function sentenceGate(sentence) {
  for (const [re, build] of GATES) {
    const m = re.exec(sentence);
    if (m) return { when: build(m), length: m[0].length };
  }
  return null;
}

const SUBJECT = `(?:this pokémon|your opponent's active pokémon)`;
// One or more status nouns joined by "and" / "or" / commas ("Burned, Paralyzed, and Poisoned").
const STATUS_LIST = `(?:'?(?:${STATUS_RE})'?)(?:\\s*(?:,\\s*(?:and|or)?\\s*|and\\s+|or\\s+)'?(?:${STATUS_RE})'?)*`;
const BOTH_RE = new RegExp(`both (${SUBJECT}) and (${SUBJECT}) (?:is|are) (?:now|also) (${STATUS_LIST})`);
const NOW_RE = new RegExp(`(${SUBJECT}) (?:is|are) (?:now|also) (${STATUS_LIST})`);
const PUT_RE = new RegExp(`put (${SUBJECT}) to sleep`);
const VERB_RE = new RegExp(`\\b(paralyze|poison|burn|confuse) (${SUBJECT})`);

const statusList = (text) => [
  ...new Set((String(text || '').match(new RegExp(STATUS_RE, 'g')) || []).map(properStatus).filter(Boolean)),
];
const targetOf = (subject) => (/this pokémon/.test(subject) ? 'attacker' : 'defender');

/**
 * The status application inside a sentence: `{ target, statuses }`, or null when the
 * sentence does not apply one (conditions like "is still asleep" are not applications).
 */
function statusesIn(sentence) {
  const text = String(sentence || '');
  const both = BOTH_RE.exec(text);
  if (both) {
    const statuses = statusList(both[3]);
    if (statuses.length > 0) return { target: 'both', statuses };
  }
  const now = NOW_RE.exec(text);
  if (now) {
    const statuses = statusList(now[2]);
    if (statuses.length > 0) return { target: targetOf(now[1]), statuses };
  }
  const put = PUT_RE.exec(text);
  if (put) return { target: targetOf(put[1]), statuses: ['Asleep'] };
  const verb = VERB_RE.exec(text);
  if (verb) return { target: targetOf(verb[2]), statuses: [VERB_STATUS[verb[1]]] };
  return null;
}

// The legacy family detection, kept as a fallback for bare wordings the clause patterns above
// do not read ("Your opponent's Active Pokémon is Poisoned.").
function legacyBranches(normalized) {
  const familyStatus = {
    'status-asleep': 'Asleep',
    'status-paralyzed': 'Paralyzed',
    'status-poisoned': 'Poisoned',
    'status-burned': 'Burned',
    'status-confused': 'Confused',
  }[classifyAttackEffect({ text: normalized, damage: 0 })];
  return familyStatus
    ? [{ when: 'always', target: 'defender', statuses: [familyStatus] }]
    : [];
}

/**
 * @param {string} text Printed attack effect text
 * @param {{ selfName?: string }} [options] The attacker's printed name
 * @returns {Array<{when: string|object, target: 'defender'|'attacker'|'both', statuses: string[]}>}
 */
export function parseAttackStatusBranches(text, { selfName = '' } = {}) {
  const normalized = normalizeAttackText(text, selfName);
  if (!normalized) return [];
  const branches = [];
  let sawConditional = false;
  for (const raw of normalized.split(/(?<=\.)\s+/)) {
    const sentence = raw.trim().replace(/\.$/, '');
    if (!sentence) continue;
    const gate = sentenceGate(sentence);
    if (!gate && /^if\b/.test(sentence)) {
      // A conditional wording this parser cannot evaluate: apply nothing rather than
      // everything (the condition may be a damage gate, a discard chain or a prize count).
      sawConditional = true;
      continue;
    }
    const body = gate ? sentence.slice(gate.length).trim() : sentence;
    const application = statusesIn(body);
    if (!application) continue;
    branches.push({
      when: gate ? gate.when : 'always',
      target: application.target,
      statuses: application.statuses,
    });
  }
  if (branches.length > 0) return branches;
  return sawConditional ? [] : legacyBranches(normalized);
}

// `firstFlip` is a one-off condition, not a rung on the heads-count ladder.
const isThreshold = (when) => typeof when === 'object' && when !== null && when.firstFlip == null;
const rankOf = (when) => {
  if (when.allHeads) return Infinity;
  if (when.headsExactly != null) return when.headsExactly;
  if (when.headsAtLeast != null) return when.headsAtLeast;
  if (when.tailsAtLeast != null) return when.tailsAtLeast;
  return 0;
};

/**
 * @param {Array} branches From `parseAttackStatusBranches`
 * @param {{ coin?: 'heads'|'tails'|null, headsCount?: number, flips?: string[] }} flip
 * @returns {{ defenderConditions: string[], attackerConditions: string[] }}
 */
export function statusesFromBranches(branches, { coin = null, headsCount = 0, flips = [] } = {}) {
  const defender = new Set();
  const attacker = new Set();
  const heads = Number(headsCount) || 0;
  const flipList = Array.isArray(flips) ? flips : [];
  const tailsCount = flipList.filter((face) => face === 'tails').length;

  const applies = (when) => {
    if (when === 'heads') return coin === 'heads' || heads >= 1;
    if (when === 'tails') return coin === 'tails' || tailsCount >= 1;
    if (when.firstFlip) return flipList[0] === when.firstFlip;
    if (when.allHeads) return flipList.length > 0 && heads === flipList.length;
    if (when.headsExactly != null) return heads === when.headsExactly;
    if (when.headsAtLeast != null) return heads >= when.headsAtLeast;
    if (when.tailsAtLeast != null) return tailsCount >= when.tailsAtLeast;
    return false;
  };

  const apply = (branch) => {
    const targets =
      branch.target === 'both' ? [defender, attacker] : [branch.target === 'attacker' ? attacker : defender];
    for (const set of targets) {
      for (const status of branch.statuses) set.add(status);
    }
  };

  const always = branches.filter((branch) => branch.when === 'always');
  const gated = branches.filter((branch) => branch.when !== 'always');
  for (const branch of always) apply(branch);

  for (const branch of gated.filter((branch) => !isThreshold(branch.when))) {
    if (applies(branch.when)) apply(branch);
  }
  // A threshold chain is a ladder: only the highest matching clause's statuses apply.
  const matching = gated
    .filter((branch) => isThreshold(branch.when) && applies(branch.when))
    .sort((a, b) => rankOf(b.when) - rankOf(a.when));
  if (matching.length > 0) apply(matching[0]);

  return { defenderConditions: [...defender], attackerConditions: [...attacker] };
}
