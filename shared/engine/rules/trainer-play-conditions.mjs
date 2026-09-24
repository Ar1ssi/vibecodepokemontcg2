// Card-printed restrictions on playing a Trainer that the server enforces (reduce.mjs
// validateLegality) and the playtest bot must respect when listing moves (e2e-options.mjs).
// One implementation so the two cannot drift. Pure and DOM-free.

import { parseTrainerEffect } from './trainer-effects.mjs';
import { hasCondition } from './special-conditions.mjs';
import { normalizeStage } from './evolution.mjs';

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
 * @param {number|null} [params.lostZoneCount] Cards in the player's Lost Zone; null when unknown
 * @param {object|null} [params.opponentActive] The opponent's Active Pokémon (top card, with its
 *   Special Conditions); undefined when unknown, null when the spot is empty
 * @param {boolean|null} [params.koedLastOppTurn] Whether any of the player's Pokémon were Knocked
 *   Out during the opponent's last turn; null when unknown
 * @param {{name: string, types: string[]}[]|null} [params.koedLastOppTurnVictims] Those Pokémon
 * @returns {string|null} Why the card cannot be played, or null when it can
 */
export function trainerPlayBlockReason({
  card,
  turnNumber,
  myPrizes,
  opponentPrizes,
  stadiumName = null,
  stadiumPlayedThisTurn = false,
  handCount = Infinity,
  benchCount = 0,
  opponentBenchCount = null,
  rareCandyOptionCount = null,
  toolTargetCount = null,
  lostZoneCount = null,
  opponentActive = undefined,
  koedLastOppTurn = null,
  koedLastOppTurnVictims = null,
}) {
  if (!card) return null;
  if (isSupporterTrainer(card) && turnNumber === 1) {
    return "The player going first can't play a Supporter on turn 1.";
  }
  const kind = kindText(card);
  if (kind.includes('stadium')) {
    if (stadiumPlayedThisTurn) {
      return 'You can only play 1 Stadium card per turn.';
    }
    if (stadiumName) {
      const same = String(stadiumName).trim().toLowerCase() === String(card.name || '').trim().toLowerCase();
      if (same) return 'A Stadium card with the same name is already in play.';
    }
  }
  const text = card.text || card.effect || card.cardText || '';
  const parsed = parseTrainerEffect(Array.isArray(text) ? text.join(' ') : text);
  const condition = parsed.playCondition;
  const cost = parsed.steps?.[0]?.type === 'discardCost' ? parsed.steps[0].count || 1 : 0;
  if (cost > 0 && handCount - 1 < cost) return 'Not enough cards in hand to pay discard cost.';
  const effectSteps = (parsed.steps || []).filter((step) => step.type !== 'discardCost');
  if (
    effectSteps.length > 0 &&
    (effectSteps.every((step) => step.destination === 'bench') || effectSteps.some((step) => step.type === 'fossilItem')) &&
    benchCount >= 5
  ) {
    return 'bench_full';
  }
  if (effectSteps.some((step) => step.type === 'switchOwn' || step.type === 'switch') && benchCount === 0) {
    return 'No Benched Pokémon to switch with.';
  }
  if (
    effectSteps.some((step) => step.type === 'switchOpponent' || step.type === 'switchOpponentOut') &&
    opponentBenchCount === 0
  ) {
    return 'Opponent has no Benched Pokémon to switch.';
  }
  if (isToolTrainer(card) && toolTargetCount === 0) {
    return 'No Pokémon to attach this Tool to.';
  }
  const evolvesStage2 = effectSteps.some((step) => step.type === 'evolveStage2');
  if (evolvesStage2 && turnNumber <= 2) {
    return "You can't use this card during your first turn.";
  }
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
  return playConditionBlockReason(condition, {
    turnNumber,
    opponentPrizes,
    stadiumName,
    handCount,
    lostZoneCount,
    opponentActive,
    koedLastOppTurn,
    koedLastOppTurnVictims,
  });
}

