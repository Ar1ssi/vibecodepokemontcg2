import { SPECIAL_ENERGY_TOKENS } from './special-energy-tokens.mjs';

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

/** Canonical type key from a printed type name or a bare cost symbol. */
export const normalizeEnergyType = (raw) => {
  const lower = String(raw || '')
    .trim()
    .toLowerCase();
  if (lower === 'dark') return 'darkness';
  const symbol = lower.match(/^\{?([a-z])\}?$/);
  if (symbol) return TYPE_BY_COST_SYMBOL[symbol[1]] || lower;
  return lower;
};

/**
 * Resolve the canonical energy-type key for an Energy card, or null when no type
 * can be determined (e.g. a Special Energy naming no type at all). Precedence:
 * declared `types[0]`, then a type word in the name, then a cost symbol in the
 * name, then 'dark'. Shared by the token image and the card-glow colour.
 */
export const energyTypeKeyFor = (card) => {
  const declared = normalizeEnergyType(card?.types?.[0]);
  if (ENERGY_TOKEN_FRONT[declared]) return declared;

  const name = String(card?.name || '').toLowerCase();
  const nameMatch = TYPE_WORDS.find((word) => name.includes(word));
  if (nameMatch) return nameMatch;

  const symbolInName = name.match(COST_SYMBOL);
  if (symbolInName && TYPE_BY_COST_SYMBOL[symbolInName[1]]) {
    return TYPE_BY_COST_SYMBOL[symbolInName[1]];
  }

  if (name.includes('dark')) return 'darkness';

  return null;
};

/**
 * Resolve the token image for a printed energy type name — an Energy card's
 * `types[0]` or an attack's cost symbol, which share TCGdex spelling ('Fire',
 * 'Dark', …) but may also arrive as a bare cost symbol ('{F}', 'F'). Null when
 * the type has no token asset.
 */
export const getEnergyTokenSrcForType = (type) =>
  ENERGY_TOKEN_FRONT[normalizeEnergyType(type)] || null;

/**
 * Comparison key for a Special Energy name across the spellings decklists and TCGdex use:
 * cost symbols as type words ("Rocky {F} Energy" = "Rocky Fighting Energy"), "◇" as
 * "Prism Star", "δ" as "delta", straight or curly apostrophes, any case and spacing.
 */
export const specialEnergyNameKey = (name) =>
  String(name || '')
    .toLowerCase()
    .replace(/\{([a-z])\}/g, (_, symbol) => ` ${TYPE_BY_COST_SYMBOL[symbol] || symbol} `)
    .replace(/◇/g, ' prism star ')
    .replace(/δ/g, ' delta ')
    .replace(/[’']/g, '')
    .replace(/\bdark\b/g, 'darkness')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const SPECIAL_TOKEN_BY_KEY = new Map(
  SPECIAL_ENERGY_TOKENS.map((token) => [specialEnergyNameKey(token.name), token])
);

// "Metal Energy" and "Darkness Energy" are also the names of basic Energy; only a card
// explicitly marked Special (old Metal/Darkness Special Energy) takes the special token.
const BASIC_ENERGY_NAME = /^(?:basic )?(?:grass|fire|water|lightning|psychic|fighting|darkness|metal|fairy|colorless|dragon) energy$/;

const isMarkedSpecial = (card) => {
  const subtypes = [card?.subtype, ...(Array.isArray(card?.subtypes) ? card.subtypes : [])];
  if (subtypes.some((s) => /special/i.test(String(s || '')))) return true;
  return /^special$/i.test(String(card?.energyType || ''));
};

/** The Special Energy token entry ({ src, double, finish }) for a card, or null. */
export const specialEnergyTokenFor = (card) => {
  const key = specialEnergyNameKey(card?.name);
  const token = SPECIAL_TOKEN_BY_KEY.get(key);
  if (!token) return null;
  if (BASIC_ENERGY_NAME.test(key) && !isMarkedSpecial(card)) return null;
  return token;
};

/** Whether the card's token shows two orbs (a Special Energy that provides 2 Energy). */
export const isDoubleEnergyToken = (card) => specialEnergyTokenFor(card)?.double === true;

/** Extra class on a two-orb token: it is square art with transparent corners, not a disc. */
export const ENERGY_TOKEN_DOUBLE_CLASS = 'energy-token-double';

/**
 * Resolve the coin-front image for an Energy card: its own Special Energy token (cut from
 * the card art) when it has one, else its type token, else null (no type can be found).
 */
export const getEnergyTokenFront = (card) => {
  const special = specialEnergyTokenFor(card);
  if (special) return special.src;
  const key = energyTypeKeyFor(card);
  return key ? ENERGY_TOKEN_FRONT[key] : null;
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
