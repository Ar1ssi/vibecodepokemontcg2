// Turn-scoped attack damage boosts granted by Trainer cards (Premium Power Pro,
// Black Belt's Training, …): "During this turn, attacks used by your {F} Pokémon
// do 30 more damage to your opponent's Active Pokémon [ex]." The card is
// discarded on play, so the boost lives on the player's turn flags until the
// turn ends.
//
// Modern printings use the possessive wording instead ("your {L} Pokémon's attacks
// do 30 more damage…", "each of your Active Pokémon's attacks does 40 more…") and
// some scale per Prize card the opponent has taken (Iris, Karen's Conviction).
import { TYPE_LETTER, attackerTypes, isBasicCard } from './tool-combat.mjs';
import { isExCard, isVCard, isRuleBoxPokemon } from './card-classify.mjs';
import { prizesTakenFor } from '../formats.mjs';

// Groups: 1 type letter ({F}), 2 no-Rule-Box attacker, 3 amount, 4 ex defender, 5 ex-or-V defender.
const USED_BY_RE =
  /during this turn, attacks used by your (?:\{\s*([a-z])\s*\}\s*)?pok[eé]mon (that don[’']t have a rule box )?do (\d+) more damage to your opponent[’']s active pok[eé]mon( ex( and active pok[eé]mon v)?)?/i;

// Groups: 1 type letter, 2 battle style, 3 amount, 4 ex defender, 5 ex-or-V defender,
// 6 per-Prize scaling.
const POSSESSIVE_RE =
  /during this turn, (?:each of )?your (?:\{\s*([a-z])\s*\}\s*)?(?:(fusion strike|single strike|rapid strike) )?(?:active )?pok[eé]mon[’']s attacks (?:do|does) (\d+) more damage to (?:your opponent[’']s |the )active pok[eé]mon( ex( and active pok[eé]mon v)?)?( for each prize card your opponent has taken)?/i;

// Misty gym1-18 (WotC): "If this turn's attack does damage to the Defending Pokémon (after applying
// Weakness and Resistance), and if the attacking Pokémon has Misty in its name, the attack does 20
// more damage to the Defending Pokémon." Groups: 1 name, 2 amount.
const NAMED_AFTER_WR_RE =
  /if this turn[’']s attack does damage to the defending pok[eé]mon \(after applying weakness and resistance\), and if the attacking pok[eé]mon has ([a-z.’' ]+?) in its name, the attack does (\d+) more damage to the defending pok[eé]mon/i;

const BATTLE_STYLES = {
  'fusion strike': ['fusion strike', 'fusionstrike'],
  'single strike': ['single strike', 'singlestrike'],
  'rapid strike': ['rapid strike', 'rapidstrike'],
};

// Returns { amount, type, attackerNoRuleBox, defenderFilter } — plus `attackerStyle`
// and `perPrizeTaken` for the possessive wordings — or null when the text is not a
// turn-scoped damage boost. defenderFilter: null | 'ex' | 'exOrV'.
export function parseTurnDamageBonus(text) {
  const raw = String(text || '');
  const named = raw.match(NAMED_AFTER_WR_RE);
  if (named) {
    return {
      amount: Number(named[2]),
      type: null,
      attackerNoRuleBox: false,
      defenderFilter: null,
      attackerName: named[1].toLowerCase().replace(/’/g, "'"),
      afterWR: true,
    };
  }
  const usedBy = raw.match(USED_BY_RE);
  if (usedBy) {
    const letter = usedBy[1]?.toLowerCase();
    return {
      amount: Number(usedBy[3]),
      type: letter ? TYPE_LETTER[letter] || null : null,
      attackerNoRuleBox: !!usedBy[2],
      defenderFilter: usedBy[5] ? 'exOrV' : usedBy[4] ? 'ex' : null,
    };
  }
  const possessive = raw.match(POSSESSIVE_RE);
  if (possessive) {
    const letter = possessive[1]?.toLowerCase();
    return {
      amount: Number(possessive[3]),
      type: letter ? TYPE_LETTER[letter] || null : null,
      attackerNoRuleBox: false,
      defenderFilter: possessive[5] ? 'exOrV' : possessive[4] ? 'ex' : null,
      attackerStyle: possessive[2] ? possessive[2].toLowerCase() : null,
      perPrizeTaken: !!possessive[6],
    };
  }
  return null;
}

function defenderMatches(filter, defender) {
  if (filter === 'ex') return isExCard(defender);
  if (filter === 'exOrV') return isExCard(defender) || isVCard(defender);
  return true;
}

// Battle Style (Single/Fusion/Rapid Strike) is printed as a name prefix or a subtype.
function matchesBattleStyle(attacker, style) {
  const wanted = BATTLE_STYLES[style] || [style];
  const subtypes = (Array.isArray(attacker?.subtypes) ? attacker.subtypes : []).map((s) =>
    String(s).toLowerCase()
  );
  if (subtypes.some((s) => wanted.includes(s))) return true;
  const name = String(attacker?.name || '').toLowerCase();
  return wanted.some((w) => name.includes(w));
}

// Sum of the active turn boosts that apply to this attacker hitting this defender.
export function turnDamageBonusTotal(
  bonuses,
  attacker,
  defender,
  { defenderIsActive = true, defenderPrizesRemaining, defenderDeckFormat } = {}
) {
  if (!Array.isArray(bonuses) || bonuses.length === 0 || !defenderIsActive)
    return 0;
  const types = attackerTypes(attacker);
  const prizesTaken = Number.isFinite(defenderPrizesRemaining)
    ? prizesTakenFor(defenderPrizesRemaining, defenderDeckFormat)
    : 0;
  let total = 0;
  for (const bonus of bonuses) {
    if (!bonus || !(bonus.amount > 0)) continue;
    // After-Weakness bonuses are the reducer's (turnDamageBonusAfterWR).
    if (bonus.afterWR) continue;
    // "attacks used by this Pokémon": scoped to the granting card's instance.
    if (
      bonus.attackerInstanceId != null &&
      bonus.attackerInstanceId !== attacker?.instanceId
    ) {
      continue;
    }
    if (bonus.type && !types.includes(bonus.type)) continue;
    if (bonus.attackerNoRuleBox && isRuleBoxPokemon(attacker)) continue;
    if (bonus.attackerStyle && !matchesBattleStyle(attacker, bonus.attackerStyle)) continue;
    if (bonus.attackerBasic && !isBasicCard(attacker)) continue;
    if (!defenderMatches(bonus.defenderFilter, defender)) continue;
    total += bonus.perPrizeTaken ? bonus.amount * prizesTaken : bonus.amount;
  }
  return total;
}

/**
 * The named after-Weakness/Resistance boosts (Misty gym1-18) for this attacker: the reducer adds
 * them to an attack that did damage to the Defending Pokémon.
 * @param {object[]} bonuses the attacking player's turnDamageBonuses
 * @param {object} attacker in-play view of the Attacking Pokémon
 * @returns {number}
 */
export function turnDamageBonusAfterWR(bonuses, attacker) {
  if (!Array.isArray(bonuses)) return 0;
  const name = String(attacker?.name || '').toLowerCase().replace(/’/g, "'");
  return bonuses
    .filter((bonus) => bonus?.afterWR && bonus.amount > 0 && (!bonus.attackerName || name.includes(bonus.attackerName)))
    .reduce((total, bonus) => total + bonus.amount, 0);
}
