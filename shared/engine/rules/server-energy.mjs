// How attached Energy pays attack and Retreat costs. The server-authoritative reducer and the
// playtest bot (e2e-options.mjs) both use this, and it reads Energy through the same
// classification the client guidance uses (energy-effects.mjs), so all three agree. Pure and DOM-free.

import { classifyEnergyEffect, resolveAttachedEnergyType } from './energy-effects.mjs';

/**
 * @param {object|string|null} card An attached Energy card, or a bare type name
 * @returns {{type: string, family: string}} Input for expandEnergyEntries (attack-engine.mjs)
 */
export function serverEnergyDescriptor(card) {
  if (!card) return { type: 'Colorless', family: 'basic' };
  if (typeof card === 'string') return { type: card, family: 'basic' };
  return { type: resolveAttachedEnergyType(card), family: classifyEnergyEffect(card) };
}
