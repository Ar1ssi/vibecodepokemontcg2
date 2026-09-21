/**
 * @file Card-glow model (design 023).
 *
 * Composes the three existing legality decisions into one plain, DOM-free object:
 *   - hand playability  → `enumerateOptions` (the bot's legal-move enum, same gates
 *     the server enforces),
 *   - attack + in-play abilities → `computeActionAffordances` (the sidebox's own path),
 *   - Stadium activatability → `stadiumActivationStatus`.
 *
 * The model is a *renderer* of those decisions (C2): it never re-derives legality.
 * Each glow carries the card's colour from `card-glow-colors.mjs` so the DOM glue
 * only has to paint. Pure and node-tested.
 */

import {
  enumerateOptions,
  defaultStatusKey,
} from '../general/e2e-options.mjs';
import { computeActionAffordances } from './action-affordances.mjs';
import { glowColorFor } from './card-glow-colors.mjs';
import { stadiumActivationStatus } from '../../../../shared/engine/rules/stadium-effects.mjs';
import { rulesState } from '../../../../shared/engine/rules/rules-state.mjs';

// Hand-move kinds that make a hand card glow. `moveCard` is NOT included:
// `enumerateOptions` emits `playTrainer` (not `moveCard`) for every Trainer,
// Stadium included, so a Trainer that reaches the option list is always tagged.
export const HAND_GLOW_KINDS = new Set(['playBasic', 'evolve', 'attach', 'playTrainer']);

// The client marks a used Stadium `stadiumUsed`; the server's per-turn flag (merged
// into rulesState.flags by apply-view.js under authoritative netcode) is
// `stadiumUsedThisTurn`. Read either so the once-per-turn gate holds in both modes.
const stadiumUsedFlagFor = (user) => {
  const flags = rulesState.flags?.[user] || {};
  return !!(flags.stadiumUsed || flags.stadiumUsedThisTurn);
};

/**
 * @param {object} board same shape the glue already assembles for
 *   `computeActionAffordances` plus the hand-legality context for `enumerateOptions`
 * @returns {Promise<{
 *   handPlayable: Map<object, {tone:string, rgb:number[]}>,
 *   activeCanAttack: boolean,
 *   activeColor: {tone:string, rgb:number[]},
 *   abilityCards: Array<{card:object, zone:string, index:number, family:string, abilityName:string}>,
 *   stadiumUsable: boolean,
 *   stadiumColor: {tone:string, rgb:number[]},
 *   stadiumReason: string|null,
 * }>}
 */
export async function computeCardGlows({
  user = 'self',
  handCards = [],
  activeCard = null,
  attachedEnergyCards = [],
  benchCards = [],
  activeZoneCards = [],
  stadiumCard = null,
  extraAttacks = [],
  isAbilityUsed = () => false,
  ensureCardData = async () => {},
  // hand-legality context, forwarded verbatim to enumerateOptions
  prizeCounts = null,
  deckList = [],
  stadiumName = null,
  statusKey = defaultStatusKey,
  attachedCardsOf = undefined,
  // stadium-legality context (defaults read the live singleton, as the glue does)
  rulesEnabled = rulesState.enabled,
  yourTurn = rulesState.turnPlayer === user,
  stadiumUsedThisTurn = stadiumUsedFlagFor(user),
  flags = rulesState.flags?.[user] || {},
} = {}) {
  // 1. Attack + in-play abilities reuse the exact affordability path the sidebox uses.
  //    Gated on the turn so a direct call for the other player returns no glows
  //    (the glue only calls for the turn player; this keeps the model honest too).
  const affordance = yourTurn
    ? await computeActionAffordances({
        activeCard,
        attachedEnergyCards,
        benchCards,
        stadiumCard,
        extraAttacks,
        isAbilityUsed,
        ensureCardData,
      })
    : { attackAvailable: false, usableAbilities: [] };

  // 2. Hand playability = the bot's legal-move enum, filtered to hand entries.
  const options = await enumerateOptions({
    user,
    hand: handCards,
    active: activeCard,
    bench: benchCards,
    activeZoneCards,
    isAbilityUsed,
    statusKey,
    attachedCardsOf,
    prizeCounts,
    stadiumName,
    deckList,
  });
  const handPlayable = new Map();
  for (const option of options) {
    if (!HAND_GLOW_KINDS.has(option.kind) || !Number.isInteger(option.handIndex)) continue;
    const card = handCards[option.handIndex];
    if (card) handPlayable.set(card, glowColorFor(card));
  }

  // 3. Stadium activatability.
  const stadium = stadiumCard
    ? stadiumActivationStatus(stadiumCard, {
        rulesEnabled,
        yourTurn,
        usedThisTurn: stadiumUsedThisTurn,
        flags,
      })
    : { usable: false, reason: 'No Stadium in play.' };

  return {
    handPlayable, // Map<Card, {tone, rgb}>
    activeCanAttack: affordance.attackAvailable,
    activeColor: glowColorFor(activeCard), // Pokémon → default cyan (C8)
    abilityCards: affordance.usableAbilities, // [{card, zone, index, family, abilityName}]
    stadiumUsable: stadium.usable,
    stadiumColor: glowColorFor(stadiumCard), // green when usable and when in hand (C7)
    stadiumReason: stadium.reason,
  };
}
