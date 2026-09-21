// Design 022 slice 0: shared primitives for parent-page mat effects (overlay
// host, rAF pose loop, reduced-motion / kill-switch checks). Effects and the
// knockout ghost all draw as detached `document.body` overlays positioned from
// `visualRectOf`, so this is the single owner of that pattern. DOM is touched
// only inside function bodies, so importing under `node --test` is safe.
import { visualRectOf } from './iframe-rect.mjs';

export const FX_OFF_CLASS = 'fx-off';
export const FX_OFF_STORAGE_KEY = 'ptcg-fx-off';

export const motionReduced = () => {
  if (typeof globalThis.matchMedia !== 'function') return false;
  try {
    return !!globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

// Master switch: `body.fx-off` (set by a future settings UI) or, for now,
// localStorage['ptcg-fx-off'] === '1'. Either one disables the whole layer.
export const fxDisabled = () => {
  if (typeof document === 'undefined') return false;
  if (document.body?.classList.contains(FX_OFF_CLASS)) return true;
  try {
    return globalThis.localStorage?.getItem(FX_OFF_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

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
