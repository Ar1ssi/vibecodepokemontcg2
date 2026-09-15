import { attack, attachAbility, healAbility, retreat, searchAbility, stadiumEffect, switchAbility, energyRedirectAbility } from '../../../../actions/chat-buttons/chat-buttons.js';
import { abilityPicker } from '../../../../actions/ability-picker.js';
import { undo } from '../../../../actions/general/undo.js';
import { systemState } from '../../../../state.js';
import { appendMessage } from '../../../../setup/chatbox/append-message.js';
import { determineUsername } from '../../../../setup/general/determine-username.js';
import { rulesState } from '/shared/engine/rules/rules-state.mjs';
import { getZone } from '../../../../setup/zones/get-zone.js';
import { getActivePokemonCard } from '/shared/engine/zones/active-pokemon.mjs';
import { openAttackPreview } from '../../../../setup/rules/attack-preview.js';

export const initializeP1ChatButtons = () => {
  const attackButton = document.getElementById('attackButton');
  attackButton.addEventListener('click', () => {
    const user = systemState.isTwoPlayer ? systemState.initiator : 'self';
    // Design 008 (Component 7): rules mode routes through the same TCG
    // Live-style preview a card click opens, rather than attacking directly.
    if (rulesState.enabled) {
      const active = getActivePokemonCard(getZone(user, 'active'));
      if (active?.image) {
        openAttackPreview(active, active.image, { zone: 'active' });
        return;
      }
    }
    attack(user);
  });

  const retreatButton = document.getElementById('retreatButton');
  retreatButton.addEventListener('click', () => retreat(systemState.initiator));

  const healButton = document.getElementById('healButton');
  healButton.addEventListener('click', () => healAbility(systemState.initiator));

  const switchButton = document.getElementById('switchButton');
  switchButton.addEventListener('click', () => switchAbility(systemState.initiator));

  const attachButton = document.getElementById('attachButton');
  attachButton.addEventListener('click', () => attachAbility(systemState.initiator));

  const searchButton = document.getElementById('searchButton');
  searchButton.addEventListener('click', () => searchAbility(systemState.initiator));

  const abilityButton = document.getElementById('abilityButton');
  abilityButton.addEventListener('click', () => abilityPicker(systemState.initiator));

  const stadiumButton = document.getElementById('stadiumButton');
  stadiumButton.addEventListener('click', () => stadiumEffect(systemState.initiator));

  const energyRedirectButton = document.getElementById('energyRedirectButton');
  energyRedirectButton.addEventListener('click', () => energyRedirectAbility(systemState.initiator));

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
