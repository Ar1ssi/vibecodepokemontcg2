// Design 026: colour identity for mat effects. A Pokémon tints its hits and
// bursts by its first printed type; an Energy by its energy type. Reuses the
// card-glow palette (design 023) so the board speaks one colour language.
import { TYPE_GLOW } from '../../rules/card-glow-colors.mjs';
import { energyTypeKeyFor, isEnergyCard, normalizeEnergyType } from '../../../actions/move-card-bundle/energy-token-assets.mjs';

export const FX_NEUTRAL_RGB = [255, 214, 120];

/** @returns {[number, number, number]} */
export function fxRgbForCard(card) {
  if (!card || typeof card !== 'object') return FX_NEUTRAL_RGB;
  if (isEnergyCard(card)) return TYPE_GLOW[energyTypeKeyFor(card)] || TYPE_GLOW.colorless;
  const type = Array.isArray(card.types) ? card.types[0] : null;
  return TYPE_GLOW[normalizeEnergyType(type)] || FX_NEUTRAL_RGB;
}

/** Lift a palette colour toward white so glows read on the dark mat. */
export function brighten([r, g, b], amount = 0.35) {
  const up = (v) => Math.round(v + (255 - v) * amount);
  return [up(r), up(g), up(b)];
}

export const rgbCss = ([r, g, b], alpha = 1) => `rgba(${r}, ${g}, ${b}, ${alpha})`;
