// Stadium effect engine (taxonomy Section E).
//
// Tracks *which* Stadium is in play (`rules-state.mjs` `markStadiumPlayed` /
// `getStadium` — one-at-a-time rule) and *executes* the effect a Stadium card
// carries. This module is pure + DOM-free (node:test friendly) and mirrors
// `ability-executors.mjs`.

import { rulesState, getStadium } from './rules-state.mjs';
//
// Layers:
//   - `classifyStadiumEffect` — buckets a card into an effect family.
//   - `describeStadiumEffect` — human-readable announcement.
//   - `parseStadiumSetupDraw` / `parseStadiumOncePerTurn` / `parseStadiumDamagePrevention`
//     / `isStadiumRetreatPrevention` / `isStadiumHandProtect` — pure parsers
//     that extract *what* the card does from its printed text.
//   - `applyStadiumEffect` — orchestrates the above and returns a result
//     object with `{ family, executed, message, results[] }`.

// Effect families a Stadium can be classified into.
export const STADIUM_EFFECT_FAMILIES = [
  'setup-once',      // one-shot "when you play this card" effect
  'once-per-turn',   // repeatable once per turn (e.g. Safari Zone search)
  'continuous-both', // always-on modifier affecting both players
  'opponent-affected', // ongoing effect primarily aimed at the opponent
  'none',            // Stadium with no recognized effect (rare)
  'unknown',         // Stadium we can't place
];

