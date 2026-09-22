// Design 022 slice 0: shared primitives for parent-page mat effects (overlay
// host, rAF pose loop, reduced-motion / kill-switch checks). Effects and the
// knockout ghost all draw as detached `document.body` overlays positioned from
// `visualRectOf`, so this is the single owner of that pattern. DOM is touched
// only inside function bodies, so importing under `node --test` is safe.
//
// Design 024: the three toggles themselves now live in fx-settings.mjs (one
// pure owner for visuals / sound / volume); the readers below delegate to it
// and keep their original signatures so no caller changed.
import { FX_OFF_CLASS, readSettings } from './fx-settings.mjs';
import { visualRectOf } from './iframe-rect.mjs';

export { FX_OFF_CLASS };
export { FX_OFF_KEY as FX_OFF_STORAGE_KEY } from './fx-settings.mjs';

export const motionReduced = () => {
  if (typeof globalThis.matchMedia !== 'function') return false;
  try {
    return !!globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

const settings = () => readSettings(globalThis.localStorage);

// Master switch: `body.fx-off` (set by the FX settings panel) or the stored
// `ptcg-fx-off` flag. Either one disables the whole layer, visuals and sound.
export const fxDisabled = () => {
  if (typeof document !== 'undefined' && document.body?.classList.contains(FX_OFF_CLASS)) {
    return true;
  }
  return settings().fxOff;
};

/** Sound is off when the whole layer is off, or the sound-only mute is set. */
export const soundDisabled = () => fxDisabled() || settings().sfxOff;

/** Master audio gain in [0, 1]. */
export const fxVolume = () => settings().volume;

/**
 * Create a fixed-position overlay host over `rect` (parent-viewport pixels).
 * The caller appends content, drives it (runPose) and removes it.
 */
export const spawnOverlay = ({ rect, className }) => {
  const host = document.createElement('div');
  if (className) host.className = className;
  host.style.left = `${rect.left}px`;
  host.style.top = `${rect.top}px`;
  host.style.width = `${rect.width}px`;
  host.style.height = `${rect.height}px`;
  document.body.appendChild(host);
  return host;
};

/**
 * Drive `poseFn(t, host)` from t=0 to t=1 over `durationMs` on rAF, then
 * remove `host` and call `onDone`. Returns a cancel function that stops the
 * loop and removes the host without calling `onDone`.
 */
export const runPose = (host, durationMs, poseFn, onDone) => {
  let rafId = null;
  let started = null;
  const tick = (now) => {
    if (started == null) started = now;
    const t = Math.min(1, (now - started) / durationMs);
    poseFn(t, host);
    if (t < 1) {
      rafId = requestAnimationFrame(tick);
      return;
    }
    rafId = null;
    host.remove();
    onDone?.();
  };
  poseFn(0, host);
  rafId = requestAnimationFrame(tick);
  return () => {
    if (rafId != null) cancelAnimationFrame(rafId);
    rafId = null;
    host.remove();
  };
};

/**
 * On-page rect of a board card by instanceId, or null when the card is not in
 * the registry, detached, or collapsed. `registry` is `getCardRegistry()`.
 */
export const rectForInstance = (instanceId, registry) => {
  const el = registry?.get(instanceId)?.element;
  if (!el || el.isConnected === false) return null;
  const rect = visualRectOf(el);
  if (rect.width < 2 || rect.height < 2) return null;
  return rect;
};
