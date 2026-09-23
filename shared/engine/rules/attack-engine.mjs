// Attack execution: computes damage with weakness/resistance, applies
    // damage counters automatically, handles KOs and prize-taking, and ends
    // the turn after attacking (TCG Live behavior).
    
    import { rulesState, markAttacked } from './rules-state.mjs';
import {
  effectiveHp,
  stadiumNullifiesWeakness,
  isStadiumWeaknessTimesTwo,
  stadiumIgnoresResistance,
  getStadiumTypeDamageReduction,
} from './stadium-effects.mjs';
import {
  combinedToolAttackBonus,
  applyToolDamageReduction,
  combinedToolDamagePrevention,
} from './tool-combat.mjs';
import {
  getSpecialEnergyAttackBonus,
  getSpecialEnergyAttackPenalty,
  getSpecialEnergyDamageReduction,
} from './special-energy-parse.mjs';
import { turnDamageBonusTotal } from './turn-damage-bonus.mjs';
import { attackerMatchesFilter, hasMarker } from './attack-markers.mjs';

// Weakness in the modern era (Scarlet & Violet onward) is +2x, older is +2x
// or +20/+30 flat; TCGdex gives us { type, value } where value is the
// multiplier (2) or flat bonus (20/30).
export function computeAttackDamage(attacker, defender, attack, options = {}) {
  const {
    attackerZoneCards = [],
    defenderZoneCards = [],
    defenderInPlayCards = [],
    stadium = null,
    defenderIsActive = true,
    attackerTrailingPrizes = false,
    defenderPoisoned = false,
    baseDamage = null,
    blockTools = false,
    turnDamageBonuses = [],
    // Attack immunity wording (attack-markers.mjs parseDamageImmunity). Ignoring "effects on
    // the Defending Pokémon" skips its attack markers, Tools, Abilities and Special Energy
    // reductions; Stadiums still apply.
    ignoreWeakness = false,
    ignoreResistance = false,
    ignoreDefenderEffects = false,
    // Live attack markers on the defender (attack-markers.mjs liveAttackMarkers).
    defenderMarkers = [],
    // Live attack markers on the attacker (next-turn bonuses, "attacks do N less damage").
    attackerMarkers = [],
  } = options;
  const defenderEffects = ignoreDefenderEffects ? [] : defenderMarkers;
  const markerSum = (markers, pick) =>
    markers.reduce((sum, marker) => sum + (pick(marker) ? marker.amount || 0 : 0), 0);
  const attackNameLower = String(attack?.name || '').toLowerCase();
  const incomingApplies = (marker) => attackerMatchesFilter(marker.filter, attacker);

  // Printed damage arrives as a string ('30', '30+', '20×'); arithmetic on the raw
  // string yields NaN, which makes the defender un-KO-able (audit A-4).
  const base = baseDamage != null ? baseDamage : (parseInt(attack?.damage, 10) || 0);

  // Step 2: Attacker tool and ability damage bonuses (e.g. Choice Belt, Maximum Belt, Defiance Band)
  // Applied BEFORE Weakness and Resistance.
  const attackerBonus = combinedToolAttackBonus(attacker, attackerZoneCards, defender, {
    blockTools,
    defenderIsActive,
    defenderPoisoned,
    attackerTrailingPrizes,
    stadium,
  });

  // Step 2b: Attacker special-energy damage bonuses / penalties (taxonomy §F,
  // Gap #4c). Applied BEFORE Weakness and Resistance, like tool bonuses.
  const specialEnergyBonus = getSpecialEnergyAttackBonus(attacker, attackerZoneCards, { defenderIsActive });
  const specialEnergyPenalty = getSpecialEnergyAttackPenalty(attacker, attackerZoneCards);

  // Step 2c: Trainer turn boosts (Premium Power Pro), also BEFORE Weakness/Resistance.
  const turnBonus = turnDamageBonusTotal(turnDamageBonuses, attacker, defender, { defenderIsActive });

  // Step 2d: Attack markers placed on earlier turns. A next-turn bonus needs damage to add to.
  const markerBonus =
    base > 0 && defenderIsActive
      ? markerSum(
          attackerMarkers,
          (m) => m.kind === 'nextTurnBonus' && (m.attackName == null || m.attackName === attackNameLower)
        )
      : 0;
  const markerReductionBeforeWR =
    markerSum(attackerMarkers, (m) => m.kind === 'outgoingReduce' && !m.afterWR) +
    markerSum(defenderEffects, (m) => m.kind === 'incomingReduce' && !m.afterWR && incomingApplies(m));
  const markerReductionAfterWR =
    markerSum(attackerMarkers, (m) => m.kind === 'outgoingReduce' && m.afterWR) +
    markerSum(defenderEffects, (m) => m.kind === 'incomingReduce' && m.afterWR && incomingApplies(m));

  const damageBeforeWR = Math.max(
    0,
    base + attackerBonus + specialEnergyBonus + turnBonus + markerBonus - specialEnergyPenalty -
      markerReductionBeforeWR
  );

  // Continuous Stadium modifiers to Weakness/Resistance (taxonomy §E): some
  // Stadiums nullify Weakness for a filtered set of Pokémon, force Weakness to
  // ×2, ignore Resistance, or reduce damage to a type after W/R.
  const stadiumCard = stadium?.card || stadium || null;
  const weaknessNullified =
    !!stadiumCard &&
    stadiumNullifiesWeakness(stadiumCard, defender, { defenderZoneCards });

  let multiplier = 1;
  let flat = 0;
  const weaknessApplies =
    !ignoreWeakness && !weaknessNullified && !hasMarker(defenderEffects, 'noWeakness');
  if (attacker?.types?.length && defender?.weakness && weaknessApplies) {
    // Any of a dual-typed attacker's types triggers Weakness (audit A-5).
    if (attacker.types.includes(defender.weakness.type)) {
      const v = defender.weakness.value;
      if (stadiumCard && isStadiumWeaknessTimesTwo(stadiumCard)) {
        multiplier = 2;                   // Lake Boundary: Weakness is always ×2
      } else if (v <= 2) {
        multiplier = Math.max(1, v);      // modern weakness: ×2 (or ×1)
      } else {
        flat += v;                        // legacy weakness: flat +20/+30
      }
    }
  }

  let resistance = 0;
  if (
    !ignoreResistance &&
    attacker?.types?.length &&
    defender?.resistance &&
    !(stadiumCard && stadiumIgnoresResistance(stadiumCard, attacker))
  ) {
    if (attacker.types.includes(defender.resistance.type)) {
      resistance = Math.abs(defender.resistance.value || 0);
    }
  }

  const stadiumReduction = stadiumCard
    ? getStadiumTypeDamageReduction(stadiumCard, defender, { defenderIsActive })
    : 0;

  let damageAfterWR = damageBeforeWR * multiplier + flat - resistance - stadiumReduction;
  if (damageAfterWR < 0) damageAfterWR = 0;

  // Step 4b: Defender special-energy damage reduction applied after W/R
  // (Metal Energy, Stone, V Guard, …).
  const specialEnergyReduction = ignoreDefenderEffects
    ? 0
    : getSpecialEnergyDamageReduction(defender, defenderZoneCards, {
        attacker,
        afterWR: true,
      });
  damageAfterWR = Math.max(0, damageAfterWR - specialEnergyReduction - markerReductionAfterWR);

  // Step 5: Defender damage reduction (tools + abilities, applied AFTER Weakness and Resistance)
  let reduced = 0;
  let damageAfterReduction = damageAfterWR;
  if (damageAfterWR > 0 && !ignoreDefenderEffects) {
    damageAfterReduction = applyToolDamageReduction(
      damageAfterWR,
      defender,
      defenderZoneCards,
      attacker,
      { blockTools, stadium, inPlayCards: defenderInPlayCards }
    );
    reduced = damageAfterWR - damageAfterReduction;
  }

  // Step 6: Damage prevention (tools + abilities)
  const prevention = ignoreDefenderEffects
    ? null
    : combinedToolDamagePrevention(defender, defenderZoneCards, attacker, {
        blockTools,
        stadium,
      });

  let prevented = false;
  let finalDamage = damageAfterReduction;
  if (prevention?.preventAll) {
    prevented = true;
    finalDamage = 0;
  } else if (prevention?.reduce > 0) {
    finalDamage = Math.max(0, finalDamage - prevention.reduce * 10);
  }
  const markerPrevents = defenderEffects.some(
    (m) =>
      m.kind === 'incomingPrevent' &&
      incomingApplies(m) &&
      (m.maxDamage == null || finalDamage <= m.maxDamage)
  );
  if (!prevented && markerPrevents) {
    prevented = true;
    finalDamage = 0;
  }

  return {
    total: finalDamage,
    base,
    attackerBonus,
    specialEnergyBonus,
    specialEnergyPenalty,
    multiplier,
    flat,
    resistance,
    stadiumReduction,
    specialEnergyReduction,
    reduced,
    prevented,
  };
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
        if (Array.isArray(entry?.provides) && entry.provides.length) {
          // Host-conditional provision (Neo Upper on a Stage 2, …).
          pool.push(...entry.provides);
        } else if (family === 'double-colorless') {
          pool.push('Colorless', 'Colorless');
        } else if (family === 'double') {
          pool.push(type, type);
        } else if (family === 'attach-type' && type === 'Colorless') {
          pool.push('Wildcard');
        } else if (entry?.dualType) {
          // Holon Research Tower: one Energy that may satisfy either of two
          // types (encoded as "A|B", consumed by `canPayAttackCost`).
          pool.push(`${type}|${entry.dualType}`);
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
    // Pool tokens are plain type strings; a Holon Research Tower unit is "A|B"
    // (satisfies either type, still one Energy). 'Wildcard' pays any symbol.
    const dualMatches = (token, symbol) =>
      typeof token === 'string' &&
      token.includes('|') &&
      token.split('|').includes(symbol);

    // Solo debug switch (debug menu): when set, every attack and retreat cost counts as paid.
    // Server code never sets it, so authoritative play is unaffected.
    export const debugCosts = { free: false };

    export function canPayAttackCost(attachedEnergies = [], cost = []) {
      if (debugCosts.free) return true;
      const pool = expandEnergyEntries(attachedEnergies);
      for (const symbol of cost) {
        if (symbol === 'Colorless') {
          const ci = pool.indexOf('Colorless');
          if (ci !== -1) pool.splice(ci, 1);
          else if (pool.length === 0) return false;
          else pool.pop(); // any single energy (including Wildcard/dual) pays a Colorless symbol
        } else {
          let idx = pool.indexOf(symbol);
          if (idx === -1) idx = pool.findIndex((token) => dualMatches(token, symbol));
          if (idx === -1) idx = pool.indexOf('Wildcard');
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
    