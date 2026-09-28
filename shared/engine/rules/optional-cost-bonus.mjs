/**
 * @file Cost-for-damage clauses the reducer settles before damage:
 *   "You may <cost>. If you do, this attack does N more damage."
 *   "Discard an Energy … in order to use this attack. If the discarded card is …" (mandatory)
 *   "Put up to 12 damage counters on this Pokémon. This attack does 20 damage for each …"
 *
 * The reducer offers the cost, pays it, and passes `ctx.optionalCostPaid` (and the paid count)
 * to parseAttackDamage, whose "if you do" condition reads it; a discarded card is recorded for
 * "If you discard a {F} Energy card in this way" conditions. Only costs the reducer can pay are
 * read; any other wording returns null (no offer, no bonus). Per-card scalings ("… for each card
 * you discarded") belong to the discard/mill scaling parsers and are not read here.
 * Pure.
 */

import { normalizeAttackText } from './attack-text.mjs';

const LETTER_TYPES = {
  g: 'Grass',
  r: 'Fire',
  w: 'Water',
  l: 'Lightning',
  p: 'Psychic',
  f: 'Fighting',
  d: 'Darkness',
  m: 'Metal',
  y: 'Fairy',
  n: 'Dragon',
  c: 'Colorless',
};

const COUNT_WORDS = { a: 1, an: 1 };

// Each entry: [anchored cost wording, match → cost descriptor].
const COSTS = [
  [
    /^discard (all|an?|\d+) (basic )?(?:\{([a-z])\} )?energy(?: cards?)? (?:attached to|from) this pokémon$/,
    (m) => ({
      kind: 'discardEnergy',
      ...(m[1] === 'all' ? { all: true } : { count: COUNT_WORDS[m[1]] || Number(m[1]) }),
      energyType: LETTER_TYPES[m[3]] || null,
      basicOnly: Boolean(m[2]),
    }),
  ],
  // Magcargo Crushing Lava: "discard a {R} or {F} basic Energy card attached to Magcargo".
  [
    /^discard an? \{([a-z])\} or \{([a-z])\} (basic )?energy cards? (?:attached to|from) this pokémon$/,
    (m) => ({
      kind: 'discardEnergy',
      count: 1,
      energyType: [LETTER_TYPES[m[1]], LETTER_TYPES[m[2]]].filter(Boolean),
      basicOnly: Boolean(m[3]),
    }),
  ],
  [
    /^put an? (?:\{([a-z])\} )?energy(?: card)? attached to this pokémon into your hand$/,
    (m) => ({ kind: 'returnEnergy', energyType: LETTER_TYPES[m[1]] || null }),
  ],
  [
    /^return all (?:\{([a-z])\} )?energy(?: cards?)? attached to this pokémon to your hand$/,
    (m) => ({ kind: 'returnEnergy', all: true, energyType: LETTER_TYPES[m[1]] || null }),
  ],
  [/^discard (?:a|any) stadium(?: card)? in play$/, () => ({ kind: 'discardStadium' })],
  [/^show your hand to your opponent$/, () => ({ kind: 'showHand' })],
  [/^put up to (\d+) damage counters on this pokémon$/, (m) => ({ kind: 'selfCounters', upTo: Number(m[1]) })],
];

const costOf = (wording) => {
  for (const [re, build] of COSTS) {
    const m = re.exec(wording);
    if (m) return build(m);
  }
  return null;
};

