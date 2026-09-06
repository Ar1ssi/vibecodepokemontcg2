// Pure parsers for the remaining Section C ability families
// (taxonomy docs/card-types-taxonomy.md §C): passive, when-played,
// end-of-turn, damage-prevent, hand-protect, opponent-disrupt.
//
// DOM-free and node:test friendly. Execution lives in chat-buttons.js /
// the attack path; this module only extracts *what* a card does from its
// printed ability text.

const lower = (v) =>
  String(v ?? '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'");

const textOf = (card) =>
  lower(card?.ability?.text ?? card?.abilityText ?? card?.text ?? card?.effect ?? '');

// --- passive -----------------------------------------------------------

// How many cost symbols a passive ability removes from attacks.
// "reduce the cost … by 1" / "attacks cost 1 less" → 1; "cost less" → 1.
export function passiveCostDiscount(card) {
  const t = textOf(card);
  if (!t) return 0;
  if (!/(cost|energy)/.test(t)) return 0;
  const by = t.match(/(?:by|less)\s*(\d+)/) || t.match(/(\d+)\s+less/);
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
  if (/prevent (all )?(damage|effect)/.test(t) || t.includes('can\'t be damaged')) {
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
  if (type === 'pokémon' || type === 'pokemon' || type === 'energy') return false;
  const sub = (Array.isArray(card.subtypes) ? card.subtypes : []).map((s) =>
    String(s).toLowerCase()
  );
  if (sub.includes('tool') || sub.includes('pokémon tool')) return true;
  if (type === 'tool') return true;
  if (String(card.trainerType || '').toLowerCase() === 'tool') return true;
  return false;
}

/** Tools attached to a Pokémon in a zone array. */
export function attachedTools(pokemon, zoneCards = []) {
  if (!pokemon?.image) return [];
  return (zoneCards || []).filter(
    (c) => c.image?.relative === pokemon.image && isPokemonToolCard(c)
  );
}

/** Damage prevention from Pokémon + attached Tools (optional tool block). */
export function combinedDamagePrevention(pokemon, zoneCards = [], { blockTools = false } = {}) {
  let out = parseDamagePrevention(pokemon);
  if (blockTools) return out;
  for (const tool of attachedTools(pokemon, zoneCards)) {
    out = mergeDamagePrevention(out, parseDamagePrevention(tool));
  }
  return out;
}

/** Passive attack-cost discount from Pokémon + attached Tools. */
export function combinedPassiveCostDiscount(pokemon, zoneCards = [], { blockTools = false } = {}) {
  let discount = passiveCostDiscount(pokemon);
  if (blockTools) return discount;
  for (const tool of attachedTools(pokemon, zoneCards)) {
    discount += passiveCostDiscount(tool);
  }
  return discount;
}

/** Hand protection from Pokémon abilities or attached Tools. */
export function combinedHandProtected(pokemon, zoneCards = [], { blockTools = false } = {}) {
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
    !(t.includes('attack') || t.includes('this pokémon') || t.includes('deals') || t.includes('does'))
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
  if (
    !/(more|increase|treated as|gets \+|\+\d+\s+hp|for each)/.test(t)
  ) {
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
  if (!t || (!t.includes('retreat cost') && !/retreat/.test(t))) return { delta: 0 };
  const increased = /(more|increase)/.test(t);
  const decreased = /(less|fewer|reduc|decrease)/.test(t);
  const m =
    t.match(/(\d+)\s*(?:more|less)/) ||
    t.match(/(?:by|is)\s+(\d+)/) ||
    t.match(/(\d+)/);
  const n = m ? parseInt(m[1], 10) || 1 : 1;
  if (decreased && !increased) return { delta: -n };
  if (increased) return { delta: n };
  return { delta: 0 };
}

export function applyRetreatCostModifier(baseCost, delta) {
  return Math.max(0, (baseCost || 0) + (delta || 0));
}

// "take N fewer/more Prize cards"
export function parsePrizeModify(card) {
  const t = textOf(card);
  if (!t || !t.includes('prize card')) return { delta: 0 };
  if (!/(less|fewer|more|extra)/.test(t)) return { delta: 0 };
  const m = t.match(/(\d+)/);
  const n = m ? parseInt(m[1], 10) || 1 : 1;
  if (/(fewer|less)/.test(t)) return { delta: -n };
  if (/(more|extra)/.test(t)) return { delta: n };
  return { delta: 0 };
}

export function applyPrizeModify(basePrizes, delta) {
  return Math.max(0, (basePrizes || 0) + (delta || 0));
}

// Resolute Heart pattern: full HP survive, optional remaining HP
export function parseKoPrevention(card) {
  const out = { fullHpOnly: false, surviveHp: null };
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
  const survive =
    t.match(/remaining hp becomes\s+(\d+)/) ||
    t.match(/hp becomes\s+(\d+)/);
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
    t.match(/except any ([^.]+)/)?.[1]?.trim().toLowerCase() || null;
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
  if (
    !t ||
    !t.includes('tool') ||
    !/(attach|slot|more|extra)/.test(t)
  ) {
    return { extra: 0 };
  }
  const m =
    t.match(/(\d+)\s*(?:more|extra)/) ||
    t.match(/extra\s+(\d+)/);
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
      w: 'water', r: 'fire', g: 'grass', l: 'lightning', p: 'psychic',
      f: 'fighting', d: 'darkness', m: 'metal', n: 'dragon', y: 'fairy', c: 'colorless',
    };
    out.pokemonType = map[typed[1]] || null;
  }

  out.exceptName = t.match(/except any ([^.,]+)/)?.[1]?.trim().toLowerCase() || null;
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
  else if (t.includes('poisoned') || t.includes('now poisoned')) out.status = 'poisoned';
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
  if (!t || !t.includes('look at the top')) return { count: 0, takeToHand: false };
  const m = t.match(/top\s+(\d+)\s+cards?/);
  const takeToHand =
    t.includes('into your hand') ||
    (t.includes('put') && t.includes('hand'));
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
    ((/(prevent|can't|have no effect|have no abilities|has no abilities)/.test(
      t
    )) &&
      (/(effect|ability|attack|item)/.test(t))) ||
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
    const family = typeof entry === 'string' ? 'basic' : entry?.family || 'basic';
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
      expanded.push(typeof entry === 'string' ? type : { type, family: 'basic' });
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
