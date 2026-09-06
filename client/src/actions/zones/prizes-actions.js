import { systemState } from '../../state.js';
import { appendMessage } from '../../setup/chatbox/append-message.js';
import { determineUsername } from '../../setup/general/determine-username.js';
import { processAction } from '../../setup/general/process-action.js';
import { shuffleIndices } from '../../setup/general/shuffle.js';
import { getZone } from '../../setup/zones/get-zone.js';
import { moveCard } from '../move-card-bundle/move-card.js';
import { shuffleZone } from './shuffle-zone.js';

/**
 * Take N prize cards into the player's hand (face-down).
 * Called automatically after a KO, or triggered via the "Take Prizes" button.
 * Moves `count` cards from the user's prizes zone into their hand.
 */
export const takePrizes = (
  user,
  initiator,
  count = 1,
  emit = true
) => {
  const oInitiator = initiator === 'self' ? 'opp' : 'self';
  if (user === 'opp' && emit && systemState.isTwoPlayer) {
    processAction(user, emit, 'takePrizes', [oInitiator, count]);
    return;
  }

  const prizeZone = getZone(user, 'prizes');
  count = Math.min(count, prizeZone.getCount());
  if (count <= 0) {
    appendMessage(initiator, 'No prize cards left to take.', 'announcement', false);
    return;
  }

  for (let i = 0; i < count; i++) {
    moveCard(user, initiator, 'prizes', 'hand', 0);
  }

  const who = determineUsername(initiator);
  appendMessage(
    initiator,
    who + (count === 1 ? ' took a prize card.' : ' took ' + count + ' prize cards.'),
    'announcement',
    false
  );

  processAction(user, emit, 'takePrizes', [oInitiator, count]);
};

/**
 * Take SPECIFIC prize cards (by index) into the player's hand. Used when the
 * player chooses which of their prize cards to take on a KO, instead of the
 * automatic "take the top N" behavior of `takePrizes`.
 * `indices` is an array of 0-based indices into the user's prizes zone.
 */
export const takePrizesByIndex = (
  user,
  initiator,
  indices,
  emit = true
) => {
  const oInitiator = initiator === 'self' ? 'opp' : 'self';
  if (user === 'opp' && emit && systemState.isTwoPlayer) {
    processAction(user, emit, 'takePrizesByIndex', [oInitiator, indices]);
    return;
  }

  if (!Array.isArray(indices)) indices = [0];
  indices = indices
    .filter((i) => Number.isInteger(i) && i >= 0)
    .sort((a, b) => b - a); // remove from the back so lower indices stay valid

  const prizeZone = getZone(user, 'prizes');
  if (indices.length === 0) {
    appendMessage(initiator, 'No prize cards left to take.', 'announcement', false);
    return;
  }
  const count = Math.min(indices.length, prizeZone.getCount());

  for (let k = 0; k < count; k++) {
    moveCard(user, initiator, 'prizes', 'hand', indices[k]);
  }

  const who = determineUsername(initiator);
  appendMessage(
    initiator,
    who + (count === 1 ? ' took a prize card.' : ' took ' + count + ' prize cards.'),
    'announcement',
    false
  );

  processAction(user, emit, 'takePrizesByIndex', [oInitiator, indices]);
};

export const shufflePrizesToDeckBottom = (
  user,
  initiator,
  indices,
  emit = true
) => {
  const oInitiator = initiator === 'self' ? 'opp' : 'self';
  if (user === 'opp' && emit && systemState.isTwoPlayer) {
    processAction(user, emit, 'shufflePrizesToDeckBottom', [
      oInitiator,
      indices,
    ]);
    return;
  }

  const prizeCount = getZone(user, 'prizes').getCount();
  if (prizeCount === 0) return;

  indices = indices ? indices : shuffleIndices(prizeCount);
  shuffleZone(user, initiator, 'prizes', indices, false, false);

  for (let i = 0; i < prizeCount; i++) {
    moveCard(user, initiator, 'prizes', 'deck', 0);
  }

  appendMessage(
    initiator,
    determineUsername(initiator) + ' shuffled prizes to bottom of deck',
    'player',
    false
  );

  processAction(user, emit, 'shufflePrizesToDeckBottom', [oInitiator, indices]);
};
