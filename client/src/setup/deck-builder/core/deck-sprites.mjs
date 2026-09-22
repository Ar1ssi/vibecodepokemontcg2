/**
 * Deck Pokémon sprites — the pure model behind the strip of Pokémon shown
 * next to a deck's name (design 024).
 *
 * A deck carries up to two slots, each `{ slug, shiny }`. A slug names a
 * Pokémon or one of its Mega / Primal / Gigantamax / regional forms. The art is
 * vendored from msikma/pokesprite under client/src/assets/pokemon/gen8, so a
 * slug maps to a file path with no network call and no fallback branch (D97).
 * Generation 9 and the Paldea-era forms are fan art in the same style, kept
 * under gen9 with no shiny variant (D100).
 *
 * Nothing here touches the DOM or storage: every function returns a new value
 * and leaves its arguments alone.
 */
import { POKEMON_SPRITE_CATALOG as GEN8_SPRITE_CATALOG } from './pokemon-sprite-catalog.generated.mjs';
import { GEN9_SPRITE_CATALOG } from './pokemon-sprite-catalog-gen9.mjs';

export const MAX_DECK_SPRITES = 2;
export const POKEMON_SPRITE_BASE_PATH = '/src/assets/pokemon';

const GEN9_SLUGS = new Set(GEN9_SPRITE_CATALOG.map((entry) => entry.slug));

// One dex-ordered list. The sort is numeric (idx '1000' follows '999') and
// stable, so a Paldean form lands right after its gen-8 species and forms.
const POKEMON_SPRITE_CATALOG = [
  ...GEN8_SPRITE_CATALOG,
  ...GEN9_SPRITE_CATALOG,
].sort((a, b) => Number(a.idx) - Number(b.idx));

const BY_SLUG = new Map(
  POKEMON_SPRITE_CATALOG.map((entry) => [entry.slug, entry])
);

export { POKEMON_SPRITE_CATALOG };

/**
 * @returns {{idx: string, name: string, slug: string, species: string,
 *   form: string|null}|null} `form` is null for the base Pokémon, otherwise a
 *   pokesprite form key ('mega', 'gmax', 'alola', …).
 */
export function findPokemonBySlug(slug) {
  return BY_SLUG.get(String(slug ?? '')) || null;
}

/** @returns {boolean} false for the gen-9 fan art, which has no shiny set. */
export function hasShinySprite(slug) {
  return Boolean(findPokemonBySlug(slug)) && !GEN9_SLUGS.has(String(slug));
}

/** @returns {string} the vendored file for a known slug, or '' for an unknown one. */
export function pokemonSpriteUrl(slug, shiny = false) {
  const entry = findPokemonBySlug(slug);
  if (!entry) return '';
  const art = GEN9_SLUGS.has(entry.slug) ? 'gen9' : 'gen8';
  const variant = shiny && hasShinySprite(entry.slug) ? 'shiny' : 'regular';
  return `${POKEMON_SPRITE_BASE_PATH}/${art}/${variant}/${entry.slug}.png`;
}

/**
 * Name search for the picker.
 *
 * Ranking is by SPECIES, not by the form's display name: typing "gengar" must
 * surface Gengar, Mega Gengar and Gigantamax Gengar together, even though only
 * one of those names starts with the query. Species-prefix hits come first,
 * then anything else that contains the query (which is what finds every Mega
 * at once, or a regional by its "Alolan"/"Galarian" prefix). Each bucket keeps
 * catalog order — dex order, with a species immediately followed by its forms —
 * so a form never floats away from the Pokémon it belongs to.
 */
export function searchPokemon(query = '', limit = 40) {
  const needle = String(query ?? '')
    .trim()
    .toLowerCase();
  const max = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 40;
  if (!needle) return POKEMON_SPRITE_CATALOG.slice(0, max);

  const bySpecies = [];
  const other = [];
  for (const entry of POKEMON_SPRITE_CATALOG) {
    const species = entry.species.toLowerCase();
    const name = entry.name.toLowerCase();
    if (species.startsWith(needle) || entry.slug.startsWith(needle)) {
      bySpecies.push(entry);
    } else if (
      species.includes(needle) ||
      name.includes(needle) ||
      entry.slug.includes(needle)
    ) {
      other.push(entry);
    }
    if (bySpecies.length >= max) break;
  }
  return [...bySpecies, ...other].slice(0, max);
}

/** @returns {string} the vendored sprite path, or '' for a slug we do not have art for. */
export function deckSpriteImageUrl(sprite = {}) {
  return pokemonSpriteUrl(sprite?.slug, Boolean(sprite?.shiny));
}

/** @returns {string} e.g. 'Shiny Pikachu' — used for alt text and tooltips. */
export function deckSpriteLabel(sprite = {}) {
  const entry = findPokemonBySlug(sprite?.slug);
  if (!entry) return '';
  return sprite?.shiny && hasShinySprite(entry.slug)
    ? `Shiny ${entry.name}`
    : entry.name;
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
    sprites.push({
      slug: entry.slug,
      shiny: Boolean(candidate?.shiny) && hasShinySprite(entry.slug),
    });
  }
  return sprites;
}

/** Appends a Pokémon; a no-op at the cap, on a duplicate, or for an unknown slug. */
export function addDeckSprite(sprites, slug, shiny = false) {
  const current = normalizeDeckSprites(sprites);
  const entry = findPokemonBySlug(slug);
  if (!entry || current.length >= MAX_DECK_SPRITES) return current;
  if (current.some((sprite) => sprite.slug === entry.slug)) return current;
  return [
    ...current,
    { slug: entry.slug, shiny: Boolean(shiny) && hasShinySprite(entry.slug) },
  ];
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
    position === index && hasShinySprite(sprite.slug)
      ? { ...sprite, shiny: !sprite.shiny }
      : sprite
  );
}
