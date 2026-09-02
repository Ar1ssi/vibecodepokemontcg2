// attack-window.mjs — pure, DOM-free logic that computes which attacks and
// abilities are currently usable for the active Pokémon. Used by the
// "attack window" UI (rules-bridge.js) and unit-tested in
// rules-extended.test.mjs.

import { canPayAttackCost, expandEnergyEntries } from './attack-engine.mjs';
import { oncePerTurnClause } from './damage-parser.mjs';
import { passiveCostDiscount, applyCostDiscount } from './ability-executors.mjs';
import { parseStadiumCostModifier } from './stadium-effects.mjs';

/**
 * Build the list of usable attacks for a card.
 *
 * @param {object} card   - the active Pokémon card (must have `.attacks`,
 *                          `.types`, `.name`)
 * @param {object} opts   - {
 *   energyTypes:  [{ type, family }]   attached energy entries
 *   stadiumCostModifier: number        from parseStadiumCostModifier
 *   abilityUsed:  boolean              once-per-turn already used?
 *   rulesEnabled: boolean
 * }
 * @returns {Array<{name, cost, payable, onceUsed, reason}>}
 */
export function listAttacks(card, opts = {}) {
  const {
    energyTypes = [],
    stadiumCostModifier = 0,
    abilityUsed = false,
    rulesEnabled = true,
  } = opts;

  const attacks = card.attacks || [];
  const discount = rulesEnabled
    ? passiveCostDiscount(card) + stadiumCostModifier
    : 0;

  return attacks.map((atk, i) => {
    const rawCost = atk.cost || [];
    const effectiveCost =
      discount > 0 && rawCost.length > 0
        ? applyCostDiscount(rawCost, discount)
        : rawCost;

    const payable = canPayAttackCost(energyTypes, effectiveCost);
    const onceUsed = rulesEnabled && oncePerTurnClause(atk.text) && abilityUsed;

    let reason = '';
    if (onceUsed) {
      reason = 'Already used this turn (once per turn).';
    } else if (!payable) {
      const costStr = rawCost.map((s) => symbolLabel(s)).join(' ');
      reason = `Not enough energy (needs: ${costStr}).`;
    }

    return {
      index: i,
      name: atk.name || `Attack ${i + 1}`,
      cost: rawCost,
      effectiveCost,
      damage: atk.damage ?? null,
      payable,
      onceUsed,
      reason,
      usable: payable && !onceUsed,
    };
  });
}

/**
 * Build the list of usable abilities for a card (active or benched).
 *
 * @param {object} card   - the Pokémon card with an `.ability`
 * @param {object} opts   - { abilityUsed, rulesEnabled }
 * @returns {Array<{name, text, usable, reason}>}
 */
export function listAbilities(card, opts = {}) {
  const { abilityUsed = false, rulesEnabled = true } = opts;
  const ability = card.ability;
  if (!ability) return [];

  const oncePerTurn = /once during your turn/i.test(ability.text || '');
  const used = rulesEnabled && oncePerTurn && abilityUsed;

  return [
    {
      name: ability.name || card.ability?.name || 'Ability',
      text: ability.text || '',
      oncePerTurn,
      used,
      usable: !used,
      reason: used ? 'Already used this turn (once per turn).' : '',
    },
  ];
}

/**
 * Combine attacks + abilities into a single action list for the UI.
 *
 * @param {object} card   - the active Pokémon card
 * @param {object} opts   - same as listAttacks/listAbilities
 * @returns {{ attacks: Array, abilities: Array }}
 */
export function listUsableActions(card, opts = {}) {
  return {
    attacks: listAttacks(card, opts),
    abilities: listAbilities(card, opts),
  };
}

// ── helpers ──────────────────────────────────────────────────────────

const SYMBOL_LABELS = {
  Colorless: '⚪',
  Fire: '🔥',
  Water: '💧',
  Grass: '🌿',
  Lightning: '⚡',
  Psychic: '🔮',
  Fighting: '🥊',
  Metal: '⚙️',
  Dark: '🌑',
  Dragon: '🐉',
};

function symbolLabel(sym) {
  if (typeof sym !== 'string') return '?';
  return SYMBOL_LABELS[sym] || sym;
}
