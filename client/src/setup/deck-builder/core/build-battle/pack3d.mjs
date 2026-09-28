// The Build & Battle 3D packs as pure data (design 054 § Pure API). No DOM, no three.js: the
// WebGL stage (`sidebox/native-deck-builder-pack3d.js`) samples these on its animation clock.
// World units: the pack is 1 wide; y points up; the camera looks down −z at the z = 0 plane.

import {
  cubicBezier,
  packFlyPose,
  packSpreadSlot,
  packTearPoints,
} from './unboxing.mjs';

// ── Pack shape (measured on the vendored 780 × 1426 art) ────────────────────
export const PACK_ASPECT = 1426 / 780;
// Rows 0–148 and 1277–1425 are the flat crimped seals; the body between is opaque from x 17 to 762.
export const SEAL_TOP_V = 149 / 1426;
export const SEAL_BOTTOM_V = 1277 / 1426;
export const BODY_INSET_U = 17 / 780;
export const BULGE = 0.05;
export const BULGE_RAMP_V = 0.06;
// The strip mesh covers the top of the art down past the deepest tooth (7 % + 5 %).
export const STRIP_V = 0.12;

// ── Peel, rip, flight ───────────────────────────────────────────────────────
export const PEEL_MAX_DEG = 150;
export const PEEL_BAND = 0.18;
export const PEEL_CURL = 0.35;
export const GRAB_LEVEL_MS = 120;
export const RIP_FINISH_MS = 140;
export const RIP_TICK_STEP = 0.1;
export const STRIP_FLIGHT_MS = 650;
export const STRIP_GRAVITY = -6;
export const STRIP_FADE_FROM = 0.6;
const STRIP_VELOCITY = { x: 1.6, y: 1.2, z: 0.6 };
const STRIP_SPIN = { x: -3.5, y: 1.2, z: 4.2 };

// ── Cards out, pack away ────────────────────────────────────────────────────
export const CARDS_RISE_MS = 420;
export const CARDS_RISE_AT = 0.55;
export const CARDS_FROM_V = -0.62;
export const CARDS_TO_V = 0.5;
export const PACK_DROP_MS = 520;
export const PACK_DROP_AT = 0.45;
export const PACK_DROP_ROTATE_X_DEG = -14;
const PACK_DROP_VIEWPORTS = 1.4;
export const STACK_SETTLE_MS = 280;
export const STACK_CARD_WIDTH = 0.62;
export const STACK_CARD_ASPECT = 88 / 63;
export const STACK_DEPTH = 0.035;

// ── Motion at rest ──────────────────────────────────────────────────────────
export const TILT_MAX_Y_DEG = 14;
export const TILT_MAX_X_DEG = 10;
export const TILT_FOLLOW_PER_S = 10;
export const SWAY_Y_DEG = 4;
export const SWAY_X_DEG = 2;
export const SWAY_BOB = 0.006;
export const SWAY_PERIOD_Y_MS = 3200;
export const SWAY_PERIOD_X_MS = 4100;
const SWAY_PHASE_PER_PACK = 0.9;
export const FLY_SPIN_Y_DEG = -180;
export const SPREAD_SIDE_Z = -0.4;
export const SPREAD_SIDE_ROTATE_Y_DEG = -18;

// ── Camera and textures ─────────────────────────────────────────────────────
export const CAMERA_FOV_DEG = 30;
export const CAMERA_DISTANCE = 6;
export const PIXEL_RATIO_MAX = 2;
export const CARD_TEXTURE_TIMEOUT_MS = 1500;

const TICK_EPSILON = 1e-9;

const clamp01 = (value) =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
const clampUnit = (value) =>
  Number.isFinite(value) ? Math.min(1, Math.max(-1, value)) : 0;
const lerp = (from, to, t) => from + (to - from) * t;
const easeLift = cubicBezier(0.2, 0.8, 0.2, 1);
const radians = (deg) => (deg * Math.PI) / 180;

