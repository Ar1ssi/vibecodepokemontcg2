// 1:1 port of poke-151's select/deselect motion
// (simeydotme/pokemon-cards-151 Card.svelte).
//
// The card stays at its board size, then Svelte-style springs:
//   scale        → min(0.9*vw/w, 0.9*vh/h, 1.75)
//   translate    → viewport center − card center
//   rotateY      → 360° on every open (horizontal spin)
// Spring settings are springPopoverSettings: { stiffness: 0.033, damping: 0.45 }.
// Retreat uses { soft: true } so the card eases back instead of slamming.
//
// Rotate lives on `.card-preview-flip` (not the host) so the 3D sleeve back
// can show during the spin without fighting holo's inner --rotate-x/y.

const POPOVER_SPRING = { stiffness: 0.033, damping: 0.45, precision: 0.01 };
const MAX_SCALE = 1.75;
const VIEW_FIT = 0.9;
export const POPOVER_SPIN_DEGREES = 360;

const tickSpring = (ctx, lastValue, currentValue, targetValue) => {
  if (typeof currentValue === 'number') {
    const delta = targetValue - currentValue;
    const velocity = (currentValue - lastValue) / (ctx.dt || 1 / 60);
    const spring = ctx.opts.stiffness * delta;
    const damper = ctx.opts.damping * velocity;
    const acceleration = (spring - damper) * ctx.inv_mass;
    const d = (velocity + acceleration) * ctx.dt;
    if (Math.abs(d) < ctx.opts.precision && Math.abs(delta) < ctx.opts.precision) {
      return targetValue;
    }
    ctx.settled = false;
    return currentValue + d;
  }
  const next = {};
  for (const key of Object.keys(currentValue)) {
    next[key] = tickSpring(ctx, lastValue[key], currentValue[key], targetValue[key]);
  }
  return next;
};

const createSpring = (initial, opts) => {
  const options = { stiffness: 0.15, damping: 0.8, precision: 0.01, ...opts };
  let value = initial;
  let lastValue = initial;
  let targetValue = initial;
  let lastTime = 0;
  let rafId = null;
  let invMass = 1;
  let invMassRecoveryRate = 0;
  let currentToken = 0;
  const listeners = new Set();
  let pending = [];

  const notify = () => {
    listeners.forEach((fn) => fn(value));
  };

  const fulfill = () => {
    const waiters = pending;
    pending = [];
    waiters.forEach((fn) => fn());
  };

  const loop = (now) => {
    invMass = Math.min(invMass + invMassRecoveryRate, 1);
    const ctx = {
      inv_mass: invMass,
      opts: options,
      settled: true,
      dt: ((now - lastTime) * 60) / 1000,
    };
    const nextValue = tickSpring(ctx, lastValue, value, targetValue);
    lastTime = now;
    lastValue = value;
    value = nextValue;
    notify();
    if (ctx.settled) {
      rafId = null;
      fulfill();
      return;
    }
    rafId = requestAnimationFrame(loop);
  };

  const spring = {
    get value() {
      return value;
    },
    get target() {
      return targetValue;
    },
    set(next, setOpts = {}) {
      targetValue = next;
      currentToken += 1;
      const token = currentToken;
      if (setOpts.hard) {
        if (rafId != null) cancelAnimationFrame(rafId);
        rafId = null;
        lastValue = next;
        value = next;
        notify();
        fulfill();
        return Promise.resolve();
      }
      if (setOpts.soft) {
        const rate = setOpts.soft === true ? 0.5 : +setOpts.soft;
        invMassRecoveryRate = 1 / (rate * 60);
        invMass = 0;
      }
      if (rafId == null) {
        lastTime = performance.now();
        rafId = requestAnimationFrame(loop);
      }
      return new Promise((resolve) => {
        pending.push(() => {
          if (token === currentToken) resolve();
          else resolve();
        });
      });
    },
    subscribe(fn) {
      listeners.add(fn);
      fn(value);
      return () => listeners.delete(fn);
    },
    stop() {
      if (rafId != null) cancelAnimationFrame(rafId);
      rafId = null;
      fulfill();
    },
  };
  return spring;
};

