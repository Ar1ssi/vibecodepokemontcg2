// The physical order of what comes out of a torn pack (design 073 § Pure modules): the cosmetic
// extras at the front (the Basic Energy where the era prints one, none otherwise), then the ten
// pool cards in slot order, so the rare slot is the last card seen. Pure; the reducer's
// `revealed[i]` counts only the pool cards.

import { createRng } from '../../../../../../../shared/engine/rng.mjs';
import { BASIC_ENERGY_LABELS } from '../box-catalog.mjs';
import { packExtrasFor } from './physical.mjs';

/**
 * @typedef {{kind: 'energy', energyLabel: string}|{kind: 'card', cardIndex: number}} StackItem
 */

/** @returns {string} the Basic Energy a pack carries: its own seeded stream, never a pool draw. */
export function packEnergyLabel(seed, packIndex) {
  const stream = ((Number(seed) >>> 0) ^ 0x27d4eb2f) + Math.imul((packIndex | 0) + 1, 0x9e3779b1);
  return BASIC_ENERGY_LABELS[createRng(stream >>> 0).int(BASIC_ENERGY_LABELS.length)];
}

/**
 * @param {{cardCount: number, era: string, seed: number, packIndex: number}} args
 * @returns {StackItem[]} front first.
 */
export function packStack({ cardCount, era, seed, packIndex }) {
  const stack = packExtrasFor(era).map((kind) => ({
    kind,
    energyLabel: packEnergyLabel(seed, packIndex),
  }));
  const count = Number.isFinite(cardCount) ? Math.max(0, Math.floor(cardCount)) : 0;
  for (let cardIndex = 0; cardIndex < count; cardIndex += 1) stack.push({ kind: 'card', cardIndex });
  return stack;
}

/** @returns {number} how many pool cards sit in front of stack position `position`. */
export function poolCardsBefore(stack, position) {
  const end = Math.max(0, Math.min(stack.length, Number.isFinite(position) ? Math.floor(position) : 0));
  let count = 0;
  for (let index = 0; index < end; index += 1) if (stack[index].kind === 'card') count += 1;
  return count;
}

/**
 * Where a reloaded pack resumes: with no pool card revealed the stack's front (its extras, if any)
 * is in hand again; otherwise every extra and `revealed` pool cards are already on the table.
 *
 * @returns {number} the stack position of the front card.
 */
export function stackPositionFor(stack, revealed) {
  const shown = Number.isFinite(revealed) ? Math.max(0, Math.floor(revealed)) : 0;
  if (shown === 0) return 0;
  const extras = stack.filter((item) => item.kind !== 'card').length;
  return Math.min(stack.length, extras + shown);
}
