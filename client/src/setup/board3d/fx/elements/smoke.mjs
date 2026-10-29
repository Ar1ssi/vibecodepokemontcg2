// Design 077 § Kinds: the smoke element's pure half — a billowing puff (soot, ghost wisps, dark
// ink) lit from above, with an optional glow inside it.
//
// Row (SMOKE_FLOATS), four vec4: x y z radius · tint alpha · light seed · density rise glow dissolve.
import { finite, positive, rgb, stagePoint, unit } from './element-params.mjs';

export const SMOKE_FLOATS = 16;
export const SMOKE_ATTRIBUTES = Object.freeze(['iA', 'iB', 'iC', 'iD']);
const GREY = Object.freeze([0.45, 0.42, 0.4]);
const WHITE = Object.freeze([1, 1, 1]);

/**
 * @param {{ at: object, radius: number, alpha?: number, seed?: number, tint?: number[], light?: number[],
 *   density?: number, rise?: number, glow?: number, dissolve?: number }} params `tint` the smoke's own
 *   colour, `light` its lit edge and inner glow (may exceed 1); `density` 0–1 how solid; `rise`
 *   how fast its billows roll upward; `glow` 0–1 the light inside it (a shadow ball's heart).
 * @returns {object|null}
 */
export function normalizeSmoke(params) {
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
    tint: rgb(params.tint, GREY),
    light: rgb(params.light, WHITE),
    density: unit(params.density, 0.7),
    rise: finite(params.rise) ? params.rise : 0.3,
    glow: unit(params.glow, 0),
    dissolve: unit(params.dissolve, 0),
  };
}

export function packSmoke(row, out, index) {
  const o = index * SMOKE_FLOATS;
  out.set([row.at.x, row.at.y, row.at.z, row.radius, ...row.tint, row.alpha, ...row.light, row.seed, row.density, row.rise, row.glow, row.dissolve], o);
}

/** Emits for scripts/fx/check-element-shaders.mjs: soot, a ghost wisp with a glow, dark ink. */
export const smokeSamples = () => [
  { at: { x: -90, y: 0, z: 40 }, radius: 55, seed: 1 },
  { at: { x: 10, y: -10, z: 40 }, radius: 55, seed: 2, tint: [0.24, 0.16, 0.35], light: [0.8, 0.5, 1.4], glow: 0.7 },
  { at: { x: 100, y: 10, z: 40 }, radius: 45, seed: 3, tint: [0.05, 0.04, 0.07], light: [1.2, 0.2, 0.3], density: 1, dissolve: 0.3 },
];
