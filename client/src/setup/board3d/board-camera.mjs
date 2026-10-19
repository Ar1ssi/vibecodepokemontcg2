/**
 * Camera for the three.js board (design 074 §D3 "Units and camera", O4-A):
 * a pinhole camera whose image of the table equals today's CSS tilt
 * `translateY(shift) perspective(p) rotateX(a)` about the `table-tilt.mjs`
 * pivot, so the 3D board lands on the same screen px as the iframe board.
 *
 * World frame (1 unit = 1 flat CSS px, right-handed): origin at the pivot,
 * x to the screen's right, y up the screen, z toward the viewer. The flat
 * table of `flatLayout` (x right, y up the table, z off the cloth) is that
 * frame rotated by `tiltDeg` about the x-axis, so the far edge recedes
 * (z < 0). The eye sits at `(0, 0, perspectivePx)`, which is exactly where
 * CSS `perspective()` puts it: on the transform-origin (the pivot), p in
 * front of the screen plane.
 *
 * Pure and DOM-free (no `three` import) so it runs under `node --test`.
 */

import {
  DEFAULT_PERSPECTIVE_PX,
  DEFAULT_TILT_DEG,
  tiltTransforms,
} from '../sizing/table-tilt.mjs';
import { HAND_CROP_FRAC, depthOf, flatLayout, halfFromViewport } from './board-layout.mjs';

const DEG = Math.PI / 180;
/** Near plane in px: well inside any lifted card's distance to the eye. */
const NEAR_PX = 1;
/** Far plane as a multiple of the eye distance: past the far edge at any tilt. */
const FAR_FACTOR = 10;

/**
 * Flat table point → world point. `z` is height above the cloth (default 0).
 * Accepts the camera description as options, so `tableToWorld(p, camera)`
 * uses the camera's own tilt (0 in the broadcast pose).
 *
 * Rotation about x by -a: (x, y, z) → (x, y·cos a + z·sin a, -y·sin a + z·cos a).
 */
export function tableToWorld({ x, y, z = 0 }, { tiltDeg = DEFAULT_TILT_DEG } = {}) {
  const rad = tiltDeg * DEG;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [x, y * cos + z * sin, -y * sin + z * cos];
}

/** Vertical field of view whose focal length in px is `perspectivePx` over `viewportH`. */
const fovFor = (viewportH, perspectivePx) => (2 * Math.atan(viewportH / 2 / perspectivePx)) / DEG;

/**
 * three's `setViewOffset(fullWidth, fullHeight, x, y, width, height)` keeps the
 * principal axis at the centre of the full image and renders the window that
 * starts at (x, y) in it. With full = window = viewport, offsetting the window
 * by (W/2 - px, H/2 - py) moves the principal point to (px, py) while the
 * vertical fov still spans `fullHeight` = H, so focal length stays
 * (H/2) / tan(fov/2) = perspectivePx. Offsets may be negative; three only
 * scales them into the frustum bounds.
 */
const viewOffsetFor = (viewportW, viewportH, principalPoint) => ({
  fullWidth: viewportW,
  fullHeight: viewportH,
  x: viewportW / 2 - principalPoint.x,
  y: viewportH / 2 - principalPoint.y,
  width: viewportW,
  height: viewportH,
});

/**
 * The retired iframe layout (apply-table-tilt.js:137-157, deleted in G3): the near iframe sat at
 * the viewport's bottom-left (`.self`, index.css:186-193), the pivot is the
 * centre of its playfield's bottom edge (one hand strip above the iframe's
 * bottom), and `tiltTransforms` lifts every plane by the rounded seam shift.
 * The shift is a screen translate after projection, so it moves the
 * principal point, not the eye.
 */
function tiltedPose({ viewportW, viewportH, tiltDeg, perspectivePx, nearHalf }) {
  const depthPx = depthOf(nearHalf);
  const { mat } = tiltTransforms({ tiltDeg, perspectivePx, depthPx, widthPx: nearHalf.w });
  const principalPoint = {
    x: nearHalf.w / 2,
    y: viewportH - nearHalf.h * HAND_CROP_FRAC + mat.shiftPx,
  };
  return {
    tiltDeg,
    distance: perspectivePx,
    up: [0, 1, 0],
    principalPoint,
    shiftPx: mat.shiftPx,
  };
}

/**
 * Spectator broadcast (index.css:6442-6457, apply-table-tilt.js:108-134): the
 * playfields render flat (`UNMEASURED_PLAYFIELD`), `#selfContainer` turns 90°
 * clockwise about its centre and scales by `--bc-scale`, so the near hand is
 * on the screen's LEFT edge and the far half runs to the right; the seam is at
 * x = boardW / 2. Flat +y (up the table) points to screen right, flat +x to
 * screen down, so the camera's up is world -x. The eye backs off to p / scale
 * so the table images at `--bc-scale` with the same fov.
 */