// "If you do [and if …], this attack does [N damage plus] M more damage [for each …]", or the
// discard-reading form "If you discard a {F} Energy card in this way, …". A "for each" tail
// scales: the damage parser gates that scaling on the paid cost.
const BONUS =
  /^if (?:you do(?: and if ([^,]+))?|you discard[^,]* in this way), this attack does (?:\d+ damage plus )?(\d+) more damage( for each [^.(]+)?/;

// Flareon Burn Booster: a mandatory cost whose discarded card the bonus reads.
const MANDATORY = /^(discard .+?) in order to use this attack\.$/;
const DISCARDED_BONUS = /^if the discarded card is [^,]+, this attack does (?:\d+ damage plus )?(\d+) more damage/;

// Slaking Dynamic Swing: "You may do 100 more damage. If you do, <drawback>." Older prints:
// "You may do 40 damage plus 60 more damage. If you do, Electrode does 100 damage to itself."
// M Ampharos-EX Exavolt adds "… and leave your opponent's Active Pokémon Paralyzed".
const DO_MORE =
  /^you may do (?:\d+ damage plus )?(\d+) more damage(?: and leave your opponent's active pokémon (asleep|burned|confused|paralyzed|poisoned))?\.$/;

// Ampharos Lightning Strike / Staraptor FB LV.X Defog: "If you do, this attack's base damage is
// 80 instead of 40." — the bonus is the difference.
const BASE_BONUS = /^if you do, this attack's base damage is (\d+) instead of (\d+)/;

const PUT_COUNTERS = /^put up to (\d+) damage counters on this pokémon\.$/;
const PER_COUNTER = /^this attack does (\d+) (?:more )?damage for each damage counter you (?:put|placed)(?: on this pokémon)? in this way\.$/;

const stripPeriod = (sentence) => sentence.replace(/\.$/, '');

/**
 * @param {string} attackText Printed attack text
 * @param {string} [selfName] The attacker's printed name (older prints name themselves)
 * @returns {{ cost: object, bonus: number, extraCondition: string|null, perEach: boolean,
 *   mandatory?: boolean, consumed?: string[] }|null} `consumed` lists the normalized sentences
 *   this clause owns, so the step parser does not also run them.
 */
export function optionalCostBonusClause(attackText, selfName = '') {
  const sentences = normalizeAttackText(attackText, selfName).split(/(?<=\.)\s+/);
  for (let i = 0; i < sentences.length - 1; i++) {
    // Annihilape ex Angry Grudge: a mandatory "up to" cost the damage counts.
    const counters = PUT_COUNTERS.exec(sentences[i]);
    const scaled = counters && PER_COUNTER.exec(sentences[i + 1]);
    if (scaled) {
      return {
        cost: { kind: 'selfCounters', upTo: Number(counters[1]) },
        bonus: Number(scaled[1]),
        extraCondition: null,
        perEach: true,
        mandatory: true,
        consumed: [stripPeriod(sentences[i])],
      };
    }
    const mandatory = MANDATORY.exec(sentences[i]);
    const readsDiscard = mandatory && DISCARDED_BONUS.exec(sentences[i + 1]);
    const mandatoryCost = readsDiscard && costOf(mandatory[1]);
    if (mandatoryCost) {
      return {
        cost: mandatoryCost,
        bonus: Number(readsDiscard[1]),
        extraCondition: null,
        perEach: false,
        mandatory: true,
        consumed: [stripPeriod(sentences[i])],
      };
    }
    const doMore = DO_MORE.exec(sentences[i]);
    const drawback = doMore && /^if you do, (.+)$/.exec(sentences[i + 1]);
    if (drawback) {
      const condition = doMore[2] ? doMore[2][0].toUpperCase() + doMore[2].slice(1) : null;
      return {
        cost: { kind: 'drawback', text: drawback[1], ...(condition ? { condition } : {}) },
        bonus: Number(doMore[1]),
        extraCondition: null,
        perEach: false,
      };
    }
    // Dark Magcargo: "… when you use this attack"; Staraptor FB LV.X: "Before doing damage, you may …".
    const offer = /^(?:before doing damage, )?you may (.+?)(?: when you use this attack)?\.$/.exec(sentences[i]);
    if (!offer) continue;
    const base = BASE_BONUS.exec(sentences[i + 1] || '');
    const baseCost = base && costOf(offer[1]);
    if (baseCost) {
      return {
        cost: baseCost,
        bonus: Number(base[1]) - Number(base[2]),
        extraCondition: null,
        perEach: false,
        consumed: [stripPeriod(sentences[i]), stripPeriod(sentences[i + 1])],
      };
    }
    // The bonus may follow a sibling clause ("If you discard a {R} … Burned. If you discard a
    // {F} …, this attack does 40 damage plus 20 more damage.").
    const bonusAt = [i + 1, i + 2].find((j) => BONUS.test(sentences[j] || ''));
    if (bonusAt === undefined) continue;
    const bonus = BONUS.exec(sentences[bonusAt]);
    const cost = costOf(offer[1]);
    if (!cost) return null;
    return {
      cost,
      bonus: Number(bonus[2]),
      extraCondition: bonus[1] || null,
      perEach: Boolean(bonus[3]),
      consumed: [stripPeriod(sentences[i])],
    };
  }
  return null;
}
