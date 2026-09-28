import { attack, pass, retreat, stadiumEffect } from '../../../../actions/chat-buttons/chat-buttons.js';
import { wireEndTurnButton } from '../../../../setup/general/end-turn-button.mjs';
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

export const initializeP2ChatButtons = () => {
  const getP2User = () => (systemState.isTwoPlayer ? systemState.initiator : 'opp');

  const p2AttackButton = document.getElementById('p2AttackButton');
  p2AttackButton.addEventListener('click', () => {
    const user = getP2User();
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
            retreat(getP2User());
          },
        });
        return;
      }
    }
    attack(user);
  });

  const p2RetreatButton = document.getElementById('p2RetreatButton');
  p2RetreatButton.addEventListener('click', () => retreat(getP2User()));

  const p2StadiumButton = document.getElementById('p2StadiumButton');
  p2StadiumButton.addEventListener('click', () => stadiumEffect(getP2User()));

  const p2PassButton = document.getElementById('p2PassButton');
  p2PassButton.addEventListener('click', () => pass(getP2User()));
  wireEndTurnButton(document);

  const p2MessageInput = document.getElementById('p2MessageInput');
  p2MessageInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const message = p2MessageInput.value.trim();
      if (message !== '') {
        const isSpectator =
          systemState.isTwoPlayer &&
          document.getElementById('spectatorModeCheckbox').checked;
        const type = isSpectator ? 'spectator-message' : 'player';
        const username = isSpectator
          ? systemState.spectatorUsername
          : determineUsername(systemState.initiator);
        appendMessage(systemState.initiator, username + ': ' + message, type);
        p2MessageInput.value = '';
      }
    }
  });

  // const p2UndoButton = document.getElementById('p2UndoButton');
  // p2UndoButton.addEventListener('click', () => {
  //     undo(systemState.initiator);
  // });

  const p2FREEBUTTON = document.getElementById('p2FREEBUTTON');
  p2FREEBUTTON.addEventListener('click', () => {
    const isSpectator =
      systemState.isTwoPlayer &&
      document.getElementById('spectatorModeCheckbox').checked;
    const type = isSpectator ? 'spectator-message' : 'player';
    appendMessage(systemState.initiator, p2FREEBUTTON.textContent, type);
  });
};
