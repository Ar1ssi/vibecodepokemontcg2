// Pure math for the deck customization stage (design 071): which pose each of the three objects takes
// in Preview All and Focused, how a pose blends, and where the coin's own canvas sits on the stage.
// DOM-free and three-free so node tests cover it; object-stage.js and customize-stage.js apply it.
//
// Poses are `{ p, q, s }` (position, unit quaternion x y z w, scale) in scene.json's three space:
// the camera sits at the origin looking down -z and the slots hang under a holder 5200 units ahead.
import { COIN_CAMERA } from '../../../netcode/mat-fx/coin-stage-math.mjs';

export const SLOTS = Object.freeze(['box', 'sleeve', 'coin']);

/** A slot that is not shown keeps its grouped place and shrinks to this scale (the game's own hide). */
export const HIDDEN_SCALE = 1e-4;
/** Seconds a slot takes to move between layouts (DeckCustomizationObjectAnimation). */
export const SLIDE_SECONDS = 0.45;
/** The focused object's slow spin (DeckCustomizationDragToRotate). */
export const PASSIVE_DEGREES_PER_SECOND = 10;
/** Radians of yaw per pixel dragged. */
export const DRAG_RADIANS_PER_PIXEL = 0.01;

/** Unity's built-in Plane is 10 units across; the floor seen at a grazing angle squashes its depth. */
const SHADOW_PLANE_UNITS = 10;
const SHADOW_FLATTEN = 0.45;

const rotateByQuaternion = ([qx, qy, qz, qw], [x, y, z]) => {
  // v' = v + 2w(q×v) + 2(q×(q×v))
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  return [
    x + qw * tx + (qy * tz - qz * ty),
    y + qw * ty + (qz * tx - qx * tz),
    z + qw * tz + (qx * ty - qy * tx),
  ];
};

/** Where a point given in `parent`'s local space lands in the parent's own parent space. */
export const composePoint = (parent, local) => {
  const scaled = local.map((value, index) => value * parent.s[index]);
  const rotated = rotateByQuaternion(parent.q, scaled);
  return rotated.map((value, index) => value + parent.p[index]);
};

const lerp = (a, b, t) => a + (b - a) * t;

const slerp = (a, b, t) => {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const target = dot < 0 ? b.map((value) => -value) : b;
  dot = Math.abs(dot);
  if (dot > 0.9995) {
    const mixed = a.map((value, index) => lerp(value, target[index], t));
    const length = Math.hypot(...mixed) || 1;
    return mixed.map((value) => value / length);
  }
  const theta = Math.acos(dot);
  const sinTheta = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / sinTheta;
  const wb = Math.sin(t * theta) / sinTheta;
  return a.map((value, index) => value * wa + target[index] * wb);
};

/** `a` at t = 0, `b` at t = 1; t outside [0, 1] is clamped. */
export function blendPose(a, b, t) {
  const k = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 1));
  return {
    p: a.p.map((value, index) => lerp(value, b.p[index], k)),
    q: slerp(a.q, b.q, k),
    s: a.s.map((value, index) => lerp(value, b.s[index], k)),
  };
}

const hidden = (pose) => ({ p: [...pose.p], q: [...pose.q], s: pose.s.map(() => HIDDEN_SCALE) });

/**
 * The pose and visibility of every slot. `focus` null is Preview All; a slot name is Focused: that
 * slot goes to its focused pose centred on x = 0 and the others shrink away in place.
 *
 * @returns {Record<'box'|'sleeve'|'coin', { visible: boolean, pose: { p: number[], q: number[], s: number[] } }>}
 */
export function layoutFor(scene, focus) {
  const layout = {};
  for (const slot of SLOTS) {
    const { grouped, focused } = scene.slots[slot];
    if (focus === null || focus === undefined) {
      layout[slot] = { visible: true, pose: { p: [...grouped.p], q: [...grouped.q], s: [...grouped.s] } };
    } else if (slot === focus) {
      layout[slot] = { visible: true, pose: { p: [0, focused.p[1], focused.p[2]], q: [...focused.q], s: [...focused.s] } };
    } else {
      layout[slot] = { visible: false, pose: hidden(grouped) };
    }
  }
  return layout;
}

/**
 * Where a point in the stage's three space lands in a `width`×`height` px stage (y down), and how many
 * pixels one world unit is there. The holder's tilt is applied; the camera is at the origin.
 */
export function projectPoint(scene, point, { width, height }) {
  const [x, y, z] = rotateByQuaternion(scene.holder.q, point);
  const depth = scene.distance - z;
  const halfTan = Math.tan((scene.fov * Math.PI) / 360);
  const pxPerUnit = height / 2 / (depth * halfTan);
  return { x: width / 2 + x * pxPerUnit, y: height / 2 - y * pxPerUnit, pxPerUnit };
}

/**
 * The square the coin's own canvas fills: centred on the disc, sized so the disc fills the coin
 * stage's `discFill` of it. `radius` is the disc mesh's radius in its own units.
 *
 * @returns {{ x: number, y: number, side: number }} centre and side length in stage px
 */
export function coinFrame(scene, pose, size, radius) {
  const { pivot, mesh } = scene.slots.coin;
  const centre = composePoint(pose, composePoint(pivot, mesh.p));
  const { x, y, pxPerUnit } = projectPoint(scene, centre, size);
  const diameter = 2 * radius * mesh.s[0] * pivot.s[0] * pose.s[0];
  return { x, y, side: (diameter * pxPerUnit) / COIN_CAMERA.discFill };
}

/** Yaw in radians after `elapsedSeconds` of passive spin. */
export const passiveYaw = (elapsedSeconds) =>
  (Math.max(0, elapsedSeconds) * PASSIVE_DEGREES_PER_SECOND * Math.PI) / 180;

export const dragYaw = (startYaw, dxPixels) => startYaw + dxPixels * DRAG_RADIANS_PER_PIXEL;

/** The index `dir` (±1) steps from `index` in a list of `length`, wrapping; 0 for an empty list. */
export function nextIndex(index, dir, length) {
  if (!Number.isInteger(length) || length <= 0) return 0;
  return (((index + dir) % length) + length) % length;
}

/** A pose's rotation about the vertical axis in degrees; the coin stage takes its yaw in degrees. */
export const yawDegrees = (q) => (2 * Math.atan2(q[1], q[3]) * 180) / Math.PI;

/**
 * The coin's floor shadow as a flattened ellipse under the disc: centre and size in stage px. The game's
 * plane is 600×380 units at the slot origin, seen from about 15 degrees above the floor.
 *
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
export function coinShadowFrame(scene, pose, size) {
  const { shadow } = scene.slots.coin;
  const centre = composePoint(pose, shadow.p);
  const { x, y, pxPerUnit } = projectPoint(scene, centre, size);
  const width = SHADOW_PLANE_UNITS * shadow.s[0] * pose.s[0] * pxPerUnit;
  return { x, y, width, height: width * SHADOW_FLATTEN };
}