function broadcastPose({ viewportH, perspectivePx, nearHalf }) {
  const boardW = nearHalf.w;
  const boardH = viewportH * 0.5;
  const raw = Math.min(1, viewportH / boardW, boardW / (2 * boardH));
  const scale = Math.round(raw * 1000) / 1000;
  const centreX = -(viewportH / 4) * scale + boardW / 2;
  const pivotBelowCentre = boardH / 2 - boardH * HAND_CROP_FRAC;
  return {
    tiltDeg: 0,
    distance: perspectivePx / scale,
    up: [-1, 0, 0],
    principalPoint: { x: centreX - pivotBelowCentre * scale, y: viewportH / 2 },
    shiftPx: 0,
    scale,
  };
}

/**
 * @param {{ viewportW: number, viewportH: number, tiltDeg?: number,
 *   perspectivePx?: number, nearHalf?: { w: number, h: number }, broadcast?: boolean }} params
 *   `nearHalf` is the near iframe box (default `halfFromViewport`).
 * @returns {{ fov: number, aspect: number, position: number[], target: number[],
 *   up: number[], near: number, far: number, principalPoint: { x: number, y: number },
 *   viewOffset: { fullWidth: number, fullHeight: number, x: number, y: number,
 *     width: number, height: number },
 *   viewport: { w: number, h: number }, tiltDeg: number, shiftPx: number }}
 *   Feed `fov, aspect, near, far` to `PerspectiveCamera`, set `position`,
 *   `up`, `lookAt(target)`, then `setViewOffset(...)` in the listed order.
 *   Place table points with `tableToWorld(point, camera)`.
 */
