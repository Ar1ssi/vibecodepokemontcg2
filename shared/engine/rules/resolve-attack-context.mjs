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

  // priorAttacks is always [] at the live call site today — inheritance
  // never actually fires (I43). Preserve that behaviour exactly.
  const priorAttacks = [];
  const inheritsAttacks = !!parseAttackInheritance(activeCard);

  return { energyTypes, stadiumCostModifier, abilityUsedFlag, priorAttacks, inheritsAttacks };
}
