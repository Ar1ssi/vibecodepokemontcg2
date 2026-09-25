// Copy-attack family (design 031, I118): "Choose 1 of … Pokémon's attacks and use it as this
// attack." Pure parsing only; reduce.mjs gathers the candidate attacks and runs the copy.
// Design 039 (I168) adds the residual wordings: old "copies that attack" prints, previous
// Evolutions, last turn, own deck top, opponent discard, Dark-name and Tera filters, and
// inline conditions. Multi-coin "all N are heads" wordings fail closed (see peelCopyPrefix).

import { parseConditionClause } from './attack-conditions.mjs';

const TYPE_LETTERS = {
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
  c: 'Colorless',
};

const OPPONENT_SCOPE = { 'active ': 'oppActive', 'benched ': 'oppBench', '': 'oppInPlay' };

/** Lowercase, accent-free, reminder text in parentheses removed. */
function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/é/g, 'e')
    .replace(/[’‘]/g, "'")
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    // A removed parenthetical can leave " ." behind (Dark Hypno "…name (excluding this one).").
    .replace(/\s+([.,])/g, '$1')
    .trim();
}

/** A trailing "<Name> performs that attack." sentence (older cards) adds nothing. */
const PERFORMS = String.raw`(?: [^.]+ performs that attack\.)?`;

