// Design 064 slice 6: the one entry point UI chrome (buttons, inspector, pickers, drag) uses to
// play a sampled cue. fx-audio.js touches `window` at import time, so it is loaded lazily here;
// that keeps every caller importable under node, where the load simply fails and the cue is
// dropped. UI sound is best-effort: no throw, no synth fallback (silence matches pre-064).
const loadAudio = () => import('./fx-audio.js');

/** Build a `uiCue` bound to `load` (the fx-audio module loader; injected by tests). */
export const createUiCue = (load) => (key) => {
  try {
    load()
      .then((audio) => audio.playUiCue(key))
      .catch(() => {});
  } catch {
    /* best-effort */
  }
};

export const uiCue = createUiCue(loadAudio);

/** Wrap a click handler so it first sounds `key` (the generic button click by default). */
export const withUiCue =
  (handler, key = 'button-click', play = uiCue) =>
  (...args) => {
    play(key);
    return handler(...args);
  };

/**
 * Sound `key` on every click of the buttons named by `ids`, alongside their own handlers.
 * Missing ids are skipped (p1 and p2 layouts each own a different set).
 * @returns {number} how many buttons were wired
 */
export function wireButtonCues(ids, { key = 'button-click', doc = document, play = uiCue } = {}) {
  let wired = 0;
  for (const id of ids) {
    const button = doc.getElementById(id);
    if (!button) continue;
    button.addEventListener('click', () => play(key));
    wired += 1;
  }
  return wired;
}