export function cameraFromCssTilt({
  viewportW,
  viewportH,
  tiltDeg = DEFAULT_TILT_DEG,
  perspectivePx = DEFAULT_PERSPECTIVE_PX,
  nearHalf,
  broadcast = false,
}) {
  const half = nearHalf || halfFromViewport({ w: viewportW, h: viewportH });
  const pose = broadcast
    ? broadcastPose({ viewportH, perspectivePx, nearHalf: half })
    : tiltedPose({ viewportW, viewportH, tiltDeg, perspectivePx, nearHalf: half });
  return {
    fov: fovFor(viewportH, perspectivePx),
    aspect: viewportW / viewportH,
    position: [0, 0, pose.distance],
    target: [0, 0, 0],
    up: pose.up,
    near: NEAR_PX,
    far: pose.distance * FAR_FACTOR,
    principalPoint: pose.principalPoint,
    viewOffset: viewOffsetFor(viewportW, viewportH, pose.principalPoint),
    viewport: { w: viewportW, h: viewportH },
    tiltDeg: pose.tiltDeg,
    shiftPx: pose.shiftPx,
  };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalize = (v) => {
  const length = Math.hypot(v[0], v[1], v[2]);
  return length > 0 ? [v[0] / length, v[1] / length, v[2] / length] : v;
};

/**
 * World point → screen px, with the math three runs: `lookAt` basis
 * (z = eye - target, x = up × z, y = z × x), the frustum of
 * `PerspectiveCamera.updateProjectionMatrix` with the view offset applied,
 * then NDC → window px (y down). Returns null for a point at or behind the eye.
 */
export function projectToScreen(camera, worldPoint) {
  const zAxis = normalize(sub(camera.position, camera.target));
  const xAxis = normalize(cross(camera.up, zAxis));
  const yAxis = cross(zAxis, xAxis);
  const rel = sub(worldPoint, camera.position);
  const cx = dot(rel, xAxis);
  const cy = dot(rel, yAxis);
  const depth = -dot(rel, zAxis);
  if (!(depth > 0)) return null;

  const { near, fov, aspect, viewOffset: view } = camera;
  let top = near * Math.tan((fov * DEG) / 2);
  let height = 2 * top;
  let width = aspect * height;
  let left = -0.5 * width;
  left += (view.x * width) / view.fullWidth;
  top -= (view.y * height) / view.fullHeight;
  width *= view.width / view.fullWidth;
  height *= view.height / view.fullHeight;

  const nearX = (cx * near) / depth;
  const nearY = (cy * near) / depth;
  const u = (nearX - left) / width;
  const v = (top - nearY) / height;
  return { x: u * view.width, y: v * view.height };
}

/** TCG Live's `CameraRig/Main Camera` (design 067:30): vertical fov, height above the board, card height. */
export const TCGL_FOV_DEG = 20;
const TCGL_CAMERA_HEIGHT = 183;
const TCGL_CARD_HEIGHT = 8.9;

/**
 * The TCG Live pose: straight down on the table centre (the seam centre, flat
 * `(0, depth)`), screen up = far edge, vertical fov 20°. The eye height is
 * TCG Live's 183 units scaled by our in-play card height over its 8.9, so cards
 * image at the size they have there; if that cannot show the whole table (both
 * playfields plus the visible hand strips, `2 * (depth + hand strip)` tall,
 * `nearHalf.w` wide) the eye backs off to the smallest distance that does.
 * Tilt is 0 (`tableToWorld` is the identity) and the principal point is the
 * viewport centre. Same description shape as `cameraFromCssTilt`, plus
 * `distanceScale` (1 unless the fit pushed the eye out).
 *
 * @param {{ viewportW: number, viewportH: number, nearHalf?: { w: number, h: number },
 *   cardHeightPx?: number }} params `cardHeightPx` is the in-play card height in table px
 *   (`flatLayout(...).self.cardBox.active.h`; default: the `sim` profile's at this viewport).
 */
export function cameraTcgLive({ viewportW, viewportH, nearHalf, cardHeightPx }) {
  const half = nearHalf || halfFromViewport({ w: viewportW, h: viewportH });
  const depth = depthOf(half);
  const cardH =
    cardHeightPx > 0
      ? cardHeightPx
      : flatLayout(undefined, half, { viewport: { w: viewportW, h: viewportH } }).self.cardBox.active.h;
  const aspect = viewportW / viewportH;
  const tanHalfFov = Math.tan((TCGL_FOV_DEG * DEG) / 2);
  const nominal = TCGL_CAMERA_HEIGHT * (cardH / TCGL_CARD_HEIGHT);
  const fitTall = (depth + half.h * HAND_CROP_FRAC) / tanHalfFov;
  const fitWide = half.w / 2 / (aspect * tanHalfFov);
  const distance = Math.max(nominal, fitTall, fitWide);
  const principalPoint = { x: viewportW / 2, y: viewportH / 2 };
  return {
    fov: TCGL_FOV_DEG,
    aspect,
    position: [0, depth, distance],
    target: [0, depth, 0],
    up: [0, 1, 0],
    near: distance * 0.05,
    far: distance * FAR_FACTOR,
    principalPoint,
    viewOffset: viewOffsetFor(viewportW, viewportH, principalPoint),
    viewport: { w: viewportW, h: viewportH },
    tiltDeg: 0,
    shiftPx: 0,
    distanceScale: distance / nominal,
  };
}

/**
 * Inverse of `projectToScreen` on a plane: the world point where the ray through window px
 * `(x, y)` meets the table plane `planeZ` px above the cloth (the plane `tableToWorld` gives
 * `z = planeZ`, normal (0, sin a, cos a) at the camera's tilt `a`). The frustum maths mirrors
 * `projectToScreen`. Null when the ray runs parallel to the plane or meets it behind the eye.
 * @returns {{ x: number, y: number, z: number } | null}
 */
export function screenToPlane(camera, { x, y }, planeZ = 0) {
  const zAxis = normalize(sub(camera.position, camera.target));
  const xAxis = normalize(cross(camera.up, zAxis));
  const yAxis = cross(zAxis, xAxis);
  const { near, fov, aspect, viewOffset: view } = camera;
  let top = near * Math.tan((fov * DEG) / 2);
  let height = 2 * top;
  let width = aspect * height;
  let left = -0.5 * width;
  left += (view.x * width) / view.fullWidth;
  top -= (view.y * height) / view.fullHeight;
  width *= view.width / view.fullWidth;
  height *= view.height / view.fullHeight;

  const nearX = left + (x / view.width) * width;
  const nearY = top - (y / view.height) * height;
  const direction = [0, 1, 2].map((i) => (nearX * xAxis[i] + nearY * yAxis[i]) / near - zAxis[i]);
  const rad = (camera.tiltDeg ?? DEFAULT_TILT_DEG) * DEG;
  const normal = [0, Math.sin(rad), Math.cos(rad)];
  const slope = dot(normal, direction);
  if (Math.abs(slope) < 1e-9) return null;
  const travel = (planeZ - dot(normal, camera.position)) / slope;
  if (!(travel > 0)) return null;
  return {
    x: camera.position[0] + travel * direction[0],
    y: camera.position[1] + travel * direction[1],
    z: camera.position[2] + travel * direction[2],
  };
}
