/**
 * Where a flying card's mesh goes for a mat-fx pose (design 074 H1): the 2D flights describe a card
 * as a viewport rect plus a turn and a lean; this turns that into a world position, rotation and
 * scale for the card's mesh under the board camera. Pure: no `three`, runs under `node --test`.
 */
import { DEFAULT_TILT_DEG } from '../sizing/table-tilt.mjs';
import { projectToScreen, screenToPlane, tableToWorld } from './board-camera.mjs';

const DEG = Math.PI / 180;
/** Scale fixed-point passes: perspective makes the projected height only near-linear in scale. */
const SCALE_PASSES = 3;

const axisAngle = (axis, deg) => {
  const half = (deg * DEG) / 2;
  const s = Math.sin(half);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)];
};

/** Hamilton product a·b (apply b first, then a), as [x, y, z, w]. */
const multiply = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];

const finite = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);

const usableRect = (rect) =>
  Boolean(rect) &&
  [rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) &&
  rect.width > 0 &&
  rect.height > 0;

/**
 * @param {ReturnType<typeof import('./board-camera.mjs').cameraFromCssTilt>} camera
 * @param {{ rect: { left: number, top: number, width: number, height: number },
 *   rotateZDeg?: number, tiltXDeg?: number, lift?: number, flipDeg?: number }} pose
 *   `rect` is the card's unturned box in viewport px; `rotateZDeg` turns it on screen clockwise (CSS
 *   `rotate`), `tiltXDeg` leans its top edge away (CSS `rotateX`), `lift` is table px above the cloth,
 *   `flipDeg` turns it about its vertical axis (180 = back up, CSS `rotateY`).
 * @param {{ widthPx: number, heightPx: number }} card the mesh geometry's width and height
 * @param {{ left: number, top: number }} [origin] the canvas's box in viewport px
 * @returns {{ position: number[], quaternion: number[], scale: number } | null}
 *   null when the rect is unusable or the ray from its centre misses the plane. The mesh's centre
 *   projects onto the rect's centre and, unturned and unleaned, its height onto the rect's height.
 */
export function flightPlacement(camera, pose, card, origin = { left: 0, top: 0 }) {
  const rect = pose?.rect;
  if (!camera || !usableRect(rect) || !(card?.heightPx > 0)) return null;
  const lift = finite(pose.lift);
  const centre = screenToPlane(
    camera,
    { x: rect.left + rect.width / 2 - finite(origin.left), y: rect.top + rect.height / 2 - finite(origin.top) },
    lift
  );
  if (!centre) return null;

  const tiltDeg = camera.tiltDeg ?? DEFAULT_TILT_DEG;
  const tilt = tiltDeg * DEG;
  // The card's own up on screen, as an angle in the table frame (broadcast turns the table 90°).
  const up = camera.up ?? [0, 1, 0];
  const upDeg = Math.atan2(-up[0], up[1]) / DEG;
  const tableCentre = { x: centre.x, y: centre.y * Math.cos(tilt) - centre.z * Math.sin(tilt) };
  const dir = [-Math.sin(upDeg * DEG), Math.cos(upDeg * DEG)];

  const projectedHeight = (scale) => {
    const reach = (card.heightPx * scale) / 2;
    const [a, b] = [1, -1].map((sign) =>
      projectToScreen(
        camera,
        tableToWorld({ x: tableCentre.x + sign * reach * dir[0], y: tableCentre.y + sign * reach * dir[1], z: lift }, camera)
      )
    );
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  let scale = 1;
  for (let pass = 0; pass < SCALE_PASSES; pass += 1) {
    const measured = projectedHeight(scale);
    if (!(measured > 0)) break;
    scale *= rect.height / measured;
  }
  if (!(scale > 0) || !Number.isFinite(scale)) return null;

  // Table tilt ∘ turn on the cloth ∘ lean about the card's own x ∘ flip about its y.
  const X = [1, 0, 0];
  const Y = [0, 1, 0];
  const Z = [0, 0, 1];
  let quaternion = axisAngle(Y, finite(pose.flipDeg));
  quaternion = multiply(axisAngle(X, -finite(pose.tiltXDeg)), quaternion);
  quaternion = multiply(axisAngle(Z, upDeg - finite(pose.rotateZDeg)), quaternion);
  quaternion = multiply(axisAngle(X, -tiltDeg), quaternion);

  return { position: [centre.x, centre.y, centre.z], quaternion, scale };
}

/** A card in flight rides this share of its height above the cloth (design 074 H1). */
export const FLIGHT_LIFT_FRAC = 0.3;
/** Share of a track over which the flight rises off the cloth at its start and settles at its end. */
const LIFT_RAMP = 0.15;

const smoothstep = (x) => x * x * (3 - 2 * x);

/**
 * A 2D mat-fx track sample as a mesh pose. `p` is what the `*-pose.mjs` modules return at progress
 * `u` (`x`/`y` px from the centre of `rect`, `scale` of it, `rotate`, `tiltX`, optional `flip`);
 * `opacity` has no mesh equivalent and is dropped. The card rises to `liftPx` over the first and
 * falls back over the last LIFT_RAMP of the track, so it leaves and lands on the cloth.
 * @returns {{ rect: object, rotateZDeg: number, tiltXDeg: number, lift: number, flipDeg?: number }}
 */
export function flightPoseFromTrack(rect, p, u, liftPx) {
  const scale = finite(p?.scale, 1);
  const width = rect.width * scale;
  const height = rect.height * scale;
  const cx = rect.left + rect.width / 2 + finite(p?.x);
  const cy = rect.top + rect.height / 2 + finite(p?.y);
  const edge = Math.min(1, Math.max(0, Math.min(u / LIFT_RAMP, (1 - u) / LIFT_RAMP)));
  const pose = {
    rect: { left: cx - width / 2, top: cy - height / 2, width, height },
    rotateZDeg: finite(p?.rotate),
    tiltXDeg: finite(p?.tiltX),
    lift: finite(liftPx) * smoothstep(edge),
  };
  if (Number.isFinite(p?.flip)) pose.flipDeg = p.flip;
  return pose;
}
