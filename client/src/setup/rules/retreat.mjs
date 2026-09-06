// Retreat: switch your active Pokémon to the bench by paying its retreat
    // cost in energy. Once per turn; not allowed after attacking.
    
import { rulesState } from './rules-state.mjs';
import { canPayAttackCost } from './attack-engine.mjs';
import { parseRetreatCostModifier, applyRetreatCostModifier } from './ability-executors.mjs';
import { combinedToolRetreatCost } from './tool-combat.mjs';

export function canRetreat(player, activeCard, attachedEnergies = [], zoneCards = []) {
  if (!rulesState.enabled) return { allowed: true };
  if (rulesState.turnPlayer !== player) {
    return { allowed: false, reason: "It's not your turn." };
  }
  if (rulesState.flags[player]?.attackerAttacked) {
    return { allowed: false, reason: "You can't retreat after attacking." };
  }
  if (rulesState.flags[player]?.retreatedThisTurn) {
    return { allowed: false, reason: 'You already retreated this turn.' };
  }
  const costN = combinedToolRetreatCost(activeCard?.retreatCost || 0, activeCard, zoneCards);
  const cost = new Array(costN).fill('Colorless');
  if (!canPayAttackCost(attachedEnergies, cost)) {
    return { allowed: false, reason: `Not enough energy to retreat (costs ${costN}).` };
  }
      return { allowed: true };
    }
    
    export function markRetreated(player) {
      if (rulesState.flags[player]) rulesState.flags[player].retreatedThisTurn = true;
    }
    
    // which energies to discard for the retreat (prefer leaving typed energy)
    export function energiesToDiscardForRetreat(attachedEnergies = [], retreatCost = 0) {
      // pay colorless from the front; caller discards these
      return attachedEnergies.slice(0, retreatCost);
    }
    