import { systemState } from '../../front-end.js';
import { appendMessage } from '../../setup/chatbox/append-message.js';
import { determineUsername } from '../../setup/general/determine-username.js';
import { processAction } from '../../setup/general/process-action.js';
import { setup } from './setup.js';

// Reflects the current readiness state on the Set Up button(s) so a player
// can see whether they've readied up and are waiting on their opponent.
export const updateReadyButtons = () => {
  const mySideKey =
    systemState.initiator === 'self' ? 'selfReady' : 'oppReady';
  const iAmReady = systemState[mySideKey];

  ['setupButton', 'p2SetupButton'].forEach((id) => {
    const button = document.getElementById(id);
    if (!button) {
      return;
    }
    if (iAmReady) {
      button.textContent = 'Waiting for opponent...';
      button.disabled = true;
    } else {
      button.textContent = 'Set Up';
      button.disabled = false;
    }
  });
};

// Clears the ready flag for a given side. Used by Reset so that resetting
// a side that had already readied up doesn't leave a stale ready state
// blocking (or prematurely triggering) the next game's setup.
export const clearReady = (user) => {
  const readyKey = user === 'self' ? 'selfReady' : 'oppReady';
  if (systemState[readyKey]) {
    systemState[readyKey] = false;
    updateReadyButtons();
  }
};

// Called when a player presses their Set Up button. Rather than drawing a
// hand and setting prizes immediately, this marks that player as "ready".
// Once both players have pressed their Set Up button, the game
// automatically sets 6 prizes and draws an opening hand of 7 for both
// players.
export const readyUp = (user, emit = true) => {
  if (user === 'opp' && emit && systemState.isTwoPlayer) {
    processAction(user, emit, 'readyUp', []);
    return;
  }

  const readyKey = user === 'self' ? 'selfReady' : 'oppReady';
  if (systemState[readyKey]) {
    // already marked ready -- ignore repeat clicks/syncs
    return;
  }

  systemState[readyKey] = true;
  appendMessage(user, determineUsername(user) + ' is ready', 'player', false);
  updateReadyButtons();
  processAction(user, emit, 'readyUp', []);

  if (systemState.selfReady && systemState.oppReady) {
    systemState.selfReady = false;
    systemState.oppReady = false;
    appendMessage(
      '',
      'Both players are ready -- setting prizes and drawing opening hands!',
      'announcement',
      false
    );
    setup('self');
    if (!systemState.isTwoPlayer) {
      // In solo/one-player mode there's no separate opponent client to
      // trigger the mirrored setup, so do it locally for both sides.
      setup('opp');
    }
    updateReadyButtons();
    // Let other systems (e.g. the rules engine's turn-order coin flip)
    // know that setup has actually happened, rather than reacting to the
    // raw Set Up click (which now just marks readiness).
    document.dispatchEvent(new CustomEvent('both-players-ready'));
  }
};
