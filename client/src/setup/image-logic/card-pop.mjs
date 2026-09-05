// Spring-based "pop" for the double-click enlarge / close flow.
// Mirrors poke-151's springScale feel: a single scale value eased with a
// svelte-style velocity spring (stiffness + damping) so it overshoots and
// settles rather than snapping.
//
// The module is host-agnostic: callers pass an `onFrame(scale)` callback that
// writes the value to whatever element owns the transform — in practice the
// `.full-view` container, which wraps the card (plain <img> or `.mat-holo`
// wrapper) together with its attached energies/tools, so the whole enlarged
// view pops as one piece. `onDone` fires once the spring has settled.

// Underdamped on purpose: the select spring overshoots ~8% around 170 ms and
// settles by ~450 ms, which is what makes the enlarge read as a pop rather than
// an ease-in. The deselect stays damped so closing just snaps away.
const SELECT_SPRING = { stiffness: 0.14, damping: 0.71 };
const DESELECT_SPRING = { stiffness: 0.14, damping: 0.6 };

const activePops = new WeakMap();

const settle = (to, onFrame, onDone) => {
  if (onFrame) onFrame(to);
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
    settle(to, onFrame, onDone);
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
  // Write the starting scale before yielding to the compositor, otherwise the
  // first painted frame shows the untransformed (scale 1) view and the pop
  // reads as a snap-then-shrink-then-grow.
  if (onFrame) onFrame(from);
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

// `.full-view` is centered with `transform: translate(-50%, -50%)`, so the pop
// scale has to be composed with that translate rather than replacing it.
export const makePopFrame = (fullViewElement) => {
  if (!fullViewElement) return () => {};
  return (scale) => {
    fullViewElement.style.transform = `translate(-50%, -50%) scale(${scale.toFixed(4)})`;
  };
};
