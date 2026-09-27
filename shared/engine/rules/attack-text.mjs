/**
 * @file Printed attack wording → one normalized form. A leaf module (no imports) so the
 * damage parser and the condition vocabulary can share it without an import cycle.
 * Pure.
 */

export function escapeRegExp(text) {
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
