// Design 024 slice 0: the one owner of the FX toggles. Design 022 read
// `ptcg-fx-off` inline in mat-fx.mjs; three settings (visuals, sound, volume)
// and an iframe-propagation step need a single pure model instead.
// Storage is any localStorage-shaped object and may be absent OR throw
// (private mode, blocked cookies), so every access is guarded.
export const FX_OFF_KEY = 'ptcg-fx-off';
export const SFX_OFF_KEY = 'ptcg-sfx-off';
export const VOLUME_KEY = 'ptcg-fx-volume';
export const AMBIENCE_OFF_KEY = 'ptcg-status-ambience-off';
// The crowd is off unless a player opted in (stored '0'), unlike the other toggles.
export const CROWD_OFF_KEY = 'ptcg-crowd-off';
// Design 069: the card hover preview is on unless the stored '1' turns it off.
export const HOVER_PREVIEW_OFF_KEY = 'ptcg-hover-preview-off';
// The holo sparkle shapes are on unless the stored '1' turns them off.
export const HOLO_SHAPES_OFF_KEY = 'ptcg-holo-shapes-off';
// Design 074 H3: the 3D board's camera, 'tilt12' (the old CSS tilt) unless the stored value is 'tcgl'.
export const CAMERA_PRESET_KEY = 'ptcg-camera-preset';
export const CAMERA_PRESETS = ['tilt12', 'tcgl'];
export const DEFAULT_CAMERA_PRESET = 'tilt12';
export const DEFAULT_VOLUME = 0.6;

export const FX_OFF_CLASS = 'fx-off';
export const FX_REDUCED_CLASS = 'fx-reduced';
export const HOLO_SHAPES_OFF_CLASS = 'holo-shapes-off';

/** Clamp any stored/typed value into [0, 1]; junk falls back to the default. */
export function normalizeVolume(value) {
  const n = typeof value === 'string' ? Number.parseFloat(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return DEFAULT_VOLUME;
  return Math.min(1, Math.max(0, n));
}

/** Any stored/typed value → a known preset; junk falls back to the default. */
export const normalizeCameraPreset = (value) => (CAMERA_PRESETS.includes(value) ? value : DEFAULT_CAMERA_PRESET);

const readKey = (storage, key) => {
  try {
    return storage?.getItem?.(key) ?? null;
  } catch {
    return null;
  }
};

/** @returns {{fxOff:boolean, sfxOff:boolean, volume:number, ambienceOff:boolean, crowdOff:boolean, hoverPreviewOff:boolean, holoShapesOff:boolean, cameraPreset:'tilt12'|'tcgl'}} defaults when unreadable. */
export function readSettings(storage) {
  return {
    fxOff: readKey(storage, FX_OFF_KEY) === '1',
    sfxOff: readKey(storage, SFX_OFF_KEY) === '1',
    ambienceOff: readKey(storage, AMBIENCE_OFF_KEY) === '1',
    crowdOff: readKey(storage, CROWD_OFF_KEY) !== '0',
    hoverPreviewOff: readKey(storage, HOVER_PREVIEW_OFF_KEY) === '1',
    holoShapesOff: readKey(storage, HOLO_SHAPES_OFF_KEY) === '1',
    cameraPreset: normalizeCameraPreset(readKey(storage, CAMERA_PRESET_KEY)),
    volume: normalizeVolume(readKey(storage, VOLUME_KEY)),
  };
}

/**
 * Persist one setting. Booleans store as '1'/'0', volume as its clamped number, the camera preset as its name.
 * @returns {boolean} false when storage is missing or refused the write.
 */
export function writeSetting(storage, key, value) {
  const stored =
    key === VOLUME_KEY
      ? String(normalizeVolume(value))
      : key === CAMERA_PRESET_KEY
        ? normalizeCameraPreset(value)
        : value
          ? '1'
          : '0';
  if (typeof storage?.setItem !== 'function') return false;
  try {
    storage.setItem(key, stored);
    return true;
  } catch {
    return false;
  }
}
