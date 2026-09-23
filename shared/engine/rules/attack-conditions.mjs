/**
 * @file Whole-attack state conditions (design 036 A1).
 *
 * An attack can be printed with a condition that gates the entire attack:
 *   "If your opponent's Active Pokémon isn't Confused, this attack does nothing."
 * The clause gates damage and every effect step, so the reduce attack phase evaluates it once
 * before any effect runs — it is not an executor step.
 *
 * `parseAttackCondition(text, { selfName })` reads the clause and returns a descriptor of the
 * state in which the attack PROCEEDS (`null` = no gate). The descriptor names the printed
 * condition plus a `negated` flag; `attackConditionMet(cond, ctx)` evaluates the base check and
 * flips it when `negated` is set. Most printed clauses are negative ("isn't", "don't have"), so
 * the gate descriptor is usually the positive form of the clause:
 *
 *   "…isn't Confused, this attack does nothing"   → { kind:'defenderStatus', status:'Confused' }
 *   "…has 4 or fewer Benched Pokémon, …nothing"   → { kind:'benchCount', op:'lte', n:4, negated:true }
 *
 * Coin-gated "does nothing" clauses ("If tails, this attack does nothing") belong to design
 * 032's `resolveCoinGates` and are deliberately not read here. Hand-Energy-discard costs
 * ("If you can't discard …") stay with the attack-legality gate (D114). Unknown or malformed
 * wording returns null: no gate rather than a wrong one.
 *
 * A `ctx` field that cannot be computed is absent, and a condition that needs it is treated as
 * met (the attack proceeds) — an effect-only attack with no defender must not fizzle.
 *
 * Pure: reads only its arguments, no state, no randomness.
 */

import { normalizeAttackText } from './attack-steps.mjs';

const STATUS_WORDS = {
  asleep: 'Asleep',
  paralyzed: 'Paralyzed',
  poisoned: 'Poisoned',
  burned: 'Burned',
  confused: 'Confused',
};
const STATUS_RE = Object.keys(STATUS_WORDS).join('|');

