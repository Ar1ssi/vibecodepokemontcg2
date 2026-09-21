/**
 * @file Card-glow palette (design 023, C7).
 *
 * One source of truth for the colour a card's affordance glow takes, keyed by the
 * card kind: Energy by its type colour, Supporters red, Items/Tools blue, Stadiums
 * green, everything else (Pokémon) the existing cyan (C8). The same type table backs
 * the inspector's attack banner so the two surfaces can never disagree.
 *
 * Pure and DOM-free; colours are returned as `[r, g, b]` triples so the DOM glue can
 * drop them straight into a `--glow-rgb` CSS variable.
 */

import { isEnergy, isTrainer } from '../../../../shared/engine/cards.mjs';
import { isStadiumCard } from '../../../../shared/engine/rules/stadium-effects.mjs';
import { isSupporterTrainer } from '../../../../shared/engine/rules/trainer-play-conditions.mjs';
import {
  energyTypeKeyFor,
  normalizeEnergyType,
} from '../../actions/move-card-bundle/energy-token-assets.mjs';

/** Energy-type colours, keyed by canonical type key (`energyTypeKeyFor`'s output). */
export const TYPE_GLOW = {
  fire: [192, 57, 43],
  water: [45, 125, 210],
  grass: [63, 155, 79],
  lightning: [224, 165, 31],
  psychic: [155, 89, 182],
  fighting: [207, 106, 28],
  darkness: [74, 74, 94],
  metal: [127, 135, 146],
  dragon: [91, 110, 225],
  fairy: [224, 127, 168],
  colorless: [142, 142, 147],
};

/** Non-energy kind colours. */
export const GLOW_RGB = {
  supporter: [229, 57, 53], // red
  item: [66, 165, 245], // blue (Items *and* Tools)
  stadium: [67, 160, 71], // green
  default: [120, 200, 255], // cyan — Pokémon hand/ability/attack (C8)
};

const toHex = ([r, g, b]) =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/** Hex banner colour for a printed energy type name (inspector's attack banner). */
export const glowHexForType = (type) =>
  toHex(TYPE_GLOW[normalizeEnergyType(type)] || TYPE_GLOW.colorless);

/**
 * Resolve a card's glow colour.
 *
 * Precedence is load-bearing: a Stadium is a Trainer and a Tool is a Trainer, so the
 * most specific kind must win before the generic Trainer bucket. Energy falls back to
 * Colorless grey when no type can be determined.
 *
 * @returns {{ tone: string, rgb: [number, number, number] }}
 */
export function glowColorFor(card) {
  if (!card) return { tone: 'default', rgb: GLOW_RGB.default };
  if (isStadiumCard(card)) return { tone: 'stadium', rgb: GLOW_RGB.stadium };
  if (isSupporterTrainer(card)) return { tone: 'supporter', rgb: GLOW_RGB.supporter };
  if (isTrainer(card)) return { tone: 'item', rgb: GLOW_RGB.item }; // Item or Tool
  if (isEnergy(card)) {
    const key = energyTypeKeyFor(card);
    return { tone: `energy-${key || 'colorless'}`, rgb: TYPE_GLOW[key] || TYPE_GLOW.colorless };
  }
  return { tone: 'default', rgb: GLOW_RGB.default }; // Pokémon
}
