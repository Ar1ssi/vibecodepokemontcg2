// Design 024 slice 0: the DOM side of the FX settings. Pure model in
// fx-settings.mjs; this applies it to the page.
//
// The board cards, damage counters and status tokens live INSIDE the two
// playmat iframes, which cannot see `document.body.fx-off` on the parent page
// (the design-022 slice-3 gap: "effects off" left idle motion running). Both
// iframes are same-origin and already reachable through state.js, so the
// applier writes the same marker classes onto each iframe's <html> element and
// the iframe stylesheets guard their idle keyframes on `:root(.fx-off)`.
import { oppContainerDocument, selfContainerDocument, systemState } from '../../state.js';
import {
  FX_OFF_CLASS,
  FX_OFF_KEY,
  FX_REDUCED_CLASS,
  SFX_OFF_KEY,
  VOLUME_KEY,
  readSettings,
  writeSetting,
} from './fx-settings.mjs';
import { fxDisabled, motionReduced } from './mat-fx.mjs';

const storage = () => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

/** Every <html>/<body> the marker classes must reach: parent page + both mats. */
const markerRoots = () => {
  const roots = [];
  if (typeof document !== 'undefined' && document.body) roots.push(document.body);
  for (const doc of [selfContainerDocument, oppContainerDocument]) {
    const root = doc?.documentElement;
    if (root) roots.push(root);
  }
  return roots;
};

const volumeListeners = new Set();

/** Called by the audio driver so it can follow the volume/mute without polling. */
export const onFxSettingsChanged = (listener) => {
  volumeListeners.add(listener);
  return () => volumeListeners.delete(listener);
};

/**
 * Push the stored settings onto the page. Safe to call before the iframes
 * exist (they are simply skipped) — call it again once they do.
 * @returns {{fxOff:boolean, sfxOff:boolean, volume:number}} the applied settings
 */
export function applyFxSettings() {
  const stored = readSettings(storage());
  // `body.fx-off` is an INPUT as well as an output: fxDisabled() documents the
  // class OR the stored flag as disabling the layer, so a class set by hand (a
  // test harness, devtools) must not be stripped by the next view apply.
  const settings = { ...stored, fxOff: fxDisabled() || stored.fxOff };
  const reduced = motionReduced();
  for (const root of markerRoots()) {
    root.classList.toggle(FX_OFF_CLASS, settings.fxOff);
    root.classList.toggle(FX_REDUCED_CLASS, reduced);
  }
  for (const listener of volumeListeners) {
    try {
      listener(settings);
    } catch {
      /* a listener must never break settings application */
    }
  }
  return settings;
}

/** Persist one setting and re-apply. `key` is one of the fx-settings.mjs keys. */
export function setFxSetting(key, value) {
  writeSetting(storage(), key, value);
  return applyFxSettings();
}

export const setFxOff = (off) => setFxSetting(FX_OFF_KEY, off);
export const setSfxOff = (off) => setFxSetting(SFX_OFF_KEY, off);
export const setFxVolume = (volume) => setFxSetting(VOLUME_KEY, volume);

// The iframes are built after boot, so re-apply when the mats report ready.
// `systemState` is imported for that hook's existence check only.
export function watchFxSettingTargets() {
  if (typeof document === 'undefined' || !systemState) return;
  document.addEventListener('rules-turn-view-applied', applyFxSettings);
}
