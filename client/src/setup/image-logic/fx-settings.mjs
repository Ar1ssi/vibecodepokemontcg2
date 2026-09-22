// Design 024 slice 0: the one owner of the FX toggles. Design 022 read
// `ptcg-fx-off` inline in mat-fx.mjs; three settings (visuals, sound, volume)
// and an iframe-propagation step need a single pure model instead.
// Storage is any localStorage-shaped object and may be absent OR throw
// (private mode, blocked cookies), so every access is guarded.
export const FX_OFF_KEY = 'ptcg-fx-off';
export const SFX_OFF_KEY = 'ptcg-sfx-off';
export const VOLUME_KEY = 'ptcg-fx-volume';
export const DEFAULT_VOLUME = 0.6;

export const FX_OFF_CLASS = 'fx-off';
export const FX_REDUCED_CLASS = 'fx-reduced';

/** Clamp any stored/typed value into [0, 1]; junk falls back to the default. */
export function normalizeVolume(value) {
  const n = typeof value === 'string' ? Number.parseFloat(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return DEFAULT_VOLUME;
  return Math.min(1, Math.max(0, n));
}

const readKey = (storage, key) => {
  try {
    return storage?.getItem?.(key) ?? null;
  } catch {
    return null;
  }
};

/** @returns {{fxOff:boolean, sfxOff:boolean, volume:number}} defaults when unreadable. */
export function readSettings(storage) {
  return {
    fxOff: readKey(storage, FX_OFF_KEY) === '1',
    sfxOff: readKey(storage, SFX_OFF_KEY) === '1',
    volume: normalizeVolume(readKey(storage, VOLUME_KEY)),
  };
}

/**
 * Persist one setting. Booleans store as '1'/'0', volume as its clamped number.
 * @returns {boolean} false when storage is missing or refused the write.
 */
export function writeSetting(storage, key, value) {
  const stored = key === VOLUME_KEY ? String(normalizeVolume(value)) : value ? '1' : '0';
  try {
    storage?.setItem?.(key, stored);
    return true;
  } catch {
    return false;
  }
}
