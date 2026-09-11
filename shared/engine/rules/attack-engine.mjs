// Attack execution: computes damage with weakness/resistance, applies
    // damage counters automatically, handles KOs and prize-taking, and ends
    // the turn after attacking (TCG Live behavior).
    
    import { rulesState, markAttacked } from './rules-state.mjs';
import { effectiveHp } from './stadium-effects.mjs';
    
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
    
    // Expand attached-energy entries into a flat pool of provided types.
    // Entries may be plain type strings (legacy) or `{ type, family }`
    // objects (taxonomy §F): a `double` family energy provides 2 of its
    // printed type; `double-colorless` provides 2 Colorless (any 2 symbols).
    //
    // 'Wildcard' is a distinct pool token from 'Colorless': it marks a genuine
    // any-type special energy (Prism/Stellar Energy — real cards whose ruling is
    // "provides any type of Energy"), which energy-effects.mjs's effectiveEnergyType
    // represents as `{ type: 'Colorless', family: 'attach-type' }` since it has no
    // fixed type of its own. That representation is otherwise indistinguishable
    // from a plain Colorless Energy card, which — unlike Prism/Stellar — can only
    // ever pay a Colorless cost symbol. Re-tag it here so canPayAttackCost can
    // still tell the two apart.
    export function expandEnergyEntries(attachedEnergies = []) {
      const pool = [];
      for (const entry of attachedEnergies) {
        const type = typeof entry === 'string' ? entry : entry?.type;
        const family = typeof entry === 'string' ? 'basic' : entry?.family || 'basic';
        if (!type) continue;
        if (family === 'double-colorless') {
          pool.push('Colorless', 'Colorless');
        } else if (family === 'double') {
          pool.push(type, type);
        } else if (family === 'attach-type' && type === 'Colorless') {
          pool.push('Wildcard');
        } else {
          pool.push(type);
        }
      }
      return pool;
    }

    // Energy check: does the attacker have enough attached energy for the cost?
    // `attachedEnergies` entries may be plain type strings or `{ type, family }`
    // objects (see `expandEnergyEntries`). The wildcard direction is one-way, per
    // the real TCG rules: a Colorless cost symbol can be paid by any attached
    // energy, but Colorless-*type* energy itself pays only Colorless cost symbols
    // — it cannot cover a colored (e.g. Fire, Psychic) requirement. A 'Wildcard'
    // pool entry (Prism/Stellar Energy) is the one genuine exception and pays any
    // symbol, colored or Colorless.
    export function canPayAttackCost(attachedEnergies = [], cost = []) {
      const pool = expandEnergyEntries(attachedEnergies);
      for (const symbol of cost) {
        if (symbol === 'Colorless') {
          const ci = pool.indexOf('Colorless');
          if (ci !== -1) pool.splice(ci, 1);
          else if (pool.length === 0) return false;
          else pool.pop(); // any single energy (including Wildcard) pays a Colorless symbol
        } else {
          const idx = pool.indexOf(symbol);
          if (idx !== -1) {
            pool.splice(idx, 1);
          } else {
            const wi = pool.indexOf('Wildcard');
            if (wi === -1) return false;
            pool.splice(wi, 1);
          }
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
    
      // KO threshold uses effective HP (stadium + tool HP modifiers apply).
      const koHp =
        defender.hp != null
          ? effectiveHp(defender.hp, defender?.user, defender, defender.zoneCards)
          : 0;
      const ko = koHp > 0 && newTotal >= koHp;
      return {
        ok: true,
        damage: dmg.total,
        breakdown: dmg,
        ko,
        koHp,
      };
    }
    