// Retreat: switch your active Pokémon to the bench by paying its retreat
    // cost in energy. Once per turn; not allowed after attacking.
    
    import { rulesState } from './rules-state.mjs';
    import { canPayAttackCost } from './attack-engine.mjs';
    
    export function canRetreat(player, activeCard, attachedEnergies = []) {
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
      const cost = new Array(activeCard?.retreatCost || 0).fill('Colorless');
      if (!canPayAttackCost(attachedEnergies, cost)) {
        return { allowed: false, reason: `Not enough energy to retreat (costs ${activeCard?.retreatCost ?? 0}).` };
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
    