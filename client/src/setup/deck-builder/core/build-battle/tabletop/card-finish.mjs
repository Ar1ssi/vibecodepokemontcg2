// How a printed card's foil is laid out, for the tabletop's card material (design 073 Options 3).
// The foil family comes from the scene's existing rarity mapping (`unboxingHoloRarity`); this module
// turns it into what a shader needs: where the foil is, which pattern it carries, how strong it is.

import { cardLayoutFromImageUrl, isTrainerCard } from '../../holo.mjs';
import { unboxingHoloRarity } from '../unboxing.mjs';

// The printed art box per layout as [left, top, right, bottom] fractions of the card
// (`css/holo/base.css` --art-* values, D201); Trainers sit lower.
const ART_WINDOWS = Object.freeze({
  default: [0.085, 0.105, 0.915, 0.51],
  sv: [0.075, 0.1, 0.925, 0.525],
  swsh: [0.08, 0.11, 0.92, 0.505],
  sm: [0.085, 0.115, 0.915, 0.505],
  xy: [0.055, 0.115, 0.945, 0.51],
  wotc: [0.1075, 0.115, 0.8925, 0.51],
  ecard: [0.095, 0.12, 0.965, 0.485],
  ex: [0.0725, 0.0925, 0.9275, 0.4675],
  dp: [0.0675, 0.0925, 0.9325, 0.5],
  hgss: [0.07, 0.1025, 0.9275, 0.5225],
});
const TRAINER_ART_WINDOWS = Object.freeze({
  sv: [0.0775, 0.14, 0.9275, 0.5225],
  swsh: [0.0775, 0.1425, 0.9275, 0.5225],
  sm: [0.075, 0.1375, 0.9175, 0.52],
  xy: [0.095, 0.1575, 0.9025, 0.51],
  wotc: [0.105, 0.23, 0.915, 0.555],
  ecard: [0.095, 0.16, 0.9, 0.5025],
  ex: [0.1, 0.14, 0.9, 0.5],
  dp: [0.09, 0.1425, 0.9075, 0.5],
  hgss: [0.1, 0.155, 0.9, 0.545],
});

// The art-box holo pattern each era printed.
const HOLO_PATTERN_BY_LAYOUT = Object.freeze({
  sv: 'starlight',
  swsh: 'sheen',
  sm: 'sheen',
  xy: 'cosmos',
});

/**
 * @typedef {{foil: 'none'|'holo'|'reverse'|'full'|'gold'|'rainbow', pattern: 'none'|'sheen'|
 *   'starlight'|'cosmos'|'etched'|'glitter'|'swirl', window: number[]|null, strength: number,
 *   family: string|null}} CardFinish
 *   `window` is the art box [l, t, r, b]: the only foil on a holo, the one place without foil on a
 *   reverse; null when the foil covers the whole card.
 */

// family → [foil, pattern ('era' = the layout's art-box pattern), strength]
const FINISH_BY_FAMILY = Object.freeze({
  'rare holo': ['holo', 'era', 1],
  'gold star': ['holo', 'glitter', 1],
  'amazing rare': ['holo', 'glitter', 1],
  'lvx rare': ['holo', 'era', 1],
  'prime rare': ['holo', 'era', 1],
  'legend rare': ['holo', 'era', 1],
  'break rare': ['full', 'etched', 0.8],
  'reverse holo': ['reverse', 'sheen', 0.85],
  'energy reverse holo': ['full', 'sheen', 0.85],
  'double rare': ['full', 'sheen', 0.65],
  'ultra rare': ['full', 'etched', 0.9],
  'illustration rare': ['full', 'sheen', 0.55],
  'special illustration rare': ['full', 'etched', 1],
  'hyper rare': ['gold', 'etched', 1],
  'rare rainbow alt': ['rainbow', 'etched', 1],
  'vmax rare': ['full', 'glitter', 0.9],
  'shiny rare': ['full', 'glitter', 0.9],
  'ace spec rare': ['full', 'glitter', 1],
  'radiant rare': ['full', 'swirl', 0.9],
});

const NO_FINISH = Object.freeze({ foil: 'none', pattern: 'none', window: null, strength: 0, family: null });

/** @returns {number[]} the art box of the card's printed layout. */
export function artWindowFor(card) {
  const layout = cardLayoutFromImageUrl(card?.images?.large || card?.image || '') || 'default';
  const table = isTrainerCard(card) ? TRAINER_ART_WINDOWS : ART_WINDOWS;
  return [...(table[layout] || ART_WINDOWS[layout] || ART_WINDOWS.default)];
}

/**
 * @param {object|null} card a set-card row
 * @param {'normal'|'reverse'} slot
 * @returns {CardFinish}
 */
export function cardFinish(card, slot = 'normal') {
  const family = unboxingHoloRarity(card, slot);
  const spec = family && FINISH_BY_FAMILY[family];
  if (!spec) return NO_FINISH;
  const [foil, patternKey, strength] = spec;
  const layout = cardLayoutFromImageUrl(card?.images?.large || card?.image || '');
  const pattern = patternKey === 'era' ? HOLO_PATTERN_BY_LAYOUT[layout] || 'sheen' : patternKey;
  const window = foil === 'holo' || foil === 'reverse' ? artWindowFor(card) : null;
  return { foil, pattern, window, strength, family };
}

/** A Basic Energy in a pack is a plain print; the promo is a foil promo (pokemon.com listing). */
export function promoFinish(card) {
  return cardFinish(card ? { ...card, rarity: card.rarity || 'Promo' } : null, 'normal');
}
