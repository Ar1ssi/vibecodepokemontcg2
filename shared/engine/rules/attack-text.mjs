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

const TYPE_WORD_SYMBOLS = {
  grass: 'G',
  fire: 'R',
  water: 'W',
  lightning: 'L',
  psychic: 'P',
  fighting: 'F',
  darkness: 'D',
  metal: 'M',
  fairy: 'Y',
  dragon: 'N',
  colorless: 'C',
};
const TYPE_WORD = Object.keys(TYPE_WORD_SYMBOLS).join('|');
const TYPE_WORD_RUN = new RegExp(`\\b(?:${TYPE_WORD}){2,}\\b`, 'gi');
// A type word (or an "X, Y, or Z" list of them) that names a type: before a noun the corpus
// prints after a {X} symbol (Dark Electrode: "a Darkness or Dark Metal Energy"). Names ("Dark Gyarados", "Dragon Rush") never match, nor do the
// special Energy names Double Colorless / Double Dragon / Dark Metal Energy.
const TYPE_WORD_LIST = new RegExp(
  `(?<!\\b(?:double|dark) )\\b(?:${TYPE_WORD})(?:(?:,|,? and|,? or) (?:basic )?(?:${TYPE_WORD}))* (?=(?:energy|pok[eé]mon|type|less|more|basic|weakness|resistance|(?:or|and) (?:dark metal|double colorless|double dragon) energy)(?![a-z]))`,
  'gi'
);
// "Rotom's type is Water until …" (Type Shift), "can use the Double-Edge attack for Psychic".
const TYPE_WORD_AFTER = new RegExp(`(?<=\\b(?:type is|type becomes|attack for) )(?:${TYPE_WORD})\\b`, 'gi');
const symbolOf = (word) => `{${TYPE_WORD_SYMBOLS[word.toLowerCase()]}}`;

/**
 * TCGdex prints older sets with type words ("attach a Fire Energy card", "costs ColorlessColorless
 * less") where pkmncards prints {X} symbols. Turns those words back into symbols so every parser
 * reads one notation (ea389d92 did the same for special Energy). Case is kept.
 */
export function symbolizeTypeWords(text) {
  const each = new RegExp(`(?:${TYPE_WORD})`, 'gi');
  return String(text || '')
    .replace(TYPE_WORD_RUN, (run) => run.replace(each, symbolOf))
    .replace(TYPE_WORD_LIST, (list) => list.replace(each, symbolOf))
    .replace(TYPE_WORD_AFTER, symbolOf);
}

/**
 * Lowercases and flattens printed wording so one template covers every printing era:
 * the attacker's own name and "the Defending Pokémon" become "this pokémon" /
 * "your opponent's active pokémon", and "his or her" becomes "their".
 */
export function normalizeAttackText(text, selfName = '') {
  let out = symbolizeTypeWords(text)
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
