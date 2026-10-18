// Design 075 § Stage frame: where attack FX live in the three.js board. Stage px are flat table
// px with y flipped, so move-geometry's y-down lane maths runs unchanged on table positions.
// Pure and DOM-free (no `three` import) so it runs under `node --test`.
import { cubicBezierEase } from '../../rules/card-focus-mesh.mjs';

const DEG = Math.PI / 180;

/**
 * Height off the cloth (stage px) each move layer draws at. Back sits under the card faces and is
 * depth-tested against the board; front and top draw over everything.
 */
export const LAYER_Z = Object.freeze({ back: 0.25, front: 3, top: 4 });

/** A card's flat table pose (centre, size) as a stage rect in the y-down frame. */
export function stageRectOf({ x, y, widthPx, heightPx }) {
  return { left: x - widthPx / 2, top: -y - heightPx / 2, width: widthPx, height: heightPx };
}

/**
 * Stage `(sx, sy, z)` → world, column-major: the y flip, then board-camera.mjs `tableToWorld`
 * (rotation about x by the camera's tilt).
 * @returns {Float32Array} 16 floats
 */
export function stageToWorldMatrix(tiltDeg = 0) {
  const rad = (Number(tiltDeg) || 0) * DEG;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // prettier-ignore
  return new Float32Array([
    1, 0, 0, 0,
    0, -cos, sin, 0,
    0, sin, cos, 0,
    0, 0, 0, 1,
  ]);
}

/**
 * A card-motion pose in lane terms (card-motion.mjs, × lane.h) → the offset a drive adds to the
 * card's own pose, in flat TABLE px (y up the table): along/across move the card along the lane
 * and its normal (× lane.h); `lift` raises it off the cloth.
 */
export function driveOffset(lane, pose = {}) {
  const { along = 0, across = 0, lift = 0, scaleAlong = 1, scaleAcross = 1, scale = 1, rotate = 0 } = pose;
  const stageX = (lane.ux * along + lane.nx * across) * lane.h;
  const stageY = (lane.uy * along + lane.ny * across) * lane.h;
  return {
    dx: stageX,
    dy: -stageY,
    dz: lift * lane.h,
    yawDeg: rotate,
    scaleAlong,
    scaleAcross,
    scale,
    laneAngleDeg: lane.angleDeg,
  };
}

/** spawnParticles' timing function (image-logic/mat-fx.mjs). */
const PARTICLE_EASE = cubicBezierEase(0.15, 0.7, 0.3, 1);
const PARTICLE_OFFSETS = [0, 0.08, 0.55, 1];

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * One burst particle (particles.mjs `burstParticles` row) at `elapsedMs` of its burst, sampled
 * from spawnParticles' four keyframes: null before it starts and once it has ended. `x`, `y` are
 * stage px from the burst's anchor.
 * @returns {{ x: number, y: number, rotateDeg: number, scale: number, opacity: number } | null}
 */
export function particleState(row, elapsedMs, { durationMs, delayMs = 0 }) {
  const life = durationMs * (row.life ?? 1);
  if (!(life > 0)) return null;
  const local = (elapsedMs - delayMs - durationMs * (row.delay ?? 0)) / life;
  if (!(local >= 0) || local > 1) return null;
  const p = PARTICLE_EASE(local);
  const gravity = row.gravity ?? 0;
  const start = row.startScale ?? 1;
  const keys = [
    { x: 0, y: 0, opacity: 0, scale: start },
    { x: row.dx * 0.12, y: row.dy * 0.12, opacity: 1, scale: start },
    { x: row.dx * 0.8, y: row.dy * 0.8 + gravity * 0.3, opacity: 1, scale: row.midScale ?? 0.9 },
    { x: row.dx, y: row.dy + gravity, opacity: 0, scale: 0 },
  ];
  let k = 0;
  while (k < PARTICLE_OFFSETS.length - 2 && p > PARTICLE_OFFSETS[k + 1]) k += 1;
  const t = (p - PARTICLE_OFFSETS[k]) / (PARTICLE_OFFSETS[k + 1] - PARTICLE_OFFSETS[k]);
  const a = keys[k];
  const b = keys[k + 1];
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    rotateDeg: row.orient === false ? 0 : row.angle ?? 0,
    scale: lerp(a.scale, b.scale, t),
    opacity: lerp(a.opacity, b.opacity, t),
  };
}