const TEMPLATES = [
  [
    /^choose 1 of your benched (.+?) pokemon's attacks and use it as this attack\.$/,
    (m) => ({ source: 'ownBench', group: m[1] }),
  ],
  // Liepard Assist: any Benched Pokémon, no group.
  [/^choose 1 of your benched pokemon's attacks and use it as this attack\.$/, () => ({ source: 'ownBench' })],
  [
    /^choose 1 of your opponent's (active |benched |)pokemon's attacks and use it as this attack\.$/,
    (m) => ({ source: OPPONENT_SCOPE[m[1]] }),
  ],
  // Marshadow Shadow Imitation.
  [
    /^choose 1 of your opponent's active pokemon's non-gx attacks and use it as this attack\.$/,
    () => ({ source: 'oppActive', excludeGx: true }),
  ],
  // Ditto Copy Anything.
  [
    /^choose 1 of your opponent's pokemon's attacks and use it as this attack\. if this pokemon doesn't have the necessary energy to use that attack, this attack does nothing\.$/,
    () => ({ source: 'oppInPlay', needsEnergy: true }),
  ],
  // Hypno Pendulum Influence (after its coin), Zoroark Foul Play.
  [
    /^choose an attack from 1 of your opponent's pokemon in play and use it as this attack\.$/,
    () => ({ source: 'oppInPlay' }),
  ],
  [/^choose 1 of the defending pokemon's attacks and use it as this attack\.$/, () => ({ source: 'oppActive' })],
  [
    /^choose an attack from a \{(\w)\} pokemon in your discard pile and use it as this attack\.$/,
    (m) => (TYPE_LETTERS[m[1]] ? { source: 'ownDiscard', pokemonType: TYPE_LETTERS[m[1]] } : null),
  ],
  [
    /^reveal the top (\d+) cards of your opponent's deck\. you may choose an attack from a pokemon you find there and use it as this attack\. shuffle the revealed cards into your opponent's deck\.$/,
    (m) => ({ source: 'oppDeckTop', count: parseInt(m[1], 10), optional: true }),
  ],
  [
    new RegExp(
      String.raw`^choose 1 of the defending pokemon's attacks\. (?:if this pokemon has the necessary energy to use that attack, use it as this attack|[^.]+ copies that attack\. this attack does nothing if [^.]+ doesn't have the energy necessary to use that attack)\.` +
        PERFORMS +
        '$'
    ),
    () => ({ source: 'oppActive', needsEnergy: true }),
  ],
  // Togetic Mini-Metronome: the copy happens only on heads (design 032).
  [
    new RegExp(
      String.raw`^flip a coin\. if heads, choose 1 of the defending pokemon's attacks\. [^.]+ copies that attack except for its energy cost\.` +
        PERFORMS +
        '$'
    ),
    () => ({ source: 'oppActive', coinGate: 'heads' }),
  ],
  [
    new RegExp(
      String.raw`^choose 1 of your opponent's benched pokemon's attacks\. [^.]+ copies that attack except for its energy cost\.` +
        PERFORMS +
        '$'
    ),
    () => ({ source: 'oppBench' }),
  ],
  // Old "copies that attack except for its Energy cost" prints (Clefable/Clefairy, Clefable ex).
  [
    new RegExp(
      String.raw`^choose 1 of (?:the defending pokemon|your opponent's active pokemon)'s attacks\. [^.]+ copies that attack except for its energy costs?(?: and anything else required in order to use that attack(?:, such as discarding energy cards)?)?\.` +
        PERFORMS +
        '$'
    ),
    () => ({ source: 'oppActive' }),
  ],
  // "Choose an attack on 1 of your opponent's Pokémon [in play]" (Mew Star, Togetic Super
  // Metronome). The "does nothing if … doesn't have the Energy" sentence adds the energy gate.
  [
    new RegExp(
      String.raw`^choose an attack on 1 of your opponent's pokemon(?: in play)?\. [^.]+ copies that attack(?: except for its energy cost)?\.( this attack does nothing if [^.]+ doesn't have the energy necessary to use that attack\.)?` +
        PERFORMS +
        '$'
    ),
    (m) => (m[1] ? { source: 'oppInPlay', needsEnergy: true } : { source: 'oppInPlay' }),
  ],
  // Mew Re-creation: the opponent's discard pile.
  [
    new RegExp(
      String.raw`^choose an attack on 1 of your opponent's pokemon in (?:his or her|their) discard pile\. [^.]+ copies that attack except for its energy cost\.` +
        PERFORMS +
        '$'
    ),
    () => ({ source: 'oppDiscard' }),
  ],
  // Smeargle Trace: the old Bench wording ("choose an attack on 1 of … Benched Pokémon").
  [
    new RegExp(
      String.raw`^choose an attack on 1 of your opponent's benched pokemon\. [^.]+ copies that attack except for its energy cost\.` +
        PERFORMS +
        '$'
    ),
    () => ({ source: 'oppBench' }),
  ],
  // Dark Hypno Dark Link: an own Pokémon in play with Dark in its name, excluding the user
  // (the printed "(excluding this one)" is stripped by normalize).
  [
    new RegExp(
      String.raw`^choose an attack on 1 of your pokemon in play that has dark in its name\. [^.]+ copies that attack except for its energy cost\.` +
        PERFORMS +
        '$'
    ),
    () => ({ source: 'ownInPlay', darkName: true, excludeSelf: true }),
  ],
  // Team Rocket's Mimikyu: only the opponent's Active Tera Pokémon.
  [
    /^choose 1 of your opponent's active tera pokemon's attacks and use it as this attack\.$/,
    () => ({ source: 'oppActive', tera: true }),
  ],
  // Incineroar / Charizard: this Pokémon's previous Evolutions.
  [
    /^choose an attack from 1 of this pokemon's previous evolutions and use it as this attack\.$/,
    () => ({ source: 'ownEvolutionStack' }),
  ],
  [
    /^choose 1 of this pokemon's attacks from its previous evolutions and use it as this attack\.$/,
    () => ({ source: 'ownEvolutionStack' }),
  ],
  // Slowking Seek Inspiration: discard the deck top, then copy from it if it has no Rule Box.
  [
    /^discard the top card of your deck, and if that card is a pokemon that doesn't have a rule box, choose 1 of its attacks and use it as this attack\.$/,
    () => ({ source: 'ownDeckTop', count: 1, noRuleBox: true }),
  ],
  // Mimikyu Copycat / Sudowoodo Watch and Learn: the attack the opponent used last turn.
  [
    /^if your opponent's pokemon used an attack( that isn't a gx attack)? during (?:their|his or her) last turn, use it as this attack\.$/,
    (m) =>
      m[1]
        ? { source: 'oppLastAttack', excludeGx: true, auto: true }
        : { source: 'oppLastAttack', auto: true },
  ],
];

/**
 * Peels one leading gate off a copy wording: the attack's own coin flip, an inline
 * "If …, <copy wording>" condition, or a "You can use this attack only if …" gate.
 * Returns the remaining text plus the flag the prefix contributes, or null when the prefix
 * is not one this parser can read (fail closed: no wrong copy).
 */
function peelCopyPrefix(text) {
  const coin = /^flip (a|an|(\d+)) coins?\. if (heads|tails|all (\d+) are heads), /.exec(text);
  if (coin) {
    // Multi-coin gates ("Flip 3 coins. If all 3 are heads, …", Misty's Psyduck ESP) are
    // multi-branch attacks: the other outcomes carry effects this copy flow would drop.
    // Fail closed so the attack keeps running its own steps (I168 deferral).
    const printed = coin[2] == null ? 1 : Number(coin[2]);
    if (printed > 1 || coin[4] != null) return null;
    return {
      rest: text.slice(coin[0].length),
      flags: { coinGate: coin[3] === 'tails' ? 'tails' : 'heads' },
    };
  }
  const ifClause = /^if (.+?), /.exec(text);
  if (ifClause) {
    const condition = parseConditionClause(ifClause[1]);
    return condition ? { rest: text.slice(ifClause[0].length), flags: { condition } } : null;
  }
  const onlyIf = /^you can use this attack only if (.+?)\. /.exec(text);
  if (onlyIf) {
    const condition = parseConditionClause(onlyIf[1]);
    return condition ? { rest: text.slice(onlyIf[0].length), flags: { condition } } : null;
  }
  return null;
}

/**
 * The copy source an attack's whole text asks for, or null when the text is not a copy
 * attack (or carries anything the templates don't cover).
 * @returns {{source: string, group?: string, pokemonType?: string, count?: number,
 *   optional?: boolean, needsEnergy?: boolean, excludeGx?: boolean, coinGate?: string,
 *   condition?: object, tera?: boolean, darkName?: boolean, excludeSelf?: boolean,
 *   noRuleBox?: boolean, auto?: boolean} | null}
 */
export function parseCopyAttack(text) {
  let t = normalize(text);
  if (!t) return null;
  const flags = {};
  for (;;) {
    const whole = matchTemplates(t);
    if (whole) return { ...whole, ...flags };
    const peeled = peelCopyPrefix(t);
    if (!peeled) return null;
    t = peeled.rest;
    Object.assign(flags, peeled.flags);
  }
}

function matchTemplates(t) {
  for (const [pattern, build] of TEMPLATES) {
    const m = pattern.exec(t);
    if (m) return build(m);
  }
  return null;
}

/** Whether `card` belongs to the Bench group a copy attack names ("Fusion Strike", "N's"). */
export function inCopyGroup(card, group) {
  if (!card || !group) return false;
  if (/'s$/.test(group)) return String(card.name || '').toLowerCase().startsWith(`${group} `);
  return (card.subtypes || []).some((s) => String(s).toLowerCase() === group);
}

/**
 * The copied attack as the copier uses it: the source's own name in its text reads as the
 * copier ("Ditto performs that attack"), so self-targeting clauses land on the copier.
 */
export function copiedAttackFor(attack, { sourceName, copierName }) {
  const text = String(attack?.text || '');
  const renamed =
    sourceName && copierName && sourceName !== copierName ? text.split(sourceName).join(copierName) : text;
  return { ...attack, text: renamed, copiedFrom: sourceName || '' };
}

/**
 * Attack-borrowing Abilities (design 034 slice 6): "This Pokémon can use the attacks of …
 * (You still need the necessary Energy …)". Returns where the attacks come from and which
 * Pokémon qualify; reduce.mjs gathers them into the attacker's view. Null for other text.
 * @returns {{ scopes: string[], basic: boolean, noRuleBox: boolean, gxOrEx: boolean,
 *   evolvesFrom: string|null, names: string[]|null, requiresActive: boolean }|null}
 */
export function parseAttackBorrowAbility(text) {
  if (!/you still need the necessary energy/i.test(String(text || ''))) return null;
  const t = normalize(text);
  const phrase = t.match(/can use the attacks of (.+?)(?: as its own)?\s*\./)?.[1]?.trim();
  if (!phrase) return null;
  let scopes;
  if (/lost zone/.test(phrase)) scopes = ['ownLostZone', 'oppLostZone'];
  else if (/opponent's active|^that pokemon/.test(phrase)) scopes = ['oppActive'];
  else {
    scopes = [];
    if (/bench/.test(phrase)) scopes.push('ownBench');
    if (/discard pile/.test(phrase)) scopes.push('ownDiscard');
    if (/in play/.test(phrase)) {
      scopes.push('ownInPlay');
      if (!/\byour\b|you have/.test(phrase)) scopes.push('oppInPlay');
    }
  }
  const named = phrase.match(/^all (.+?) you have in play/)?.[1];
  const names =
    named && !/pokemon/.test(named)
      ? named
          .split(/,\s*(?:or\s+)?|\s+or\s+/)
          .map((n) => n.replace(/^other\s+/, '').trim())
          .filter(Boolean)
      : null;
  return {
    scopes,
    basic: /basic pokemon/.test(phrase),
    noRuleBox: /except for pokemon with a rule box/.test(phrase),
    gxOrEx: /pokemon-gx or pokemon-ex/.test(phrase),
    evolvesFrom: phrase.match(/evolve from (\w+)/)?.[1] || null,
    names,
    requiresActive: /if this pokemon is your active|as long as [^.]+ is your active/.test(t),
  };
}
