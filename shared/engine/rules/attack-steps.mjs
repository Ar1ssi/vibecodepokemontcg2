/**
 * @file Printed attack clauses → resumable executor steps (design 030).
 *
 * The server attack phase runs damage, recoil, statuses, spread, draws, self Energy discards,
 * locks and deck searches through dedicated helpers. Every other clause is read here, one
 * anchored sentence template at a time, and emitted as a step for `executeSteps`
 * (handlers: effects/attack-steps.mjs, plus existing executor cases). A sentence that matches
 * no template is ignored: a missing effect is safer than a wrong one.
 * Pure: no state, no randomness.
 */

import { parseAbility } from './abilities.mjs';
import { MARKER_TEMPLATES, parseMarkerSentence } from './attack-markers.mjs';
import {
  attachDiscardToBenchSpread,
  deckMillScaling,
  parseAttackSearchClause,
} from './damage-parser.mjs';
import { parseEachFilter } from './each-filter.mjs';

const WORD_COUNTS = { a: 1, an: 1, one: 1, two: 2, three: 3 };

function countOf(word) {
  const w = String(word || '').trim();
  if (/^\d+$/.test(w)) return Number(w);
  return WORD_COUNTS[w] || 1;
}

// Design 036 A9: "put N damage counters on each [of your opponent's] [benched] Pokémon
// <filter>". "Each Defending Pokémon" is the Active. An unowned "each Pokémon" is both
// sides: every such card prints "(both yours and your opponent's)", which the parser strips
// as reminder text. The plain opponent-wide form stays atkCountersEach.
function countersEachFiltered([, amount, opponentWord, bench, noun, tail]) {
  const filter = parseEachFilter(tail);
  if (filter === undefined) return null;
  const count = countOf(amount);
  if (noun === 'defending pokémon') {
    if (opponentWord || bench) return null;
    return { type: 'atkCountersEachFiltered', count, side: 'opponent', scope: 'active', filter };
  }
  return {
    type: 'atkCountersEachFiltered',
    count,
    side: opponentWord ? 'opponent' : 'both',
    scope: bench ? 'bench' : 'all',
    filter,
  };
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Lowercases and flattens printed wording so one template covers every printing era:
 * the attacker's own name and "the Defending Pokémon" become "this pokémon" /
 * "your opponent's active pokémon", and "his or her" becomes "their".
 */
export function normalizeAttackText(text, selfName = '') {
  let out = String(text || '')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/pokemon/g, 'pokémon');
  const name = String(selfName || '').trim().toLowerCase();
  // A card may print its own name short: "Charizard G LV.X" as "Charizard G",
  // "Deoxys Defense Forme" as "Deoxys".
  const shortNames = [name.replace(/ lv\.x$/, ''), name.replace(/\s+\S+\s+forme$/, '')];
  for (const printed of new Set([name, ...shortNames])) {
    if (!printed) continue;
    out = out.replace(new RegExp(`(?<![\\w'])${escapeRegExp(printed)}(?![\\w'])`, 'g'), 'this pokémon');
  }
  return out
    .replace(/\bthe defending pokémon\b/g, "your opponent's active pokémon")
    .replace(/\bhis or her\b/g, 'their');
}

// Leading clauses that gate a sentence on the attack's own coin flip, move it before
// damage, or make it optional. One gate per sentence; "You may" may follow another gate.
const GATES = [
  [/^if heads, /, { gate: 'heads' }],
  [/^if tails, /, { gate: 'tails' }],
  [/^for each heads, /, { perHeads: true }],
  [/^before doing damage, /, { before: true }],
  [/^after your attack, /, {}],
  [/^after doing damage, /, {}],
  [/^then, /, {}],
];

function stripGates(sentence) {
  let rest = sentence;
  const flags = {};
  for (const [re, flag] of GATES) {
    if (re.test(rest)) {
      rest = rest.replace(re, '');
      Object.assign(flags, flag);
      break;
    }
  }
  if (/^you may /.test(rest)) {
    rest = rest.replace(/^you may /, '');
    flags.optional = true;
  }
  return { rest, flags };
}

const ENERGY_TYPE = String.raw`(?:basic )?(?:\{([a-z])\} )?(?:basic )?`;

// "heal 30 damage" / "heal all damage" / "remove 3 damage counters" / "remove a damage counter".
const HEAL = String.raw`(?:heal (\d+|all) damage|remove (\d+|an?|all) damage counters?)`;

// The two HEAL captures → a step amount in damage counters, or `all`.
function healAmount(healWord, removeWord) {
  const word = healWord ?? removeWord;
  if (word === 'all') return { all: true };
  if (healWord != null) return { count: Math.floor(Number(healWord) / 10) };
  return { count: countOf(removeWord) };
}

