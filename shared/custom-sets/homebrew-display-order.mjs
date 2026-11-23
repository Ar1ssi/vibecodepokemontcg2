// The order the set browser lists the Homebrew set (customhb) in. Its set.json order comes from cardback's export,
// so the order is set here, where every publish passes. Pokémon are grouped by type, then by evolution family
// (A to Z by the family's root). A family lists whole lines, never printings alternating stage by stage: its regular
// cards line by line (each line one type, Basic up), then its MEGAs, then its shiny cards the same way. Tera Pokémon
// and Eevee's evolutions are listed under their own type rather than with their family. Trainers and Energy keep
// the set.json order.

export const HOMEBREW_DISPLAY_ORDER_SET_IDS = Object.freeze(['customhb']);

const TYPE_ORDER = ['Colorless', 'Darkness', 'Dragon', 'Fairy', 'Fighting', 'Fire', 'Grass', 'Lightning', 'Metal', 'Psychic', 'Water'];
const STAGE_RANK = { Basic: 0, Stage1: 1, Stage2: 2 };
// Paldean Fates numbers its shiny Pokémon from 092 on (TCGdex sv04.5-092 Oddish, rarity "Shiny rare").
const PALDEAN_FATES_FIRST_SHINY = 92;

export function usesHomebrewDisplayOrder(setId) {
  return HOMEBREW_DISPLAY_ORDER_SET_IDS.includes(setId);
}

const sourceSetOf = (source) => source.slice(0, source.lastIndexOf('-'));

/** A card cut from a shiny printing: a Shiny Vault number ("sma-SV38", "swsh4.5sv-SV060") or Paldean Fates 092+. */
export function isShinySource(source) {
  if (typeof source !== 'string' || !source.includes('-')) return false;
  const setId = sourceSetOf(source);
  const number = source.slice(setId.length + 1);
  if (/^SV\d+$/i.test(number)) return true;
  return setId === 'sv04.5' && Number.parseInt(number, 10) >= PALDEAN_FATES_FIRST_SHINY;
}

const familyKeyOf = (name) => String(name || '').replace(/ ex$/, '');
const typeOf = (card) => (Array.isArray(card.types) && card.types[0]) || '';
const isPokemon = (card) => card?.category === 'Pokemon';
const isMega = (card) => card.stage === 'MEGAHB' || /^Mega /.test(card.name);
const numberOf = (card) => Number.parseInt(card.localId, 10) || 0;
// Tera Pokémon and Eevee's evolutions are each listed alone under their own type.
const listsAlone = (card) => card.stage === 'TERAHB' || card.evolveFrom === 'Eevee';

function typeRank(type) {
  const rank = TYPE_ORDER.indexOf(type);
  return rank < 0 ? TYPE_ORDER.length : rank;
}

/**
 * Joins every card to the cards it evolves from, by name ("Charizard" names "Charizard ex" too), and same-named
 * cards of one type to each other (Darkrai with Darkrai ex; a Dragon Rayquaza ex stays apart from a Colorless Rayquaza).
 */
function familiesOf(cards) {
  const parent = cards.map((_, index) => index);
  const find = (index) => {
    while (parent[index] !== index) index = parent[index] = parent[parent[index]];
    return index;
  };
  const union = (a, b) => {
    parent[find(b)] = find(a);
  };
  const byKey = new Map();
  const byKeyAndType = new Map();
  cards.forEach((card, index) => {
    const key = familyKeyOf(card.name);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(index);
    const typed = `${key}|${typeOf(card)}`;
    if (byKeyAndType.has(typed)) union(byKeyAndType.get(typed), index);
    else byKeyAndType.set(typed, index);
  });
  cards.forEach((card, index) => {
    for (const from of byKey.get(familyKeyOf(card.evolveFrom)) || []) union(from, index);
  });
  const families = new Map();
  cards.forEach((card, index) => {
    const root = find(index);
    if (!families.has(root)) families.set(root, []);
    families.get(root).push(card);
  });
  return [...families.values()];
}

