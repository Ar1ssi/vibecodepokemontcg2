// Design 077 § Kinds: the plasma element's pure half — a ball of electricity: a glowing sphere
// with arcs crawling over it, a bright shell at its rim and a white heart.
//
// Row (PLASMA_FLOATS), four vec4: x y z radius · hot rgb alpha · glow rgb seed · heat arcs
// dissolve shell.
import { finite, positive, rgb, stagePoint, unit } from './element-params.mjs';
import { BOLT_GLOW, BOLT_HOT } from './bolt.mjs';

export const PLASMA_FLOATS = 16;
export const PLASMA_ATTRIBUTES = Object.freeze(['iA', 'iB', 'iC', 'iD']);

/**
 * @param {{ at: object, radius: number, alpha?: number, heat?: number, arcs?: number, shell?: number,
 *   seed?: number, dissolve?: number, hot?: number[], glow?: number[] }} params `radius` stage px;
 *   `heat` 0–1 the white heart; `arcs` 0–1 how much lightning crawls over it; `shell` 0–1 the
 *   brightness of the rim (an aura round a struck card is all shell).
 * @returns {object|null}
 */
export function normalizePlasma(params) {
  if (!params) return null;
  const at = stagePoint(params.at);
  const radius = positive(params.radius);
  const alpha = unit(params.alpha, 1);
  if (!at || !radius || !(alpha > 0)) return null;
  return {
    at,
    radius,
    alpha,
    heat: unit(params.heat, 1),
    arcs: unit(params.arcs, 0.8),
    shell: unit(params.shell, 0.5),
    seed: finite(params.seed) ? params.seed : 0,
    dissolve: unit(params.dissolve, 0),
    hot: rgb(params.hot, BOLT_HOT),
    glow: rgb(params.glow, BOLT_GLOW),
  };
}

export function packPlasma(row, out, index) {
  const o = index * PLASMA_FLOATS;
  out.set(
    [row.at.x, row.at.y, row.at.z, row.radius, ...row.hot, row.alpha, ...row.glow, row.seed, row.heat, row.arcs, row.dissolve, row.shell],
    o
  );
}

/** Emits for scripts/fx/check-element-shaders.mjs: a charged ball and an aura shell. */
export const plasmaSamples = () => [
  { at: { x: -70, y: 0, z: 40 }, radius: 40, seed: 1 },
  { at: { x: 80, y: 0, z: 40 }, radius: 60, heat: 0, arcs: 0.5, shell: 1, alpha: 0.8, seed: 2 },
];
