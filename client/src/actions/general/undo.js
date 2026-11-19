import { systemState } from '../../state.js';
import { appendMessage } from '../../setup/chatbox/append-message.js';
import { determineUsername } from '../../setup/general/determine-username.js';
import { processAction } from '../../setup/general/process-action.js';
import { refuseWithoutRoom } from '../../setup/netcode/authoritative-dispatch.js';

// The server replays its command log minus the tail from a fresh state (design 002 slice 3.4e),
// so undo here is one command plus the chat line; the client keeps no replay of its own.
export const undo = (user, filteredActionData, emit = true) => {
  // The opponent's undo is theirs to perform: relay it and leave this client's board alone.
  if (user === 'opp' && emit && systemState.isTwoPlayer && !systemState.solo) {
    processAction(user, emit, 'undo', [filteredActionData]);
    return;
  }

  if (emit && refuseWithoutRoom({ action: 'undo' })) return;

  appendMessage(
    '',
    determineUsername(user) + ' took back their last move!',
    'announcement',
    false
  );
  processAction(user, emit, 'undo', [filteredActionData]);
};
