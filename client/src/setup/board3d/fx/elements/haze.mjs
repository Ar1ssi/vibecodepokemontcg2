// Design 089 § D6: the heat haze element's pure half — the hot air round a fire, which bends what
// is seen through it. It has no colour of its own: it is the board behind, shimmering.
//
// Row (HAZE_FLOATS), two vec4: x y z radius · alpha strength rise seed.
import { finite, positive, stagePoint, unit } from './element-params.mjs';

export const HAZE_FLOATS = 8;
export const HAZE_ATTRIBUTES = Object.freeze(['iA', 'iB']);
/** How far the board is pushed at full strength, as a share of the haze's radius. */
export const HAZE_REACH = 0.06;

/**
 * @param {{ at: object, radius: number, alpha?: number, strength?: number, rise?: number, seed?: number }} params
 *   `radius` stage px (the shimmer fades out toward it); `strength` 0–1 how hard the air bends
 *   the board; `rise` how fast its cells climb (0 holds them still).
 * @returns {object|null}
 */
export function normalizeHaze(params) {
  if (!params) return null;
  const at = stagePoint(params.at);
  const radius = positive(params.radius);
  const alpha = unit(params.alpha, 1);
  const strength = unit(params.strength, 0.7);
  if (!at || !radius || !(alpha > 0) || !(strength > 0)) return null;
  return {
    at,
    radius,
    alpha,
    strength,
    rise: finite(params.rise) ? params.rise : 1,
    seed: finite(params.seed) ? params.seed : 0,
  };
}

export function packHaze(row, out, index) {
  out.set([row.at.x, row.at.y, row.at.z, row.radius, row.alpha, row.strength, row.rise, row.seed], index * HAZE_FLOATS);
}

/** Emits for scripts/fx/check-element-shaders.mjs. */
export const hazeSamples = () => [
  { at: { x: -60, y: 0, z: 40 }, radius: 70, seed: 1 },
  { at: { x: 80, y: 10, z: 40 }, radius: 50, strength: 1, rise: 2, alpha: 0.6, seed: 2 },
];