/** Hermite smoothstep of `x` between `edge0` and `edge1`, 0..1. */
export function smoothstep(edge0, edge1, x) {
  if (!(edge1 > edge0)) return x >= edge1 ? 1 : 0;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

const isRect = (rect) =>
  Number.isFinite(rect?.left) &&
  Number.isFinite(rect?.top) &&
  rect.width > 0 &&
  rect.height > 0;

/**
 * How far the front face bulges toward the camera at art coordinates `u, v` (v = 0 at the top):
 * 0 on both seals and outside the body columns, `BULGE` at the body's centre. The back uses −z.
 */
export function pillowZ(u, v) {
  if (!Number.isFinite(u) || !Number.isFinite(v)) return 0;
  if (v < SEAL_TOP_V || v > SEAL_BOTTOM_V) return 0;
  if (u < BODY_INSET_U || u > 1 - BODY_INSET_U) return 0;
  const uBody = (u - BODY_INSET_U) / (1 - 2 * BODY_INSET_U);
  const across = Math.sin(Math.PI * uBody) ** 0.6;
  const along = smoothstep(
    0,
    BULGE_RAMP_V,
    Math.min(v - SEAL_TOP_V, SEAL_BOTTOM_V - v)
  );
  return BULGE * across * along;
}

/**
 * The pack's tear line (`packTearPoints`, the same seeded line the DOM clip-path cuts) in art
 * coordinates 0..1, ordered left → right.
 *
 * @returns {{x: number, y: number}[]}
 */
export function packTearLine(seed, packIndex, teeth = 12) {
  return packTearPoints(seed, packIndex, teeth)
    .map(({ xPct, yPct }) => ({ x: xPct / 100, y: yPct / 100 }))
    .reverse();
}

/** @returns {number} the fold axis of the strip: the mean depth of the tear line, in v. */
export function tearHingeV(line) {
  if (!Array.isArray(line) || line.length === 0) return 0;
  return line.reduce((sum, point) => sum + point.y, 0) / line.length;
}

/** @returns {1|-1} 1 when the tear runs left → right (the press landed in the left half). */
export function peelSide(pointerXPx, rect) {
  if (!Number.isFinite(pointerXPx) || !isRect(rect)) return 1;
  return pointerXPx < rect.left + rect.width / 2 ? 1 : -1;
}

/**
 * How far column `u` of the strip has folded back while the finger is `progress` across: the
 * columns the finger has passed are folded, a `PEEL_BAND` wide crease follows the finger.
 */
export function peelAngleDeg(u, progress, side = 1) {
  const along = side === -1 ? 1 - clamp01(u) : clamp01(u);
  const reach = clamp01(progress) * (1 + PEEL_BAND);
  return PEEL_MAX_DEG * smoothstep(0, PEEL_BAND, reach - along);
}

/**
 * A strip vertex folded `angleDeg` about the horizontal hinge at `hingeY` toward the camera (+z).
 * Points farther above the hinge fold a little further (`PEEL_CURL`), so the strip curls.
 */
export function peelVertex({ y, z }, { hingeY, angleDeg }) {
  if (!angleDeg || !Number.isFinite(angleDeg)) return { y, z };
  const dy = y - hingeY;
  const angle = radians(angleDeg * (1 + PEEL_CURL * Math.max(0, dy)));
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { y: hingeY + dy * cos - z * sin, z: dy * sin + z * cos };
}

/**
 * The torn strip flying off as a rigid body, `t` 0..1 of `STRIP_FLIGHT_MS`: offsets in world units
 * from where it tore, rotations in radians, fading out over the last 40 %.
 */
export function stripFlightPose(t, { side = 1 } = {}) {
  const x = clamp01(t);
  const s = (x * STRIP_FLIGHT_MS) / 1000;
  const dir = side === -1 ? -1 : 1;
  return {
    x: STRIP_VELOCITY.x * dir * s,
    y: STRIP_VELOCITY.y * s + 0.5 * STRIP_GRAVITY * s * s,
    z: STRIP_VELOCITY.z * s,
    rotX: STRIP_SPIN.x * s,
    rotY: STRIP_SPIN.y * dir * s,
    rotZ: STRIP_SPIN.z * dir * s,
    opacity: 1 - smoothstep(STRIP_FADE_FROM, 1, x),
  };
}

/** @returns {{v: number}} the card stack's offset out of the mouth, in pack heights. */
export function cardsEmergePose(t) {
  return { v: lerp(CARDS_FROM_V, CARDS_TO_V, easeLift(clamp01(t))) };
}

/** The emptied pack falling away below the screen and tipping back. */
export function packDropPose(t, { viewportWorldH = 0 } = {}) {
  const x = clamp01(t);
  const height = Number.isFinite(viewportWorldH) ? viewportWorldH : 0;
  return {
    y: -PACK_DROP_VIEWPORTS * height * x * x,
    rotateXDeg: PACK_DROP_ROTATE_X_DEG * easeLift(x),
  };
}

/** `packFlyPose` plus a half turn about y: the silver back shows first, then the front turns in. */
export function packFlyPose3d(t, params) {
  return {
    ...packFlyPose(t, params),
    rotateYDeg: lerp(FLY_SPIN_Y_DEG, 0, easeLift(clamp01(t))),
  };
}

/** `packSpreadSlot` plus depth: the queued packs sit back and turn toward the centre. */
export function packSpreadSlot3d(index, focus, spacingPx) {
  const slot = packSpreadSlot(index, focus, spacingPx);
  const offset = index - focus;
  if (!Number.isFinite(offset) || offset === 0)
    return { ...slot, zWorld: 0, rotateYDeg: 0 };
  return {
    ...slot,
    zWorld: SPREAD_SIDE_Z,
    rotateYDeg: SPREAD_SIDE_ROTATE_Y_DEG * Math.sign(offset),
  };
}

/** The idle float of pack `packIndex` at `timeMs`, out of phase with its neighbours. */
export function swayPose(timeMs, packIndex = 0) {
  if (!Number.isFinite(timeMs)) return { rotateYDeg: 0, rotateXDeg: 0, bob: 0 };
  const phase =
    (Number.isFinite(packIndex) ? packIndex : 0) * SWAY_PHASE_PER_PACK;
  const alongY = (2 * Math.PI * timeMs) / SWAY_PERIOD_Y_MS + phase;
  const alongX = (2 * Math.PI * timeMs) / SWAY_PERIOD_X_MS + phase;
  return {
    rotateYDeg: SWAY_Y_DEG * Math.sin(alongY),
    rotateXDeg: SWAY_X_DEG * Math.sin(alongX),
    bob: SWAY_BOB * Math.sin(alongX + Math.PI / 2),
  };
}

/**
 * The tilt that turns the pack's face toward the pointer (the pointed-at side sinks back):
 * `pointer` in client pixels, `rect` the pack's client rect.
 */
export function tiltTarget(pointer, rect) {
  if (
    !Number.isFinite(pointer?.x) ||
    !Number.isFinite(pointer?.y) ||
    !isRect(rect)
  ) {
    return { rotateYDeg: 0, rotateXDeg: 0 };
  }
  const nx = clampUnit(
    (pointer.x - (rect.left + rect.width / 2)) / (rect.width / 2)
  );
  // Up is positive, as in world space.
  const ny = clampUnit(
    (rect.top + rect.height / 2 - pointer.y) / (rect.height / 2)
  );
  return { rotateYDeg: TILT_MAX_Y_DEG * nx, rotateXDeg: -TILT_MAX_X_DEG * ny };
}

/** One frame of the tilt easing toward `target`, frame-rate independent. */
export function followTilt(current, target, dtMs) {
  if (!(dtMs > 0)) return current;
  const k = 1 - Math.exp((-TILT_FOLLOW_PER_S * dtMs) / 1000);
  return {
    rotateYDeg: lerp(current.rotateYDeg, target.rotateYDeg, k),
    rotateXDeg: lerp(current.rotateXDeg, target.rotateXDeg, k),
  };
}

/** @returns {number} world units per CSS pixel on the z = 0 plane; 0 for an empty viewport. */
export function worldPerPixel(viewportHeightPx) {
  if (!(viewportHeightPx > 0)) return 0;
  return (
    (2 * CAMERA_DISTANCE * Math.tan(radians(CAMERA_FOV_DEG) / 2)) /
    viewportHeightPx
  );
}

/**
 * A client rect as a centre and size on the z = 0 plane (origin at the viewport centre, y up).
 *
 * @returns {{x: number, y: number, width: number, height: number}|null} null for an empty rect
 */
export function rectToWorld(rect, viewport) {
  if (!isRect(rect) || !(viewport?.width > 0) || !(viewport?.height > 0))
    return null;
  const scale = worldPerPixel(viewport.height);
  return {
    x: (rect.left + rect.width / 2 - viewport.width / 2) * scale,
    y: (viewport.height / 2 - (rect.top + rect.height / 2)) * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  };
}

/** @returns {number} whole `RIP_TICK_STEP` marks crossed going from `previous` up to `next`. */
export function ripTicksCrossed(previous, next) {
  if (!(clamp01(next) > clamp01(previous))) return 0;
  const marks = (value) =>
    Math.floor(clamp01(value) / RIP_TICK_STEP + TICK_EPSILON);
  return marks(next) - marks(previous);
}
