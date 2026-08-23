// Attack execution: computes damage with weakness/resistance, applies
    // damage counters automatically, handles KOs and prize-taking, and ends
    // the turn after attacking (TCG Live behavior).
    
    import { rulesState, markAttacked } from './rules-state.mjs';
    
    // Weakness in the modern era (Scarlet & Violet onward) is +2x, older is +2x
    // or +20/+30 flat; TCGdex gives us { type, value } where value is the
    // multiplier (2) or flat bonus (20/30).
    export function computeAttackDamage(attacker, defender, attack) {
      const base = attack.damage ?? 0;
    
      let multiplier = 1;
      let flat = 0;
      if (attacker?.types?.length && defender?.weakness) {
        const atkType = attacker.types[0];
        if (defender.weakness.type === atkType) {
          const v = defender.weakness.value;
          if (v <= 2) {
            multiplier = Math.max(1, v);      // modern weakness: ×2 (or ×1)
          } else {
            flat += v;                        // legacy weakness: flat +20/+30
          }
        }
      }
    
      let resistance = 0;
      if (attacker?.types?.length && defender?.resistance) {
        const atkType = attacker.types[0];
        if (defender.resistance.type === atkType) {
          resistance = Math.abs(defender.resistance.value || 0);
        }
      }
    
      let total = base * multiplier + flat - resistance;
      if (total < 0) total = 0;
      return { total, base, multiplier, flat, resistance };
    }
    
    // Energy check: does the attacker have enough attached energy for the cost?
    export function canPayAttackCost(attachedEnergies = [], cost = []) {
      // attachedEnergies: array of energy types; cost: array of type symbols
      const pool = [...attachedEnergies];
      for (const symbol of cost) {
        if (symbol === 'Colorless') {
          // any single energy
          if (pool.length === 0) return false;
          pool.pop();
        } else {
          const idx = pool.indexOf(symbol);
          if (idx === -1) return false;
          pool.splice(idx, 1);
        }
      }
      return true;
    }
    
    // Full attack flow. Returns a result object for the UI to announce.
    export async function executeAttack({ attacker, defender, attack, attackIndex, damageApplier, prizeTaker }) {
      // 1. cost check
      const energies = attacker.attachedEnergies || [];
      if (!canPayAttackCost(energies, attack.cost)) {
        return { ok: false, reason: 'Not enough energy attached.' };
      }
    
      // 2. compute damage with weakness/resistance
      const dmg = computeAttackDamage(attacker, defender, attack);
    
      // 3. apply
      const newTotal = (defender.currentDamage || 0) + dmg.total;
      damageApplier?.(newTotal);
    
      markAttacked(rulesState.turnPlayer);
    
      const ko = defender.hp != null && newTotal >= defender.hp;
      return {
        ok: true,
        damage: dmg.total,
        breakdown: dmg,
        ko,
      };
    }
    