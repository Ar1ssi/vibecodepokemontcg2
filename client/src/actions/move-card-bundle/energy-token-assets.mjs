/** Front-face images: user-provided type-symbol tokens (colored circle, black glyph, cut
 * from a reference sheet matching the printed card cost-symbol style). */
export const ENERGY_TOKEN_FRONT = {
  fire: '/src/assets/energy/tokens/fire.png',
  water: '/src/assets/energy/tokens/water.png',
  grass: '/src/assets/energy/tokens/grass.png',
  lightning: '/src/assets/energy/tokens/lightning.png',
  psychic: '/src/assets/energy/tokens/psychic.png',
  fighting: '/src/assets/energy/tokens/fighting.png',
  darkness: '/src/assets/energy/tokens/darkness.png',
  metal: '/src/assets/energy/tokens/metal.png',
  dragon: '/src/assets/energy/tokens/dragon.png',
  colorless: '/src/assets/energy/tokens/colorless.png',
  fairy: '/src/assets/energy/tokens/fairy.png',
};

const TYPE_WORDS = Object.keys(ENERGY_TOKEN_FRONT);

// Printed cost-symbol letters. Decklists exported from Limitless spell basic Energy
// with the symbol rather than the type word ("Basic {F} Energy"), so the type name
// never appears anywhere on the card row.
const TYPE_BY_COST_SYMBOL = {
  g: 'grass',
  r: 'fire',
  w: 'water',
  l: 'lightning',
  p: 'psychic',
  f: 'fighting',
  d: 'darkness',
  m: 'metal',
  n: 'dragon',
  c: 'colorless',
  y: 'fairy',
};

const COST_SYMBOL = /\{([a-z])\}/;

const normalizeType = (raw) => {
  const lower = String(raw || '')
    .trim()
    .toLowerCase();
  if (lower === 'dark') return 'darkness';
  const symbol = lower.match(/^\{?([a-z])\}?$/);
  if (symbol) return TYPE_BY_COST_SYMBOL[symbol[1]] || lower;
  return lower;
};

/**
 * Resolve the token image for a printed energy type name — an Energy card's
 * `types[0]` or an attack's cost symbol, which share TCGdex spelling ('Fire',
 * 'Dark', …) but may also arrive as a bare cost symbol ('{F}', 'F'). Null when
 * the type has no token asset.
 */
export const getEnergyTokenSrcForType = (type) =>
  ENERGY_TOKEN_FRONT[normalizeType(type)] || null;

/**
 * Resolve the coin-front image for an Energy card, or null if this Energy
 * type has no token asset (e.g. a Special Energy naming no type at all).
 */
export const getEnergyTokenFront = (card) => {
  const byDeclaredType = getEnergyTokenSrcForType(card?.types?.[0]);
  if (byDeclaredType) return byDeclaredType;

  const name = String(card?.name || '').toLowerCase();
  const nameMatch = TYPE_WORDS.find((word) => name.includes(word));
  if (nameMatch) return ENERGY_TOKEN_FRONT[nameMatch];

  const symbolInName = name.match(COST_SYMBOL);
  if (symbolInName && TYPE_BY_COST_SYMBOL[symbolInName[1]]) {
    return ENERGY_TOKEN_FRONT[TYPE_BY_COST_SYMBOL[symbolInName[1]]];
  }

  if (name.includes('dark')) return ENERGY_TOKEN_FRONT.darkness;

  return null;
};

/**
 * Whether a card should render as an attached Energy token rather than as a
 * flat card cascading behind its Pokémon. A decklist that reached the table
 * without the importer's type resolution can carry an empty `type` (observed
 * live: "Rocky Fighting Energy" with `type: ""`), so a name ending in "Energy"
 * counts as well — no Pokémon or Trainer name ends that way.
 */
export const isEnergyCard = (card) => {
  if (!card) return false;
  if (card.type === 'Energy') return true;
  return String(card.name || '')
    .trim()
    .toLowerCase()
    .endsWith('energy');
};
