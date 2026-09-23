// Copy-attack family (design 031, I118): "Choose 1 of … Pokémon's attacks and use it as this
// attack." Pure parsing only; reduce.mjs gathers the candidate attacks and runs the copy.

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
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A trailing "<Name> performs that attack." sentence (older cards) adds nothing. */
const PERFORMS = String.raw`(?: [^.]+ performs that attack\.)?`;

const TEMPLATES = [
  [
    /^choose 1 of your benched (.+?) pokemon's attacks and use it as this attack\.$/,
    (m) => ({ source: 'ownBench', group: m[1] }),
  ],
  [
    /^choose 1 of your opponent's (active |benched |)pokemon's attacks and use it as this attack\.$/,
    (m) => ({ source: OPPONENT_SCOPE[m[1]] }),
  ],
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
  [
    new RegExp(
      String.raw`^choose 1 of your opponent's benched pokemon's attacks\. [^.]+ copies that attack except for its energy cost\.` +
        PERFORMS +
        '$'
    ),
    () => ({ source: 'oppBench' }),
  ],
];

/**
 * The copy source an attack's whole text asks for, or null when the text is not a copy
 * attack (or carries anything the templates don't cover).
 * @returns {{source: string, group?: string, pokemonType?: string, count?: number,
 *   optional?: boolean, needsEnergy?: boolean} | null}
 */
export function parseCopyAttack(text) {
  const t = normalize(text);
  if (!t) return null;
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
