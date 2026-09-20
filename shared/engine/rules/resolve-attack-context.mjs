import { classifyEnergyEffect, resolveAttachedEnergyType } from './energy-effects.mjs';
import { parseStadiumCostModifier } from './stadium-effects.mjs';
import { parseAttackInheritance } from './ability-executors.mjs';

/**
 * Gathers attack context for the active Pokémon: energy types, stadium cost
 * modifier, ability-used flag, and prior-attack inheritance. DOM-free — the
 * caller supplies the already-filtered attached energy cards.
 */
export async function resolveAttackContext({
  activeCard,
  attachedEnergyCards,
  ensureCardData,
  stadiumCard,
  abilityUsed,
  extraAttacks = [],
}) {
  const energyTypes = [];
  for (const energyCard of attachedEnergyCards || []) {
    try {
      await ensureCardData(energyCard);
    } catch {
      /* card data may not be ready yet */
    }
    const family = classifyEnergyEffect(energyCard);
    energyTypes.push({ type: resolveAttachedEnergyType(energyCard), family });
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
