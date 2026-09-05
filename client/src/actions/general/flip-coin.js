import { appendMessage } from '../../setup/chatbox/append-message.js';
import { determineUsername } from '../../setup/general/determine-username.js';
import { flipBoardCoin } from '../../setup/rules/mat-coin.js';

export const flipCoin = async (initiator, result) => {
  const coinFlipResult = await flipBoardCoin(initiator, result);
  const message = determineUsername(initiator) + ' flipped ' + coinFlipResult;
  appendMessage(initiator, message, 'player');
};
