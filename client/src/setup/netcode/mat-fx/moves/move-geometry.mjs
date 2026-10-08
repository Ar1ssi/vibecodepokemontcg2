// Design 063: lane geometry for move scenes. Every size in a scene is a multiple of the
// card height `h`, and every scene is written in lane terms (attacker -> defender), never
// screen up/down, so it plays the same from either seat. DOM-free.

/** Fraction of a card height from the attacker's centre to its leading edge. */
export const LEAD_H = 0.42;

const rectCenter = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

/**
 * The lane between two card rects (parent-viewport px): centres, unit direction `u`,
 * its left normal `n`, the angle (0 = right, 90 = down), the centre distance and the
 * card height `h`. Null when the centres coincide (no direction to play along).
 */
export function laneGeometry(fromRect, toRect) {
  if (!fromRect || !toRect) return null;
  const a = rectCenter(fromRect);
  const b = rectCenter(toRect);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (!(length >= 1)) return null;
  const ux = dx / length;
  const uy = dy / length;
  return {
    ax: a.x,
    ay: a.y,
    bx: b.x,
    by: b.y,
    ux,
    uy,
    nx: -uy,
    ny: ux,
    angleDeg: (Math.atan2(uy, ux) * 180) / Math.PI,
    length,
    h: Math.max(fromRect.height, toRect.height, 1),
  };
}

/** The smallest rect containing both, grown by `pad` px on every side. */
export function unionPadded(a, b, pad) {
  const left = Math.min(a.left, b.left) - pad;
  const top = Math.min(a.top, b.top) - pad;
  const right = Math.max(a.left + a.width, b.left + b.width) + pad;
  const bottom = Math.max(a.top + a.height, b.top + b.height) + pad;
  return { left, top, width: right - left, height: bottom - top };
}

/** `rect` translated into `hostRect`-local px. */
export function toLocal(rect, hostRect) {
  return {
    left: rect.left - hostRect.left,
    top: rect.top - hostRect.top,
    width: rect.width,
    height: rect.height,
  };
}

/** The lane with its centres translated into host-local px. */
export function localLane(lane, hostRect) {
  return {
    ...lane,
    ax: lane.ax - hostRect.left,
    ay: lane.ay - hostRect.top,
    bx: lane.bx - hostRect.left,
    by: lane.by - hostRect.top,
  };
}

/**
 * The point a fraction `f` along the lane from the attacker's leading edge to the
 * defender's centre, offset `side` px along the normal.
 */
export function lanePoint(lane, f, side = 0) {
  const start = lane.h * LEAD_H;
  const d = start + (lane.length - start) * f;
  return {
    x: lane.ax + lane.ux * d + lane.nx * side,
    y: lane.ay + lane.uy * d + lane.ny * side,
  };
}

/** Where a sky drop starts, in card heights: above the defender and to its screen left. */
export const SKY_HEIGHT = 1.7;
export const SKY_LEAN = 0.5;

/**
 * A lane falling from the sky onto the defender (Draco Meteor): it starts `height` h above
 * the defender and `lean` h to its left in *screen* terms, so meteors fall from the top of the
 * screen for both seats. Shaped like a lane, so `lanePoint(sky, 0)` is the sky point and
 * `lanePoint(sky, 1)` the defender centre.
 */
export function skyLane(lane, { height = SKY_HEIGHT, lean = SKY_LEAN } = {}) {
  const sx = lane.bx - lean * lane.h;
  const sy = lane.by - height * lane.h;
  const drop = Math.max(Math.hypot(lane.bx - sx, lane.by - sy), 1);
  const ux = (lane.bx - sx) / drop;
  const uy = (lane.by - sy) / drop;
  const lead = lane.h * LEAD_H;
  return {
    ...lane,
    ax: sx - ux * lead,
    ay: sy - uy * lead,
    ux,
    uy,
    nx: -uy,
    ny: ux,
    angleDeg: (Math.atan2(uy, ux) * 180) / Math.PI,
    length: drop + lead,
  };
}

/** Progress in [0, 1) through `[start, end)` at `ms`, or null outside it. */
export function phaseProgress(ms, [start, end]) {
  return !(ms >= start) || ms >= end ? null : (ms - start) / (end - start);
}
