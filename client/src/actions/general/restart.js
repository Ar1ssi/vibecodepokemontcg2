import { systemState } from '../../state.js';
import { appendMessage } from '../../setup/chatbox/append-message.js';
import { processAction } from '../../setup/general/process-action.js';
import { reset } from './reset.js';

// Full match restart: clear both boards, rebuild decks, and reset rules state.
export const restartGame = (_user, emit = true) => {
  if (emit && systemState.isTwoPlayer) {
    processAction('self', emit, 'restartGame', []);
    return;
  }

  reset('self', true, true, true, false);
  reset('opp', true, true, true, false);
  document.dispatchEvent(new CustomEvent('game-restarted'));
  appendMessage('', 'Game restarted.', 'announcement', false);
};
