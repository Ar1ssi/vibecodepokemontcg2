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
import { normalizeAttackText } from './attack-text.mjs';
import { optionalCostBonusClause } from './optional-cost-bonus.mjs';

const WORD_COUNTS = { a: 1, an: 1, one: 1, two: 2, three: 3 };

function countOf(word) {
  const w = String(word || '').trim();
  if (/^\d+$/.test(w)) return Number(w);
  return WORD_COUNTS[w] || 1;
}

// Card kinds a printed play lock names ("Pokémon Tool, Special Energy, or Stadium") → the
// kinds reduce.mjs playLockReason compares against. No list is "any card".
const PLAY_LOCK_KINDS = {
  item: ['item'],
  supporter: ['supporter'],
  stadium: ['stadium'],
  trainer: ['trainer'],
  'pokémon tool': ['tool'],
  'special energy': ['specialEnergy'],
  'basic energy': ['basicEnergy'],
  energy: ['basicEnergy', 'specialEnergy'],
};

function playLockStep(list, toEvolve) {
  if (toEvolve) return list === 'pokémon' ? { type: 'atkOppPlayLock', kinds: ['evolve'] } : null;
  if (!list || /^cards?$/.test(list)) return { type: 'atkOppPlayLock', kinds: ['any'] };
  const names = list.split(/,\s*(?:or\s+)?|\s+or\s+/).map((name) => name.trim());
  const kinds = names.map((name) => PLAY_LOCK_KINDS[name]);
  return kinds.every(Boolean) ? { type: 'atkOppPlayLock', kinds: kinds.flat() } : null;
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

// Re-exported: callers import the normalizer from here (attack-text.mjs is the leaf home).
export { normalizeAttackText };

// Leading clauses that gate a sentence on the attack's own coin flip, move it before
// damage, or make it optional. One gate per sentence; "You may" may follow another gate.
const GATES = [
  [/^if heads, /, { gate: 'heads' }],
  [/^if tails, /, { gate: 'tails' }],
  [/^for each heads, /, { perHeads: true }],
  [/^before doing damage, /, { before: true }],
  // Hypno Spiral Aura.
  [/^if your opponent's active pokémon isn't knocked out by the damage from this attack, /, { requiresDefenderSurvived: true }],
  // Scizor Accelerate.
  [/^if your opponent's active pokémon is knocked out by (?:damage from )?this attack, /, { requiresDefenderKnockedOut: true }],
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

// Leading "If this Pokémon has at least N extra [type] Energy attached to it (in addition to
// this attack's cost), …" gates the rest of the sentence (design 048). Compound clauses
// ("1 extra {P} Energy and 1 extra {D} Energy") yield one requirement each.
const EXTRA_ENERGY_PREFIX = /^if this pokémon has at least (.+?) attached to it, (?:and )?/;
function leadingExtraEnergy(sentence) {
  const m = EXTRA_ENERGY_PREFIX.exec(sentence);
  if (!m) return null;
  if (!/^(?:\d+ extra (?:\{[a-z]\} )?energy(?:,? and )?)+$/.test(m[1])) return null;
  const requirements = [...m[1].matchAll(/(\d+) extra (?:\{([a-z])\} )?energy/g)].map((r) => ({
    count: Number(r[1]),
    energyType: r[2] ? r[2].toUpperCase() : null,
  }));
  return requirements.length > 0 ? { length: m[0].length, requirements } : null;
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
  // Older wordings ("1 of the Defending Pokémon" is the Active Pokémon): Kabutops Luring Antenna,
  // Feraligatr / Machamp Drag Off, Wurmple String Pull, Scizor Snatch, Hypno Spiral Aura.
  [
    /^(?:choose 1 of your opponent's benched pokémon( with no damage counters on it)? and switch (?:it with (?:1 of )?your opponent's active pokémon|your opponent's active pokémon with it)|switch 1 of your opponent's benched pokémon with 1 of your opponent's active pokémon|if your opponent has any benched pokémon, choose 1 of them and switch it with your opponent's active pokémon)$/,
    (m) => ({ type: 'atkGust', chooser: 'self', ...(m[1] ? { filter: 'undamaged' } : {}) }),
  ],
  // Torterra Land Shake.
  [
    /^during your opponent's next turn, when your opponent puts a basic pokémon from their hand onto their bench, put (\d+) damage counters on that pokémon$/,
    (m) => ({ type: 'atkOppBenchTrap', count: Number(m[1]) }),
  ],
  // Wobbuffet Shadow Tag (reduce.mjs resolveDeferredKnockouts places them).
  [
    /^put (\d+) damage counters on your opponent's active pokémon at the end of your opponent's next turn$/,
    (m) => ({
      type: 'atkAddMarker',
      target: 'opponentActive',
      window: 'opponentNextTurn',
      marker: { kind: 'deferredCounters', count: Number(m[1]) },
    }),
  ],
  // Unown Hidden Power (Unseen Forces I): after its switch, "The new Defending Pokémon is now
  // Burned and Confused."
  [
    /^the new defending pokémon is now (asleep|burned|confused|paralyzed|poisoned)(?: and (asleep|burned|confused|paralyzed|poisoned))?$/,
    (m) => conditionList(m.slice(1).filter(Boolean).join(' ')).map((condition) => ({ type: 'atkApplyCondition', condition })),
  ],
  // Forretress Rapid Spin: the opponent switches first, then the attacker.
  [
    /^if your opponent has any benched pokémon, (?:he or she|they) chooses? 1 of them and switch(?:es)? it with their active pokémon, then, if you have any benched pokémon, you switch 1 of them with your active pokémon$/,
    () => [{ type: 'atkGust', chooser: 'opponent' }, { type: 'atkSwitchSelf' }],
  ],

  // Golduck Mind Play: a random card from the opponent's hand is looked at before damage (the
  // damage reads it); a Trainer is then discarded, anything else stays in their hand.
  [
    /^choose 1 card from your opponent's hand without looking$/,
    () => ({ type: 'atkPickOppHandCard', beforeDamage: true, countsForDamage: true }),
  ],
  [
    /^if that card is an? (.+?) card, this attack does \d+ damage plus \d+ more damage, and discard that card$/,
    (m) => ({ type: 'atkDiscardRecordedIf', phrase: `${m[1]} card` }),
  ],
  // Coalossal VMAX Eruption Shot: the damage bonus is the damage parser's; the attach runs after.
  [
    /^if that card is an? (.+?) card, this attack does \d+ more damage, and attach that card to this pokémon$/,
    (m) => ({ type: 'atkAttachDiscardedForDamage', phrase: `${m[1]} card` }),
  ],

  // Move Energy. Articuno ex Ice Gift: "You may move a {W} Energy attached to Articuno ex to 1
  // of your Pokémon" — to itself would do nothing, so the choice is among the others.
  [
    new RegExp(String.raw`^move (an?|\d+) ${ENERGY_TYPE}energy(?: cards?)? (?:from|attached to) this pokémon to 1 of your pokémon$`),
    (m, s) => ({ type: 'atkMoveEnergy', from: 'self', to: 'bench', count: countOf(m[1]), ...energyFilter(m[2], s) }),
  ],
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
    // Shaymin LV.X Energy Flare prints "is any way you like".
    new RegExp(String.raw`^move (?:any number of|any amount of|as many) ${ENERGY_TYPE}energy(?: cards?)? (?:from|attached to) your pokémon to your other pokémon i[ns] any way you like$`),
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
  // Rest-of-game effects (design 036 E): kept on the attacking player, read by the damage path
  // and the attack legality gate.
  [
    /^for the rest of this game, your pokémon's attacks do (\d+) more damage to your opponent's active pokémon$/,
    (m) => ({ type: 'atkRestOfGame', effect: { kind: 'damageBonus', amount: Number(m[1]) } }),
  ],
  [
    /^for the rest of this game, your \{([a-z])\} pokémon take (\d+) less damage from your opponent's attacks$/,
    (m) => ({ type: 'atkRestOfGame', effect: { kind: 'damageReduce', amount: Number(m[2]), pokemonType: m[1] } }),
  ],
  [/^for the rest of this game, your opponent can't use any gx attacks$/, () => ({ type: 'atkRestOfGame', effect: { kind: 'gxLock' } })],
  // Opponent Energy between their own Pokémon.
  [
    new RegExp(String.raw`^move (?:an?|1) ${ENERGY_TYPE}energy(?: card)? (?:from|attached to) your opponent's active pokémon to (?:1 of (?:their|your opponent's) benched pokémon|another of (?:their|your opponent's) pokémon)$`),
    (m, s) => ({ type: 'atkMoveEnergy', from: 'opponentActive', to: 'opponentBench', count: 1, ...energyFilter(m[1], s) }),
  ],
  [
    new RegExp(String.raw`^move (?:an?|1) ${ENERGY_TYPE}energy(?: card)? (?:from|attached to) 1 of your opponent's pokémon to another of (?:their|your opponent's) pokémon$`),
    (m, s) => ({ type: 'atkMoveEnergy', from: 'opponentAny', to: 'opponentAny', count: 1, ...energyFilter(m[1], s) }),
  ],
  [
    new RegExp(String.raw`^move (?:an?|1) ${ENERGY_TYPE}energy(?: card)? (?:from|attached to) 1 of your opponent's benched pokémon to their active pokémon$`),
    (m, s) => ({ type: 'atkMoveEnergy', from: 'opponentBench', to: 'opponentActive', count: 1, ...energyFilter(m[1], s) }),
  ],
  // Deck look / reorder (the opponent-only block form stays atkLookOppDeck).
  [
    /^look at the top (\d+) cards (?:of|on) (your|your opponent's|either player's) deck,? and put them back (?:on top of (?:your|their|that player's|your opponent's) deck )?in any order(?: you like)?$/,
    (m) => ({
      type: 'atkLookDeckReorder',
      count: Number(m[1]),
      side: m[2] === 'your' ? 'self' : m[2] === 'either player\'s' ? 'either' : 'opponent',
    }),
  ],
  // Per-Bench attach (Mega Gardevoir ex Overflowing Wishes, Mudsdale Mud Stock).
  [
    new RegExp(String.raw`^for each of your benched pokémon, search your deck for an? ${ENERGY_TYPE}energy card and attach it to that pokémon$`),
    (m, s) => ({ type: 'atkAttachEachBench', source: 'deck', ...energyFilter(m[1], s) }),
  ],
  [
    new RegExp(String.raw`^attach an? ${ENERGY_TYPE}energy card from your discard pile to each of your benched pokémon$`),
    (m, s) => ({ type: 'atkAttachEachBench', source: 'discard', ...energyFilter(m[1], s) }),
  ],
  // Blaziken VMAX Max Blaze: "… of your Benched Rapid Strike Pokémon …" (`tag`).
  [
    new RegExp(String.raw`^choose up to (\d+) of your benched (rapid strike |single strike |fusion strike |team plasma )?pokémon and attach an? ${ENERGY_TYPE}energy card from your discard pile to each of them$`),
    (m, s) => ({
      type: 'atkAttachEachBench',
      source: 'discard',
      max: Number(m[1]),
      ...(m[2] ? { tag: m[2].trim() } : {}),
      ...energyFilter(m[3], s),
    }),
  ],
  // Latias Prism Star Dreamy Mist: "… to each of your Basic Benched {N} Pokémon".
  [
    new RegExp(String.raw`^attach an? ${ENERGY_TYPE}energy card from your discard pile to each of your basic benched \{([a-z])\} pokémon$`),
    (m, s) => ({ type: 'atkAttachEachBench', source: 'discard', basicOnly: true, pokemonType: m[2], ...energyFilter(m[1], s) }),
  ],
  // Druddigon Dragon's Fury: a typed attach target; Carbink BREAK Diamond Gift attaches 2.
  [
    new RegExp(String.raw`^attach (an?|\d+) ${ENERGY_TYPE}energy cards? from your discard pile to 1 of your \{([a-z])\} pokémon$`),
    (m, s) => ({ type: 'atkAttach', source: 'discard', count: countOf(m[1]), ...energyFilter(m[2], s), target: 'any', pokemonType: m[3] }),
  ],
  // Thundurus-EX Raiden Knuckle: "… to 1 of your Benched Team Plasma Pokémon".
  [
    new RegExp(String.raw`^attach an? ${ENERGY_TYPE}energy card from your discard pile to 1 of your benched team plasma pokémon$`),
    (m, s) => ({ type: 'atkAttach', source: 'discard', count: 1, ...energyFilter(m[1], s), target: 'bench', tag: 'team plasma' }),
  ],
  // Pichu Paste: "… attach it to 1 of your Pokémon that has δ on its card".
  [
    new RegExp(String.raw`^search your discard pile for an? ${ENERGY_TYPE}energy card and attach it to 1 of your pokémon that has δ on its card$`),
    (m, s) => ({ type: 'atkAttach', source: 'discard', count: 1, ...energyFilter(m[1], s), target: 'any', tag: 'δ' }),
  ],
  // Magneton Plasma: "If there are any {L} Energy cards in your discard pile, attach 1 of them".
  [
    /^if there are any \{([a-z])\} energy cards in your discard pile, attach 1 of them to this pokémon$/,
    (m) => ({ type: 'atkAttach', source: 'discard', count: 1, energyType: m[1].toUpperCase(), target: 'self' }),
  ],
  // Solgaleo / Lunala Prism Star: "For each of your opponent's Pokémon in play, attach a {M}
  // Energy card from your discard pile to your Pokémon in any way you like."
  [
    new RegExp(String.raw`^for each of your opponent's pokémon in play, attach an? ${ENERGY_TYPE}energy card from your discard pile to your pokémon in any way you like$`),
    (m, s) => ({ type: 'atkAttach', source: 'discard', countFrom: 'opponentInPlay', ...energyFilter(m[1], s), target: 'any', spread: true }),
  ],
  // Shuffle clauses.
  [
    new RegExp(String.raw`^shuffle (up to \d+|\d+|an?) ((?:basic )?(?:\{[a-z]\} )?(?:basic )?energy|item|trainer|pokémon)?\s?cards? from your discard pile into your deck$`),
    (m, s) => ({
      type: 'atkShuffleFromDiscard',
      ...attachCount(m[1]),
      ...(m[2] && /energy/.test(m[2]) ? { what: 'energy', ...energyFilter(/\{([a-z])\}/.exec(m[2])?.[1], s) } : {}),
      ...(m[2] && !/energy/.test(m[2]) ? { what: recoverWhat(m[2]) } : {}),
    }),
  ],
  [
    /^(?:your opponent shuffles their active pokémon and all attached cards into their deck|shuffle your opponent's active pokémon and all cards attached to it into their deck)$/,
    () => ({ type: 'atkShuffleOppActive' }),
  ],
  [
    /^shuffle 1 of your benched pokémon and all attached cards into your deck$/,
    () => ({ type: 'atkShuffleOwnBench' }),
  ],
  // Palkia-GX Zero Vanish-GX: every opponent Pokémon sheds its Energy into their deck.
  [
    /^shuffle all energy (?:from|attached to) each of your opponent's pokémon into their deck$/,
    () => ({ type: 'atkShuffleOppEnergy' }),
  ],
  [
    /^your opponent shuffles their hand into their deck and draws (\d+) cards$/,
    (m) => ({ type: 'atkOppShuffleHandDraw', count: Number(m[1]) }),
  ],
  // Old switch wordings with a Bench qualifier (Vikavolt Volt Switch, Honchkrow Callous Wings).
  [
    /^switch this pokémon with 1 of your benched (?:\{([a-z])\} pokémon|([a-z][a-z' .-]*?))$/,
    (m) => ({ type: 'atkSwitchSelf', ...(m[1] ? { benchType: m[1] } : { benchName: m[2] }) }),
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
  // Mr. Mime Pantomime / Rattata Trickery: the same swap on your own Prizes.
  [
    /^switch 1 of your (?:face-down )?prize(?: card)?s? with the top card of your deck$/,
    () => ({ type: 'atkOpponentPrizeDeckSwap', own: true }),
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

  // "…this attack does N more damage. [Then,] discard that Stadium." (Gaia Volcano, Draconic
  // Disaster, Desert Hurricane, Somersault Dive): the damage parser reads the bonus, this
  // clears the Stadium after damage. (Flygon Desert Geyser's conditional wording is a BLOCK.)
  [/^discard that stadium(?: card)?$/, () => ({ type: 'atkDiscardStadium', owner: 'any' })],
  // Great Tusk ex Bedrock Breaker, Kingdra-EX Big Storm, Lugia VSTAR Tempest Dive ("You may …"),
  // Brock's Primeape Mega Thrash / Light Piloswine Knock Over ("If there is a Stadium card in
  // play, [you may] discard it").
  [
    /^(you may )?discard (?:a|any) stadium(?: card)? in play$/,
    (m) => ({ type: 'atkDiscardStadium', owner: 'any', ...(m[1] ? { optional: true } : {}) }),
  ],
  [
    /^if there is (?:a|any) stadium card in play, (you may )?discard it$/,
    (m) => ({ type: 'atkDiscardStadium', owner: 'any', ...(m[1] ? { optional: true } : {}) }),
  ],

  // Discard from the opponent. Exploud ex Derail: "Discard a Special Energy card, if any,
  // attached to the Defending Pokémon"; Typhlosion Evaporating Heat: "Discard a {W} Energy …".
  [
    /^discard (an?|\d+|all|up to \d+) (?:(special )|\{([a-z])\} )?energy(?: cards?)?(?:, if any,)? (?:from|attached to) your opponent's active pokémon(?:, if any)?$/,
    (m) => ({
      type: 'atkDiscardOppEnergy',
      scope: 'active',
      ...discardCount(m[1]),
      ...(m[2] ? { special: true } : {}),
      ...(m[3] ? { energyType: m[3].toUpperCase() } : {}),
    }),
  ],
  // Scizor V Hack Off.
  [
    /^discard a pokémon tool and a special energy from your opponent's active pokémon$/,
    () => [
      { type: 'atkDiscardOppTools', scope: 'active', count: 1 },
      { type: 'atkDiscardOppEnergy', scope: 'active', count: 1, special: true },
    ],
  ],
  // Mega Dragalge ex Corrosive Liquid.
  [
    /^discard all pokémon tools and special energy from all of your opponent's pokémon$/,
    () => [
      { type: 'atkDiscardOppTools', scope: 'any', all: true },
      { type: 'atkDiscardOppEnergy', scope: 'any', all: true, special: true },
    ],
  ],
  // Skuntank Plunder: "Before doing damage, discard all Trainer cards attached to the Defending
  // Pokémon" — the attached Trainers are its Pokémon Tools.
  [
    /^(?:before doing damage, )?discard all trainer cards attached to your opponent's active pokémon$/,
    () => ({ type: 'atkDiscardOppTools', scope: 'active', all: true, beforeDamage: true }),
  ],
  [
    /^discard (an?|\d+|all|up to \d+) (special )?energy(?: cards?)? (?:from|attached to) your opponent's active pokémon(?:, if any)?$/,
    (m) => ({ type: 'atkDiscardOppEnergy', scope: 'active', ...discardCount(m[1]), ...(m[2] ? { special: true } : {}) }),
  ],
  // Articuno-GX Cold Crush-GX: both Active Pokémon shed all their Energy.
  [
    /^discard all (special )?energy(?: cards?)? (?:from|attached to) both active pokémon$/,
    (m) => ({ type: 'atkDiscardBothActiveEnergy', ...(m[1] ? { special: true } : {}) }),
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
  // Ninjask Chip Off (random) / Feraligatr Pull Away ("5 of more", sic; the opponent picks).
  [
    /^if your opponent has \d+ o[rf] more cards in their hand, (?:discard a number of cards without looking|your opponent discards a number of cards) until your opponent has (\d+) cards left in their hand$/,
    (m) => ({ type: 'atkDiscardOppHand', leaveCount: Number(m[1]), random: /without looking/.test(m[0]) }),
  ],
  // Glaceon Ice Bind.
  [
    /^if your opponent doesn't discard a card from their hand, your opponent's active pokémon is now (asleep|burned|confused|paralyzed|poisoned)$/,
    (m) => ({ type: 'atkOppDiscardOrCondition', condition: conditionList(m[1])[0] }),
  ],
  // Umbreon-EX Veil of Darkness: "Discard as many cards as you like from your hand. Then, draw
  // that many cards."
  [/^discard as many cards as you like from your hand$/, () => ({ type: 'atkDiscardOwnHand', count: 'any' })],
  [/^(?:then, )?draw that many cards$/, () => ({ type: 'atkDraw', countFrom: 'handDiscarded' })],

  // Own-hand discards (design 036 A11). A cost the attack cannot be used without, or a discard
  // the damage counts, moves before damage in parseAttackSteps; "If you do, …" chains on it.
  [/^discard your hand$/, () => ({ type: 'atkDiscardOwnHand', count: 'all' })],
  [/^discard any number of cards from your hand$/, () => ({ type: 'atkDiscardOwnHand', count: 'any' })],
  // Ditch and Splash / Chuck Away (design 048): a kind-filtered or "up to N" hand discard whose
  // count scales the damage (parseAttackSteps moves it before damage when the text says so).
  [
    /^discard any number of supporter cards? from your hand$/,
    () => ({ type: 'atkDiscardOwnHand', count: 'any', what: 'Supporter' }),
  ],
  [
    /^discard up to (\d+) cards? from your hand$/,
    (m) => ({ type: 'atkDiscardOwnHand', count: Number(m[1]), upTo: true }),
  ],
  // Dark Slowking Litter: "discard a combination of up to 2 Pokémon Tool cards and Rocket's
  // Secret Machine cards from your hand".
  [
    /^discard a combination of up to (\d+) (.+?) cards and (.+?) cards from your hand$/,
    (m) => ({ type: 'atkDiscardOwnHand', count: Number(m[1]), upTo: true, whatAny: [m[2], m[3]] }),
  ],
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
  // Dialga-EX Fast Forward.
  [
    /^for each (plasma) energy attached to this pokémon, discard the top card of your opponent's deck$/,
    (m) => ({ type: 'atkMill', side: 'opponent', perAttachedEnergy: m[1] }),
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
  // Ho-Oh-GX Eternal Flame-GX / Greninja & Zoroark-GX Dark Union-GX (design 048): typed
  // Pokémon-GX/-EX in any combination.
  [
    new RegExp(String.raw`^put (up to \d+|\d+) in any combination of \{([a-z])\} pokémon-gx (?:or|and) (?:\{[a-z]\} )?pokémon-ex from your discard pile onto your bench$`),
    (m) => ({
      type: 'atkBenchFromDiscard',
      ...attachCount(m[1]),
      pokemonType: m[2],
      ruleBoxes: ['gx', 'ex'],
    }),
  ],
  // Carracosta-GX Stone Age-GX: anything that evolves from Unidentified Fossil.
  [
    /^put any number of pokémon that evolve from (.+?) from your discard pile onto your bench$/,
    (m) => ({ type: 'atkBenchFromDiscard', anyNumber: true, evolvesFrom: m[1].trim() }),
  ],
  [
    /^put (up to \d+|an?|\d+) (?:((?:trainer|item|supporter|pokémon tool|stadium|basic energy|energy|pokémon) )?)cards? from your discard pile into your hand$/,
    (m) => ({ type: 'atkRecover', ...attachCount(m[1]), what: m[2] ? recoverWhat(m[2].trim()) : null }),
  ],
  // Ampharos-GX Power Recharge (design 048): every named card (e.g. Electropower) comes back.
  [
    /^put all (.+?) cards? from your discard pile into your hand$/,
    (m) => ({ type: 'atkRecover', all: true, what: m[1].trim() }),
  ],
  // Any card: Dialga-EX Reverse Edge, Xatu Warp Hole, Unown Hidden Power; Azurill Delivery
  // ("Put any 1 card …").
  [/^put (?:a|any 1) card from your discard pile into your hand$/, () => ({ type: 'atkRecover', count: 1, what: null })],
  // Older wording: Heracross Dig Deep ("Search your discard pile for an Energy card, show it to
  // your opponent, and put it into your hand"), Pichu Electric Circuit ("up to 4 {L} Energy
  // cards"), Sunny Castform Sunshine ("a Stadium card").
  [
    /^search your discard pile for (up to \d+|an?|\d+) ((?:basic )?(?:\{([a-z])\} )?(?:basic )?energy|trainer|item|supporter|stadium|pokémon tool|pokémon) cards?, show (?:it|them) to your opponent, and put (?:it|them) into your hand$/,
    (m) => ({
      type: 'atkRecover',
      ...attachCount(m[1]),
      what: m[3] ? `${/basic/.test(m[2]) ? 'basic ' : ''}{${m[3].toUpperCase()}} Energy` : recoverWhat(m[2].replace(/\{[a-z]\} /, '')),
    }),
  ],
  [
    /^(?:choose a card from your discard pile and put it|search your discard pile for a card, show it to your opponent, and put it) on top of your deck$/,
    () => ({ type: 'atkRecover', count: 1, what: null, to: 'deckTop' }),
  ],

  // Shaymin LV.X Seed Flare: "Choose as many {G} Energy cards from your hand as you like and
  // attach them to your Pokémon in any way you like."
  [
    new RegExp(String.raw`^choose as many ${ENERGY_TYPE}energy cards from your hand as you like and attach them to your pokémon in any way you like$`),
    (m, s) => ({ type: 'atkAttach', source: 'hand', anyNumber: true, ...energyFilter(m[1], s), target: 'any', spread: true }),
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
  // Shaymin-EX Sky Return; Team Rocket's Crobat ex ("… into your hand", its reminder discards
  // the attached cards); Revavroom ex / Weezing ("Discard this Pokémon …"); Uxie Psychic Restore.
  [/^return this pokémon and all cards attached to it to your hand$/, () => ({ type: 'atkPutSelf', to: 'hand', attached: 'hand' })],
  [/^put this pokémon into your hand$/, () => ({ type: 'atkPutSelf', to: 'hand', attached: 'discard' })],
  [/^discard this pokémon and all (?:attached cards|cards attached to it)$/, () => ({ type: 'atkPutSelf', to: 'discard' })],
  [
    /^put this pokémon and all cards attached to it on the bottom of your deck in any order$/,
    () => ({ type: 'atkPutSelf', to: 'deckBottom' }),
  ],
  // Comfey Sweet Kiss / Light Togetic Sweet Kiss.
  [/^your opponent (may )?draws? a card$/, (m) => ({ type: 'atkDraw', side: 'opponent', count: 1, ...(m[1] ? { opponentMay: true } : {}) })],
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
  // Mr. Mime-GX Breakdown: one counter per card in the opponent's hand on their Active.
  [
    /^for each card in your opponent's hand, put (\d+|a|an) damage counters? on their active pokémon$/,
    (m) => ({ type: 'atkCountersEach', count: countOf(m[1]), scope: 'active', perOpponentHand: true }),
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
  // Toxtricity ex Gaia Punk.
  [
    /^discard (\d+) (?:\{([a-z])\} )?energy from your pokémon$/,
    (m) => ({ type: 'atkDiscardOwnEnergy', count: Number(m[1]), ...(m[2] ? { energyType: m[2].toUpperCase() } : {}) }),
  ],
  // Arcanine ex Flame Swirl.
  [
    /^discard (\d+) \{([a-z])\} energy or 1 (react) energy card attached to this pokémon$/,
    (m) => ({ type: 'atkDiscardSelfEnergyEither', count: Number(m[1]), energyType: m[2].toUpperCase(), name: m[3] }),
  ],
  // Palossand ex Barite Jail.
  [
    /^put damage counters on each of your opponent's benched pokémon until its remaining hp is (\d+)$/,
    (m) => ({ type: 'atkHpCap', target: 'opponentBenchEach', hp: Number(m[1]) }),
  ],
  // Bronzong Heavy Potential: "… on each of your opponent's Pokémon equal to the number of {C}
  // Energy in that Pokémon's Retreat Cost (after applying effects to the Retreat Cost)".
  [
    /^put a number of damage counters on each of your opponent's pokémon equal to the number of \{c\} energy in that pokémon's retreat cost/,
    () => ({ type: 'atkCountersByRetreat' }),
  ],
  [
    /^move all damage counters from 1 of your benched pokémon to your opponent's active pokémon$/,
    () => ({ type: 'atkMoveAllCounters' }),
  ],
  // Design 036 D: your damage counters onto the opponent (Xerneas-GX Sanctuary, Drifloon Transfer Pain).
  [
    /^move (?:up to )?(all|\d+|an?) damage counters? from (this pokémon|each of your pokémon|1 of your benched pokémon|(?:1|any) of your pokémon) to (your opponent's active pokémon|(?:1|any) of your opponent's (?:benched )?pokémon)$/,
    (m) => ({
      type: 'atkMoveCounterToOpponent',
      count: m[1] === 'all' ? 'all' : countOf(m[1]),
      from: m[2] === 'this pokémon' ? 'self' : /^each/.test(m[2]) ? 'each' : /benched/.test(m[2]) ? 'bench' : 'one',
      // Dusknoir Reaper Pulse: "to 1 of your opponent's Benched Pokémon".
      to: /active/.test(m[3]) ? 'active' : /benched/.test(m[3]) ? 'bench' : 'any',
    }),
  ],
  // Wobbuffet V Gritty Comeback, Unown J Hidden Power.
  [
    /^switch all damage counters on this pokémon with those on your opponent's active pokémon$/,
    () => ({ type: 'atkSwapCounters' }),
  ],
  // Unown L Hidden Power.
  [
    /^put damage counters on your opponent's active pokémon until it is (\d+) hp away from being knocked out$/,
    (m) => ({ type: 'atkCountersUntilHp', hp: Number(m[1]) }),
  ],

  // Opponent's Active back to their hand (Fan Rotom Spin Storm, Unown Hidden Power)
  [
    /^your opponent returns your opponent's active pokémon and all cards attached to it to their hand$/,
    () => ({ type: 'atkBounceOppActive' }),
  ],
  // Sylveon-GX Plea-GX / Greninja-GX Dark Mist-GX (design 048).
  [
    /^put (a|an|\d+) of your opponent's benched pokémon and all cards attached to (?:it|them) into your opponent's hand$/,
    (m) => ({ type: 'atkBounceOppBench', count: countOf(m[1]) }),
  ],
  // Virizion-GX Breeze Away-GX: your own in-play Pokémon back to your hand ("any number").
  [
    /^put any number of your pokémon in play and all cards attached to them into your hand$/,
    () => ({ type: 'atkBounceOwnInPlay', anyNumber: true }),
  ],

  // Volcarona-GX Backfire (design 048): attached Energy back to the attacker's hand.
  [
    new RegExp(String.raw`^put (\d+|a|an) ${ENERGY_TYPE}energy(?: cards?)? attached to this pokémon into your hand$`),
    (m, s) => ({ type: 'atkMoveSelfEnergyToHand', count: countOf(m[1]), ...energyFilter(m[2], s) }),
  ],
  // Kyogre-EX Giant Whirlpool / Deoxys Energy Loop / Starmie Energy Loop: "Return 2 {W} Energy
  // attached to this Pokémon to your hand."
  [
    new RegExp(String.raw`^return (\d+|a|an) ${ENERGY_TYPE}energy(?: cards?)? attached to this pokémon to your hand$`),
    (m, s) => ({ type: 'atkMoveSelfEnergyToHand', count: countOf(m[1]), ...energyFilter(m[2], s) }),
  ],

  // Opponent play/attack locks and extra turns (design 048): Noivern-GX Distort/Sonic Volume,
  // Alolan Golem-GX Heavy Rock-GX, Gengar & Mimikyu-GX Horror House-GX, Umbreon & Darkrai-GX
  // Dark Moon-GX, Cobalion-GX Iron Rule-GX, Dialga-GX Timeless-GX, Supreme Puff-GX.
  // Every era's wording: "Your opponent can't play any Item cards from their hand during their
  // next turn" and the Scarlet & Violet "During your opponent's next turn, they can't play any
  // Item cards from their hand" (Budew Itchy Pollen, Banette ex, Pikachu V-UNION), lists
  // ("Pokémon Tool, Special Energy, or Stadium", Giratina-EX Chaos Wheel), Azelf Bind Pulse's
  // "can't attach any Special Energy cards", and Banette Evolution Jammer's "Pokémon … to evolve".
  [
    /^your opponent can't play any (?:(.+?) )?(?:cards? )?from (?:their|his or) hand( to evolve their pokémon)? during (?:their|your opponent's) next turn$/,
    (m) => playLockStep(m[1], m[2]),
  ],
  // Gardevoir Psychic Lock / Jirachi ex Shield Beam: "During your opponent's next turn, your
  // opponent can't use any Poké-Powers on his or her Pokémon." A player-wide lock, stored with
  // the play locks as an `ability:<kind>` entry.
  [
    /^during your opponent's next turn, your opponent can't use any (poké-powers|poké-bodies|abilities)(?: or (poké-powers|poké-bodies))? on their pokémon$/,
    (m) => ({
      type: 'atkOppPlayLock',
      kinds: [m[1], m[2]].filter(Boolean).map((word) => `ability:${/power/.test(word) ? 'power' : /bod/.test(word) ? 'body' : 'ability'}`),
    }),
  ],
  [
    /^during your opponent's next turn, (?:they|your opponent) can't (?:play|attach) any (?:(.+?) )?(?:cards? )?from their hand(?: to any of their pokémon)?( to evolve their pokémon)?$/,
    (m) => playLockStep(m[1], m[2]),
  ],
  [
    /^during your opponent's next turn, their pokémon can't attack$/,
    () => ({ type: 'atkOppAttackLock' }),
  ],
  [/^take another turn after this one$/, () => ({ type: 'atkTakeAnotherTurn' })],
  [
    /^your opponent shuffles all of their benched pokémon and all cards attached to them into their deck$/,
    () => ({ type: 'atkShuffleOppAllBench' }),
  ],
  [
    /^each player draws cards until they have (\d+) cards in their hand$/,
    (m) => ({ type: 'atkBothDrawUntil', count: Number(m[1]) }),
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
  // Prize manipulation (design 048): Nihilego-GX Symbiont-GX, Naganadel-GX Injection-GX,
  // Celesteela-GX Blaster-GX. Stinger/Discovery/Burst are multi-sentence BLOCKS below.
  [
    /^add the top (\d+) cards? of your opponent's deck to their prize cards?$/,
    (m) => ({ type: 'atkOppDeckToPrizes', count: Number(m[1]) }),
  ],
  [
    /^add a card from your opponent's discard pile to their prize cards face down$/,
    () => ({ type: 'atkOppDiscardToPrizes', count: 1 }),
  ],
  [/^turn all of your prize cards face up$/, () => ({ type: 'atkPrizesFaceUp' })],
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
  // Silvally-GX Silver Knight-GX: the Active is an Ultra Beast (design 048).
  [
    /^if your opponent's active pokémon is an ultra beast, it is knocked out$/,
    () => ({ type: 'atkKnockOut', condition: 'ultraBeast' }),
  ],
  // Lunala-GX Lunar Fall-GX: 1 of the opponent's Basic non-GX Pokémon (design 048).
  [
    /^knock out 1 of your opponent's basic pokémon that isn't a pokémon-gx$/,
    () => ({ type: 'atkKnockOutChoose', basicOnly: true, notGx: true }),
  ],

  // Discard (not Knock Out) opponent Pokémon: Garchomp & Giratina-GX GG End-GX,
  // Bewear-GX Big Throw-GX (design 048).
  [
    /^discard your opponent's active pokémon and all cards attached to it$/,
    () => ({ type: 'atkDiscardOppPokemon', count: 1, scope: 'active' }),
  ],
  [
    /^discard (a|an|\d+) of your opponent's pokémon and all cards attached to (?:it|them)$/,
    (m) => ({ type: 'atkDiscardOppPokemon', count: countOf(m[1]), scope: 'any' }),
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
  // Venusaur / Erika's Vileplume Mega Drain: half the damage done, rounded up to the nearest 10.
  [
    /^(?:if this pokémon does damage to your opponent's active pokémon(?: \(after applying weakness and resistance\))?, )?remove a number of damage counters from this pokémon equal to half the damage done to your opponent's active pokémon(?: \(after applying weakness and resistance\))?(?: \(rounded up to the nearest 10\))?$/,
    () => ({ type: 'atkMirrorHeal', half: true }),
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
  // Crobat BREAK Silent Bite ("… all cards attached to into your deck", sic).
  [
    /you may leave your opponent's active pokémon (asleep|burned|confused|paralyzed|poisoned)\. if you do, shuffle this pokémon and all cards attached to (?:it )?into your deck\./g,
    (m) => [
      { type: 'atkApplyCondition', condition: conditionList(m[1])[0], optional: true, cost: true },
      { type: 'atkShuffleSelf' },
    ],
  ],
  // Spiritomb Color Tag.
  [
    /choose \{g\}\{r\}\{w\}\{l\}\{p\}\{f\}\{d\}\{m\} or \{c\} type\. put 1 damage counter on each pokémon your opponent has in play of the type you chose\./g,
    () => ({ type: 'atkCountersEachChosenType', count: 1 }),
  ],
  // Deck-top Energy attach: Lapras ex Larimar Rain, Dragonite VSTAR Draconic Star ("{W} or {L}"),
  // Ampharos-EX Thunder Rod, Hatterene V Horoscope ("put the other cards back in any order").
  [
    /look at the top (\d+) cards of your deck(?: and|\. you may) attach (?:any number of|as many) ((?:\{[a-z]\}(?: or \{[a-z]\})? )?)energy cards you find there (?:as you like )?to (this pokémon|your pokémon in any way you like)\. (shuffle the other cards back into your deck|put the other cards back in any order)\./g,
    (m) => {
      const types = [...m[2].matchAll(/\{([a-z])\}/g)].map((t) => t[1].toUpperCase());
      return {
        type: 'atkAttach',
        source: 'deckTop',
        look: Number(m[1]),
        anyNumber: true,
        ...(types.length ? { energyTypes: types } : {}),
        target: m[3] === 'this pokémon' ? 'self' : 'any',
        ...(m[3] === 'this pokémon' ? {} : { spread: true }),
        rest: /shuffle/.test(m[4]) ? 'shuffle' : 'keep',
      };
    },
  ],
  // Gengar Hurl into Darkness.
  [
    /look at your opponent's hand and choose a number of pokémon you find there up to the number of \{([a-z])\} energy attached to this pokémon\. put the pokémon you chose in the lost zone\./g,
    (m) => ({ type: 'atkLostZoneOppHandPokemon', energyType: m[1].toUpperCase() }),
  ],
  // "Use the effect of that Supporter card as the effect of this attack" (design 036 E): where
  // the Supporter comes from, and whether it is discarded on the way.
  [
    /(?:your opponent reveals? their hand|look at your opponent's hand)\. you may (discard a supporter card you find there and )?use the effect of (?:that card|a supporter card you find there) as the effect of this attack\./g,
    (m) => ({ type: 'atkUseSupporter', source: 'oppHand', optional: true, ...(m[1] ? { discard: true } : {}) }),
  ],
  [
    /(?:your opponent reveals? their hand\. discard a supporter card you find there\.|look at your opponent's hand, choose a supporter card you find there, and discard it\. then,) use the effect of that card as the effect of this attack\./g,
    () => ({ type: 'atkUseSupporter', source: 'oppHand', discard: true }),
  ],
  // Jirachi / Magby Detour ("the effect on that card", Team Rocket Returns).
  [
    /if you have a supporter card in play, use the effect (?:of|on) that card as the effect of this attack\./g,
    () => ({ type: 'atkUseSupporter', source: 'played' }),
  ],
  [
    /discard a supporter card from your hand\. if you do, use the effect of that card as the effect of this attack\./g,
    () => ({ type: 'atkUseSupporter', source: 'hand', discard: true }),
  ],
  [
    /(?:choose a supporter card from|search) (your opponent's|your) discard pile(?: for a supporter card)? and use (?:the effect of that card|it) as the effect of this attack\./g,
    (m) => ({ type: 'atkUseSupporter', source: m[1] === 'your' ? 'discard' : 'oppDiscard' }),
  ],
  [
    /discard the top card of your deck, and if that card is a supporter card, use the effect of that card as the effect of this attack\./g,
    () => ({ type: 'atkUseSupporter', source: 'deckTop', discard: true }),
  ],
  [
    /search your deck for a supporter card and discard it\. shuffle your deck afterward\. then, use the effect of that card as the effect of this attack\./g,
    () => ({ type: 'atkUseSupporter', source: 'deck', discard: true }),
  ],
  [
    // Wishiwashi-GX Massive Catch-GX prints the same clause without "you may" (design 048).
    /look at the top (\d+) cards of your deck(?:, and| and|\.) (?:you may )?put any number of (basic )?pokémon you find there onto your bench\. shuffle the other cards back into your deck\./g,
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
  // Mimikyu-GX Dream Fear-GX / Shiftry-GX Den of Iniquity-GX (design 048): the singular
  // "that Pokémon" wording, on the Bench or on any of the opponent's Pokémon.
  [
    /choose 1 of your opponent's benched pokémon\. your opponent shuffles that pokémon and all cards attached to it into their deck\./g,
    () => ({ type: 'atkShuffleOppBench', count: 1, scope: 'bench' }),
  ],
  [
    /choose 1 of your opponent's pokémon\. your opponent shuffles that pokémon and all cards attached to it into their deck\./g,
    () => ({ type: 'atkShuffleOppBench', count: 1, scope: 'any' }),
  ],
  // Naganadel-GX Stinger-GX / Celesteela-GX Discovery-GX / Blacephalon-GX Burst-GX.
  [
    /both players shuffle their prize cards? into their decks\. then, each player puts the top (\d+) cards? of their deck face down as their prize cards?\./g,
    (m) => ({ type: 'atkShufflePrizesAndRedraw', count: Number(m[1]) }),
  ],
  [
    /count your prize cards and put them into your hand\. then, take that many cards from the top of your deck and put them face down as your prize cards?\./g,
    () => ({ type: 'atkPrizeDiscovery' }),
  ],
  [
    /discard 1 of your prize cards\. if it's an energy card, attach it to 1 of your pokémon\./g,
    () => ({ type: 'atkDiscardPrize', count: 1, attachIfEnergy: true }),
  ],
  // Magcargo-GX Crushing Charge (design 048): mill the deck top, attach it if it is a Basic
  // Energy. The block consumes both sentences so the plain atkMill template cannot drop the
  // conditional attach.
  [
    /discard the top card of your deck\. if it(?:'s| is) a basic energy card, attach it to 1 of your pokémon\./g,
    () => ({ type: 'atkMillAttachIfEnergy' }),
  ],
  // Marshadow & Machamp-GX Acme of Heroism-GX: survive a Knock Out at 10 HP next turn, gated on
  // the extra Energy. (The sentence order is printed with the condition first.)
  [
    /if this pokémon has at least 1 extra energy attached to it,? and if it would be knocked out by damage from an opponent's attack during their next turn, it is not knocked out, and its remaining hp becomes 10\./g,
    () => ({
      type: 'atkAddMarker',
      target: 'self',
      window: 'opponentNextTurn',
      marker: { kind: 'surviveKnockOutHp10' },
      requiresExtraEnergy: [{ count: 1, energyType: null }],
    }),
  ],
  // Garchomp & Giratina-GX GG End-GX: the extra-Energy clause raises the discard count.
  [
    /discard (a|an|\d+) of your opponent's pokémon and all cards attached to (?:it|them)\. if this pokémon has at least (\d+) extra (?:\{([a-z])\} )?energy attached to it, discard (\d+) of your opponent's pokémon instead\./g,
    (m) => ({
      type: 'atkDiscardOppPokemon',
      count: countOf(m[1]),
      scope: 'any',
      alternateCount: Number(m[4]),
      requiresExtraEnergy: [
        { count: Number(m[2]), energyType: m[3] ? m[3].toUpperCase() : null },
      ],
    }),
  ],
  // Greninja & Zoroark-GX Dark Union-GX: bench placement plus the extra-Energy attach.
  [
    /put (\d+|up to \d+) in any combination of \{([a-z])\} pokémon-gx (?:or|and) (?:\{[a-z]\} )?pokémon-ex from your discard pile onto your bench\. if this pokémon has at least (\d+) extra energy attached to it, attach (\d+) energy cards? from your discard pile to each pokémon that you put onto your bench in this way\./g,
    (m) => ({
      type: 'atkBenchFromDiscard',
      ...attachCount(m[1]),
      pokemonType: m[2],
      ruleBoxes: ['gx', 'ex'],
      requiresExtraEnergy: { count: Number(m[3]), energyType: null },
      thenAttachPerPlaced: Number(m[4]),
    }),
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
  // Raticate Pickup: one card of each kind (its "(or Evolution card)" reminder is stripped).
  [
    /search your discard pile for a basic pokémon, a trainer card, and an energy card\. show them to your opponent and put them into your hand\./g,
    () => [
      { type: 'atkRecover', count: 1, what: 'Pokémon' },
      { type: 'atkRecover', count: 1, what: 'Trainer' },
      { type: 'atkRecover', count: 1, what: 'Energy' },
    ],
  ],
  // Octillery Smokescreen Shot / Eevee VMAX G-Max Cuddle: the opponent flips when attacking.
  // Older Smokescreen (Weezing, Magcargo, Solrock Sun Flash): "If the Defending Pokémon tries
  // to attack during your opponent's next turn, … If tails, that attack does nothing."
  [
    /(?:during your opponent's next turn, if your opponent's active pokémon tries to (?:use an )?attack|if your opponent's active pokémon tries to attack during your opponent's next turn), your opponent flips a coin\. if tails, (?:that|this) attack (?:doesn't happen|does nothing)\./g,
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
  // Flygon Sand Wall: "Discard a Stadium card your opponent has in play. If you do, …".
  [
    /(?<=^|\. )discard a stadium card your opponent has in play\. if you do, ([^.]+)\./g,
    (m) => chainedMarkerStep({ type: 'atkDiscardStadium', owner: 'opponent' }, m[1]),
  ],
  // Electivire LV.X Pulse Barrier.
  [
    /(?<=^|\. )discard all of your opponent's pokémon tool cards and stadium cards in play\. if you do, ([^.]+)\./g,
    (m) => chainedMarkerStep({ type: 'atkDiscardOppToolsAndStadium' }, m[1]),
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
  // "…reveals their hand. Put a Basic Pokémon (with 70 HP or less) you find there onto their
  // Bench(, and put 3 damage counters on that Pokémon)." (Mandibuzz, Mawile-GX, Dusknoir).
  [
    /(?<=(?:^|\. )(?:(?:if heads|if tails|for each heads), )?)your opponent reveals their hand\. put (a|any number of) (basic pokémon(?: with \d+ hp or less)?) (?:that )?you find there onto their bench(?:, and put (\d+) damage counters on that pokémon)?\./g,
    (m) => ({
      type: 'atkRevealOppHand',
      then: {
        action: 'bench',
        count: m[1] === 'a' ? 1 : 'any',
        filter: m[2],
        ...(m[3] ? { counters: Number(m[3]) } : {}),
      },
    }),
  ],
  // Only at a sentence start (behind a coin gate at most), so "if you do, your opponent
  // reveals …" stays unparsed instead of losing its condition.
  [
    /(?<=(?:^|\. )(?:(?:if heads|if tails|for each heads), )?)your opponent reveals their hand(?:, and you discard (a) card you find there|\. (discard|choose|add) (a|\d+|all) (trainer |supporter |energy )?cards? (?:you find there|from it)(?: (and put it on the bottom of their deck|to their prize cards face down|and shuffle them into their deck))?)?\./g,
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
    if (/shuffle them into their deck/.test(destination || '')) action = 'deckShuffle';
    else if (/bottom of their deck/.test(destination || '')) action = 'deckBottom';
    else return null;
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
    // A Tool search keeps the ability parser's filter; the attack one reads it as a Pokémon.
    ...(clauseParams.what && step.what !== 'Pokémon Tool' ? { what: clauseParams.what } : {}),
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
  /^(?:(?:once during your turn|as often as you like during your turn|during your turn|when you play this pokémon from your hand (?:to evolve 1 of your pokémon|(?:on)?to your bench) during your turn), (?:you may use this (?:ability|power)\. )?(?:you may |you must )?)/;

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
  const parsed = parseAttackSteps(abilityRevealVoice(effect));
  return { steps: [...parsed.before, ...parsed.after], holderZone };
}

// Abilities print a reveal in the player's voice ("have your opponent reveal their hand, and
// then you choose …"); the attack templates read the attack voice ("your opponent reveals
// their hand. choose …").
function abilityRevealVoice(effect) {
  return effect
    .replace(/^have your opponent reveal their hand/, 'your opponent reveals their hand')
    .replace(/^(your opponent reveals their hand),? and (?:then )?(?:you )?/, '$1. ')
    .replace(/^(your opponent reveals their hand\.) then, /, '$1 ')
    .replace(/(your opponent reveals their hand\. \w+ .*?)\byour opponent's (deck|bench)\b/, '$1their $2');
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
  // EX-era "Pokémon-ex" (Deoxys ex) and XY-era "Pokémon-EX" differ only by case, which the
  // normalizer drops; the lowercase printing keeps an explicit marker for attacker filters.
  let normalized = normalizeAttackText(String(text || '').replace(/Pokémon-ex\b/g, 'Pokémon-ex-era'), selfName)
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
  // A hand discard whose count this attack's damage reads ("… for each card you discarded in
  // this way"): Ditch and Splash / Chuck Away. Needed both for the before-damage move and to
  // suppress a same-wording discard whose count something else uses (Unown ? Hidden Power
  // draws instead — design 048 review).
  const handScaled =
    /(?:if you do|if you discarded [^,]* in this way), this attack does/.test(normalized) ||
    /this attack does \d+ damage for each card you discarded in this way/.test(normalized) ||
    /for each card you discarded in this way, this attack does/.test(normalized);
  // A gated self discard runs as a step unless the damage counts it (Raikou Lightning
  // Sphere) or the printed cost can cancel the attack (Charizard Blast Burn): neither is
  // modelled, and a partial effect is worse than none.
  const selfDiscardOpen = !/discarded in this way|this attack does nothing/.test(
    normalizeAttackText(text, selfName)
  );

  // "You may <cost>. If you do, this attack does N more damage": the reducer offers and pays
  // that cost before damage (optional-cost-bonus.mjs), so neither sentence is a step here.
  const optionalClause = optionalCostBonusClause(text, selfName);
  const optionalCost = Boolean(optionalClause);
  const sentences = normalized.split(/(?<=\.)\s+/);
  for (const [index, raw] of sentences.entries()) {
    const sentence = raw.trim().replace(/\.$/, '');
    if (!sentence) continue;
    if (
      optionalCost &&
      ((/^you may /.test(sentence) && /^if you do\b/.test(sentences[index + 1]?.trim() || '')) ||
        (/^if you do\b/.test(sentence) && /^you may /.test(sentences[index - 1]?.trim() || '')) ||
        (optionalClause.consumed || []).includes(sentence))
    ) {
      continue;
    }
    const block = /^@block(\d+)$/.exec(sentence);
    if (block) {
      result.after.push(...[blockSteps[Number(block[1])]].flat());
      continue;
    }
    // "If you do, …" / "If you attached Energy in this way, …" after an attach: the executor
    // runs it only when the attach happened (requiresAttach, I93).
    const wrOrder = /<wr:(before|after)>/.exec(sentence)?.[1];
    const plain = sentence.replace(/\s*<wr:(?:before|after)>/g, '');
    const extra = leadingExtraEnergy(plain);
    const body = extra ? plain.slice(extra.length) : plain;
    const chained = ATTACH_CHAIN.exec(body);
    const previous = result.after[result.after.length - 1];
    // "Discard a card from your hand. If you do, draw 3 cards." runs only when the hand paid.
    const handChain = Boolean(chained) && /^if you do, /.test(body) && HAND_COST_TYPES.has(previous?.type);
    if (chained && !handChain && !isAttachStep(previous)) continue;
    const { rest, flags } = stripGates(chained ? body.slice(chained[0].length) : body);
    if (extra) flags.requiresExtraEnergy = extra.requirements;
    if (handChain) flags.requiresHandCost = true;
    else if (chained) flags.requiresAttach = true;
    const templates = chained && !handChain ? [...CHAIN_TEMPLATES, ...TEMPLATES] : TEMPLATES;
    for (const [re, build] of templates) {
      const m = re.exec(rest);
      if (!m) continue;
      const step = build(m, rest, { wrOrder });
      if (!step) break;
      // One sentence, several steps (Scizor V Hack Off: a Tool and a Special Energy).
      if (Array.isArray(step)) {
        const { before, ...stepFlags } = flags;
        for (const { beforeDamage, ...built } of step) {
          (before || beforeDamage ? result.before : result.after).push({ ...built, ...stepFlags });
        }
        break;
      }
      if (step.type === 'atkMill' && millHandled) break;
      if (step.type === 'atkDiscardSelfEnergy' && !(selfDiscardOpen && (flags.gate || flags.perHeads))) break;
      if (step.type === 'atkDiscardOwnHand' && (step.upTo || step.what) && !handScaled) break;
      const { before, ...stepFlags } = flags;
      const { beforeDamage, ...built } = step;
      (before || beforeDamage ? result.before : result.after).push({ ...built, ...stepFlags });
      break;
    }
  }

  // Malamar V Drag Off: "This attack does 30 damage to the new Active Pokémon" — the switch
  // happens before the damage.
  if (/damage to the new (?:active|defending) pokémon/.test(normalized)) {
    const gusts = result.after.filter((step) => step.type === 'atkGust');
    result.after = result.after.filter((step) => !gusts.includes(step));
    result.before.push(...gusts);
  }

  // "This attack does N damage for each card put in the Lost Zone in this way": the Lost
  // Zone step is the cost the damage counts, so it runs before damage and is counted.
  if (/for each (?:energy )?cards? (?:you )?put in the lost zone in this way/.test(normalized)) {
    const costs = result.after.filter((step) => step.type.startsWith('atkLostZone'));
    result.after = result.after.filter((step) => !costs.includes(step));
    result.before.push(...costs.map((step) => ({ ...step, countsForDamage: true })));
  }

  // "… for each {G} Energy attached in this way" (Shaymin LV.X Seed Flare): the attach the damage
  // counts runs first and is recorded.
  if (/for each [^.]*energy(?: cards?)? attached in this way/.test(normalized)) {
    const counted = result.after.filter((step) => step.type === 'atkAttach');
    result.after = result.after.filter((step) => !counted.includes(step));
    result.before.push(...counted.map((step) => ({ ...step, countsForDamage: true })));
  }

  // "Discard the top card of your deck. If that card is a {R} Energy card, this attack does 90
  // more damage" (Torkoal V) / "If you discarded a Pokémon Tool in this way" (Dracovish V): the
  // damage reads what the discard found, so the discard runs first and is recorded.
  if (/if (?:that card|the discarded card) is |if you discard(?:ed)? an? [^,]+ in this way, this attack does/.test(normalized)) {
    const reads = (step) => step.type === 'atkMill' || step.type === 'atkDiscardOppTools';
    const moved = result.after.filter(reads);
    result.after = result.after.filter((step) => !reads(step));
    result.before = [...result.before, ...moved].map((step) => (reads(step) ? { ...step, countsForDamage: true } : step));
  }

  // A hand cost the attack cannot be used without ("(If you can't discard a card from your hand,
  // this attack does nothing.)") pays before damage, and the legality gate refuses the attack
  // without the cards (D114). A discard the damage counts ("If you do, this attack does 70 more
  // damage") also runs first, and the reducer counts it.
  const handCost = /if you (?:can't|don't)[^.]*this attack does nothing/.test(normalizeAttackText(text, selfName));
  if (handCost || handScaled) {
    const costs = result.after.filter((step) => HAND_COST_TYPES.has(step.type));
    result.after = result.after.filter((step) => !costs.includes(step));
    result.before.push(...costs.map((step) => (handScaled ? { ...step, countsForDamage: true } : step)));
  }
  return result;
}
