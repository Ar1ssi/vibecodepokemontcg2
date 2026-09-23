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
import {
  attachDiscardToBenchSpread,
  deckMillScaling,
  parseAttackSearchClause,
} from './damage-parser.mjs';

const WORD_COUNTS = { a: 1, an: 1, one: 1, two: 2, three: 3 };

function countOf(word) {
  const w = String(word || '').trim();
  if (/^\d+$/.test(w)) return Number(w);
  return WORD_COUNTS[w] || 1;
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
  if (name) {
    out = out.replace(new RegExp(`(?<![\\w'])${escapeRegExp(name)}(?![\\w'])`, 'g'), 'this pokémon');
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

  // Discard from the opponent
  [
    /^discard (an?|\d+|all|up to \d+) (special )?energy(?: cards?)? (?:from|attached to) your opponent's active pokémon$/,
    (m) => ({ type: 'atkDiscardOppEnergy', scope: 'active', ...discardCount(m[1]), ...(m[2] ? { special: true } : {}) }),
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
  [/^discard a random card from your opponent's hand$/, () => ({ type: 'atkDiscardOppHand', random: true, count: 1 })],
  [
    /^your opponent discards (an?|\d+) cards? from their hand$/,
    (m) => ({ type: 'atkDiscardOppHand', count: countOf(m[1]) }),
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

  // Attach from the discard pile / hand
  [
    new RegExp(String.raw`^attach (an?|up to \d+|\d+|any number of) ${ENERGY_TYPE}energy cards? from your (discard pile|hand) to (this pokémon|1 of your (?:benched )?pokémon|your (?:benched )?pokémon in any way you like)$`),
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
    /^put a special energy attached to 1 of your opponent's pokémon in the lost zone$/,
    () => ({ type: 'atkLostZoneEnergy', from: 'opponentAny', count: 1, special: true }),
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

  [/^have your opponent shuffle their deck$/, () => ({ type: 'atkShuffleOppDeck' })],

  // Leave play
  [/^shuffle this pokémon and all attached cards into your deck$/, () => ({ type: 'atkShuffleSelf' })],

  // Damage counters
  [
    /^put (\d+) damage counters? on each of your opponent's (benched )?pokémon$/,
    (m) => ({ type: 'atkCountersEach', count: Number(m[1]), scope: m[2] ? 'bench' : 'all' }),
  ],
  [
    /^move all damage counters from 1 of your benched pokémon to your opponent's active pokémon$/,
    () => ({ type: 'atkMoveAllCounters' }),
  ],

  // Devolve
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

  // Prizes / Knock Out
  [/^(?:discard all energy from this pokémon, and )?take (a|\d+) prize cards?$/, (m) => ({ type: 'atkTakePrize', count: countOf(m[1]) })],
  [/^your opponent's active pokémon is knocked out$/, () => ({ type: 'atkKnockOut', condition: null })],
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

  // Heal your side
  [
    /^heal (\d+|all) damage from (?:each|all) of your (benched )?pokémon$/,
    (m) => ({ type: 'atkHealEach', ...(m[1] === 'all' ? { all: true } : { amount: Number(m[1]) }), scope: m[2] ? 'bench' : 'all' }),
  ],
];

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
    /choose a random card from your opponent's hand\. your opponent reveals that card and shuffles it into their deck\./g,
    () => ({ type: 'atkOppHandRandomToDeck' }),
  ],
  [
    /(?:(if heads|for each heads), )?(you may )?search your deck for [^.]*? and attach (?:it|them) to [^.]*\.(?: then,? shuffle your deck\.)?/g,
    (m) => searchAttachStep(m[0], m[1], Boolean(m[2])),
  ],
];

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
    // Reminder text never carries an effect ("(Your opponent chooses the new Active Pokémon.)").
    .replace(/\s*\([^)]*\)/g, '');
  if (!normalized) return result;

  const blockSteps = [];
  for (const [re, build] of BLOCKS) {
    normalized = normalized.replace(re, (...args) => {
      const step = build(args);
      if (!step) return args[0];
      blockSteps.push(step);
      if (step.type === 'searchAbility') result.handlesSearch = true;
      return ` @block${blockSteps.length - 1}. `;
    });
  }

  // Plain mill only when the damage parser does not already mill for scaling.
  const millHandled = Boolean(deckMillScaling(text));

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
    const chained = ATTACH_CHAIN.exec(sentence);
    const previous = result.after[result.after.length - 1];
    if (chained && !isAttachStep(previous)) continue;
    const { rest, flags } = stripGates(chained ? sentence.slice(chained[0].length) : sentence);
    if (chained) flags.requiresAttach = true;
    const templates = chained ? [...CHAIN_TEMPLATES, ...TEMPLATES] : TEMPLATES;
    for (const [re, build] of templates) {
      const m = re.exec(rest);
      if (!m) continue;
      const step = build(m, rest);
      if (!step) break;
      if (step.type === 'atkMill' && millHandled) break;
      const { before, ...stepFlags } = flags;
      (before ? result.before : result.after).push({ ...step, ...stepFlags });
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
  return result;
}
