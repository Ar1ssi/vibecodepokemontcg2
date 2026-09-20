import {
  changeBackground,
  darkMode,
  showOutlines,
} from '../../../setup/settings/settings.js';
import { systemState } from '../../../state.js';
import {
  lookAtCards,
  stopLookingAtCards,
} from '../../../actions/general/reveal-and-hide.js';
import {
  isLostZoneEnabled,
  setLostZoneEnabled,
} from '../../mutation-observers/lost-zone-panel.js';

export const initializeSettings = () => {
  const darkModeCheckbox = document.getElementById('darkModeCheckbox');
  darkModeCheckbox.addEventListener('change', darkMode);

  const showZonesCheckbox = document.getElementById('showZonesCheckbox');
  showZonesCheckbox.addEventListener('change', showOutlines);

  const hideHandCheckbox = document.getElementById('hideHandCheckbox');
  hideHandCheckbox.addEventListener('change', () => {
    if (hideHandCheckbox.checked) {
      if (systemState.initiator === 'self' && !systemState.isTwoPlayer) {
        stopLookingAtCards('opp', '', 'hand', false, true);
      } else if (!systemState.isTwoPlayer) {
        stopLookingAtCards('self', '', 'hand', false, true);
      }
    } else {
      if (systemState.initiator === 'self' && !systemState.isTwoPlayer) {
        lookAtCards('opp', '', 'hand', false, true);
      } else if (!systemState.isTwoPlayer) {
        lookAtCards('self', '', 'hand', false, true);
      }
    }
  });

  const showLostZoneCheckbox = document.getElementById('showLostZoneCheckbox');
  if (showLostZoneCheckbox) {
    showLostZoneCheckbox.checked = isLostZoneEnabled();
    showLostZoneCheckbox.addEventListener('change', () => {
      setLostZoneEnabled(showLostZoneCheckbox.checked);
    });
  }

  const changeBackgroundButton = document.getElementById(
    'changeBackgroundButton'
  );
  changeBackgroundButton.addEventListener('click', () => {
    changeBackground();
  });
};
