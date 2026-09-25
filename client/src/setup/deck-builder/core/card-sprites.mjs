/**
 * Card → sprite resolver (design 025): the small pixel sprite drawn beside a
 * card in the deck list, and the source of the deck-strip auto-fill.
 *
 * Pokémon cards map to a vendored Pokémon sprite, including Mega, Primal,
 * Gigantamax, regional and the Paldea-era named forms. Item and Tool Trainers map to a
 * vendored pokesprite item icon by name. Supporters, Stadiums and Energy have
 * no sprite (Energy keeps its token art elsewhere).
 *
 * Pure: no DOM, no network.
 */
import {
  MAX_DECK_SPRITES,
  POKEMON_SPRITE_CATALOG,
  normalizeDeckSprites,
  pokemonSpriteUrl,
} from './deck-sprites.mjs';
import { ITEM_SPRITE_CATALOG } from './item-sprite-catalog.generated.mjs';

export const ITEM_SPRITE_BASE_PATH = '/src/assets/items';

/** Card names the name match cannot reach; value is a pokesprite item path. */
export const CARD_ITEM_OVERRIDES = {
  'choice belt': 'hold-item/choice-band',
  'exp. share': 'key-item/exp-share',
  'vs seeker': 'key-item/vs-seeker',
  'pokémon fan club': null,
  'pokégear 3.0': null,
  'poké ball tosser': 'ball/poke',
  'hisuian heavy ball': 'ball/hisuian-heavy',
};

// Trailing rule-box / era markers; repeated because some cards stack them
// ("Charizard V-UNION", "M Charizard-EX").
const NAME_SUFFIX =
  /(?:[\s-]+(?:ex|gx|v|vmax|vstar|v-union|break|lv\.?\s?x|prime|legend|tag team|star)|\s*[☆δ◇])$/i;
