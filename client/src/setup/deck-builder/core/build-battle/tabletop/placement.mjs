// Where a thing set down by hand comes to rest (design 073 iteration 14). Table space as in
// layout.mjs: millimetres, the table top at y = 0, x right, z toward the viewer. A flat thing is a
// rectangle of half sizes `halfW` (its width, along x before it turns) and `halfD` (its length,
// along z) turned `rotYDeg` about the table normal, as `flatPose` lays it.

const DEG = Math.PI / 180;

// The part of the floor the table camera frames, less a margin, so nothing is set down out of view.
export const TABLE_BOUNDS = Object.freeze({ minX: -320, maxX: 330, minZ: -230, maxZ: 250 });
// Nothing is set down closer than this to the box's walls.
const BOX_GAP_MM = 6;

/** @returns {{minX: number, maxX: number, minZ: number, maxZ: number}} the axis-aligned extent. */
export function footprint({ x, z, rotYDeg = 0 }, halfW, halfD) {
  const angle = rotYDeg * DEG;
  const c = Math.abs(Math.cos(angle));
  const s = Math.abs(Math.sin(angle));
  const ex = halfW * c + halfD * s;
  const ez = halfW * s + halfD * c;
  return { minX: x - ex, maxX: x + ex, minZ: z - ez, maxZ: z + ez };
}

/** Whether two extents overlap by more than `margin` mm (edges that only touch don't). */
export function overlaps(a, b, margin = 1) {
  return a.minX < b.maxX - margin && b.minX < a.maxX - margin && a.minZ < b.maxZ - margin && b.minZ < a.maxZ - margin;
}

/** The spot moved the least way that keeps its whole extent inside `bounds`. */
export function clampToTable(spot, halfW, halfD, bounds = TABLE_BOUNDS) {
  const box = footprint(spot, halfW, halfD);
  const ex = (box.maxX - box.minX) / 2;
  const ez = (box.maxZ - box.minZ) / 2;
  const clamp = (value, min, max) => (min > max ? (min + max) / 2 : Math.min(max, Math.max(min, value)));
  return {
    ...spot,
    x: clamp(spot.x, bounds.minX + ex, bounds.maxX - ex),
    z: clamp(spot.z, bounds.minZ + ez, bounds.maxZ - ez),
  };
}

/**
 * The spot pushed straight out of the standing box (`box`: its centre, turn and outer size) when
 * a thing of `radius` set down there would cut into it; otherwise the spot unchanged.
 */
export function clearOfBox(spot, radius, box) {
  const angle = (box.rotYDeg || 0) * DEG;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dx = spot.x - box.x;
  const dz = spot.z - box.z;
  // Into the box's own frame (three's rotation.y: world x = c·x + s·z, world z = −s·x + c·z).
  let lx = c * dx - s * dz;
  let lz = s * dx + c * dz;
  const reachX = box.width / 2 + radius + BOX_GAP_MM;
  const reachZ = box.depth / 2 + radius + BOX_GAP_MM;
  if (Math.abs(lx) >= reachX || Math.abs(lz) >= reachZ) return spot;
  const pushX = reachX - Math.abs(lx);
  const pushZ = reachZ - Math.abs(lz);
  // Toward the viewer when it sits dead centre: in front of the box is where the room is.
  if (pushZ <= pushX) lz = (lz < 0 ? -1 : 1) * reachZ;
  else lx = (lx < 0 ? -1 : 1) * reachX;
  return { ...spot, x: box.x + c * lx + s * lz, z: box.z - s * lx + c * lz };
}

/**
 * The height a thing comes to rest at: on the floor at `base`, or on the highest of `supports`
 * (each `{extent, top}`) its extent overlaps, `halfThickness` above that top.
 */
export function restHeight(extent, base, halfThickness, supports) {
  let height = base;
  for (const support of supports) {
    if (overlaps(extent, support.extent)) height = Math.max(height, support.top + halfThickness);
  }
  return height;
}

/**
 * The spot nearest `desired` where a thing of half sizes `halfW` × `halfD` lies on bare floor:
 * clear of every extent in `taken`, inside `bounds`, out of the standing `box`. Searched on rings
 * `stepMm` apart; `desired` itself (to be stacked) when none is free within `rings` rings.
 */
export function freeSpotNear(desired, halfW, halfD, options = {}) {
  const { taken = [], box = null, bounds = TABLE_BOUNDS, stepMm = 36, rings = 6 } = options;
  const fits = (spot) => {
    const inView = clampToTable(spot, halfW, halfD, bounds);
    if (inView.x !== spot.x || inView.z !== spot.z) return false;
    if (box && clearOfBox(spot, Math.max(halfW, halfD) * 0.8, box) !== spot) return false;
    const extent = footprint(spot, halfW, halfD);
    return taken.every((other) => !overlaps(extent, other, 0));
  };
  if (fits(desired)) return desired;
  for (let ring = 1; ring <= rings; ring += 1) {
    const count = ring * 8;
    for (let k = 0; k < count; k += 1) {
      const angle = (k / count) * Math.PI * 2;
      const reach = ring * stepMm;
      const spot = { ...desired, x: desired.x + Math.cos(angle) * reach, z: desired.z + Math.sin(angle) * reach };
      if (fits(spot)) return spot;
    }
  }
  return desired;
}
