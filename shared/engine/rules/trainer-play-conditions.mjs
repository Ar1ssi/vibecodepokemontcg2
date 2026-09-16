// Card-printed restrictions on playing a Trainer that the server enforces (reduce.mjs
// validateLegality) and the playtest bot must respect when listing moves (e2e-options.mjs).
// One implementation so the two cannot drift. Pure and DOM-free.

import { parseTrainerEffect } from './trainer-effects.mjs';

function kindText(card) {
  const subtypes = Array.isArray(card?.subtypes) ? card.subtypes.join(' ') : card?.subtypes || '';
  return `${card?.type || ''} ${card?.trainerType || ''} ${subtypes}`.toLowerCase();
}

export function isToolTrainer(card) {
  return kindText(card).includes('tool');
}

export function isSupporterTrainer(card) {
  return kindText(card).includes('supporter');
}

/**
 * @param {object} params
 * @param {object} params.card The Trainer being played
 * @param {number} params.turnNumber Game turn number (1 = the first player's first turn)
 * @param {number} params.myPrizes Prize cards the playing player has left
 * @param {number} params.opponentPrizes Prize cards the opponent has left
 * @param {string|null} [params.stadiumName] Name of the Stadium in play, if any
 * @param {number} [params.handCount] Cards in hand, including the Trainer being played
 * @param {number} [params.benchCount] Benched Pokémon
 * @param {number|null} [params.rareCandyOptionCount] Stage 2 cards in hand with a Basic in play they
 *   can evolve (evolved-pokemon.mjs rareCandyOptions); null when unknown
 * @param {number|null} [params.toolTargetCount] Pokémon in play with no Tool attached; null when unknown
 * @returns {string|null} Why the card cannot be played, or null when it can
 */
export function trainerPlayBlockReason({
  card,
  turnNumber,
  myPrizes,
  opponentPrizes,
  stadiumName = null,
  handCount = Infinity,
  benchCount = 0,
  rareCandyOptionCount = null,
  toolTargetCount = null,
}) {
  if (!card) return null;
  if (isSupporterTrainer(card) && turnNumber === 1) {
    return "The player going first can't play a Supporter on turn 1.";
  }
  const kind = kindText(card);
  if (kind.includes('stadium') && stadiumName) {
    const same = String(stadiumName).trim().toLowerCase() === String(card.name || '').trim().toLowerCase();
    if (same) return 'A Stadium card with the same name is already in play.';
  }
  const text = card.text || card.effect || card.cardText || '';
  const parsed = parseTrainerEffect(Array.isArray(text) ? text.join(' ') : text);
  const condition = parsed.playCondition;
  const cost = parsed.steps?.[0]?.type === 'discardCost' ? parsed.steps[0].count || 1 : 0;
  if (cost > 0 && handCount - 1 < cost) return 'Not enough cards in hand to pay discard cost.';
  const effectSteps = (parsed.steps || []).filter((step) => step.type !== 'discardCost');
  if (effectSteps.length > 0 && effectSteps.every((step) => step.destination === 'bench') && benchCount >= 5) {
    return 'bench_full';
  }
  if (isToolTrainer(card) && toolTargetCount === 0) {
    return 'No Pokémon to attach this Tool to.';
  }
  const evolvesStage2 = effectSteps.some((step) => step.type === 'evolveStage2');
  if (evolvesStage2 && rareCandyOptionCount === 0) {
    return 'You need a Stage 2 Pokémon in hand that evolves from a Basic Pokémon you have in play.';
  }
  const maxOpponentPrizes = condition?.match(/^opponentPrizes<=(\d+)$/);
  if (maxOpponentPrizes && opponentPrizes > Number(maxOpponentPrizes[1])) {
    return `Your opponent must have ${maxOpponentPrizes[1]} or fewer Prize cards remaining.`;
  }
  if (condition === 'morePrizesThanOpponent' && myPrizes <= opponentPrizes) {
    return 'You must have more Prize cards remaining than your opponent.';
  }
  if (condition === 'notFirstTurn' && turnNumber <= 2) {
    return "You can't use this card during your first turn.";
  }
  return null;
}
