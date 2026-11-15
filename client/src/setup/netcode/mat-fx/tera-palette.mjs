// The colours of Terastallization: one crystal colour per Tera type, as in Scarlet/Violet, and the
// tones built from it for the entry (tera-entry.mjs), the crystal coat a Tera Pokémon wears
// (tera-skin.js, board3d/tera-coat.mjs) and their gems. Pure.
import { normalizeEnergyType } from '../../../actions/move-card-bundle/energy-token-assets.mjs';

export const TERA_PALETTE = Object.freeze({
  deep: [52, 96, 220],
  ice: [150, 222, 255],
  white: [246, 252, 255],
  cyan: [90, 230, 255],
});

// Brighter and more saturated than the card-glow palette so Darkness and Metal crystals don't read
// as grey. Colorless (and an unknown type) keeps the icy default.
export const TERA_TYPE_RGB = Object.freeze({
  fire: [255, 105, 55],
  water: [55, 135, 255],
  grass: [85, 205, 90],
  lightning: [255, 205, 45],
  psychic: [235, 85, 205],
  fighting: [225, 125, 60],
  darkness: [120, 70, 170],
  metal: [165, 185, 210],
  dragon: [105, 95, 240],
  fairy: [255, 135, 200],
});

const INK = [8, 10, 30];
const mixRgb = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

/**
 * The Tera palette for a Pokémon's type: `deep` (the crystal's shadow), `ice` (its pale body) and
 * `cyan` (its saturated body) come from the type's colour; `white` is the same for every type.
 *
 * @param {unknown} type a printed type ('Fire', 'Darkness', 'R', …)
 * @returns {{ deep: number[], ice: number[], white: number[], cyan: number[] }}
 */
export function teraPaletteFor(type) {
  const rgb = TERA_TYPE_RGB[normalizeEnergyType(type)];
  if (!rgb) return TERA_PALETTE;
  return {
    ...TERA_PALETTE,
    deep: mixRgb(rgb, INK, 0.35),
    ice: mixRgb(rgb, TERA_PALETTE.white, 0.2),
    cyan: mixRgb(rgb, TERA_PALETTE.white, 0.1),
  };
}

/** The Tera palette for a card, from its first printed type. */
export const teraPaletteForCard = (card) => teraPaletteFor(Array.isArray(card?.types) ? card.types[0] : null);

/**
 * A gem's three tones from a Tera palette, 0–255: `deep` at its root, `body` along it, `hot` on
 * its ridges, rim and glints (the body lifted toward white, never white itself).
 * @returns {{ deep: number[], body: number[], hot: number[] }}
 */
export function teraGemColours(palette = TERA_PALETTE) {
  return {
    deep: mixRgb(palette.deep, INK, 0.3),
    body: palette.cyan,
    hot: mixRgb(palette.cyan, palette.white, 0.3),
  };
}