// ── single-sentence templates ───────────────────────────────────────────────
// Each entry: [regex, (match, sentence) => step | null]. The regex is anchored on the
// sentence with its gate removed and its final period stripped.
const TEMPLATES = [
  // Switch / gust
  [/^switch this pokémon with 1 of your benched pokémon(?:, if any)?$/, () => ({ type: 'atkSwitchSelf' })],
  [
    /^(?:switch (?:in )?1 of your opponent's benched pokémon (?:with|to) (?:their active pokémon|your opponent's active pokémon|the active spot)|switch your opponent's active pokémon with 1 of (?:their|your opponent's) benched pokémon(?:, if any)?)$/,
    () => ({ type: 'atkGust', chooser: 'self' }),
  ],
  [
    /^(?:switch out your opponent's active pokémon to the bench|have your opponent switch (?:their|your opponent's) active pokémon with 1 of their benched pokémon|your opponent switches (?:their|your opponent's) active pokémon with 1 of their benched pokémon(?:, if any)?)$/,
    () => ({ type: 'atkGust', chooser: 'opponent' }),
  ],

  // Move Energy
  [
    new RegExp(String.raw`^move (an?|\d+|all) ${ENERGY_TYPE}energy(?: cards?)? (?:from|attached to) this pokémon to 1 of your benched pokémon$`),
    (m, s) => ({
      type: 'atkMoveEnergy',
      from: 'self',
      to: 'bench',
      ...(m[1] === 'all' ? { all: true } : { count: countOf(m[1]) }),
      ...energyFilter(m[2], s),
    }),
  ],
  [
    new RegExp(String.raw`^move all ${ENERGY_TYPE}energy(?: cards?)? (?:from|attached to) this pokémon to your benched pokémon in any way you like$`),
    (m, s) => ({ type: 'atkMoveEnergy', from: 'self', to: 'bench', all: true, spread: true, ...energyFilter(m[1], s) }),
  ],
  [
    new RegExp(String.raw`^move (an?|any number of|any amount of) ${ENERGY_TYPE}energy(?: cards?)? from (?:1 of )?your benched pokémon to this pokémon$`),
    (m, s) => ({
      type: 'atkMoveEnergy',
      from: 'bench',
      to: 'self',
      ...(/any/.test(m[1]) ? { anyNumber: true } : { count: 1 }),
      ...energyFilter(m[2], s),
    }),
  ],
  [
    new RegExp(String.raw`^move (?:any number of|any amount of|as many) ${ENERGY_TYPE}energy(?: cards?)? (?:from|attached to) your pokémon to your other pokémon in any way you like$`),
    (m, s) => ({ type: 'atkMoveEnergy', from: 'any', to: 'any', anyNumber: true, spread: true, ...energyFilter(m[1], s) }),
  ],
  [
    new RegExp(String.raw`^move (an?|\d+) ${ENERGY_TYPE}energy(?: cards?)? (?:from|attached to) 1 of your benched pokémon to your active pokémon$`),
    (m, s) => ({ type: 'atkMoveEnergy', from: 'bench', to: 'active', count: countOf(m[1]), ...energyFilter(m[2], s) }),
  ],
  [
    new RegExp(String.raw`^move an? ${ENERGY_TYPE}energy(?: cards?)? (?:from|attached to) 1 of your pokémon to another of your pokémon$`),
    (m, s) => ({ type: 'atkMoveEnergy', from: 'any', to: 'any', count: 1, ...energyFilter(m[1], s) }),
  ],
  [
    /^move (\d+|a) damage counters? from 1 of your ((?:[a-z'.-]+ )*?)pokémon to another of your pokémon$/,
    (m) => ({
      type: 'atkMoveCounterBetween',
      count: countOf(m[1]),
      ...(m[2].trim() ? { fromName: m[2].trim() } : {}),
    }),
  ],
  [/^switch a card from your hand with the top card of your deck$/, () => ({ type: 'atkHandDeckTopSwap' })],
  [
    /^switch 1 of your opponent's face-down prize cards with the top card of their deck$/,
    () => ({ type: 'atkOpponentPrizeDeckSwap' }),
  ],
  [
    new RegExp(String.raw`^move an? ${ENERGY_TYPE}energy(?: card)? from your opponent's active pokémon to 1 of their benched pokémon$`),
    (m, s) => ({ type: 'atkMoveEnergy', from: 'opponentActive', to: 'opponentBench', count: 1, ...energyFilter(m[1], s) }),
  ],

  // Self Energy discard behind the attack's own coin (design 032); parseAttackSteps drops
  // the ungated form, which parseAttackEnergyDiscard runs.
  [
    /^discard (an?|\d+|all) (?:\{([a-z])\} )?energy(?: cards?)? (?:from|attached to) this pokémon$/,
    (m) => ({
      type: 'atkDiscardSelfEnergy',
      ...discardCount(m[1]),
      ...(m[2] ? { energyType: m[2].toUpperCase() } : {}),
    }),
  ],

  // Discard from the opponent
  [
    /^discard (an?|\d+|all|up to \d+) (special )?energy(?: cards?)? (?:from|attached to) your opponent's active pokémon(?:, if any)?$/,
    (m) => ({ type: 'atkDiscardOppEnergy', scope: 'active', ...discardCount(m[1]), ...(m[2] ? { special: true } : {}) }),
  ],
  // Blastoise ex Hyper Whirlpool: the opponent picks the Energy.
  [
    /^your opponent discards (an?|\d+) (special )?energy(?: cards?)? (?:from|attached to) your opponent's active pokémon$/,
    (m) => ({
      type: 'atkDiscardOppEnergy',
      scope: 'active',
      count: countOf(m[1]),
      chooser: 'opponent',
      ...(m[2] ? { special: true } : {}),
    }),
  ],
  // Smoochum Psykiss
  [
    /^choose a special energy card attached to 1 of your opponent's pokémon and have your opponent shuffle that card into their deck$/,
    () => ({ type: 'atkDiscardOppEnergy', scope: 'any', count: 1, special: true, toDeck: true }),
  ],
  [
    /^discard an? (special )?energy(?: card)? (?:from|attached to) each of your opponent's pokémon$/,
    (m) => ({ type: 'atkDiscardOppEnergy', scope: 'each', count: 1, ...(m[1] ? { special: true } : {}) }),
  ],
  [
    /^discard (an?|\d+|up to \d+) (special )?energy(?: cards?)? (?:from|attached to) (?:1 of )?your opponent's pokémon$/,
    (m) => ({ type: 'atkDiscardOppEnergy', scope: 'any', ...discardCount(m[1]), ...(m[2] ? { special: true } : {}) }),
  ],
  [
    /^discard (all|an?|up to \d+) pokémon tools?(?: cards?)? (?:from|attached to) your opponent's (active )?pokémon$/,
    (m) => ({ type: 'atkDiscardOppTools', scope: m[2] ? 'active' : 'any', ...discardCount(m[1]) }),
  ],
  [
    /^(?:discard a random card from your opponent's hand|choose 1 card from your opponent's hand without looking and discard it)$/,
    () => ({ type: 'atkDiscardOppHand', random: true, count: 1 }),
  ],
  [
    /^your opponent discards (an?|\d+) cards? from their hand$/,
    (m) => ({ type: 'atkDiscardOppHand', count: countOf(m[1]) }),
  ],

  // Own-hand discards (design 036 A11). A cost the attack cannot be used without, or a discard
  // the damage counts, moves before damage in parseAttackSteps; "If you do, …" chains on it.
  [/^discard your hand$/, () => ({ type: 'atkDiscardOwnHand', count: 'all' })],
  [/^discard any number of cards from your hand$/, () => ({ type: 'atkDiscardOwnHand', count: 'any' })],
  [/^discard (an?|\d+) cards? from your hand$/, (m) => ({ type: 'atkDiscardOwnHand', count: countOf(m[1]) })],
  [
    new RegExp(String.raw`^discard (an?|\d+) ${ENERGY_TYPE}energy cards? from your hand$`),
    (m, s) => ({ type: 'atkDiscardHandEnergy', count: countOf(m[1]), ...energyFilter(m[2], s) }),
  ],

  // Raichu LV.X Voltage Shoot: the hand discard pays for the chosen-target damage, so it
  // runs before damage and the attack is refused without the cards (handEnergyDiscardCost).
  [
    new RegExp(String.raw`^discard (an?|\d+) ${ENERGY_TYPE}energy cards? from your hand and choose 1 of your opponent's pokémon$`),
    (m, s) => ({ type: 'atkDiscardHandEnergy', count: countOf(m[1]), ...energyFilter(m[2], s), beforeDamage: true }),
  ],

  // Mill (the "for each card discarded" forms are deckMillScaling's; see parseAttackSteps)
  [
    /^discard the top (?:(\d+) cards|card) (?:of|from) (your|your opponent's|each player's) deck$/,
    (m) => ({
      type: 'atkMill',
      side: m[2] === 'your' ? 'self' : m[2] === 'each player\'s' ? 'each' : 'opponent',
      count: m[1] ? Number(m[1]) : 1,
    }),
  ],
  [
    /^your opponent discards the top (?:(\d+) cards|card) (?:of|from) their deck$/,
    (m) => ({ type: 'atkMill', side: 'opponent', count: m[1] ? Number(m[1]) : 1 }),
  ],

  // Attach from the discard pile / hand
  [
    new RegExp(String.raw`^attach (an?|up to \d+|\d+|any number of) ${ENERGY_TYPE}energy cards? from your (discard pile|hand) to (this pokémon|1 of your (?:benched )?pokémon|your (?:benched )?pokémon(-ex)? in any way you like)$`),
    (m, s) => {
      if (attachDiscardToBenchSpread(s)) return null;
      const target = m[4];
      return {
        type: 'atkAttach',
        source: m[3] === 'hand' ? 'hand' : 'discard',
        ...attachCount(m[1]),
        ...energyFilter(m[2], s),
        target: target === 'this pokémon' ? 'self' : /benched/.test(target) ? 'bench' : 'any',
        ...(/any way you like/.test(target) ? { spread: true } : {}),
        // Sableye Energy Hunt: only the old uppercase Pokémon-EX.
        ...(m[5] ? { targetEx: true } : {}),
      };
    },
  ],

  // Draws
  [/^draw cards until you have (\d+) cards in your hand$/, (m) => ({ type: 'drawUntil', target: Number(m[1]) })],
  [/^discard your hand and draw (\d+) cards$/, (m) => ({ type: 'discardHandThenDraw', count: Number(m[1]) })],

  // Discard pile → Bench / hand
  [
    new RegExp(String.raw`^put (up to \d+|an?|\d+) (basic )?(?:\{([a-z])\} )?pokémon(?: with (\d+) hp or less)?(?: cards?)? from your discard pile onto your bench$`),
    (m) => ({
      type: 'atkBenchFromDiscard',
      ...attachCount(m[1]),
      ...(m[3] ? { pokemonType: m[3] } : {}),
      ...(m[4] ? { maxHp: Number(m[4]) } : {}),
    }),
  ],
  [
    /^put (up to \d+|an?|\d+) (trainer|item|supporter|pokémon tool|stadium|basic energy|energy|pokémon) cards? from your discard pile into your hand$/,
    (m) => ({ type: 'atkRecover', ...attachCount(m[1]), what: recoverWhat(m[2]) }),
  ],
  // Any card: Dialga-EX Reverse Edge, Xatu Warp Hole, Unown Hidden Power
  [/^put a card from your discard pile into your hand$/, () => ({ type: 'atkRecover', count: 1, what: null })],
  [
    /^(?:choose a card from your discard pile and put it|search your discard pile for a card, show it to your opponent, and put it) on top of your deck$/,
    () => ({ type: 'atkRecover', count: 1, what: null, to: 'deckTop' }),
  ],

  // Old wording of an attach from the discard pile ("Search your discard pile for … and attach it to …")
  [
    new RegExp(String.raw`^search your discard pile for (an?|up to \d+|\d+|as many) ${ENERGY_TYPE}energy cards?(?: as you like)? and attach (?:it|them) to (this pokémon|1 of your (?:benched )?pokémon|your (?:benched )?pokémon in any way you like)$`),
    (m, s) => {
      const target = m[3];
      return {
        type: 'atkAttach',
        source: 'discard',
        ...(m[1] === 'as many' ? { anyNumber: true } : attachCount(m[1])),
        ...energyFilter(m[2], s),
        target: target === 'this pokémon' ? 'self' : /benched/.test(target) ? 'bench' : 'any',
        ...(/any way you like/.test(target) ? { spread: true } : {}),
      };
    },
  ],

  // Lost Zone
  [
    /^put the top (?:(\d+) cards|card) of (your|your opponent's) deck in the lost zone$/,
    (m) => ({ type: 'atkLostZoneDeckTop', side: m[2] === 'your' ? 'self' : 'opponent', count: m[1] ? Number(m[1]) : 1 }),
  ],
  [
    new RegExp(String.raw`^put (any number of|any amount of|as many|an?|\d+) ${ENERGY_TYPE}energy(?: cards?)? attached to (this pokémon|your pokémon|your opponent's active pokémon|1 of your opponent's pokémon)(?: as you like)? in the lost zone$`),
    (m, s) => ({
      type: 'atkLostZoneEnergy',
      from: { 'this pokémon': 'self', 'your pokémon': 'yours', "your opponent's active pokémon": 'opponentActive' }[m[3]] || 'opponentAny',
      ...(/any|as many/.test(m[1]) ? { anyNumber: true } : { count: countOf(m[1]) }),
      ...energyFilter(m[2], s),
    }),
  ],
  [
    /^(?:put all energy(?: cards)? attached to this pokémon in the lost zone|remove all energy cards attached to this pokémon and put them in the lost zone)$/,
    () => ({ type: 'atkLostZoneEnergy', from: 'self', all: true }),
  ],
  // Design 036 A12: Lost Zone from a hand, the discard pile, or play.
  [
    /^(?:put (an?|\d+) cards? from your hand in the lost zone|choose (a|1) card from your hand and put it in the lost zone)$/,
    (m) => ({ type: 'atkLostZoneFromHand', count: countOf(m[1] || m[2]) }),
  ],
  [
    /^choose (a|1) pokémon from your hand and put it in the lost zone$/,
    () => ({ type: 'atkLostZoneFromHand', count: 1, what: 'pokemon' }),
  ],
  [
    /^(?:put a random card from your opponent's hand in the lost zone|choose 1 card from your opponent's hand without looking and put it in the lost zone)$/,
    () => ({ type: 'atkLostZoneOppHandRandom', count: 1 }),
  ],
  [
    /^put (an?|\d+) cards? from your opponent's discard pile in the lost zone$/,
    (m) => ({ type: 'atkLostZoneOppDiscard', count: countOf(m[1]) }),
  ],
  [/^put this pokémon and all (?:attached cards|cards attached to it) in the lost zone$/, () => ({ type: 'atkLostZoneSelf' })],
  [
    /^put your opponent's active pokémon and all cards attached to it in the lost zone$/,
    () => ({ type: 'atkLostZoneOppActive' }),
  ],
  [
    /^put a special energy attached to 1 of your opponent's pokémon in the lost zone$/,
    () => ({ type: 'atkLostZoneEnergy', from: 'opponentAny', count: 1, special: true }),
  ],
  // Dialga G LV.X Remove Lost
  [
    /^remove (an?|\d+) energy cards? attached to your opponent's active pokémon and put (?:it|them) in the lost zone$/,
    (m) => ({ type: 'atkLostZoneEnergy', from: 'opponentActive', count: countOf(m[1]) }),
  ],
  [
    /^put any number of (pokémon tool|item|trainer) cards from your discard pile in the lost zone$/,
    (m) => ({ type: 'atkLostZoneFromDiscard', what: recoverWhat(m[1]), anyNumber: true }),
  ],

  // Energy back to the opponent's hand
  [
    /^put (an?|\d+) energy(?: cards?)? attached to your opponent's active pokémon into their hand$/,
    (m) => ({ type: 'atkDiscardOppEnergy', scope: 'active', count: countOf(m[1]), toHand: true }),
  ],

  // Self care
  [
    /^(?:this pokémon recovers from all special conditions|remove all special conditions from this pokémon)$/,
    () => ({ type: 'atkCureSelf' }),
  ],
  [
    /^heal from this pokémon the same amount of damage you did to your opponent's active pokémon$/,
    () => ({ type: 'atkMirrorHeal' }),
  ],

  // Choose-and-Knock-Out
  [
    /^knock out 1 of your opponent's pokémon(?: in play)? that has (?:exactly (\d+) damage counters on it|(\d+) hp or less remaining)$/,
    (m) => ({
      type: 'atkKnockOutChoose',
      ...(m[1] ? { exactCounters: Number(m[1]) } : { maxRemainingHp: Number(m[2]) }),
    }),
  ],
  // A4 (design 036): least remaining HP among every Pokémon in play except the attacker
  // (Inteleon/Greninja Bring Down, Gardevoir LV.X Bring Down), and Noivern Radiant Hunt.
  [
    /^choose a pokémon in play that has the least hp remaining, except for this pokémon, and it is knocked out$/,
    () => ({ type: 'atkKnockOutChoose', leastHp: true }),
  ],
  [
    /^the pokémon that has the least hp remaining, except for this pokémon, is knocked out$/,
    () => ({ type: 'atkKnockOutChoose', leastHp: true }),
  ],
  [
    /^choose 1 pokémon with the fewest remaining hp and that pokémon is now knocked out$/,
    () => ({ type: 'atkKnockOutChoose', leastHp: true }),
  ],
  [
    /^knock out 1 of your opponent's radiant pokémon$/,
    () => ({ type: 'atkKnockOutChoose', ruleBox: 'radiant' }),
  ],

  [/^have your opponent shuffle their deck$/, () => ({ type: 'atkShuffleOppDeck' })],

  // Leave play
  [/^shuffle this pokémon and all (?:attached cards|cards attached to it) (?:back )?into your deck$/, () => ({ type: 'atkShuffleSelf' })],
  [/^shuffle your hand into your deck$/, () => ({ type: 'atkShuffleHandIntoDeck' })],
  [/^draw up to (\d+) cards$/, (m) => ({ type: 'atkDraw', count: Number(m[1]), upTo: true })],
  [/^draw (a|an|\d+) cards?$/, (m) => ({ type: 'atkDraw', count: countOf(m[1]) })],
  [/^draw a number of cards equal to the number of cards in your opponent's hand$/, () => ({ type: 'atkDraw', countFrom: 'opponentHand' })],
  [
    /^if your opponent's active pokémon is (asleep|paralyzed|poisoned|burned|confused), your opponent shuffles all energy from it into their deck$/,
    (m) => ({ type: 'atkShuffleOppActiveEnergy', condition: m[1][0].toUpperCase() + m[1].slice(1) }),
  ],

  // Damage counters
  [
    /^put (\d+) damage counters? on each of your opponent's (benched )?pokémon$/,
    (m) => ({ type: 'atkCountersEach', count: Number(m[1]), scope: m[2] ? 'bench' : 'all' }),
  ],
  [
    /^put (\d+|a|an) damage counters? (?:on )?each (of your opponent's |)(benched )?(pokémon|defending pokémon)(.*)$/,
    countersEachFiltered,
  ],
  // N's Vanilluxe Snow Coating / Lunala Lunar Pain / Aegislash Painful Sword.
  [/^double the number of damage counters on each of your opponent's pokémon$/, () => ({ type: 'atkDoubleCountersEach' })],
  // Yveltal ex Soul Destroyer.
  [
    /^knock out each of your opponent's pokémon that has (\d+) hp or less remaining$/,
    (m) => ({ type: 'atkKnockOutAll', maxRemainingHp: Number(m[1]) }),
  ],
  [
    /^put damage counters on (1 of your opponent's pokémon|your opponent's active pokémon) until its remaining hp is (\d+)$/,
    (m) => ({ type: 'atkHpCap', target: m[1].startsWith('1 of') ? 'opponentAny' : 'opponentActive', hp: Number(m[2]) }),
  ],
  [
    /^move all damage counters from 1 of your benched pokémon to your opponent's active pokémon$/,
    () => ({ type: 'atkMoveAllCounters' }),
  ],

  // Opponent's Active back to their hand (Fan Rotom Spin Storm, Unown Hidden Power)
  [
    /^your opponent returns your opponent's active pokémon and all cards attached to it to their hand$/,
    () => ({ type: 'atkBounceOppActive' }),
  ],

  // Devolve
  [
    /^choose 1 of either player's evolved pokémon, remove the highest stage evolution card from that pokémon, and put it into that player's hand$/,
    () => ({ type: 'atkDevolve', scope: 'chooseAny', to: 'hand' }),
  ],
  [
    /^devolve each of your opponent's evolved pokémon (?:by shuffling|and shuffle) the highest stage evolution card on it into your opponent's deck$/,
    () => ({ type: 'atkDevolve', scope: 'all', to: 'deck' }),
  ],
  [
    /^devolve each of your opponent's evolved pokémon (?:by putting|and put) the highest stage evolution card on it into your opponent's hand$/,
    () => ({ type: 'atkDevolve', scope: 'all', to: 'hand' }),
  ],
  [
    /^if your opponent's active pokémon is an evolved pokémon, devolve it by putting the highest stage evolution card on it into your opponent's hand$/,
    () => ({ type: 'atkDevolve', scope: 'active', to: 'hand' }),
  ],

  // Alolan Exeggutor ex Swinging Sphene
  [/^knock out your opponent's active basic pokémon$/, () => ({ type: 'atkKnockOut', condition: 'basic' })],
  [
    /^knock out 1 of your opponent's benched basic pokémon$/,
    () => ({ type: 'atkKnockOutChoose', scope: 'bench', basicOnly: true }),
  ],

  // Porygon2 Delta Beam: "choose whether … becomes Asleep, Confused, or Paralyzed"
  [
    /^choose whether your opponent's active pokémon becomes ((?:asleep|burned|confused|paralyzed|poisoned)(?:,? (?:or )?(?:asleep|burned|confused|paralyzed|poisoned))+)$/,
    (m) => ({ type: 'atkChooseCondition', options: conditionList(m[1]) }),
  ],

  // Prizes / Knock Out
  [/^(?:discard all energy from this pokémon, and )?take (a|\d+) prize cards?$/, (m) => ({ type: 'atkTakePrize', count: countOf(m[1]) })],
  [/^your opponent's active pokémon is knocked out$/, () => ({ type: 'atkKnockOut', condition: null })],
  // A4 (design 036): the Active is Knocked Out when its printed condition holds
  // (Haxorus Axe Blast, Haxorus Bring Down the Axe, Armaldo Reaping Claw), and the
  // "Both Active Pokémon are Knocked Out" wording (Annihilape, Forretress, Beedrill).
  [
    /^if your opponent's active pokémon is a basic pokémon, (?:it|that pokémon) is knocked out$/,
    () => ({ type: 'atkKnockOut', condition: 'basic' }),
  ],
  [
    /^if your opponent's active pokémon has any special energy attached, (?:it|that pokémon) is knocked out$/,
    () => ({ type: 'atkKnockOut', condition: 'specialEnergy' }),
  ],
  [
    /^if your opponent's active pokémon has (\d+) hp or less remaining, (?:it|that pokémon) is knocked out$/,
    (m) => ({ type: 'atkKnockOut', condition: 'maxRemainingHp', maxRemainingHp: Number(m[1]) }),
  ],
  [/^both active pokémon are knocked out$/, () => ({ type: 'atkKnockOut', scope: 'both' })],
  [
    /^if your opponent's active pokémon is affected by a special condition, (?:it|that pokémon) is knocked out$/,
    () => ({ type: 'atkKnockOut', condition: 'specialCondition' }),
  ],
  [
    /^if your opponent's active pokémon is (asleep|paralyzed|poisoned|burned|confused), (?:it|that pokémon) is knocked out$/,
    (m) => ({ type: 'atkKnockOut', condition: m[1][0].toUpperCase() + m[1].slice(1) }),
  ],
  [
    /^if your opponent's active pokémon has exactly (\d+) damage counters on it, (?:it|that pokémon) is knocked out$/,
    (m) => ({ type: 'atkKnockOut', condition: 'exactCounters', counters: Number(m[1]) }),
  ],

  // Heal (design 036 A6). Amounts are damage counters (`count`, so "For each heads" scales
  // them) or `all`; "heal 30 damage" is 3 counters.
  [
    new RegExp(String.raw`^${HEAL} from (?:each|all) of your (benched )?(basic )?(?:\{([a-z])\} )?pokémon(?: that has any (?:\{([a-z])\} )?(energy) attached to it)?$`),
    (m) => ({
      type: 'atkHealEach',
      ...healAmount(m[1], m[2]),
      scope: m[3] ? 'bench' : 'all',
      ...(m[4] ? { basicOnly: true } : {}),
      ...(m[5] ? { pokemonType: m[5] } : {}),
      ...(m[7] ? { hasEnergy: true, ...(m[6] ? { energyType: m[6].toUpperCase() } : {}) } : {}),
    }),
  ],
  [
    new RegExp(String.raw`^${HEAL} from each pokémon$`),
    (m) => ({ type: 'atkHealEach', ...healAmount(m[1], m[2]), scope: 'all', side: 'both' }),
  ],
  [
    new RegExp(String.raw`^${HEAL} from both active pokémon$`),
    (m) => ({ type: 'atkHealCounted', ...healAmount(m[1], m[2]), target: 'bothActive' }),
  ],
  [
    new RegExp(String.raw`^(?:discard (?:an?|\d+) (?:\{[a-z]\} )?energy(?: cards?)? (?:attached to|from) this pokémon and )?${HEAL} from this pokémon$`),
    (m) => ({ type: 'atkHealCounted', ...healAmount(m[1], m[2]), target: 'self' }),
  ],
  [
    new RegExp(String.raw`^discard (?:an?|\d+) (?:\{[a-z]\} )?energy(?: cards?)? (?:attached to|from) this pokémon and ${HEAL} from it$`),
    (m) => ({ type: 'atkHealCounted', ...healAmount(m[1], m[2]), target: 'self' }),
  ],
  [
    /^remove all special conditions and (\d+|an?|all) damage counters? from this pokémon$/,
    (m) => ({ type: 'atkHealCounted', ...healAmount(undefined, m[1]), target: 'self', cure: true }),
  ],
  [
    new RegExp(String.raw`^${HEAL} (?:and remove all special conditions from this pokémon|from this pokémon, and it recovers from all special conditions)$`),
    (m) => ({ type: 'atkHealCounted', ...healAmount(m[1], m[2]), target: 'self', cure: true }),
  ],
  [
    new RegExp(String.raw`^${HEAL} from your opponent's active pokémon$`),
    (m) => ({ type: 'atkHealCounted', ...healAmount(m[1], m[2]), target: 'opponentActive' }),
  ],
  [
    new RegExp(String.raw`^${HEAL} from (\d+) of your (benched )?(?:\{([a-z])\} )?pokémon$`),
    (m) => ({
      type: 'atkHealCounted',
      ...healAmount(m[1], m[2]),
      target: 'chosen',
      scope: m[4] ? 'bench' : 'all',
      ...(Number(m[3]) > 1 ? { targets: Number(m[3]) } : {}),
      ...(m[5] ? { pokemonType: m[5] } : {}),
    }),
  ],
  // "If heads, this attack does 20 more damage and heal 20 damage from this Pokémon": the
  // damage half is the damage parser's; the heal follows the same coin.
  [
    new RegExp(String.raw`^this attack does \d+ (?:more )?damage(?: plus \d+ more damage)?,? and ${HEAL} from this pokémon$`),
    (m) => ({ type: 'atkHealCounted', ...healAmount(m[1], m[2]), target: 'self' }),
  ],
  // Mr. Mime E4 Magic Heal / Lopunny Healing Wish: one counter per heads.
  [
    /^remove a number of damage counters equal to the number of heads from (your pokémon in any way you like|1 of your pokémon)$/,
    (m) => ({ type: 'atkHealCounted', count: 1, perHeads: true, target: /any way/.test(m[1]) ? 'distribute' : 'chosen', scope: 'all' }),
  ],
  // The drain wordings: as many counters as the damage this attack did.
  [
    /^(?:remove from this pokémon the number of damage counters equal to the damage you did to your opponent's active pokémon|remove a number of damage counters from this pokémon equal to the damage done to your opponent's active pokémon)$/,
    () => ({ type: 'atkMirrorHeal' }),
  ],

  // Timed effects on later turns (design 031)
  ...MARKER_TEMPLATES,
];

const SPECIAL_CONDITIONS = ['Asleep', 'Burned', 'Confused', 'Paralyzed', 'Poisoned'];

function conditionList(phrase) {
  return phrase.match(/asleep|burned|confused|paralyzed|poisoned/g).map((c) => c[0].toUpperCase() + c.slice(1));
}

function energyFilter(symbol, sentence) {
  const basic = /\bbasic\b/.test(sentence.split(/ from /)[0]);
  return {
    ...(symbol ? { energyType: symbol.toUpperCase() } : {}),
    ...(basic ? { basic: true } : {}),
  };
}

function discardCount(word) {
  if (word === 'all') return { all: true };
  const upTo = /^up to (\d+)$/.exec(word);
  if (upTo) return { count: Number(upTo[1]), upTo: true };
  return { count: countOf(word) };
}

function attachCount(word) {
  if (word === 'any number of') return { anyNumber: true };
  const upTo = /^up to (\d+)$/.exec(word);
  if (upTo) return { count: Number(upTo[1]), upTo: true };
  return { count: countOf(word) };
}

function recoverWhat(kind) {
  const map = {
    trainer: 'Trainer',
    item: 'Item',
    supporter: 'Supporter',
    'pokémon tool': 'Pokémon Tool',
    stadium: 'Stadium',
    'basic energy': 'Basic Energy',
    energy: 'Energy',
    pokémon: 'Pokémon',
  };
  return map[kind];
}

// ── multi-sentence templates ────────────────────────────────────────────────
// Clauses printed across sentences. Each match is replaced by a placeholder sentence so its
// position in the printed order is kept.
const BLOCKS = [
  [
    /look at the top (\d+) cards of your deck(?:, and|\.) you may put any number of (basic )?pokémon you find there onto your bench\. shuffle the other cards back into your deck\./g,
    (m) => ({ type: 'atkBenchFromDeckTop', look: Number(m[1]) }),
  ],
  [
    /look at the top (\d+) cards of your deck(?:, choose (\d+) of them,)? and put (\d+|it) (?:of them )?into your hand\. (shuffle the other cards back into your deck|put the other cards in the lost zone)\./g,
    (m) => ({
      type: 'atkLookTopTake',
      look: Number(m[1]),
      take: m[2] ? Number(m[2]) : m[3] === 'it' ? 1 : Number(m[3]),
      rest: /lost zone/.test(m[4]) ? 'lostZone' : 'shuffle',
    }),
  ],
  [
    /choose (\d+) of your opponent's benched pokémon\. shuffle those pokémon and all attached cards into your opponent's deck\./g,
    (m) => ({ type: 'atkShuffleOppBench', count: Number(m[1]) }),
  ],
  [
    /(?:choose (a|\d+) random cards? from your opponent's hand\. your opponent reveals (?:that card|those cards) and shuffles (?:it|them)|choose 1 card from your opponent's hand without looking\. look at (?:the|that) card you chose, then have your opponent shuffle that card) into their deck\./g,
    (m) => ({ type: 'atkOppHandRandomToDeck', count: countOf(m[1]) }),
  ],
  // Articuno Freeze Solid / Zapdos Plasma / Moltres Collect Fire: the condition only decides
  // whether the coin is flipped; with no such Energy the step finds nothing either way.
  [
    /if there are any \{([a-z])\} energy cards in your discard pile, flip a coin\. if heads, attach 1 of them to this pokémon\./g,
    (m) => ({ type: 'atkAttach', source: 'discard', count: 1, energyType: m[1].toUpperCase(), target: 'self', gate: 'heads' }),
  ],
  // Kakuna Dangerous Evolution: evolves the attacker from the deck.
  [
    /search your deck for an evolution card that evolves from this pokémon and put it onto this pokémon\. shuffle your deck afterward\./g,
    () => ({ type: 'searchEvolve', ontoSource: true }),
  ],
  // Octillery Smokescreen Shot / Eevee VMAX G-Max Cuddle: the opponent flips when attacking.
  [
    /during your opponent's next turn, if your opponent's active pokémon tries to (?:use an )?attack, your opponent flips a coin\. if tails, that attack doesn't happen\./g,
    () => ({ type: 'atkAddMarker', target: 'opponentActive', window: 'opponentNextTurn', marker: { kind: 'attackFlipOrFail' } }),
  ],
  // Machamp LV.X Strong-Willed: the printed name is the attacker's short name, so any name.
  [
    /during your opponent's next turn, if [^,.]+ would be knocked out by damage from an attack, flip a coin\. if heads, [^,.]+ is not knocked out and its remaining hp becomes 10 instead\./g,
    () => ({ type: 'atkAddMarker', target: 'self', window: 'opponentNextTurn', marker: { kind: 'surviveKnockOutCoin' } }),
  ],
  // Bellossom Miracle Powder / Tropius Miracle Blow
  [
    /choose 1 special condition\. your opponent's active pokémon is now affected by that special condition\./g,
    () => ({ type: 'atkChooseCondition', options: SPECIAL_CONDITIONS }),
  ],
  // Staraptor Strong Breeze: on top of the deck, then shuffled — the same as shuffled in.
  [
    /put 1 of your opponent's benched pokémon and all cards attached to it on top of your opponent's deck\. your opponent shuffles their deck afterward\./g,
    () => ({ type: 'atkShuffleOppBench', count: 1 }),
  ],
  // Dark Feraligatr Crushing Blow / Vaporeon Aqua Trick: the condition only decides whether
  // the coin is flipped; with no Energy the step finds nothing either way.
  [
    /if your opponent's active pokémon has any energy cards attached to it, flip a coin\. if heads, choose 1 of those (?:energy )?cards and discard it\./g,
    () => ({ type: 'atkDiscardOppEnergy', scope: 'active', count: 1, gate: 'heads' }),
  ],
  [
    /if your opponent's active pokémon has any energy cards attached to it, flip a coin\. if heads, choose 1 of those energy cards and move it to 1 of your opponent's benched pokémon\.(?: if your opponent has no benched pokémon, ignore this effect\.)?/g,
    () => ({ type: 'atkMoveEnergy', from: 'opponentActive', to: 'opponentBench', count: 1, gate: 'heads' }),
  ],
  // "If you do" after a discard: the marker runs only when the discard happened (design 033).
  // Iron Treads ex Iron-Clad Roll.
  [
    /(?<=^|\. )(?:after doing damage, )?(you may )?discard all ([a-z][a-z' -]*?) from this pokémon\. if you do, ([^.]+)\./g,
    (m) => chainedMarkerStep({ type: 'atkDiscardSelfTool', toolName: m[2].replace(/s$/, ''), ...(m[1] ? { optional: true } : {}) }, m[3]),
  ],
  // Flygon Desert Geyser.
  [
    /(?<=^|\. )if your opponent has a stadium in play, discard it\. if you discarded a stadium in this way, ([^.]+)\./g,
    (m) => chainedMarkerStep({ type: 'atkDiscardStadium', owner: 'opponent' }, m[1]),
  ],
  // Eternatus World Ender: the discard is the cost its gate names (the gate itself lives in
  // rules/attack-conditions.mjs). The block consumes both sentences so no bare template picks
  // up the other "Discard a Stadium in play." printings, whose damage bonus is not modelled yet.
  [
    /discard a stadium in play\. if you can't, this attack does nothing\./g,
    () => ({ type: 'atkDiscardStadium', owner: 'any' }),
  ],
  // Mime Jr. Encore ("can use only") / Unown Amnesia ("can't use"): an attack lock marker on
  // the opponent's Active, read by the attack legality gate.
  [
    /choose 1 of your opponent's active pokémon's attacks\. (?:during your opponent's next turn, that pokémon (can't use|can use only) that attack|that pokémon (can't use|can use only) that attack during your opponent's next turn)\./g,
    (m) => ({ type: 'atkLockAttack', mode: (m[1] || m[2]) === "can't use" ? 'except' : 'only' }),
  ],
  // Unown T Hidden Power: each player loses 1 hand card to their deck, picked by the other.
  [
    /look at your opponent's hand and choose 1 card, then have your opponent shuffle that card into their deck\. then, show your opponent your hand and (?:they choose|he or she chooses) 1 card\. shuffle that card into your deck\./g,
    () => ({ type: 'atkHandCardsToDecks' }),
  ],
  // Inkay Mischievous Tentacles / Gothorita Fortunate Eye.
  [
    /look at the top card of your opponent's deck\. you may have your opponent shuffle their deck\./g,
    () => ({ type: 'atkLookOppDeck', count: 1, offerShuffle: true }),
  ],
  [
    /look at the top (\d+) cards of your opponent's deck and put them back in any order\./g,
    (m) => ({ type: 'atkLookOppDeck', count: Number(m[1]), reorder: true }),
  ],
  // Only at a sentence start (behind a coin gate at most), so "if you do, your opponent
  // reveals …" stays unparsed instead of losing its condition.
  [
    /(?<=(?:^|\. )(?:(?:if heads|if tails|for each heads), )?)your opponent reveals their hand(?:, and you discard (a) card you find there|\. (discard|choose|add) (a|\d+|all) (trainer |supporter )?cards? (?:you find there|from it)(?: (and put it on the bottom of their deck|to their prize cards face down))?)?\./g,
    (m) => revealHandStep(m[1] ? 'discard' : m[2], m[1] || m[3], m[4], m[5]),
  ],
];

// Read after BLOCKS, which take their coin gate from the sentence start (see gatedBlock).
const SEARCH_ATTACH_BLOCK = [
  /(?:(if heads|for each heads), )?(you may )?search your deck for [^.]*? and attach (?:it|them) to [^.]*\.(?: then,? shuffle your deck\.)?/g,
  (m) => searchAttachStep(m[0], m[1], Boolean(m[2])),
];

const BLOCK_GATES = { 'if heads': { gate: 'heads' }, 'if tails': { gate: 'tails' }, 'for each heads': { perHeads: true } };

// A block optionally behind the attack's own coin gate at a sentence start
// ("If heads, choose 1 card from your opponent's hand without looking. …"): the gate is
// kept on the step, so resolveCoinGates drops or scales it like a one-sentence clause.
function gatedBlock([re, build]) {
  const gated = new RegExp(String.raw`(?:(?<=^|\. )(if heads|if tails|for each heads), )?(?:${re.source})`, 'g');
  return [
    gated,
    ([whole, gate, ...rest]) => {
      const step = build([whole.replace(/^(?:if heads|if tails|for each heads), /, ''), ...rest]);
      return step && gate ? { ...step, ...BLOCK_GATES[gate] } : step;
    },
  ];
}

const ALL_BLOCKS = [...BLOCKS.map(gatedBlock), SEARCH_ATTACH_BLOCK];

// A step whose follow-up sentence is a timed marker: `then` holds the marker step, or the
// whole block stays unread when the follow-up is not a marker the templates know.
function chainedMarkerStep(step, markerSentence) {
  const wrOrder = /<wr:(before|after)>/.exec(markerSentence)?.[1];
  const then = parseMarkerSentence(markerSentence.replace(/\s*<wr:(?:before|after)>/g, '').trim(), { wrOrder });
  return then ? { ...step, then } : null;
}

// "Your opponent reveals their hand. Discard a Trainer card you find there." →
// { type: 'atkRevealOppHand', then: { action: 'discard', count: 1, filter: 'trainer' } }.
// A bare reveal has no `then`; "choose … and put" / "add … to" name the destination.
function revealHandStep(verb, countWord, kindWord, destination) {
  if (!verb) return { type: 'atkRevealOppHand' };
  let action = 'discard';
  if (verb === 'choose') {
    if (!/bottom of their deck/.test(destination || '')) return null;
    action = 'deckBottom';
  } else if (verb === 'add') {
    if (!/prize cards/.test(destination || '')) return null;
    action = 'prize';
  } else if (destination) {
    return null;
  }
  const filter = kindWord ? kindWord.trim() : undefined;
  return {
    type: 'atkRevealOppHand',
    then: { action, count: countWord === 'all' ? 'all' : countOf(countWord), ...(filter ? { filter } : {}) },
  };
}

// "search your deck for up to 2 Basic {G} Energy cards" → { what, count, upTo }
function searchEnergyParams(body) {
  const m = /^search your deck for (an?|up to \d+|\d+) (basic )?(?:\{([a-z])\} )?(basic )?energy cards?/.exec(body);
  if (!m) return null;
  const basic = m[2] || m[4] ? 'Basic ' : '';
  const type = m[3] ? `{${m[3].toUpperCase()}} ` : '';
  return { what: `${basic}${type}Energy`, ...attachCount(m[1]) };
}

function searchAttachStep(clause, gate, optional) {
  const body = clause.replace(/^(?:if heads|for each heads), /, '').replace(/^you may /, '');
  const parsed = parseAbility(body);
  const steps = Array.isArray(parsed) ? parsed : parsed?.steps || [];
  const search = steps.find((s) => s.type === 'searchAbility' && s.destination === 'attach');
  if (!search) return null;
  // The ability parser reads the attach target; the attack search parser reads the card
  // filter ("a Lightning Energy card" → Basic Lightning Energy), which the ability one drops.
  // Both parsers miss a plain count ("2 {G} Energy cards"), read here first.
  const clauseParams = searchEnergyParams(body) || parseAttackSearchClause(body) || {};
  const { guidance, ...step } = search;
  return {
    ...step,
    ...(clauseParams.what ? { what: clauseParams.what } : {}),
    ...(clauseParams.count ? { count: clauseParams.count } : {}),
    ...(clauseParams.upTo ? { upTo: true } : {}),
    // "You may search": finding nothing is the way to decline.
    ...(optional ? { upTo: true } : {}),
    ...(gate === 'if heads' ? { gate: 'heads' } : {}),
    ...(gate === 'for each heads' ? { perHeads: true } : {}),
  };
}

// "Once during your turn, you may …" and the other activation wordings an Ability's effect
// follows. A preamble with its own condition ("if this Pokémon is on your Bench, …") is not
// stripped, so the effect is not read without it.
const ABILITY_PREAMBLE =
  /^(?:(?:once during your turn|as often as you like during your turn|during your turn|when you play this pokémon from your hand to evolve 1 of your pokémon during your turn), (?:you may use this (?:ability|power)\. )?(?:you may )?)/;

/**
 * An activated Ability's effect read with the attack templates (I89, I95): the effect half
 * of the text, after the activation preamble. Empty when the text is not an activated
 * Ability the templates can read in full order.
 *
 * @param {string} text Printed Ability text
 * @param {{ selfName?: string }} [options] The holder's printed name
 * @returns {{ steps: object[], holderZone: 'active'|'bench'|null }} `holderZone` is where
 *   the holder must be for the Ability to work, when the text says so.
 */
export function parseAbilityEffectSteps(text, { selfName = '' } = {}) {
  const normalized = normalizeAttackText(text, selfName).replace(/\s*\([^)]*\)/g, '');
  if (!ABILITY_PREAMBLE.test(normalized)) return { steps: [], holderZone: null };
  let effect = normalized.replace(ABILITY_PREAMBLE, '');
  // "if this Pokémon is in the Active Spot / on your Bench, …" is the one condition read.
  let holderZone = null;
  const position = HOLDER_POSITION.exec(effect);
  if (position) {
    holderZone = /bench/.test(position[1]) ? 'bench' : 'active';
    effect = effect.slice(position[0].length);
  }
  if (/^if /.test(effect)) return { steps: [], holderZone: null };
  const parsed = parseAttackSteps(effect);
  return { steps: [...parsed.before, ...parsed.after], holderZone };
}

const HOLDER_POSITION =
  /^if this pokémon is (in the active spot|your active pokémon|on your bench), (?:you may )?/;

/**
 * Applies a coin result to gated steps: "If heads/tails" steps are dropped on the other face
 * and "For each heads" steps scale their count by the heads flipped.
 *
 * @param {object[]} steps
 * @param {{ coin: 'heads'|'tails'|null, headsCount?: number }} flip
 * @returns {object[]}
 */
export function resolveCoinGates(steps, { coin, headsCount }) {
  const heads = coin === 'heads' ? Math.max(1, headsCount || 0) : headsCount || 0;
  return steps
    .filter((step) => {
      if (step.gate === 'heads') return coin === 'heads';
      if (step.gate === 'tails') return coin === 'tails';
      if (step.perHeads) return heads > 0;
      return true;
    })
    .map(({ gate, perHeads, ...step }) => (perHeads ? { ...step, count: (step.count || 1) * heads } : step));
}

const ATTACH_CHAIN = /^if (?:you do|you attached energy (?:to this pokémon )?in this way), /;
const HAND_COST_TYPES = new Set(['atkDiscardOwnHand', 'atkDiscardHandEnergy', 'atkLostZoneFromHand']);

function isAttachStep(step) {
  return step?.type === 'atkAttach' || (step?.type === 'searchAbility' && step.destination === 'attach');
}

// Sentences that only make sense after an attach: "it" / "that Pokémon" is the Pokémon the
// Energy went to.
const CHAIN_TEMPLATES = [
  [/^switch it with 1 of your benched pokémon$/, () => ({ type: 'atkSwitchSelf' })],
  [
    /^heal (\d+) damage from that pokémon$/,
    (m) => ({ type: 'healAbility', amount: Number(m[1]), target: 'attached Pokémon' }),
  ],
];

/**
 * @param {string} text Printed attack effect text
 * @param {{ selfName?: string }} [options] The attacker's printed name ("Mew ex")
 * @returns {{ before: object[], after: object[], handlesSearch: boolean }}
 *   `before` runs ahead of damage ("Before doing damage, …"); `after` runs after it.
 *   `handlesSearch` means a deck search-and-attach was emitted here, so the attack
 *   phase's own search clause must not run it again.
 */
export function parseAttackSteps(text, { selfName = '' } = {}) {
  const result = { before: [], after: [], handlesSearch: false };
  let normalized = normalizeAttackText(text, selfName)
    // Keeps the Weakness order of timed damage changes as a token each sentence lifts off.
    .replace(/\s*\((before|after) applying weakness and resistance\)/g, ' <wr:$1>')
    // Reminder text never carries an effect ("(Your opponent chooses the new Active Pokémon.)").
    .replace(/\s*\([^)]*\)/g, '');
  if (!normalized) return result;

  const blockSteps = [];
  for (const [re, build] of ALL_BLOCKS) {
    normalized = normalized.replace(re, (...args) => {
      const step = build(args);
      if (!step) return args[0];
      blockSteps.push(step);
      if (step.type === 'searchAbility' || step.type === 'searchEvolve') result.handlesSearch = true;
      return ` @block${blockSteps.length - 1}. `;
    });
  }

  // Plain mill only when the damage parser does not already mill for scaling.
  const millHandled = Boolean(deckMillScaling(text));
  // A gated self discard runs as a step unless the damage counts it (Raikou Lightning
  // Sphere) or the printed cost can cancel the attack (Charizard Blast Burn): neither is
  // modelled, and a partial effect is worse than none.
  const selfDiscardOpen = !/discarded in this way|this attack does nothing/.test(
    normalizeAttackText(text, selfName)
  );

  for (const raw of normalized.split(/(?<=\.)\s+/)) {
    const sentence = raw.trim().replace(/\.$/, '');
    if (!sentence) continue;
    const block = /^@block(\d+)$/.exec(sentence);
    if (block) {
      result.after.push(blockSteps[Number(block[1])]);
      continue;
    }
    // "If you do, …" / "If you attached Energy in this way, …" after an attach: the executor
    // runs it only when the attach happened (requiresAttach, I93).
    const wrOrder = /<wr:(before|after)>/.exec(sentence)?.[1];
    const plain = sentence.replace(/\s*<wr:(?:before|after)>/g, '');
    const chained = ATTACH_CHAIN.exec(plain);
    const previous = result.after[result.after.length - 1];
    // "Discard a card from your hand. If you do, draw 3 cards." runs only when the hand paid.
    const handChain = Boolean(chained) && /^if you do, /.test(plain) && HAND_COST_TYPES.has(previous?.type);
    if (chained && !handChain && !isAttachStep(previous)) continue;
    const { rest, flags } = stripGates(chained ? plain.slice(chained[0].length) : plain);
    if (handChain) flags.requiresHandCost = true;
    else if (chained) flags.requiresAttach = true;
    const templates = chained && !handChain ? [...CHAIN_TEMPLATES, ...TEMPLATES] : TEMPLATES;
    for (const [re, build] of templates) {
      const m = re.exec(rest);
      if (!m) continue;
      const step = build(m, rest, { wrOrder });
      if (!step) break;
      if (step.type === 'atkMill' && millHandled) break;
      if (step.type === 'atkDiscardSelfEnergy' && !(selfDiscardOpen && (flags.gate || flags.perHeads))) break;
      const { before, ...stepFlags } = flags;
      const { beforeDamage, ...built } = step;
      (before || beforeDamage ? result.before : result.after).push({ ...built, ...stepFlags });
      break;
    }
  }

  // "This attack does N damage for each card put in the Lost Zone in this way": the Lost
  // Zone step is the cost the damage counts, so it runs before damage and is counted.
  if (/for each (?:energy )?cards? (?:you )?put in the lost zone in this way/.test(normalized)) {
    const costs = result.after.filter((step) => step.type.startsWith('atkLostZone'));
    result.after = result.after.filter((step) => !costs.includes(step));
    result.before.push(...costs.map((step) => ({ ...step, countsForDamage: true })));
  }

  // A hand cost the attack cannot be used without ("(If you can't discard a card from your hand,
  // this attack does nothing.)") pays before damage, and the legality gate refuses the attack
  // without the cards (D114). A discard the damage counts ("If you do, this attack does 70 more
  // damage") also runs first, and the reducer counts it.
  const handCost = /if you (?:can't|don't)[^.]*this attack does nothing/.test(normalizeAttackText(text, selfName));
  const handScaled = /(?:if you do|if you discarded [^,]* in this way), this attack does/.test(normalized);
  if (handCost || handScaled) {
    const costs = result.after.filter((step) => HAND_COST_TYPES.has(step.type));
    result.after = result.after.filter((step) => !costs.includes(step));
    result.before.push(...costs.map((step) => (handScaled ? { ...step, countsForDamage: true } : step)));
  }
  return result;
}
