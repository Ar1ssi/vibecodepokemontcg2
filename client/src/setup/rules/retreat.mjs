// Retreat: switch your active Pokémon to the bench by paying its retreat
// cost in energy. Once per turn; not allowed after attacking.

import { rulesState } from './rules-state.mjs';
import { canPayAttackCost } from './attack-engine.mjs';
import { parseRetreatCostModifier, applyRetreatCostModifier } from './ability-executors.mjs';
import { combinedToolRetreatCost } from './tool-combat.mjs';
import { getStadiumRetreatCost, stadiumBlocksToolEffects } from './stadium-effects.mjs';
import { pendingRetreatCostDelta } from './attack-pending-effects.mjs';
import { classifyEnergyEffect, pokemonHasRedirectEnergy } from './energy-effects.mjs';

/**
 * Effective retreat cost for an active Pokémon taking into account:
 * - Switching Energy (free switch)
 * - Stadium modifiers
 * - Tool & Ability modifiers
 * - Pending turn deltas (from attack effects)
 */
export function getEffectiveRetreatCost(activeCard, player, zoneCards = []) {
  if (!rulesState.enabled) return activeCard?.retreatCost || 0;
  const cards = Array.isArray(zoneCards) ? zoneCards : (zoneCards?.array || []);
  // Switching Energy (taxonomy §F, family 3): free switch
  if (pokemonHasRedirectEnergy(activeCard, cards)) return 0;
  let cost = activeCard?.retreatCost || 0;
  cost = getStadiumRetreatCost(cost, activeCard, player);
  cost = combinedToolRetreatCost(cost, activeCard, cards, {
    blockTools: stadiumBlocksToolEffects(),
  });
  cost += pendingRetreatCostDelta(rulesState, player);
  return Math.max(0, cost);
}

/**
 * How many energy units a card or energy descriptor provides toward retreat cost.
 */
export function getEnergyValue(entry) {
  if (!entry) return 0;
  if (typeof entry === 'string') return 1;
  const family = entry.family || classifyEnergyEffect(entry);
  if (family === 'double' || family === 'double-colorless') return 2;
  return 1;
}

export function canRetreat(player, activeCard, attachedEnergies = [], zoneCards = []) {
  if (!rulesState.enabled) return { allowed: true, retreatCost: 0 };
  if (rulesState.turnPlayer !== player) {
    return { allowed: false, reason: "It's not your turn." };
  }
  if (rulesState.flags[player]?.attackerAttacked) {
    return { allowed: false, reason: "You can't retreat after attacking." };
  }
  if (rulesState.flags[player]?.retreatedThisTurn) {
    return { allowed: false, reason: 'You already retreated this turn.' };
  }
  const cards = Array.isArray(zoneCards) ? zoneCards : (zoneCards?.array || []);
  const costN = getEffectiveRetreatCost(activeCard, player, cards);
  if (costN === 0) return { allowed: true, retreatCost: 0 };
  const cost = new Array(costN).fill('Colorless');
  if (!canPayAttackCost(attachedEnergies, cost)) {
    return { allowed: false, reason: `Not enough energy to retreat (costs ${costN}).`, retreatCost: costN };
  }
  return { allowed: true, retreatCost: costN };
}

export function markRetreated(player) {
  if (rulesState.flags[player]) rulesState.flags[player].retreatedThisTurn = true;
}

// which energies to discard for the retreat (prefer leaving typed energy)
export function energiesToDiscardForRetreat(attachedEnergies = [], retreatCost = 0) {
  if (retreatCost <= 0) return [];
  // Sort so 1-energy cards are considered before multi-energy cards
  // (preserves double/special energies if smaller energies can pay the cost)
  const sorted = [...attachedEnergies].sort((a, b) => getEnergyValue(a) - getEnergyValue(b));
  const toDiscard = [];
  let paid = 0;
  for (const energy of sorted) {
    if (paid >= retreatCost) break;
    toDiscard.push(energy);
    paid += getEnergyValue(energy);
  }
  return toDiscard;
}
    