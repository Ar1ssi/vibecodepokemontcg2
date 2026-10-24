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
  setAmbienceOff,
  setCrowdOff,
  setCameraPreset,
  setHoloShapesOff,
  setHoverPreviewOff,
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

  const statusAmbienceCheckbox = document.getElementById(
    'statusAmbienceCheckbox'
  );
  if (statusAmbienceCheckbox) {
    statusAmbienceCheckbox.checked = !fx.ambienceOff;
    statusAmbienceCheckbox.addEventListener('change', () => {
      setAmbienceOff(!statusAmbienceCheckbox.checked);
    });
  }

  const crowdCheckbox = document.getElementById('crowdCheckbox');
  if (crowdCheckbox) {
    crowdCheckbox.checked = !fx.crowdOff;
    crowdCheckbox.addEventListener('change', () => {
      setCrowdOff(!crowdCheckbox.checked);
    });
  }

  // Design 069: on by default; hover-preview.js hears the change through onFxSettingsChanged.
  const hoverPreviewCheckbox = document.getElementById('hoverPreviewCheckbox');
  if (hoverPreviewCheckbox) {
    hoverPreviewCheckbox.checked = !fx.hoverPreviewOff;
    hoverPreviewCheckbox.addEventListener('change', () => {
      setHoverPreviewOff(!hoverPreviewCheckbox.checked);
    });
  }

  // Off hides the sparkle shapes on holo cards; the foil colour and sheen stay.
  const holoShapesCheckbox = document.getElementById('holoShapesCheckbox');
  if (holoShapesCheckbox) {
    holoShapesCheckbox.checked = !fx.holoShapesOff;
    holoShapesCheckbox.addEventListener('change', () => {
      setHoloShapesOff(!holoShapesCheckbox.checked);
    });
  }

  // Design 074 H3: off = the 12° tilt camera, on = the TCG Live top-down camera; board3d.js hears the change through onFxSettingsChanged.
  const tcglCameraCheckbox = document.getElementById('tcglCameraCheckbox');
  if (tcglCameraCheckbox) {
    tcglCameraCheckbox.checked = fx.cameraPreset === 'tcgl';
    tcglCameraCheckbox.addEventListener('change', () => {
      setCameraPreset(tcglCameraCheckbox.checked ? 'tcgl' : 'tilt12');
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
