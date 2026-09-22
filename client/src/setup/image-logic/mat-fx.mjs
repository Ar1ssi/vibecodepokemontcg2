// Design 022 slice 0: shared primitives for parent-page mat effects (overlay
// host, rAF pose loop, reduced-motion / kill-switch checks). Effects and the
// knockout ghost all draw as detached `document.body` overlays positioned from
// `visualRectOf`, so this is the single owner of that pattern. DOM is touched
// only inside function bodies, so importing under `node --test` is safe.
import { visualRectOf } from './iframe-rect.mjs';

export const FX_OFF_CLASS = 'fx-off';
export const FX_OFF_STORAGE_KEY = 'ptcg-fx-off';

export const REDUCE_MOTION_STORAGE_KEY = 'ptcg-reduce-motion';

// Opt-in only: localStorage['ptcg-reduce-motion'] === '1'. The OS
// `prefers-reduced-motion` flag is deliberately ignored — Windows sets it
// whenever "Animation effects" is off system-wide, which silently hid every
// battle animation for players who never asked the game for less motion.
export const motionReduced = () => {
  try {
    return globalThis.localStorage?.getItem(REDUCE_MOTION_STORAGE_KEY) === '1';
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

/**
 * Design 026: sample a pose function into WAAPI keyframes so effects run on
 * the compositor while the pose math stays the unit-tested source of truth.
 * `toFrame(pose)` maps one pose to a keyframe object (transform/opacity only).
 */
export const sampleKeyframes = (poseFn, toFrame, samples = 24) => {
  const count = Math.max(2, Math.floor(samples));
  const frames = [];
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    frames.push({ ...toFrame(poseFn(t)), offset: t });
  }
  return frames;
};

const applyFrame = (el, frame) => {
  if (!frame || !el?.style) return;
  for (const [key, value] of Object.entries(frame)) {
    if (key === 'offset' || key === 'easing' || key === 'composite') continue;
    el.style[key] = String(value);
  }
};

/**
 * Play `frames` on `el`. Resolves when the animation ends or is cancelled.
 * Without WAAPI the final frame is applied at once, so the effect degrades to
 * its end state instead of throwing.
 */
export const animateFrames = (el, frames, { duration, delay = 0, easing = 'linear' } = {}) => {
  if (typeof el?.animate !== 'function') {
    applyFrame(el, frames?.at?.(-1));
    return Promise.resolve();
  }
  const animation = el.animate(frames, { duration, delay, easing, fill: 'both' });
  return animation.finished.then(
    () => undefined,
    () => undefined
  );
};

/**
 * Remove `host` once every promise settles, or after `backstopMs` at the
 * latest: a hidden tab or a cancelled animation must never leak an overlay.
 */
export const removeWhen = (host, promises, backstopMs) => {
  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    host.remove();
  };
  const timer = setTimeout(remove, backstopMs);
  Promise.all(promises).then(() => {
    clearTimeout(timer);
    remove();
  });
  return remove;
};

/**
 * Append one `<i>` per particle (from particles.mjs `burstParticles`) at the
 * host's center and fly each outward after `delay` ms. Returns the
 * animations' promises.
 */
export const spawnParticles = (host, particles, { className = 'fx-particle', color, duration, delay = 0 }) =>
  particles.map((p) => {
    const node = document.createElement('i');
    node.className = className;
    node.style.width = `${p.size}px`;
    node.style.height = `${p.size * (p.aspect ?? 1)}px`;
    node.style.marginLeft = `${-p.size / 2}px`;
    node.style.marginTop = `${(-p.size * (p.aspect ?? 1)) / 2}px`;
    if (color) node.style.setProperty('--fx-p-color', color);
    host.appendChild(node);
    const rot = p.orient === false ? '' : `rotate(${p.angle}deg)`;
    return animateFrames(
      node,
      [
        // Opacity 0 at offset 0: with fill 'both' a delayed particle would
        // otherwise sit visible at the center until its start.
        { transform: `translate(0px, 0px) ${rot} scale(${p.startScale ?? 1})`, opacity: 0 },
        { transform: `translate(${p.dx * 0.12}px, ${p.dy * 0.12}px) ${rot} scale(${p.startScale ?? 1})`, opacity: 1, offset: 0.08 },
        {
          transform: `translate(${p.dx * 0.8}px, ${p.dy * 0.8 + (p.gravity ?? 0) * 0.3}px) ${rot} scale(${p.midScale ?? 0.9})`,
          opacity: 1,
          offset: 0.55,
        },
        { transform: `translate(${p.dx}px, ${p.dy + (p.gravity ?? 0)}px) ${rot} scale(0)`, opacity: 0 },
      ],
      { duration: duration * p.life, delay: delay + duration * p.delay, easing: 'cubic-bezier(0.15, 0.7, 0.3, 1)' }
    );
  });
