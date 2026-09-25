import {
  classifyEnergyEffect,
  resolveAttachedEnergyType,
  rewriteEnergyDescriptor,
} from './energy-effects.mjs';
import { parseStadiumCostModifier } from './stadium-effects.mjs';
import { parseAttackInheritance } from './ability-executors.mjs';

/**
 * Gathers attack context for the active Pokémon: energy types, stadium cost
 * modifier, ability-used flag, and prior-attack inheritance. DOM-free — the
 * caller supplies the already-filtered attached energy cards and the board facts
 * (`specialEnergyBoard`) that conditional Special Energy (Reversal, Luminous,
 * Super Boost) reads. The server prices with both, so the preview must too.
 */
export async function resolveAttackContext({
  activeCard,
  attachedEnergyCards,
  ensureCardData,
  stadiumCard,
  abilityUsed,
  extraAttacks = [],
  board = {},
}) {
  const energyTypes = [];
  for (const energyCard of attachedEnergyCards || []) {
    try {
      await ensureCardData(energyCard);
    } catch {
      /* card data may not be ready yet */
    }
    const family = classifyEnergyEffect(energyCard);
    // Stadium rewrites (Temple of Sinnoh / Crystal Beach) must apply wherever
    // energy is priced. Without this the preview and the glow counted a Double
    // Colorless as 2 while the actual payment path counted it as 1 (or vice
    // versa), offering an attack the server then rejected.
    energyTypes.push(
      rewriteEnergyDescriptor(
        { type: resolveAttachedEnergyType(energyCard), family },
        {
          card: energyCard,
          stadiumCard,
          hostPokemon: activeCard,
          attachedCards: attachedEnergyCards || [],
          board,
        }
      )
    );
  }

  const stadiumCostModifier = stadiumCard ? parseStadiumCostModifier(stadiumCard) : 0;
  const abilityUsedFlag = abilityUsed(activeCard);

  // `extraAttacks` carries Stadium-granted inheritance (Shrine of Memories,
  // Meteor Falls, Holon Lake, Rocket's Tricky Gym); the caller resolves them
  // from the evolution stack. `priorAttacks` remains the card's own text-driven
  // inheritance (I44).
  const priorAttacks = [];
  const inheritsAttacks = !!parseAttackInheritance(activeCard);

  return {
    energyTypes,
    stadiumCostModifier,
    abilityUsedFlag,
    priorAttacks,
    extraAttacks,
    inheritsAttacks,
  };
}
