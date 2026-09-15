/**
 * Pure math for design 009 slice 3 (see .agent/designs/009-tcg-live-table.md, "3D deck").
 *
 * Deck thickness is faked with N stacked sleeve-edge layers under the cover
 * image, offset upward by `translateY`, rather than real `translateZ`/
 * `preserve-3d` (rejected: silently flattens under `overflow`/`filter` on an
 * ancestor, and the tilted playfield already has both). `deckStackLayers`
 * only computes the layer count; the DOM renderer lives beside its caller
 * (playmat-anim.mjs).
 */

export const DEFAULT_MAX_COUNT = 60;
export const DEFAULT_MAX_LAYERS = 12;

/**
 * @param {number} count - cards currently in the deck.
 * @param {{ maxCount?: number, maxLayers?: number }} [options]
 * @returns {number} integer layer count, 0..maxLayers, monotonic in count.
 */
export function deckStackLayers(count, { maxCount = DEFAULT_MAX_COUNT, maxLayers = DEFAULT_MAX_LAYERS } = {}) {
  if (!Number.isFinite(count) || count <= 0) return 0;
  const clamped = Math.min(count, maxCount);
  const layers = Math.ceil((clamped / maxCount) * maxLayers);
  return Math.max(1, Math.min(layers, maxLayers));
}
