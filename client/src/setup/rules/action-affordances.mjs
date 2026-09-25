/**
 * @file Action affordances for the highlight-parity plan (gaps B1/B3/C3):
 * "can this player's Active pay for any attack right now, and which of their
 * in-play Pokémon have an activatable ability?"
 *
 * Pure and DOM-free so it runs under `node --test` (same split as
 * attack-preview-sources.mjs). The DOM glue in rules-bridge.js supplies the
 * zone arrays, the merged legacy+server ability-used predicate, and
 * ensureCardData.
 */

import { resolveAttackContext } from '../../../../shared/engine/rules/resolve-attack-context.mjs';
import {
  listUsableActions,
  statusAttackBlock,
} from '../../../../shared/engine/rules/attack-window.mjs';
import {
  collectUsableAbilityCandidates,
  filterUsableAbilities,
} from '../../../../shared/engine/rules/collect-usable-abilities.mjs';
import { parseAbility } from '../../../../shared/engine/rules/abilities.mjs';

const abilityTextOf = (card) => {
  const first = Array.isArray(card?.abilities) && card.abilities.length > 0
    ? (typeof card.abilities[0] === 'string' ? card.abilities[0] : card.abilities[0]?.text)
    : '';
  return first || card?.ability?.text || card?.abilityText || card?.text || '';
};

/**
 * Same gate as ability-picker.js: "When you play this Pokémon onto your
 * Bench" triggers are gated by the one-shot window, not the per-turn
 * abilitiesUsed map. The evolve wording ("from your hand to evolve") has its
 * own gate (the turn the Pokémon evolved) and is excluded here.
 */
export function isPlayedToBenchTriggerCard(card) {
  return parseAbility(abilityTextOf(card)).some(
    (s) => s.type === 'whenPlayedAbility' && !s.evolve
  );
}

/**
 * "When you play this Pokémon from your hand to evolve 1 of your Pokémon"
 * one-shot triggers (Primarina Enriching Melody) are only legal on the turn
 * that Pokémon evolved, not every turn.
 */
export function isEvolvePlayedTriggerCard(card) {
  return parseAbility(abilityTextOf(card)).some(
    (s) => s.type === 'whenPlayedAbility' && s.evolve === true
  );
}

/**
 * @param {object} opts
 * @param {object|null} opts.activeCard the player's Active Pokémon (or null)
 * @param {object[]} [opts.attachedEnergyCards] energies on the Active
 *   (caller-computed via attachedEnergiesFor)
 * @param {object[]} [opts.benchCards] raw bench zone array (Pokémon are
 *   filtered inside)
 * @param {object|null} [opts.stadiumCard] the Stadium in play
 * @param {object} [opts.board] `specialEnergyBoard` facts for conditional
 *   Special Energy pricing (prizes, Stage 2 count)
 * @param {(card: object) => boolean} [opts.isAbilityUsed] merged already-spent
 *   predicate — legacy flag, stamped flag, server flags, and the
 *   when-played-to-bench window all folded in by the caller (same shape as
 *   ability-picker.js)
 * @param {(card: object) => Promise<void>} [opts.ensureCardData]
 * @returns {Promise<{ attackAvailable: boolean, abilityAvailable: boolean,
 *   usableAbilities: Array<{ card, zone, index, family, abilityName }> }>}
 */
export async function computeActionAffordances({
  activeCard = null,
  attachedEnergyCards = [],
  benchCards = [],
  stadiumCard = null,
  extraAttacks = [],
  board = {},
  isAbilityUsed = () => false,
  ensureCardData = async () => {},
  // False when the player had no Pokémon Knocked Out during the opponent's last
  // turn; gates Fezandipiti ex-style abilities exactly as the server does.
  koedLastOppTurn = true,
} = {}) {
  let attackAvailable = false;
  if (activeCard) {
    try {
      await ensureCardData(activeCard);
    } catch {
      /* card data may not be ready yet — treat as no payable attack */
    }
    const {
      energyTypes,
      stadiumCostModifier,
      abilityUsedFlag,
      priorAttacks,
      extraAttacks: resolvedExtra,
    } = await resolveAttackContext({
      activeCard,
      attachedEnergyCards,
      ensureCardData,
      stadiumCard,
      abilityUsed: isAbilityUsed,
      extraAttacks,
      board,
    });
    const { attacks } = listUsableActions(activeCard, {
      energyTypes,
      stadiumCostModifier,
      abilityUsed: abilityUsedFlag,
      rulesEnabled: true,
      priorAttacks,
      extraAttacks: resolvedExtra,
      // Asleep/Paralyzed lock the attack just as the server does. Confused is
      // not a lock (coin flip), so it is intentionally not passed.
      blockedReason: statusAttackBlock(activeCard),
    });
    attackAvailable = attacks.some((a) => a.usable);
  }

  const candidates = collectUsableAbilityCandidates(activeCard, benchCards);
  for (const { card } of candidates) {
    try {
      await ensureCardData(card);
    } catch {
      /* card data may not be ready yet */
    }
  }
  const usableAbilities = filterUsableAbilities(candidates, {
    rulesEnabled: true,
    isUsed: isAbilityUsed,
    koedLastOppTurn,
  });

  return {
    attackAvailable,
    abilityAvailable: usableAbilities.length > 0,
    usableAbilities,
  };
}