const TYPE_SYMBOL_WORDS = {
  g: 'grass',
  r: 'fire',
  w: 'water',
  l: 'lightning',
  p: 'psychic',
  f: 'fighting',
  d: 'darkness',
  m: 'metal',
  n: 'dragon',
  y: 'fairy',
  c: 'colorless',
};

function stageName(card) {
  const subtypes = Array.isArray(card?.subtypes) ? card.subtypes : [];
  return normalizeStage(card?.stage) || subtypes.map(normalizeStage).find(Boolean) || 'Basic';
}

function victimMatches(victim, qualifier) {
  const [kind, value] = qualifier.split('=');
  if (kind === 'type') {
    const word = TYPE_SYMBOL_WORDS[value];
    return (victim?.types || []).some((t) => {
      const type = String(t).toLowerCase();
      return type === word || (word === 'darkness' && type === 'dark');
    });
  }
  if (kind === 'name') {
    return String(victim?.name || '')
      .replace(/[\u2018\u2019]/g, "'")
      .toLowerCase()
      .startsWith(value);
  }
  return false;
}

// Conditions whose state the caller may not know (the playtest bot) are skipped when their
// input is null/undefined: the server always supplies them and stays the authority.
function playConditionBlockReason(condition, ctx) {
  if (!condition) return null;
  const exactPrizes = condition.match(/^opponentPrizes==([\d|]+)$/);
  if (exactPrizes) {
    const allowed = exactPrizes[1].split('|').map(Number);
    if (!allowed.includes(ctx.opponentPrizes)) {
      return `Your opponent must have exactly ${allowed.join(' or ')} Prize cards remaining.`;
    }
    return null;
  }
  const lostZone = condition.match(/^lostZone>=(\d+)$/);
  if (lostZone) {
    if (ctx.lostZoneCount != null && ctx.lostZoneCount < Number(lostZone[1])) {
      return `You need ${lostZone[1]} or more cards in your Lost Zone.`;
    }
    return null;
  }
  if (condition === 'stadiumInPlay') {
    return ctx.stadiumName ? null : 'There must be a Stadium card in play.';
  }
  const oppStage = condition.match(/^opponentActiveStage=(.+)$/);
  if (oppStage) {
    if (ctx.opponentActive === undefined) return null;
    if (stageName(ctx.opponentActive) !== oppStage[1]) {
      return `Your opponent's Active Pokémon must be a ${oppStage[1]} Pokémon.`;
    }
    return null;
  }
  if (condition === 'opponentActivePoisoned') {
    if (ctx.opponentActive === undefined) return null;
    if (!hasCondition(ctx.opponentActive, 'Poisoned')) {
      return "Your opponent's Active Pokémon must be Poisoned.";
    }
    return null;
  }
  const koed = condition.match(/^koedLastTurn(?::(.+))?$/);
  if (koed) {
    if (ctx.koedLastOppTurn == null) return null;
    const qualifier = koed[1];
    const met = qualifier
      ? Array.isArray(ctx.koedLastOppTurnVictims) &&
        ctx.koedLastOppTurnVictims.some((victim) => victimMatches(victim, qualifier))
      : ctx.koedLastOppTurn;
    return met ? null : "None of the required Pokémon were Knocked Out during your opponent's last turn.";
  }
  if (condition === 'lastCardInHand') {
    return ctx.handCount > 1 ? 'This must be the last card in your hand.' : null;
  }
  const handMax = condition.match(/^handCount<=(\d+)$/);
  if (handMax) {
    return ctx.handCount > Number(handMax[1]) ? 'You have too many cards in your hand to play this card.' : null;
  }
  const handMin = condition.match(/^handCount>=(\d+)$/);
  if (handMin) {
    return ctx.handCount < Number(handMin[1]) ? 'You need other cards in your hand to play this card.' : null;
  }
  if (condition === 'firstTurnOnly') {
    return ctx.turnNumber > 2 ? 'You can use this card only during your first turn.' : null;
  }
  if (condition === 'secondPlayerFirstTurn') {
    return ctx.turnNumber !== 2 ? 'You can use this card only if you go second, during your first turn.' : null;
  }
  return null;
}
