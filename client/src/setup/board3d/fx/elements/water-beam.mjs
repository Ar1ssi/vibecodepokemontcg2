// Design 077 § Kinds: the water beam's pure half — a column of water from a root point to a head
// point, round at the head, either even (a Hydro Pump beam, taper 0) or a tapering stream (a
// jet or splash tongue, taper 1). The shader refracts the board behind it.
//
// Row (WATER_BEAM_FLOATS), six vec4: from x y z width · to x y z alpha · deep seed ·
// body flow · hot taper · dissolve foam 0 0.
import { finite, positive, stagePoint, unit, waterPalette } from './element-params.mjs';

export const WATER_BEAM_FLOATS = 24;
export const WATER_BEAM_ATTRIBUTES = Object.freeze(['iA', 'iB', 'iC', 'iD', 'iE', 'iF']);
const MIN_LENGTH_PX = 0.5;

/**
 * @param {{ from: object, to: object, width: number, alpha?: number, seed?: number, flow?: number,
 *   taper?: number, foam?: number, dissolve?: number, palette?: object }} params `width` stage px
 *   (full width); `flow` how fast the water runs root → head; `taper` 0 even … 1 a tongue;
 *   `foam` 0–1 the white streaks.
 * @returns {object|null}
 */
export function normalizeWaterBeam(params) {
  if (!params) return null;
  const from = stagePoint(params.from);
  const to = stagePoint(params.to);
  const width = positive(params.width);
  const alpha = unit(params.alpha, 1);
  if (!from || !to || !width || !(alpha > 0)) return null;
  if (Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z) < MIN_LENGTH_PX) return null;
  return {
    from,
    to,
    width,
    alpha,
    seed: finite(params.seed) ? params.seed : 0,
    flow: finite(params.flow) && params.flow >= 0 ? params.flow : 1,
    taper: unit(params.taper, 0),
    foam: unit(params.foam, 0.6),
    dissolve: unit(params.dissolve, 0),
    palette: waterPalette(params.palette),
  };
}

export function packWaterBeam(row, out, index) {
  const o = index * WATER_BEAM_FLOATS;
  const { from, to, palette: p } = row;
  out.set(
    [
      from.x, from.y, from.z, row.width,
      to.x, to.y, to.z, row.alpha,
      ...p.deep, row.seed,
      ...p.body, row.flow,
      ...p.hot, row.taper,
      row.dissolve, row.foam, 0, 0,
    ],
    o
  );
}

/** Emits for scripts/fx/check-element-shaders.mjs: a beam and two tongues. */
export const waterBeamSamples = () => [
  { from: { x: -180, y: 60, z: 30 }, to: { x: 120, y: -40, z: 50 }, width: 46, seed: 1 },
  { from: { x: 0, y: 90, z: 20 }, to: { x: -60, y: 20, z: 60 }, width: 34, taper: 1, seed: 2 },
  { from: { x: 0, y: 90, z: 20 }, to: { x: 70, y: 30, z: 60 }, width: 34, taper: 1, seed: 3, dissolve: 0.4 },
];