// Normalize curly quotes to straight so keyword checks work on card text.
const lower = (v) =>
  String(v ?? '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'");

const subtypesOf = (card) =>
  (Array.isArray(card?.subtypes) ? card.subtypes : []).map(lower);

const textOf = (card) => lower(card?.text ?? card?.cardText ?? '');

const isStadiumCard = (card) => {
  if (!card) return false;
  if (subtypesOf(card).includes('stadium')) return true;
  if (subtypesOf(card).includes('location')) return true;
  const type = lower(card.type);
  const name = lower(card.name);
  return type === 'stadium' || name.includes('zone') || name.includes('rooftop');
};

export { isStadiumCard };

// Matches both the literal "once per turn" and the "once during {each/your/
// either} player's turn" phrasing (e.g. Grand Tree), which is semantically
// the same repeatable-once-per-turn trigger but doesn't contain the literal
// substring "once per turn".
const ONCE_PER_TURN_RE = /once per turn|once during (?:each|your|either) player'?s turn/;

const BOTH_PLAYERS_RE =
  /both players|each player|both active pokémon|both yours and your opponent'?s/;

/** True when card text names a passive modifier the execution layer can hook. */
export function hasRecognizedPassiveStadiumEffect(card) {
  const t = textOf(card);
  if (!t) return false;
  return (
    parseStadiumDamagePrevention(card) !== null ||
    parseStadiumDamageReduction(card) > 0 ||
    isStadiumRetreatPrevention(card) ||
    isStadiumHandProtect(card) ||
    parseStadiumCostModifier(card) > 0 ||
    parseStadiumHpModifier(card) !== 0 ||
    parseStadiumEvolutionSpeed(card).relaxTurnGate ||
    parseStadiumEvolutionSpeed(card).costReduce > 0 ||
    parseStadiumRetreatModifier(card) !== 0 ||
    parseStadiumBenchDamageOnPlay(card) !== null ||
    parseStadiumAttackDamageBonus(card) > 0 ||
    isStadiumStatusImmunity(card) ||
    isStadiumConfusedPersist(card) ||
    parseStadiumBenchLimit(card) !== null ||
    isStadiumToolNegation(card) ||
    isStadiumAbilityNegation(card) ||
    parseStadiumCheckupPoisonBonus(card) > 0 ||
    parseStadiumAttackCostIncrease(card) > 0
  );
}

/** Stadium text applies to both players (not opponent-only targeting). */
export function stadiumAffectsBothPlayers(card) {
  return BOTH_PLAYERS_RE.test(textOf(card));
}

// Bucket a card into a stadium-effect family. Non-stadium / unrecognizable
// cards return 'unknown'. Precedence: the most restrictive trigger wins.
export function classifyStadiumEffect(card) {
  if (!isStadiumCard(card)) return 'unknown';
  const t = textOf(card);
  if (!t) return 'none';
  if (t.includes('when you play this card') || t.includes('when you play it')) {
    return 'setup-once';
  }
  if (ONCE_PER_TURN_RE.test(t)) {
    return 'once-per-turn';
  }
  if (BOTH_PLAYERS_RE.test(t)) {
    return 'continuous-both';
  }
  if (hasRecognizedPassiveStadiumEffect(card)) {
    return 'continuous-both';
  }
  if (t.includes('your opponent')) {
    return 'opponent-affected';
  }
  return 'unknown';
}

// Human-readable, guidance-only description of the effect (for announcements).
export function describeStadiumEffect(card) {
  const family = classifyStadiumEffect(card);
  const name = card?.name || 'This Stadium';
  switch (family) {
    case 'setup-once':
      return `${name}: when-you-play Stadium — a one-shot effect when this card is played (see card text).`;
    case 'once-per-turn':
      return `${name}: once-per-turn Stadium — a repeatable effect available once each turn (see card text).`;
    case 'continuous-both':
      return `${name}: continuous Stadium — an always-on modifier affecting both players while in play.`;
    case 'opponent-affected':
      return `${name}: continuous Stadium — an ongoing effect primarily aimed at your opponent.`;
    case 'none':
      return `${name}: Stadium in play (no effect text recognized).`;
    case 'unknown':
    default:
      return `${name}: Stadium card (no effect family recognized — read the card text).`;
  }
}

// ── Pure parsers (extract WHAT the card does) ──────────────────────────

/**
 * Setup-once: "When you play this card, draw N cards."
 * Returns the number of cards to draw, or null if not a draw effect.
 */
export function parseStadiumSetupDraw(card) {
  const t = textOf(card);
  if (!t.includes('when you play')) return null;
  const m = t.match(/draw (?:up to )?(\d+)/);
  return m ? parseInt(m[1], 10) : 1;
}

/**
 * Once-per-turn: "Once per turn, you may …" (also matches "Once during
 * each player's turn" wording — see ONCE_PER_TURN_RE above).
 * Returns { kind: 'draw'|'search'|'search-evolve'|'heal'|'energy', n } or null.
 */
export function parseStadiumOncePerTurn(card) {
  const t = textOf(card);
  if (!ONCE_PER_TURN_RE.test(t)) return null;
  if (/draw/.test(t)) {
    const m = t.match(/draw (?:up to )?(\d+)/);
    return { kind: 'draw', n: m ? parseInt(m[1], 10) : 1 };
  }
  // Energy attach is checked before search: attach text may also mention
  // searching, but attaching is the primary action.
  if (/attach/.test(t) && /energy/.test(t)) {
    const m = t.match(/up to (\d+)/);
    return { kind: 'energy', n: m ? parseInt(m[1], 10) : 1 };
  }
  // Search-and-evolve (e.g. Grand Tree: search for an evolution and put it
  // onto a Pokémon already in play to evolve it) is a distinct mechanic
  // from a plain search-to-hand — evolving a Pokémon, not fetching a card
  // to hand — so it needs its own kind rather than falling into 'search'
  // and being misrouted as a hand pickup.
  if (/search/.test(t) && /evolv/.test(t)) {
    return { kind: 'search-evolve', n: 1 };
  }
  if (/search|look through|find/.test(t)) {
    return { kind: 'search', n: 1 };
  }
  if (/heal/.test(t)) {
    const m = t.match(/heal\s*(\d+)?/);
    return { kind: 'heal', n: m?.[1] ? parseInt(m[1], 10) : 1 };
  }
  return { kind: 'search', n: 1 };
}

/**
 * Continuous damage prevention: "Prevent all damage …"
 * Returns the number of damage counters prevented (Infinity for "all"),
 * or null if not a prevention effect.
 */
/**
 * Continuous damage prevention: "Prevent all damage …"
 * Returns { amount, zone: 'active'|'bench'|'any', ruleBoxOnly?: bool } or null.
 */
export function parseStadiumDamagePreventionDetail(card) {
  const t = textOf(card);
  if (!t || !/prevent/.test(t) || !/damage/.test(t)) return null;
  let zone = 'any';
  if (/benched pokémon|on the bench|from the bench/.test(t)) zone = 'bench';
  else if (/active pokémon|your active|the active/.test(t)) zone = 'active';
  const ruleBoxOnly = /don't have a rule box|without a rule box|non-rule box/.test(t);
  let amount = Infinity;
  if (!/all damage|all\s+damage/.test(t)) {
    const m = t.match(/(\d+)\s*(?:damage|poison|special)/);
    amount = m ? parseInt(m[1], 10) : Infinity;
  }
  return { amount, zone, ruleBoxOnly };
}

/** Back-compat shim: amount only (Infinity = all). */
export function parseStadiumDamagePrevention(card) {
  const d = parseStadiumDamagePreventionDetail(card);
  return d ? d.amount : null;
}

/** Whether stadium prevention applies to a defender in `zoneId`. */
export function stadiumPreventionApplies(stadiumCard, { zoneId = 'active', defender = null } = {}) {
  const d = parseStadiumDamagePreventionDetail(stadiumCard);
  if (!d) return false;
  if (d.zone === 'bench' && zoneId !== 'bench') return false;
  if (d.zone === 'active' && zoneId !== 'active') return false;
  if (d.ruleBoxOnly && defender && pokemonHasRuleBox(defender)) return false;
  return true;
}

/**
 * Continuous damage reduction: "take N less damage from attacks"
 * Returns the amount reduced, or 0 if not a reduction effect.
 */
export function parseStadiumDamageReduction(card) {
  const t = textOf(card);
  if (!t || !/take\s+\d+\s+less damage/.test(t)) return 0;
  const m = t.match(/take\s+(\d+)\s+less damage/);
  return m ? parseInt(m[1], 10) : 0;
}

/** Whether a Pokémon matches a stadium's printed name/type filter (e.g. {M}, Hop's). */
export function stadiumFilterMatches(card, stadiumCard) {
  const t = textOf(stadiumCard);
  const name = lower(card?.name || '');
  if (!name) return false;
  if (/steven's pokémon/.test(t) && !name.includes('steven')) return false;
  if (/hop's pokémon/.test(t) && !name.includes('hop')) return false;
  if (/n's pokémon/.test(t) && !/\bn's\b/.test(name) && !name.startsWith("n ")) return false;
  if (/\{c\} pokémon/.test(t)) {
    const types = (card?.types || []).map(lower);
    if (types.length && !types.includes('colorless')) return false;
  }
  const typeMatch = t.match(/\{([wlfmpdgyn])\}/i);
  if (typeMatch) {
    const typeMap = {
      w: 'water',
      l: 'lightning',
      f: 'fighting',
      m: 'metal',
      p: 'psychic',
      d: 'darkness',
      g: 'grass',
      y: 'fairy',
      n: 'dragon',
    };
    const want = typeMap[typeMatch[1].toLowerCase()];
    const types = (card?.types || []).map(lower);
    if (want && types.length && !types.includes(want)) return false;
  }
  if (/stage 2 pokémon/.test(t)) {
    const stage = lower(card?.stage || '').replace(/[^a-z0-9]/g, '');
    if (stage && stage !== 'stage2') return false;
  }
  if (/basic pokémon/.test(t)) {
    const stage = lower(card?.stage || '').replace(/[^a-z0-9]/g, '');
    if (stage && stage !== 'basic') return false;
  }
  if (/each psyduck/.test(t) && !name.includes('psyduck')) return false;
  if (/tera pokémon/.test(t) && !(card?.subtypes || []).map(lower).includes('tera')) return false;
  return true;
}

export function pokemonHasRuleBox(card) {
  const sub = (Array.isArray(card?.subtypes) ? card.subtypes : []).map(lower);
  return sub.some((s) =>
    ['ex', 'gx', 'v', 'vstar', 'vmax', 'tera', 'radiant', 'prism star', 'ace spec'].includes(s)
  );
}

/**
 * Opponent retreat prevention: "your opponent's active pokémon can't retreat"
 * Returns true if the stadium prevents opponent retreats.
 */
export function isStadiumRetreatPrevention(card) {
  const t = textOf(card);
  if (!t) return false;
  return /your opponent/.test(t) && /can'?t retreat|cannot retreat/.test(t);
}

/**
 * Cost modifier (continuous): "the energy cost of attacks by your Active
 * Pokémon is reduced by 1" / "attacks cost 1 less Energy" — the stadium
 * equivalent of the Section C `passiveCostDiscount` family (e.g. Lillie's
 * Room–style cost-reduction stadiums).
 * Returns the discount (number of cost symbols removed) or 0 if the
 * stadium does not reduce attack costs. Same parser shape as
 * `passiveCostDiscount` in ability-executors.mjs so the two stack cleanly.
 */
export function parseStadiumCostModifier(card) {
  const t = textOf(card);
  if (!t || !/cost/.test(t)) return 0;
  if (!/(less|reduc|lower)/.test(t)) return 0;
  const m = t.match(/(?:by|less)\s*(\d+)/) || t.match(/(\d+)\s+less/);
  return m ? parseInt(m[1], 10) || 1 : 1;
}

/**
 * Hand protection: "damage counters can't be placed on pokémon in your hand"
 * or "cards in your hand can't be discarded"
 * Returns true if the stadium protects the player's hand.
 */
export function isStadiumHandProtect(card) {
  const t = textOf(card);
  if (!t) return false;
  if (/hand/.test(t) && /(can'?t|cannot|protect|discard)/.test(t)) return true;
  if (/your hand/.test(t) && /can'?t be/.test(t)) return true;
  return false;
}

/**
 * HP modifier (continuous): "Basic Pokémon in play have +20 HP" /
 * "your Pokémon have +20 HP" / "Pokémon in play have 10 less HP".
 * Returns the modifier (positive = +HP, negative = −HP, 0 = none).
 */
export function parseStadiumHpModifier(card) {
  const t = textOf(card);
  if (!t || !/hp/.test(t)) return 0;
  // Negative: "-N HP" / "gets -N HP" / "have N less HP"
  const negSigned = t.match(/(?:gets?\s*)?-\s*(\d+)\s*hp/);
  if (negSigned) return -parseInt(negSigned[1], 10);
  if (/(less|decrease|reduc|lower)/.test(t)) {
    const m = t.match(/(\d+)\s*(?:less|hp)|decreases? by\s*(\d+)|reduced by\s*(\d+)/);
    const n = m ? parseInt(m[1] || m[2] || m[3], 10) : 10;
    return -(n || 10);
  }
  const m =
    t.match(/\+\s*(\d+)\s*(?:hp|more hp)|hp\s*(?:increases?|goes? up|raises?)\s*by\s*(\d+)|(\d+)\s*more hp/);
  const n = m ? parseInt(m[1] || m[2] || m[3], 10) : 0;
  return n || 0;
}

/** Stadium HP modifier applies to this Pokémon (stage/name/type filters). */
export function stadiumHpModifierMatches(stadiumCard, pokemon) {
  if (!pokemon) return true;
  return stadiumFilterMatches(pokemon, stadiumCard);
}

/** Who receives a stadium modifier: owner, opponent, or both. */
function stadiumTargetScope(stadiumCard) {
  const t = textOf(stadiumCard);
  if (stadiumAffectsBothPlayers(stadiumCard)) return 'both';
  if (/your opponent|opponent's/.test(t)) return 'opponent';
  if (/your pokémon|your (?!opponent)/.test(t)) return 'owner';
  return 'both';
}

/**
 * Determine the HP bonus applicable to a given player's Pokémon from the
 * current stadium. Returns a number (positive or negative, 0 if none).
 */
export function getStadiumHpBonus(targetPlayer, pokemon = null) {
  if (!rulesState.enabled) return 0;
  const stadium = getStadium();
  if (!stadium?.card) return 0;
  const bonus = parseStadiumHpModifier(stadium.card);
  if (bonus === 0) return 0;
  if (pokemon && !stadiumHpModifierMatches(stadium.card, pokemon)) return 0;
  const scope = stadiumTargetScope(stadium.card);
  if (scope === 'opponent') return targetPlayer !== stadium.user ? bonus : 0;
  if (scope === 'owner') return targetPlayer === stadium.user ? bonus : 0;
  return bonus;
}

/**
 * Compute effective HP for a Pokémon given a base HP and the target player.
 * Clamped to ≥ 1 so a −HP modifier can't make a Pokémon have 0 HP.
 */
export function effectiveHp(baseHp, targetPlayer, pokemon = null) {
  const base = baseHp || 0;
  if (!base) return 0;
  const bonus = getStadiumHpBonus(targetPlayer, pokemon);
  return Math.max(1, base + bonus);
}

/**
 * Evolution speed (continuous): two recognized sub-effects, mirroring the
 * Section C passive hook shape:
 *   - `relaxTurnGate` — "may evolve as if it had been in play for 1 more
 *     turn" / "as if it were already in play": the Pokémon is not treated
 *     as just-played, so the same-turn evolution gate is relaxed.
 *   - `costReduce` — "evolving costs N less Energy" / "evolutions cost N
 *     less": N energy removed from the evolution cost.
 * Returns `{ relaxTurnGate: bool, costReduce: number }`; both default to
 * their "no effect" values when the card does not grant them.
 */
export function parseStadiumEvolutionSpeed(card) {
  const t = textOf(card);
  const out = { relaxTurnGate: false, costReduce: 0, typeFilter: null };
  if (!t || !/evolv/.test(t)) return out;
  const typeMatch = t.match(/\{([wlfmpdgyn])\}/i);
  if (typeMatch) {
    const typeMap = {
      w: 'water',
      l: 'lightning',
      f: 'fighting',
      m: 'metal',
      p: 'psychic',
      d: 'darkness',
      g: 'grass',
      y: 'fairy',
      n: 'dragon',
    };
    out.typeFilter = typeMap[typeMatch[1].toLowerCase()] || null;
  }
  if (
    /as if (?:it|they) (?:had been|were) (?:in play|already)/.test(t) ||
    /since the start of the (?:game|battle|previous turn)/.test(t) ||
    /even if (?:it|they) (?:had been|were) (?:just )?played/.test(t) ||
    /during the turn (?:they|you) play those pokémon/.test(t) ||
    /can evolve .* during the turn they play/.test(t)
  ) {
    out.relaxTurnGate = true;
  }
  if (/cost/.test(t) && /(less|reduc|lower)/.test(t)) {
    const m = t.match(/(?:by|less)\s*(\d+)/) || t.match(/(\d+)\s+less/);
    if (m) out.costReduce = parseInt(m[1], 10) || 1;
  }
  return out;
}

export function getStadiumEvolutionSpeed(targetPlayer, pokemon = null) {
  const neutral = { relaxTurnGate: false, costReduce: 0, typeFilter: null };
  if (!rulesState.enabled) return neutral;
  const stadium = getStadium();
  if (!stadium?.card) return neutral;
  const parsed = parseStadiumEvolutionSpeed(stadium.card);
  if (!parsed.relaxTurnGate && parsed.costReduce === 0) return neutral;
  if (pokemon && parsed.typeFilter) {
    const types = (pokemon?.types || []).map(lower);
    if (types.length && !types.includes(parsed.typeFilter)) return neutral;
  }
  const scope = stadiumTargetScope(stadium.card);
  if (scope === 'opponent') {
    return targetPlayer !== stadium.user ? parsed : neutral;
  }
  if (scope === 'owner') {
    return targetPlayer === stadium.user ? parsed : neutral;
  }
  return parsed;
}

/**
 * Retreat cost modifier: "Retreat Cost … is {C} less" / "have no Retreat Cost".
 * Returns delta applied to printed retreat (negative = cheaper).
 */
export function parseStadiumRetreatModifier(card) {
  const t = textOf(card);
  if (!t || !/retreat cost|retreat/.test(t)) return 0;
  if (/no retreat cost|retreat cost of 0|retreat for free/.test(t)) return -Infinity;
  if (/(less|reduc|lower)/.test(t)) {
    const m = t.match(/(?:by|less)\s*(\d+)|(\d+)\s+less/);
    return -(m ? parseInt(m[1] || m[2], 10) || 1 : 1);
  }
  return 0;
}

/** Effective retreat cost for a Pokémon with the current stadium in play. */
export function getStadiumRetreatCost(baseRetreat, pokemon, targetPlayer) {
  if (!rulesState.enabled) return baseRetreat;
  const stadium = getStadium();
  if (!stadium?.card) return baseRetreat;
  const delta = parseStadiumRetreatModifier(stadium.card);
  if (delta === 0) return baseRetreat;
  if (!stadiumFilterMatches(pokemon, stadium.card)) return baseRetreat;
  const scope = stadiumTargetScope(stadium.card);
  if (scope === 'opponent' && targetPlayer === stadium.user) return baseRetreat;
  if (scope === 'owner' && targetPlayer !== stadium.user) return baseRetreat;
  if (delta === -Infinity) return 0;
  return Math.max(0, baseRetreat + delta);
}

/** Bench play damage (Risky Ruins): damage counters placed when benching Basics. */
export function parseStadiumBenchDamageOnPlay(card) {
  const t = textOf(card);
  if (!t || !/bench/.test(t)) return null;
  if (!/place\s+\d+\s+damage counter/.test(t)) return null;
  const m = t.match(/place\s+(\d+)\s+damage counter/);
  return m ? parseInt(m[1], 10) : null;
}

/** Attack damage bonus from stadium (Postwick-style). */
export function parseStadiumAttackDamageBonus(card) {
  const t = textOf(card);
  if (!t || !/do\s+\d+\s+more damage/.test(t)) return 0;
  const m = t.match(/do\s+(\d+)\s+more damage/);
  return m ? parseInt(m[1], 10) : 0;
}

export function getStadiumAttackDamageBonus(attacker, targetPlayer) {
  if (!rulesState.enabled || !attacker) return 0;
  const stadium = getStadium();
  if (!stadium?.card) return 0;
  const bonus = parseStadiumAttackDamageBonus(stadium.card);
  if (bonus <= 0) return 0;
  if (!stadiumFilterMatches(attacker, stadium.card)) return 0;
  const scope = stadiumTargetScope(stadium.card);
  if (scope === 'opponent' && targetPlayer === stadium.user) return 0;
  if (scope === 'owner' && targetPlayer !== stadium.user) return 0;
  return bonus;
}

/** Festival Grounds-style: Energy-attached Pokémon can't gain Special Conditions. */
export function isStadiumStatusImmunity(card) {
  const t = textOf(card);
  return (
    /special condition/.test(t) &&
    /can'?t be affected|can't be affected|recover/.test(t) &&
    /energy attached/.test(t)
  );
}

/** Dizzying Valley: Confused Pokémon don't recover on evolve/devolve. */
export function isStadiumConfusedPersist(card) {
  const t = textOf(card);
  return /confused pokémon/.test(t) && /don'?t recover/.test(t) && /evolve|devolve/.test(t);
}

/** Area Zero Underdepths-style bench limit (null = default 5). */
export function parseStadiumBenchLimit(card) {
  const t = textOf(card);
  const m = t.match(/up to (\d+) pokémon on (?:their|your) bench/);
  return m ? parseInt(m[1], 10) : null;
}

/** Bench play damage applies to this Pokémon (Risky Ruins filters). */
export function stadiumBenchDamageApplies(pokemon, stadiumCard) {
  const amount = parseStadiumBenchDamageOnPlay(stadiumCard);
  if (!amount) return null;
  const t = textOf(stadiumCard);
  const stage = lower(pokemon?.stage || '').replace(/[^a-z0-9]/g, '');
  if (/basic/.test(t) && stage && stage !== 'basic') return null;
  if (/non-\{d\}/.test(t)) {
    const types = (pokemon?.types || []).map(lower);
    if (types.includes('darkness')) return null;
  }
  return amount;
}

/** Festival Grounds: block new Special Conditions on Energy-attached Pokémon. */
export function stadiumBlocksStatusApplication(pokemon, zoneCards = []) {
  if (!rulesState.enabled) return false;
  const stadium = getStadium()?.card;
  if (!stadium || !isStadiumStatusImmunity(stadium)) return false;
  if (!pokemon?.image) return false;
  const attached = (zoneCards || []).filter(
    (c) => c.type === 'Energy' && c.image?.relative === pokemon.image
  );
  return attached.length > 0;
}

export function getStadiumDamageReduction(defender, targetPlayer, zoneId = 'active') {
  if (!rulesState.enabled || !defender) return 0;
  const stadium = getStadium();
  if (!stadium?.card) return 0;
  const amount = parseStadiumDamageReduction(stadium.card);
  if (amount <= 0) return 0;
  if (!stadiumFilterMatches(defender, stadium.card)) return 0;
  const scope = stadiumTargetScope(stadium.card);
  if (scope === 'opponent' && targetPlayer === stadium.user) return 0;
  if (scope === 'owner' && targetPlayer !== stadium.user) return 0;
  return amount;
}

/** Jamming Tower: Pokémon Tools have no effect. */
export function isStadiumToolNegation(card) {
  const t = textOf(card);
  return /pokémon tools/.test(t) && /have no effect/.test(t);
}

/** Team Rocket's Watchtower: matching Pokémon have no Abilities. */
export function isStadiumAbilityNegation(card) {
  const t = textOf(card);
  return /have no abilities/.test(t);
}

export function stadiumAbilityBlocked(pokemon) {
  if (!rulesState.enabled || !pokemon) return false;
  const stadium = getStadium()?.card;
  if (!stadium || !isStadiumAbilityNegation(stadium)) return false;
  return stadiumFilterMatches(pokemon, stadium);
}

/** Perilous Jungle: extra poison damage during Pokémon Checkup. */
export function parseStadiumCheckupPoisonBonus(card) {
  const t = textOf(card);
  if (!/pokémon checkup/.test(t) || !/poisoned/.test(t)) return 0;
  const m = t.match(/(\d+)\s+more damage counter/);
  return m ? parseInt(m[1], 10) : 0;
}

export function getStadiumCheckupPoisonBonus(pokemon, targetPlayer) {
  if (!rulesState.enabled || !pokemon) return 0;
  const stadium = getStadium();
  if (!stadium?.card) return 0;
  const bonus = parseStadiumCheckupPoisonBonus(stadium.card);
  if (bonus <= 0) return 0;
  const t = textOf(stadium.card);
  if (/non-\{d\}/.test(t)) {
    const types = (pokemon?.types || []).map(lower);
    if (types.includes('darkness')) return 0;
  }
  const scope = stadiumTargetScope(stadium.card);
  if (scope === 'opponent' && targetPlayer === stadium.user) return 0;
  if (scope === 'owner' && targetPlayer !== stadium.user) return 0;
  return bonus;
}

/** Nighttime Mine: attacks cost {C} more for filtered Pokémon. */
export function parseStadiumAttackCostIncrease(card) {
  const t = textOf(card);
  if (!/cost/.test(t) || !/more/.test(t)) return 0;
  const m = t.match(/\{c\}\s+more|cost\s+\{c\}\s+more|(\d+)\s+more/);
  return m ? parseInt(m[1], 10) || 1 : 1;
}

export function getStadiumAttackCostIncrease(attacker, targetPlayer) {
  if (!rulesState.enabled || !attacker) return 0;
  const stadium = getStadium();
  if (!stadium?.card) return 0;
  const increase = parseStadiumAttackCostIncrease(stadium.card);
  if (increase <= 0) return 0;
  if (!stadiumFilterMatches(attacker, stadium.card)) return 0;
  const scope = stadiumTargetScope(stadium.card);
  if (scope === 'opponent' && targetPlayer === stadium.user) return 0;
  if (scope === 'owner' && targetPlayer !== stadium.user) return 0;
  return increase;
}

// ── Execution orchestrator ─────────────────────────────────────────────

function collectPassiveStadiumResults(card) {
  const results = [];
  const prevention = parseStadiumDamagePreventionDetail(card);
  if (prevention) results.push({ action: 'damage-prevention', ...prevention });
  const reduction = parseStadiumDamageReduction(card);
  if (reduction > 0) results.push({ action: 'damage-reduction', amount: reduction });
  if (isStadiumRetreatPrevention(card)) {
    results.push({ action: 'retreat-prevention', target: 'opponent' });
  }
  if (isStadiumHandProtect(card)) results.push({ action: 'hand-protect' });
  const hpMod = parseStadiumHpModifier(card);
  if (hpMod !== 0) results.push({ action: 'hp-modifier', amount: hpMod });
  const evo = parseStadiumEvolutionSpeed(card);
  if (evo.relaxTurnGate || evo.costReduce > 0) results.push({ action: 'evolution-speed', ...evo });
  const retreatMod = parseStadiumRetreatModifier(card);
  if (retreatMod !== 0) results.push({ action: 'retreat-modifier', delta: retreatMod });
  const benchDmg = parseStadiumBenchDamageOnPlay(card);
  if (benchDmg) results.push({ action: 'bench-damage-on-play', amount: benchDmg });
  const atkBonus = parseStadiumAttackDamageBonus(card);
  if (atkBonus > 0) results.push({ action: 'attack-damage-bonus', amount: atkBonus });
  if (isStadiumStatusImmunity(card)) results.push({ action: 'status-immunity' });
  if (isStadiumConfusedPersist(card)) results.push({ action: 'confused-persist' });
  const benchLimit = parseStadiumBenchLimit(card);
  if (benchLimit) results.push({ action: 'bench-limit', limit: benchLimit });
  const costMod = parseStadiumCostModifier(card);
  if (costMod > 0) results.push({ action: 'cost-modifier', amount: costMod });
  if (isStadiumToolNegation(card)) results.push({ action: 'tool-negation' });
  if (isStadiumAbilityNegation(card)) results.push({ action: 'ability-negation' });
  const checkupPoison = parseStadiumCheckupPoisonBonus(card);
  if (checkupPoison > 0) results.push({ action: 'checkup-poison', amount: checkupPoison });
  const costInc = parseStadiumAttackCostIncrease(card);
  if (costInc > 0) results.push({ action: 'attack-cost-increase', amount: costInc });
  return results;
}

/**
 * Apply (or describe) a stadium effect. Returns:
 *   { family, executed, message, results: [] }
 *
 * For `setup-once` and `once-per-turn` families, `results` contains parsed
 * action descriptors that the *execution layer* (chat-buttons.js) can act on.
 * For `continuous-*` families, `results` describes the ongoing modifier.
 * `executed` is true when the effect is actionable (once-per-turn, setup-once),
 * false for passive/continuous effects (they don't require a player action)
 * or when the card is unparseable.
 */
export function applyStadiumEffect(card) {
  const family = classifyStadiumEffect(card);
  const description = describeStadiumEffect(card);
  const results = [];

  switch (family) {
    case 'setup-once': {
      const drawN = parseStadiumSetupDraw(card);
      if (drawN) results.push({ action: 'draw', n: drawN });
      return {
        family,
        executed: true,
        message: `◈ ${description} → Draw ${drawN ?? 1} card(s).`,
        results,
      };
    }
    case 'once-per-turn': {
      const parsed = parseStadiumOncePerTurn(card);
      if (parsed) results.push({ action: parsed.kind, n: parsed.n });
      return {
        family,
        executed: true,
        message: `◈ ${description} → ${parsed ? `${parsed.kind} (${parsed.n})` : 'see card text'}.`,
        results,
      };
    }
    case 'continuous-both':
    case 'opponent-affected': {
      const passiveResults = collectPassiveStadiumResults(card);
      results.push(...passiveResults);
      return {
        family,
        executed: results.length > 0,
        message: `◈ ${description} (continuous — always active while in play).`,
        results,
      };
    }
    case 'none':
    case 'unknown':
    default: {
      const passiveResults = collectPassiveStadiumResults(card);
      if (passiveResults.length > 0) {
        return {
          family: 'continuous-both',
          executed: true,
          message: `◈ ${description} (continuous — always active while in play).`,
          results: passiveResults,
        };
      }
      return {
        family,
        executed: false,
        message: `◈ ${description} (no recognized effect to execute)`,
        results: [],
      };
    }
  }
}
