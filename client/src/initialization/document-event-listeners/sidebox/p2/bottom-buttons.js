import { reset } from '../../../../actions/general/reset.js';
import { readyUp, updateReadyButtons } from '../../../../actions/general/ready.js';
import { systemState } from '../../../../state.js';
import { wireButtonCues } from '../../../../setup/netcode/mat-fx/ui-cue.mjs';
import { hideOptionsContextMenu } from '../../../../setup/chatbox/hide-options-context-menu.js';

export const initializeP2BottomButtons = () => {
  const optionsContextMenu = document.getElementById('optionsContextMenu');
  const p2Box = document.getElementById('p2Box');

  const p2SetupButton = document.getElementById('p2SetupButton');
  p2SetupButton.addEventListener('click', () =>
    readyUp(systemState.initiator)
  );

  updateReadyButtons();
  wireButtonCues(['p2SetupButton', 'p2ResetButton', 'p2OptionsButton']);

  const p2ResetButton = document.getElementById('p2ResetButton');
  p2ResetButton.addEventListener('click', () => reset(systemState.initiator));

  const p2OptionsButton = document.getElementById('p2OptionsButton');
  p2OptionsButton.addEventListener('click', () => {
    optionsContextMenu.style.display = 'block';
    const adjustment = p2Box.offsetHeight - p2OptionsButton.offsetTop;
    optionsContextMenu.style.bottom = `${adjustment}px`;
    document.addEventListener('mousedown', hideOptionsContextMenu);
  });
};
