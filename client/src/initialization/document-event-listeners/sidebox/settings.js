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
import {
  applyFxSettings,
  setFxOff,
  setFxVolume,
  setSfxOff,
} from '../../../setup/image-logic/fx-settings.js';

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

  // Design 024 slice 5: the FX layer had no UI at all — it was togglable only
  // by hand-editing localStorage. Each control writes through fx-settings.js,
  // which also mirrors the kill switch into the playmat iframes.
  const fx = applyFxSettings();

  const fxOffCheckbox = document.getElementById('fxOffCheckbox');
  if (fxOffCheckbox) {
    fxOffCheckbox.checked = fx.fxOff;
    fxOffCheckbox.addEventListener('change', () => {
      setFxOff(fxOffCheckbox.checked);
    });
  }

  const sfxOffCheckbox = document.getElementById('sfxOffCheckbox');
  if (sfxOffCheckbox) {
    sfxOffCheckbox.checked = fx.sfxOff;
    sfxOffCheckbox.addEventListener('change', () => {
      setSfxOff(sfxOffCheckbox.checked);
    });
  }

  const fxVolumeSlider = document.getElementById('fxVolumeSlider');
  if (fxVolumeSlider) {
    fxVolumeSlider.value = String(Math.round(fx.volume * 100));
    fxVolumeSlider.addEventListener('input', () => {
      setFxVolume(Number(fxVolumeSlider.value) / 100);
    });
  }

  const changeBackgroundButton = document.getElementById(
    'changeBackgroundButton'
  );
  changeBackgroundButton.addEventListener('click', () => {
    changeBackground();
  });
};