export const viewportRectOf = (el) => {
  const local = el.getBoundingClientRect();
  const frame = el.ownerDocument?.defaultView?.frameElement;
  if (!frame) {
    return {
      left: local.left,
      top: local.top,
      width: local.width,
      height: local.height,
    };
  }
  const frameRect = frame.getBoundingClientRect();
  return {
    left: local.left + frameRect.left,
    top: local.top + frameRect.top,
    width: local.width,
    height: local.height,
  };
};

export const popoverScaleFor = (
  rect,
  viewport = { width: globalThis.innerWidth, height: globalThis.innerHeight }
) => {
  const scaleW = (viewport.width / Math.max(rect.width, 1)) * VIEW_FIT;
  const scaleH = (viewport.height / Math.max(rect.height, 1)) * VIEW_FIT;
  return Math.min(scaleW, scaleH, MAX_SCALE);
};

export const centerDeltaFor = (
  rect,
  viewport = { width: globalThis.innerWidth, height: globalThis.innerHeight }
) => ({
  x: Math.round(viewport.width / 2 - rect.left - rect.width / 2),
  y: Math.round(viewport.height / 2 - rect.top - rect.height / 2),
});

const applyHostTransform = (host, translate, scale, rotateY) => {
  if (!host) return;
  host.style.transform = `translate3d(${translate.x}px, ${translate.y}px, 0.1px) scale(${scale})`;
  const flip = host.querySelector?.('.card-preview-flip');
  if (flip) {
    flip.style.transform = `rotateY(${rotateY}deg)`;
  }
};

export const createPopoverMotion = (host) => {
  const scale = createSpring(1, POPOVER_SPRING);
  const translate = createSpring({ x: 0, y: 0 }, POPOVER_SPRING);
  const rotateDelta = createSpring(0, POPOVER_SPRING);
  const paint = () => {
    applyHostTransform(host, translate.value, scale.value, rotateDelta.value);
  };
  const unsubs = [scale.subscribe(paint), translate.subscribe(paint), rotateDelta.subscribe(paint)];

  return {
    get rotateTarget() {
      return rotateDelta.target;
    },
    popover(rect) {
      const delta = centerDeltaFor(rect);
      rotateDelta.set(0, { hard: true });
      rotateDelta.set(POPOVER_SPIN_DEGREES);
      return Promise.all([
        translate.set(delta),
        scale.set(popoverScaleFor(rect)),
      ]);
    },
    retreat() {
      return Promise.all([
        scale.set(1, { soft: true }),
        translate.set({ x: 0, y: 0 }, { soft: true }),
        rotateDelta.set(0, { soft: true }),
      ]);
    },
    reset() {
      scale.set(1, { hard: true });
      translate.set({ x: 0, y: 0 }, { hard: true });
      rotateDelta.set(0, { hard: true });
    },
    stop() {
      scale.stop();
      translate.stop();
      rotateDelta.stop();
      unsubs.forEach((off) => off());
    },
  };
};

const activePops = new WeakMap();

export const stopPop = (host) => {
  const motion = activePops.get(host);
  if (motion) {
    motion.stop();
    activePops.delete(host);
  }
};

/**
 * poke-151 popover when `rect` is given: fly from that board rect to center
 * with a 360° spin every time. Without `rect`, keep the attached-cards panel
 * on a scale-only spring.
 */
export const playSelectPop = (host, onFrame, onDone, rect) => {
  stopPop(host);
  if (rect) {
    const motion = createPopoverMotion(host);
    activePops.set(host, motion);
    motion.popover(rect).then(() => onDone?.());
    return;
  }
  const scale = createSpring(0.55, POPOVER_SPRING);
  const unsub = scale.subscribe((value) => onFrame?.(value));
  activePops.set(host, {
    retreat: () => scale.set(0.55, { soft: true }),
    reset() {},
    stop: () => {
      unsub();
      scale.stop();
    },
  });
  scale.set(1).then(() => onDone?.());
};

export const playDeselectPop = (host, _onFrame, onDone) => {
  const motion = activePops.get(host) ?? createPopoverMotion(host);
  activePops.set(host, motion);
  motion.retreat().then(() => {
    motion.stop();
    activePops.delete(host);
    onDone?.();
  });
};

/** @deprecated overlay-centering helper; popover motion no longer uses it */
export const makePopFrame = (fullViewElement) => {
  if (!fullViewElement) return () => {};
  return (scale) => {
    fullViewElement.style.transform = `translate3d(0, 0, 0.1px) scale(${scale})`;
  };
};
