/**
 * Deck Pokémon sprites — the pure model behind the strip of Pokémon shown
 * next to a deck's name (design 024).
 *
 * A deck carries up to three slots, each `{ slug, shiny }`. The art is
 * vendored from msikma/pokesprite under client/src/assets/pokemon/gen8, so a
 * slug maps to a file path with no network call and no fallback branch (D97).
 *
 * Nothing here touches the DOM or storage: every function returns a new value
 * and leaves its arguments alone.
 */
import { POKEMON_SPRITE_CATALOG } from './pokemon-sprite-catalog.generated.mjs';

export const MAX_DECK_SPRITES = 3;
export const POKEMON_SPRITE_BASE_PATH = '/src/assets/pokemon/gen8';

const BY_SLUG = new Map(
  POKEMON_SPRITE_CATALOG.map((entry) => [entry.slug, entry])
);

export { POKEMON_SPRITE_CATALOG };

/** @returns {{idx: string, name: string, slug: string}|null} */
export function findPokemonBySlug(slug) {
  return BY_SLUG.get(String(slug ?? '')) || null;
}

/**
 * Name search for the picker. Prefix matches come first (typing "char" should
 * reach Charmander before Wartortle's... nothing, but before any mid-word hit),
 * and each group keeps dex order so the list never reshuffles arbitrarily.
 */
export function searchPokemon(query = '', limit = 40) {
  const needle = String(query ?? '')
    .trim()
    .toLowerCase();
  const max = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 40;
  if (!needle) return POKEMON_SPRITE_CATALOG.slice(0, max);

  const prefix = [];
  const contains = [];
  for (const entry of POKEMON_SPRITE_CATALOG) {
    const haystack = entry.name.toLowerCase();
    if (haystack.startsWith(needle) || entry.slug.startsWith(needle))
      prefix.push(entry);
    else if (haystack.includes(needle) || entry.slug.includes(needle))
      contains.push(entry);
    if (prefix.length >= max) break;
  }
  return [...prefix, ...contains].slice(0, max);
}

/** @returns {string} the vendored sprite path, or '' for a slug we do not have art for. */
export function deckSpriteImageUrl(sprite = {}) {
  const entry = findPokemonBySlug(sprite?.slug);
  if (!entry) return '';
  return `${POKEMON_SPRITE_BASE_PATH}/${sprite?.shiny ? 'shiny' : 'regular'}/${entry.slug}.png`;
}

/** @returns {string} e.g. 'Shiny Pikachu' — used for alt text and tooltips. */
export function deckSpriteLabel(sprite = {}) {
  const entry = findPokemonBySlug(sprite?.slug);
  if (!entry) return '';
  return sprite?.shiny ? `Shiny ${entry.name}` : entry.name;
}

/**
 * Coerces whatever is stored on a deck into a renderable slot list: unknown
 * slugs, duplicates, non-objects and anything past the cap are dropped. A deck
 * saved before sprites existed normalizes to [], so old libraries just work.
 *
 * @returns {{slug: string, shiny: boolean}[]}
 */
export function normalizeDeckSprites(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const sprites = [];
  for (const candidate of value) {
    if (sprites.length >= MAX_DECK_SPRITES) break;
    const slug = typeof candidate === 'string' ? candidate : candidate?.slug;
    const entry = findPokemonBySlug(slug);
    if (!entry || seen.has(entry.slug)) continue;
    seen.add(entry.slug);
    sprites.push({ slug: entry.slug, shiny: Boolean(candidate?.shiny) });
  }
  return sprites;
}

/** Appends a Pokémon; a no-op at the cap, on a duplicate, or for an unknown slug. */
export function addDeckSprite(sprites, slug, shiny = false) {
  const current = normalizeDeckSprites(sprites);
  const entry = findPokemonBySlug(slug);
  if (!entry || current.length >= MAX_DECK_SPRITES) return current;
  if (current.some((sprite) => sprite.slug === entry.slug)) return current;
  return [...current, { slug: entry.slug, shiny: Boolean(shiny) }];
}

export function removeDeckSpriteAt(sprites, index) {
  const current = normalizeDeckSprites(sprites);
  if (!Number.isInteger(index) || index < 0 || index >= current.length)
    return current;
  return current.filter((_, position) => position !== index);
}

export function toggleDeckSpriteShinyAt(sprites, index) {
  const current = normalizeDeckSprites(sprites);
  if (!Number.isInteger(index) || index < 0 || index >= current.length)
    return current;
  return current.map((sprite, position) =>
    position === index ? { ...sprite, shiny: !sprite.shiny } : sprite
  );
}
