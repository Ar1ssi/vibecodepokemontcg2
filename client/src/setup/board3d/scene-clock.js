// The three.js board's clock (design 074 O10). Time is the `currentTime` of a WAAPI Animation on
// the canvas, the pattern canvas-stage.js uses, so fx-preview freezes the scene by pausing
// `document.getAnimations()` like every other board effect. The clock never pauses its own
// animation (that would fight a freeze); `stop()` only ends the rAF loop.

const CLOCK_DURATION_MS = 1e12;

const fallbackNow = () => globalThis.performance?.now?.() ?? Date.now();

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ requestFrame?: (fn: FrameRequestCallback) => number,
 *   cancelFrame?: (id: number) => void }} [options] frame scheduling (tests inject it)
 * @returns {{ now: () => number, onTick: (fn: (now: number) => void) => () => void,
 *   start: () => void, stop: () => void, dispose: () => void }}
 *   `onTick` callbacks run once per animation frame while the clock is started
 *   and at least one is registered; the returned function unregisters.
 */
export function createSceneClock(canvas, options = {}) {
  const requestFrame =
    options.requestFrame ?? ((fn) => globalThis.requestAnimationFrame?.(fn) ?? globalThis.setTimeout(fn, 16));
  const cancelFrame =
    options.cancelFrame ?? ((id) => (globalThis.cancelAnimationFrame ?? globalThis.clearTimeout)?.(id));

  let animation = null;
  try {
    animation = typeof canvas?.animate === 'function' ? canvas.animate([], { duration: CLOCK_DURATION_MS }) : null;
  } catch {
    animation = null;
  }
  // Without WAAPI (jsdom) the clock still runs, on performance.now().
  const origin = fallbackNow();
  const now = () => {
    const time = animation?.currentTime;
    return typeof time === 'number' && Number.isFinite(time) ? time : fallbackNow() - origin;
  };

  const callbacks = new Set();
  let started = false;
  let frameId = null;
  let disposed = false;

  const tick = () => {
    frameId = null;
    if (!started || disposed || callbacks.size === 0) return;
    const time = now();
    for (const fn of [...callbacks]) {
      try {
        fn(time);
      } catch (error) {
        console.error('board3d clock tick failed', error);
      }
    }
    schedule();
  };

  const schedule = () => {
    if (frameId !== null || !started || disposed || callbacks.size === 0) return;
    frameId = requestFrame(tick);
  };

  const onTick = (fn) => {
    if (typeof fn !== 'function' || disposed) return () => {};
    callbacks.add(fn);
    schedule();
    return () => {
      callbacks.delete(fn);
    };
  };

  const start = () => {
    if (disposed) return;
    started = true;
    schedule();
  };

  const stop = () => {
    started = false;
    if (frameId !== null) cancelFrame(frameId);
    frameId = null;
  };

  const dispose = () => {
    stop();
    disposed = true;
    callbacks.clear();
    animation?.cancel?.();
    animation = null;
  };

  return { now, onTick, start, stop, dispose };
}
