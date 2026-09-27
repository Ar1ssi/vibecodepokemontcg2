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

import { escapeRegExp, normalizeAttackText } from './attack-text.mjs';

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

const DEFENDER = "(?:your opponent's active pokémon|the defending pokémon)";
const NOT_A_NAME = new Set(['damaged', 'evolved', 'active', 'benched', 'healthy', 'unaffected', 'knocked']);

// One printed Pokémon kind ("a Pokémon-EX", "an Evolution Pokémon", "a TAG TEAM", "a {D} Pokémon")
// → the key `ruleBoxKinds` (attack-damage-context.mjs) lists for an in-play Pokémon, or null.
const KIND_PHRASES = [
  [/^(?:an? )?pokémon[- ]ex$/, () => 'ex'],
  [/^(?:an? )?pokémon[- ]gx$/, () => 'gx'],
  [/^(?:an? )?pokémon v$/, () => 'v'],
  [/^(?:an? )?pokémon vmax$/, () => 'vmax'],
  [/^(?:an? )?pokémon vstar$/, () => 'vstar'],
  [/^(?:an? )?tag team(?: pokémon)?$/, () => 'tagteam'],
  [/^(?:an? )?ultra beasts?$/, () => 'ultrabeast'],
  [/^(?:an? )?(?:evolved|evolution) pokémon$/, () => 'evolved'],
  [/^(?:an? )?basic pokémon$/, () => 'basic'],
  [/^(?:an? )?stage (1|2)(?: evolved)? pokémon$/, (m) => `stage${m[1]}`],
  [/^(?:an? )?(tera|radiant|mega) pokémon$/, (m) => m[1]],
  [/^(?:an? )?\{([a-z])\} pokémon$/, (m) => (ENERGY_LETTER_TYPES[m[1]] ? `type:${ENERGY_LETTER_TYPES[m[1]].toLowerCase()}` : null)],
  [/^(?:an? )?([a-z]+) pokémon$/, (m) => (ENERGY_WORD_TYPES[m[1]] ? `type:${ENERGY_WORD_TYPES[m[1]].toLowerCase()}` : null)],
];

function kindOf(phrase) {
  for (const [re, build] of KIND_PHRASES) {
    const m = re.exec(phrase.trim());
    if (m) return build(m);
  }
  return null;
}

/** "a Pokémon-GX or a Pokémon-EX" → ['gx', 'ex']; null when any part is not a known kind. */
export function kindsOf(phrase) {
  const kinds = String(phrase || '')
    .split(/,? or /)
    .map(kindOf);
  return kinds.length > 0 && kinds.every(Boolean) ? kinds : null;
}

const ABILITY_KIND_WORDS = { ability: 'ability', abilities: 'ability', 'poké-power': 'power', 'poké-powers': 'power', 'poké-body': 'body', 'poké-bodies': 'body' };

