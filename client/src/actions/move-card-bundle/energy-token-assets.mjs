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

const normalizeType = (raw) => {
  const lower = String(raw || '').toLowerCase();
  if (lower === 'dark') return 'darkness';
  return lower;
};

/**
 * Resolve the coin-front image for an Energy card, or null if this Energy
 * type has no token asset (e.g. Fairy — dropped from the 151MT sheet).
 */
export const getEnergyTokenFront = (card) => {
  const declaredType = normalizeType(card?.types?.[0]);
  if (ENERGY_TOKEN_FRONT[declaredType]) return ENERGY_TOKEN_FRONT[declaredType];

  const name = String(card?.name || '').toLowerCase();
  const nameMatch = TYPE_WORDS.find((word) => name.includes(word));
  if (nameMatch) return ENERGY_TOKEN_FRONT[nameMatch];
  if (name.includes('dark')) return ENERGY_TOKEN_FRONT.darkness;

  return null;
};
