import { attack, retreat, stadiumEffect } from '../../../../actions/chat-buttons/chat-buttons.js';
import { undo } from '../../../../actions/general/undo.js';
import { systemState } from '../../../../state.js';
import { appendMessage } from '../../../../setup/chatbox/append-message.js';
import { determineUsername } from '../../../../setup/general/determine-username.js';
import { rulesState } from '/shared/engine/rules/rules-state.mjs';
import { getZone } from '../../../../setup/zones/get-zone.js';
import { getActivePokemonCard } from '/shared/engine/zones/active-pokemon.mjs';
import {
  openCardInspector,
  closeCardInspector,
} from '../../../../setup/rules/card-inspector.mjs';

export const initializeP1ChatButtons = () => {
  const attackButton = document.getElementById('attackButton');
  attackButton.addEventListener('click', () => {
    const user = systemState.isTwoPlayer ? systemState.initiator : 'self';
    // D50 (design 013, was 008 Component 7): rules mode opens the same inspector a double-click
    // on the card opens, rather than attacking directly. One surface, one gesture.
    if (rulesState.enabled) {
      const active = getActivePokemonCard(getZone(user, 'active'));
      if (active?.image) {
        openCardInspector({
          card: active,
          onAttack: (index) => {
            closeCardInspector();
            attack(rulesState.turnPlayer, true, index);
          },
          onRetreat: () => {
            closeCardInspector();
            retreat(systemState.initiator);
          },
        });
        return;
      }
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
};
