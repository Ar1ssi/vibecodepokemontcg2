// Design 077 § Kinds: the bolt element's pure half. A lightning bolt is a polyline (the drawer's
// jagged points, branches included); each segment is one instance, a capsule the shader lights
// with a white core, a hot inner glow and a soft outer glow. `along` (px from the line's start)
// keeps the shader's crackle continuous across segments.
//
// Row (BOLT_FLOATS), four vec4: a x y z width · b x y z alpha · hot rgb seed · glow rgb along.
import { finite, positive, rgb, stagePoint, unit } from './element-params.mjs';

export const BOLT_FLOATS = 16;
export const BOLT_ATTRIBUTES = Object.freeze(['iA', 'iB', 'iC', 'iD']);
/** Scarlet/Violet's thunder: yellow-white with a gold glow (materials/electric.js hot / body). */
export const BOLT_HOT = Object.freeze([1, 242 / 255, 122 / 255]);
export const BOLT_GLOW = Object.freeze([247 / 255, 210 / 255, 30 / 255]);

/**
 * One segment. @param {{ a: object, b: object, width: number, alpha?: number, seed?: number,
 *   along?: number, hot?: number[], glow?: number[] }} params `width` stage px (the core tube;
 *   the glow reaches ~3 widths); `along` px of the line before `a`.
 * @returns {object|null}
 */
export function normalizeBoltSegment(params) {
  if (!params) return null;
  const a = stagePoint(params.a);
  const b = stagePoint(params.b);
  const width = positive(params.width);
  const alpha = unit(params.alpha, 1);
  if (!a || !b || !width || !(alpha > 0)) return null;
  if (a.x === b.x && a.y === b.y && a.z === b.z) return null;
  return {
    a,
    b,
    width,
    alpha,
    seed: finite(params.seed) ? params.seed : 0,
    along: finite(params.along) ? params.along : 0,
    hot: rgb(params.hot, BOLT_HOT),
    glow: rgb(params.glow, BOLT_GLOW),
  };
}

export function packBoltSegment(row, out, index) {
  const o = index * BOLT_FLOATS;
  out.set(
    [row.a.x, row.a.y, row.a.z, row.width, row.b.x, row.b.y, row.b.z, row.alpha, ...row.hot, row.seed, ...row.glow, row.along],
    o
  );
}

/**
 * A polyline (`points` stage points) as segment params, `along` accumulated, alpha ramped from
 * `rootAlpha` at its start to full by `rampPx` (so a fan of bolts does not stack at its hub).
 * Points that are not finite are skipped.
 */
export function boltSegments(points, { width, alpha = 1, seed = 0, hot, glow, rootAlpha = 1, rampPx = 0 }) {
  const clean = (points ?? []).map(stagePoint).filter(Boolean);
  const out = [];
  let along = 0;
  for (let i = 1; i < clean.length; i += 1) {
    const a = clean[i - 1];
    const b = clean[i];
    const length = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (!(length > 0)) continue;
    const ramp = rampPx > 0 ? Math.min(1, along / rampPx) : 1;
    out.push({ a, b, width, alpha: alpha * (rootAlpha + (1 - rootAlpha) * ramp), seed, along, hot, glow });
    along += length;
  }
  return out;
}

/** Emits for scripts/fx/check-element-shaders.mjs: a jagged bolt with a branch. */
export const boltSamples = () => {
  const trunk = [
    { x: -150, y: -60, z: 80 },
    { x: -90, y: -30, z: 70 },
    { x: -60, y: 10, z: 60 },
    { x: 0, y: 0, z: 50 },
    { x: 40, y: 40, z: 40 },
    { x: 110, y: 50, z: 30 },
  ];
  const branch = [{ x: -60, y: 10, z: 60 }, { x: -40, y: 70, z: 40 }, { x: -70, y: 110, z: 30 }];
  return [...boltSegments(trunk, { width: 7, seed: 1 }), ...boltSegments(branch, { width: 4, seed: 2, alpha: 0.8 })];
};
