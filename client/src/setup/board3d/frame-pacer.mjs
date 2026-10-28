// Frame pacing for the three.js board's on-demand loop (board-scene.js). A change (`invalidate`)
// draws on the next animation frame. A frame asked for only to keep an ambient loop turning —
// foil shimmer, Tera skin, status loops, glow rings — waits until AMBIENT_FRAME_MS have passed
// since the last drawn frame, so a still board with a foil card on it no longer redraws (and
// re-shades every card) at the display's full rate.

export const AMBIENT_FRAME_MS = 1000 / 30;
/** rAF ticks land a little early; a frame this close to due draws now rather than a tick late. */
const DUE_SLACK_MS = 4;

const defaultNow = () => globalThis.performance?.now?.() ?? Date.now();

/**
 * @param {{ onFrame: (kind: 'change'|'ambient') => void,
 *   requestFrame: (fn: () => void) => unknown, cancelFrame?: (id: unknown) => void,
 *   now?: () => number, ambientMs?: number }} options
 *   `now` is wall-clock time: the scene clock can be frozen (fx-preview), and a frozen clock would
 *   keep an ambient frame from ever coming due.
 * @returns {{ invalidate: () => void, invalidateAmbient: () => void, pending: () => boolean,
 *   dispose: () => void }}
 *   `onFrame('change')` when any `invalidate` came since the last frame, else `'ambient'`.
 */
export function createFramePacer({ onFrame, requestFrame, cancelFrame = () => {}, now = defaultNow, ambientMs = AMBIENT_FRAME_MS }) {
  if (typeof onFrame !== 'function' || typeof requestFrame !== 'function') {
    throw new TypeError('createFramePacer needs onFrame and requestFrame');
  }
  let frameId = null;
  let wanted = false;
  let changed = false;
  let lastFrameAt = -Infinity;
  let disposed = false;

  const schedule = () => {
    if (frameId === null && !disposed) frameId = requestFrame(tick);
  };

  function tick() {
    frameId = null;
    if (disposed || !wanted) return;
    const time = now();
    if (!changed && time - lastFrameAt < ambientMs - DUE_SLACK_MS) {
      schedule();
      return;
    }
    const kind = changed ? 'change' : 'ambient';
    wanted = false;
    changed = false;
    lastFrameAt = time;
    onFrame(kind);
  }

  return {
    invalidate: () => {
      if (disposed) return;
      wanted = true;
      changed = true;
      schedule();
    },
    invalidateAmbient: () => {
      if (disposed) return;
      wanted = true;
      schedule();
    },
    pending: () => frameId !== null,
    dispose: () => {
      disposed = true;
      if (frameId !== null) cancelFrame(frameId);
      frameId = null;
    },
  };
}
