import { systemState } from '../../state.js';
import { appendMessage } from '../../setup/chatbox/append-message.js';
import { processAction } from '../../setup/general/process-action.js';
import { reset } from './reset.js';

// Full match restart: clear both boards, rebuild decks, and reset rules state.
export const restartGame = (user = 'self', emit = true) => {
  if (user === 'opp' && emit && systemState.isTwoPlayer) {
    processAction(user, emit, 'restartGame', []);
    return;
  }

  // Design 012: the server owns the game, so a local wipe alone leaves it running and the
  // next view repaints the old board. A player-requested reset (reset.js with clean ===
  // false) restarts the server game for both seats; its `gameReset` reply fires
  // 'game-restarted' on both clients.
  if (systemState.serverAuthoritative && systemState.isTwoPlayer) {
    reset('self');
    appendMessage('', 'Game restarted.', 'announcement', true);
    return;
  }

  reset('self', true, true, true, false);
  reset('opp', true, true, true, false);
  document.dispatchEvent(new CustomEvent('game-restarted'));
  appendMessage('', 'Game restarted.', 'announcement', false);
};
