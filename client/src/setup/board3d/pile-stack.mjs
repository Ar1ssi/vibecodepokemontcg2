// Design 074 D3 "Piles": layer counts and offsets for the deck, discard and Lost Zone piles.
import { deckStackLayers } from '../zones/deck-stack.mjs';

export const DEFAULT_PILE_VISUAL_MAX = 6;

/**
 * Sleeve layers under the deck's top card; the same count the DOM deck stack draws.
 * @param {number} count cards in the pile
 * @param {{ maxCount?: number, maxLayers?: number }} [opts]
 * @returns {number}
 */
export function pileLayers(count, opts) {
  return deckStackLayers(count, opts);
}

/**
 * Height of each layer above the table, bottom layer first.
 * @param {number} layers
 * @param {number} thickness one layer's thickness
 * @returns {number[]}
 */
export function pileOffsets(layers, thickness) {
  const total = Number.isFinite(layers) ? Math.max(0, Math.floor(layers)) : 0;
  const step = Number.isFinite(thickness) ? thickness : 0;
  return Array.from({ length: total }, (_, i) => i * step);
}

/**
 * Cards drawn for an open pile (discard, Lost Zone): the top card face up on at most `max`.
 * @param {number} count
 * @param {number} [max]
 * @returns {number}
 */
export function pileVisualCount(count, max = DEFAULT_PILE_VISUAL_MAX) {
  if (!Number.isFinite(count) || count <= 0) return 0;
  const cap = Number.isFinite(max) ? Math.max(0, Math.floor(max)) : DEFAULT_PILE_VISUAL_MAX;
  return Math.min(Math.floor(count), cap);
}
