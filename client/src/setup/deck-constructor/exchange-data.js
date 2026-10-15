import { reset } from '../../actions/general/reset.js';
import { systemState } from '../../state.js';
import { appendMessage } from '../chatbox/append-message.js';
import { processAction } from '../general/process-action.js';
import { shouldResetBoardOnDeckData } from './opp-board-reset.mjs';
import { deckDataEquals } from '../general/sync-action-args.mjs';
import { changePlaymat, getStoredMatId } from '../sizing/apply-mat-layout.js';
import { resolveDeckPacketTail } from './deck-box-args.mjs';
import { deckBoxes } from '../netcode/mat-fx/deck-box-state.mjs';

export const exchangeData = (
  user,
  username,
  deckData,
  cardBack,
  coachingMode,
  callback = true,
  matId = null,
  format,
  deckBoxArg,
  emitArg
) => {
  const { format: deckFormat, emit, deckBoxId } = resolveDeckPacketTail(format, deckBoxArg, emitArg);
  const flipBoardButton = document.getElementById('flipBoardButton');
  const coachingModeCheckbox = document.getElementById('coachingModeCheckbox');

  if (user === 'self') {
    systemState.selfDeckData = deckData;
    systemState.deckFormat.self = deckFormat;
    if (emit) {
      reset('self', true, true, false, false);
    }
  } else if (user === 'opp') {
    const opponentChanged =
      systemState.p2OppUsername !== username ||
      !deckDataEquals(systemState.p2OppDeckData, deckData);
    systemState.p2OppUsername = username;
    systemState.p2OppDeckData = deckData;
    systemState.p2OppCardBackSrc = cardBack;
    systemState.deckFormat.p2Opp = deckFormat;
    if (matId) changePlaymat('opp', matId, false);
    // Design 073: a packet from before deck boxes names none; the opponent keeps the box it shows.
    if (deckBoxId !== undefined) deckBoxes.setId('opp', deckBoxId);
    if (coachingModeCheckbox.checked && coachingMode) {
      systemState.coachingMode = true;
      flipBoardButton.style.display = 'inline-block';
    }
    if (opponentChanged) {
      deckBoxes.clearDealt(['opp']);
      appendMessage(
        '',
        systemState.p2OppUsername + ' joined',
        'announcement',
        false
      );
      if (shouldResetBoardOnDeckData('opp', systemState)) {
        reset('opp', true, true, false, false);
      }
    }

    // Only the originating client should chain a response; mirror/resync replays
    // arrive with emit=false and must not send a second exchange or reset ready state.
    if (callback && emit) {
      exchangeData(
        'self',
        systemState.p2SelfUsername,
        systemState.selfDeckData,
        systemState.cardBackSrc,
        coachingModeCheckbox.checked,
        false,
        getStoredMatId('self'),
        systemState.deckFormat.self,
        deckBoxes.idFor('self'),
        true
      );
    }
  }

  processAction(user, emit, 'exchangeData', [
    username,
    deckData,
    cardBack,
    coachingMode,
    callback,
    matId,
    deckFormat,
    deckBoxes.idFor(user),
  ]);
};
