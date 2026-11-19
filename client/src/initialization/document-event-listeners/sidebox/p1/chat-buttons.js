import { attack, retreat, stadiumEffect } from '../../../../actions/chat-buttons/chat-buttons.js';
import { undo } from '../../../../actions/general/undo.js';
import { systemState } from '../../../../state.js';
import { appendMessage } from '../../../../setup/chatbox/append-message.js';
import { determineUsername } from '../../../../setup/general/determine-username.js';
import { wireButtonCues } from '../../../../setup/netcode/mat-fx/ui-cue.mjs';
import { rulesState } from '/shared/engine/rules/rules-state.mjs';
import { getZone } from '../../../../setup/zones/get-zone.js';
import { getActivePokemonCard } from '/shared/engine/zones/active-pokemon.mjs';
import { openActiveAttackOverlay } from '../../../../setup/image-logic/click-events.js';

export const initializeP1ChatButtons = () => {
  const attackButton = document.getElementById('attackButton');
  attackButton.addEventListener('click', () => {
    const user = systemState.isTwoPlayer ? systemState.initiator : 'self';
    // Design 074 A3: rules mode opens the same TCG Live AttackOverlay a tap on the Active opens,
    // rather than attacking directly. One surface, one gesture.
    if (rulesState.enabled) {
      const active = getActivePokemonCard(getZone(user, 'active'));
      if (active?.image && openActiveAttackOverlay(active, systemState.initiator)) return;
    }
    attack(user);
  });

  const retreatButton = document.getElementById('retreatButton');
  retreatButton.addEventListener('click', () => retreat(systemState.initiator));

  const stadiumButton = document.getElementById('stadiumButton');
  stadiumButton.addEventListener('click', () => stadiumEffect(systemState.initiator));

  const messageInput = document.getElementById('messageInput');
  messageInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const message = messageInput.value.trim();
      if (message !== '') {
        appendMessage(
          systemState.initiator,
          determineUsername(systemState.initiator) + ': ' + message,
          'message'
        );
        messageInput.value = '';
      }
    }
  });

  const undoButton = document.getElementById('undoButton');
  undoButton.addEventListener('click', () => {
    undo(systemState.initiator);
  });

  const FREEBUTTON = document.getElementById('FREEBUTTON');
  FREEBUTTON.addEventListener('click', () => {
    appendMessage(systemState.initiator, FREEBUTTON.textContent, 'player');
  });

  wireButtonCues(['attackButton'], { key: 'attack-button' });
  wireButtonCues([
    'retreatButton',
    'stadiumButton',
    'undoButton',
    'FREEBUTTON',
  ]);
};
