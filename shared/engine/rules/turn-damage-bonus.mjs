// Turn-scoped attack damage boosts granted by Trainer cards (Premium Power Pro,
// Black Belt's Training, …): "During this turn, attacks used by your {F} Pokémon
// do 30 more damage to your opponent's Active Pokémon [ex]." The card is
// discarded on play, so the boost lives on the player's turn flags until the
// turn ends.
import { TYPE_LETTER, attackerTypes } from './tool-combat.mjs';
import { isExCard, isVCard, isRuleBoxPokemon } from './card-classify.mjs';

// Groups: 1 type letter ({F}), 2 no-Rule-Box attacker, 3 amount, 4 ex defender, 5 ex-or-V defender.
const TURN_BONUS_RE =
  /during this turn, attacks used by your (?:\{\s*([a-z])\s*\}\s*)?pok[eé]mon (that don[’']t have a rule box )?do (\d+) more damage to your opponent[’']s active pok[eé]mon( ex( and active pok[eé]mon v)?)?/i;

// Returns { amount, type, attackerNoRuleBox, defenderFilter } or null when the
// text is not a turn-scoped damage boost. defenderFilter: null | 'ex' | 'exOrV'.
export function parseTurnDamageBonus(text) {
  const match = String(text || '').match(TURN_BONUS_RE);
  if (!match) return null;
  const letter = match[1]?.toLowerCase();
  let defenderFilter = null;
  if (match[5]) defenderFilter = 'exOrV';
  else if (match[4]) defenderFilter = 'ex';
  return {
    amount: Number(match[3]),
    type: letter ? TYPE_LETTER[letter] || null : null,
    attackerNoRuleBox: !!match[2],
    defenderFilter,
  };
}

function defenderMatches(filter, defender) {
  if (filter === 'ex') return isExCard(defender);
  if (filter === 'exOrV') return isExCard(defender) || isVCard(defender);
  return true;
}

// Sum of the active turn boosts that apply to this attacker hitting this defender.
export function turnDamageBonusTotal(
  bonuses,
  attacker,
  defender,
  { defenderIsActive = true } = {}
) {
  if (!Array.isArray(bonuses) || bonuses.length === 0 || !defenderIsActive)
    return 0;
  const types = attackerTypes(attacker);
  let total = 0;
  for (const bonus of bonuses) {
    if (!bonus || !(bonus.amount > 0)) continue;
    // "attacks used by this Pokémon": scoped to the granting card's instance.
    if (
      bonus.attackerInstanceId != null &&
      bonus.attackerInstanceId !== attacker?.instanceId
    ) {
      continue;
    }
    if (bonus.type && !types.includes(bonus.type)) continue;
    if (bonus.attackerNoRuleBox && isRuleBoxPokemon(attacker)) continue;
    if (!defenderMatches(bonus.defenderFilter, defender)) continue;
    total += bonus.amount;
  }
  return total;
}
