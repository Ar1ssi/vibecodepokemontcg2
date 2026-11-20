import {
  oppContainerDocument,
  selfContainerDocument,
  systemState,
} from '../../state.js';

const toggleElementsVisibility = (elementIds, isVisible) => {
  elementIds.forEach((id) => {
    const element = document.getElementById(id);
    element.style.display = isVisible ? '' : 'none';
  });
  if (isVisible) {
    document.getElementById('p2FREEBUTTON').classList.remove('spectator-color');
  } else {
    document.getElementById('p2FREEBUTTON').classList.add('spectator-color');
  }
};

export const handleSpectatorButtons = () => {
  const buttonIdsToToggle = [
    'p2AttackButton',
    'p2PassButton',
    'p2SetupButton',
    'p2ResetButton',
    'passBoardButton',
    'flipCoinButton',
  ];
  toggleElementsVisibility(
    buttonIdsToToggle,
    !(
      document.getElementById('spectatorModeCheckbox').checked &&
      systemState.isTwoPlayer
    )
  );

  const zoneButtonIdsToToggle = [
    'shuffleDeckButton',
    'shuffleDiscardButton',
    'viewCardsButtonContainer',
    'attachedCardsButtonContainer',
  ];
  const isVisible = !(
    document.getElementById('spectatorModeCheckbox').checked &&
    systemState.isTwoPlayer
  );
  zoneButtonIdsToToggle.forEach((id) => {
    const selfElement = selfContainerDocument.getElementById(id);
    const oppElement = oppContainerDocument.getElementById(id);
    selfElement.style.display = isVisible ? '' : 'none';
    oppElement.style.display = isVisible ? '' : 'none';
  });
};
