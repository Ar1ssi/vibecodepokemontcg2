/**
 * @file Trainer play: promoteTrainerPlay, the Chaos Gym gate, Trainer Prize-win and turn-end
 * settles, and the playTrainer/stadium-effect commands. Split out of reduce.mjs (design 073 B,
 * I250); reduce.mjs stays the public entry.
 */

import { findCard, discardCardToPlayerZone } from '../state.mjs';
import { isTrainer } from '../cards.mjs';
import { isPokemonToolCard } from '../rules/tool-combat.mjs';
import { stadiumTrainerPlayCoin } from '../rules/stadium-triggers.mjs';
import { abilityTurnNotEnd } from '../rules/ability-combat.mjs';
import { executeTrainer } from '../effects/trainer.mjs';
import { executeSteps } from '../effects/executor.mjs';
import { executeStadium } from '../effects/stadium.mjs';
import { trainerEndsTurn } from '../rules/trainer-effects.mjs';
import { setGameEnded, isGameConcluded, abilitySideContext } from './shared.mjs';
import { endTurnFromEffect } from './turn.mjs';

// Chaos Gym: every Trainer card other than a Stadium is coin-gated, whether played
// or attached from hand as a Pokémon Tool. Tails means it can't be played and goes
// to the discard pile. Returns true when the card was blocked.
// "If the card isn't put into play, the player's opponent may use that card instead": the
// opponent is offered it through the Psychic Control step (trainer-steps useOpponentDiscardTrainer),
// which leaves out cards that are put in play and cards the opponent could not pay for.
export function chaosGymBlocks(draft, { card, playerId, activeRng, events }) {
  const chaos = stadiumTrainerPlayCoin(draft.stadium?.card || draft.stadium, card);
  if (!chaos) return false;
  const face = activeRng.next() < 0.5 ? 'heads' : 'tails';
  events.push({ type: 'coinFlipped', playerId, face, source: chaos.source });
  if (face === 'heads') return false;
  const hand = draft.players[playerId].zones.hand;
  const handIdx = hand.findIndex((c) => c.instanceId === card.instanceId);
  if (handIdx >= 0) {
    const [blocked] = hand.splice(handIdx, 1);
    blocked.attachedTo = null;
    discardCardToPlayerZone(draft.players[playerId], blocked);
    events.push({ type: 'cardMoved', instanceId: blocked.instanceId, from: 'hand', to: 'discard', playerId });
  }
  events.push({
    type: 'trainerPlayBlocked',
    playerId,
    instanceId: card.instanceId,
    name: card.name || '',
    source: chaos.source,
  });
  const oppId = Object.keys(draft.players || {}).find((id) => id !== playerId);
  if (oppId && !isPokemonToolCard(card)) {
    const offer = executeSteps(draft, {
      steps: [{ type: 'useOpponentDiscardTrainer', instanceId: card.instanceId }],
      effectType: 'trainer',
      sourceCard: card,
      playerId: oppId,
      activeRng,
      events,
    });
    if (offer.pendingChoice) draft.pendingChoice = offer.pendingChoice;
  }
  return true;
}

/**
 * A Trainer that took the player's last Prize card (Missing Clover's 4-card mode, I190) wins the
 * game once its effect has fully resolved: Peonia-style swaps put Prizes back before that.
 */
export function settleTrainerPrizeWin(draft, { playerId, events }) {
  if (draft.pendingChoice || isGameConcluded(draft)) return;
  if (!events.some((e) => e.type === 'prizeTaken' && e.playerId === playerId)) return;
  if ((draft.players?.[playerId]?.zones?.prizes || []).length > 0) return;
  setGameEnded(draft, { winner: playerId, reason: 'all prize cards taken', events });
}

/**
 * "… Your turn ends." Trainers end the turn once their effect has fully resolved (no choice
 * pending), unless an Ability exempts that card (Alcremie Additional Order, design 034 slice 6).
 * A coin branch can request the same ending ("If tails, your turn ends immediately": I155).
 */
export function endTurnAfterTrainer(draft, { card, playerId, activeRng, events }) {
  if (!card || draft.pendingChoice) return;
  const conditionalEnd = events.some(
    (e) => e.type === 'turnEndRequested' && e.playerId === playerId
  );
  if (!trainerEndsTurn(card) && !conditionalEnd) return;
  if (draft.turn?.player !== playerId) return;
  if (abilityTurnNotEnd(card, abilitySideContext(draft, playerId))) {
    events.push({ type: 'turnEndPrevented', playerId, instanceId: card.instanceId });
    return;
  }
  endTurnFromEffect(draft, { playerId, activeRng, events });
}

/**
 * The client plays an Item or Supporter by dropping it hand -> 'board', which it sends as a
 * plain moveCard (it has no reliable card type at the drop site). Rewriting that move to
 * playTrainer here, from the server's own card data, is what makes the effect run; deciding
 * it server-side also means a client cannot place a Trainer while skipping its effect.
 * A Tool dropped on the board asks which Pokémon to attach to; a Stadium goes to the Stadium zone.
 *
 * @param {object} state GameState
 * @param {object} command Shape-valid command envelope
 * @returns {object} The playTrainer command, or the original command unchanged
 */
export function trainerEffectText(card) {
  return String(card.text || card.effect || card.cardText || '').trim();
}

export function promoteTrainerPlay(state, command) {
  if (!state.rulesEnabled) return command;
  const { type, payload, playerId } = command;
  if (
    type !== 'moveCard' ||
    payload.from !== 'hand' ||
    payload.to !== 'board'
  ) {
    return command;
  }
  const cardRef = findCard(state, payload.instanceId);
  if (!cardRef || cardRef.zoneId !== 'hand' || cardRef.playerId !== playerId) {
    return command;
  }
  const card = cardRef.card;
  const kind =
    `${card.type || ''} ${card.trainerType || ''} ${card.subtypes || ''}`.toLowerCase();
  if (!isTrainer(card) && !/item|supporter/.test(kind)) return command;
  // Effect text arrives later via cardStats. Until it does, playTrainer would find no steps
  // and discard the card, so reject the drop until cardStats arrives. A Tool or Stadium
  // needs no text: playTrainer attaches the Tool or places the Stadium.
  if (!/tool|stadium/.test(kind) && !trainerEffectText(card)) {
    return { ...command, pendingDataReason: 'card_data_pending' };
  }
  return {
    ...command,
    type: 'playTrainer',
    payload: { instanceId: payload.instanceId },
  };
}

export function playTrainerCommand({ draft, payload, playerId, activeRng, events }) {
  const cardRef = findCard(draft, payload.instanceId);
  if (cardRef) {
    if (chaosGymBlocks(draft, { card: cardRef.card, playerId, activeRng, events })) return;
    executeTrainer(draft, {
      card: cardRef.card,
      playerId,
      activeRng,
      events,
      targetInstanceId: payload.targetInstanceId,
    });
    settleTrainerPrizeWin(draft, { playerId, events });
    endTurnAfterTrainer(draft, { card: cardRef.card, playerId, activeRng, events });
  }
}

export function stadiumEffectCommand({ draft, playerId, activeRng, events }) {
  const result = executeStadium(draft, {
    playerId,
    activeRng,
    events,
  });
  // Lost World: the activation can win the game outright.
  if (result?.gameWinner && !result.pendingChoice) {
    setGameEnded(draft, {
      winner: result.gameWinner,
      reason: result.gameReason || 'stadium effect',
      events,
    });
  } else if (result?.turnEnds && !result.pendingChoice) {
    // Lumiose City: the activation ends the turn once it resolves.
    endTurnFromEffect(draft, { playerId, activeRng, events });
  }
}
