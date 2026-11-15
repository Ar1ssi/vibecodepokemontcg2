// The crystal element's pure half: a cut gem. One instance is a six-sided quartz point — a short
// cone at its root, a prism, a long point — placed by its root, heading and elevation, so a
// cluster can grow out of a card's edge and its shards can tumble free.
//
// Row (CRYSTAL_FLOATS), six vec4: x y z length · body rgb alpha · light rgb seed · width heading
// elevation roll · dissolve gloss fire shoulder · deep rgb bend. Positions and sizes are stage px;
// angles arrive in degrees and are packed in radians.
import { finite, positive, rgb, stagePoint, unit } from './element-params.mjs';

export const CRYSTAL_FLOATS = 24;
export const CRYSTAL_ATTRIBUTES = Object.freeze(['iA', 'iB', 'iC', 'iD', 'iE', 'iF']);
/** Where the root cone ends and the point begins along the gem's axis (0 root … 1 tip), as modelled. */
export const GEM_RINGS = Object.freeze({ base: 0.14, shoulder: 0.68 });
const GEM_SIDES = 6;
const DEG = Math.PI / 180;
const ICE = Object.freeze({ deep: [0.16, 0.34, 0.7], body: [0.42, 0.72, 1], light: [0.86, 0.95, 1] });

/**
 * @param {{ at: object, length: number, width: number, headingDeg?: number, elevationDeg?: number,
 *   rollDeg?: number, colour?: number[], deep?: number[], light?: number[], alpha?: number,
 *   seed?: number, dissolve?: number, gloss?: number, fire?: number, shoulder?: number,
 *   bend?: number }} params `at` is the root (stage px, z up); `length` root to tip and `width`
 *   corner to corner, in px; `headingDeg` the stage direction the tip points (y down the screen)
 *   and `elevationDeg` how far it rises off the cloth; `colour` the gem's body, `deep` its root,
 *   `light` its ridges and rim (rgb 0–1); `gloss` the facet glint, `fire` the spectral rim,
 *   `shoulder` where the point starts (0.4–0.9 of the length), `bend` px the board behind is bent.
 * @returns {object|null} null when it cannot draw
 */
export function normalizeCrystal(params) {
  if (!params) return null;
  const at = stagePoint(params.at);
  const length = positive(params.length);
  const width = positive(params.width);
  const alpha = unit(params.alpha, 1);
  if (!at || !length || !width || !(alpha > 0)) return null;
  const shoulder = finite(params.shoulder) ? Math.min(0.9, Math.max(0.4, params.shoulder)) : GEM_RINGS.shoulder;
  return {
    at,
    length,
    width,
    alpha,
    heading: (finite(params.headingDeg) ? params.headingDeg : 0) * DEG,
    elevation: (finite(params.elevationDeg) ? params.elevationDeg : 0) * DEG,
    roll: (finite(params.rollDeg) ? params.rollDeg : 0) * DEG,
    colour: rgb(params.colour, ICE.body),
    deep: rgb(params.deep, ICE.deep),
    light: rgb(params.light, ICE.light),
    seed: finite(params.seed) ? params.seed : 0,
    dissolve: unit(params.dissolve, 0),
    gloss: unit(params.gloss, 1),
    fire: unit(params.fire, 0.6),
    shoulder,
    bend: finite(params.bend) && params.bend >= 0 ? params.bend : 14,
  };
}

export function packCrystal(row, out, index) {
  out.set(
    [
      row.at.x, row.at.y, row.at.z, row.length,
      ...row.colour, row.alpha,
      ...row.light, row.seed,
      row.width / 2, row.heading, row.elevation, row.roll,
      row.dissolve, row.gloss, row.fire, row.shoulder,
      ...row.deep, row.bend,
    ],
    index * CRYSTAL_FLOATS
  );
}

/**
 * The gem, axis along +x from its root (0) to its tip (1), unit radius in y / z: a cone from the
 * root to the base ring, six walls to the shoulder ring, six faces to the tip. Flat triangles, no
 * index (24 faces), so each face keeps one normal.
 * @returns {{ positions: number[] }}
 */
export function gemMesh() {
  const corner = (x, k) => {
    const angle = (k % GEM_SIDES) * ((2 * Math.PI) / GEM_SIDES);
    return [x, Math.cos(angle), Math.sin(angle)];
  };
  const root = [0, 0, 0];
  const tip = [1, 0, 0];
  const positions = [];
  for (let k = 0; k < GEM_SIDES; k += 1) {
    const a0 = corner(GEM_RINGS.base, k);
    const a1 = corner(GEM_RINGS.base, k + 1);
    const b0 = corner(GEM_RINGS.shoulder, k);
    const b1 = corner(GEM_RINGS.shoulder, k + 1);
    for (const triangle of [[root, a1, a0], [a0, a1, b1], [a0, b1, b0], [b0, b1, tip]]) {
      for (const point of triangle) positions.push(...point);
    }
  }
  return { positions };
}

/** Emits for scripts/fx/check-element-shaders.mjs: a rooted point, a leaning one, a shard, a dissolving one. */
export const crystalSamples = () => [
  { at: { x: -90, y: 20, z: 0 }, length: 150, width: 46, headingDeg: -100, elevationDeg: 40, seed: 1 },
  { at: { x: 0, y: 30, z: 0 }, length: 120, width: 38, headingDeg: -60, elevationDeg: 25, seed: 2, colour: [1, 0.45, 0.25], deep: [0.5, 0.12, 0.08], light: [1, 0.86, 0.7] },
  { at: { x: 80, y: -10, z: 60 }, length: 60, width: 22, headingDeg: 30, elevationDeg: 10, rollDeg: 40, seed: 3, shoulder: 0.5 },
  { at: { x: 40, y: 90, z: 30 }, length: 90, width: 30, headingDeg: 200, elevationDeg: 30, seed: 4, dissolve: 0.45, fire: 1 },
];
