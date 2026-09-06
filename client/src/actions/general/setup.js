import { systemState } from '../../state.js';
import { appendMessage } from '../../setup/chatbox/append-message.js';
import { determineDeckData } from '../../setup/general/determine-deckdata.js';
import { determineUsername } from '../../setup/general/determine-username.js';
import { processAction } from '../../setup/general/process-action.js';
import { shuffleIndices } from '../../setup/general/shuffle.js';
import { getZone } from '../../setup/zones/get-zone.js';
import { drawHand, setOpeningPrizes } from '../zones/hand-actions.js';
import { shuffleZone } from '../zones/shuffle-zone.js';
import { reset } from './reset.js';

export const setup = async (user, indices, emit = true) => {
  if (user === 'opp' && emit && systemState.isTwoPlayer) {
    processAction(user, emit, 'setup', [indices]);
    return;
  }
  // Only wipe/rebuild when we have a serialized list. A 2P setup action can
  // arrive before exchangeData; resetting then would empty the live deck and
  // skip prizes. Deal from the cards already on the mat in that case.
  if (determineDeckData(user)) {
    reset(user, true, true, true, false);
  }
  const deck = getZone(user, 'deck');
  indices = indices ? indices : shuffleIndices(deck.getCount());
  if (deck.getCount() > 0) {
    shuffleZone(user, user, 'deck', indices, false, false);
    await drawHand(user, user);
    appendMessage(
      user,
      determineUsername(user) + ' drew starting hand and set prizes',
      'player',
      false
    );
  }
  processAction(user, emit, 'setup', [indices]);
};

// Rules-mode setup step 1: shuffle deck and set prize cards only.
// Opening hands are drawn after the turn-order coin flip (rules-bridge).
export const setupPrizes = async (user, indices, emit = true) => {
  if (user === 'opp' && emit && systemState.isTwoPlayer) {
    processAction(user, emit, 'setupPrizes', [indices]);
    return;
  }
  // Only wipe/rebuild when we have a serialized list. A 2P setup action can
  // arrive before exchangeData; resetting then would empty the live deck and
  // skip prizes. Deal from the cards already on the mat in that case.
  if (determineDeckData(user)) {
    reset(user, true, true, true, false);
  }
  const deck = getZone(user, 'deck');
  indices = indices ? indices : shuffleIndices(deck.getCount());
  if (deck.getCount() > 0) {
    shuffleZone(user, user, 'deck', indices, false, false);
    await setOpeningPrizes(user, user);
    appendMessage(
      user,
      determineUsername(user) + ' set prizes',
      'player',
      false
    );
  }
  processAction(user, emit, 'setupPrizes', [indices]);
};
