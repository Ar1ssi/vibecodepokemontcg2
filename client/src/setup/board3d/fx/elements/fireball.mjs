// Design 077 § Kinds: the fireball element's pure half. A boiling ball of flame on a
// camera-facing quad; moving, it stretches into a comet behind its heading.
//
// Row (FIREBALL_FLOATS), six vec4: x y z radius · deep heat · body seed · hot dissolve ·
// core boil · headingX headingY stretch alpha (heading in stage px, unit length or 0).
import { finite, firePalette, headingOf, positive, stagePoint, unit } from './element-params.mjs';

export const FIREBALL_FLOATS = 24;
export const FIREBALL_ATTRIBUTES = Object.freeze(['iA', 'iB', 'iC', 'iD', 'iE', 'iF']);

/**
 * @param {{ at: {x:number,y:number,z?:number}, radius: number, alpha?: number, heat?: number,
 *   seed?: number, dissolve?: number, boil?: number, headingDeg?: number, stretch?: number,
 *   palette?: { deep?: number[], body?: number[], hot?: number[], core?: number[] } }} params
 *   `radius` stage px; `heat` 0–1 dims the white core; `boil` 0–1 the turbulence; `stretch` 0–1
 *   the comet tail behind `headingDeg` (ignored without a heading); palette rgb 0–1.
 * @returns {object|null} null when it cannot draw
 */
export function normalizeFireball(params) {
  if (!params) return null;
  const at = stagePoint(params.at);
  const radius = positive(params.radius);
  const alpha = unit(params.alpha, 1);
  if (!at || !radius || !(alpha > 0)) return null;
  const heading = finite(params.headingDeg) ? headingOf(params.headingDeg) : { x: 0, y: 0 };
  return {
    at,
    radius,
    alpha,
    heat: unit(params.heat, 1),
    seed: finite(params.seed) ? params.seed : 0,
    dissolve: unit(params.dissolve, 0),
    boil: unit(params.boil, 0.6),
    heading,
    stretch: finite(params.headingDeg) ? unit(params.stretch, 0) : 0,
    palette: firePalette(params.palette),
  };
}

export function packFireball(row, out, index) {
  const o = index * FIREBALL_FLOATS;
  const { at, palette: p } = row;
  out.set(
    [
      at.x, at.y, at.z, row.radius,
      ...p.deep, row.heat,
      ...p.body, row.seed,
      ...p.hot, row.dissolve,
      ...p.core, row.boil,
      row.heading.x, row.heading.y, row.stretch, row.alpha,
    ],
    o
  );
}

/** Emits for scripts/fx/check-element-shaders.mjs: a still ball, a comet, a dissolving one. */
export const fireballSamples = () => [
  { at: { x: -80, y: 0, z: 40 }, radius: 46, seed: 1 },
  { at: { x: 40, y: -10, z: 40 }, radius: 40, headingDeg: 0, stretch: 0.8, seed: 2 },
  { at: { x: 0, y: 90, z: 30 }, radius: 30, dissolve: 0.5, heat: 0.3, seed: 3 },
];