const OWNER_PREFIX = /^.+?['’]s\s+/;
const DECORATIVE_PREFIX =
  /^(?:radiant|shining|dark|light|detective|surfing|flying|ancient|future)\s+/i;
const REGIONAL_PREFIXES = {
  alolan: 'alola',
  galarian: 'galar',
  hisuian: 'hisui',
  paldean: 'paldea',
};
// Named forms printed before the species. Teal Mask is Ogerpon's base look.
const NAMED_FORM_PREFIX =
  /^(bloodmoon|teal mask|hearthflame mask|wellspring mask|cornerstone mask)\s+(.+)$/i;
// Species whose ex card shows a form rather than the base look.
const EX_CARD_FORMS = { terapagos: 'terastal', palafin: 'hero' };
// Paldean Tauros cards name no breed; the card's type tells them apart.
const PALDEAN_TAUROS_BREEDS = { fire: 'paldea-blaze', water: 'paldea-aqua' };

function nameKey(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/♀/g, 'f')
    .replace(/♂/g, 'm')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const POKEMON_BY_SLUG = new Map(
  POKEMON_SPRITE_CATALOG.map((entry) => [entry.slug, entry])
);
const BASE_POKEMON_BY_NAME = new Map(
  POKEMON_SPRITE_CATALOG.filter((entry) => entry.form === null).map((entry) => [
    nameKey(entry.name),
    entry,
  ])
);
// Alternate forms by their display name ("Black Kyurem", "Fan Rotom", …), so
// a card that names the form resolves without a per-form parser branch.
const FORM_BY_NAME = new Map(
  POKEMON_SPRITE_CATALOG.filter((entry) => entry.form !== null).map((entry) => [
    nameKey(entry.name),
    entry,
  ])
);
// Card wordings the display names cannot reach. Castform and Deoxys spell the
// form on either side of the species; "Normal Forme" is the base sprite.
const FORM_NAME_ALIASES = {
  raincastform: 'castform-rainy',
  castformrainform: 'castform-rainy',
  castformrainyform: 'castform-rainy',
  snowcloudcastform: 'castform-snowy',
  castformsnowcloudform: 'castform-snowy',
  castformsnowyform: 'castform-snowy',
  sunnycastform: 'castform-sunny',
  castformsunnyform: 'castform-sunny',
  deoxysattackforme: 'deoxys-attack',
  deoxysdefenseforme: 'deoxys-defense',
  deoxysspeedforme: 'deoxys-speed',
  deoxysnormalforme: 'deoxys',
};
// Arceus and Silvally pick their sprite from the card's printed type. Only the
// types the TCG prints on them map; anything else falls back to the base.
const TYPE_FORM_SPECIES = new Set(['arceus', 'silvally']);
const TYPE_FORM_KEYS = {
  grass: 'grass',
  fire: 'fire',
  water: 'water',
  lightning: 'electric',
  psychic: 'psychic',
  fighting: 'fighting',
  darkness: 'dark',
  metal: 'steel',
  fairy: 'fairy',
  dragon: 'dragon',
};
// Eternatus VMAX always depicts the Eternamax form.
const VMAX_CARD_FORMS = { eternatus: 'eternamax' };
const ITEM_BY_NAME = new Map(
  ITEM_SPRITE_CATALOG.map((entry) => [nameKey(entry.name), entry])
);

function stripSuffixes(name) {
  let current = name.trim();
  let previous;
  do {
    previous = current;
    current = current.replace(NAME_SUFFIX, '').trim();
  } while (current !== previous);
  return current;
}

/**
 * Finds the base species inside what is left of a card name. Tries the whole
 * string, then drops leading words one at a time so descriptive prefixes the
 * rules do not know ("Origin Forme Dialga", "Single Strike Urshifu") still
 * land on the species.
 */
function findBaseSpecies(name) {
  const words = name.split(/\s+/).filter(Boolean);
  for (let start = 0; start < words.length; start += 1) {
    const entry = BASE_POKEMON_BY_NAME.get(
      nameKey(words.slice(start).join(' '))
    );
    if (entry) return entry;
  }
  return null;
}

function namedFormKey(prefix) {
  const key = prefix.toLowerCase().replace(/\s+/g, '-');
  return key === 'teal-mask' ? null : key;
}

function paldeanTaurosForm(types) {
  const list = Array.isArray(types) ? types : [];
  for (const type of list) {
    const breed = PALDEAN_TAUROS_BREEDS[String(type ?? '').toLowerCase()];
    if (breed) return breed;
  }
  return 'paldea';
}

function typeFormFor(slug, types) {
  if (!TYPE_FORM_SPECIES.has(slug)) return null;
  const list = Array.isArray(types) ? types : [];
  for (const type of list) {
    const key = TYPE_FORM_KEYS[String(type ?? '').toLowerCase()];
    if (key) return key;
  }
  return null;
}

function entryResult(entry) {
  return { slug: entry.slug, name: entry.name };
}

/**
 * Parses a Pokémon card name into a sprite catalog entry.
 * @param {string} cardName
 * @param {{types?: string[]}} [card] - the card's types pick a Paldean Tauros breed or an Arceus / Silvally type form
 * @returns {{slug: string, name: string}|null}
 */
export function pokemonSpriteForName(cardName, { types } = {}) {
  const raw = String(cardName ?? '').trim();
  if (!raw) return null;
  const isVmax = /[\s-]vmax$/i.test(raw);
  const isEx = /\sex$/.test(raw);

  let name = stripSuffixes(raw).replace(OWNER_PREFIX, '');
  let previous;
  do {
    previous = name;
    name = name.replace(DECORATIVE_PREFIX, '');
  } while (name !== previous);

  let form = null;
  const mega = name.match(/^(?:mega|m)\s+(.+?)(?:\s+([xyz]))?$/i);
  const primal = name.match(/^primal\s+(.+)$/i);
  const regional = name.match(/^(alolan|galarian|hisuian|paldean)\s+(.+)$/i);
  const named = name.match(NAMED_FORM_PREFIX);
  const strike = name.match(/^(single|rapid)[\s-]+strike\s+(.+)$/i);
  if (mega) {
    name = mega[1];
    form = mega[2] ? `mega-${mega[2].toLowerCase()}` : 'mega';
  } else if (primal) {
    name = primal[1];
    form = 'primal';
  } else if (regional) {
    name = regional[2];
    form = REGIONAL_PREFIXES[regional[1].toLowerCase()];
  } else if (named) {
    name = named[2];
    form = namedFormKey(named[1]);
  } else if (strike) {
    // pokesprite has no regular Rapid Strike art; only the VMAX form maps.
    name = strike[2];
    if (isVmax)
      form =
        strike[1].toLowerCase() === 'rapid' ? 'rapid-strike-gmax' : 'gmax';
  }

  if (!form) {
    const exact = FORM_BY_NAME.get(nameKey(name));
    if (exact) return entryResult(exact);
    const alias = POKEMON_BY_SLUG.get(FORM_NAME_ALIASES[nameKey(name)]);
    if (alias) return entryResult(alias);
  }

  const base = findBaseSpecies(name);
  if (!base) return null;
  if (form === 'paldea' && base.slug === 'tauros')
    form = paldeanTaurosForm(types);
  if (!form) form = typeFormFor(base.slug, types);
  if (!form && isVmax) form = VMAX_CARD_FORMS[base.slug] ?? 'gmax';
  if (!form && isEx) form = EX_CARD_FORMS[base.slug] ?? null;
  const formEntry = form ? POKEMON_BY_SLUG.get(`${base.slug}-${form}`) : null;
  const entry = formEntry || base;
  return entryResult(entry);
}

/** @returns {{path: string, name: string}|null} the item icon for a Trainer card name. */
export function itemSpriteForName(cardName) {
  const raw = String(cardName ?? '').trim();
  if (!raw) return null;
  const override = CARD_ITEM_OVERRIDES[raw.toLowerCase()];
  if (override === null) return null;
  if (override) {
    const entry = ITEM_SPRITE_CATALOG.find((item) => item.path === override);
    if (entry) return entry;
  }
  return ITEM_BY_NAME.get(nameKey(raw)) || null;
}

// TCGdex cards carry `trainerType`; pokemontcg.io-shaped data carries `subtypes`.
function isNonItemTrainer(card) {
  const subtypes = Array.isArray(card?.subtypes) ? card.subtypes : [];
  return [card?.trainerType, ...subtypes].some((subtype) =>
    /supporter|stadium/i.test(String(subtype ?? ''))
  );
}

/**
 * @param {{name?: string, supertype?: string, trainerType?: string, subtypes?: string[]}} card
 * @returns {{kind: 'pokemon'|'item', url: string, label: string, slug?: string}|null}
 */
export function cardSpriteFor(card) {
  const supertype = String(card?.supertype ?? '').toLowerCase();
  if (supertype.startsWith('pok')) {
    const pokemon = pokemonSpriteForName(card?.name, { types: card?.types });
    if (!pokemon) return null;
    return {
      kind: 'pokemon',
      slug: pokemon.slug,
      url: pokemonSpriteUrl(pokemon.slug),
      label: pokemon.name,
    };
  }
  if (supertype === 'trainer') {
    if (isNonItemTrainer(card)) return null;
    const item = itemSpriteForName(card?.name);
    if (!item) return null;
    return {
      kind: 'item',
      url: `${ITEM_SPRITE_BASE_PATH}/${item.path}.png`,
      label: item.name,
    };
  }
  return null;
}

function deckCardEntries(cards) {
  if (!cards || typeof cards !== 'object') return [];
  return Object.values(cards).flatMap((group) =>
    Array.isArray(group?.cards) ? group.cards : []
  );
}

/**
 * The Pokémon a deck shows beside its name: always up to MAX_DECK_SPRITES.
 * The user's chosen sprites come first; empty slots are filled from the
 * deck's own Pokémon, most copies first, one per sprite. Nothing here is
 * saved, so the fill follows deck edits and never overrides a choice.
 *
 * @param {Array} sprites - the deck's stored slots
 * @param {Object} cards - deck cards keyed by name: `{ [name]: { cards: [{ data, count }] } }`
 * @returns {{slug: string, shiny: boolean, auto?: boolean}[]}
 */
export function resolveDisplaySprites(sprites, cards) {
  const chosen = normalizeDeckSprites(sprites);
  if (chosen.length >= MAX_DECK_SPRITES) return chosen;

  const copiesBySlug = new Map();
  for (const entry of deckCardEntries(cards)) {
    const sprite = cardSpriteFor(entry?.data);
    if (sprite?.kind !== 'pokemon') continue;
    const count = Number(entry?.count) || 0;
    copiesBySlug.set(sprite.slug, (copiesBySlug.get(sprite.slug) || 0) + count);
  }
  const taken = new Set(chosen.map((sprite) => sprite.slug));
  const fill = [...copiesBySlug.entries()]
    .filter(([slug]) => !taken.has(slug))
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_DECK_SPRITES - chosen.length)
    .map(([slug]) => ({ slug, shiny: false, auto: true }));
  return [...chosen, ...fill];
}
