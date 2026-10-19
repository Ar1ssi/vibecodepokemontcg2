const SUPERTYPE_PRIORITY = {
  'Pokémon': 1,
  Pokemon: 1,
  Trainer: 2,
  Energy: 3,
};

export function compareCardsBySupertype(a = {}, b = {}) {
  const priorityA = SUPERTYPE_PRIORITY[a?.supertype] || 999;
  const priorityB = SUPERTYPE_PRIORITY[b?.supertype] || 999;

  if (priorityA < priorityB) return -1;
  if (priorityA > priorityB) return 1;
  return 0;
}

export function flattenDeckToCardArray(deck = {}) {
  const cardArray = [];

  for (const cardName in deck) {
    const group = deck[cardName];
    const variants = Object.values(group?.cards || []).map((cardInfo) => ({
      ...cardInfo.data,
      count: cardInfo.count,
    }));
    cardArray.push(...variants.filter((item) => item !== null));
  }

  return cardArray;
}

/** Each distinct card in the deck once — its stored record, without a count — in deck order. */
export function uniqueDeckCards(deck = {}) {
  const seenIds = new Set();
  const records = [];

  for (const group of Object.values(deck || {})) {
    for (const variant of Object.values(group?.cards || [])) {
      const record = variant?.data;
      if (!record?.id || seenIds.has(record.id)) continue;
      seenIds.add(record.id);
      records.push(record);
    }
  }

  return records;
}

export function sortCardsBySupertype(cards = []) {
  return [...cards].sort(compareCardsBySupertype);
}

export function getSortedDeckCardArray(deck = {}) {
  return sortCardsBySupertype(flattenDeckToCardArray(deck));
}
