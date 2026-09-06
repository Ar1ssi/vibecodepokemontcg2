// 1:1 port of poke-151's select/deselect motion
// (simeydotme/pokemon-cards-151 Card.svelte).
//
// The card stays at its board size, then Svelte-style springs:
//   scale        → original preview size (min(88vh, min(94vw, 780px) * 1.397))
//   translate    → viewport center − card center
//   rotateY      → 360° on every open (horizontal spin)
// Spring settings are springPopoverSettings: { stiffness: 0.033, damping: 0.45 }.
// Retreat uses the same spring as open and spins rotateY 360° → 0.
//
// Rotate lives on `.card-preview-flip` (not the host) so the 3D sleeve back
// can show during the spin without fighting holo's inner --rotate-x/y.

const POPOVER_SPRING = { stiffness: 0.033, damping: 0.45, precision: 0.01 };
const DRAW_SPRING = { stiffness: 0.09, damping: 0.68, precision: 0.02 };
const PREVIEW_MAX_WIDTH = 780;
const PREVIEW_WIDTH_FIT = 0.94;
const PREVIEW_HEIGHT_FIT = 0.88;
const CARD_ASPECT = 1.397;
export const POPOVER_SPIN_DEGREES = 360;
export const DRAW_FLIP_DEGREES = 180;
export const DRAW_ARC_PX = 96;
export const DRAW_PEAK_SCALE = 0.45;
export const PRIZE_FAN_WIDTH_FIT = 0.86;
export const PRIZE_FAN_MAX_WIDTH = 168;
export const PRIZE_FAN_GAP = 16;
export const PRIZE_FAN_TOP = 0.28;

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
  let runOpts = options;
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
      opts: runOpts,
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
      runOpts = {
        ...options,
        stiffness: setOpts.stiffness ?? options.stiffness,
        damping: setOpts.damping ?? options.damping,
        precision: setOpts.precision ?? options.precision,
      };
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
      } else {
        invMass = 1;
        invMassRecoveryRate = 0;
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

/**
 * Map an iframe-local getBoundingClientRect into the parent page.
 * The `.opp` playmat iframe is CSS-flipped 180° (`scaleX(-1) scaleY(-1)`
 * around its center). Adding frame.top/left alone would land flights at
 * the unflipped seat (P2's hand on P1's screen goes to mid-board).
 */
export const mapIframeRectToPage = (local, frameRect, flipped) => {
  if (!flipped) {
    return {
      left: local.left + frameRect.left,
      top: local.top + frameRect.top,
      width: local.width,
      height: local.height,
    };
  }
  return {
    left: frameRect.left + frameRect.width - local.left - local.width,
    top: frameRect.top + frameRect.height - local.top - local.height,
    width: local.width,
    height: local.height,
  };
};

export const iframeIsFlipped = (frame) => {
  if (!frame) return false;
  if (frame.classList?.contains('opp')) return true;
  const view = frame.ownerDocument?.defaultView ?? globalThis;
  const transform = view.getComputedStyle?.(frame)?.transform;
  if (!transform || transform === 'none') return false;
  const match = transform.match(/matrix\(([^)]+)\)/);
  if (!match) return false;
  const parts = match[1].split(',').map((n) => Number(n.trim()));
  return parts[0] < 0 && parts[3] < 0;
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
  return mapIframeRectToPage(
    local,
    frame.getBoundingClientRect(),
    iframeIsFlipped(frame)
  );
};

export const previewTargetSize = (
  viewport = { width: globalThis.innerWidth, height: globalThis.innerHeight }
) => {
  const maxWidth = Math.min(viewport.width * PREVIEW_WIDTH_FIT, PREVIEW_MAX_WIDTH);
  const height = Math.min(viewport.height * PREVIEW_HEIGHT_FIT, maxWidth * CARD_ASPECT);
  return { width: height / CARD_ASPECT, height };
};

export const previewSizeForSource = (
  sourceRect,
  viewport = { width: globalThis.innerWidth, height: globalThis.innerHeight }
) => {
  const max = previewTargetSize(viewport);
  const aspect = sourceRect.height / Math.max(sourceRect.width, 1);
  let width = max.width;
  let height = width * aspect;
  if (height > max.height) {
    height = max.height;
    width = height / Math.max(aspect, 0.01);
  }
  return { width, height };
};

export const popoverScaleFor = (
  rect,
  viewport = { width: globalThis.innerWidth, height: globalThis.innerHeight }
) => {
  const target = previewSizeForSource(rect, viewport);
  return target.width / Math.max(rect.width, 1);
};

export const centerDeltaFor = (
  rect,
  viewport = { width: globalThis.innerWidth, height: globalThis.innerHeight }
) => ({
  x: Math.round(viewport.width / 2 - rect.left - rect.width / 2),
  y: Math.round(viewport.height / 2 - rect.top - rect.height / 2),
});

const defaultViewport = () => ({
  width: globalThis.innerWidth || 0,
  height: globalThis.innerHeight || 0,
});

/** Card size for the TCG Live prize-pick fan that flies up to the screen. */
export const prizeFanCardSize = (
  count,
  viewport = defaultViewport()
) => {
  const n = Math.max(1, count);
  const gap = PRIZE_FAN_GAP;
  const maxWidth = Math.min(PRIZE_FAN_MAX_WIDTH, viewport.width * 0.16);
  const available = viewport.width * PRIZE_FAN_WIDTH_FIT;
  const width = Math.min(
    maxWidth,
    (available - gap * Math.max(0, n - 1)) / n
  );
  return { width, height: width * CARD_ASPECT, gap };
};

