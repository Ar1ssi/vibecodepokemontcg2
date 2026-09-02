import { attack, attachAbility, healAbility, pass, retreat, searchAbility, stadiumEffect, switchAbility, energyRedirectAbility } from '../../../../actions/chat-buttons/chat-buttons.js';
import { systemState } from '../../../../front-end.js';
import { appendMessage } from '../../../../setup/chatbox/append-message.js';
import { determineUsername } from '../../../../setup/general/determine-username.js';

export const initializeP2ChatButtons = () => {
  const p2AttackButton = document.getElementById('p2AttackButton');
  p2AttackButton.addEventListener('click', () => attack(systemState.initiator));

  const p2RetreatButton = document.getElementById('p2RetreatButton');
  p2RetreatButton.addEventListener('click', () => retreat(systemState.initiator));

  const p2HealButton = document.getElementById('p2HealButton');
  p2HealButton.addEventListener('click', () => healAbility(systemState.initiator));

  const p2SwitchButton = document.getElementById('p2SwitchButton');
  p2SwitchButton.addEventListener('click', () => switchAbility(systemState.initiator));

  const p2AttachButton = document.getElementById('p2AttachButton');
  p2AttachButton.addEventListener('click', () => attachAbility(systemState.initiator));

  const p2SearchButton = document.getElementById('p2SearchButton');
  p2SearchButton.addEventListener('click', () => searchAbility(systemState.initiator));

  const p2StadiumButton = document.getElementById('p2StadiumButton');
  p2StadiumButton.addEventListener('click', () => stadiumEffect(systemState.initiator));

  const p2EnergyRedirectButton = document.getElementById('p2EnergyRedirectButton');
  p2EnergyRedirectButton.addEventListener('click', () =>
    energyRedirectAbility(systemState.initiator)
  );

  const p2PassButton = document.getElementById('p2PassButton');
  p2PassButton.addEventListener('click', () => pass(systemState.initiator));

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
