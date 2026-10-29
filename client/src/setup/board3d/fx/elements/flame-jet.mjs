// Design 077 § Kinds: the flame-jet element's pure half. A tongue of flame from a base point
// to a tip point (both stage px with height), drawn as a ribbon facing the camera that flows
// from base to tip, widest just past its root and licking out toward its tip.
//
// Row (FLAME_JET_FLOATS), six vec4: base x y z width · tip x y z alpha · deep heat ·
// body seed · hot dissolve · core flow.
import { finite, firePalette, positive, stagePoint, unit } from './element-params.mjs';

export const FLAME_JET_FLOATS = 24;
export const FLAME_JET_ATTRIBUTES = Object.freeze(['iA', 'iB', 'iC', 'iD', 'iE', 'iF']);
const MIN_LENGTH_PX = 0.5;

/**
 * @param {{ from: {x:number,y:number,z?:number}, to: {x:number,y:number,z?:number}, width: number,
 *   alpha?: number, heat?: number, seed?: number, dissolve?: number, flow?: number,
 *   palette?: object }} params `width` stage px at the shoulder; `flow` how fast the flame
 *   streams toward the tip (1 = a flamethrower's lick); `heat` 0–1 dims the white core.
 * @returns {object|null} null when it cannot draw (missing points, zero length or width, alpha 0)
 */
export function normalizeFlameJet(params) {
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
    heat: unit(params.heat, 1),
    seed: finite(params.seed) ? params.seed : 0,
    dissolve: unit(params.dissolve, 0),
    flow: finite(params.flow) && params.flow >= 0 ? params.flow : 1,
    palette: firePalette(params.palette),
  };
}

export function packFlameJet(row, out, index) {
  const o = index * FLAME_JET_FLOATS;
  const { from, to, palette: p } = row;
  out.set(
    [
      from.x, from.y, from.z, row.width,
      to.x, to.y, to.z, row.alpha,
      ...p.deep, row.heat,
      ...p.body, row.seed,
      ...p.hot, row.dissolve,
      ...p.core, row.flow,
    ],
    o
  );
}

/** Emits for scripts/fx/check-element-shaders.mjs: a fan of jets, one rising, one dissolving. */
export const flameJetSamples = () => [
  { from: { x: -40, y: 40, z: 20 }, to: { x: -140, y: -60, z: 60 }, width: 50, seed: 1 },
  { from: { x: 0, y: 40, z: 20 }, to: { x: 0, y: -120, z: 70 }, width: 60, seed: 2 },
  { from: { x: 40, y: 40, z: 20 }, to: { x: 150, y: -50, z: 60 }, width: 50, seed: 3, dissolve: 0.4 },
];
