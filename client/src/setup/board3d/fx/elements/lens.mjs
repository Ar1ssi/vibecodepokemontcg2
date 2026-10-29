// Design 079 § Kinds: the lens element's pure half — a psychic field: a disc of bent space that
// swirls the board behind it with a chromatic split, ringed by glowing psychic rings.
//
// Row (LENS_FLOATS), four vec4: x y z radius · body alpha · hot seed · spin strength dissolve rings.
import { finite, positive, rgb, stagePoint, unit } from './element-params.mjs';

export const LENS_FLOATS = 16;
export const LENS_ATTRIBUTES = Object.freeze(['iA', 'iB', 'iC', 'iD']);
/** materials/psychic.js PALETTE body / hot, 0–1. */
export const LENS_BODY = Object.freeze([214 / 255, 78 / 255, 206 / 255]);
export const LENS_HOT = Object.freeze([255 / 255, 160 / 255, 240 / 255]);

/**
 * @param {{ at: object, radius: number, alpha?: number, seed?: number, spin?: number, strength?: number,
 *   rings?: number, dissolve?: number, body?: number[], hot?: number[] }} params `spin` radians the
 *   rings have turned; `strength` 0–1 how hard space bends; `rings` 0–1 how bright the rings are.
 * @returns {object|null}
 */
export function normalizeLens(params) {
  if (!params) return null;
  const at = stagePoint(params.at);
  const radius = positive(params.radius);
  const alpha = unit(params.alpha, 1);
  if (!at || !radius || !(alpha > 0)) return null;
  return {
    at,
    radius,
    alpha,
    seed: finite(params.seed) ? params.seed : 0,
    spin: finite(params.spin) ? params.spin : 0,
    strength: unit(params.strength, 0.7),
    rings: unit(params.rings, 1),
    dissolve: unit(params.dissolve, 0),
    body: rgb(params.body, LENS_BODY),
    hot: rgb(params.hot, LENS_HOT),
  };
}

export function packLens(row, out, index) {
  const o = index * LENS_FLOATS;
  out.set(
    [row.at.x, row.at.y, row.at.z, row.radius, ...row.body, row.alpha, ...row.hot, row.seed, row.spin, row.strength, row.dissolve, row.rings],
    o
  );
}

/** Emits for scripts/fx/check-element-shaders.mjs. */
export const lensSamples = () => [
  { at: { x: -70, y: 0, z: 40 }, radius: 60, spin: 0.8, seed: 1 },
  { at: { x: 90, y: 20, z: 40 }, radius: 40, spin: 2, strength: 1, rings: 0.4, seed: 2, dissolve: 0.3 },
];