/** "any Poké-Powers or Poké-Bodies" / "an Ability" → ['power', 'body'] / ['ability'], or null. */
function abilityKindsOf(phrase) {
  const words = String(phrase || '')
    .replace(/^(?:any|an?)\s+/, '')
    .split(/\s+or\s+/)
    .map((word) => ABILITY_KIND_WORDS[word.trim()]);
  return words.length > 0 && words.every(Boolean) ? words : null;
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
  [/^you have no cards? in your hand$/, () => ({ desc: { kind: 'handCount', op: 'eq', n: 0 }, printedNegated: false })],
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
  [
    /^you have the same (?:number|amount) of cards in your hand as your opponent$/,
    () => ({ desc: { kind: 'sameHandCountAsOpponent' }, printedNegated: false }),
  ],
  [
    /^you don't have any pokémon in your hand$/,
    () => ({ desc: { kind: 'handPokemonCount', op: 'gte', n: 1 }, printedNegated: true }),
  ],

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
    /^you have (?:less|fewer) benched pokémon than your opponent$/,
    () => ({ desc: { kind: 'benchVsOpponent', op: 'lt' }, printedNegated: false }),
  ],
  [
    /^you have more benched pokémon than your opponent$/,
    () => ({ desc: { kind: 'benchVsOpponent', op: 'gt' }, printedNegated: false }),
  ],
  [
    /^your benched (?:\{([a-z])\} )?pokémon have any damage counters on them$/,
    (m) => ({
      desc: { kind: 'damagedBench', ...(m[1] ? { type: ENERGY_LETTER_TYPES[m[1]] } : {}) },
      printedNegated: false,
    }),
  ],
  [
    /^(.+?) (?:is|are) on your bench$/,
    (m) => {
      const names = splitNames(m[1]);
      return names ? { desc: { kind: 'benchHasName', names }, printedNegated: false } : null;
    },
  ],
  [
    /^(.+?) (?:is|are) in your discard pile$/,
    (m) => {
      const names = splitNames(m[1]);
      return names ? { desc: { kind: 'discardHasName', names }, printedNegated: false } : null;
    },
  ],
  [
    /^(.+?) is anywhere under this pokémon$/,
    (m) => {
      const names = splitNames(m[1]);
      return names ? { desc: { kind: 'stackHasName', names }, printedNegated: false } : null;
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
  [
    new RegExp(`^${DEFENDER} is (?:not )?affected by (?:a|any) special conditions?$`),
    (m) => ({ desc: { kind: 'defenderAnyStatus' }, printedNegated: / is not /.test(m[0]) }),
  ],
  [
    /^this pokémon is (?:not )?affected by (?:a|any) special conditions?$/,
    (m) => ({ desc: { kind: 'attackerAnyStatus' }, printedNegated: / is not /.test(m[0]) }),
  ],

  // ── Rule box / stage of the defender ───────────────────────────────────────
  [
    /^(?:your opponent's active pokémon|the defending pokémon) (?:isn't|is not) (?:a )?pokémon[- ]ex$/,
    () => ({ desc: { kind: 'defenderRuleBox', value: 'ex' }, printedNegated: true }),
  ],
  [
    /^(?:your opponent's active pokémon|the defending pokémon) is (?:a )?pokémon[- ]ex$/,
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
  // Poliwrath Beatdown: "a {D} Pokémon or has Dark in its name".
  [
    new RegExp(`^${DEFENDER} is an? \\{([a-z])\\} pokémon or has (\\w+) in its name$`),
    (m) => ({
      desc: {
        kind: 'defenderKindOrName',
        values: [`type:${String(ENERGY_LETTER_TYPES[m[1]] || '').toLowerCase()}`],
        nameWord: m[2],
      },
      printedNegated: false,
    }),
  ],
  // Any other printed kind list ("an Evolution Pokémon", "a Pokémon-GX or a Pokémon-EX", "a
  // TAG TEAM"); a bare name ("Seviper") names the defender.
  [
    new RegExp(`^${DEFENDER} (is|isn't|is not) (.+)$`),
    (m) => {
      const negated = m[1] !== 'is';
      const values = kindsOf(m[2]);
      if (values) return { desc: { kind: 'defenderRuleBox', values }, printedNegated: negated };
      // A name is one printed word ("Seviper"); anything longer is a state we do not read.
      if (!/^[a-z][\w.'-]*$/.test(m[2]) || NOT_A_NAME.has(m[2])) return null;
      return { desc: { kind: 'defenderName', names: [m[2]] }, printedNegated: negated };
    },
  ],
  [
    /^your opponent has (?:any|an?) (.+?) in play$/,
    (m) => {
      const values = kindsOf(m[1]);
      return values ? { desc: { kind: 'opponentInPlayKind', values }, printedNegated: false } : null;
    },
  ],

  // ── Abilities ──────────────────────────────────────────────────────────────
  [
    new RegExp(`^${DEFENDER} has (an ability|any abilities|any poké-powers or poké-bodies|any poké-bodies or poké-powers|any poké-powers|any poké-bodies)$`),
    (m) => ({ desc: { kind: 'defenderAbility', abilityKinds: abilityKindsOf(m[1]) }, printedNegated: false }),
  ],
  [
    new RegExp(`^${DEFENDER} has no abilities$`),
    () => ({ desc: { kind: 'defenderAbility', abilityKinds: ['ability'] }, printedNegated: true }),
  ],
  [
    /^you don't have any pokémon with (any poké-powers|any poké-bodies|an ability|any abilities) in play$/,
    (m) => ({ desc: { kind: 'ownInPlayAbility', abilityKinds: abilityKindsOf(m[1]) }, printedNegated: true }),
  ],

  // ── Resistance ─────────────────────────────────────────────────────────────
  [
    new RegExp(`^${DEFENDER} has \\{([a-z])\\} resistance$`),
    (m) => ({ desc: { kind: 'defenderResistance', type: ENERGY_LETTER_TYPES[m[1]] }, printedNegated: false }),
  ],

  // ── What happened this turn ────────────────────────────────────────────────
  [
    /^this pokémon didn't move from (?:the|your) bench to the active spot this turn$/,
    () => ({ desc: { kind: 'movedToActiveThisTurn' }, printedNegated: true }),
  ],
  [
    /^this pokémon (?:moved from (?:the|your) bench to the active spot|was on (?:the|your) bench and became your active pokémon) this turn$/,
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
  [
    /^this pokémon evolved from (.+?) during this turn$/,
    (m) => {
      const names = splitNames(m[1]);
      return names ? { desc: { kind: 'evolvedThisTurn', fromNames: names }, printedNegated: false } : null;
    },
  ],
  [
    /^this pokémon was damaged by an attack during your opponent's last turn$/,
    () => ({ desc: { kind: 'damagedLastOpponentTurn' }, printedNegated: false }),
  ],
  [
    /^this pokémon was healed during this turn$/,
    () => ({ desc: { kind: 'healedThisTurn' }, printedNegated: false }),
  ],
  [
    /^you attach(?:ed)? an? (?:\{([a-z])\} )?energy card from your hand to this pokémon during this turn$/,
    (m) => ({
      desc: { kind: 'handEnergyAttachedThisTurn', ...(m[1] ? { type: ENERGY_LETTER_TYPES[m[1]] } : {}) },
      printedNegated: false,
    }),
  ],
  [
    /^you played (?:a|any) supporter card from your hand during this turn$/,
    () => ({ desc: { kind: 'supporterPlayedThisTurn' }, printedNegated: false }),
  ],
  [
    /^you played a supporter card that has "(.+?)" in its name from your hand during this turn$/,
    (m) => ({ desc: { kind: 'supporterPlayedThisTurn', nameContains: m[1] }, printedNegated: false }),
  ],
  [
    /^you played (.+?) from your hand during this turn$/,
    (m) => {
      if (/\b(?:card|cards|any|a)\b/.test(m[1])) return null;
      return { desc: { kind: 'supporterPlayedThisTurn', names: [m[1].trim()] }, printedNegated: false };
    },
  ],
  [
    /^this pokémon used (.+?) during your last turn$/,
    (m) => ({ desc: { kind: 'usedAttackLastTurn', attackName: m[1].trim() }, printedNegated: false }),
  ],

  // ── Knock Outs during the opponent's last turn ─────────────────────────────
  [
    /^any of your (?:\{([a-z])\} )?pokémon were knocked out( by damage from (?:an|an opponent's|your opponent's) attacks?)? during (?:your opponent's|their) last turn$/,
    (m) => ({
      desc: {
        kind: 'koLastOpponentTurn',
        ...(m[1] ? { type: ENERGY_LETTER_TYPES[m[1]] } : {}),
        ...(m[2] ? { byAttackDamage: true } : {}),
      },
      printedNegated: false,
    }),
  ],

  // ── Damage counters ────────────────────────────────────────────────────────
  [
    /^this pokémon has no damage counters on it$/,
    () => ({ desc: { kind: 'attackerDamageCounters', op: 'gte', n: 1 }, printedNegated: true }),
  ],
  [
    /^this pokémon (?:already )?has any damage counters on it$/,
    () => ({ desc: { kind: 'attackerDamageCounters', op: 'gte', n: 1 }, printedNegated: false }),
  ],
  [
    /^this pokémon (?:already )?has (?:(\d+) or more|at least (\d+)) damage counters on it$/,
    (m) => ({ desc: { kind: 'attackerDamageCounters', op: 'gte', n: Number(m[1] || m[2]) }, printedNegated: false }),
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
    /^(?:your opponent's active pokémon|the defending pokémon) (?:already )?has (?:(\d+) or more|at least (\d+)) damage counters on it$/,
    (m) => ({ desc: { kind: 'defenderDamageCounters', op: 'gte', n: Number(m[1] || m[2]) }, printedNegated: false }),
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
    /^your opponent has (?:exactly|only) (\d+) prize cards? (?:remaining|left)$/,
    (m) => ({ desc: { kind: 'opponentPrizes', op: 'eq', n: Number(m[1]) }, printedNegated: false }),
  ],
  [
    /^your opponent has (\d+) or fewer prize cards? (?:remaining|left)$/,
    (m) => ({ desc: { kind: 'opponentPrizes', op: 'lte', n: Number(m[1]) }, printedNegated: false }),
  ],
  [
    /^your opponent has (\d+) or more prize cards? (?:remaining|left)$/,
    (m) => ({ desc: { kind: 'opponentPrizes', op: 'gte', n: Number(m[1]) }, printedNegated: false }),
  ],
  [
    /^you have exactly (\d+), (\d+), or (\d+) prize cards? remaining$/,
    (m) => ({
      desc: { kind: 'ownPrizes', op: 'eq', n: [Number(m[1]), Number(m[2]), Number(m[3])] },
      printedNegated: false,
    }),
  ],
  [
    /^you have (?:exactly|only) (\d+) prize cards? (?:remaining|left)$/,
    (m) => ({ desc: { kind: 'ownPrizes', op: 'eq', n: Number(m[1]) }, printedNegated: false }),
  ],
  [
    /^you have more prize cards (?:remaining|left) than your opponent$/,
    () => ({ desc: { kind: 'prizesVsOpponent', op: 'gt' }, printedNegated: false }),
  ],
  [
    /^you have (?:fewer|less) prize cards (?:remaining|left) than your opponent$/,
    () => ({ desc: { kind: 'prizesVsOpponent', op: 'lt' }, printedNegated: false }),
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
    /^this pokémon has any special energy(?: cards?)? attached(?: to it)?$/,
    () => ({ desc: { kind: 'attackerSpecialEnergy' }, printedNegated: false }),
  ],
  [
    /^this pokémon has no special energy(?: cards?)? attached(?: to it)?$/,
    () => ({ desc: { kind: 'attackerSpecialEnergy' }, printedNegated: true }),
  ],
  [
    /^this pokémon has at least (\d+) extra (?:\{([a-z])\} )?energy attached(?: to it)?(?: \(in addition to this attack's cost\))?$/,
    (m) => ({
      desc: { kind: 'attackerExtraEnergy', n: Number(m[1]), ...(m[2] ? { type: ENERGY_LETTER_TYPES[m[2]] } : {}) },
      printedNegated: false,
    }),
  ],
  [
    /^this pokémon has no (.+?) energy(?: cards?)? attached(?: to it)?$/,
    (m) => ({
      desc: { kind: 'attackerEnergyType', ...energyFromPhrase(m[1]), n: 1 },
      printedNegated: true,
    }),
  ],
  [
    /^this pokémon has (any|an?|at least \d+|\d+ or more) (.+?) energy(?: cards?)? attached(?: to it)?$/,
    (m) => ({
      desc: { kind: 'attackerEnergyType', ...energyFromPhrase(m[2]), n: Number(/\d+/.exec(m[1])?.[0] || 1) },
      printedNegated: false,
    }),
  ],
  [
    /^this pokémon and (?:your opponent's active pokémon|the defending pokémon) have the same (?:amount|number) of energy attached(?: to them)?$/,
    () => ({ desc: { kind: 'energyVsDefender', op: 'eq' }, printedNegated: false }),
  ],
  [
    /^this pokémon has (?:less|fewer) energy attached(?: to it)? than (?:your opponent's active pokémon|the defending pokémon)$/,
    () => ({ desc: { kind: 'energyVsDefender', op: 'lt' }, printedNegated: false }),
  ],
  [
    /^this pokémon has more energy attached(?: to it)? than (?:your opponent's active pokémon|the defending pokémon)$/,
    () => ({ desc: { kind: 'energyVsDefender', op: 'gt' }, printedNegated: false }),
  ],
  [
    /^(?:your opponent's active pokémon|the defending pokémon) has no energy(?: cards?)? attached(?: to it)?$/,
    () => ({ desc: { kind: 'defenderEnergyCount', op: 'eq', n: 0 }, printedNegated: false }),
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

  // ── Pokémon Tools ──────────────────────────────────────────────────────────
  [
    /^this pokémon has (?:a|any) pokémon tools?(?: cards?)? attached(?: to it)?$/,
    () => ({ desc: { kind: 'attackerToolCount', op: 'gte', n: 1 }, printedNegated: false }),
  ],
  [
    /^this pokémon has no pokémon tools?(?: cards?)? attached(?: to it)?$/,
    () => ({ desc: { kind: 'attackerToolCount', op: 'gte', n: 1 }, printedNegated: true }),
  ],
  [
    /^(?:your opponent's active pokémon|the defending pokémon) has (?:a|any) pokémon tools?(?: cards?)? attached(?: to it)?$/,
    () => ({ desc: { kind: 'defenderToolCount', op: 'gte', n: 1 }, printedNegated: false }),
  ],

  // ── Stadium ownership ──────────────────────────────────────────────────────
  [/^you have a stadium(?: card)? in play$/, () => ({ desc: { kind: 'stadiumOwner', owner: 'self' }, printedNegated: false })],
  [
    /^your opponent has a stadium(?: card)? in play$/,
    () => ({ desc: { kind: 'stadiumOwner', owner: 'opponent' }, printedNegated: false }),
  ],
  [
    /^(.+?) is in play$/,
    (m) => {
      const names = splitNames(m[1]);
      return names ? { desc: { kind: 'namedCardInPlay', names }, printedNegated: false } : null;
    },
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
    /^(?:your opponent's active pokémon|the defending pokémon) has any special energy(?: cards?)? attached(?: to it)?$/,
    () => ({ desc: { kind: 'defenderHasSpecialEnergy' }, printedNegated: false }),
  ],
  [
    /^(?:your opponent's active pokémon|the defending pokémon) has no special energy(?: cards?)? attached(?: to it)?$/,
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
    const printed = m ? build(m, clause) : null;
    // A row that matches but cannot read its phrase (an unknown name or kind) falls through.
    if (printed) return printed;
  }
  return null;
}

/**
 * A bare "if <clause>" condition (design 036 A10: "If X, this attack does 30 more damage, and
 * the Defending Pokémon is now Confused") as a descriptor that holds when the clause is TRUE.
 * @param {string} clause Normalized clause text, with or without the leading "if"
 * @returns {object|null}
 */
export function parseConditionClause(clause) {
  const printed = parseClause(clause);
  return printed ? { ...printed.desc, negated: printed.printedNegated } : null;
}

const DOES_NOTHING = /^(?:if )?(.+?),?\s*this attack does nothing\.?$/;
// "You can use this attack only if <clause>." Unlike a "does nothing" gate the printed
// polarity is already the state the attack proceeds in, so `negated` keeps it as parsed.
// Only clauses the CLAUSES table knows produce a gate (Beedrill Destiny Stinger's damage
// counters today); the other 28 use-only-if wordings stay ungated until added there.
const USE_ONLY_IF = /^you can use this attack only if (.+)$/;
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
    const trimmed = sentence.trim();
    const useOnly = USE_ONLY_IF.exec(trimmed);
    if (useOnly) {
      const printed = parseClause(useOnly[1]);
      if (!printed) continue;
      return { ...printed.desc, negated: printed.printedNegated };
    }
    const m = DOES_NOTHING.exec(trimmed);
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

/** A flag the caller set wins (unit tests set them alone); else the defender's kind list. */
function defenderIsKind(ctx, value) {
  const flag = RULE_BOX_FLAGS[value]?.(ctx);
  if (typeof flag === 'boolean') return flag;
  return list(ctx.defenderKinds).includes(value);
}

const COST_LETTERS = { g: 'grass', r: 'fire', w: 'water', l: 'lightning', p: 'psychic', f: 'fighting', d: 'darkness', m: 'metal', y: 'fairy', n: 'dragon', c: 'colorless' };

/** A printed cost symbol ("Fire", "{R}", "R") → lowercase type word. */
function costType(symbol) {
  const raw = String(symbol || '').replace(/[{}]/g, '').trim().toLowerCase();
  const word = COST_LETTERS[raw] || raw;
  return word === 'dark' ? 'darkness' : word;
}

/**
 * Energy attached beyond the attack's printed cost (App. "extra Energy"): of `type` when
 * printed ("2 extra {W} Energy" counts Water beyond the cost's Water symbols), else in total.
 */
function extraEnergyCount(ctx, type) {
  const units = list(ctx.attackerEnergyUnits).map((unit) => String(unit).toLowerCase());
  const cost = list(ctx.attackCost).map(costType);
  if (!type) return units.length - cost.length;
  const wanted = String(type).toLowerCase() === 'dark' ? 'darkness' : String(type).toLowerCase();
  const provides = (unit) =>
    unit.split('|').some((part) => part === wanted || (wanted === 'darkness' && part === 'dark'));
  return units.filter(provides).length - cost.filter((symbol) => symbol === wanted).length;
}

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
  defenderRuleBox: (cond, ctx) => (cond.values || [cond.value]).some((value) => defenderIsKind(ctx, value)),
  movedToActiveThisTurn: (cond, ctx) => ctx.attackerMovedToActiveThisTurn === true,
  evolvedThisTurn: (cond, ctx) =>
    ctx.attackerEvolvedThisTurn === true &&
    (!cond.fromNames ||
      cond.fromNames.every((name) => list(ctx.attackerStackNames).some((actual) => nameMatches(actual, name)))),
  defenderMaxHp: (cond, ctx) => compare(num(ctx.defenderMaxHp), cond.op, cond.n),
  defenderRemainingHpVsAttacker: (cond, ctx) =>
    compare(num(ctx.defenderRemainingHp), cond.op, num(ctx.attackerRemainingHp)),
  defenderHasSpecialEnergy: (cond, ctx) => num(ctx.defenderSpecialEnergyCount) > 0,
  defenderAnyStatus: (cond, ctx) => list(ctx.defenderConditions).length > 0,
  attackerAnyStatus: (cond, ctx) => list(ctx.attackerConditions).length > 0,
  defenderKindOrName: (cond, ctx) =>
    cond.values.some((value) => defenderIsKind(ctx, value)) ||
    new RegExp(`\\b${escapeRegExp(String(cond.nameWord || ''))}\\b`, 'i').test(String(ctx.defenderName || '')),
  defenderName: (cond, ctx) => list(cond.names).some((name) => nameMatches(ctx.defenderName, name)),
  opponentInPlayKind: (cond, ctx) =>
    list(ctx.opponentInPlayKinds).some((kinds) => cond.values.some((value) => list(kinds).includes(value))),
  defenderAbility: (cond, ctx) => list(ctx.defenderAbilityKinds).some((kind) => list(cond.abilityKinds).includes(kind)),
  ownInPlayAbility: (cond, ctx) =>
    list(ctx.ownInPlayAbilityKinds).some((kinds) => list(kinds).some((kind) => list(cond.abilityKinds).includes(kind))),
  defenderResistance: (cond, ctx) =>
    list(ctx.defenderResistanceTypes).some((type) => String(type).toLowerCase() === String(cond.type).toLowerCase()),
  healedThisTurn: (cond, ctx) => ctx.attackerHealedThisTurn === true,
  damagedLastOpponentTurn: (cond, ctx) => num(ctx.attackerDamageTakenLastTurn) > 0,
  handEnergyAttachedThisTurn: (cond, ctx) => {
    const types = list(ctx.attackerHandEnergyTypesThisTurn);
    if (!cond.type) return types.length > 0;
    return types.some((type) => String(type).toLowerCase() === String(cond.type).toLowerCase());
  },
  supporterPlayedThisTurn: (cond, ctx) => {
    const names = list(ctx.supporterNamesThisTurn);
    if (cond.names) return cond.names.some((wanted) => names.some((actual) => nameMatches(actual, wanted)));
    if (cond.nameContains) {
      const word = String(cond.nameContains).toLowerCase();
      return names.some((actual) => String(actual).toLowerCase().includes(word));
    }
    return ctx.supporterPlayedThisTurn === true || names.length > 0;
  },
  usedAttackLastTurn: (cond, ctx) =>
    String(ctx.attackerLastTurnAttackName || '').toLowerCase() === String(cond.attackName).toLowerCase(),
  koLastOpponentTurn: (cond, ctx) =>
    list(ctx.koLastOpponentTurnVictims).some(
      (victim) =>
        (!cond.byAttackDamage || victim?.byAttackDamage === true) &&
        (!cond.type || list(victim?.types).some((t) => String(t).toLowerCase() === String(cond.type).toLowerCase()))
    ),
  handPokemonCount: (cond, ctx) => compare(num(ctx.ownHandPokemonCount), cond.op, cond.n),
  benchVsOpponent: (cond, ctx) => compare(list(ctx.benchNames).length, cond.op, num(ctx.opponentBenchCount)),
  damagedBench: (cond, ctx) =>
    list(ctx.benchDamaged).some(
      (damaged, i) =>
        damaged === true &&
        (!cond.type ||
          list(list(ctx.benchTypes)[i]).some((t) => String(t).toLowerCase() === String(cond.type).toLowerCase()))
    ),
  discardHasName: (cond, ctx) =>
    list(cond.names).every((name) => list(ctx.ownDiscardNames).some((actual) => nameMatches(actual, name))),
  stackHasName: (cond, ctx) =>
    list(cond.names).every((name) => list(ctx.attackerStackNames).some((actual) => nameMatches(actual, name))),
  prizesVsOpponent: (cond, ctx) => compare(num(ctx.ownPrizes), cond.op, num(ctx.opponentPrizes)),
  attackerSpecialEnergy: (cond, ctx) => num(ctx.specialEnergyOnSelfCount) > 0,
  attackerExtraEnergy: (cond, ctx) => extraEnergyCount(ctx, cond.type) >= num(cond.n),
  energyVsDefender: (cond, ctx) => compare(num(ctx.energyCount), cond.op, num(ctx.opponentEnergyCount)),
  defenderEnergyCount: (cond, ctx) => compare(num(ctx.opponentEnergyCount), cond.op, cond.n),
  attackerToolCount: (cond, ctx) => compare(num(ctx.attackerToolCount), cond.op, cond.n),
  defenderToolCount: (cond, ctx) => compare(num(ctx.defenderToolCount), cond.op, cond.n),
  stadiumOwner: (cond, ctx) => ctx.stadiumOwner === cond.owner,
  namedCardInPlay: (cond, ctx) =>
    list(cond.names).every((name) =>
      [ctx.stadiumName, ...list(ctx.allInPlayNames)].some((actual) => nameMatches(actual, name))
    ),
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
  'defenderAnyStatus',
  'defenderKindOrName',
  'defenderName',
  'defenderAbility',
  'defenderResistance',
  'energyVsDefender',
  'defenderEnergyCount',
  'defenderToolCount',
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