const ENERGY_LETTER_TYPES = {
  c: 'Colorless',
  g: 'Grass',
  r: 'Fire',
  w: 'Water',
  l: 'Lightning',
  p: 'Psychic',
  f: 'Fighting',
  d: 'Darkness',
  m: 'Metal',
  n: 'Dragon',
  y: 'Fairy',
};
const ENERGY_WORD_TYPES = {
  colorless: 'Colorless',
  grass: 'Grass',
  fire: 'Fire',
  water: 'Water',
  lightning: 'Lightning',
  psychic: 'Psychic',
  fighting: 'Fighting',
  darkness: 'Darkness',
  dark: 'Darkness',
  metal: 'Metal',
  dragon: 'Dragon',
  fairy: 'Fairy',
};
const KNOWN_TYPES = new Set(Object.values(ENERGY_WORD_TYPES).map((type) => type.toLowerCase()));

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Does an in-play card name equal `wanted` as a whole word ("Uxie LV.X" matches "uxie")? */
function nameMatches(actual, wanted) {
  const name = String(actual || '').toLowerCase();
  const word = String(wanted || '').trim().toLowerCase();
  if (!name || !word) return false;
  return new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(word)}(?:$|[^a-z0-9])`).test(name);
}

/**
 * "uxie and azelf" → ['uxie', 'azelf']; "lunatone" → ['lunatone']. A phrase naming a class
 * ("any Team Plasma Pokémon") rather than card names returns null — unknown wording, no gate.
 */
function splitNames(phrase) {
  const raw = String(phrase || '').trim();
  if (/\b(any|all|each|card|cards|pokémon|pokemon|energy|tool|stadium|supporter|item|trainer|basic)\b/.test(raw)) {
    return null;
  }
  const names = raw
    .split(/\s+and\s+/)
    .map((name) => name.trim())
    .filter(Boolean);
  return names.length > 0 ? names : null;
}

/** The energy a "no {L} Energy" / "no Voltaic {L} Energy" phrase names. */
function energyFromPhrase(phrase) {
  const raw = String(phrase || '').trim();
  const symbol = /\{([a-z])\}/i.exec(raw)?.[1];
  const words = raw.replace(/\{[a-z]\}/gi, '').replace(/\bbasic\b/g, '').trim();
  if (words) return { name: words };
  return { type: ENERGY_LETTER_TYPES[String(symbol || '').toLowerCase()] || null };
}

function energyWordType(phrase) {
  const symbol = /\{([a-z])\}/i.exec(String(phrase || ''))?.[1];
  if (symbol) return ENERGY_LETTER_TYPES[symbol.toLowerCase()] || null;
  return ENERGY_WORD_TYPES[String(phrase || '').trim().toLowerCase()] || null;
}

/** "10 or more basic {f} Energy cards in your discard pile" → a discardEnergyCount descriptor. */
function discardEnergyDescriptor(phrase, basicWord, op, n) {
  const energy = energyFromPhrase(phrase);
  return {
    kind: 'discardEnergyCount',
    ...(energy.type ? { type: energy.type } : {}),
    ...(energy.name ? { name: energy.name } : {}),
    ...(basicWord ? { basic: true } : {}),
    op,
    n,
  };
}

// Each entry maps a printed clause (lowercased, "if" stripped) to `{ desc, printedNegated }`:
// `desc` is the positive predicate, `printedNegated` is true when the printed clause says the
// predicate is FALSE. `parseAttackCondition` flips that into the gate's `negated` flag.
// Order matters: the more specific wording must come first.
const CLAUSES = [
  // ── Stadium ────────────────────────────────────────────────────────────────
  [/^there is no stadium(?: card)? in play$/, () => ({ desc: { kind: 'noStadium' }, printedNegated: false })],
  [/^there is any stadium card in play$/, () => ({ desc: { kind: 'noStadium' }, printedNegated: true })],
  [/^you don't have a stadium card in play$/, () => ({ desc: { kind: 'noStadium' }, printedNegated: false })],

  // ── Hand size ──────────────────────────────────────────────────────────────
  [
    /^you don't have the same number of cards in your hand as your opponent$/,
    () => ({ desc: { kind: 'sameHandCountAsOpponent' }, printedNegated: true }),
  ],
  [
    /^you have more or the same number of cards in your hand as your opponent$/,
    () => ({ desc: { kind: 'handCountVsOpponent', op: 'gte' }, printedNegated: false }),
  ],
  [
    /^you have more cards in your hand than your opponent$/,
    () => ({ desc: { kind: 'handCountVsOpponent', op: 'gt' }, printedNegated: false }),
  ],
  [
    /^you don't have exactly (\d+) cards? in your hand$/,
    (m) => ({ desc: { kind: 'handCount', op: 'eq', n: Number(m[1]) }, printedNegated: true }),
  ],
  [
    /^you have exactly (\d+) cards? in your hand$/,
    (m) => ({ desc: { kind: 'handCount', op: 'eq', n: Number(m[1]) }, printedNegated: false }),
  ],
  [
    /^you don't have (\d+) or more cards? in your hand$/,
    (m) => ({ desc: { kind: 'handCount', op: 'gte', n: Number(m[1]) }, printedNegated: true }),
  ],
  [
    /^you have (\d+) or more cards? in your hand$/,
    (m) => ({ desc: { kind: 'handCount', op: 'gte', n: Number(m[1]) }, printedNegated: false }),
  ],
  [
    /^you have (\d+) or fewer cards? in your hand$/,
    (m) => ({ desc: { kind: 'handCount', op: 'lte', n: Number(m[1]) }, printedNegated: false }),
  ],
  [/^you have any cards in your hand$/, () => ({ desc: { kind: 'handCount', op: 'gte', n: 1 }, printedNegated: false })],

  // ── Bench size / named Pokémon ─────────────────────────────────────────────
  [/^you don't have any benched pokémon$/, () => ({ desc: { kind: 'benchCount', op: 'gte', n: 1 }, printedNegated: true })],
  [/^you have no benched pokémon$/, () => ({ desc: { kind: 'benchCount', op: 'gte', n: 1 }, printedNegated: true })],
  [
    /^you have (\d+) or fewer benched pokémon$/,
    (m) => ({ desc: { kind: 'benchCount', op: 'lte', n: Number(m[1]) }, printedNegated: false }),
  ],
  [
    /^you have (\d+) or more benched pokémon$/,
    (m) => ({ desc: { kind: 'benchCount', op: 'gte', n: Number(m[1]) }, printedNegated: false }),
  ],
  [
    /^you have (\d+) or fewer (?:(?:basic )?(?:([a-z]+)|\{([a-z])\}) )?pokémon on your bench$/,
    (m) => {
      const type = energyWordType(m[2] || (m[3] ? `{${m[3]}}` : ''));
      return {
        desc: { kind: 'benchCount', op: 'lte', n: Number(m[1]), ...(type ? { type } : {}) },
        printedNegated: false,
      };
    },
  ],
  [
    /^you don't have (.+?) on your bench$/,
    (m) => {
      const names = splitNames(m[1]);
      return names ? { desc: { kind: 'benchHasName', names }, printedNegated: true } : null;
    },
  ],
  [
    /^you have (.+?) on your bench$/,
    (m) => {
      const names = splitNames(m[1]);
      return names ? { desc: { kind: 'benchHasName', names }, printedNegated: false } : null;
    },
  ],
  [
    /^you don't have (.+?) in play$/,
    (m) => {
      const names = splitNames(m[1]);
      return names ? { desc: { kind: 'inPlayHasName', names }, printedNegated: true } : null;
    },
  ],
  [
    /^you have (.+?) in play$/,
    (m) => {
      const names = splitNames(m[1]);
      return names ? { desc: { kind: 'inPlayHasName', names }, printedNegated: false } : null;
    },
  ],

  // ── Special conditions ─────────────────────────────────────────────────────
  [
    new RegExp(`^(?:your opponent's active pokémon|the defending pokémon) (?:isn't|is not) (${STATUS_RE})$`),
    (m) => ({ desc: { kind: 'defenderStatus', status: STATUS_WORDS[m[1]] }, printedNegated: true }),
  ],
  [
    new RegExp(`^(?:your opponent's active pokémon|the defending pokémon) is (${STATUS_RE})$`),
    (m) => ({ desc: { kind: 'defenderStatus', status: STATUS_WORDS[m[1]] }, printedNegated: false }),
  ],
  [
    new RegExp(`^this pokémon (?:isn't|is not) (${STATUS_RE})$`),
    (m) => ({ desc: { kind: 'attackerStatus', status: STATUS_WORDS[m[1]] }, printedNegated: true }),
  ],
  [
    new RegExp(`^this pokémon is (${STATUS_RE})$`),
    (m) => ({ desc: { kind: 'attackerStatus', status: STATUS_WORDS[m[1]] }, printedNegated: false }),
  ],
  [
    new RegExp(`^it is not (${STATUS_RE})$`),
    (m) => ({ desc: { kind: 'attackerStatus', status: STATUS_WORDS[m[1]] }, printedNegated: true }),
  ],

  // ── Rule box / stage of the defender ───────────────────────────────────────
  [
    /^(?:your opponent's active pokémon|the defending pokémon) (?:isn't|is not) a pokémon[- ]ex$/,
    () => ({ desc: { kind: 'defenderRuleBox', value: 'ex' }, printedNegated: true }),
  ],
  [
    /^(?:your opponent's active pokémon|the defending pokémon) is a pokémon[- ]ex$/,
    () => ({ desc: { kind: 'defenderRuleBox', value: 'ex' }, printedNegated: false }),
  ],
  [
    /^(?:your opponent's active pokémon|the defending pokémon) (?:isn't|is not) a basic pokémon$/,
    () => ({ desc: { kind: 'defenderRuleBox', value: 'basic' }, printedNegated: true }),
  ],
  [
    /^(?:your opponent's active pokémon|the defending pokémon) is a basic pokémon$/,
    () => ({ desc: { kind: 'defenderRuleBox', value: 'basic' }, printedNegated: false }),
  ],
  [
    /^(?:your opponent's active pokémon|the defending pokémon) (?:isn't|is not) a (tera|radiant|mega) pokémon$/,
    (m) => ({ desc: { kind: 'defenderRuleBox', value: m[1] }, printedNegated: true }),
  ],
  [
    /^(?:your opponent's active pokémon|the defending pokémon) is a (tera|radiant|mega) pokémon$/,
    (m) => ({ desc: { kind: 'defenderRuleBox', value: m[1] }, printedNegated: false }),
  ],

  // ── What happened this turn ────────────────────────────────────────────────
  [
    /^this pokémon didn't move from the bench to the active spot this turn$/,
    () => ({ desc: { kind: 'movedToActiveThisTurn' }, printedNegated: true }),
  ],
  [
    /^this pokémon moved from the bench to the active spot this turn$/,
    () => ({ desc: { kind: 'movedToActiveThisTurn' }, printedNegated: false }),
  ],
  [
    /^this pokémon evolved during this turn$/,
    () => ({ desc: { kind: 'evolvedThisTurn' }, printedNegated: false }),
  ],
  [
    /^this pokémon didn't evolve during this turn$/,
    () => ({ desc: { kind: 'evolvedThisTurn' }, printedNegated: true }),
  ],

  // ── Damage counters ────────────────────────────────────────────────────────
  [
    /^this pokémon has no damage counters on it$/,
    () => ({ desc: { kind: 'attackerDamageCounters', op: 'gte', n: 1 }, printedNegated: true }),
  ],
  [
    /^this pokémon has (\d+) or more damage counters on it$/,
    (m) => ({ desc: { kind: 'attackerDamageCounters', op: 'gte', n: Number(m[1]) }, printedNegated: false }),
  ],
  [
    /^this pokémon has (\d+) or fewer damage counters on it$/,
    (m) => ({ desc: { kind: 'attackerDamageCounters', op: 'lte', n: Number(m[1]) }, printedNegated: false }),
  ],
  [
    /^(?:your opponent's active pokémon|the defending pokémon) has no damage counters on it(?: before this attack does damage)?$/,
    () => ({ desc: { kind: 'defenderDamageCounters', op: 'eq', n: 0 }, printedNegated: false }),
  ],
  [
    /^(?:your opponent's active pokémon|the defending pokémon) (?:already )?has any damage counters on it(?: before this attack does damage)?$/,
    () => ({ desc: { kind: 'defenderDamageCounters', op: 'gte', n: 1 }, printedNegated: false }),
  ],
  [
    /^(?:your opponent's active pokémon|the defending pokémon) has (\d+) or more damage counters on it$/,
    (m) => ({ desc: { kind: 'defenderDamageCounters', op: 'gte', n: Number(m[1]) }, printedNegated: false }),
  ],
  [
    /^(?:your opponent's active pokémon|the defending pokémon) has (\d+) or fewer damage counters on it$/,
    (m) => ({ desc: { kind: 'defenderDamageCounters', op: 'lte', n: Number(m[1]) }, printedNegated: false }),
  ],

  // ── Prizes ─────────────────────────────────────────────────────────────────
  [
    /^your opponent doesn't have exactly (\d+) or (\d+) prize cards? remaining$/,
    (m) => ({
      desc: { kind: 'opponentPrizes', op: 'eq', n: [Number(m[1]), Number(m[2])] },
      printedNegated: true,
    }),
  ],
  [
    /^your opponent has exactly (\d+) or (\d+) prize cards? remaining$/,
    (m) => ({
      desc: { kind: 'opponentPrizes', op: 'eq', n: [Number(m[1]), Number(m[2])] },
      printedNegated: false,
    }),
  ],
  [
    /^your opponent has (\d+) or fewer prize cards? remaining$/,
    (m) => ({ desc: { kind: 'opponentPrizes', op: 'lte', n: Number(m[1]) }, printedNegated: false }),
  ],
  [
    /^your opponent has (\d+) or more prize cards? remaining$/,
    (m) => ({ desc: { kind: 'opponentPrizes', op: 'gte', n: Number(m[1]) }, printedNegated: false }),
  ],
  [
    /^you have exactly (\d+), (\d+), or (\d+) prize cards? remaining$/,
    (m) => ({
      desc: { kind: 'ownPrizes', op: 'eq', n: [Number(m[1]), Number(m[2]), Number(m[3])] },
      printedNegated: false,
    }),
  ],

  // ── Opponent hand ──────────────────────────────────────────────────────────
  [
    /^your opponent has (\d+) or fewer cards? in their hand$/,
    (m) => ({ desc: { kind: 'opponentHandCount', op: 'lte', n: Number(m[1]) }, printedNegated: false }),
  ],
  [
    /^your opponent has (\d+) or more cards? in their hand$/,
    (m) => ({ desc: { kind: 'opponentHandCount', op: 'gte', n: Number(m[1]) }, printedNegated: false }),
  ],

  // ── Attached / discarded Energy ────────────────────────────────────────────
  [
    /^this pokémon has no (.+?) energy attached$/,
    (m) => ({
      desc: { kind: 'attackerEnergyType', ...energyFromPhrase(m[1]), n: 1 },
      printedNegated: true,
    }),
  ],
  [
    /^this pokémon has any (.+?) energy attached$/,
    (m) => ({
      desc: { kind: 'attackerEnergyType', ...energyFromPhrase(m[1]), n: 1 },
      printedNegated: false,
    }),
  ],
  [
    /^you don't have (\d+) or more (basic )?(.+?) energy cards? in your discard pile$/,
    (m) => ({
      desc: discardEnergyDescriptor(m[3], m[2], 'gte', Number(m[1])),
      printedNegated: true,
    }),
  ],
  [
    /^you have fewer than (\d+) (basic )?(.+?) energy cards? in your discard pile$/,
    (m) => ({
      desc: discardEnergyDescriptor(m[3], m[2], 'lt', Number(m[1])),
      printedNegated: false,
    }),
  ],

  // ── HP ─────────────────────────────────────────────────────────────────────
  [
    /^(?:your opponent's active pokémon|the defending pokémon)'s maximum hp is (\d+) or more$/,
    (m) => ({ desc: { kind: 'defenderMaxHp', op: 'gte', n: Number(m[1]) }, printedNegated: false }),
  ],
  [
    /^(?:your opponent's active pokémon|the defending pokémon)'s maximum hp is (\d+) or less$/,
    (m) => ({ desc: { kind: 'defenderMaxHp', op: 'lte', n: Number(m[1]) }, printedNegated: false }),
  ],
  [
    /^(?:your opponent's active pokémon|the defending pokémon) has the same or less remaining hp as this pokémon$/,
    () => ({ desc: { kind: 'defenderRemainingHpVsAttacker', op: 'lte' }, printedNegated: false }),
  ],

  // ── Special Energy on the defender ─────────────────────────────────────────
  [
    /^(?:your opponent's active pokémon|the defending pokémon) has any special energy attached$/,
    () => ({ desc: { kind: 'defenderHasSpecialEnergy' }, printedNegated: false }),
  ],
  [
    /^(?:your opponent's active pokémon|the defending pokémon) has no special energy attached$/,
    () => ({ desc: { kind: 'defenderHasSpecialEnergy' }, printedNegated: true }),
  ],
];

/** Printed clause text → `{ desc, printedNegated }`, or null for unread wording. */
function parseClause(raw) {
  const clause = String(raw || '')
    .trim()
    .replace(/^if,?\s+/, '')
    .replace(/^before this pokémon does damage,?\s+/, '')
    .replace(/[.\s]+$/, '')
    .replace(/\s+/g, ' ');
  if (!clause) return null;
  for (const [re, build] of CLAUSES) {
    const m = re.exec(clause);
    if (m) return build(m, clause);
  }
  return null;
}

const DOES_NOTHING = /^(?:if )?(.+?),?\s*this attack does nothing\.?$/;
// "Discard a Stadium in play. If you can't, this attack does nothing." — the printed cost the
// attack's condition names. Read as one gate: the attack proceeds only with a Stadium to discard.
const DISCARD_STADIUM_GATE = /discard a stadium in play\. if you can't, this attack does nothing/;

/**
 * @param {string} text Printed attack effect text
 * @param {{ selfName?: string }} [options] The attacker's printed name
 * @returns {object|null} Descriptor of the state the attack proceeds in, or null for no gate
 */
export function parseAttackCondition(text, { selfName = '' } = {}) {
  const normalized = normalizeAttackText(text, selfName);
  if (!normalized) return null;
  if (DISCARD_STADIUM_GATE.test(normalized)) {
    return { kind: 'noStadium', negated: true };
  }
  for (const sentence of normalized.split(/(?<=\.)\s+/)) {
    const m = DOES_NOTHING.exec(sentence.trim());
    if (!m) continue;
    const printed = parseClause(m[1]);
    if (!printed) continue;
    // The gate holds when the printed clause is FALSE, so its `negated` flag is the inverse of
    // the clause's own polarity.
    return { ...printed.desc, negated: !printed.printedNegated };
  }
  return null;
}

const CMP = {
  eq: (a, b) => a === b,
  neq: (a, b) => a !== b,
  lte: (a, b) => a <= b,
  gte: (a, b) => a >= b,
  lt: (a, b) => a < b,
  gt: (a, b) => a > b,
};

const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const list = (value) => (Array.isArray(value) ? value : []);

function compare(value, op, n) {
  const fn = CMP[op];
  if (!fn) return false;
  return Array.isArray(n) ? n.some((target) => fn(value, target)) : fn(value, n);
}

function damageCounters(damage) {
  return Math.max(0, Math.floor(num(damage) / 10));
}

function benchCount(ctx, cond) {
  const names = list(ctx.benchNames);
  const types = list(ctx.benchTypes);
  if (!cond.type) return names.length;
  const wanted = String(cond.type).toLowerCase();
  return types.filter((entry) => list(entry).some((t) => String(t).toLowerCase() === wanted)).length;
}

function energyCheck(cond, ctx) {
  const wanted = cond.type || cond.name;
  if (!wanted) return false;
  const word = String(wanted).toLowerCase();
  // A Holon Research Tower unit is a dual token ("Lightning|Fighting"): it provides either type.
  const typeMatches = (token) =>
    String(token)
      .toLowerCase()
      .split('|')
      .some((part) => part === word);
  const count = KNOWN_TYPES.has(word)
    ? list(ctx.attackerEnergyTypes).filter(typeMatches).length
    : list(ctx.attackerEnergyNames).filter((n) => nameMatches(n, wanted)).length;
  return count >= num(cond.n || 1);
}

function discardEnergyCount(ctx, cond) {
  return list(ctx.ownDiscardEnergy).filter((entry) => {
    if (cond.basic && entry?.basic !== true) return false;
    if (cond.type && String(entry?.type || '').toLowerCase() !== String(cond.type).toLowerCase()) return false;
    if (cond.name && !nameMatches(entry?.name, cond.name)) return false;
    return true;
  }).length;
}

const RULE_BOX_FLAGS = {
  basic: (ctx) => ctx.defenderIsBasic,
  ex: (ctx) => ctx.defenderIsEx,
  tera: (ctx) => ctx.defenderIsTera,
  radiant: (ctx) => ctx.defenderIsRadiant,
  mega: (ctx) => ctx.defenderIsMega,
};

const CHECKS = {
  defenderStatus: (cond, ctx) => list(ctx.defenderConditions).includes(cond.status),
  attackerStatus: (cond, ctx) => list(ctx.attackerConditions).includes(cond.status),
  noStadium: (cond, ctx) => !ctx.stadiumInPlay,
  handCount: (cond, ctx) => compare(num(ctx.ownHandCount), cond.op, cond.n),
  handCountVsOpponent: (cond, ctx) => compare(num(ctx.ownHandCount), cond.op, num(ctx.opponentHandCount)),
  sameHandCountAsOpponent: (cond, ctx) => num(ctx.ownHandCount) === num(ctx.opponentHandCount),
  benchCount: (cond, ctx) => compare(benchCount(ctx, cond), cond.op, cond.n),
  benchHasName: (cond, ctx) => list(cond.names).every((name) => list(ctx.benchNames).some((actual) => nameMatches(actual, name))),
  inPlayHasName: (cond, ctx) => list(cond.names).every((name) => list(ctx.ownInPlayNames).some((actual) => nameMatches(actual, name))),
  opponentPrizes: (cond, ctx) => compare(num(ctx.opponentPrizes), cond.op, cond.n),
  ownPrizes: (cond, ctx) => compare(num(ctx.ownPrizes), cond.op, cond.n),
  opponentHandCount: (cond, ctx) => compare(num(ctx.opponentHandCount), cond.op, cond.n),
  attackerEnergyType: (cond, ctx) => energyCheck(cond, ctx),
  discardEnergyCount: (cond, ctx) => compare(discardEnergyCount(ctx, cond), cond.op, cond.n),
  attackerDamageCounters: (cond, ctx) => compare(damageCounters(ctx.attackerDamage), cond.op, cond.n),
  defenderDamageCounters: (cond, ctx) => compare(damageCounters(ctx.defenderDamage), cond.op, cond.n),
  defenderRuleBox: (cond, ctx) => Boolean(RULE_BOX_FLAGS[cond.value]?.(ctx)),
  movedToActiveThisTurn: (cond, ctx) => ctx.attackerMovedToActiveThisTurn === true,
  evolvedThisTurn: (cond, ctx) => ctx.attackerEvolvedThisTurn === true,
  defenderMaxHp: (cond, ctx) => compare(num(ctx.defenderMaxHp), cond.op, cond.n),
  defenderRemainingHpVsAttacker: (cond, ctx) =>
    compare(num(ctx.defenderRemainingHp), cond.op, num(ctx.attackerRemainingHp)),
  defenderHasSpecialEnergy: (cond, ctx) => num(ctx.defenderSpecialEnergyCount) > 0,
};

// A condition about the defender is skipped (attack proceeds) when there is no defender: an
// effect-only attack against an empty board must not fizzle on a missing read.
const DEFENDER_KINDS = new Set([
  'defenderStatus',
  'defenderDamageCounters',
  'defenderRuleBox',
  'defenderMaxHp',
  'defenderRemainingHpVsAttacker',
  'defenderHasSpecialEnergy',
]);

/**
 * @param {object|null} cond Descriptor from `parseAttackCondition`
 * @param {object} ctx Extended `buildServerAttackContext` output
 * @returns {boolean} Whether the attack proceeds
 */
export function attackConditionMet(cond, ctx = {}) {
  if (!cond || !cond.kind) return true;
  const check = CHECKS[cond.kind];
  // Unknown kinds fail open (the attack proceeds): a parser we did not write must not silently
  // delete an attack.
  if (!check) return true;
  if (!ctx.defenderPresent && DEFENDER_KINDS.has(cond.kind)) return true;
  const base = Boolean(check(cond, ctx));
  return cond.negated ? !base : base;
}
