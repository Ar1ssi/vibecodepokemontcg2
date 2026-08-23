// Status conditions: asleep, paralyzed, poisoned, burned + the modern
    // "confused". Auto-applied from attack effects and auto-resolved at turn
    // boundaries (TCG Live behavior).
    
    // statuses per player, keyed by their active card id
    export const statusState = {
      self: {},   // cardId -> { asleep, paralyzed, poisoned, burned, confused }
      opp: {},
    };
    
    export function resetStatuses() {
      statusState.self = {};
      statusState.opp = {};
    }
    
    const ALL = ['asleep', 'paralyzed', 'poisoned', 'burned', 'confused'];
    
    export function getStatus(player, cardId) {
      return statusState[player][cardId] || null;
    }
    
    export function applyStatus(player, cardId, status) {
      if (!ALL.includes(status)) return false;
      // a Pokémon can hold asleep/paralyzed/confused OR poisoned/burned per
      // modern rules; simplest TCG Live behavior: one status slot, newest wins
      // for the "turn-skip" family, poison/burn stack separately.
      if (!statusState[player][cardId]) statusState[player][cardId] = {};
      statusState[player][cardId][status] = true;
      return true;
    }
    
    export function clearStatuses(player, cardId) {
      delete statusState[player][cardId];
    }
    
    // Can the active Pokémon attack this turn?
    export function canActThroughStatuses(player, cardId, rng = Math.random) {
      const s = statusState[player][cardId];
      if (!s) return { can: true };
      if (s.paralyzed) return { can: false, reason: "Paralyzed — this Pokémon can't attack or retreat." };
      if (s.asleep) {
        const woke = rng() < 0.5; // coin flip to wake
        return woke
          ? { can: true, note: 'woke up' , cleared: ['asleep']}
          : { can: false, reason: 'Asleep — coin flip failed.' };
      }
      return { can: true };
    }
    
    // Turn-boundary effects: poison 10, burn 20 + coin flip heal.
    export function resolveTurnBoundary(player, cardId, rng = Math.random) {
      const s = statusState[player][cardId];
      if (!s) return { damage: 0, notes: [] };
      const notes = [];
      let damage = 0;
      if (s.poisoned) {
        damage += 10;
        notes.push('Poison: 10 damage');
      }
      if (s.burned) {
        if (rng() < 0.5) {
          delete s.burned;
          notes.push('Burn healed (coin flip) — no damage');
        } else {
          damage += 20;
          notes.push('Burn: 20 damage');
        }
      }
      if (s.asleep || s.paralyzed) {
        // both clear at the end of the player's turn if they were applied then
        delete s.asleep;
        delete s.paralyzed;
        notes.push('Status cleared at turn end');
      }
      if (Object.keys(s).length === 0) delete statusState[player][cardId];
      return { damage, notes };
    }
    
    // Parse attack text for status keywords (TCG Live parses full effects;
    // we handle the common printed ones).
    export function parseStatusFromAttackText(text = '') {
      const lower = text.toLowerCase();
      const found = [];
      if (lower.includes('asleep')) found.push('asleep');
      if (lower.includes('paralyzed')) found.push('paralyzed');
      if (lower.includes('poisoned')) found.push('poisoned');
      if (lower.includes('burned')) found.push('burned');
      if (lower.includes('confused')) found.push('confused');
      return found;
    }
    