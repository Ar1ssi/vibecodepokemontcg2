import {
  oppContainerDocument,
  selfContainerDocument,
  systemState,
} from '../../state.js';

export const handleSpectatorButtons = () => {
  const buttonIdsToToggle = [
    'p2AttackButton',
    'p2PassButton',
    'p2SetupButton',
    'p2ResetButton',
    'passBoardButton',
    'flipCoinButton',
  ];
  const isVisible = !(
    document.getElementById('spectatorModeCheckbox').checked &&
    systemState.isTwoPlayer
  );
  buttonIdsToToggle.forEach((id) => {
    const element = document.getElementById(id);
    element.style.display = isVisible ? '' : 'none';
  });
  if (isVisible) {
    document.getElementById('p2FREEBUTTON').classList.remove('spectator-color');
  } else {
    document.getElementById('p2FREEBUTTON').classList.add('spectator-color');
  }

  const zoneButtonIdsToToggle = [
    'shuffleDeckButton',
    'shuffleDiscardButton',
    'viewCardsButtonContainer',
    'attachedCardsButtonContainer',
  ];
  zoneButtonIdsToToggle.forEach((id) => {
    const selfElement = selfContainerDocument.getElementById(id);
    const oppElement = oppContainerDocument.getElementById(id);
    selfElement.style.display = isVisible ? '' : 'none';
    oppElement.style.display = isVisible ? '' : 'none';
  });
};