/** Centered row of slots for `count` sleeve-forward prize cards. */
export const prizeFanSlots = (
  count,
  viewport = defaultViewport(),
  size = prizeFanCardSize(count, viewport)
) => {
  const { width, height, gap } = size;
  const n = Math.max(0, count);
  const total = n * width + Math.max(0, n - 1) * gap;
  const left0 = (viewport.width - total) / 2;
  const top = viewport.height * PRIZE_FAN_TOP;
  return Array.from({ length: n }, (_, i) => ({
    left: left0 + i * (width + gap),
    top,
    width,
    height,
  }));
};

const applyHostTransform = (host, translate, scale, rotateY) => {
  if (!host) return;
  host.style.transform = `translate3d(${translate.x}px, ${translate.y}px, 0.1px) scale(${scale})`;
  const flip = host.querySelector?.('.card-preview-flip');
  if (flip) {
    flip.style.transform = `rotateY(${rotateY}deg)`;
  }
};

export const createPopoverMotion = (host, { homeScale = 1 } = {}) => {
  const scale = createSpring(homeScale, POPOVER_SPRING);
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
    get scaleTarget() {
      return scale.target;
    },
    popover(rect, { startScale = homeScale, endScale = 1 } = {}) {
      const delta = centerDeltaFor(rect);
      scale.set(startScale, { hard: true });
      rotateDelta.set(0, { hard: true });
      rotateDelta.set(POPOVER_SPIN_DEGREES);
      return Promise.all([translate.set(delta), scale.set(endScale)]);
    },
    retreat() {
      return Promise.all([
        scale.set(homeScale, POPOVER_SPRING),
        translate.set({ x: 0, y: 0 }, POPOVER_SPRING),
        rotateDelta.set(0, POPOVER_SPRING),
      ]);
    },
    reset() {
      scale.set(homeScale, { hard: true });
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
export const playSelectPop = (host, onFrame, onDone, rect, motionOpts = {}) => {
  stopPop(host);
  if (rect) {
    const motion = createPopoverMotion(host, {
      homeScale: motionOpts.startScale ?? motionOpts.homeScale ?? 1,
    });
    activePops.set(host, motion);
    motion.popover(rect, motionOpts).then(() => onDone?.());
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

/** TCG Live draw: pose along the deck→hand flight (arc + mid-air scale). */
export const drawFlightPose = (
  translate,
  startTranslate,
  scale,
  rotateY,
  arcSign = 1
) => {
  const startDist = Math.hypot(startTranslate.x, startTranslate.y) || 1;
  const progress = 1 - Math.min(1, Math.hypot(translate.x, translate.y) / startDist);
  const wave = Math.sin(progress * Math.PI);
  return {
    x: translate.x,
    y: translate.y - arcSign * DRAW_ARC_PX * wave,
    scale: scale * (1 + DRAW_PEAK_SCALE * wave),
    rotateY,
    progress,
  };
};

/**
 * Fly a host from the deck pile to a hand seat: sleeve-forward at takeoff,
 * 180° flip to the face, slight lift toward the board center, then settle.
 */
export const playDrawFlight = (
  host,
  { startTranslate, startScale = 1, flip = true, arcSign = 1, onDone } = {}
) => {
  stopPop(host);
  const origin = {
    x: startTranslate?.x ?? 0,
    y: startTranslate?.y ?? 0,
  };
  const scale = createSpring(startScale, DRAW_SPRING);
  const translate = createSpring(origin, DRAW_SPRING);
  const rotateDelta = createSpring(flip ? DRAW_FLIP_DEGREES : 0, DRAW_SPRING);
  const paint = () => {
    const pose = drawFlightPose(
      translate.value,
      origin,
      scale.value,
      rotateDelta.value,
      arcSign
    );
    applyHostTransform(host, { x: pose.x, y: pose.y }, pose.scale, pose.rotateY);
  };
  const unsubs = [
    scale.subscribe(paint),
    translate.subscribe(paint),
    rotateDelta.subscribe(paint),
  ];
  const motion = {
    get rotateTarget() {
      return rotateDelta.target;
    },
    retreat() {},
    reset() {},
    stop() {
      unsubs.forEach((off) => off());
      scale.stop();
      translate.stop();
      rotateDelta.stop();
    },
  };
  activePops.set(host, motion);
  Promise.all([
    translate.set({ x: 0, y: 0 }),
    scale.set(1),
    rotateDelta.set(0),
  ]).then(() => {
    motion.stop();
    activePops.delete(host);
    onDone?.();
  });
  return motion;
};

/**
 * Spring a settled overlay card back to its prize-zone seat (no flip).
 */
export const playReturnFlight = (
  host,
  { endTranslate, endScale = 1, onDone } = {}
) => {
  stopPop(host);
  const scale = createSpring(1, DRAW_SPRING);
  const translate = createSpring({ x: 0, y: 0 }, DRAW_SPRING);
  const paint = () => {
    applyHostTransform(host, translate.value, scale.value, 0);
  };
  const unsubs = [scale.subscribe(paint), translate.subscribe(paint)];
  const motion = {
    get rotateTarget() {
      return 0;
    },
    retreat() {},
    reset() {},
    stop() {
      unsubs.forEach((off) => off());
      scale.stop();
      translate.stop();
    },
  };
  activePops.set(host, motion);
  Promise.all([
    translate.set({
      x: endTranslate?.x ?? 0,
      y: endTranslate?.y ?? 0,
    }),
    scale.set(endScale),
  ]).then(() => {
    motion.stop();
    activePops.delete(host);
    onDone?.();
  });
  return motion;
};

/** @deprecated overlay-centering helper; popover motion no longer uses it */
export const makePopFrame = (fullViewElement) => {
  if (!fullViewElement) return () => {};
  return (scale) => {
    fullViewElement.style.transform = `translate3d(0, 0, 0.1px) scale(${scale})`;
  };
};
