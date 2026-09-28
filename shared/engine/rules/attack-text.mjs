/**
 * @file Printed attack wording → one normalized form. A leaf module (no imports) so the
 * damage parser and the condition vocabulary can share it without an import cycle.
 * Pure.
 */

export function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// A card may print its own name short: "Charizard G LV.X" as "Charizard G",
// "Deoxys Defense Forme" as "Deoxys".
function printedSelfNames(selfName) {
  const name = String(selfName || '').trim().toLowerCase();
  if (!name) return [];
  return [...new Set([name, name.replace(/ lv\.x$/, ''), name.replace(/\s+\S+\s+forme$/, '')])].filter(Boolean);
}

/**
 * Older printings name the attacker ("Arcanine does 40 damage to itself", "damage counters on
 * Dodrio"). Rewrites those to "this Pokémon" only where the name is the attacker itself — the
 * subject of a sentence or clause, or the object of to/on/from/under/attached to — so counts of a
 * name ("for each Pikachu in play") keep it. Case is kept elsewhere.
 */
export function replaceSelfName(text, selfName) {
  let out = String(text || '');
  for (const printed of printedSelfNames(selfName)) {
    const name = escapeRegExp(printed);
    out = out
      .replace(new RegExp(`(\\b(?:to|on|from|under|onto|excluding)\\s+)${name}(?![\\w'])`, 'gi'), '$1this Pokémon')
      .replace(
        new RegExp(`(^|[.,;]\\s*|\\b(?:if|and|then|unless|,)\\s+)${name}(?=\\s+(?:does|do|is|has|was|can't|cannot|also|and|isn't|doesn't|would|takes|gets|to)\\b)`, 'gi'),
        '$1this Pokémon'
      );
  }
  return out;
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
  for (const printed of printedSelfNames(selfName)) {
    out = out.replace(new RegExp(`(?<![\\w'])${escapeRegExp(printed)}(?![\\w'])`, 'g'), 'this pokémon');
  }
  return out
    // Elekid Magnetic Trip prints "this Defending Pokémon".
    .replace(/\b(?:the|this) defending pokémon\b/g, "your opponent's active pokémon")
    .replace(/\bhis or her\b/g, 'their');
}
