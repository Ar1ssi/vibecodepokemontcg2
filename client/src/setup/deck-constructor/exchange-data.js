import { reset } from '../../actions/general/reset.js';
import { systemState } from '../../state.js';
import { appendMessage } from '../chatbox/append-message.js';
import { processAction } from '../general/process-action.js';
import { changePlaymat, getStoredMatId } from '../sizing/apply-mat-layout.js';

export const exchangeData = (
  user,
  username,
  deckData,
  cardBack,
  coachingMode,
  callback = true,
  emit = true,
  matId = null
) => {
  const flipBoardButton = document.getElementById('flipBoardButton');
  const coachingModeCheckbox = document.getElementById('coachingModeCheckbox');

  if (user === 'self') {
    if (callback) {
      appendMessage(
        '',
        systemState.p2SelfUsername + ' joined',
        'announcement',
        false
      );
    }
    systemState.selfDeckData = deckData;
    reset('self', true, true, false, false);
  } else if (user === 'opp') {
    systemState.p2OppUsername = username;
    systemState.p2OppDeckData = deckData;
    systemState.p2OppCardBackSrc = cardBack;
    if (matId) changePlaymat('opp', matId, false);
    if (coachingModeCheckbox.checked && coachingMode) {
      systemState.coachingMode = true;
      flipBoardButton.style.display = 'inline-block';
    }
    appendMessage(
      '',
      systemState.p2OppUsername + ' joined',
      'announcement',
      false
    );
    reset('opp', true, true, false, false);

    if (callback) {
      exchangeData(
        'self',
        systemState.p2SelfUsername,
        systemState.selfDeckData,
        systemState.cardBackSrc,
        coachingModeCheckbox.checked,
        false,
        true,
        getStoredMatId('self')
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
