import { systemState } from '../../state.js';
import { appendMessage } from '../../setup/chatbox/append-message.js';
import { determineUsername } from '../../setup/general/determine-username.js';
import { processAction } from '../../setup/general/process-action.js';
import { shuffleIndices } from '../../setup/general/shuffle.js';
import { getZone } from '../../setup/zones/get-zone.js';
import { moveCard } from '../move-card-bundle/move-card.js';
import { shuffleZone } from '../zones/shuffle-zone.js';
import { dispatchAuthoritativeZoneOp } from '../../setup/netcode/authoritative-dispatch.js';

// Moves every card on the board zone to `destZoneId` (discardBoard, handBoard, lostZoneBoard).
const moveBoardTo =
  (actionName, destZoneId, destLabel) =>
  (user, initiator, message = true, emit = true) => {
    const oInitiator = initiator === 'self' ? 'opp' : 'self';
    if (user === 'opp' && emit && systemState.isTwoPlayer && !systemState.solo) {
      processAction(user, emit, actionName, [oInitiator, message]);
      return;
    }

    if (
      dispatchAuthoritativeZoneOp(actionName, {
        user,
        emit,
        oInitiator,
        commandArgs: [message],
      })
    )
      return;

    const selectedBoardCount = getZone(user, 'board').getCount();
    if (selectedBoardCount > 0) {
      for (let i = 0; i < selectedBoardCount; i++) {
        moveCard(user, initiator, 'board', destZoneId, 0);
      }
      if (message) {
        appendMessage(
          initiator,
          determineUsername(initiator) +
            ' moved ' +
            selectedBoardCount +
            ' card(s) from board to ' +
            destLabel,
          'player',
          false
        );
      }
    }

    processAction(user, emit, actionName, [oInitiator, message]);
  };

export const discardBoard = moveBoardTo('discardBoard', 'discard', 'discard');

export const handBoard = moveBoardTo('handBoard', 'hand', 'hand');

export const shuffleBoard = (
  user,
  initiator,
  message = true,
  indices,
  emit = true
) => {
  const oInitiator = initiator === 'self' ? 'opp' : 'self';
  if (user === 'opp' && emit && systemState.isTwoPlayer && !systemState.solo) {
    processAction(user, emit, 'shuffleBoard', [oInitiator, message, indices]);
    return;
  }

  if (
    dispatchAuthoritativeZoneOp('shuffleBoard', {
      user,
      emit,
      oInitiator,
      commandArgs: [message, indices],
    })
  )
    return;

  const selectedBoardCount = getZone(user, 'board').getCount();
  const deck = getZone(user, 'deck');

  if (selectedBoardCount > 0) {
    for (let i = 0; i < selectedBoardCount; i++) {
      moveCard(user, initiator, 'board', 'deck', 0);
    }
    indices = indices ? indices : shuffleIndices(deck.getCount());
    shuffleZone(user, initiator, 'deck', indices, false, false);
    if (message) {
      appendMessage(
        initiator,
        determineUsername(initiator) +
          ' shuffled ' +
          selectedBoardCount +
          ' card(s) from board to deck',
        'player',
        false
      );
    }
  }

  processAction(user, emit, 'shuffleBoard', [oInitiator, message, indices]);
};

export const lostZoneBoard = moveBoardTo('lostZoneBoard', 'lostZone', 'lost zone');
