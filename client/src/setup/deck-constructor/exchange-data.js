import { reset } from '../../actions/general/reset.js';
import { systemState } from '../../state.js';
import { appendMessage } from '../chatbox/append-message.js';
import { processAction } from '../general/process-action.js';
import { deckDataEquals } from '../general/sync-action-args.mjs';
import { changePlaymat, getStoredMatId } from '../sizing/apply-mat-layout.js';

export const exchangeData = (
  user,
  username,
  deckData,
  cardBack,
  coachingMode,
  callback = true,
  matId = null,
  emit = true
) => {
  const flipBoardButton = document.getElementById('flipBoardButton');
  const coachingModeCheckbox = document.getElementById('coachingModeCheckbox');

  if (user === 'self') {
    systemState.selfDeckData = deckData;
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
    if (matId) changePlaymat('opp', matId, false);
    if (coachingModeCheckbox.checked && coachingMode) {
      systemState.coachingMode = true;
      flipBoardButton.style.display = 'inline-block';
    }
    if (opponentChanged) {
      appendMessage(
        '',
        systemState.p2OppUsername + ' joined',
        'announcement',
        false
      );
      reset('opp', true, true, false, false);
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
  ]);
};
