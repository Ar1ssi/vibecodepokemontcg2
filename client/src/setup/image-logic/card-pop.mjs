// Spring-based "pop" for the double-click enlarge / close flow.
// Mirrors poke-151's springScale feel: a single scale value eased with a
// svelte-style velocity spring (stiffness + damping) so it overshoots and
// settles rather than snapping.
//
// The module is host-agnostic: callers pass an `onFrame(scale)` callback that
// writes the value to whatever element owns the transform (the `.full-view`
// container for plain cards, the `.mat-holo` wrapper's `--card-scale` for holo
// cards). `onDone` fires once the spring has settled.

const SELECT_SPRING = { stiffness: 0.12, damping: 0.55 };
const DESELECT_SPRING = { stiffness: 0.14, damping: 0.6 };

const activePops = new WeakMap();

const settle = (host, onFrame, onDone) => {
  if (onFrame) onFrame(1);
  if (onDone) onDone();
};

const springTo = (host, from, to, spring, onFrame, onDone) => {
  stopPop(host);

  let value = from;
  let velocity = 0;
  let running = true;
  let rafId = null;

  const finish = () => {
    if (!running) return;
    running = false;
    if (rafId != null) cancelAnimationFrame(rafId);
    activePops.delete(host);
    settle(host, onFrame, onDone);
  };

  const tick = () => {
    if (!running) return;
    velocity += (to - value) * spring.stiffness;
    velocity *= spring.damping;
    value += velocity;
    if (Math.abs(to - value) < 0.002 && Math.abs(velocity) < 0.002) {
      finish();
      return;
    }
    if (onFrame) onFrame(value);
    rafId = requestAnimationFrame(tick);
  };

  activePops.set(host, () => {
    running = false;
    if (rafId != null) cancelAnimationFrame(rafId);
    activePops.delete(host);
  });
  rafId = requestAnimationFrame(tick);
};

export const stopPop = (host) => {
  const stop = activePops.get(host);
  if (stop) stop();
};

// Select pop: grow from ~0.5 up to 1 with a springy overshoot/settle.
export const playSelectPop = (host, onFrame, onDone) => {
  springTo(host, 0.5, 1, SELECT_SPRING, onFrame, onDone);
};

// Deselect pop: shrink from 1 back down to ~0.5.
export const playDeselectPop = (host, onFrame, onDone) => {
  springTo(host, 1, 0.5, DESELECT_SPRING, onFrame, onDone);
};

// The element that owns the pop transform. Holo cards scale via the wrapper's
// `--card-scale` (a variable the holo engine never touches); plain cards scale
// the `.full-view` container's own transform.
export const popHostFor = (targetImage) =>
  targetImage?.closest?.('.mat-holo') || targetImage?.parentElement;

export const makePopFrame = (targetImage) => {
  const wrapper = targetImage?.closest?.('.mat-holo');
  if (wrapper) {
    return (scale) => wrapper.style.setProperty('--card-scale', scale.toFixed(4));
  }
  const container = targetImage?.parentElement;
  if (!container) return () => {};
  return (scale) => {
    container.style.transform = `translate(-50%, -50%) scale(${scale.toFixed(4)})`;
  };
};
