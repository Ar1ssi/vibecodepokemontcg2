// Design 079 § Kinds: the water drop's pure half — a ball of water that bends the board behind
// it, glossy at its rim with a white glint.
//
// Row (WATER_DROP_FLOATS), four vec4: x y z radius · body alpha · hot seed · deep dissolve.
import { finite, positive, stagePoint, unit, waterPalette } from './element-params.mjs';

export const WATER_DROP_FLOATS = 16;
export const WATER_DROP_ATTRIBUTES = Object.freeze(['iA', 'iB', 'iC', 'iD']);

/**
 * @param {{ at: object, radius: number, alpha?: number, seed?: number, dissolve?: number, palette?: object }} params
 * @returns {object|null}
 */
export function normalizeWaterDrop(params) {
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
    dissolve: unit(params.dissolve, 0),
    palette: waterPalette(params.palette),
  };
}

export function packWaterDrop(row, out, index) {
  const o = index * WATER_DROP_FLOATS;
  const { at, palette: p } = row;
  out.set([at.x, at.y, at.z, row.radius, ...p.body, row.alpha, ...p.hot, row.seed, ...p.deep, row.dissolve], o);
}

/** Emits for scripts/fx/check-element-shaders.mjs. */
export const waterDropSamples = () => [
  { at: { x: -60, y: 0, z: 40 }, radius: 40, seed: 1 },
  { at: { x: 50, y: 10, z: 40 }, radius: 26, seed: 2, alpha: 0.8 },
  { at: { x: 0, y: 80, z: 30 }, radius: 30, seed: 3, dissolve: 0.5 },
];
