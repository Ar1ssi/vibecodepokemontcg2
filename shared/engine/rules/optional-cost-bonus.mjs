/**
 * @file Optional-cost damage bonuses: "You may <cost>. If you do, this attack does N more damage."
 *
 * The player chooses before damage whether to pay; the reducer offers the cost, pays it, and
 * passes `ctx.optionalCostPaid` to parseAttackDamage, whose "if you do" condition reads it.
 * Only costs the reducer can pay are read; any other wording returns null (no offer, no bonus).
 * Per-card scalings ("… more damage for each card you discarded") belong to the discard/mill
 * scaling parsers and are not read here.
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
  [
    /^put an? (?:\{([a-z])\} )?energy(?: card)? attached to this pokémon into your hand$/,
    (m) => ({ kind: 'returnEnergy', energyType: LETTER_TYPES[m[1]] || null }),
  ],
  [
    /^return all (?:\{([a-z])\} )?energy(?: cards?)? attached to this pokémon to your hand$/,
    (m) => ({ kind: 'returnEnergy', all: true, energyType: LETTER_TYPES[m[1]] || null }),
  ],
  [/^discard a stadium(?: card)? in play$/, () => ({ kind: 'discardStadium' })],
  [/^show your hand to your opponent$/, () => ({ kind: 'showHand' })],
  [/^put up to (\d+) damage counters on this pokémon$/, (m) => ({ kind: 'selfCounters', upTo: Number(m[1]) })],
];

// "If you do, this attack does [N damage plus] M more damage [for each …]". A "for each" tail
// scales: the damage parser gates that scaling on the paid cost.
const BONUS =
  /^if you do(?: and if ([^,]+))?, this attack does (?:\d+ damage plus )?(\d+) more damage( for each [^.(]+)?/;

// Slaking Dynamic Swing: "You may do 100 more damage. If you do, <drawback>."
const DO_MORE = /^you may do (\d+) more damage\.$/;

/**
 * @param {string} attackText Printed attack text
 * @param {string} [selfName] The attacker's printed name (older prints name themselves)
 * @returns {{ cost: object, bonus: number, extraCondition: string|null, perEach: boolean }|null}
 */
export function optionalCostBonusClause(attackText, selfName = '') {
  const sentences = normalizeAttackText(attackText, selfName).split(/(?<=\.)\s+/);
  for (let i = 0; i < sentences.length - 1; i++) {
    const doMore = DO_MORE.exec(sentences[i]);
    const drawback = doMore && /^if you do, (.+)$/.exec(sentences[i + 1]);
    if (drawback) {
      return {
        cost: { kind: 'drawback', text: drawback[1] },
        bonus: Number(doMore[1]),
        extraCondition: null,
        perEach: false,
      };
    }
    const offer = /^you may (.+)\.$/.exec(sentences[i]);
    const bonus = offer && BONUS.exec(sentences[i + 1]);
    if (!bonus) continue;
    for (const [re, build] of COSTS) {
      const m = re.exec(offer[1]);
      if (m) {
        return {
          cost: build(m),
          bonus: Number(bonus[2]),
          extraCondition: bonus[1] || null,
          perEach: Boolean(bonus[3]),
        };
      }
    }
    return null;
  }
  return null;
}
