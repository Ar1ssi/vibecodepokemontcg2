// Pure parsers for the remaining Section C ability families
// (taxonomy docs/card-types-taxonomy.md §C): passive, when-played,
// end-of-turn, damage-prevent, hand-protect, opponent-disrupt.
//
// DOM-free and node:test friendly. Execution lives in chat-buttons.js /
// the attack path; this module only extracts *what* a card does from its
// printed ability text.

import { isBasicPokemon } from '../cards.mjs';
import { isExCard, isGxCard } from './card-classify.mjs';

const lower = (v) =>
  String(v ?? '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'");

const firstAbilityText = (card) => {
  const arr = Array.isArray(card?.abilities) ? card.abilities : [];
  if (arr.length === 0) return '';
  const first = arr[0];
  return typeof first === 'string' ? first : first?.text || '';
};

const textOf = (card) =>
  lower(
    card?.ability?.text ??
      card?.abilityText ??
      card?.text ??
      card?.effect ??
      // Server-hydrated cards carry abilities as a plural array only; without
      // this fallback every text-driven parser saw an empty string and silently
      // skipped the card's ability (e.g. passive cost discounts).
      firstAbilityText(card)
  );

// --- position ----------------------------------------------------------

// Whether the ability is printed as a conditional on THIS Pokémon's position, which gates where it
// may be activated from. The wording has to be the restrictive clause, not a bare mention of the
// Active Spot: "when this Pokémon moves from your Bench to the Active Spot" is a trigger that fires
// on the move and stays legal from the Bench, and "As long as this Pokémon is in the Active Spot …"
// is a passive with nothing to activate. Matching either of those would disable a legal ability,
// which costs more than the over-permissive behavior this replaces.
const ACTIVE_SPOT_CLAUSE = /if this pok[eé]mon is (?:in the active spot|active)\b/;

export function requiresActiveSpot(card) {
  return ACTIVE_SPOT_CLAUSE.test(textOf(card));
}

// "Once during your turn, if any of your Pokémon were Knocked Out during your opponent's last turn"
// (Fezandipiti ex Flip the Script) is only activatable the turn after such a Knockout.
const OPPONENT_TURN_KO_CLAUSE = /knocked out during your opponent.s last turn/;

export function requiresKoOnOpponentTurn(card) {
  return OPPONENT_TURN_KO_CLAUSE.test(textOf(card));
}

// "When you play this Pokémon from your hand to evolve 1 of your Pokémon"
// (Primarina Enriching Melody) is a one-shot trigger, legal only on the turn
// that Pokémon was played. Distinct from the played-to-Bench wording, which
// has its own one-shot window.
const EVOLVE_PLAYED_CLAUSE =
  /when you play this pok[eé]mon from your hand to evolve\b/;

function matchesFirstAbilityOrText(card, clause) {
  const arrText =
    Array.isArray(card?.abilities) && card.abilities.length > 0
      ? typeof card.abilities[0] === 'string'
        ? card.abilities[0]
        : card.abilities[0]?.text
      : '';
  return clause.test(textOf(card)) || clause.test(lower(arrText || ''));
}

export function isEvolvePlayedTrigger(card) {
  return matchesFirstAbilityOrText(card, EVOLVE_PLAYED_CLAUSE);
}

// "When you play this Pokémon from your hand onto your Bench during your turn"
// (Meowth ex Last Ditch Catch) is a one-shot trigger: legal only while the
// Pokémon is still on the Bench the turn it was played there from hand.
const BENCH_PLAYED_CLAUSE =
  /when you play this pok[eé]mon from your hand (?:on)?to your bench\b/;

export function isBenchPlayedTrigger(card) {
  return matchesFirstAbilityOrText(card, BENCH_PLAYED_CLAUSE);
}

// Wording that makes an ability something the player activates. Anything else is a passive
// ("As long as…", "Prevent all damage…") or an automatic trigger ("If this Pokémon is Knocked
// Out…", "Whenever your opponent attaches…") that must never run from the ability button.
// Checked over the full corpus (S266): every non-matching text is a passive or trigger.
const ACTIVATED_ABILITY_CLAUSE =
  /once during your turn|during your (?:first )?turn\b[^.]*?\byou may\b|at any time during your turn|once during a game on your turn|you may use this ability|as often as you like|once per turn|when you play [^.]*?from your hand/;

export function isActivatedAbility(card, abilityIndex = 0) {
  const ability = Array.isArray(card?.abilities) ? card.abilities[abilityIndex] : null;
  const text = typeof ability === 'string' ? ability : ability?.text;
  return ACTIVATED_ABILITY_CLAUSE.test(text != null ? lower(text) : textOf(card));
}

// --- passive -----------------------------------------------------------

// How many cost symbols a passive ability removes from attacks.
// "reduce the cost … by 1" / "attacks cost 1 less" → 1; "cost less" → 1.
//
// The text has to actually describe a REDUCTION. This previously matched on /(cost|energy)/ and
// then returned 1 whenever no number was found, so every ability that merely mentioned Energy
// granted a free symbol off every attack: Charmander's Agile ("If this Pokémon has no Energy
// attached, it has no Weakness") made its Live Coal payable with zero Energy attached. A
// false positive here silently removes a cost from combat, which is far worse than missing an
// exotic wording, so the reduction verb is now required rather than assumed.
export function passiveCostDiscount(card) {
  const t = textOf(card);
  if (!t) return 0;
  if (!/(less|fewer|reduc|decrease|lower)/.test(t)) return 0;
  // …and it has to be an ATTACK cost. "The Retreat Cost of this Pokémon is 1 less" is a retreat
  // modifier — parseRetreatCostModifier owns that — and reading it here would discount attacks.
  if (/retreat/.test(t) && !/attack/.test(t)) return 0;
  if (!/(cost|energy|attack)/.test(t)) return 0;
  const by =
    t.match(/(?:by|less|fewer)\s*(\d+)/) ||
    t.match(/(\d+)\s+(?:less|fewer)/);
  if (by) return parseInt(by[1], 10) || 1;
  return 1;
}

// Apply a cost discount: drop `n` symbols from the front of the cost list.
export function applyCostDiscount(cost = [], discount = 0) {
  return [...cost].slice(0, Math.max(0, cost.length - discount));
}

// --- when-played -------------------------------------------------------

// One-shot "When you play this Pokémon" effect. Returns the parsed action:
// { kind: 'draw' | 'damage' | 'search', n } or null if unparseable.
export function parseWhenPlayedEffect(card) {
  const t = textOf(card);
  if (!t.includes('when you play')) return null;
  if (/draw/i.test(t)) {
    const m = t.match(/draw (?:up to )?(\d+)?/);
    return { kind: 'draw', n: m?.[1] ? parseInt(m[1], 10) : 1 };
  }
  if (/damage counter/.test(t)) {
    const m = t.match(/(\d+)\s+damage/);
    return { kind: 'damage', n: m?.[1] ? parseInt(m[1], 10) : 1 };
  }
  if (/search|look through|find/.test(t)) {
    return { kind: 'search', n: 1 };
  }
  return null;
}

// --- end-of-turn -------------------------------------------------------

// "At the end of your turn, draw N" style triggers.
// Returns { kind: 'draw' | 'search', n } or null.
export function parseEndOfTurnEffect(card) {
  const t = textOf(card);
  if (!t || !/end of your turn/.test(t)) return null;
  if (/draw/i.test(t)) {
    const m = t.match(/draw (?:up to )?(\d+)?/);
    return { kind: 'draw', n: m?.[1] ? parseInt(m[1], 10) : 1 };
  }
  if (/search|look through|find/.test(t)) return { kind: 'search', n: 1 };
  return null;
}

// --- damage-prevent ----------------------------------------------------

// { preventAll: bool, reduce: number } — reduce is in damage-counter
// (10 HP) units, matching computeAttackDamage output.
export function parseDamagePrevention(card) {
  const t = textOf(card);
  const out = { preventAll: false, reduce: 0 };
  if (!t) return out;
  if (
    /prevent (all )?(damage|effect)/.test(t) ||
    t.includes("can't be damaged")
  ) {
    out.preventAll = true;
    return out;
  }
  const m = t.match(/reduc(?:e|ed).*?(\d+)/);
  if (m) out.reduce = parseInt(m[1], 10) || 0;
  return out;
}

// Apply prevention to an incoming damage amount (in counters).
export function applyDamagePrevention(incoming, prevention) {
  if (prevention?.preventAll) return 0;
  const reduced = incoming - (prevention?.reduce || 0);
  return reduced > 0 ? reduced : 0;
}

/** Merge two prevention structs (stack reductions; any preventAll wins). */
export function mergeDamagePrevention(a, b) {
  const out = { preventAll: false, reduce: 0 };
  if (a?.preventAll || b?.preventAll) {
    out.preventAll = true;
    return out;
  }
  out.reduce = (a?.reduce || 0) + (b?.reduce || 0);
  return out;
}

/** Pokémon Tool attached to a host (not Energy / Pokémon). */
export function isPokemonToolCard(card) {
  if (!card) return false;
  const type = String(card.type || '').toLowerCase();
  if (type === 'pokémon' || type === 'pokemon' || type === 'energy')
    return false;
  const sub = (Array.isArray(card.subtypes) ? card.subtypes : []).map((s) =>
    String(s).toLowerCase()
  );
  if (sub.includes('tool') || sub.includes('pokémon tool')) return true;
  if (card.isTool) return true;
  if (type === 'tool') return true;
  if (String(card.trainerType || '').toLowerCase() === 'tool') return true;
  return false;
}

/** Tools attached to a Pokémon in a zone array. */
export function attachedTools(pokemon, zoneCards = []) {
  if (!pokemon) return [];
  return (zoneCards || []).filter((c) => {
    if (!isPokemonToolCard(c)) return false;
    if (pokemon.instanceId != null && c.attachedTo === pokemon.instanceId)
      return true;
    if (pokemon.image && c.image?.relative === pokemon.image) return true;
    return false;
  });
}

/** Damage prevention from Pokémon + attached Tools (optional tool block). */
export function combinedDamagePrevention(
  pokemon,
  zoneCards = [],
  { blockTools = false } = {}
) {
  let out = parseDamagePrevention(pokemon);
  if (blockTools) return out;
  for (const tool of attachedTools(pokemon, zoneCards)) {
    out = mergeDamagePrevention(out, parseDamagePrevention(tool));
  }
  return out;
}

/** Passive attack-cost discount from Pokémon + attached Tools. */
export function combinedPassiveCostDiscount(
  pokemon,
  zoneCards = [],
  { blockTools = false } = {}
) {
  let discount = passiveCostDiscount(pokemon);
  if (blockTools) return discount;
  for (const tool of attachedTools(pokemon, zoneCards)) {
    discount += passiveCostDiscount(tool);
  }
  return discount;
}

/** Hand protection from Pokémon abilities or attached Tools. */
export function combinedHandProtected(
  pokemon,
  zoneCards = [],
  { blockTools = false } = {}
) {
  if (isHandProtected(pokemon)) return true;
  if (blockTools) return false;
  return attachedTools(pokemon, zoneCards).some((t) => isHandProtected(t));
}

// --- hand-protect ------------------------------------------------------

// "Your hand can't be reduced / cards in hand can't be affected"
export function isHandProtected(card) {
  const t = textOf(card);
  return /hand/.test(t) && /(can't|cannot|immune)/.test(t);
}

// --- energy-redirect / lock --------------------------------------------

// "move/redirect N Energy from this Pokémon to 1 of your other Pokémon"
// → { kind: 'redirect', n }.
// "…can't move or remove Energy…" (energy lock) → { kind: 'lock' }.
// Anything else → null.
export function parseEnergyRedirect(card) {
  const t = textOf(card);
  if (!t || !t.includes('energy')) return null;
  const m = t.match(/(?:redirect|move)\s+(?:up to\s+)?(\d+)?\s+energy/);
  if (m) return { kind: 'redirect', n: m[1] ? parseInt(m[1], 10) : 1 };
  if (/(can't|cannot)/.test(t) && /(move|remov)/.test(t)) {
    return { kind: 'lock' };
  }
  return null;
}

// --- opponent-disrupt --------------------------------------------------

// "Discard N cards from your opponent's hand" → N; unparseable → 1.
// Self-hand discard costs (e.g. Mortal Shuriken) → 0.
export function parseOpponentDiscard(card) {
  const t = textOf(card);
  if (!/opponent/.test(t) || !/discard/.test(t)) return 0;
  if (
    t.includes('from your hand') &&
    !t.includes("opponent's hand") &&
    !t.includes('from your opponent')
  ) {
    return 0;
  }
  const m = t.match(/discard (?:up to )?(\d+)?/);
  return m?.[1] ? parseInt(m[1], 10) : 1;
}

// --- announce-only families (Section C parsers) ------------------------
// Pure extractors for ability families that are recognized but not yet
// executed. Mirrors the step shapes from abilities.mjs.

const ENERGY_LETTER_TO_TYPE = {
  g: 'Grass',
  r: 'Fire',
  w: 'Water',
  l: 'Lightning',
  p: 'Psychic',
  f: 'Fighting',
  d: 'Darkness',
  m: 'Metal',
  y: 'Fairy',
  c: 'Colorless',
};

const parseNumber = (m) => (m?.[1] ? parseInt(m[1], 10) || 0 : 0);

// "takes N less damage", "reduce damage by N"
export function parseDamageReduction(card) {
  const t = textOf(card);
  if (!t) return { reduce: 0 };
  const matches =
    t.includes('less damage') ||
    t.includes('reduce damage') ||
    (t.includes('damage dealt to') && t.includes('reduced'));
  if (!matches) return { reduce: 0 };
  const m =
    t.match(/(\d+)\s+less\s+damage/) ||
    t.match(/reduce\s+damage\s+by\s+(\d+)/) ||
    t.match(/reduc(?:e|ed).*?(\d+)/);
  return { reduce: parseNumber(m) };
}

// "does N more damage", "deals N more damage"
export function parseDamageBonus(card) {
  const t = textOf(card);
  if (
    !t ||
    !t.includes('more damage') ||
    !(
      t.includes('attack') ||
      t.includes('this pokémon') ||
      t.includes('deals') ||
      t.includes('does')
    )
  ) {
    return { bonus: 0 };
  }
  const m =
    t.match(/(\d+)\s+more\s+damage/) ||
    t.match(/(?:deals|does)\s+(\d+)\s+more/);
  return { bonus: parseNumber(m) };
}

export function applyDamageBonus(baseDamage, bonus) {
  return (baseDamage || 0) + (bonus || 0);
}

// "+N HP", "gets +N HP for each"
export function parseHpBonus(card) {
  const t = textOf(card);
  if (!t || !/hp/.test(t)) return { bonus: 0 };
  // Negative printed modifiers (Hero's Medal, Island Challenge Amulet).
  const neg = t.match(/gets\s+-(\d+)\s+hp/);
  if (neg) return { bonus: -(parseInt(neg[1], 10) || 0) };
  if (!/(more|increase|treated as|gets \+|\+\d+\s+hp|for each)/.test(t)) {
    return { bonus: 0 };
  }
  const m =
    t.match(/(\d+)\s+more\s+hp/) ||
    t.match(/(\d+)\s+hp\s+more/) ||
    t.match(/gets\s+\+(\d+)\s+hp/) ||
    t.match(/\+(\d+)\s+hp/) ||
    t.match(/for each[^.]*?\+(\d+)\s+hp/);
  return { bonus: parseNumber(m) };
}

export function applyHpBonus(baseHp, bonus) {
  const base = baseHp || 0;
  if (!base) return 0;
  return Math.max(1, base + (bonus || 0));
}

// "+N more to retreat", "retreat cost is N less"
export function parseRetreatCostModifier(card) {
  const t = textOf(card);
  if (!t || (!t.includes('retreat cost') && !/retreat/.test(t)))
    return { delta: 0 };
  if (
    !/remaining hp is 30 or less/i.test(t) &&
    /has no retreat cost|no retreat cost|retreat cost is 0|retreat for free/i.test(
      t
    )
  ) {
    // Rescue Board's zero is conditional on remaining HP; the "{C} less" half
    // must still apply, and combinedToolRetreatCost zeroes the conditional case.
    return { delta: -Infinity };
  }
  const increased = /(more|increase)/.test(t);
  const decreased = /(less|fewer|reduc|decrease)/.test(t);
  if (!increased && !decreased) return { delta: 0 };
  // The modifier numeral must sit next to more/less ("2 less", "is 3 or more"
  // is a CONDITION, not a modifier — Heavy Boots, I133/A4). TCGdex prints
  // retreat modifiers with energy symbols, not numerals: Air Balloon is
  // "{C}{C} less" (two Colorless), counted by symbolCount below.
  const m = t.match(/(\d+)\s*(?:more|less|fewer)/);
  const symbolCount = (t.match(/\{[a-z]\}/g) || []).length;
  const n = m ? parseInt(m[1], 10) || 1 : symbolCount;
  if (!n) return { delta: 0 };
  if (decreased && !increased) return { delta: -n };
  if (increased) return { delta: n };
  return { delta: 0 };
}

export function applyRetreatCostModifier(baseCost, delta) {
  if (delta === -Infinity) return 0;
  return Math.max(0, (baseCost || 0) + (delta || 0));
}

// Team-wide "no Retreat Cost" passives printed on a Pokémon in play, read for
// the Active Spot (e.g. Latias ex "Skyliner": "Your Basic Pokémon in play have
// no Retreat Cost."). The active Pokémon's own copy is handled by
// parseRetreatCostModifier; this covers the ability holder sitting on the Bench.
// Energy-conditional wordings ("Each of your Pokémon that has any {W} Energy
// attached…") are not handled here.
export function teamNoRetreatCostForActive(activeCard, benchCards) {
  if (!activeCard) return false;
  const activeName = lower(activeCard?.name || '');
  const activeIsBasic = isBasicPokemon(activeCard);
  const activeIsExOrGx = isExCard(activeCard) || isGxCard(activeCard);
  for (const card of Array.isArray(benchCards) ? benchCards : []) {
    if (!card || card.attachedTo || card.image?.attached) continue;
    const t = textOf(card);
    if (!/no retreat cost/.test(t)) continue;
    // "Your Pokémon in play have no Retreat Cost, except Pokémon-GX and Pokémon-EX."
    if (/except[^.]*pok[eé]mon-(?:gx|ex)/.test(t) && activeIsExOrGx) continue;
    if (/your basic pok[eé]mon in play have no retreat cost/.test(t)) {
      if (activeIsBasic) return true;
      continue;
    }
    if (/your pok[eé]mon in play have no retreat cost/.test(t)) return true;
    // Name-specific, e.g. "Your Latios in play have no Retreat Cost."
    const named = t.match(
      /your ([a-z0-9 .'’-]+?) in play have no retreat cost/
    );
    if (named && activeName.includes(named[1].trim())) return true;
  }
  return false;
}

// "take N fewer/more Prize cards" (I131). Only the prize clause may supply the
// number: the text's first number is usually HP/damage ("gets -100 HP, and if
// it is Knocked Out … takes 1 fewer Prize card"), which made Hero's Medal take
// 0 prizes and Luxurious Cape take 101.
export function parsePrizeModify(card) {
  const t = textOf(card);
  if (!t || !t.includes('prize card')) return { delta: 0 };
  const m = t.match(/\btakes?\s+(\d+)\s+(more|fewer|less)\s+prize/i);
  if (!m) return { delta: 0 };
  const n = parseInt(m[1], 10);
  if (!n) return { delta: 0 };
  return { delta: /(fewer|less)/i.test(m[2]) ? -n : n };
}

export function applyPrizeModify(basePrizes, delta) {
  return Math.max(0, (basePrizes || 0) + (delta || 0));
}

// Resolute Heart pattern: full HP survive, optional remaining HP
export function parseKoPrevention(card) {
  const out = { fullHpOnly: false, surviveHp: null, coinFlip: false };
  const t = textOf(card);
  if (!t) return out;
  const matches =
    (t.includes('knocked out') &&
      (t.includes('prevent') ||
        t.includes("can't") ||
        t.includes('coin') ||
        t.includes('flip'))) ||
    (t.includes('full hp') &&
      t.includes('would be knocked out') &&
      t.includes('not knocked out'));
  if (!matches) return out;
  out.fullHpOnly = t.includes('full hp');
  out.coinFlip = /flip a coin/.test(t);
  const survive =
    t.match(/remaining hp becomes?\s+(\d+)/) || t.match(/hp becomes?\s+(\d+)/);
  if (survive) out.surviveHp = parseInt(survive[1], 10);
  return out;
}

// Damage to attacker when this Pokémon is damaged
export function parseThorns(card) {
  const t = textOf(card);
  if (
    !t ||
    !t.includes('damage counter') ||
    !/(put|place)/.test(t) ||
    !/(attacker|attacking pokémon)/.test(t)
  ) {
    return { count: 0 };
  }
  const m = t.match(/(\d+)\s+damage/);
  return { count: m ? parseInt(m[1], 10) || 0 : 0 };
}

// During Pokémon Checkup damage
export function parseCheckupEffect(card) {
  const t = textOf(card);
  if (!t || !t.includes('checkup') || !t.includes('damage counter')) {
    return {
      count: 0,
      filter: null,
      exceptName: null,
      targetHasAbility: false,
      source: card?.name || 'Ability',
    };
  }
  const m = t.match(/put\s+(\d+)\s+damage/);
  let filter = null;
  if (/poisoned/.test(t)) filter = 'poisoned';
  else if (/burned/.test(t)) filter = 'burned';
  else if (/asleep/.test(t)) filter = 'asleep';
  else if (/confused/.test(t)) filter = 'confused';
  else if (/basic pokémon/.test(t)) filter = 'basic';
  else {
    const energy = t.match(/\{([a-z])\}\s*pokémon/);
    if (energy) filter = `{${energy[1]}}`;
    else if (/opponent/.test(t)) filter = 'opponent';
  }
  const exceptName =
    t
      .match(/except any ([^.]+)/)?.[1]
      ?.trim()
      .toLowerCase() || null;
  const targetHasAbility =
    t.includes('has an ability') || t.includes('with an ability');
  return {
    count: parseNumber(m),
    filter,
    exceptName,
    targetHasAbility,
    source: card?.name || 'Ability',
  };
}

// Wild Growth: Basic {G} provides {G}{G}
export function parseEnergyMultiplier(card) {
  const t = textOf(card);
  if (!t || !t.includes('energy')) return { multiplier: 0, energyType: null };
  const matches =
    t.includes('×') ||
    t.includes('x2') ||
    t.includes('counts as') ||
    t.includes('treated as') ||
    (t.includes('provides') &&
      (/\{[a-z]\}\{[a-z]\}/.test(t) || t.includes('basic')));
  if (!matches) return { multiplier: 0, energyType: null };

  let multiplier = 2;
  const xMatch = t.match(/x(\d+)/) || t.match(/×(\d+)/);
  if (xMatch) multiplier = parseInt(xMatch[1], 10) || 2;

  let energyType = null;
  const typeMatch =
    t.match(/basic\s*\{([a-z])\}/) ||
    t.match(/\{([a-z])\}\s*energy/) ||
    t.match(/\{([a-z])\}\{[a-z]\}/);
  if (typeMatch) {
    energyType = ENERGY_LETTER_TO_TYPE[typeMatch[1]] || null;
  }
  return { multiplier, energyType };
}

// Extra Pokémon Tool slot
export function parseToolCap(card) {
  const t = textOf(card);
  if (!t || !t.includes('tool') || !/(attach|slot|more|extra)/.test(t)) {
    return { extra: 0 };
  }
  const m = t.match(/(\d+)\s*(?:more|extra)/) || t.match(/extra\s+(\d+)/);
  return { extra: m ? parseInt(m[1], 10) || 1 : 1 };
}

// Use attacks from previous Evolutions
export function parseAttackInheritance(card) {
  const t = textOf(card);
  return (
    (t.includes('previous evolution') || t.includes('previous evolutions')) &&
    (t.includes('attack') || t.includes('attacks'))
  );
}

// Darkest Impulse: damage when opponent evolves
export function parseOnOpponentEvolve(card) {
  const t = textOf(card);
  if (
    !t ||
    !t.includes('opponent') ||
    !t.includes('evolve') ||
    !t.includes('damage counter')
  ) {
    return { count: 0 };
  }
  const m = t.match(/put\s+(\d+)\s+damage/);
  return { count: parseNumber(m) };
}

// Bench ↔ Active switch (Pecharunt ex Subjugating Chains, …)
export function parseSwitchAbility(card) {
  const out = {
    benchToActive: false,
    pokemonType: null,
    exceptName: null,
    poisonNewActive: false,
    target: 'self',
  };
  const t = textOf(card);
  if (!t) return out;

  const benchActiveSwitch =
    t.includes('switch') &&
    (t.includes('benched') || t.includes('bench')) &&
    t.includes('active');
  if (!benchActiveSwitch) return out;
  out.benchToActive = true;

  const typed = t.match(/benched\s+\{([a-z])\}\s+pok/);
  if (typed) {
    const map = {
      w: 'water',
      r: 'fire',
      g: 'grass',
      l: 'lightning',
      p: 'psychic',
      f: 'fighting',
      d: 'darkness',
      m: 'metal',
      n: 'dragon',
      y: 'fairy',
      c: 'colorless',
    };
    out.pokemonType = map[typed[1]] || null;
  }

  out.exceptName =
    t
      .match(/except any ([^.,]+)/)?.[1]
      ?.trim()
      .toLowerCase() || null;
  out.poisonNewActive =
    t.includes('if you do') &&
    (t.includes('now poisoned') || t.includes('is now poisoned'));
  if (t.includes("opponent's benched")) out.target = 'opponent';
  return out;
}

// Special Condition infliction
export function parseStatusInflict(card) {
  const out = { status: null, target: 'attacker' };
  const t = textOf(card);
  if (!t) return out;
  const matches =
    t.includes('confused') ||
    t.includes('burned') ||
    t.includes('poisoned') ||
    t.includes('asleep') ||
    t.includes('now poisoned') ||
    (t.includes('make') && t.includes('opponent')) ||
    (t.includes('special condition') && !t.includes('recover'));
  if (!matches) return out;

  if (t.includes('asleep')) out.status = 'asleep';
  else if (t.includes('poisoned') || t.includes('now poisoned'))
    out.status = 'poisoned';
  else if (t.includes('burned')) out.status = 'burned';
  else if (t.includes('confused')) out.status = 'confused';

  if (
    t.includes("opponent's active") ||
    (t.includes('opponent') && t.includes('make'))
  ) {
    out.target = 'opponent-active';
  }
  return out;
}

// Move / place damage counters
export function parseMoveDamage(card) {
  const t = textOf(card);
  if (
    !t ||
    !t.includes('damage counter') ||
    !/(move|place|put)/.test(t) ||
    !/(to|onto|\bon\b)/.test(t)
  ) {
    return { count: null, onOpponent: false };
  }
  const m = t.match(/(?:move|place|put)\s+(?:up to\s+)?(\d+)\s+damage/);
  return {
    count: m ? parseInt(m[1], 10) : null,
    onOpponent: t.includes('opponent'),
  };
}

// Look at top N of deck
export function parseLookAtTop(card) {
  const t = textOf(card);
  if (!t || !t.includes('look at the top'))
    return { count: 0, takeToHand: false };
  const m = t.match(/top\s+(\d+)\s+cards?/);
  const takeToHand =
    t.includes('into your hand') || (t.includes('put') && t.includes('hand'));
  return {
    count: m ? parseInt(m[1], 10) || 1 : 1,
    takeToHand,
  };
}

// Put cards from discard pile into hand
export function parseRecursionFromDiscard(card) {
  const t = textOf(card);
  if (
    !t ||
    !t.includes('discard pile') ||
    !t.includes('into your hand') ||
    !/(put|return|add)/.test(t)
  ) {
    return { count: 0, what: '' };
  }
  const m = t.match(/up to\s+(\d+)/) || t.match(/put\s+(\d+)/);
  let what = 'card';
  if (t.includes('energy')) what = 'Energy';
  else if (t.includes('trainer')) what = 'Trainer';
  else if (t.includes('item')) what = 'Item';
  else if (t.includes('leftovers')) what = 'Leftovers';
  else if (t.includes('supporter')) what = 'Supporter';
  return { count: parseNumber(m), what };
}

// Negate effects / abilities / items
export function parseEffectPrevent(card) {
  const t = textOf(card);
  if (!t) return { scope: null };
  const matches =
    (/(prevent|can't|have no effect|have no abilities|has no abilities)/.test(
      t
    ) &&
      /(effect|ability|attack|item)/.test(t)) ||
    (t.includes('active spot') && t.includes('no abilities'));
  if (!matches) return { scope: null };
  if (/item/.test(t)) return { scope: 'items' };
  if (/abilit/.test(t)) return { scope: 'abilities' };
  if (/effect/.test(t) || /attack/.test(t)) return { scope: 'effects' };
  return { scope: null };
}

// Face-down Active placement on play
export function parseSetupFaceDown(card) {
  const t = textOf(card);
  return t.includes('face-down') || t.includes('face down');
}

// --- live-hook helpers (stack / expand) --------------------------------

export function stackDamageReductions(incoming, cards = []) {
  let total = incoming;
  const applied = [];
  for (const card of cards) {
    const r = parseDamageReduction(card);
    if (!r?.reduce) continue;
    const next = Math.max(0, total - r.reduce);
    if (next !== total) {
      applied.push({ ...r, source: card?.name || 'Ability' });
      total = next;
    }
  }
  return { total, applied };
}

export function stackDamageBonuses(incoming, cards = []) {
  let total = incoming;
  const applied = [];
  for (const card of cards) {
    const b = parseDamageBonus(card);
    if (!b?.bonus) continue;
    total += b.bonus;
    applied.push({ ...b, source: card?.name || 'Ability' });
  }
  return { total, applied };
}

export function expandEnergyForMultiplier(
  energyTypes = [],
  multiplier = 2,
  energyType = null
) {
  if (!multiplier || multiplier <= 1) return energyTypes;
  const expanded = [];
  for (const entry of energyTypes) {
    const type = typeof entry === 'string' ? entry : entry?.type;
    const family =
      typeof entry === 'string' ? 'basic' : entry?.family || 'basic';
    if (!type) continue;
    if (energyType && type !== energyType) {
      expanded.push(entry);
      continue;
    }
    if (family === 'double-colorless' || family === 'double') {
      expanded.push(entry);
      continue;
    }
    for (let i = 0; i < multiplier; i++) {
      expanded.push(
        typeof entry === 'string' ? type : { type, family: 'basic' }
      );
    }
  }
  return expanded;
}

export function findEnergyMultiplier(cards = []) {
  for (const card of cards) {
    const m = parseEnergyMultiplier(card);
    if (m?.multiplier > 1) return { ...m, source: card?.name || 'Ability' };
  }
  return null;
}

export function pokemonHpThreshold(baseHp, card, stadiumBonus = 0) {
  const hpBonus = parseHpBonus(card)?.bonus || 0;
  return applyHpBonus((baseHp || 0) + (stadiumBonus || 0), hpBonus);
}

export function blocksItemPlay(card) {
  return parseEffectPrevent(card)?.scope === 'items';
}

/**
 * Unlimited hand energy acceleration (e.g. Baxcalibur Supercold, Frosmoth Ice Dance, Blastoise Deluge).
 * Returns { energyType, benchedOnly, noRuleBox, targetType } or null.
 */
export function parseUnlimitedHandEnergyAcceleration(card) {
  const t = textOf(card);
  if (!t) return null;
  const isUnlimited = /as often as you like/i.test(t);
  const isHandAttach =
    /(?:attach|put)\s+(?:an?|a basic|up to\s+\d+)?\s*.*energy.*(?:from your hand)/i.test(
      t
    ) ||
    (/from your hand/i.test(t) && /attach/i.test(t) && /energy/i.test(t));
  if (!isUnlimited || !isHandAttach) return null;

  let energyType = null;
  const typeLetterMatch = t.match(/\{([wlfmpdgynr])\}\s*energy/i);
  if (typeLetterMatch) {
    const typeMap = {
      w: 'Water',
      r: 'Fire',
      l: 'Lightning',
      f: 'Fighting',
      m: 'Metal',
      p: 'Psychic',
      d: 'Darkness',
      g: 'Grass',
      y: 'Fairy',
      n: 'Dragon',
    };
    energyType = typeMap[typeLetterMatch[1].toLowerCase()] || null;
  }
  if (!energyType) {
    const typeWordMatch = t.match(
      /\b(water|fire|grass|lightning|psychic|fighting|darkness|metal)\s+energy/i
    );
    if (typeWordMatch) {
      energyType =
        typeWordMatch[1].charAt(0).toUpperCase() +
        typeWordMatch[1].slice(1).toLowerCase();
    }
  }

  const benchedOnly = /benched/i.test(t) && !/active/i.test(t);
  const noRuleBox = /doesn't have a rule box|without a rule box/i.test(t);
  let targetType = null;
  const targetTypeMatch = t.match(
    /to 1 of your\s+(?:benched\s+)?([a-z]+)\s+pok[ée]mon/i
  );
  if (targetTypeMatch) {
    const candidate = targetTypeMatch[1].toLowerCase();
    if (
      [
        'water',
        'fire',
        'grass',
        'lightning',
        'psychic',
        'fighting',
        'darkness',
        'metal',
      ].includes(candidate)
    ) {
      targetType = candidate.charAt(0).toUpperCase() + candidate.slice(1);
    }
  }

  return {
    energyType,
    benchedOnly,
    noRuleBox,
    targetType,
  };
}
