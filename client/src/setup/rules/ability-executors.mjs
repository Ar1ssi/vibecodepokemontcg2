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
  lower(card?.ability?.text ?? card?.abilityText ?? card?.text ?? '');

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
export function parseOpponentDiscard(card) {
  const t = textOf(card);
  if (!/opponent/.test(t) || !/discard/.test(t)) return 0;
  const m = t.match(/discard (?:up to )?(\d+)?/);
  return m?.[1] ? parseInt(m[1], 10) : 1;
}
