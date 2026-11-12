import { reset } from '../../actions/general/reset.js';
import { systemState } from '../../state.js';
import { appendMessage } from '../chatbox/append-message.js';
import { cleanActionData } from '../general/clean-action-data.js';
import { handleSpectatorButtons } from './handle-spectator-buttons.js';
import { forceRulesEnabledForMultiplayer } from '../rules/rules-bridge.js';

export const spectatorJoin = () => {
  const connectedRoom = document.getElementById('connectedRoom');
  const lobby = document.getElementById('lobby');
  const roomHeaderText = document.getElementById('roomHeaderText');
  const chatbox = document.getElementById('chatbox');
  const p2ExplanationBox = document.getElementById('p2ExplanationBox');
  document.getElementById('importState').style.display = 'none';
  roomHeaderText.textContent = 'id: ' + systemState.roomId;
  chatbox.innerHTML = '';
  connectedRoom.style.display = 'flex';
  lobby.style.display = 'none';
  p2ExplanationBox.style.display = 'none';
  systemState.isTwoPlayer = true;
  forceRulesEnabledForMultiplayer();
  cleanActionData('self');
  cleanActionData('opp');
  reset('self', true, false, false, false);
  reset('opp', true, false, false, false);

  handleSpectatorButtons();

  systemState.spectatorUsername = systemState.p2SelfUsername;

  appendMessage(
    '',
    systemState.spectatorUsername + ' joined',
    'announcement',
    true
  );
};
