// Pure motion for the tabletop scene (design 073 Options 2): every animation is a function of
// t ∈ [0, 1] (or of a time / velocity) sampled on the stage's one clock. Units: mm and degrees.

export const LID_OPEN_DEG = 118;
// easeOutBack's c1: the lid swings ~5 % past open and the board springs back.
const LID_OVERSHOOT = 1.2;
// A lid let go before this far open falls shut again.
export const LID_OPEN_AT = 0.35;

const clamp01 = (value) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);
const lerp = (from, to, t) => from + (to - from) * t;

export const easeInOutCubic = (t) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};
export const easeOutCubic = (t) => 1 - (1 - clamp01(t)) ** 3;
export const easeInCubic = (t) => clamp01(t) ** 3;

/** Hermite smoothstep of `x` between `edge0` and `edge1`. */
export function smoothstep(edge0, edge1, x) {
  if (!(edge1 > edge0)) return x >= edge1 ? 1 : 0;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** easeOutBack: overshoots past 1 by `c1 / 3 · s²` at s = −2c1 / 3(c1 + 1), lands on 1. */
export function easeOutBack(t, c1 = LID_OVERSHOOT) {
  const x = clamp01(t);
  if (x === 0 || x === 1) return x;
  const s = x - 1;
  return 1 + (c1 + 1) * s ** 3 + c1 * s ** 2;
}

// A shut lid gives this much (degrees) as the finger unsticks it, before it swings.
const LID_CREEP_DEG = 6;

/**
 * The lid's hinge angle while it swings open. From rest it creeps a few degrees as the finger
 * unsticks it, then swings past open and the board springs back; a lid already moving by hand
 * (`fromRest: false`) just swings on.
 */
export function lidAngleDeg(t, { fromRest = true } = {}) {
  if (!fromRest) return LID_OPEN_DEG * easeOutBack(t);
  const creep = LID_CREEP_DEG * smoothstep(0, 0.3, t);
  return creep + (LID_OPEN_DEG - LID_CREEP_DEG) * easeOutBack(smoothstep(0.12, 1, t));
}

/**
 * A point on a lifted arc from `from` to `to` (a quadratic Bézier), eased in and out. Its control
 * point sits `lift` mm above the midpoint, at the higher end's height (`over: 'higher'`: a toss,
 * which first rises above both ends) or the chord's (`over: 'chord'`: a hand's carry between the
 * table and the eye, which never climbs past the higher end, so seen from above it rises
 * steadily into view instead of overshooting and dropping back).
 * @returns {{x: number, y: number, z: number, s: number}} `s` is the eased progress, for rotations.
 */
export function arcPoint(from, to, t, lift = 60, { over = 'higher' } = {}) {
  const s = easeInOutCubic(t);
  const base = over === 'chord' ? (from.y + to.y) / 2 : Math.max(from.y, to.y);
  const control = {
    x: (from.x + to.x) / 2,
    y: base + lift,
    z: (from.z + to.z) / 2,
  };
  const a = (1 - s) ** 2;
  const b = 2 * (1 - s) * s;
  const c = s ** 2;
  return {
    x: a * from.x + b * control.x + c * to.x,
    y: a * from.y + b * control.y + c * to.y,
    z: a * from.z + b * control.z + c * to.z,
    s,
  };
}

/** A landing's small rebound, mm above rest: 0 at both ends, decaying. */
export function settleBounce(t, amplitude = 1.6) {
  const x = clamp01(t);
  return amplitude * Math.exp(-5 * x) * Math.abs(Math.sin(3 * Math.PI * x)) * (1 - x);
}

/**
 * Shrink-wrap coming off: the film splits from the grabbed point (`open`), lifts away from the box
 * (`lift`) and balls up (`crumple`) on its way to the table.
 */
export function wrapPeelPose(t) {
  const x = clamp01(t);
  return {
    open: smoothstep(0, 0.3, x),
    lift: smoothstep(0.2, 0.75, x),
    crumple: smoothstep(0.3, 1, x),
  };
}

/** A clear wrap peeled off a deck: the seam opens, then the film slides off toward `side`. */
export function deckWrapPose(t) {
  const x = clamp01(t);
  return { open: smoothstep(0, 0.35, x), slide: easeInCubic(smoothstep(0.3, 1, x)) };
}

/**
 * The card stack drawn out of a torn pack: 0 inside, 1 clear of the mouth. The fingers pull in two
 * strokes, with a short catch between them.
 */
export function stackPullPose(t) {
  const x = clamp01(t);
  const first = 0.55 * easeInOutCubic(smoothstep(0, 0.45, x));
  const second = 0.45 * easeInOutCubic(smoothstep(0.55, 1, x));
  return first + second;
}

/**
 * The front card sliding off the stack in the hand: sideways by up to a card width toward `side`,
 * turning slightly; afterwards it travels to its table spot on an arc.
 * @returns {{dx: number, rotZDeg: number}} `dx` in card widths.
 */
export function slideOffPose(t, side = 1) {
  const s = easeOutCubic(t);
  return { dx: side * 1.05 * s, rotZDeg: -side * 7 * Math.sin(Math.PI * clamp01(t)) };
}

/** A card turned over in the hand: rotation about its long axis with a lift at mid-turn. */
export function cardTurnPose(t) {
  const s = easeInOutCubic(t);
  return { angleDeg: 180 * s, lift: 14 * Math.sin(Math.PI * s) };
}

/**
 * A critically damped spring step toward `target` (semi-implicit Euler). Used for anything that
 * follows the pointer (the held item's tilt, the lid under a finger).
 * @returns {{value: number, velocity: number}}
 */
export function springStep(value, velocity, target, dtMs, stiffness = 170) {
  const dt = Math.min(0.05, Math.max(0, (Number(dtMs) || 0) / 1000));
  if (dt === 0) return { value, velocity };
  const damping = 2 * Math.sqrt(stiffness);
  const accel = stiffness * (target - value) - damping * velocity;
  const nextVelocity = velocity + accel * dt;
  return { value: value + nextVelocity * dt, velocity: nextVelocity };
}

/** Hands are never quite still: the held item's slow drift. */
export function handSway(timeMs) {
  const t = (Number(timeMs) || 0) / 1000;
  return {
    rotXDeg: 0.9 * Math.sin(t * 1.3) + 0.35 * Math.sin(t * 3.1 + 1.7),
    rotYDeg: 1.3 * Math.sin(t * 0.9 + 0.6) + 0.4 * Math.sin(t * 2.3),
    y: 0.7 * Math.sin(t * 1.1 + 2.1),
  };
}

/** @returns {{position: object, target: object, fov: number}} the camera between two poses. */
export function cameraBlend(from, to, t) {
  const s = easeInOutCubic(t);
  const mix = (a, b) => ({ x: lerp(a.x, b.x, s), y: lerp(a.y, b.y, s), z: lerp(a.z, b.z, s) });
  return {
    position: mix(from.position, to.position),
    target: mix(from.target, to.target),
    fov: lerp(from.fov, to.fov, s),
  };
}

// ── The TCG Pocket tear's light (design 073, iteration 13) ─────────────────
// Timed frame by frame on a 60 fps TCG Pocket screen recording: the flash and the rainbow halo
// peak ~70 ms after the finger finishes the cut, the halo folds flat into a beam across the
// screen, the beam thins to a hairline by ~230 ms and is gone by ~320 ms, and the cut edge glints
// cyan as the strip springs away.
export const POCKET_TEAR_MS = 1000;
// The beam's height (mm, on a 66 mm pack) while it is whole, and how fast it thins after.
const BEAM_MM = 9;
const BEAM_THIN_MS = 50;

/**
 * The tear's light `ms` after the cut completes; every part 0 → 1 except `haloScale` (×) and
 * `beamMm` (mm). Only the white-hot cut is lit at 0; all is dark by POCKET_TEAR_MS.
 * @returns {{cut: number, flash: number, halo: number, haloScale: number, haloSquash: number,
 *   beam: number, beamMm: number, glint: number}}
 */
export function pocketTearLight(ms) {
  const t = Number.isFinite(ms) ? Math.max(0, ms) : 0;
  return {
    // The white-hot cut the finger left melts into the flash.
    cut: 1 - smoothstep(60, 140, t),
    // A yellow-white wash over the header.
    flash: smoothstep(0, 40, t) * (1 - smoothstep(70, 240, t)),
    // An elliptical rainbow ring round the cut, which grows a little, then folds flat into the beam.
    halo: smoothstep(0, 25, t) * (1 - smoothstep(55, 120, t)),
    haloScale: 0.86 + 0.24 * smoothstep(0, 90, t),
    haloSquash: 1 - 0.85 * smoothstep(50, 110, t),
    beam: smoothstep(40, 80, t) * (1 - smoothstep(200, 320, t)),
    beamMm: t < 75 ? BEAM_MM : BEAM_MM * Math.exp(-(t - 75) / BEAM_THIN_MS),
    glint: smoothstep(110, 180, t) * (1 - smoothstep(350, POCKET_TEAR_MS, t)),
  };
}

/**
 * How far a drag across a torn edge has torn, from the pointer's travel along the edge.
 * @returns {number} 0..1
 */
export function dragProgress(travelPx, lengthPx) {
  if (!(lengthPx > 0)) return 0;
  return clamp01(travelPx / lengthPx);
}