/** Stage rank inside a family: a MEGA sits just after the stage of the Pokémon it evolves from. */
function stageRanker(family) {
  const rankByKey = new Map();
  for (const card of family) {
    if (isMega(card) || !(card.stage in STAGE_RANK)) continue;
    const key = familyKeyOf(card.name);
    rankByKey.set(key, Math.max(rankByKey.get(key) ?? 0, STAGE_RANK[card.stage]));
  }
  return (card) => {
    if (!isMega(card)) return STAGE_RANK[card.stage] ?? STAGE_RANK.Stage2;
    // A MEGA printed at a plain stage (Mega Gengar ex, Stage 2) still follows that stage's regular cards.
    const fromRank = rankByKey.get(familyKeyOf(card.evolveFrom)) ?? STAGE_RANK.Stage2;
    return Math.max(fromRank, STAGE_RANK[card.stage] ?? 0) + 0.5;
  };
}

/**
 * A family as whole lines, never alternating printings stage by stage: the regular cards of the root's type, then
 * each other type's cards (a Fighting Gible line after the Dragon one), then the shiny cards the same way.
 */
function lineOrder(family, root) {
  const rank = stageRanker(family);
  const isEx = (card) => / ex$/.test(card.name);
  const compare = (a, b) =>
    rank(a) - rank(b) || Number(isMega(a)) - Number(isMega(b)) || Number(isEx(a)) - Number(isEx(b)) || numberOf(a) - numberOf(b);
  const lines = new Map();
  for (const card of family) {
    // Shiny lines also split by printing: a Paldean Fates Riolu line and a Hidden Fates one stay whole.
    const shinySet = isShinySource(card.custom?.source) ? sourceSetOf(card.custom.source) : '';
    const key = `${shinySet}|${isMega(card) ? 'MEGA' : typeOf(card)}`;
    if (!lines.has(key)) lines.set(key, []);
    lines.get(key).push(card);
  }
  const ordered = [...lines.values()].map((line) => {
    const cards = line.sort(compare);
    const first = cards[0];
    return {
      cards,
      shiny: isShinySource(first.custom?.source),
      mega: isMega(first),
      offType: typeOf(first) !== typeOf(root),
      rank: rank(first),
    };
  });
  ordered.sort(
    (a, b) =>
      Number(a.shiny) - Number(b.shiny) ||
      Number(a.mega) - Number(b.mega) ||
      Number(a.offType) - Number(b.offType) ||
      a.rank - b.rank ||
      typeRank(typeOf(a.cards[0])) - typeRank(typeOf(b.cards[0])) ||
      numberOf(a.cards[0]) - numberOf(b.cards[0])
  );
  return ordered.flatMap((line) => line.cards);
}

function rootOf(family) {
  const rank = stageRanker(family);
  return [...family].sort((a, b) => rank(a) - rank(b) || numberOf(a) - numberOf(b))[0];
}

function orderPokemon(pokemon) {
  const grouped = pokemon.filter((card) => !listsAlone(card));
  const alone = pokemon.filter(listsAlone).map((card) => [card]);
  const entries = [...familiesOf(grouped), ...alone].map((family) => {
    const root = rootOf(family);
    return { root, cards: lineOrder(family, root) };
  });
  entries.sort(
    (a, b) =>
      typeRank(typeOf(a.root)) - typeRank(typeOf(b.root)) ||
      familyKeyOf(a.root.name).localeCompare(familyKeyOf(b.root.name)) ||
      numberOf(a.root) - numberOf(b.root)
  );
  return entries.flatMap((entry) => entry.cards);
}

/**
 * The set's cards in display order: the Pokémon re-sorted in the places Pokémon held, everything else where it was.
 * @param {object[]} cards set.json cards (validated, so stages are already MEGAHB/TERAHB where edited so)
 * @returns {object[]} a new array of the same card objects
 */
export function orderHomebrewSetCards(cards) {
  if (!Array.isArray(cards)) return [];
  const sortedPokemon = orderPokemon(cards.filter(isPokemon));
  let next = 0;
  return cards.map((card) => (isPokemon(card) ? sortedPokemon[next++] : card));
}
