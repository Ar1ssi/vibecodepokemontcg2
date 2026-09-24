// How attached Energy pays attack and Retreat costs. The server-authoritative reducer and the
// playtest bot (e2e-options.mjs) both use this, and it reads Energy through the same
// classification the client guidance uses (energy-effects.mjs), so all three agree. Pure and DOM-free.

import {
  classifyEnergyEffect,
  resolveAttachedEnergyType,
  rewriteEnergyDescriptor,
} from './energy-effects.mjs';

/**
 * @param {object|string|null} card An attached Energy card, or a bare type name
 * @param {{stadiumCard?:object|null, hostPokemon?:object|null, attachedCards?:object[], board?:object}} [options]
 *   Stadium / host context for the in-play Energy rewrites (Temple of Sinnoh,
 *   Crystal Beach, Holon Research Tower) and the special-Energy provision
 *   conditions (see rewriteEnergyDescriptor). Safe to pass as the second arg of
 *   `Array.prototype.map` — a numeric index destructures to no context.
 * @returns {{type: string, family: string, dualType?: string}} Input for expandEnergyEntries
 */
export function serverEnergyDescriptor(card, options = {}) {
  const { stadiumCard = null, hostPokemon = null, attachedCards = [], board = {} } = options || {};
  if (!card) return { type: 'Colorless', family: 'basic' };
  if (typeof card === 'string') return { type: card, family: 'basic' };
  // A Pokémon attached as Special Energy by its own Ability (Buzzap, Battery).
  if (card.asEnergy && card.attachedTo != null) {
    const provides = [...(card.asEnergy.provides || [])];
    return rewriteEnergyDescriptor(
      {
        type: provides[0] || 'Colorless',
        family: 'attach-type',
        provides: provides.length ? provides : ['Colorless'],
      },
      { stadiumCard }
    );
  }
  const descriptor = {
    type: resolveAttachedEnergyType(card),
    family: classifyEnergyEffect(card),
  };
  return rewriteEnergyDescriptor(descriptor, { card, stadiumCard, hostPokemon, attachedCards, board });
}
