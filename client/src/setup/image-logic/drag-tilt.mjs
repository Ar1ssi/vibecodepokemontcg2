// Design 038: how a dragged card swings, measured frame by frame from TCG Live
// footage. The card rolls toward the way the pointer moves (rightward →
// clockwise), already near its ~14° limit at slow speeds, lagging the pointer
// by ~100 ms; moving up tips its top edge slightly away; there is no
// measurable yaw. When the pointer stops it eases back upright in ~250 ms.
// Live also shrinks the card as it crosses the board — deliberately NOT
// reproduced (user request): the avatar keeps the size it was picked up at.
// Pure and DOM-free so the feel is unit-tested; drag-avatar.js renders it.

export const DRAG_TILT = Object.freeze({
  maxRollDeg: 14,
  maxPitchDeg: 6,
  // Pointer speed (px/ms) at which a target reaches tanh(1) ≈ 76% of its max.
  rollSpeed: 0.3,
  pitchSpeed: 0.6,
  // Time constant smoothing the pointer velocity (mouse deltas are jittery).
  velocityTauMs: 40,
  // Angle spring: ω = √stiffness ≈ 19 rad/s, damping ratio ≈ 0.79 — it
  // settles in ~250 ms without a visible wobble, like the footage.
  stiffness: 360,
  damping: 30,
  // Integrate in sub-steps no longer than this; a longer frame gap (hidden
  // tab, stall) counts as maxFrameMs so the card never lurches on return.
  maxStepMs: 16,
  maxFrameMs: 100,
  perspectivePx: 900,
});

// The same spring and smoothing with no swing: reduced motion keeps the card
// under the pointer but flat.
export const DRAG_TILT_STILL = Object.freeze({
  ...DRAG_TILT,
  maxRollDeg: 0,
  maxPitchDeg: 0,
});

const isPoint = (point) =>
  Number.isFinite(point?.x) && Number.isFinite(point?.y);

const round = (value) => Math.round(value * 100) / 100 || 0;

/** A resting tilt state for a card picked up at `point`. */
export const createDragTilt = (point) => ({
  point: isPoint(point) ? { x: point.x, y: point.y } : { x: 0, y: 0 },
  velocity: { x: 0, y: 0 },
  roll: 0,
  rollRate: 0,
  pitch: 0,
  pitchRate: 0,
});

const saturate = (value, speed, max) =>
  max > 0 && speed > 0 ? max * Math.tanh(value / speed) : 0;

/**
 * Angles (degrees) the card leans toward for a pointer velocity in px/ms.
 * roll is CSS rotateZ (positive = clockwise); pitch is CSS rotateX
 * (positive = top edge away from the viewer).
 */
export const tiltTargets = (velocity, params = DRAG_TILT) => ({
  roll: saturate(velocity.x, params.rollSpeed, params.maxRollDeg),
  pitch: saturate(-velocity.y, params.pitchSpeed, params.maxPitchDeg),
});

const springStep = (angle, rate, target, dtSeconds, params) => {
  const accel = params.stiffness * (target - angle) - params.damping * rate;
  const nextRate = rate + accel * dtSeconds;
  return { angle: angle + nextRate * dtSeconds, rate: nextRate };
};

/**
 * Advance `state` by `dtMs` with the pointer now at `point`. Returns a new
 * state. A zero/invalid dt or an invalid point leaves the state unchanged,
 * so the displacement is counted on the next valid frame instead.
 */
export const stepDragTilt = (state, point, dtMs, params = DRAG_TILT) => {
  if (!isPoint(point) || !(dtMs > 0)) return state;
  // Speed is measured over the real gap; only the integration is capped.
  const rawX = (point.x - state.point.x) / dtMs;
  const rawY = (point.y - state.point.y) / dtMs;
  const elapsed = Math.min(dtMs, params.maxFrameMs);
  const blend = 1 - Math.exp(-elapsed / params.velocityTauMs);
  const velocity = {
    x: state.velocity.x + (rawX - state.velocity.x) * blend,
    y: state.velocity.y + (rawY - state.velocity.y) * blend,
  };
  const target = tiltTargets(velocity, params);

  let roll = { angle: state.roll, rate: state.rollRate };
  let pitch = { angle: state.pitch, rate: state.pitchRate };
  const steps = Math.max(1, Math.ceil(elapsed / params.maxStepMs));
  const dtSeconds = elapsed / steps / 1000;
  for (let i = 0; i < steps; i += 1) {
    roll = springStep(roll.angle, roll.rate, target.roll, dtSeconds, params);
    pitch = springStep(
      pitch.angle,
      pitch.rate,
      target.pitch,
      dtSeconds,
      params
    );
  }
  return {
    point: { x: point.x, y: point.y },
    velocity,
    roll: roll.angle,
    rollRate: roll.rate,
    pitch: pitch.angle,
    pitchRate: pitch.rate,
  };
};

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

/**
 * Where on the card the pointer holds it, in card px from its top-left. The
 * avatar pivots here, so the pointer stays on the same spot of the card.
 * Clamped into the card so a mapping mismatch never pivots off-card.
 */
export const grabOffset = (rect, point) => ({
  x: clamp(point.x - rect.left, 0, rect.width),
  y: clamp(point.y - rect.top, 0, rect.height),
});

/**
 * CSS transform for the avatar (a fixed box at 0,0 sized like the card, with
 * `transform-origin` at `grab`): puts the grab point under `pointer` and
 * applies the tilt. The function list matches returnTransform so a return
 * flight interpolates cleanly.
 */
export const dragAvatarTransform = (pointer, grab, tilt, params = DRAG_TILT) =>
  `translate3d(${round(pointer.x - grab.x)}px, ${round(pointer.y - grab.y)}px, 0px) ` +
  `perspective(${params.perspectivePx}px) rotateX(${round(tilt.pitch)}deg) ` +
  `rotateZ(${round(tilt.roll)}deg) scale(1)`;

/**
 * Transform that lands the avatar flat on `rect` (where a cancelled drag
 * returns to). `size` is the avatar's own box; if the source slot has changed
 * size since pickup, the avatar scales to fit it on landing.
 */
export const returnTransform = (rect, size, grab, params = DRAG_TILT) => {
  const scale = size.width > 0 && rect.width > 0 ? rect.width / size.width : 1;
  const x = rect.left - grab.x * (1 - scale);
  const y = rect.top - grab.y * (1 - scale);
  return (
    `translate3d(${round(x)}px, ${round(y)}px, 0px) ` +
    `perspective(${params.perspectivePx}px) rotateX(0deg) rotateZ(0deg) ` +
    `scale(${round(scale)})`
  );
};
